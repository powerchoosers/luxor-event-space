-- Add unpaid_invoice_reminder and sixty_day_payment_reminder to luxor_email_jobs job_type check constraint

alter table public.luxor_email_jobs drop constraint if exists luxor_email_jobs_job_type_check;

alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (
  job_type in (
    'tour_confirmation',
    'tour_reminder',
    'tour_no_show_reschedule',
    'proposal_view_reminder',
    'proposal_payment_reminder',
    'contract_signature',
    'contract_view_reminder',
    'contract_signature_reminder',
    'unpaid_invoice_reminder',
    'sixty_day_payment_reminder',
    'final_payment_reminder',
    'event_details_reminder',
    'event_day_reminder',
    'post_event_follow_up',
    'marketing_campaign',
    'grand_opening_rsvp_confirmation'
  )
);

comment on table public.luxor_invoices is 'Invoice records for Luxor inquiries and events. Supports solidify_date (50% rental + security deposit) and non_refundable_booking deposit modes, with $750 refundable security deposit added to final payment due 60 days before event.';
