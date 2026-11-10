-- Consume only the dedicated attended-tour outbox, leaving the inquiry receipt
-- consumer unchanged. Runs stay pinned to the workflow and visit revisions.
create function public.luxor_custom_workflow_consume_attended_tours(p_limit integer default 20)
returns table(events_consumed integer, events_ignored integer, enrollments_created integer)
language plpgsql security definer set search_path = '' as $$
declare
  event public.luxor_custom_workflow_tour_events%rowtype;
  definition jsonb;
  first_step jsonb;
  source_id uuid;
  enrollment_id uuid;
  run_id uuid;
  start_at timestamptz;
  consumed integer := 0;
  ignored integer := 0;
  created integer := 0;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return query select 0,0,0; return; end if;
  for event in select * from public.luxor_custom_workflow_tour_events
    where status='pending' order by occurred_at,id for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    definition := null;
    select v.definition into definition from public.luxor_custom_workflows w
      join public.luxor_custom_workflow_versions v on v.id=event.workflow_version_id and v.workflow_id=w.id
      where w.id=event.workflow_id and w.status='active' and w.current_version_id=event.workflow_version_id
        and w.trigger_type='tour_attended' and v.definition->>'trigger'='tour_attended';
    if definition is null or not public.luxor_custom_workflow_definition_is_runnable(definition)
      or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(definition->'steps')='array' then definition->'steps' else '[]'::jsonb end) step
        where step->>'type'='email' and step->>'mode'='existing_inquiry_acknowledgment')
      or not exists (select 1 from public.luxor_inquiries i
        join public.luxor_tour_visits v on v.id=event.visit_id and v.inquiry_id=i.id
        where i.id=event.inquiry_id and i.current_tour_visit_id=event.visit_id
          and i.current_tour_visit_version=event.visit_version and i.tour_attendance_status='attended'
          and v.version=event.visit_version and v.attendance_status='attended'
          and not coalesce(i.is_test,false) and lower(coalesce(i.metadata->>'is_test_record','false')) <> 'true'
          and i.archived_at is null and i.status <> 'closed_lost'
          and coalesce(i.follow_up_disposition,'no_response')='no_response') then
      update public.luxor_custom_workflow_tour_events set status='ignored',processed_at=now(),last_error='Workflow or tour no longer eligible.' where id=event.id;
      ignored := ignored+1; continue;
    end if;
    first_step := definition->'steps'->0;
    start_at := event.occurred_at;
    if first_step->>'type'='wait' then
      start_at := start_at + case first_step->>'unit'
        when 'minutes' then make_interval(mins=>(first_step->>'amount')::integer)
        when 'hours' then make_interval(hours=>(first_step->>'amount')::integer)
        when 'days' then make_interval(days=>(first_step->>'amount')::integer) end;
    end if;
    source_id := null;
    insert into public.luxor_custom_workflow_source_events(event_key,trigger_type,inquiry_id,payload,status,processed_at)
      values('tour-attended:'||event.id::text,'tour_attended',event.inquiry_id,
        jsonb_build_object('tour_event_id',event.id,'visit_id',event.visit_id,'visit_version',event.visit_version),'consumed',now())
      on conflict(event_key) do nothing returning id into source_id;
    if source_id is null then
      update public.luxor_custom_workflow_tour_events set status='ignored',processed_at=now(),last_error='This event was already handled.' where id=event.id;
      ignored := ignored+1; continue;
    end if;
    enrollment_id := null;
    insert into public.luxor_custom_workflow_enrollments(workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at)
      values(event.workflow_id,event.workflow_version_id,source_id,event.inquiry_id,'active',first_step->>'id',start_at)
      on conflict do nothing returning id into enrollment_id;
    if enrollment_id is null then
      update public.luxor_custom_workflow_source_events set last_error='This contact is already enrolled in this workflow version.' where id=source_id;
      update public.luxor_custom_workflow_tour_events set status='ignored',processed_at=now(),last_error='This contact is already enrolled in this workflow version.' where id=event.id;
      ignored := ignored+1; continue;
    end if;
    insert into public.luxor_custom_workflow_step_runs(enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,snapshot)
      values(enrollment_id,event.workflow_version_id,first_step->>'id',0,first_step->>'type','scheduled',enrollment_id::text||':'||(first_step->>'id'),start_at,first_step)
      returning id into run_id;
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(event.workflow_id,enrollment_id,run_id,'enrollment_created',jsonb_build_object('tour_event_id',event.id,'visit_id',event.visit_id,'visit_version',event.visit_version));
    update public.luxor_custom_workflow_tour_events set status='consumed',processed_at=now(),last_error=null where id=event.id;
    consumed := consumed+1; created := created+1;
  end loop;
  return query select consumed,ignored,created;
