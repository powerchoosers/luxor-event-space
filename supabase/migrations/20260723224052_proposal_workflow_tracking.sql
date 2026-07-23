alter table public.luxor_invoices
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists proposal_viewed_at timestamptz,
  add column if not exists payment_requested_at timestamptz,
  add column if not exists payment_requested_amount numeric(12, 2),
  add column if not exists payment_requested_label text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_checkout_url text;

update public.luxor_invoices
set proposal_sent_at = updated_at
where status in ('sent', 'paid') and proposal_sent_at is null;

create unique index if not exists luxor_invoices_public_token_unique_idx
  on public.luxor_invoices (public_token);

comment on column public.luxor_invoices.public_token is
  'Opaque token for the client-facing proposal review page.';
comment on column public.luxor_invoices.proposal_viewed_at is
  'First time the client-facing proposal review page was opened.';

-- PostgREST's on_conflict=processor,processor_reference cannot target the old
-- partial index. A normal unique constraint still permits multiple NULL values
-- and gives Stripe webhook retries a valid conflict target.
drop index if exists public.luxor_payments_processor_reference_unique_idx;
alter table public.luxor_payments
  drop constraint if exists luxor_payments_processor_reference_unique;
alter table public.luxor_payments
  add constraint luxor_payments_processor_reference_unique
  unique (processor, processor_reference);

notify pgrst, 'reload schema';
