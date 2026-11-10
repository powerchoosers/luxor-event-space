-- Align workflow eligibility with the application phone normalizer. Consent remains
-- keyed by canonical E.164 and the existing SMS opt-in and STOP guards remain in force.
create or replace function public.luxor_workflow_normalize_phone(value text)
returns text language sql immutable set search_path = '' as $$
  select case
    when length(digits) = 10 then '+1' || digits
    when length(digits) = 11 and left(digits, 1) = '1' then '+' || digits
    when left(btrim(coalesce(value, '')), 1) = '+' and length(digits) between 8 and 15 then '+' || digits
    else null
  end
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as digits) normalized;
$$;
revoke all on function public.luxor_workflow_normalize_phone(text) from public, anon, authenticated;
grant execute on function public.luxor_workflow_normalize_phone(text) to service_role;

create or replace function public.luxor_custom_workflow_inquiry_is_eligible(p_inquiry_id uuid, p_channel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.luxor_inquiries i
    where i.id = p_inquiry_id
      and i.flow = 'contact_form'
      and coalesce(i.is_test, false) = false
      and lower(coalesce(i.metadata->>'is_test_record', 'false')) <> 'true'
      and i.status not in ('tour_requested', 'tour_confirmed', 'booked', 'closed_lost')
      and i.preferred_tour_date is null
      and (i.follow_up_disposition is null or i.follow_up_disposition = 'no_response')
      and not exists (
        select 1 from public.luxor_bookings b
        where b.inquiry_id = i.id and b.status <> 'cancelled'
      )
      and case p_channel
        when 'follow_up_eligible' then true
        when 'email' then i.email is not null and i.marketing_opt_in = true
          and not exists (
            select 1 from public.luxor_marketing_suppressions s
            where lower(s.email) = lower(i.email)
          )
        when 'text' then i.phone is not null and exists (
          select 1 from public.luxor_sms_consents c
          where c.phone_number = public.luxor_workflow_normalize_phone(i.phone)
            and c.status = 'opted_in' and c.consent_scopes @> array['marketing']::text[]
        )
        when 'marketing_email_consent' then i.email is not null and i.marketing_opt_in = true
          and not exists (
            select 1 from public.luxor_marketing_suppressions s
            where lower(s.email) = lower(i.email)
          )
        when 'marketing_sms_consent' then i.phone is not null and exists (
          select 1 from public.luxor_sms_consents c
          where c.phone_number = public.luxor_workflow_normalize_phone(i.phone)
            and c.status = 'opted_in' and c.consent_scopes @> array['marketing']::text[]
        )
        else false
      end
  );
$$;

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
  -- Unconnected automatic sources cannot accidentally dispatch via manual enrollment.
  if coalesce(trigger_type,'') not in ('contact_form_inquiry_created','manual') then return false; end if;
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

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_enqueue_text_step(p_step_run_id uuid, p_recipient_phone text, p_body text, p_segment_count integer)
 RETURNS TABLE(job_id uuid, disposition text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_text_jobs%rowtype;
  created_job public.luxor_text_jobs%rowtype;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return query select null::uuid,'skipped'::text,'step_not_found'::text; return; end if;
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select null::uuid,'skipped'::text,'custom_workflow_execution_disabled'::text; return;
  end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  select definition into version_definition from public.luxor_custom_workflow_versions
    where id=enrollment.workflow_version_id and workflow_id=enrollment.workflow_id;
  step := version_definition->'steps'->run.step_order;
  select * into inquiry from public.luxor_inquiries where id=enrollment.inquiry_id for update;
  select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
  if found then return query select existing_job.id,'existing'::text,null::text; return; end if;
  if run.channel <> 'text' or run.status <> 'scheduled' or run.scheduled_for > now() or run.step_id is distinct from step->>'id'
    or enrollment.status <> 'active' or enrollment.current_step_id is distinct from run.step_id
    or enrollment.next_run_at > now() or workflow.status <> 'active'
    or step->>'type' <> 'text' or step->>'requiredConsentScope' <> 'marketing'
    or not public.luxor_custom_workflow_definition_is_runnable(version_definition) then
    return query select null::uuid,'skipped'::text,'workflow_or_step_is_not_dispatchable'::text; return;
  end if;
  if not public.luxor_custom_workflow_enrollment_is_eligible(enrollment.id,'text')
    or coalesce(p_recipient_phone,'') !~ '^\+[1-9][0-9]{7,14}$'
    or coalesce(public.luxor_workflow_normalize_phone(inquiry.phone),'') <> coalesce(p_recipient_phone,'') then
    perform public.luxor_custom_workflow_stop_step(run.id,'Marketing SMS consent, eligibility, or recipient changed before queueing.');
    return query select null::uuid,'stopped'::text,'recipient_no_longer_eligible'::text; return;
  end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>480
    or btrim(p_body) !~* '^(Luxor Event Space|Luxor Events|Luxor at Las Palmas Events|Luxor at Las Palmas)\M' or p_body !~* '\mSTOP\M'
    or p_segment_count not between 1 and 10 then
    return query select null::uuid,'held'::text,'rendered_text_invalid'::text; return;
  end if;
  insert into public.luxor_text_jobs(
    inquiry_id,job_type,status,recipient_phone,recipient_name,body,segment_count,scheduled_for,
    automation_key,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',p_recipient_phone,inquiry.full_name,p_body,p_segment_count,run.scheduled_for,
    'custom_workflow:'||run.id::text,jsonb_build_object('automated',true,'custom_workflow',true,
      'compliance_scope','marketing','step_id',run.step_id),run.id
  ) on conflict (custom_workflow_step_run_id) where custom_workflow_step_run_id is not null
    do nothing returning * into created_job;
  if created_job.id is null then
    select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
    return query select existing_job.id,'existing'::text,null::text; return;
  end if;
  update public.luxor_custom_workflow_step_runs
    set status='queued',snapshot=snapshot||jsonb_build_object('text_job_id',created_job.id),updated_at=now()
    where id=run.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow.id,enrollment.id,run.id,'message_queued',jsonb_build_object('channel','text','job_id',created_job.id));
  return query select created_job.id,'queued'::text,null::text;
end;
$function$;
