-- Serialize day-30 finalization against lead responses and stop dispositions.
-- Every writer follows inquiry -> enrollment lock order, matching the stop trigger.
create or replace function public.luxor_finalize_brochure_follow_up_locked(
  p_enrollment_id uuid,
  p_inquiry_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.luxor_follow_up_enrollments%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  terminal_action boolean;
  stop_reason text;
  has_response boolean;
begin
  select * into inquiry
  from public.luxor_inquiries
  where id = p_inquiry_id;

  select * into enrollment
  from public.luxor_follow_up_enrollments
  where id = p_enrollment_id
    and inquiry_id = p_inquiry_id
    and automation_key = 'brochure_lead';

  if not found or enrollment.status not in ('active', 'paused') then
    return jsonb_build_object('status', coalesce(enrollment.status, 'missing'), 'finalized', false);
  end if;

  select exists (
    select 1 from public.luxor_follow_up_actions action
    where action.enrollment_id = p_enrollment_id
      and action.step_key = 'email_5'
      and action.channel = 'email'
      and action.status in ('completed', 'failed')
  ) into terminal_action;

  if not terminal_action then
    return jsonb_build_object('status', enrollment.status, 'finalized', false);
  end if;

  if not inquiry.marketing_opt_in then stop_reason := 'unsubscribed';
  elsif inquiry.status = 'tour_confirmed' then stop_reason := 'tour_scheduled';
  elsif inquiry.status = 'booked' then stop_reason := 'booked';
  elsif inquiry.status = 'closed_lost' then stop_reason := 'lost_another_venue';
  elsif inquiry.follow_up_disposition in ('not_interested', 'lost_another_venue', 'event_canceled') then stop_reason := inquiry.follow_up_disposition;
  end if;

  if stop_reason is not null then
    update public.luxor_follow_up_enrollments
    set status = 'stopped', ended_reason = stop_reason, updated_at = p_now
    where id = p_enrollment_id and status in ('active', 'paused');
    return jsonb_build_object('status', 'stopped', 'finalized', false, 'ended_reason', stop_reason);
  end if;

  has_response := enrollment.response_received_at is not null;
  update public.luxor_follow_up_enrollments
  set status = 'completed',
      ended_reason = case when has_response then 'day_30_complete_after_response' else 'day_30_no_response' end,
      completed_at = p_now,
      nurture_eligible_at = case when not has_response and inquiry.marketing_opt_in then p_now else null end,
      updated_at = p_now
  where id = p_enrollment_id and status in ('active', 'paused');

  if not has_response then
    if inquiry.follow_up_disposition is null then
      update public.luxor_inquiries
      set follow_up_disposition = 'no_response', follow_up_disposition_updated_at = p_now, updated_at = p_now
      where id = p_inquiry_id and follow_up_disposition is null;
    end if;

    update public.luxor_tasks
    set status = 'cancelled'
    where automation_enrollment_id = p_enrollment_id and status = 'pending';

    update public.luxor_follow_up_actions
    set status = 'cancelled', outcome = 'sequence_complete', updated_at = p_now
    where enrollment_id = p_enrollment_id
      and status in ('scheduled', 'email_queued', 'task_created', 'processing');

    update public.luxor_email_jobs
    set status = 'cancelled', last_error = 'Brochure follow-up sequence completed.', updated_at = p_now
    where automation_enrollment_id = p_enrollment_id and status = 'queued';
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'finalized', true,
    'ended_reason', case when has_response then 'day_30_complete_after_response' else 'day_30_no_response' end,
    'nurture_eligible', (not has_response and inquiry.marketing_opt_in)
  );
end;
$$;

