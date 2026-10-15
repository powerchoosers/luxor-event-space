create or replace function public.luxor_reset_test_run(p_test_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
begin
  -- Use the same settings -> permanent lead -> run lock order as start/prepare.
  select run.* into v_run from public.luxor_test_runs run where run.id = p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode = 'P0002'; end if;
  perform 1 from public.luxor_test_settings where id = 1 for update;
  if not found then raise exception 'Test settings are not provisioned.' using errcode = '55000'; end if;
  select * into v_lead from public.luxor_inquiries where id = v_run.test_lead_id and is_test is true for update;
  if not found then raise exception 'The permanent test lead is not provisioned.' using errcode = '55000'; end if;
  select * into v_run from public.luxor_test_runs where id = p_test_run_id for update;
  if not found or v_run.test_lead_id <> v_lead.id then raise exception 'Test run changed while reset began.' using errcode = '40001'; end if;
  if v_run.status = 'reset' then
    return jsonb_build_object('run', jsonb_build_object('id', v_run.id, 'status', v_run.status), 'replayed', true);
  end if;
  -- Start-run takes this same permanent-lead lock before inserting its run.
  -- Once locked, the newest-run check cannot race a concurrent submission.
  if v_run.status in ('completed', 'failed') and exists (
    select 1 from public.luxor_test_runs newer
    where newer.test_lead_id = v_lead.id
      and (newer.started_at, newer.id) > (v_run.started_at, v_run.id)
  ) then
    raise exception 'A newer test run exists; reset that run before resetting this historical run.' using errcode = '55000';
  end if;
  if v_run.status not in ('in_progress', 'completed', 'failed') then
    raise exception 'Only an active or finished test run can be reset.' using errcode = '55000';
  end if;
  -- A worker that claimed first holds the run row until its atomic claim is
  -- committed; refuse reset while the provider send is in flight.
  if exists (select 1 from public.luxor_email_jobs where test_run_id = v_run.id and status in ('sending', 'claimed')) then
    raise exception 'A test email is in flight. Retry reset after its provider outcome is recorded.' using errcode = '55000';
  end if;
  update public.luxor_email_jobs set status = 'cancelled', last_error = 'Cancelled by test pipeline reset.', updated_at = now()
  where test_run_id = v_run.id and status = 'queued';
  update public.luxor_test_run_artifacts set status = 'reset', updated_at = now()
  where test_run_id = v_run.id and status <> 'reset';
  update public.luxor_test_run_emails set status = 'reset', updated_at = now()
  where test_run_id = v_run.id and status in ('simulated','queued');
  update public.luxor_test_runs set status = 'reset', completed_at = now(), reset_at = now(), updated_at = now()
  where id = v_run.id returning * into v_run;
  update public.luxor_inquiries set status = 'new', pipeline_stage = 'inquiry', preferred_tour_date = null, preferred_tour_time = null, tour_attendance_status = null, tour_confirmed_at = null, updated_at = now()
  where id = v_run.test_lead_id and is_test = true returning * into v_lead;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, details)
  values (v_run.id, 'pipeline_reset', 'reset', jsonb_build_object('lead_stage', 'inquiry', 'tour_fields_cleared', true));
  return jsonb_build_object('run', jsonb_build_object('id', v_run.id, 'status', v_run.status), 'replayed', false);
end;
$$;

