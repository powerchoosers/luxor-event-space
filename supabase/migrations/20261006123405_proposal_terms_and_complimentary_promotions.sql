-- Extend reusable promotion terms. Existing proposal snapshots are untouched.
alter table public.luxor_promotions
  add column if not exists expires_on date,
  add column if not exists complimentary_item text,
  add column if not exists complimentary_scope text,
  add column if not exists complimentary_item_id text;

alter table public.luxor_promotions drop constraint luxor_promotions_discount_type_check;
alter table public.luxor_promotions add constraint luxor_promotions_discount_type_check
  check (discount_type in ('percent', 'fixed', 'complimentary'));
alter table public.luxor_promotions add constraint luxor_promotions_complimentary_terms_check
  check (discount_type <> 'complimentary' or (
    complimentary_item is not null and char_length(trim(complimentary_item)) between 1 and 120
    and complimentary_scope is not null and complimentary_scope in ('luxor', 'vendor')
    and value > 0
  ));

-- Only the live catalog gets the new default. No invoice, booking, signature,
-- payment record, or pricing snapshot is rewritten.
update public.luxor_proposal_pricing
set config = jsonb_set(config, '{luxor_costs,booking_payment}', '{"amount":500}'::jsonb, true),
    version = version + 1,
    updated_at = now()
where is_default = true
  and config->>'pricing_mode' = 'venue_plus_preferred_vendor_estimates'
  and not (config->'luxor_costs' ? 'booking_payment');
