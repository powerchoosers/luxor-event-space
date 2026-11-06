-- Owner-confirmed bill category. Suggestions stay in extracted_fields and do
-- not become expenses or alter historical records.
alter table public.luxor_bills add column if not exists bill_category text;
alter table public.luxor_bills add constraint luxor_bills_bill_category_check
  check (bill_category is null or bill_category in ('Rent', 'Maintenance', 'Utilities', 'Supplies', 'Marketing'));
