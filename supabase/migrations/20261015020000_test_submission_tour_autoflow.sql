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
  -- Lock the permanent lead before the run, matching start-run lock order.
  -- This avoids a reset/start deadlock under concurrent submissions.
  select run.* into v_run from public.luxor_test_runs run where run.id = p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode = 'P0002'; end if;
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
  p_automatic_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_run public.luxor_test_runs;
  v_email public.luxor_test_run_emails;
  v_job public.luxor_email_jobs;
  v_tour_status text;
  v_lead_status text;
  v_email_created boolean := false;
begin
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled
    or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id for update;
  if not found or v_run.test_lead_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
    or v_run.status <> 'in_progress' then
    raise exception 'Only the active permanent test run can receive automated form effects.' using errcode='55000';
  end if;
  if p_email_category is not null and p_email_category not in ('tour_confirmation','brochure','form_confirmation') then
    raise exception 'Unsupported automated test email category.' using errcode='22023';
  end if;
  if p_email_category is not null and (
    coalesce(p_automatic_source,'') not in ('public_tour_submission','public_brochure_submission','public_inquiry_submission','public_newsletter_submission')
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

  if p_tour_intent then
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
    if not found then
      insert into public.luxor_email_jobs (
        inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,test_run_id
      ) values (
        v_run.test_lead_id,'test_notification','queued','luxoratlaspalmas@gmail.com',
        trim(p_email_subject),p_email_body,now(),
        jsonb_build_object('test_email','true','test_category',p_email_category,'test_source',p_automatic_source,'automatic_test_workflow',true),
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

revoke all on function public.luxor_prepare_test_submission(uuid,boolean,date,text,boolean,text,text,text,text) from public,anon,authenticated;
grant execute on function public.luxor_prepare_test_submission(uuid,boolean,date,text,boolean,text,text,text,text) to service_role;
