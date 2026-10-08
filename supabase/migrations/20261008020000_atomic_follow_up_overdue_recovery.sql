-- Keep overdue-action recovery atomic with its linked email job. A retry after
-- a failed request can safely repeat the same operation without leaving an
-- action/job pair split across terminal states or schedule times. This uses
-- the caller's existing table grants; it does not alter database role grants.
create or replace function public.luxor_recover_brochure_follow_up_overdue(
  p_inquiry_id uuid,
  p_enrollment_id uuid,
  p_action_id uuid,
  p_decision text,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_inquiry public.luxor_inquiries%rowtype;
  target_enrollment public.luxor_follow_up_enrollments%rowtype;
  target_action public.luxor_follow_up_actions%rowtype;
  target_job public.luxor_email_jobs%rowtype;
  has_job boolean := false;
begin
  if p_decision is null or p_decision not in ('skip', 'reschedule') then
    return jsonb_build_object('status', 'invalid_decision');
  end if;

  select inquiry.* into target_inquiry
  from public.luxor_inquiries inquiry
  where inquiry.id = p_inquiry_id
  for update;
  if not found then return jsonb_build_object('status', 'missing_lead'); end if;

  select enrollment.* into target_enrollment
  from public.luxor_follow_up_enrollments enrollment
  where enrollment.id = p_enrollment_id
    and enrollment.inquiry_id = p_inquiry_id
    and enrollment.automation_key = 'brochure_lead'
  for update;
  if not found then return jsonb_build_object('status', 'missing_enrollment'); end if;

  if target_enrollment.status <> 'paused'
    or not target_enrollment.marketing_consent_at_enrollment
    or not target_inquiry.marketing_opt_in
    or target_inquiry.status in ('tour_confirmed', 'booked', 'closed_lost')
    or (target_inquiry.follow_up_disposition is not null and target_inquiry.follow_up_disposition <> 'no_response') then
    return jsonb_build_object('status', 'ineligible');
  end if;

  select action.* into target_action
  from public.luxor_follow_up_actions action
  where action.id = p_action_id
    and action.enrollment_id = p_enrollment_id
    and action.channel = 'email'
    and action.status in ('scheduled', 'email_queued')
    and action.scheduled_at <= now()
  for update;
  if not found then return jsonb_build_object('status', 'stale_action'); end if;

  -- Day 30 is the sequence's terminal action. Skipping it would bypass the
  -- existing terminal finalizer, so only explicit reschedule or stop is safe.
  if p_decision = 'skip' and target_action.step_key = 'email_5' then
    return jsonb_build_object('status', 'terminal_skip_requires_reschedule_or_stop');
  end if;
  if p_decision = 'reschedule' and (p_scheduled_at is null or p_scheduled_at <= now()) then
    return jsonb_build_object('status', 'future_time_required');
  end if;

  if target_action.email_job_id is not null then
    select job.* into target_job
    from public.luxor_email_jobs job
    where job.id = target_action.email_job_id
      and job.inquiry_id = p_inquiry_id
      and job.automation_enrollment_id = p_enrollment_id
      and job.status = 'queued'
    for update;
    if not found then return jsonb_build_object('status', 'stale_job'); end if;
    has_job := true;
  else
    select job.* into target_job
    from public.luxor_email_jobs job
    where job.inquiry_id = p_inquiry_id
      and job.automation_enrollment_id = p_enrollment_id
      and job.automation_step_key = target_action.step_key
      and job.status = 'queued'
    order by job.created_at, job.id
    limit 1
    for update;
    has_job := found;
    if target_action.status = 'email_queued' and not has_job then
      return jsonb_build_object('status', 'stale_job');
    end if;
  end if;

  if p_decision = 'skip' then
    if has_job then
      update public.luxor_email_jobs
      set status = 'cancelled',
          last_error = 'Skipped by staff during overdue resume review.',
          updated_at = now()
      where id = target_job.id and status = 'queued';
      if not found then raise exception 'Queued email changed during recovery.' using errcode = '40001'; end if;
    end if;

    update public.luxor_follow_up_actions
    set status = 'skipped',
        outcome = 'Skipped by staff during overdue resume review.',
        completed_at = now(),
        updated_at = now()
    where id = target_action.id and status in ('scheduled', 'email_queued');
    if not found then raise exception 'Follow-up action changed during recovery.' using errcode = '40001'; end if;
    return jsonb_build_object('status', 'success', 'decision', 'skip', 'action_id', target_action.id);
  end if;

  if has_job then
    update public.luxor_email_jobs
    set scheduled_for = p_scheduled_at, updated_at = now()
    where id = target_job.id and status = 'queued';
    if not found then raise exception 'Queued email changed during recovery.' using errcode = '40001'; end if;
  end if;
  update public.luxor_follow_up_actions
  set scheduled_at = p_scheduled_at, updated_at = now()
  where id = target_action.id and status in ('scheduled', 'email_queued');
  if not found then raise exception 'Follow-up action changed during recovery.' using errcode = '40001'; end if;
  return jsonb_build_object('status', 'success', 'decision', 'reschedule', 'action_id', target_action.id, 'scheduled_at', p_scheduled_at);
end;
$$;

notify pgrst, 'reload schema';
