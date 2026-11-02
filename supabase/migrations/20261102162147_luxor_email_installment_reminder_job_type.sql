-- Add the already-supported installment reminder job kind to the explicit
-- email-job allowlist. Keep every currently intended kind, including Planner's
-- existing layout_review type; unknown job types remain rejected.
alter table public.luxor_email_jobs
  drop constraint if exists luxor_email_jobs_job_type_check,
  add constraint luxor_email_jobs_job_type_check check (job_type in (
    'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
    'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
    'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
    'final_payment_request','final_payment_reminder','installment_payment_reminder','event_details_reminder','event_day_reminder',
    'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review',
    'calendar_invitation','inquiry_notification','transactional_notice','test_notification','custom_workflow'
  ));
