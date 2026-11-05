-- A confirmed, signed event moves the client out of acquisition follow-ups.
-- Keep booking, payment, planning, event, and historical communication intact.
begin;

create or replace function public.luxor_stop_acquisition_followups_for_signed_booking(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reconciliation runs after the booking commits, outside the signing
  -- transaction. Later passes catch concurrent follow-up creation.
  if not exists (
    select 1 from public.luxor_bookings b
    where b.inquiry_id = p_inquiry_id
      and b.status in ('confirmed', 'completed')
      and b.contract_status = 'signed'
  ) then
    return;
  end if;

  update public.luxor_follow_up_enrollments
  set status = 'stopped', ended_reason = 'booked', updated_at = pg_catalog.now()
  where inquiry_id = p_inquiry_id and automation_key = 'brochure_lead'
    and status in ('active', 'paused');

  update public.luxor_follow_up_actions a
  set status = 'cancelled', outcome = coalesce(a.outcome, 'booked'), updated_at = pg_catalog.now()
  from public.luxor_follow_up_enrollments e
  where a.enrollment_id = e.id and e.inquiry_id = p_inquiry_id
    and e.automation_key = 'brochure_lead'
    and a.status in ('scheduled', 'email_queued', 'task_created', 'processing');

  update public.luxor_email_jobs j
  set status = 'cancelled', last_error = 'Acquisition follow-up stopped: signed booking confirmed.', updated_at = pg_catalog.now()
  where j.inquiry_id = p_inquiry_id and j.status = 'queued'
    and j.test_run_id is null and j.custom_workflow_step_run_id is null
    and coalesce(j.calendar_method, '') <> 'CANCEL'
    and (
      j.automation_enrollment_id in (
        select e.id from public.luxor_follow_up_enrollments e
        where e.inquiry_id = p_inquiry_id and e.automation_key = 'brochure_lead'
      )
      or j.job_type in ('tour_confirmation', 'tour_reminder', 'tour_no_show_reschedule')
      or (j.job_type = 'booking_package' and j.metadata->>'flow_stage' = 'brochure_delivery')
    );

  update public.luxor_text_jobs j
  set status = 'cancelled', last_error = 'Tour follow-up stopped: signed booking confirmed.', updated_at = pg_catalog.now()
  where j.inquiry_id = p_inquiry_id and j.status = 'queued'
    and j.custom_workflow_step_run_id is null
    and j.job_type in ('tour_confirmation', 'tour_reminder');

  update public.luxor_tasks t
  set status = 'cancelled', post_tour_reopen_cancelled = false
  where t.inquiry_id = p_inquiry_id and t.status = 'pending'
    and (
      t.post_tour_source_visit_id is not null
      or t.post_tour_source_inquiry_id is not null
      or lower(coalesce(t.description, '')) like '[follow-up:%'
      or t.automation_enrollment_id in (
        select e.id from public.luxor_follow_up_enrollments e
        where e.inquiry_id = p_inquiry_id and e.automation_key = 'brochure_lead'
      )
    );
end;
$$;

revoke all on function public.luxor_stop_acquisition_followups_for_signed_booking(uuid) from public, anon, authenticated;

commit;
