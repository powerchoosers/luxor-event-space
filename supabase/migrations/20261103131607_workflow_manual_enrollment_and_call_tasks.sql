-- Durable manual enrollment and in-order operator call tasks. No delivery is performed by this migration.

-- Keep every eligibility result boolean; NULL must never let a guard pass.
-- Eligibility follows the immutable workflow trigger, not a contact-form-only assumption.
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
        where regexp_replace(c.phone_number,'[^0-9]','','g')=regexp_replace(inquiry.phone,'[^0-9]','','g')
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


create or replace function public.luxor_custom_workflow_advance_control_steps(p_limit integer default 25)
returns table(advanced_count integer, stopped_count integer, completed_count integer, held_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  step_run record;
  inquiry public.luxor_inquiries%rowtype;
  eligible boolean;
  reason text;
  next_id uuid;
  v_advanced integer := 0;
  v_stopped integer := 0;
  v_completed integer := 0;
  v_held integer := 0;
  task_id uuid;
  task_notes text;
  merge_field record;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select 0,0,0,0;
    return;
  end if;
  p_limit := greatest(1,least(coalesce(p_limit,25),100));
  for step_run in
    select sr.id,sr.enrollment_id,sr.step_id,sr.step_order,sr.channel,sr.snapshot,e.workflow_id,e.inquiry_id
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.channel in ('wait','condition','call_task','end') and sr.status='scheduled'
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id
      and e.next_run_at<=now() and w.status='active'
    order by sr.scheduled_for,sr.created_at for update of sr skip locked limit p_limit
  loop
    if step_run.channel='call_task' then
      if public.luxor_custom_workflow_enrollment_is_eligible(step_run.enrollment_id,'follow_up_eligible') is not true then
        perform public.luxor_custom_workflow_stop_step(step_run.id,'This lead is no longer eligible for the workflow call task.');
        v_stopped := v_stopped + 1;
        continue;
      end if;
      select * into inquiry from public.luxor_inquiries where id=step_run.inquiry_id;
      task_notes := regexp_replace(coalesce(step_run.snapshot->>'scriptNotes',''),'\{\{\s*([a-z_]+)\s*\}\}','{{\1}}','g');
      for merge_field in select * from jsonb_each_text(jsonb_build_object(
        'first_name',coalesce(nullif(split_part(btrim(inquiry.full_name),' ',1),''),'there'),
        'full_name',coalesce(nullif(inquiry.full_name,''),'Guest'),
        'event_type',coalesce(inquiry.event_type,'celebration'),
        'guest_count',coalesce(inquiry.guest_count::text,'To be determined'),
        'target_date',coalesce(inquiry.target_date::text,'To be determined'),
        'tour_date',coalesce(inquiry.preferred_tour_date::text,'To be confirmed'),
        'tour_time',coalesce(inquiry.preferred_tour_time::text,'To be confirmed'),
        'venue_email','booking@luxoratlaspalmas.com',
        'venue_address','803 Castroville Rd #402, San Antonio, TX 78237',
        'venue_phone',coalesce((select phone_number from public.luxor_phone_numbers where is_public=true limit 1),'Check venue Settings')
      )) loop
        task_notes := replace(task_notes,'{{'||merge_field.key||'}}',merge_field.value);
      end loop;
      -- The step row is locked and task creation plus advancement are one transaction.
      -- A retry can never create a second task after the first commit.
      if step_run.snapshot->>'task_id' is null then
        insert into public.luxor_tasks(inquiry_id,title,description,priority,assigned_to,due_at,status)
        values(inquiry.id,left(coalesce(step_run.snapshot->>'name','Call lead')||': '||coalesce(inquiry.full_name,'Lead'),200),
          left(task_notes,12000),coalesce(step_run.snapshot->>'priority','medium'),
          nullif(step_run.snapshot->>'assignee',''),now()+interval '1 hour'*greatest(1,least(coalesce((step_run.snapshot->>'dueWithinHours')::numeric,4),168)),'pending')
        returning id into task_id;
        update public.luxor_custom_workflow_step_runs set snapshot=snapshot||jsonb_build_object('task_id',task_id),updated_at=now() where id=step_run.id;
        insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values(step_run.workflow_id,step_run.enrollment_id,step_run.id,'call_task_created',jsonb_build_object('task_id',task_id));
      end if;
    end if;
    if step_run.channel='end' then
      update public.luxor_custom_workflow_step_runs
        set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
        where id=step_run.id;
      update public.luxor_custom_workflow_enrollments
        set status='completed',completed_at=coalesce(completed_at,now()),next_run_at=null,last_error=null,updated_at=now()
        where id=step_run.enrollment_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'enrollment_completed','{}'::jsonb);
      v_completed := v_completed + 1;
      continue;
    end if;

    if step_run.channel='condition' then
      select * into inquiry from public.luxor_inquiries where id=step_run.inquiry_id;
      eligible := false;
      reason := step_run.snapshot->>'condition';
      if not found or public.luxor_custom_workflow_enrollment_is_eligible(step_run.enrollment_id,'follow_up_eligible') is not true then
        eligible := false;
        reason := 'follow_up_eligible';
      elsif reason='follow_up_eligible' then
        eligible := true;
      elsif reason='marketing_email_consent' then
        eligible := public.luxor_custom_workflow_enrollment_is_eligible(step_run.enrollment_id,'email');
      elsif reason='marketing_sms_consent' then
        eligible := public.luxor_custom_workflow_enrollment_is_eligible(step_run.enrollment_id,'text');
      elsif reason in ('tour_scheduled','tour_attended','unresponsive') then
        eligible := public.luxor_custom_workflow_enrollment_is_eligible(step_run.enrollment_id,reason);
      end if;

      if eligible is not true then
        update public.luxor_custom_workflow_step_runs
          set status='skipped',completed_at=now(),last_error='Condition was false; workflow stopped.',updated_at=now()
          where id=step_run.id;
        update public.luxor_custom_workflow_enrollments
          set status='stopped',stopped_at=now(),next_run_at=null,stop_reason='condition_false:'||coalesce(reason,'unknown'),updated_at=now()
          where id=step_run.enrollment_id;
        insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
          values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'enrollment_stopped',
            jsonb_build_object('reason','condition_false','condition',reason));
        v_stopped := v_stopped + 1;
        continue;
      end if;
    end if;

    next_id := public.luxor_custom_workflow_schedule_next_step(step_run.id);
    if next_id is null then
      v_held := v_held + 1;
    else
      v_advanced := v_advanced + 1;
    end if;
  end loop;
  return query select v_advanced,v_stopped,v_completed,v_held;
end;
$$;

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
    insert into public.luxor_custom_workflow_enrollments(workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at)
    values(workflow.id,workflow.current_version_id,source_id,inquiry.id,'active',first_step->>'id',start_at) returning id into enrollment_id;
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

revoke all on function public.luxor_custom_workflow_manual_enroll(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_manual_enroll(uuid,uuid[],text) to service_role;
revoke all on function public.luxor_custom_workflow_advance_control_steps(integer) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_advance_control_steps(integer) to service_role;
