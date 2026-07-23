alter table public.luxor_email_jobs
  drop constraint if exists luxor_email_jobs_job_type_check;

alter table public.luxor_email_jobs
  add constraint luxor_email_jobs_job_type_check check (job_type in (
    'tour_confirmation',
    'tour_reminder',
    'tour_no_show_reschedule',
    'proposal_view_reminder',
    'proposal_payment_reminder',
    'contract_signature',
    'contract_view_reminder',
    'contract_signature_reminder',
    'final_payment_reminder',
    'event_details_reminder',
    'event_day_reminder',
    'post_event_follow_up',
    'marketing_campaign',
    'grand_opening_rsvp_confirmation'
  ));

create index if not exists luxor_email_jobs_lifecycle_lookup_idx
  on public.luxor_email_jobs (inquiry_id, job_type, status, scheduled_for);