create or replace function public.luxor_finalize_brochure_follow_up(p_enrollment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_inquiry_id uuid;
  result jsonb;
begin
  select inquiry_id into target_inquiry_id
  from public.luxor_follow_up_enrollments
  where id = p_enrollment_id and automation_key = 'brochure_lead';
  if target_inquiry_id is null then
    return jsonb_build_object('status', 'missing', 'finalized', false);
  end if;

  perform 1 from public.luxor_inquiries where id = target_inquiry_id for update;
  perform 1 from public.luxor_follow_up_enrollments
  where id = p_enrollment_id and inquiry_id = target_inquiry_id for update;

  result := public.luxor_finalize_brochure_follow_up_locked(p_enrollment_id, target_inquiry_id, now());
  return result;
end;
$$;

create or replace function public.luxor_control_brochure_follow_up(p_inquiry_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.luxor_follow_up_enrollments%rowtype;
  result jsonb;
begin
  if p_action is null or p_action not in ('pause', 'resume', 'stop') then
    raise exception 'Unsupported brochure follow-up action.' using errcode = '22023';
  end if;

  perform 1 from public.luxor_inquiries where id = p_inquiry_id for update;
  select * into enrollment
  from public.luxor_follow_up_enrollments
  where inquiry_id = p_inquiry_id and automation_key = 'brochure_lead'
  order by started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('status', 'missing', 'finalized', false);
  end if;

  if p_action = 'pause' then
    if enrollment.status = 'active' then
      update public.luxor_follow_up_enrollments
      set status = 'paused', paused_at = now(), updated_at = now()
      where id = enrollment.id and status = 'active';
      return jsonb_build_object('status', 'paused', 'finalized', false);
    end if;
    return jsonb_build_object('status', enrollment.status, 'finalized', false);
  end if;

  if p_action = 'stop' then
    if enrollment.status not in ('active', 'paused') then
      return jsonb_build_object('status', enrollment.status, 'finalized', false);
    end if;
    update public.luxor_follow_up_enrollments
    set status = 'stopped', ended_reason = 'manual_stop', updated_at = now()
    where id = enrollment.id and status in ('active', 'paused');
    update public.luxor_follow_up_actions
    set status = 'cancelled', updated_at = now()
    where enrollment_id = enrollment.id and status in ('scheduled', 'email_queued', 'task_created', 'processing');
    update public.luxor_email_jobs
    set status = 'cancelled', last_error = 'Brochure follow-up stopped by portal user.', updated_at = now()
    where automation_enrollment_id = enrollment.id and status = 'queued';
    update public.luxor_tasks
    set status = 'cancelled'
    where automation_enrollment_id = enrollment.id and status = 'pending';
    return jsonb_build_object('status', 'stopped', 'finalized', false);
  end if;

  if enrollment.status <> 'paused' then
    return jsonb_build_object('status', enrollment.status, 'finalized', false);
  end if;

  update public.luxor_follow_up_enrollments
  set status = 'active', paused_at = null, updated_at = now()
  where id = enrollment.id and status = 'paused';

  result := public.luxor_finalize_brochure_follow_up_locked(enrollment.id, p_inquiry_id, now());
  return result;
end;
$$;

create or replace function public.luxor_record_brochure_follow_up_response(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.luxor_follow_up_enrollments%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  response_time timestamptz := now();
begin
  select * into inquiry from public.luxor_inquiries where id = p_inquiry_id for update;
  if not found then return jsonb_build_object('recorded', false); end if;

  select * into enrollment
  from public.luxor_follow_up_enrollments
  where inquiry_id = p_inquiry_id and automation_key = 'brochure_lead'
  order by started_at desc
  limit 1
  for update;
  if not found then return jsonb_build_object('recorded', false); end if;

  if enrollment.status in ('active', 'paused') then
    update public.luxor_follow_up_enrollments
    set response_received_at = coalesce(response_received_at, response_time), updated_at = response_time
    where id = enrollment.id;
    return jsonb_build_object('recorded', true, 'status', enrollment.status);
  end if;

  if enrollment.status = 'completed' and enrollment.ended_reason = 'day_30_no_response' then
    update public.luxor_follow_up_enrollments
    set response_received_at = coalesce(response_received_at, response_time),
        ended_reason = 'day_30_complete_after_response',
        nurture_eligible_at = null,
        updated_at = response_time
    where id = enrollment.id;
    update public.luxor_inquiries
    set follow_up_disposition = null, follow_up_disposition_updated_at = response_time, updated_at = response_time
    where id = p_inquiry_id and follow_up_disposition = 'no_response';
    return jsonb_build_object('recorded', true, 'status', 'completed');
  end if;

  return jsonb_build_object('recorded', false, 'status', enrollment.status);
end;
$$;

revoke all on function public.luxor_finalize_brochure_follow_up_locked(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.luxor_finalize_brochure_follow_up(uuid) from public, anon, authenticated;
revoke all on function public.luxor_control_brochure_follow_up(uuid, text) from public, anon, authenticated;
revoke all on function public.luxor_record_brochure_follow_up_response(uuid) from public, anon, authenticated;
grant execute on function public.luxor_finalize_brochure_follow_up(uuid) to service_role;
grant execute on function public.luxor_control_brochure_follow_up(uuid, text) to service_role;
grant execute on function public.luxor_record_brochure_follow_up_response(uuid) to service_role;

notify pgrst, 'reload schema';
