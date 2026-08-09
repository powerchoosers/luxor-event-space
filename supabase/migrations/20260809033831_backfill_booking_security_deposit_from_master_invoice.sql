-- The original backfill covered child invoices linked by booking_id. Some
-- legacy bookings link their master event invoice through booking.invoice_id
-- instead, so preserve any historical refundable-security-deposit amount found
-- in either location.
update public.luxor_bookings booking
set security_deposit_amount = source.amount
from (
  select booking_source.id as booking_id,
    max(coalesce(item.total, item."unitPrice" * coalesce(item.quantity, 1), 0)) as amount
  from public.luxor_bookings booking_source
  join public.luxor_invoices invoice
    on invoice.booking_id = booking_source.id
    or invoice.id = booking_source.invoice_id
  cross join lateral jsonb_to_recordset(coalesce(invoice.line_items, '[]'::jsonb))
    as item(description text, category text, total numeric, "unitPrice" numeric, quantity numeric)
  where item.category = 'Security Deposit'
    or item.description ilike '%refundable security deposit%'
  group by booking_source.id
) source
where source.booking_id = booking.id
  and source.amount is not null;

notify pgrst, 'reload schema';
