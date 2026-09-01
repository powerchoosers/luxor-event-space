-- Preserve where an AI bill intake originated and cap automatic retries.
alter table public.luxor_bills
  drop constraint if exists luxor_bills_source_type_check;

alter table public.luxor_bills
  add constraint luxor_bills_source_type_check
  check (source_type in ('manual', 'email', 'portal_upload'));

alter table public.luxor_bill_intakes
  add column if not exists source_type text not null default 'email',
  add column if not exists max_attempts integer not null default 5;

alter table public.luxor_bill_intakes
  drop constraint if exists luxor_bill_intakes_source_type_check;

alter table public.luxor_bill_intakes
  add constraint luxor_bill_intakes_source_type_check
  check (source_type in ('email', 'portal_upload'));

alter table public.luxor_bill_intakes
  add constraint luxor_bill_intakes_max_attempts_check
  check (max_attempts between 1 and 20);

comment on column public.luxor_bill_intakes.source_type is
  'Origin of the intake: an invoice mailbox email or a portal upload.';
