alter table public.luxor_invoices
  add column if not exists original_subtotal numeric(12, 2),
  add column if not exists original_total numeric(12, 2),
  add column if not exists discount_percent numeric(5, 2) not null default 0,
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists offer_status text not null default 'active',
  add column if not exists offer_redeemed_at timestamptz,
  add column if not exists stripe_coupon_id text,
  add column if not exists stripe_promotion_code_id text;

update public.luxor_invoices
set
  original_subtotal = coalesce(original_subtotal, subtotal),
  original_total = coalesce(original_total, total),
  discount_percent = coalesce(discount_percent, 0),
  discount_amount = coalesce(discount_amount, 0),
  offer_status = coalesce(offer_status, 'active')
where original_subtotal is null
   or original_total is null
   or discount_percent is null
   or discount_amount is null
   or offer_status is null;

alter table public.luxor_invoices
  drop constraint if exists luxor_invoices_discount_percent_check;

alter table public.luxor_invoices
  add constraint luxor_invoices_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);

alter table public.luxor_invoices
  drop constraint if exists luxor_invoices_offer_status_check;

alter table public.luxor_invoices
  add constraint luxor_invoices_offer_status_check
  check (offer_status in ('active', 'redeemed', 'expired', 'withdrawn'));

create index if not exists luxor_invoices_open_offer_expiry_idx
  on public.luxor_invoices (offer_expires_at)
  where offer_status = 'active' and offer_expires_at is not null;

comment on column public.luxor_invoices.original_total is
  'Quoted total before a limited-time offer. The existing total column is the actual amount due after any offer.';

comment on column public.luxor_invoices.offer_expires_at is
  'Exact timestamp at which this proposal or discounted offer stops being available.';

notify pgrst, 'reload schema';
