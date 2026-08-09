alter table public.luxor_bookings
  add column if not exists security_deposit_amount numeric(12, 2) not null default 750
  check (security_deposit_amount >= 0);

-- Preserve the agreed amount on older bookings whenever a final invoice already
-- records a refundable security-deposit line. New bookings use the $750 default
-- until the owner enters a different amount.
update public.luxor_bookings booking
set security_deposit_amount = existing_security.amount
from (
  select invoice.booking_id,
    max(coalesce(item.total, item."unitPrice" * coalesce(item.quantity, 1), 0)) as amount
  from public.luxor_invoices invoice
  cross join lateral jsonb_to_recordset(coalesce(invoice.line_items, '[]'::jsonb))
    as item(description text, category text, total numeric, "unitPrice" numeric, quantity numeric)
  where invoice.booking_id is not null
    and (item.category = 'Security Deposit' or item.description ilike '%refundable security deposit%')
  group by invoice.booking_id
) existing_security
where existing_security.booking_id = booking.id
  and existing_security.amount is not null;

comment on column public.luxor_bookings.security_deposit_amount is
  'Refundable security deposit due with the remaining event balance 60 days before the event.';

notify pgrst, 'reload schema';
