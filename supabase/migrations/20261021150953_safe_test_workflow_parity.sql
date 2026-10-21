-- Keep portal test-tour changes atomic without granting direct artifact writes.
-- The run lock serializes every test-tour action; the unique activity index is
-- a second guard against duplicate idempotency keys within one run.
create unique index if not exists luxor_test_tour_action_idempotency_idx
  on public.luxor_test_run_activity (test_run_id, (details ->> 'atomic_test_action_key'))
  where event_type in ('test_tour_scheduled', 'test_tour_outcome', 'test_tour_cancelled')
    and details ? 'atomic_test_action_key';

create or replace function public.luxor_apply_test_tour_action(
  p_test_run_id uuid,
  p_action text,
  p_action_key text,
  p_expected_tour_status text,
  p_expected_revision integer,
  p_expected_inquiry_updated_at timestamptz,
  p_request_fingerprint text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
  v_artifact public.luxor_test_run_artifacts;
  v_prior_action public.luxor_test_run_activity;
  v_current_status text := 'simulated';
  v_current_revision integer := 0;
  v_next_revision integer;
  v_next_status text;
  v_event_type text;
  v_target_attendance text;
  v_details jsonb;
  v_action_at timestamptz := pg_catalog.now();
begin
  if p_test_run_id is null
     or p_action is null
     or p_action not in ('schedule', 'outcome_attended', 'outcome_no_show', 'cancel')
     or coalesce(p_action_key, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null or p_expected_revision < 0
     or p_expected_inquiry_updated_at is null
     or p_expected_tour_status is null
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A valid test-tour action, idempotency key, expected state, and object payload are required.' using errcode = '22023';
  end if;

  -- Use the same lock order as start/reset and test-email queueing.
  select * into v_settings
  from public.luxor_test_settings
  where id = 1
  for update;
  if not found or not v_settings.enabled
     or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
     or v_settings.email_recipient_confirmed_at is null then
    raise exception 'The isolated test workflow is disabled or its verified test inbox is not confirmed.' using errcode = '55000';
  end if;

  select * into v_lead
  from public.luxor_inquiries
  where id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
    and is_test is true
  for update;
  if not found then
    raise exception 'The permanent isolated Test Lead is unavailable.' using errcode = '55000';
  end if;

  select * into v_run
  from public.luxor_test_runs
  where id = p_test_run_id
    and test_lead_id = v_lead.id
    and status = 'in_progress'
  for update;
  if not found then
    raise exception 'Only the active permanent Test Lead run can receive tour changes.' using errcode = '55000';
  end if;

  select * into v_artifact
  from public.luxor_test_run_artifacts
  where test_run_id = v_run.id and artifact_type = 'tour'
  for update;
  if found then
    v_current_status := v_artifact.status;
    if v_artifact.details ? 'tour_revision' then
      if coalesce(v_artifact.details ->> 'tour_revision', '') !~ '^[0-9]{1,10}$' then
        return pg_catalog.jsonb_build_object('conflict', true, 'error', 'The saved simulated tour revision is invalid.');
      end if;
      if (v_artifact.details ->> 'tour_revision')::numeric > 2147483646 then
        return pg_catalog.jsonb_build_object('conflict', true, 'error', 'The saved simulated tour revision is invalid.');
      end if;
      v_current_revision := (v_artifact.details ->> 'tour_revision')::integer;
    end if;
  else
    v_artifact.details := '{}'::jsonb;
  end if;

  select * into v_prior_action
  from public.luxor_test_run_activity
  where test_run_id = v_run.id
    and event_type in ('test_tour_scheduled', 'test_tour_outcome', 'test_tour_cancelled')
    and details ->> 'atomic_test_action_key' = p_action_key
  limit 1
  for update;
  if found then
    if v_prior_action.details ->> 'request_fingerprint' is distinct from p_request_fingerprint then
      return pg_catalog.jsonb_build_object(
        'conflict', true,
        'error', 'This tour action key was already used with different content.'
      );
    end if;
    select * into v_artifact from public.luxor_test_run_artifacts
    where test_run_id = v_run.id and artifact_type = 'tour';
    select * into v_lead from public.luxor_inquiries where id = v_run.test_lead_id;
    return pg_catalog.jsonb_build_object(
      'replayed', true,
      'simulated', true,
      'calendar_event_created', false,
      'inventory_reserved', false,
      'artifact', pg_catalog.to_jsonb(v_artifact),
      'inquiry', pg_catalog.to_jsonb(v_lead)
    );
  end if;

  -- If a request was retried after its response was lost and the caller read
  -- the new revision, recognize the already completed equivalent action.
  if p_action = 'schedule' and v_current_status = 'confirmed'
     and v_artifact.details ->> 'preferred_tour_date' = p_payload ->> 'preferred_tour_date'
     and v_artifact.details ->> 'preferred_tour_time' = p_payload ->> 'preferred_tour_time'
     and v_artifact.details ->> 'start_utc' = p_payload ->> 'start_utc'
     and v_artifact.details ->> 'end_utc' = p_payload ->> 'end_utc'
     and v_artifact.details ->> 'location' = p_payload ->> 'location'
     and v_artifact.details ->> 'meeting_type' = p_payload ->> 'meeting_type'
     and v_artifact.details ->> 'duration_minutes' = p_payload ->> 'duration_minutes'
     and v_artifact.details ->> 'client_facing_notes' = p_payload ->> 'client_facing_notes'
     and v_artifact.details -> 'assignees' = p_payload -> 'assignees' then
    return pg_catalog.jsonb_build_object(
      'replayed', true, 'simulated', true, 'calendar_event_created', false,
      'inventory_reserved', false, 'artifact', pg_catalog.to_jsonb(v_artifact),
      'inquiry', pg_catalog.to_jsonb(v_lead)
    );
  end if;
  if p_action in ('outcome_attended', 'outcome_no_show')
     and v_current_status = 'completed'
     and ((p_action = 'outcome_attended' and v_artifact.details ->> 'tour_attendance_status' = 'attended')
       or (p_action = 'outcome_no_show' and v_artifact.details ->> 'tour_attendance_status' = 'no_show')) then
    return pg_catalog.jsonb_build_object(
      'replayed', true, 'simulated', true, 'calendar_event_created', false,
      'inventory_reserved', false, 'artifact', pg_catalog.to_jsonb(v_artifact),
      'inquiry', pg_catalog.to_jsonb(v_lead)
    );
  end if;
  if p_action = 'cancel' and v_current_status = 'cancelled'
     and v_artifact.details ->> 'cancellation_reason' = coalesce(nullif(pg_catalog.btrim(p_payload ->> 'reason'), ''), null) then
    return pg_catalog.jsonb_build_object(
      'replayed', true, 'simulated', true, 'calendar_event_created', false,
      'inventory_reserved', false, 'artifact', pg_catalog.to_jsonb(v_artifact),
      'inquiry', pg_catalog.to_jsonb(v_lead)
    );
  end if;

  if p_expected_tour_status is distinct from v_current_status
     or p_expected_revision <> v_current_revision then
    return pg_catalog.jsonb_build_object(
      'conflict', true,
      'error', 'The simulated tour changed in another request. Refresh and review its current state.',
      'current_status', v_current_status,
      'current_revision', v_current_revision
    );
  end if;
  if p_expected_inquiry_updated_at is distinct from v_lead.updated_at then
    return pg_catalog.jsonb_build_object(
      'conflict', true,
      'error', 'The Test Lead changed in another request. Refresh and review its current state.'
    );
  end if;
  if v_current_revision >= 2147483646 then
    return pg_catalog.jsonb_build_object('conflict', true, 'error', 'The simulated tour revision is exhausted.');
  end if;

  if p_action = 'schedule' then
    if v_current_status not in ('simulated', 'requested', 'scheduled') then
      return pg_catalog.jsonb_build_object('conflict', true, 'error', 'This simulated tour cannot be scheduled from its current state.');
    end if;
    if coalesce(p_payload ->> 'preferred_tour_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(pg_catalog.btrim(p_payload ->> 'preferred_tour_time'), '') = ''
       or pg_catalog.length(p_payload ->> 'preferred_tour_time') > 60
       or (p_payload ->> 'preferred_tour_date')::date < current_date
       or coalesce(pg_catalog.btrim(p_payload ->> 'meeting_type'), '') = ''
       or pg_catalog.length(p_payload ->> 'meeting_type') > 120
       or pg_catalog.length(coalesce(p_payload ->> 'client_facing_notes', '')) > 2000
       or coalesce(p_payload ->> 'duration_minutes', '') !~ '^\d+$'
       or (p_payload ->> 'duration_minutes')::integer not between 30 and 180
       or pg_catalog.jsonb_typeof(p_payload -> 'assignees') is distinct from 'array'
       or pg_catalog.jsonb_array_length(p_payload -> 'assignees') > 12 then
      raise exception 'The simulated tour details are invalid.' using errcode = '22023';
    end if;
    v_next_status := 'confirmed';
    v_event_type := 'test_tour_scheduled';
  elsif p_action = 'outcome_attended' or p_action = 'outcome_no_show' then
    if v_current_status not in ('scheduled', 'confirmed') or v_lead.preferred_tour_date is null
       or v_lead.tour_attendance_status = 'cancelled' then
      return pg_catalog.jsonb_build_object('conflict', true, 'error', 'Schedule an upcoming simulated tour before recording its outcome.');
    end if;
    v_target_attendance := case when p_action = 'outcome_attended' then 'attended' else 'no_show' end;
    if p_payload ? 'expected_attendance'
       and p_payload ->> 'expected_attendance' is not null
       and v_lead.tour_attendance_status is distinct from p_payload ->> 'expected_attendance'
       and v_lead.tour_attendance_status is distinct from v_target_attendance then
      return pg_catalog.jsonb_build_object('conflict', true, 'error', 'The tour outcome changed since this view loaded. Refresh and review it.');
    end if;
    v_next_status := 'completed';
    v_event_type := 'test_tour_outcome';
  else
    if v_current_status not in ('requested', 'scheduled', 'confirmed')
       or v_lead.preferred_tour_date is null
       or v_lead.tour_attendance_status in ('attended', 'no_show') then
      return pg_catalog.jsonb_build_object('conflict', true, 'error', 'There is no upcoming simulated tour to cancel.');
    end if;
    if pg_catalog.length(coalesce(p_payload ->> 'reason', '')) > 500 then
      raise exception 'The simulated tour cancellation reason is too long.' using errcode = '22023';
    end if;
    v_next_status := 'cancelled';
    v_event_type := 'test_tour_cancelled';
  end if;

  v_next_revision := v_current_revision + 1;
  v_details := coalesce(v_artifact.details, '{}'::jsonb) || p_payload ||
    pg_catalog.jsonb_build_object(
      'simulation_only', true,
      'calendar_event_created', false,
      'inventory_reserved', false,
      'tour_revision', v_next_revision,
      'atomic_test_action_key', p_action_key,
      'request_fingerprint', p_request_fingerprint,
      'action', p_action,
      'action_recorded_at', v_action_at
    );
  if p_action in ('outcome_attended', 'outcome_no_show') then
    v_details := v_details || pg_catalog.jsonb_build_object(
      'tour_attendance_status', v_target_attendance,
      'outcome_recorded_at', v_action_at
    );
  elsif p_action = 'cancel' then
    v_details := v_details || pg_catalog.jsonb_build_object(
      'cancellation_reason', nullif(pg_catalog.btrim(p_payload ->> 'reason'), ''),
      'cancelled_at', v_action_at,
      'calendar_event_cancelled', false,
      'inventory_released', false,
      'test_email_queued', false
    );
  end if;

  insert into public.luxor_test_run_artifacts (test_run_id, artifact_type, status, details, updated_at)
  values (v_run.id, 'tour', v_next_status, v_details, v_action_at)
  on conflict (test_run_id, artifact_type) do update set
    status = excluded.status,
    details = excluded.details,
    updated_at = excluded.updated_at
  returning * into v_artifact;

  if p_action = 'schedule' then
    update public.luxor_inquiries
    set status = 'tour_confirmed',
        pipeline_stage = 'tour',
        preferred_tour_date = (p_payload ->> 'preferred_tour_date')::date,
        preferred_tour_time = pg_catalog.btrim(p_payload ->> 'preferred_tour_time'),
        tour_attendance_status = 'pending',
        tour_confirmed_at = v_action_at,
        metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'tourMeetingType', p_payload ->> 'meeting_type',
          'tourClientFacingNotes', coalesce(p_payload ->> 'client_facing_notes', ''),
          'tour_assignees', p_payload -> 'assignees'
        ),
        updated_at = v_action_at
    where id = v_lead.id and is_test is true
    returning * into v_lead;
  elsif p_action = 'outcome_attended' then
    update public.luxor_inquiries
    set tour_attendance_status = v_target_attendance,
        status = 'tour_confirmed',
        pipeline_stage = 'proposal',
        tour_confirmed_at = coalesce(tour_confirmed_at, v_action_at),
        updated_at = v_action_at
    where id = v_lead.id and is_test is true
    returning * into v_lead;
  elsif p_action = 'outcome_no_show' then
    update public.luxor_inquiries
    set tour_attendance_status = v_target_attendance,
        pipeline_stage = 'tour',
        tour_confirmed_at = coalesce(tour_confirmed_at, v_action_at),
        updated_at = v_action_at
    where id = v_lead.id and is_test is true
    returning * into v_lead;
  else
    update public.luxor_inquiries
    set tour_attendance_status = 'cancelled', updated_at = v_action_at
    where id = v_lead.id and is_test is true
    returning * into v_lead;
  end if;
  if not found then
    raise exception 'The permanent Test Lead could not be updated.' using errcode = '55000';
  end if;

  insert into public.luxor_test_run_activity (test_run_id, event_type, status, source, details)
  values (
    v_run.id, v_event_type, v_next_status, 'portal_test_lead',
    pg_catalog.jsonb_build_object(
      'simulation_only', true,
      'action', p_action,
      'atomic_test_action_key', p_action_key,
      'request_fingerprint', p_request_fingerprint,
      'expected_status', p_expected_tour_status,
      'expected_revision', p_expected_revision,
      'revision', v_next_revision,
      'calendar_event_created', false,
      'inventory_reserved', false,
      'details', v_details
    )
  );

  return pg_catalog.jsonb_build_object(
    'replayed', false,
    'simulated', true,
    'calendar_event_created', false,
    'inventory_reserved', false,
    'artifact', pg_catalog.to_jsonb(v_artifact),
    'inquiry', pg_catalog.to_jsonb(v_lead)
  );
end;
$$;

revoke all on function public.luxor_apply_test_tour_action(uuid, text, text, text, integer, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_apply_test_tour_action(uuid, text, text, text, integer, timestamptz, text, jsonb) to service_role;

-- These updates are ordinary CRM side effects. The permanent test inquiry is
-- isolated and must not create lead-event transitions or stop real follow-ups.
create or replace function public.luxor_sync_confirmed_tour_lead_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_test is true then return new; end if;
  if new.status = 'tour_confirmed'
     and (old.status is distinct from new.status or old.pipeline_stage is distinct from new.pipeline_stage) then
    update public.luxor_lead_events
    set status = 'tour_confirmed',
        pipeline_stage = 'tour',
        updated_at = pg_catalog.now()
    where inquiry_id = new.id
      and status in ('new', 'contacted', 'tour_requested')
      and pipeline_stage in ('inquiry', 'tour');
  end if;
  return new;
end;
$$;

create or replace function public.luxor_stop_brochure_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stop_reason text;
begin
  if new.is_test is true then return new; end if;
  if old.marketing_opt_in and not new.marketing_opt_in then stop_reason := 'unsubscribed';
  elsif new.status = 'tour_confirmed' then stop_reason := 'tour_scheduled';
  elsif new.status = 'booked' then stop_reason := 'booked';
  elsif new.status = 'closed_lost' then stop_reason := 'lost_another_venue';
  elsif new.follow_up_disposition in ('not_interested', 'lost_another_venue', 'event_canceled') then stop_reason := new.follow_up_disposition;
  else return new;
  end if;

  update public.luxor_follow_up_enrollments
  set status = 'stopped', ended_reason = stop_reason, updated_at = pg_catalog.now()
  where inquiry_id = new.id and automation_key = 'brochure_lead' and status in ('active', 'paused');

  update public.luxor_follow_up_actions action
  set status = 'cancelled', updated_at = pg_catalog.now()
  from public.luxor_follow_up_enrollments enrollment
  where action.enrollment_id = enrollment.id
    and enrollment.inquiry_id = new.id
    and enrollment.automation_key = 'brochure_lead'
    and action.status in ('scheduled', 'email_queued', 'task_created', 'processing');

  update public.luxor_email_jobs job
  set status = 'cancelled', last_error = 'Brochure follow-up stopped: ' || stop_reason, updated_at = pg_catalog.now()
  where job.inquiry_id = new.id
    and job.status = 'queued'
    and job.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments
      where inquiry_id = new.id and automation_key = 'brochure_lead'
    );

  update public.luxor_tasks task
  set status = 'cancelled'
  where task.inquiry_id = new.id
    and task.status = 'pending'
    and task.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments
      where inquiry_id = new.id and automation_key = 'brochure_lead'
    );
  return new;
end;
$$;

-- This category is only queued through the server-only test-email RPC. Existing
-- history and the fixed-recipient constraint are preserved.
alter table public.luxor_test_run_emails
  drop constraint if exists luxor_test_run_emails_category_check;
alter table public.luxor_test_run_emails
  add constraint luxor_test_run_emails_category_check check (category in (
    'form_confirmation','brochure','tour_confirmation','tour_reminder','tour_cancellation','follow_up',
    'proposal','proposal_breakdown','contract','booking_confirmation','payment_reminder','planning',
    'event_notification','post_event','review_request','direct_message','other'
  ));

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
set search_path = ''
as $$
declare
  v_result jsonb;
  v_identity text := 'portal_test_email:' || pg_catalog.gen_random_uuid()::text;
  v_settings public.luxor_test_settings;
  v_lead public.luxor_inquiries;
  v_run public.luxor_test_runs;
  v_artifact public.luxor_test_run_artifacts;
  v_email public.luxor_test_run_emails;
  v_job public.luxor_email_jobs;
  v_revision integer;
begin
  if p_category is null or p_category not in (
    'form_confirmation','brochure','tour_confirmation','tour_reminder','tour_cancellation','follow_up',
    'proposal','proposal_breakdown','contract','booking_confirmation','payment_reminder','planning',
    'event_notification','post_event','review_request','direct_message','other'
  ) then
    raise exception 'Unsupported test email category.' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_subject, ''))) not between 1 and 200
     or pg_catalog.length(coalesce(p_body, '')) not between 1 and 50000 then
    raise exception 'Test email subject or body has an invalid length.' using errcode = '22023';
  end if;

  if p_category = 'proposal_breakdown' then
    if coalesce(p_source, '') !~ '^proposal_breakdown:[1-9][0-9]*:[0-9a-f]{64}$'
       or pg_catalog.btrim(coalesce(p_subject, '')) not like '[TEST ONLY] %'
       or coalesce(p_body, '') not like '%SIMULATED TEST MESSAGE%' then
      raise exception 'Breakdown test email requires a stable proposal revision key and marked test content.' using errcode = '22023';
    end if;

    -- Preserve the same settings -> lead -> run lock order as other test RPCs.
    select * into v_settings from public.luxor_test_settings where id = 1 for update;
    if not found or not v_settings.enabled
       or v_settings.email_recipient is distinct from 'luxoratlaspalmas@gmail.com'
       or v_settings.email_recipient_confirmed_at is null then
      raise exception 'Test workflow is disabled or the verified test inbox is not confirmed.' using errcode = '55000';
    end if;
    select * into v_lead from public.luxor_inquiries
    where id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid and is_test is true
    for update;
    if not found then raise exception 'The permanent Test Lead is not provisioned.' using errcode = '55000'; end if;
    select * into v_run from public.luxor_test_runs
    where id = p_test_run_id and test_lead_id = v_lead.id and status = 'in_progress'
    for update;
    if not found then raise exception 'Only the active permanent Test Lead run can receive test email.' using errcode = '55000'; end if;

    select * into v_artifact from public.luxor_test_run_artifacts
    where test_run_id = v_run.id and artifact_type = 'proposal'
    for update;
    if not found or v_artifact.status not in ('drafted', 'sent') then
      raise exception 'Save the isolated proposal before preparing its Breakdown email.' using errcode = '55000';
    end if;
    if coalesce(v_artifact.details ->> 'proposal_revision', '') !~ '^[1-9][0-9]*$' then
      raise exception 'The isolated proposal revision could not be verified.' using errcode = '55000';
    end if;
    v_revision := (v_artifact.details ->> 'proposal_revision')::integer;
    if pg_catalog.split_part(p_source, ':', 2) <> (v_artifact.details ->> 'proposal_revision') then
      raise exception 'The saved proposal changed. Refresh it before queuing its Breakdown email.' using errcode = '40001';
    end if;
    v_identity := 'portal_test_email:' || p_source;

    select * into v_email from public.luxor_test_run_emails
    where test_run_id = v_run.id and category = 'proposal_breakdown'
      and details ->> 'proposal_revision' = v_revision::text
    order by created_at limit 1 for update;
    if found then
      if v_email.details ->> 'source' is distinct from v_identity then
        return pg_catalog.jsonb_build_object(
          'conflict', true,
          'error', 'A Breakdown email is already queued for this saved proposal revision.'
        );
      end if;
      return pg_catalog.jsonb_build_object(
        'email', pg_catalog.to_jsonb(v_email), 'job_id', v_email.email_job_id,
        'test_run_id', v_run.id, 'recipient', 'luxoratlaspalmas@gmail.com',
        'source', p_source, 'replayed', true
      );
    end if;

    insert into public.luxor_email_jobs (
      inquiry_id, job_type, status, recipient_email, subject, body,
      scheduled_for, metadata, test_run_id
    ) values (
      v_lead.id, 'test_notification', 'queued', 'luxoratlaspalmas@gmail.com',
      pg_catalog.btrim(p_subject), p_body, pg_catalog.now(),
      pg_catalog.jsonb_build_object(
        'test_email', 'true', 'test_category', 'proposal_breakdown',
        'test_source', v_identity, 'automatic_source', v_identity,
        'test_proposal_revision', v_revision, 'test_breakdown_idempotency_key', p_source
      ), v_run.id
    ) returning * into v_job;
    insert into public.luxor_test_run_emails (
      test_run_id, email_job_id, category, status, actual_recipient,
      provider_status, delivery_status, details
    ) values (
      v_run.id, v_job.id, 'proposal_breakdown', 'queued', 'luxoratlaspalmas@gmail.com',
      'not_attempted', 'unknown',
      pg_catalog.jsonb_build_object(
        'simulation_only', false, 'provider_called', false,
        'delivery_status', 'unknown', 'source', v_identity,
        'automatic_source', v_identity, 'proposal_revision', v_revision,
        'subject', pg_catalog.left(p_subject, 200)
      )
    ) returning * into v_email;
    insert into public.luxor_test_run_activity (
      test_run_id, event_type, status, source, recipient_email, details
    ) values (
      v_run.id, 'test_email_queued', 'queued', v_identity, 'luxoratlaspalmas@gmail.com',
      pg_catalog.jsonb_build_object(
        'email_id', v_email.id, 'email_job_id', v_job.id,
        'category', 'proposal_breakdown', 'automatic', true,
        'proposal_revision', v_revision
      )
    );
    return pg_catalog.jsonb_build_object(
      'email', pg_catalog.to_jsonb(v_email), 'job_id', v_job.id,
      'test_run_id', v_run.id, 'recipient', 'luxoratlaspalmas@gmail.com',
      'source', p_source, 'replayed', false
    );
  end if;

  v_result := public.luxor_prepare_test_submission(
    p_test_run_id, false, null, null, false, p_category,
    pg_catalog.btrim(p_subject), p_body, v_identity, pg_catalog.now()
  );
  return pg_catalog.jsonb_build_object(
    'email', v_result, 'job_id', v_result -> 'email_job_id',
    'test_run_id', p_test_run_id, 'recipient', 'luxoratlaspalmas@gmail.com',
    'source', pg_catalog.left(coalesce(p_source, ''), 120)
  );