end;
$$;
revoke all on function public.luxor_custom_workflow_consume_attended_tours(integer) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_consume_attended_tours(integer) to service_role;

create or replace function public.luxor_custom_workflow_enrollment_is_eligible(p_enrollment_id uuid, p_channel text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  trigger_type text;
  inquiry_id uuid;
begin
  select i.id, v.definition->>'trigger' into inquiry_id, trigger_type
    from public.luxor_custom_workflow_enrollments e
    join public.luxor_custom_workflow_versions v on v.id=e.workflow_version_id and v.workflow_id=e.workflow_id
    join public.luxor_inquiries i on i.id=e.inquiry_id
    where e.id=p_enrollment_id;
  if not found then return false; end if;
  select * into inquiry from public.luxor_inquiries where id=inquiry_id;
  if not found or coalesce(inquiry.is_test,false)
    or lower(coalesce(inquiry.metadata->>'is_test_record','false'))='true'
    or inquiry.archived_at is not null or inquiry.status='closed_lost'
    or coalesce(inquiry.follow_up_disposition,'no_response') <> 'no_response' then return false; end if;
  -- Keep the original speed-to-lead sequence cutoff when a tour or booking exists.
  if trigger_type='contact_form_inquiry_created' and p_channel in
    ('follow_up_eligible','email','text','marketing_email_consent','marketing_sms_consent') then
    return coalesce(public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,p_channel),false);
  end if;
  -- Tour enrollment is valid only for the exact attended visit revision that
  -- produced its consumed event. Corrections and new visits stop later steps.
  if trigger_type='tour_attended' and not exists (
    select 1 from public.luxor_custom_workflow_enrollments e
    join public.luxor_custom_workflow_source_events s on s.id=e.source_event_id and s.trigger_type='tour_attended' and s.status='consumed'
    join public.luxor_custom_workflow_tour_events te on s.payload->>'tour_event_id'=te.id::text
      and te.status='consumed' and te.workflow_id=e.workflow_id and te.workflow_version_id=e.workflow_version_id and te.inquiry_id=e.inquiry_id
    join public.luxor_tour_visits visit on visit.id=te.visit_id and visit.inquiry_id=e.inquiry_id
    where e.id=p_enrollment_id and inquiry.current_tour_visit_id=te.visit_id
      and inquiry.current_tour_visit_version=te.visit_version and inquiry.tour_attendance_status='attended'
      and visit.version=te.visit_version and visit.attendance_status='attended'
  ) then return false; end if;
  -- Unconnected automatic sources cannot accidentally dispatch via manual enrollment.
  if coalesce(trigger_type,'') not in ('contact_form_inquiry_created','manual','tour_attended') then return false; end if;
  case p_channel
    when 'follow_up_eligible' then return true;
    when 'email','marketing_email_consent' then
      return inquiry.email is not null and coalesce(inquiry.marketing_opt_in,false)=true and not exists (
        select 1 from public.luxor_marketing_suppressions s where lower(s.email)=lower(inquiry.email));
    when 'text','marketing_sms_consent' then
      return inquiry.phone is not null and exists (
        select 1 from public.luxor_sms_consents c
        where c.phone_number = public.luxor_workflow_normalize_phone(inquiry.phone)
          and c.status='opted_in' and c.consent_scopes @> array['marketing']::text[]);
    when 'tour_scheduled' then
      return inquiry.preferred_tour_date is not null and coalesce(inquiry.tour_attendance_status,'pending')='pending';
    when 'tour_attended' then return coalesce(inquiry.tour_attendance_status='attended',false);
    when 'unresponsive' then return coalesce(inquiry.follow_up_disposition,'no_response')='no_response';
    else return false;
  end case;
end;
$$;

revoke all on function public.luxor_custom_workflow_enrollment_is_eligible(uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_enrollment_is_eligible(uuid,text) to service_role;

