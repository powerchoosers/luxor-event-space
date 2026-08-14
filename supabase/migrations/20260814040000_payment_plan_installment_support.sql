-- Payment-plan v2: separate the refundable security deposit from event payments.
-- This migration is additive and leaves all existing invoice rows unchanged.
alter table public.luxor_invoices
  drop constraint if exists luxor_invoices_invoice_kind_check;

alter table public.luxor_invoices
  add constraint luxor_invoices_invoice_kind_check
  check (invoice_kind in ('event', 'deposit', 'final_balance', 'security_deposit'));

create index if not exists luxor_invoices_security_deposit_due_idx
  on public.luxor_invoices (booking_id, due_date)
  where invoice_kind = 'security_deposit' and status <> 'paid';

notify pgrst, 'reload schema';
