-- A signed, confirmed booking ends prospect follow-up. Fence generated tour
-- follow-ups and attempts to reopen an existing follow-up task. Keep the task
-- record for history and do not interfere with ordinary planning tasks.
create or replace function public.luxor_guard_booked_follow_up_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inquiry_id is null or new.status is distinct from 'pending' then
    return new;
  end if;

  if new.automation_enrollment_id is null
     and new.post_tour_source_visit_id is null
     and new.post_tour_source_inquiry_id is null
     and lower(coalesce(new.description, '')) not like '[follow-up:%' then
    return new;
  end if;

  if exists (
    select 1 from public.luxor_bookings
    where inquiry_id = new.inquiry_id
      and status in ('confirmed', 'completed')
      and contract_status = 'signed'
  ) then
    new.status := 'cancelled';
    new.completed_at := null;
    new.post_tour_reopen_cancelled := false;
  end if;
  return new;
end;
$$;

revoke all on function public.luxor_guard_booked_follow_up_task() from public, anon, authenticated;
drop trigger if exists luxor_guard_booked_follow_up_task on public.luxor_tasks;
create trigger luxor_guard_booked_follow_up_task
before insert or update of status, inquiry_id, description, automation_enrollment_id, post_tour_source_visit_id, post_tour_source_inquiry_id
on public.luxor_tasks
for each row execute function public.luxor_guard_booked_follow_up_task();

-- Never take an inquiry lock here: callers may already hold a child row lock,
-- while booking cleanup takes locks in the opposite order. Worker eligibility
-- remains the final send-time safety check during concurrent transactions.
create or replace function public.luxor_has_signed_booking_for_follow_up(p_inquiry_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_inquiry_id is null then return false; end if;
  return exists (
    select 1 from public.luxor_bookings
    where inquiry_id = p_inquiry_id
      and status in ('confirmed', 'completed') and contract_status = 'signed'
  );
end;
$$;
revoke all on function public.luxor_has_signed_booking_for_follow_up(uuid) from public, anon, authenticated;

create or replace function public.luxor_guard_booked_brochure_enrollment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.automation_key = 'brochure_lead' and new.status in ('active', 'paused')
     and public.luxor_has_signed_booking_for_follow_up(new.inquiry_id) then
    new.status := 'stopped';
    new.ended_reason := 'booked';
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_booked_brochure_enrollment() from public, anon, authenticated;
drop trigger if exists luxor_guard_booked_brochure_enrollment on public.luxor_follow_up_enrollments;
create trigger luxor_guard_booked_brochure_enrollment
before insert or update of status, inquiry_id, automation_key on public.luxor_follow_up_enrollments
for each row execute function public.luxor_guard_booked_brochure_enrollment();

create or replace function public.luxor_guard_booked_brochure_action()
returns trigger language plpgsql security definer set search_path = '' as $$
declare enrolled_inquiry uuid;
begin
  if new.status not in ('scheduled', 'processing', 'email_queued', 'task_created') then return new; end if;
  select inquiry_id into enrolled_inquiry from public.luxor_follow_up_enrollments
  where id = new.enrollment_id and automation_key = 'brochure_lead';
  if public.luxor_has_signed_booking_for_follow_up(enrolled_inquiry) then
    new.status := 'cancelled';
    new.outcome := coalesce(new.outcome, 'booked');
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_booked_brochure_action() from public, anon, authenticated;
drop trigger if exists luxor_guard_booked_brochure_action on public.luxor_follow_up_actions;
create trigger luxor_guard_booked_brochure_action
before insert or update of status, enrollment_id on public.luxor_follow_up_actions
for each row execute function public.luxor_guard_booked_brochure_action();

create or replace function public.luxor_guard_booked_brochure_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare enrolled_inquiry uuid;
begin
  if new.status <> 'queued' or new.automation_enrollment_id is null or new.test_run_id is not null then return new; end if;
  select inquiry_id into enrolled_inquiry from public.luxor_follow_up_enrollments
  where id = new.automation_enrollment_id and automation_key = 'brochure_lead';
  if public.luxor_has_signed_booking_for_follow_up(enrolled_inquiry) then
    new.status := 'cancelled';
    new.last_error := 'Acquisition follow-up stopped: signed booking confirmed.';
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_booked_brochure_email() from public, anon, authenticated;
drop trigger if exists luxor_guard_booked_brochure_email on public.luxor_email_jobs;
create trigger luxor_guard_booked_brochure_email
before insert or update of status, automation_enrollment_id on public.luxor_email_jobs
for each row execute function public.luxor_guard_booked_brochure_email();

-- Clean outstanding acquisition work for clients with a signed booking.
-- Only inspect clients with outstanding acquisition work and bound each run.
create or replace function public.luxor_reconcile_signed_booking_followups(p_limit integer default 25)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  candidate uuid;
  reconciled integer := 0;
begin
  for candidate in
    select distinct b.inquiry_id
    from public.luxor_bookings b
    where b.inquiry_id is not null
      and b.status in ('confirmed', 'completed') and b.contract_status = 'signed'
      and (
        exists (select 1 from public.luxor_follow_up_enrollments e
          where e.inquiry_id = b.inquiry_id and e.automation_key = 'brochure_lead' and e.status in ('active', 'paused'))
        or exists (select 1 from public.luxor_follow_up_actions a
          join public.luxor_follow_up_enrollments e on e.id = a.enrollment_id
          where e.inquiry_id = b.inquiry_id and e.automation_key = 'brochure_lead'
            and a.status in ('scheduled', 'email_queued', 'task_created', 'processing'))
        or exists (select 1 from public.luxor_tasks t
          where t.inquiry_id = b.inquiry_id and t.status = 'pending'
            and (t.post_tour_source_visit_id is not null or t.post_tour_source_inquiry_id is not null
              or lower(coalesce(t.description, '')) like '[follow-up:%'
              or exists (select 1 from public.luxor_follow_up_enrollments e
                where e.id = t.automation_enrollment_id and e.inquiry_id = b.inquiry_id and e.automation_key = 'brochure_lead')))
        or exists (select 1 from public.luxor_email_jobs j
          where j.inquiry_id = b.inquiry_id and j.status = 'queued'
            and j.test_run_id is null and j.custom_workflow_step_run_id is null
            and coalesce(j.calendar_method, '') <> 'CANCEL'
            and (j.job_type in ('tour_confirmation', 'tour_reminder', 'tour_no_show_reschedule')
              or (j.job_type = 'booking_package' and j.metadata->>'flow_stage' = 'brochure_delivery')
              or exists (select 1 from public.luxor_follow_up_enrollments e
                where e.id = j.automation_enrollment_id and e.inquiry_id = b.inquiry_id and e.automation_key = 'brochure_lead')))
        or exists (select 1 from public.luxor_text_jobs j
          where j.inquiry_id = b.inquiry_id and j.status = 'queued' and j.custom_workflow_step_run_id is null
            and j.job_type in ('tour_confirmation', 'tour_reminder'))
      )
    order by b.inquiry_id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  loop
    perform public.luxor_stop_acquisition_followups_for_signed_booking(candidate);
    reconciled := reconciled + 1;
  end loop;
  return reconciled;
end;
$$;
revoke all on function public.luxor_reconcile_signed_booking_followups(integer) from public, anon, authenticated;
grant execute on function public.luxor_reconcile_signed_booking_followups(integer) to service_role;

notify pgrst, 'reload schema';
