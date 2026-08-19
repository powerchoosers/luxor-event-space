-- Track owner-requested delivery of private event-layout review links through
-- the existing Luxor email queue. The link itself is revocable at any time.
alter table public.luxor_email_jobs
  drop constraint if exists luxor_email_jobs_job_type_check;

alter table public.luxor_email_jobs
  add constraint luxor_email_jobs_job_type_check check (
    job_type in (
      'tour_confirmation',
      'tour_reminder',
      'tour_no_show_reschedule',
      'proposal_view_reminder',
      'proposal_payment_reminder',
      'contract_signature',
      'contract_view_reminder',
      'contract_signature_reminder',
      'booking_package',
      'deposit_payment_confirmation',
      'unpaid_invoice_reminder',
      'sixty_day_payment_reminder',
      'final_payment_request',
      'final_payment_reminder',
      'event_details_reminder',
      'event_day_reminder',
      'post_event_follow_up',
      'marketing_campaign',
      'grand_opening_rsvp_confirmation',
      'layout_review'
    )
  );

create index if not exists luxor_email_jobs_layout_review_idx
  on public.luxor_email_jobs ((metadata->>'layout_review_id'), created_at desc)
  where job_type = 'layout_review';

notify pgrst, 'reload schema';