end;
$$;

revoke all on function public.luxor_enqueue_test_email(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.luxor_enqueue_test_email(uuid, text, text, text, text) to service_role;

-- Keep the existing history reschedule/cancel queue semantics, but make that
-- legacy writer participate in the same revision fence as the new atomic path.
create or replace function public.luxor_simulate_test_tour_change(
  p_test_run_id uuid,
  p_action text,
  p_action_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  v_current_status text := 'simulated';
  v_current_revision integer := 0;
  v_next_revision integer;
  v_request_fingerprint text := pg_catalog.md5(p_action || ':' || coalesce(p_payload, '{}'::jsonb)::text);
begin
  if p_action is null or p_action not in ('reschedule','cancel') or length(trim(coalesce(p_action_key,''))) not between 8 and 160 then
    raise exception 'Provide a valid simulated tour action and idempotency key.' using errcode='22023';
  end if;
  select * into v_run from public.luxor_test_runs where id=p_test_run_id;
  if not found then raise exception 'Test run not found.' using errcode='P0002'; end if;
  -- Keep every lifecycle writer in the same settings -> lead -> run -> artifact lock order.
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
    if v_existing_event.details ->> 'request_fingerprint' is distinct from v_request_fingerprint then
      return pg_catalog.jsonb_build_object('conflict',true,'error','This tour action key was already used with different content.');
    end if;
    return jsonb_build_object('test_run_id',v_run.id,'tour_status',v_artifact.status,'replayed',true,'cancelled_jobs',0);
  end if;

  select * into v_artifact from public.luxor_test_run_artifacts
  where test_run_id=v_run.id and artifact_type='tour' for update;
  if found then
    v_current_status := v_artifact.status;
    if v_artifact.details ? 'tour_revision' then
      if coalesce(v_artifact.details->>'tour_revision','') !~ '^[0-9]{1,10}$' then
        return pg_catalog.jsonb_build_object('conflict',true,'error','The saved simulated tour revision is invalid.');
      end if;
      if (v_artifact.details->>'tour_revision')::numeric > 2147483646 then
        return pg_catalog.jsonb_build_object('conflict',true,'error','The saved simulated tour revision is invalid.');
      end if;
      v_current_revision := (v_artifact.details->>'tour_revision')::integer;
    end if;
  else
    v_artifact.details := '{}'::jsonb;
  end if;
  if coalesce(p_payload->>'expected_tour_revision','') !~ '^[0-9]{1,10}$' then
    return pg_catalog.jsonb_build_object('conflict',true,'error','The simulated tour changed. Refresh its history before trying again.');
  end if;
  if (p_payload->>'expected_tour_revision')::numeric <> v_current_revision
     or p_payload->>'expected_tour_status' is distinct from v_current_status then
    return jsonb_build_object('conflict',true,'error','The simulated tour changed. Refresh its history before trying again.');
  end if;
  if v_current_revision >= 2147483646 then
    return pg_catalog.jsonb_build_object('conflict',true,'error','The simulated tour revision is exhausted.');
  end if;
  if p_action='cancel' and v_current_status not in ('requested','scheduled','confirmed') then
    return jsonb_build_object('conflict',true,'error','There is no upcoming simulated tour to cancel.');
  end if;
  if p_action='reschedule' and v_current_status in ('completed','cancelled','failed','reset') then
    return jsonb_build_object('conflict',true,'error','A final simulated tour cannot be rescheduled.');
  end if;
  v_next_revision := v_current_revision + 1;

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
        'previous_tour_time',v_lead.preferred_tour_time,'action_key',p_action_key,
        'tour_revision',v_next_revision),updated_at=now()
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
      'end_utc',p_payload->>'endUtc','location',p_payload->>'location','action_key',p_action_key,
      'tour_revision',v_next_revision),now())
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
    'tour_revision',v_next_revision,'request_fingerprint',v_request_fingerprint,
    'date',v_date,'time',v_time,'cancelled_jobs',v_cancelled_count));
  return jsonb_build_object('test_run_id',v_run.id,'tour_status',v_artifact.status,'tour_revision',v_next_revision,'replayed',false,'cancelled_jobs',v_cancelled_count);
end;
$$;

revoke all on function public.luxor_simulate_test_tour_change(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_simulate_test_tour_change(uuid,text,text,jsonb) to service_role;

notify pgrst, 'reload schema';
