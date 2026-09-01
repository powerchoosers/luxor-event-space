-- Vendor bills received through the private invoices mailbox are extracted into
-- a reviewable payables ledger. Portal routes remain the only browser boundary.
alter table public.luxor_bills
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_message_id uuid references public.luxor_mail_messages(id) on delete set null,
  add column if not exists source_attachment_id uuid references public.luxor_mail_attachments(id) on delete set null,
  add column if not exists source_filename text,
  add column if not exists source_content_type text,
  add column if not exists source_sha256 text,
  add column if not exists source_sender text,
  add column if not exists source_recipient text,
  add column if not exists source_subject text,
  add column if not exists received_at timestamptz,
  add column if not exists invoice_number text,
  add column if not exists issue_date date,
  add column if not exists billing_period_start date,
  add column if not exists billing_period_end date,
  add column if not exists currency text not null default 'USD',
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists extraction_status text not null default 'ready',
  add column if not exists extraction_confidence numeric(4,3),
  add column if not exists extraction_model text,
  add column if not exists extraction_schema_version text,
  add column if not exists extraction_summary text,
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists arithmetic_status text not null default 'not_checked',
  add column if not exists duplicate_of_bill_id uuid references public.luxor_bills(id) on delete set null,
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists payment_ready_at timestamptz;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_source_type_check
    check (source_type in ('manual','email'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_extraction_status_check
    check (extraction_status in ('pending','processing','needs_review','ready','failed','duplicate'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_extraction_confidence_check
    check (extraction_confidence is null or extraction_confidence between 0 and 1);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_arithmetic_status_check
    check (arithmetic_status in ('balanced','mismatch','not_checkable','not_checked'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_line_items_array_check
    check (jsonb_typeof(line_items) = 'array');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.luxor_bills add constraint luxor_bills_evidence_array_check
    check (jsonb_typeof(evidence) = 'array');
exception when duplicate_object then null; end $$;

create unique index if not exists luxor_bills_source_attachment_unique_idx
  on public.luxor_bills(source_attachment_id) where source_attachment_id is not null;
create index if not exists luxor_bills_extraction_status_idx
  on public.luxor_bills(extraction_status, due_date, created_at desc);
create index if not exists luxor_bills_source_sha256_idx
  on public.luxor_bills(source_sha256) where source_sha256 is not null;

create table if not exists public.luxor_bill_intakes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.luxor_mail_messages(id) on delete cascade,
  attachment_id uuid not null references public.luxor_mail_attachments(id) on delete cascade,
  bill_id uuid references public.luxor_bills(id) on delete set null,
  duplicate_of_bill_id uuid references public.luxor_bills(id) on delete set null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  sha256 text,
  sender_address text not null,
  recipient_address text not null,
  subject text not null,
  received_at timestamptz not null,
  status text not null default 'received'
    check (status in ('received','processing','needs_review','ready','duplicate','failed','ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  last_error_message text,
  extraction_model text,
  extraction_schema_version text,
  extraction_confidence numeric(4,3)
    check (extraction_confidence is null or extraction_confidence between 0 and 1),
  extracted_data jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  arithmetic_status text not null default 'not_checked'
    check (arithmetic_status in ('balanced','mismatch','not_checkable','not_checked')),
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attachment_id)
);

create index if not exists luxor_bill_intakes_queue_idx
  on public.luxor_bill_intakes(status, next_attempt_at, created_at)
  where status in ('received','failed');
create index if not exists luxor_bill_intakes_message_idx
  on public.luxor_bill_intakes(message_id, created_at);
create index if not exists luxor_bill_intakes_sha256_idx
  on public.luxor_bill_intakes(sha256) where sha256 is not null;

alter table public.luxor_bill_intakes enable row level security;
revoke all on public.luxor_bill_intakes from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_bill_intakes to service_role;

comment on table public.luxor_bill_intakes is
  'Server-only queue and provenance record for vendor bills received through invoices@luxoratlaspalmas.com.';
comment on column public.luxor_bills.extracted_fields is
  'Versioned candidate facts from document extraction; code and owner review determine authoritative bill fields.';