create or replace function public.luxor_prepare_test_submission(
  p_test_run_id uuid,
  p_tour_intent boolean,
  p_preferred_tour_date date,
  p_preferred_tour_time text,
  p_confirmed_slot boolean,
  p_email_category text,
  p_email_subject text,
  p_email_body text,
  p_automatic_source text,
  p_scheduled_for timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
  v_email public.luxor_test_run_emails;
  v_job public.luxor_email_jobs;
  v_tour_status text;
  v_lead_status text;
  v_email_created boolean := false;
  v_tour_already_recorded boolean := false;
  v_tour_lifecycle_changed boolean := false;
begin
  -- Match start/reset lock order: settings -> permanent lead -> run.
  select * into v_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled
    or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode='55000';
  end if;
  select * into v_lead from public.luxor_inquiries where id=v_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active permanent test run can receive automated form effects.' using errcode='55000';
  end if;
  if p_email_category is not null and p_email_category not in (
    'tour_confirmation','tour_reminder','tour_cancellation','brochure','form_confirmation','follow_up',
    'proposal','contract','booking_confirmation','payment_reminder','planning','event_notification',
    'post_event','review_request','direct_message','other'
  ) then
    raise exception 'Unsupported automated test email category.' using errcode='22023';
  end if;
  if p_email_category is not null and (
      not (coalesce(p_automatic_source,'') in ('public_tour_submission','public_tour_reminder_24','public_tour_reminder_2','public_brochure_submission','public_inquiry_submission','public_newsletter_submission')
        or coalesce(p_automatic_source,'') like 'portal_test_email:%'
        or coalesce(p_automatic_source,'') like 'test_tour_reschedule:%'
        or coalesce(p_automatic_source,'') like 'test_tour_cancel:%')
    or coalesce(p_email_subject,'') not like '[TEST ONLY] %'
    or coalesce(p_email_body,'') not like '%SIMULATED TEST MESSAGE%'
  ) then
    raise exception 'Automated test email must use an approved source and clearly marked test template.' using errcode='22023';
  end if;
  if p_tour_intent and p_confirmed_slot and (p_preferred_tour_date is null or nullif(trim(coalesce(p_preferred_tour_time,'')),'') is null) then
    raise exception 'A simulated confirmed tour requires a date and time.' using errcode='22023';
  end if;
  if p_tour_intent and length(coalesce(p_preferred_tour_time,'')) > 60 then
    raise exception 'Tour time is too long.' using errcode='22023';
  end if;

  select exists (select 1 from public.luxor_test_run_activity where test_run_id=v_run.id
    and event_type in ('test_tour_rescheduled','test_tour_cancelled')) into v_tour_lifecycle_changed;
  if p_tour_intent then
    select exists (
      select 1 from public.luxor_test_run_activity
      where test_run_id=v_run.id and event_type in ('test_tour_recorded','test_tour_rescheduled','test_tour_cancelled')
    ) into v_tour_already_recorded;
    if v_tour_already_recorded then
      select status into v_tour_status from public.luxor_test_run_artifacts
      where test_run_id=v_run.id and artifact_type='tour';
    end if;
  end if;

  -- The first test_tour_recorded event freezes submission state. Network
  -- retries may re-read/dedupe its email, but only the explicit run-scoped
  -- reschedule/cancel RPC may subsequently alter the tour lifecycle.
  if p_tour_intent and not v_tour_already_recorded then
    v_tour_status := case when p_confirmed_slot then 'scheduled' else 'requested' end;
    v_lead_status := case when p_confirmed_slot then 'tour_confirmed' else 'tour_requested' end;
    insert into public.luxor_test_run_artifacts (test_run_id,artifact_type,status,details,updated_at)
    values (v_run.id,'tour',v_tour_status,jsonb_build_object(
      'simulation_only',true,
      'calendar_event_created',false,
      'inventory_reserved',false,
      'selected_slot_simulated',p_confirmed_slot,
      'preferred_tour_date',p_preferred_tour_date,
      'preferred_tour_time',nullif(trim(coalesce(p_preferred_tour_time,'')),'')
    ),now())
    on conflict (test_run_id,artifact_type) do update set
      status=case when public.luxor_test_run_artifacts.status in ('simulated','requested','scheduled')
        then excluded.status else public.luxor_test_run_artifacts.status end,
      details=case when public.luxor_test_run_artifacts.status in ('simulated','requested','scheduled')
        then public.luxor_test_run_artifacts.details || excluded.details else public.luxor_test_run_artifacts.details end,
      updated_at=now();

    update public.luxor_inquiries set
      status=case when status in ('new','tour_requested','tour_confirmed') then v_lead_status else status end,
      pipeline_stage=case when pipeline_stage in ('inquiry','tour') then 'tour' else pipeline_stage end,
      preferred_tour_date=p_preferred_tour_date,
      preferred_tour_time=nullif(trim(coalesce(p_preferred_tour_time,'')),''),
      tour_attendance_status='pending',
      tour_confirmed_at=case when p_confirmed_slot then now() else null end,
      updated_at=now()
    where id=v_run.test_lead_id and is_test is true;

    insert into public.luxor_test_run_activity (test_run_id,event_type,status,source,details)
    select v_run.id,'test_tour_recorded',v_tour_status,'public_test_submission',jsonb_build_object(
      'simulation_only',true,'calendar_event_created',false,'inventory_reserved',false,
      'preferred_tour_date',p_preferred_tour_date,
      'preferred_tour_time',nullif(trim(coalesce(p_preferred_tour_time,'')),''))
    where not exists (
      select 1 from public.luxor_test_run_activity
      where test_run_id=v_run.id and event_type='test_tour_recorded'
    );
  end if;

  if p_email_category is not null then
    select * into v_email from public.luxor_test_run_emails
    where test_run_id=v_run.id and category=p_email_category
      and details->>'automatic_source'=p_automatic_source
    order by created_at limit 1 for update;
    if not found and not (v_tour_lifecycle_changed and p_automatic_source in ('public_tour_submission','public_tour_reminder_24','public_tour_reminder_2')) then
      insert into public.luxor_email_jobs (
        inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,test_run_id
      ) values (
        v_run.test_lead_id,'test_notification','queued','luxoratlaspalmas@gmail.com',
        trim(p_email_subject),p_email_body,coalesce(p_scheduled_for,now()),
        jsonb_build_object('test_email','true','test_category',p_email_category,'test_source',p_automatic_source,'automatic_source',p_automatic_source,'automatic_test_workflow',true),
        v_run.id
      ) returning * into v_job;
      insert into public.luxor_test_run_emails (
        test_run_id,email_job_id,category,status,actual_recipient,delivery_status,details
      ) values (
        v_run.id,v_job.id,p_email_category,'queued','luxoratlaspalmas@gmail.com','unknown',
        jsonb_build_object('simulation_only',false,'provider_called',false,'delivery_status','unknown','source',p_automatic_source,'automatic_source',p_automatic_source)
      ) returning * into v_email;
      insert into public.luxor_test_run_activity (
        test_run_id,event_type,status,source,recipient_email,details
      ) values (
        v_run.id,'test_email_queued','queued',p_automatic_source,'luxoratlaspalmas@gmail.com',
        jsonb_build_object('email_id',v_email.id,'email_job_id',v_job.id,'category',p_email_category,'automatic',true)
      );
      v_email_created := true;
    end if;
  end if;

  return jsonb_build_object(
    'test_run_id',v_run.id,
    'tour_status',v_tour_status,
    'tour_simulated',coalesce(p_tour_intent,false),
    'calendar_event_created',false,
    'inventory_reserved',false,
    'test_email_queued',v_email.id is not null,
    'email_created',v_email_created,
    'email_id',v_email.id,
    'email_job_id',v_email.email_job_id,
    'email_recipient',case when v_email.id is not null then v_email.actual_recipient else null end
  );
end;
$$;

revoke all on function public.luxor_prepare_test_submission(uuid,boolean,date,text,boolean,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.luxor_prepare_test_submission(uuid,boolean,date,text,boolean,text,text,text,text,timestamptz) to service_role;

create or replace function public.luxor_enqueue_test_email(
  p_test_run_id uuid,
  p_category text,
  p_subject text,
  p_body text,
  p_source text default 'portal_test_lead'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_identity text := 'portal_test_email:' || gen_random_uuid()::text;
begin
  if p_category not in (
    'form_confirmation','brochure','tour_confirmation','tour_reminder','tour_cancellation','follow_up',
    'proposal','contract','booking_confirmation','payment_reminder','planning','event_notification',
    'post_event','review_request','direct_message','other'
  ) then raise exception 'Unsupported test email category.' using errcode='22023'; end if;
  if length(trim(coalesce(p_subject,''))) not between 1 and 200
    or length(trim(coalesce(p_body,''))) not between 1 and 50000 then
    raise exception 'Test email subject or body has an invalid length.' using errcode='22023';
  end if;
  v_result := public.luxor_prepare_test_submission(
    p_test_run_id,false,null,null,false,p_category,trim(p_subject),p_body,v_identity,now()
  );
  return jsonb_build_object('email',v_result,'job_id',v_result->'email_job_id',
    'test_run_id',p_test_run_id,'recipient','luxoratlaspalmas@gmail.com','source',left(coalesce(p_source,''),120));
end;
$$;

revoke all on function public.luxor_enqueue_test_email(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.luxor_enqueue_test_email(uuid,text,text,text,text) to service_role;

alter table public.luxor_test_run_emails drop constraint if exists luxor_test_run_emails_category_check;
alter table public.luxor_test_run_emails add constraint luxor_test_run_emails_category_check check (category in (
  'form_confirmation','brochure','tour_confirmation','tour_reminder','tour_cancellation','follow_up',
  'proposal','contract','booking_confirmation','payment_reminder','planning','event_notification',
  'post_event','review_request','direct_message','other'
));

create or replace function public.luxor_simulate_test_tour_change(
  p_test_run_id uuid,
  p_action text,
  p_action_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
  v_artifact public.luxor_test_run_artifacts;
  v_subject text;
  v_body text;
  v_date date;
  v_time text;
  v_start timestamptz;
  v_action_event text;
  v_existing_event public.luxor_test_run_activity;
  v_email jsonb;
  v_templates jsonb;
  v_cancelled_count integer := 0;
  v_source text;
begin
  if p_action is null or p_action not in ('reschedule','cancel') or length(trim(coalesce(p_action_key,''))) not between 8 and 160 then
    raise exception 'Provide a valid simulated tour action and idempotency key.' using errcode='22023';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  -- Keep all lifecycle writers in the same settings -> lead -> run lock order.
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test tour simulation is disabled or the verified inbox is unavailable.' using errcode='55000';
  end if;
  select * into v_lead from public.luxor_inquiries where id=v_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active permanent test run can change a simulated tour.' using errcode='55000';
  end if;

  v_action_event := case when p_action='reschedule' then 'test_tour_rescheduled' else 'test_tour_cancelled' end;
  select * into v_existing_event from public.luxor_test_run_activity
  where test_run_id=v_run.id and event_type=v_action_event and details->>'action_key'=p_action_key
  order by id desc limit 1;
  if found then
    select * into v_artifact from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='tour';
    return jsonb_build_object('test_run_id',v_run.id,'tour_status',v_artifact.status,'replayed',true,'cancelled_jobs',0);
  end if;

  if exists (select 1 from public.luxor_email_jobs where test_run_id=v_run.id
    and job_type='test_notification' and status in ('sending','claimed')
    and metadata->>'test_category' in ('tour_confirmation','tour_reminder','tour_cancellation')) then
    raise exception 'A test tour email is in flight. Retry the simulated tour change after its provider outcome is recorded.' using errcode='55000';
  end if;

  select count(*) into v_cancelled_count from public.luxor_email_jobs
  where test_run_id=v_run.id and job_type='test_notification' and status='queued'
    and metadata->>'test_category' in ('tour_confirmation','tour_reminder','tour_cancellation');
  update public.luxor_email_jobs set status='cancelled',last_error='Superseded by a simulated tour change.',updated_at=now()
  where test_run_id=v_run.id and job_type='test_notification' and status='queued'
    and metadata->>'test_category' in ('tour_confirmation','tour_reminder','tour_cancellation');
  update public.luxor_test_run_emails set status='blocked',error_message='Superseded by a simulated tour change.',updated_at=now(),
    details=details || jsonb_build_object('queue_cancelled',true,'action_key',p_action_key)
  where email_job_id in (select id from public.luxor_email_jobs where test_run_id=v_run.id
    and last_error='Superseded by a simulated tour change.' and updated_at >= now() - interval '1 minute');

  if p_action='cancel' then
    update public.luxor_test_run_artifacts set status='cancelled',
      details=details || jsonb_build_object('simulation_only',true,'calendar_event_cancelled',false,
        'inventory_released',false,'previous_tour_date',v_lead.preferred_tour_date,
        'previous_tour_time',v_lead.preferred_tour_time,'action_key',p_action_key),updated_at=now()
    where test_run_id=v_run.id and artifact_type='tour' returning * into v_artifact;
    update public.luxor_inquiries set status=case when status in ('tour_requested','tour_confirmed') then 'contacted' else status end,
      pipeline_stage=case when pipeline_stage='tour' then 'inquiry' else pipeline_stage end,
      preferred_tour_date=null,preferred_tour_time=null,tour_attendance_status='cancelled',tour_confirmed_at=null,updated_at=now()
    where id=v_lead.id;
    v_source := 'test_tour_cancel:' || p_action_key;
    v_subject := p_payload #>> '{cancellation,subject}';
    v_body := p_payload #>> '{cancellation,body}';
    v_email := public.luxor_prepare_test_submission(v_run.id,false,null,null,false,'tour_cancellation',v_subject,v_body,v_source,now());
  else
    v_date := nullif(p_payload->>'date','')::date;
    v_time := nullif(trim(coalesce(p_payload->>'time','')),'');
    v_start := nullif(p_payload->>'startUtc','')::timestamptz;
    v_templates := p_payload->'templates';
    if v_date is null or v_time is null or v_start is null or v_start <= now()
      or v_templates is null
      or coalesce(v_templates #>> '{confirmation,subject}','') not like '[TEST ONLY] %'
      or coalesce(v_templates #>> '{confirmation,body}','') not like '%SIMULATED TEST MESSAGE%'
      or coalesce(v_templates #>> '{reminder_24,subject}','') not like '[TEST ONLY] %'
      or coalesce(v_templates #>> '{reminder_24,body}','') not like '%SIMULATED TEST MESSAGE%'
      or coalesce(v_templates #>> '{reminder_2,subject}','') not like '[TEST ONLY] %'
      or coalesce(v_templates #>> '{reminder_2,body}','') not like '%SIMULATED TEST MESSAGE%' then
      raise exception 'Rescheduling requires a future slot and all three marked test templates.' using errcode='22023';
    end if;
    update public.luxor_inquiries set status='tour_confirmed',pipeline_stage='tour',preferred_tour_date=v_date,
      preferred_tour_time=v_time,tour_attendance_status='pending',tour_confirmed_at=now(),updated_at=now()
    where id=v_lead.id;
    insert into public.luxor_test_run_artifacts (test_run_id,artifact_type,status,details,updated_at)
    values (v_run.id,'tour','scheduled',jsonb_build_object('simulation_only',true,'calendar_event_created',false,
      'inventory_reserved',false,'preferred_tour_date',v_date,'preferred_tour_time',v_time,'start_utc',v_start,
      'end_utc',p_payload->>'endUtc','location',p_payload->>'location','action_key',p_action_key),now())
    on conflict (test_run_id,artifact_type) do update set status='scheduled',
      details=public.luxor_test_run_artifacts.details || excluded.details,updated_at=now()
    returning * into v_artifact;
    for v_source in
      select unnest(array[
        'test_tour_reschedule:'||p_action_key||':confirmation',
        'test_tour_reschedule:'||p_action_key||':reminder_24',
        'test_tour_reschedule:'||p_action_key||':reminder_2'
      ])
    loop
      if v_source like '%:confirmation' then
        v_subject:=v_templates #>> '{confirmation,subject}'; v_body:=v_templates #>> '{confirmation,body}';
        v_email:=public.luxor_prepare_test_submission(v_run.id,false,null,null,false,'tour_confirmation',v_subject,v_body,v_source,now());
      elsif v_source like '%:reminder_24' then
        v_subject:=v_templates #>> '{reminder_24,subject}'; v_body:=v_templates #>> '{reminder_24,body}';
        v_email:=public.luxor_prepare_test_submission(v_run.id,false,null,null,false,'tour_reminder',v_subject,v_body,v_source,
          greatest(now(),v_start-interval '24 hours'));
      else
        v_subject:=v_templates #>> '{reminder_2,subject}'; v_body:=v_templates #>> '{reminder_2,body}';
        v_email:=public.luxor_prepare_test_submission(v_run.id,false,null,null,false,'tour_reminder',v_subject,v_body,v_source,
          greatest(now(),v_start-interval '2 hours'));
      end if;
    end loop;
  end if;

  insert into public.luxor_test_run_activity (test_run_id,event_type,status,source,details)
  values (v_run.id,v_action_event,v_artifact.status,'portal_test_lead',jsonb_build_object(
    'simulation_only',true,'calendar_event_created',false,'calendar_event_cancelled',false,
    'inventory_reserved',false,'inventory_released',false,'action_key',p_action_key,
    'date',v_date,'time',v_time,'cancelled_jobs',v_cancelled_count));
  return jsonb_build_object('test_run_id',v_run.id,'tour_status',v_artifact.status,'replayed',false,'cancelled_jobs',v_cancelled_count);
end;
$$;

revoke all on function public.luxor_simulate_test_tour_change(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_simulate_test_tour_change(uuid,text,text,jsonb) to service_role;


create or replace function public.luxor_advance_test_artifact(
  p_test_run_id uuid,
  p_artifact_type text,
  p_status text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_initial_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
  v_artifact public.luxor_test_run_artifacts;
  v_allowed text[];
  v_current_status text;
  v_next_status text;
begin
  select * into v_initial_run from public.luxor_test_runs where id = p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode = 'P0002'; end if;
  perform 1 from public.luxor_test_settings where id=1 for update;
  if not found then raise exception 'Test settings are not provisioned.' using errcode='55000'; end if;
  select * into v_lead from public.luxor_inquiries where id=v_initial_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active test run can advance simulated workflow records.' using errcode = '55000';
  end if;
  if p_artifact_type not in ('tour','proposal','contract','invoice','booking','payment','sms') then
    raise exception 'Unsupported simulated workflow type.' using errcode = '22023';
  end if;
  v_allowed := case p_artifact_type
    when 'tour' then array['simulated','requested','scheduled','confirmed','completed','failed']
    when 'proposal' then array['simulated','drafted','sent','accepted','failed']
    when 'contract' then array['simulated','prepared','sent','signed','failed']
    when 'invoice' then array['simulated','issued','failed']
    when 'booking' then array['simulated','tentative','confirmed','cancelled','failed']
    when 'payment' then array['simulated','pending','paid','failed']
    when 'sms' then array['simulated','queued','sent','delivered','failed']
    else array['simulated']
  end;
  if p_status <> all(v_allowed) then
    raise exception 'Status is not valid for this simulated workflow type.' using errcode = '22023';
  end if;
  select status into v_current_status from public.luxor_test_run_artifacts
  where test_run_id=v_run.id and artifact_type=p_artifact_type for update;
  if not found then v_current_status := 'simulated'; end if;
  v_next_status := case p_artifact_type
    when 'tour' then case v_current_status when 'simulated' then 'requested' when 'requested' then 'scheduled' when 'scheduled' then 'confirmed' when 'confirmed' then 'completed' else null end
    when 'proposal' then case v_current_status when 'simulated' then 'drafted' when 'drafted' then 'sent' when 'sent' then 'accepted' else null end
    when 'contract' then case v_current_status when 'simulated' then 'prepared' when 'prepared' then 'sent' when 'sent' then 'signed' else null end
    when 'invoice' then case v_current_status when 'simulated' then 'issued' else null end
    when 'booking' then case v_current_status when 'simulated' then 'tentative' when 'tentative' then 'confirmed' when 'confirmed' then 'cancelled' else null end
    when 'payment' then case v_current_status when 'simulated' then 'pending' when 'pending' then 'paid' else null end
    when 'sms' then case v_current_status when 'simulated' then 'queued' when 'queued' then 'sent' when 'sent' then 'delivered' else null end
  end;
  if p_status <> 'failed' and p_status is distinct from v_next_status then
    raise exception 'Workflow transition is out of sequence; expected next state: %.', coalesce(v_next_status, 'terminal') using errcode = '22023';
  end if;
  if p_status = 'failed' and v_current_status in ('completed','accepted','signed','paid','cancelled','delivered','failed','reset') then
    raise exception 'A completed simulated workflow cannot be marked failed.' using errcode = '22023';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Simulated workflow details must be a JSON object.' using errcode = '22023';
  end if;
  if p_status = 'failed' or (p_artifact_type = 'payment' and p_status = 'paid') then
    if exists (select 1 from public.luxor_email_jobs where test_run_id=v_run.id and status in ('sending','claimed')) then
      raise exception 'A test email is in flight. Record its provider outcome before failing or completing the run.' using errcode = '55000';
    end if;
  end if;
  if p_status <> 'failed' then
    if p_artifact_type = 'proposal' and not exists (
      select 1 from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='tour' and status='completed'
    ) then raise exception 'Complete the simulated tour before advancing the proposal.' using errcode = '22023'; end if;
    if p_artifact_type = 'contract' and not exists (
      select 1 from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='proposal' and status='accepted'
    ) then raise exception 'Accept the simulated proposal before advancing the contract.' using errcode = '22023'; end if;
    if p_artifact_type in ('invoice','booking') and not exists (
      select 1 from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='contract' and status='signed'
    ) then raise exception 'Sign the simulated contract before advancing billing or booking.' using errcode = '22023'; end if;
    if p_artifact_type = 'payment' and (not exists (
      select 1 from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='invoice' and status='issued'
    ) or not exists (
      select 1 from public.luxor_test_run_artifacts where test_run_id=v_run.id and artifact_type='booking' and status='confirmed'
    )) then raise exception 'Issue the simulated invoice and confirm the booking before advancing payment.' using errcode = '22023'; end if;
  end if;
  insert into public.luxor_test_run_artifacts (test_run_id, artifact_type, status, details, updated_at)
  values (v_run.id, p_artifact_type, p_status, p_details || jsonb_build_object('simulation_only', true), now())
  on conflict (test_run_id, artifact_type) do update set
    status = excluded.status,
    details = public.luxor_test_run_artifacts.details || excluded.details,
    updated_at = now()
  returning * into v_artifact;
  insert into public.luxor_test_run_activity (test_run_id, event_type, status, details)
  values (v_run.id, 'simulated_' || p_artifact_type, p_status,
    jsonb_build_object('artifact_id', v_artifact.id, 'simulation_only', true, 'details', p_details));
  if p_status = 'failed' then
    with cancelled_jobs as (
      update public.luxor_email_jobs set status='cancelled',
        last_error='Cancelled because the simulated test run failed before delivery.', updated_at=now()
      where test_run_id=v_run.id and job_type='test_notification' and status='queued'
      returning id
    ), cancelled_emails as (
      update public.luxor_test_run_emails set status='failed',
        provider_status='cancelled_before_send', delivery_status='unknown',
        error_message='Cancelled because the simulated test run failed before delivery.', updated_at=now()
      where email_job_id in (select id from cancelled_jobs) and status='queued'
      returning id, email_job_id
    )
    insert into public.luxor_test_run_activity (test_run_id,event_type,status,provider_status,delivery_status,error_message,details)
    select v_run.id,'test_email_cancelled','failed','cancelled_before_send','unknown',
      'Cancelled because the simulated test run failed before delivery.',jsonb_build_object('email_id',cancelled_emails.id,'email_job_id',cancelled_emails.email_job_id)
    from cancelled_emails;
    update public.luxor_test_runs set status='failed', completed_at=now(), updated_at=now() where id=v_run.id;
    insert into public.luxor_test_run_activity (test_run_id,event_type,status,details)
    values (v_run.id,'run_failed','failed',jsonb_build_object('artifact_type',p_artifact_type,'simulation_only',true));
  elsif p_artifact_type = 'tour' and p_status = 'requested' then
    update public.luxor_inquiries set status='tour_requested', pipeline_stage='tour', updated_at=now() where id=v_run.test_lead_id and is_test is true;
  elsif p_artifact_type = 'tour' and p_status = 'confirmed' then
    update public.luxor_inquiries set status='tour_confirmed', pipeline_stage='tour', updated_at=now() where id=v_run.test_lead_id and is_test is true;
  elsif p_artifact_type = 'proposal' and p_status = 'sent' then
    update public.luxor_inquiries set status='proposal_sent', pipeline_stage='proposal_sent', updated_at=now() where id=v_run.test_lead_id and is_test is true;
  elsif p_artifact_type = 'contract' and p_status = 'signed' then
    update public.luxor_inquiries set status='booked', pipeline_stage='planning_begins', updated_at=now() where id=v_run.test_lead_id and is_test is true;
  elsif p_artifact_type = 'payment' and p_status = 'paid' then
    with cancelled_jobs as (
      update public.luxor_email_jobs set status='cancelled',
        last_error='Cancelled because the simulated test run completed before delivery.', updated_at=now()
      where test_run_id=v_run.id and job_type='test_notification' and status='queued'
      returning id
    ), cancelled_emails as (
      update public.luxor_test_run_emails set status='failed',
        provider_status='cancelled_before_send', delivery_status='unknown',
        error_message='Cancelled because the simulated test run completed before delivery.', updated_at=now()
      where email_job_id in (select id from cancelled_jobs) and status='queued'
      returning id, email_job_id
    )
    insert into public.luxor_test_run_activity (test_run_id,event_type,status,provider_status,delivery_status,error_message,details)
    select v_run.id,'test_email_cancelled','failed','cancelled_before_send','unknown',
      'Cancelled because the simulated test run completed before delivery.',jsonb_build_object('email_id',cancelled_emails.id,'email_job_id',cancelled_emails.email_job_id)
    from cancelled_emails;
    update public.luxor_test_run_artifacts set status='paid', details=details || jsonb_build_object('simulation_only',true,'completed_by_payment',true), updated_at=now()
    where test_run_id=v_run.id and artifact_type='invoice' and status='issued';
    update public.luxor_test_runs set status='completed', completed_at=now(), updated_at=now() where id=v_run.id;
    update public.luxor_inquiries set status='booked', pipeline_stage='planning_begins', updated_at=now() where id=v_run.test_lead_id and is_test is true;
    insert into public.luxor_test_run_activity (test_run_id,event_type,status,details)
    values (v_run.id,'run_completed','completed',jsonb_build_object('simulation_only',true,'money_moved',false));
  end if;
  return jsonb_build_object('artifact', to_jsonb(v_artifact), 'simulation_only', true);
end;
$$;


revoke all on function public.luxor_advance_test_artifact(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_advance_test_artifact(uuid,text,text,jsonb) to service_role;
