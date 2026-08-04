alter table public.luxor_invoices
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists proposal_viewed_at timestamptz,
  add column if not exists payment_requested_at timestamptz,
  add column if not exists payment_requested_amount numeric(12, 2),
  add column if not exists payment_requested_label text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_checkout_opened_at timestamptz,
  add column if not exists stripe_invoice_id text,
  add column if not exists booking_id uuid references public.luxor_bookings(id) on delete cascade,
  add column if not exists parent_invoice_id uuid references public.luxor_invoices(id) on delete set null,
  add column if not exists invoice_kind text not null default 'event';

update public.luxor_invoices
set invoice_kind = 'event'
where invoice_kind is null;

alter table public.luxor_invoices
  drop constraint if exists luxor_invoices_invoice_kind_check;

alter table public.luxor_invoices
  add constraint luxor_invoices_invoice_kind_check
  check (invoice_kind in ('event', 'deposit', 'final_balance'));

create unique index if not exists luxor_invoices_public_token_unique_idx
  on public.luxor_invoices (public_token);

create index if not exists luxor_invoices_booking_created_idx
  on public.luxor_invoices (booking_id, created_at desc);

create unique index if not exists luxor_invoices_booking_payment_kind_unique_idx
  on public.luxor_invoices (booking_id, invoice_kind)
  where booking_id is not null and invoice_kind in ('deposit', 'final_balance');

alter table public.luxor_payments
  drop constraint if exists luxor_payments_processor_reference_unique;

drop index if exists public.luxor_payments_processor_reference_unique_idx;

alter table public.luxor_payments
  add constraint luxor_payments_processor_reference_unique
  unique (processor, processor_reference);

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
      'grand_opening_rsvp_confirmation'
    )
  );

comment on column public.luxor_invoices.invoice_kind is
  'Distinguishes the full event quote from the 30% deposit invoice and the final balance invoice.';

comment on column public.luxor_invoices.parent_invoice_id is
  'Links deposit and final-balance invoices back to the full event quote.';

comment on column public.luxor_invoices.booking_id is
  'Links payment-stage invoices directly to the booking they collect for.';

notify pgrst, 'reload schema';
