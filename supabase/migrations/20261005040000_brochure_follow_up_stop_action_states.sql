create or replace function public.luxor_stop_brochure_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stop_reason text;
begin
  if old.marketing_opt_in and not new.marketing_opt_in then stop_reason := 'unsubscribed';
  elsif new.status = 'tour_confirmed' then stop_reason := 'tour_scheduled';
  elsif new.status = 'booked' then stop_reason := 'booked';
  elsif new.status = 'closed_lost' then stop_reason := 'lost_another_venue';
  elsif new.follow_up_disposition in ('not_interested', 'lost_another_venue', 'event_canceled') then stop_reason := new.follow_up_disposition;
  else return new;
  end if;

  update public.luxor_follow_up_enrollments
  set status = 'stopped', ended_reason = stop_reason, updated_at = now()
  where inquiry_id = new.id and automation_key = 'brochure_lead' and status in ('active', 'paused');

  update public.luxor_follow_up_actions action
  set status = 'cancelled', updated_at = now()
  from public.luxor_follow_up_enrollments enrollment
  where action.enrollment_id = enrollment.id
    and enrollment.inquiry_id = new.id
    and enrollment.automation_key = 'brochure_lead'
    and action.status in ('scheduled', 'email_queued', 'task_created', 'processing');

  update public.luxor_email_jobs job
  set status = 'cancelled', last_error = 'Brochure follow-up stopped: ' || stop_reason, updated_at = now()
  where job.inquiry_id = new.id
    and job.status = 'queued'
    and job.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments where inquiry_id = new.id and automation_key = 'brochure_lead'
    );

  update public.luxor_tasks task
  set status = 'cancelled'
  where task.inquiry_id = new.id
    and task.status = 'pending'
    and task.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments where inquiry_id = new.id and automation_key = 'brochure_lead'
    );
  return new;
end;
$$;

revoke all on function public.luxor_stop_brochure_follow_up() from public, anon, authenticated;
