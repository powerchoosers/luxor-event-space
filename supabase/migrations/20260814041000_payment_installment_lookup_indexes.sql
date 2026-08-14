-- Payment-plan v2: cover the installment foreign keys used by owner views,
-- payment reconciliation, and booking close-out. Additive and idempotent.
create index if not exists luxor_payment_installments_booking_idx
  on public.luxor_payment_installments (booking_id);

create index if not exists luxor_payment_installments_invoice_idx
  on public.luxor_payment_installments (invoice_id)
  where invoice_id is not null;

create index if not exists luxor_payment_installments_inquiry_idx
  on public.luxor_payment_installments (inquiry_id)
  where inquiry_id is not null;

notify pgrst, 'reload schema';
