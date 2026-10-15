-- Follow-up consent is immutable per run, and lifecycle stop states fence
-- preparation, queued delivery, and provider authorization.

create or replace function public.luxor_enqueue_test_follow_up_email(
  p_test_run_id uuid,
  p_step_key text,
  p_email_subject text,
  p_email_body text,
  p_source text,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_initial_run public.luxor_test_runs;
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
  v_job public.luxor_email_jobs;
  v_email public.luxor_test_run_emails;
begin
  select * into v_initial_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode='55000';
  end if;
  select * into v_lead from public.luxor_inquiries
  where id=v_initial_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs
  where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status <> 'in_progress' then
    raise exception 'Only the active test run can enqueue a brochure follow-up.' using errcode='55000';
  end if;
  if v_lead.status in ('tour_confirmed','booked','closed_lost') or v_lead.follow_up_disposition is not null then
    raise exception 'Brochure follow-up stopped because the lead lifecycle has advanced.' using errcode='55000';
  end if;
  if v_run.submitted_details #>> '{form,marketingOptIn}' is distinct from 'true'
    or nullif(trim(coalesce(v_run.submitted_email,'')),'') is null then
    raise exception 'This run has no saved marketing consent and email address.' using errcode='55000';
  end if;
  if p_step_key is null or p_step_key !~ '^[a-z0-9_]{1,80}$'
    or p_source is distinct from 'portal_test_email:brochure_follow_up:' || p_step_key
    or length(trim(coalesce(p_email_subject,''))) not between 1 and 200
    or trim(p_email_subject) not like '[TEST ONLY] %'
    or length(trim(coalesce(p_email_body,''))) not between 1 and 50000
    or p_email_body not like '%SIMULATED TEST MESSAGE%'
    or p_scheduled_for is null then
    raise exception 'A valid, clearly marked test follow-up is required.' using errcode='22023';
  end if;

  select * into v_email from public.luxor_test_run_emails
  where test_run_id=v_run.id and category='follow_up' and details->>'automatic_source'=p_source
  order by created_at limit 1 for update;
  if found then
    return jsonb_build_object('test_run_id',v_run.id,'job_id',v_email.email_job_id,
      'email_id',v_email.id,'email_created',false,'recipient',v_email.actual_recipient);
  end if;

  insert into public.luxor_email_jobs (
    inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,test_run_id
  ) values (
    v_run.test_lead_id,'test_notification','queued','luxoratlaspalmas@gmail.com',trim(p_email_subject),p_email_body,p_scheduled_for,
    jsonb_build_object('test_email','true','test_category','follow_up','test_source',p_source,
      'automatic_source',p_source,'automatic_test_workflow',true),v_run.id
  ) returning * into v_job;
  insert into public.luxor_test_run_emails (
    test_run_id,email_job_id,category,status,actual_recipient,delivery_status,details
  ) values (
    v_run.id,v_job.id,'follow_up','queued','luxoratlaspalmas@gmail.com','unknown',
    jsonb_build_object('simulation_only',false,'provider_called',false,'delivery_status','unknown','source',p_source,'automatic_source',p_source)
  ) returning * into v_email;
  insert into public.luxor_test_run_activity(test_run_id,event_type,status,source,recipient_email,details)
  values(v_run.id,'test_email_queued','queued',p_source,'luxoratlaspalmas@gmail.com',
    jsonb_build_object('email_id',v_email.id,'email_job_id',v_job.id,'category','follow_up','automatic',true));
  return jsonb_build_object('test_run_id',v_run.id,'job_id',v_job.id,
    'email_id',v_email.id,'email_created',true,'recipient','luxoratlaspalmas@gmail.com');
end;
$$;

create or replace function public.luxor_stop_test_brochure_followups_on_lead_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_blocked integer := 0;
begin
  if old.is_test is not true or new.is_test is not true
    or not (new.status in ('tour_confirmed','booked','closed_lost') or new.follow_up_disposition is not null)
    or (old.status is not distinct from new.status and old.follow_up_disposition is not distinct from new.follow_up_disposition) then
    return new;
  end if;

  if exists (
    select 1 from public.luxor_email_jobs j
    where j.inquiry_id=old.id and j.job_type='test_notification'
      and j.metadata->>'test_category'='follow_up'
      and j.metadata->>'automatic_source' like 'portal_test_email:brochure_follow_up:%' and j.status='sending'
      and j.test_authorized_at is not null
  ) then
    raise exception 'A test follow-up email is in flight; retry the lead transition after its provider outcome is recorded.' using errcode='55000';
  end if;

  for v_run_id in
    with cancelled as (
      update public.luxor_email_jobs j set status='cancelled',test_claim_token=null,test_authorized_at=null,
        last_error='Cancelled because the test lead advanced to a follow-up stop state.',updated_at=now()
      where j.inquiry_id=old.id and j.job_type='test_notification'
        and j.metadata->>'test_category'='follow_up'
        and j.metadata->>'automatic_source' like 'portal_test_email:brochure_follow_up:%' and j.status in ('queued','sending')
        and j.test_authorized_at is null
      returning j.id,j.test_run_id
    ), email_updates as (
      update public.luxor_test_run_emails e set status='blocked',provider_status='cancelled_before_send',
        delivery_status='unknown',error_message='Cancelled because the test lead advanced to a follow-up stop state.',updated_at=now()
      where e.email_job_id in (select id from cancelled) and e.status='queued'
      returning e.test_run_id,e.email_job_id
    )
    insert into public.luxor_test_run_activity(test_run_id,event_type,status,provider_status,delivery_status,error_message,details)
    select e.test_run_id,'test_brochure_follow_up_cancelled','blocked','cancelled_before_send','unknown',
      'Cancelled because the test lead advanced to a follow-up stop state.',
      jsonb_build_object('email_job_id',e.email_job_id,'lead_status',new.status,'follow_up_disposition',new.follow_up_disposition)
    from email_updates e returning test_run_id
  loop
    v_blocked := v_blocked + 1;
  end loop;
  return new;
end;
$$;

create unique index if not exists luxor_test_brochure_follow_up_source_once
  on public.luxor_email_jobs (test_run_id,(metadata->>'automatic_source'))
  where job_type='test_notification' and metadata->>'test_category'='follow_up'
    and metadata->>'automatic_source' like 'portal_test_email:brochure_follow_up:%';

create or replace function public.luxor_guard_test_brochure_followup_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
begin
  if new.job_type<>'test_notification' or new.metadata->>'test_category'<>'follow_up'
    or coalesce(new.metadata->>'automatic_source','') not like 'portal_test_email:brochure_follow_up:%'
    or (tg_op='UPDATE' and (new.status<>'queued' or old.status='queued')) then
    return new;
  end if;
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test follow-up queue is disabled or the verified inbox is not confirmed.' using errcode='55000';
  end if;
  if new.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
    or new.test_run_id is null or new.recipient_email is distinct from 'luxoratlaspalmas@gmail.com'
    or new.metadata->>'test_email' is distinct from 'true'
    or coalesce(new.metadata->>'automatic_source','') !~ '^portal_test_email:brochure_follow_up:[a-z0-9_]{1,80}$' then
    raise exception 'Test follow-up job is missing its pinned run, recipient, or approved source.' using errcode='22023';
  end if;
  select * into v_lead from public.luxor_inquiries where id=new.inquiry_id and is_test is true for update;
  if not found then raise exception 'The permanent test lead is not provisioned.' using errcode='55000'; end if;
  select * into v_run from public.luxor_test_runs
  where id=new.test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status<>'in_progress' then
    raise exception 'Only the active permanent test run can queue follow-up.' using errcode='55000';
  end if;
  if v_run.submitted_details #>> '{form,marketingOptIn}' is distinct from 'true'
    or nullif(trim(coalesce(v_run.submitted_email,'')),'') is null then
    raise exception 'This run has no saved marketing consent and email address.' using errcode='55000';
  end if;
  if v_lead.status in ('tour_confirmed','booked','closed_lost') or v_lead.follow_up_disposition is not null then
    raise exception 'Brochure follow-up stopped because the lead lifecycle has advanced.' using errcode='55000';
  end if;
  new.recipient_email := 'luxoratlaspalmas@gmail.com';
  return new;
end;
$$;

drop trigger if exists luxor_guard_test_brochure_followup_job on public.luxor_email_jobs;
create trigger luxor_guard_test_brochure_followup_job
before insert or update of status,metadata,recipient_email,test_run_id,inquiry_id
on public.luxor_email_jobs
for each row execute function public.luxor_guard_test_brochure_followup_job();

drop trigger if exists luxor_stop_test_brochure_followups_on_lead_advance on public.luxor_inquiries;
create trigger luxor_stop_test_brochure_followups_on_lead_advance
before update of status,follow_up_disposition on public.luxor_inquiries
for each row execute function public.luxor_stop_test_brochure_followups_on_lead_advance();

create or replace function public.luxor_authorize_test_email_job(p_job_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.luxor_email_jobs;
  v_run public.luxor_test_runs;
  v_lead public.luxor_inquiries;
  v_settings public.luxor_test_settings;
begin
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found then return jsonb_build_object('eligible',false,'reason','test_settings_missing'); end if;
  select * into v_job from public.luxor_email_jobs where id=p_job_id;
  if not found then return jsonb_build_object('eligible',false,'reason','missing_job'); end if;
  if v_job.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
    or v_job.job_type<>'test_notification' or coalesce(v_job.metadata->>'test_email','false')<>'true' then
    return jsonb_build_object('eligible',false,'reason','unsafe_or_already_claimed_test_job');
  end if;

  select * into v_lead from public.luxor_inquiries where id=v_job.inquiry_id and is_test is true for update;
  if not found then return jsonb_build_object('eligible',false,'reason','missing_test_lead'); end if;
  if v_job.test_run_id is null then
    select * into v_run from public.luxor_test_runs
    where test_lead_id=v_job.inquiry_id and status='in_progress'
    order by started_at desc limit 1 for update;
    if not found then return jsonb_build_object('eligible',false,'reason','missing_active_test_run'); end if;
    update public.luxor_email_jobs set test_run_id=v_run.id
    where id=v_job.id and test_run_id is null returning * into v_job;
    if not found then return jsonb_build_object('eligible',false,'reason','job_claim_race'); end if;
  else
    select * into v_run from public.luxor_test_runs where id=v_job.test_run_id for update;
    if not found then return jsonb_build_object('eligible',false,'reason','missing_test_run'); end if;
  end if;
  select * into v_job from public.luxor_email_jobs where id=p_job_id for update;
  if not found or v_job.status<>'sending' or p_claim_token is null
    or v_job.test_claim_token is distinct from p_claim_token or v_job.test_authorized_at is not null then
    return jsonb_build_object('eligible',false,'reason','unsafe_or_already_claimed_test_job');
  end if;
  if v_run.status<>'in_progress' or v_run.test_lead_id<>v_job.inquiry_id then
    return jsonb_build_object('eligible',false,'reason','stale_test_run');
  end if;
  if not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    return jsonb_build_object('eligible',false,'reason','recipient_unconfirmed');
  end if;
  if v_job.metadata->>'test_category'='follow_up'
    and v_job.metadata->>'automatic_source' like 'portal_test_email:brochure_follow_up:%' and (
    v_lead.status in ('tour_confirmed','booked','closed_lost') or v_lead.follow_up_disposition is not null
    or v_run.submitted_details #>> '{form,marketingOptIn}' is distinct from 'true'
    or nullif(trim(coalesce(v_run.submitted_email,'')),'') is null
  ) then
    update public.luxor_email_jobs set status='cancelled',test_claim_token=null,test_authorized_at=null,
      last_error='Blocked because saved consent or lead lifecycle no longer permits test follow-up.',updated_at=now()
    where id=v_job.id and status='sending' and test_claim_token=p_claim_token and test_authorized_at is null;
    update public.luxor_test_run_emails set status='blocked',provider_status='blocked_before_send',
      delivery_status='unknown',error_message='Blocked because saved consent or lead lifecycle no longer permits test follow-up.',updated_at=now()
    where email_job_id=v_job.id and status='queued';
    insert into public.luxor_test_run_activity(test_run_id,event_type,status,provider_status,delivery_status,error_message,details)
    values(v_run.id,'test_brochure_follow_up_blocked','blocked','blocked_before_send','unknown',
      'Blocked because saved consent or lead lifecycle no longer permits test follow-up.',jsonb_build_object('email_job_id',v_job.id));
    return jsonb_build_object('eligible',false,'reason','follow_up_stopped');
  end if;
  update public.luxor_email_jobs set test_authorized_at=now(),updated_at=now()
  where id=v_job.id and status='sending' and test_claim_token=p_claim_token and test_authorized_at is null;
  if not found then return jsonb_build_object('eligible',false,'reason','job_already_authorized'); end if;
  return jsonb_build_object('eligible',true,'recipient','luxoratlaspalmas@gmail.com','test_run_id',v_run.id);
end;
$$;

create or replace function public.luxor_record_test_brochure_follow_up_actions(
  p_test_run_id uuid,
  p_actions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initial_run public.luxor_test_runs;
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
  v_action jsonb;
  v_details jsonb;
  v_step_key text;
  v_channel text;
  v_status text;
  v_scheduled_at timestamptz;
  v_opted_in boolean;
  v_recorded integer := 0;
begin
  if p_test_run_id is null or p_actions is null or jsonb_typeof(p_actions) is distinct from 'array' or jsonb_array_length(p_actions)>9 then
    raise exception 'Provide up to nine run-scoped brochure follow-up actions.' using errcode='22023';
  end if;
  select * into v_initial_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  select * into v_settings from public.luxor_test_settings where id=1 for update;
  if not found or not v_settings.enabled or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
    or v_settings.email_recipient_confirmed_at is null then
    raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode='55000';
  end if;
  select * into v_lead from public.luxor_inquiries
  where id=v_initial_run.test_lead_id and is_test is true for update;
  if not found or v_lead.id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid then
    raise exception 'The permanent test lead is not provisioned.' using errcode='55000';
  end if;
  select * into v_run from public.luxor_test_runs
  where id=p_test_run_id and test_lead_id=v_lead.id for update;
  if not found or v_run.status<>'in_progress' then
    raise exception 'Only the active permanent test run can record follow-up actions.' using errcode='55000';
  end if;
  v_opted_in := v_run.submitted_details #>> '{form,marketingOptIn}'='true';
  if v_opted_in and (v_lead.status in ('tour_confirmed','booked','closed_lost') or v_lead.follow_up_disposition is not null) then
    raise exception 'Brochure follow-up stopped because the lead lifecycle has advanced.' using errcode='55000';
  end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_step_key := nullif(trim(coalesce(v_action->>'step_key','')),'');
    v_channel := v_action->>'channel';
    v_status := v_action->>'status';
    v_details := coalesce(v_action->'details','{}'::jsonb);
    begin v_scheduled_at := nullif(v_action->>'scheduled_at','')::timestamptz;
    exception when others then raise exception 'A follow-up action has an invalid scheduled time.' using errcode='22023'; end;
    if v_step_key is null or length(v_step_key)>80 or v_channel is null or v_channel not in ('email','phone','sms')
      or v_status is null or v_status not in ('queued','existing_delivery','task_simulated','skipped','suppressed')
      or v_scheduled_at is null or jsonb_typeof(v_details)<>'object' then
      raise exception 'A follow-up action has invalid step, channel, status, schedule, or details.' using errcode='22023';
    end if;
    if (not v_opted_in and v_status<>'suppressed') or (v_opted_in and v_status='suppressed') then
      raise exception 'Follow-up history does not match the original run consent.' using errcode='55000';
    end if;
    if not exists (
      select 1 from public.luxor_test_run_activity
      where test_run_id=v_run.id and event_type='test_brochure_follow_up_step' and details->>'step_key'=v_step_key
    ) then
      insert into public.luxor_test_run_activity(test_run_id,event_type,status,source,details)
      values(v_run.id,'test_brochure_follow_up_step',v_status,'test_brochure_follow_up',
        v_details || jsonb_build_object('step_key',v_step_key,'channel',v_channel,'scheduled_at',v_scheduled_at,
          'simulation_only',true,'external_task_created',false));
      v_recorded := v_recorded+1;
    end if;
  end loop;
  return jsonb_build_object('test_run_id',v_run.id,'recorded',v_recorded,'simulation_only',true);
end;
$$;

revoke all on function public.luxor_enqueue_test_follow_up_email(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.luxor_authorize_test_email_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_record_test_brochure_follow_up_actions(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.luxor_guard_test_brochure_followup_job() from public,anon,authenticated,service_role;
revoke all on function public.luxor_stop_test_brochure_followups_on_lead_advance() from public,anon,authenticated,service_role;
grant execute on function public.luxor_enqueue_test_follow_up_email(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.luxor_authorize_test_email_job(uuid,uuid) to service_role;
grant execute on function public.luxor_record_test_brochure_follow_up_actions(uuid,jsonb) to service_role;
