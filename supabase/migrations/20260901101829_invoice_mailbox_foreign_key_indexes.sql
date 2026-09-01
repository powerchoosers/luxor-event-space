create index if not exists luxor_bills_source_message_idx
  on public.luxor_bills(source_message_id) where source_message_id is not null;
create index if not exists luxor_bills_duplicate_of_idx
  on public.luxor_bills(duplicate_of_bill_id) where duplicate_of_bill_id is not null;
create index if not exists luxor_bill_intakes_bill_idx
  on public.luxor_bill_intakes(bill_id) where bill_id is not null;
create index if not exists luxor_bill_intakes_duplicate_of_idx
  on public.luxor_bill_intakes(duplicate_of_bill_id) where duplicate_of_bill_id is not null;
