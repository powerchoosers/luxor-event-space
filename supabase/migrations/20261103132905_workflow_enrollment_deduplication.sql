-- One run per client and immutable workflow version, regardless of enrollment source.
-- Conflicting auto/manual attempts are idempotent; no existing record is changed.
create unique index if not exists luxor_custom_workflow_enrollments_version_client_unique
  on public.luxor_custom_workflow_enrollments(workflow_id,workflow_version_id,inquiry_id);

create or replace function public.luxor_custom_workflow_manual_enroll(
  p_workflow_id uuid, p_inquiry_ids uuid[], p_actor_email text
) returns table(enrolled_count integer, already_enrolled_count integer, skipped_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  definition jsonb;
  first_step jsonb;
  source_id uuid;
  enrollment_id uuid;
  run_id uuid;
  start_at timestamptz;
  v_event_key text;
  inquiry_id uuid;
  v_enrolled integer := 0;
  v_existing integer := 0;
  v_skipped integer := 0;
begin
  if not public.luxor_custom_workflow_runtime_enabled() or not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Workflow execution is disabled. No leads were enrolled.' using errcode='55000';
  end if;
  if coalesce(cardinality(p_inquiry_ids),0) not between 1 and 100 or length(btrim(coalesce(p_actor_email,''))) not between 3 and 254 then
    raise exception 'Select between 1 and 100 leads with an approved operator.' using errcode='22023';
  end if;
  -- Service-role only. The route separately verifies the signed portal session and marketing permission.
  if not exists(select 1 from public.luxor_portal_members m where lower(m.email)=lower(btrim(p_actor_email)) and m.status='active'
    and (m.role='owner' or m.permissions ? 'marketing')) then
    raise exception 'Marketing operator access is required.' using errcode='42501';
  end if;
  select * into workflow from public.luxor_custom_workflows where id=p_workflow_id for update;
  if not found or workflow.status<>'active' or workflow.current_version_id is null then
    raise exception 'Only an active workflow can enroll leads. Review and activate its draft first.' using errcode='55000';
  end if;
  select v.definition into definition from public.luxor_custom_workflow_versions v where v.id=workflow.current_version_id and v.workflow_id=workflow.id;
  if definition is null or not public.luxor_custom_workflow_definition_is_runnable(definition) then
    raise exception 'The active workflow version is incomplete or invalid.' using errcode='55000';
  end if;
  if coalesce(definition->>'trigger','') not in ('contact_form_inquiry_created','manual') then
    raise exception 'Automatic enrollment for this trigger is not connected yet. Use a manual workflow.' using errcode='55000';
  end if;
  first_step := definition->'steps'->0;
  for inquiry_id in select distinct selected.id from unnest(p_inquiry_ids) as selected(id) order by selected.id loop
    select * into inquiry from public.luxor_inquiries i where i.id=inquiry_id;
    if not found or coalesce(inquiry.is_test,false) or lower(coalesce(inquiry.metadata->>'is_test_record','false'))='true'
      or inquiry.archived_at is not null or inquiry.status='closed_lost'
      or coalesce(inquiry.follow_up_disposition,'no_response') <> 'no_response'
      or (definition->>'trigger'='contact_form_inquiry_created'
        and public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'follow_up_eligible') is not true) then
      v_skipped := v_skipped+1; continue;
    end if;
    if exists(select 1 from public.luxor_custom_workflow_enrollments e
      where e.workflow_id=workflow.id and e.workflow_version_id=workflow.current_version_id and e.inquiry_id=inquiry.id) then
      v_existing := v_existing+1; continue;
    end if;
    v_event_key := 'manual:'||workflow.id::text||':'||workflow.current_version_id::text||':'||inquiry.id::text;
    source_id := null;
    insert into public.luxor_custom_workflow_source_events(event_key,trigger_type,inquiry_id,payload,status,processed_at)
    values(v_event_key,'manual',inquiry.id,jsonb_build_object('workflow_id',workflow.id,'version_id',workflow.current_version_id,'actor_email',lower(btrim(p_actor_email))),'consumed',now())
    on conflict(event_key) do nothing returning id into source_id;
    if source_id is null then
      v_existing := v_existing+1; continue;
    end if;
    start_at := now();
    if first_step->>'type'='wait' then
      start_at := now()+case first_step->>'unit'
        when 'minutes' then make_interval(mins=>(first_step->>'amount')::integer)
        when 'hours' then make_interval(hours=>(first_step->>'amount')::integer)
        when 'days' then make_interval(days=>(first_step->>'amount')::integer) end;
    end if;
    enrollment_id := null;
    insert into public.luxor_custom_workflow_enrollments(workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at)
    values(workflow.id,workflow.current_version_id,source_id,inquiry.id,'active',first_step->>'id',start_at)
    on conflict do nothing returning id into enrollment_id;
    if enrollment_id is null then
      update public.luxor_custom_workflow_source_events set last_error='This client is already enrolled in the immutable workflow version.' where id=source_id;
      v_existing := v_existing+1; continue;
    end if;
    insert into public.luxor_custom_workflow_step_runs(enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,snapshot)
    values(enrollment_id,workflow.current_version_id,first_step->>'id',0,first_step->>'type','scheduled',enrollment_id::text||':'||(first_step->>'id'),start_at,first_step)
    returning id into run_id;
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,actor_email,details)
    values(workflow.id,enrollment_id,run_id,'manual_enrollment_created',lower(btrim(p_actor_email)),jsonb_build_object('version_id',workflow.current_version_id,'source_event_id',source_id));
    -- The inquiry receipt remains owned by the original inquiry path. Manual
    -- enrollment skips its read-only marker and never requests another receipt.
    if first_step->>'type'='email' and first_step->>'mode'='existing_inquiry_acknowledgment' then
      update public.luxor_custom_workflow_step_runs set snapshot=snapshot||jsonb_build_object('manual_acknowledgment_marker_skipped',true) where id=run_id;
      perform public.luxor_custom_workflow_schedule_next_step(run_id);
    end if;
    v_enrolled := v_enrolled+1;
  end loop;
  return query select v_enrolled,v_existing,v_skipped;
