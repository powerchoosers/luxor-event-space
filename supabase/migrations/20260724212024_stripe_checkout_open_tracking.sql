alter table public.luxor_invoices
  add column if not exists stripe_checkout_opened_at timestamptz;

comment on column public.luxor_invoices.stripe_checkout_opened_at is
  'First time the client continued from the proposal into Stripe Checkout.';

notify pgrst, 'reload schema';