end;
$$;

create or replace function public.luxor_custom_workflow_consume_pending_events(p_limit integer default 20)
returns table(events_consumed integer, waiting_for_ack integer, ignored_events integer,
  enrollments_created integer, held_enrollments integer)
language plpgsql security definer set search_path = '' as $$
declare
  source_event public.luxor_custom_workflow_source_events%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  ack_job public.luxor_email_jobs%rowtype;
  workflow record;
  enrollment_id uuid;
  ack_run_id uuid;
  active_count integer;
  v_consumed integer := 0;
  v_waiting integer := 0;
  v_ignored integer := 0;
  v_created integer := 0;
  v_held integer := 0;
  ack_run_status text;
  enrollment_status text;
begin
  p_limit := greatest(1, least(coalesce(p_limit,20),100));
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select 0,0,0,0,0;
    return;
  end if;
  for source_event in
    select * from public.luxor_custom_workflow_source_events
    where status='pending' order by received_at,id for update skip locked limit p_limit
  loop
    select * into inquiry from public.luxor_inquiries where id=source_event.inquiry_id;
    if not found or inquiry.flow <> 'contact_form' or coalesce(inquiry.is_test,false)
      or lower(coalesce(inquiry.metadata->>'is_test_record','false'))='true'
      or nullif(btrim(coalesce(inquiry.email,'')),'') is null
      or inquiry.preferred_tour_date is not null
      or inquiry.status in ('tour_requested','tour_confirmed','booked','closed_lost')
      or coalesce(inquiry.metadata->>'autoScheduleTour','false')='true' then
      update public.luxor_custom_workflow_source_events
        set status='ignored',processed_at=now(),last_error='The inquiry is not eligible for custom follow-up.'
        where id=source_event.id;
      v_ignored := v_ignored + 1;
      continue;
    end if;

    select count(*) into active_count from public.luxor_custom_workflows w
    join public.luxor_custom_workflow_versions v on v.id=w.current_version_id and v.workflow_id=w.id
    where w.trigger_type='contact_form_inquiry_created' and w.status='active';
    if active_count = 0 then
      update public.luxor_custom_workflow_source_events
        set status='ignored',processed_at=now(),last_error='No active custom workflow remained when the event was consumed.'
        where id=source_event.id;
      v_ignored := v_ignored + 1;
      continue;
    end if;

    select * into ack_job from public.luxor_email_jobs j
    where j.inquiry_id=inquiry.id and j.job_type='marketing_campaign'
      and j.metadata->>'source'='inquiry_acknowledgment'
    order by j.created_at asc,j.id asc limit 1;
    if not found then
      update public.luxor_custom_workflow_source_events
        set last_error='Waiting for the existing inquiry acknowledgment queue job.'
        where id=source_event.id;
      v_waiting := v_waiting + 1;
      continue;
    end if;

    for workflow in
      select w.id,w.current_version_id,v.definition
      from public.luxor_custom_workflows w
      join public.luxor_custom_workflow_versions v on v.id=w.current_version_id and v.workflow_id=w.id
      where w.trigger_type='contact_form_inquiry_created' and w.status='active'
      order by w.created_at,w.id
    loop
      if not public.luxor_custom_workflow_definition_is_runnable(workflow.definition) then
        insert into public.luxor_custom_workflow_activity(workflow_id,event_type,details)
          values (workflow.id,'workflow_version_held',jsonb_build_object('reason','active version is incomplete or invalid'));
        continue;
      end if;

      enrollment_id := null;
      enrollment_status := case when ack_job.status in ('failed','cancelled') then 'held' else 'active' end;
      insert into public.luxor_custom_workflow_enrollments(
        workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,
        next_run_at,started_at,last_error
      ) values (
        workflow.id,workflow.current_version_id,source_event.id,inquiry.id,enrollment_status,
        'inquiry-acknowledgment',case when enrollment_status='active' then now() else null end,
        now(),case when enrollment_status='held' then 'The existing inquiry acknowledgment failed; review before continuing.' else null end
      ) on conflict do nothing returning id into enrollment_id;
      if enrollment_id is null then continue; end if;

      ack_run_status := case
        when ack_job.status='sent' then 'completed'
        when ack_job.status in ('queued','sending') then 'queued'
        else 'held'
      end;
      insert into public.luxor_custom_workflow_step_runs(
        enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,
        scheduled_for,completed_at,last_error,snapshot
      ) values (
        enrollment_id,workflow.current_version_id,'inquiry-acknowledgment',0,'email',ack_run_status,
        enrollment_id::text || ':inquiry-acknowledgment',now(),
        case when ack_run_status='completed' then now() else null end,
        case when ack_run_status='held' then 'The existing inquiry acknowledgment failed; review before continuing.' else null end,
        jsonb_build_object('existing_acknowledgment',true,'email_job_id',ack_job.id,'email_job_status',ack_job.status)
      ) returning id into ack_run_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (workflow.id,enrollment_id,ack_run_id,'enrollment_created',
          jsonb_build_object('version_id',workflow.current_version_id,'acknowledgment_job_id',ack_job.id));
      if ack_run_status='completed' then
        perform public.luxor_custom_workflow_schedule_next_step(ack_run_id);
      elsif ack_run_status='held' then
        v_held := v_held + 1;
      end if;
      v_created := v_created + 1;
    end loop;

    update public.luxor_custom_workflow_source_events
      set status='consumed',processed_at=now(),last_error=null
      where id=source_event.id;
    v_consumed := v_consumed + 1;
  end loop;
  return query select v_consumed,v_waiting,v_ignored,v_created,v_held;
end;
$$;

revoke all on function public.luxor_custom_workflow_manual_enroll(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_manual_enroll(uuid,uuid[],text) to service_role;
revoke all on function public.luxor_custom_workflow_consume_pending_events(integer) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_consume_pending_events(integer) to service_role;
