-- Additive only: legacy bills retain their existing values and an unknown
-- amount state until an owner confirms them. No historical matching is run.
alter table public.luxor_bills
  add column if not exists vendor_id uuid references public.luxor_vendors(id) on delete restrict,
  add column if not exists amount_state text,
  add column if not exists vendor_link_method text;

alter table public.luxor_bills add constraint luxor_bills_amount_state_check
  check (amount_state is null or amount_state in ('known', 'unknown', 'variable'));
alter table public.luxor_bills add constraint luxor_bills_vendor_link_method_check
  check (vendor_link_method is null or vendor_link_method in ('owner', 'matched'));

create index if not exists luxor_bills_vendor_id_idx on public.luxor_bills(vendor_id) where vendor_id is not null;
create index if not exists luxor_bills_owner_sender_idx on public.luxor_bills(source_sender)
  where source_type = 'email' and vendor_link_method = 'owner';

-- Concurrent requests cannot create two identically named service-company rows.
-- Deployment must check for existing duplicates before applying this index.
create unique index if not exists luxor_service_company_name_unique_idx
  on public.luxor_vendors (lower(btrim(name))) where vendor_type = 'Service Company';

comment on column public.luxor_bills.amount_state is
  'Known, unknown, or variable. NULL means legacy/unconfirmed; do not infer that a zero is confirmed.';

-- Serialize matching and insertion within one transaction, including distinct
-- attachments delivered at the same time. Existing rows are never rewritten.
create or replace function public.luxor_insert_intake_bill(p_bill jsonb, p_intake_id uuid, p_attempt integer)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  candidate public.luxor_bills;
  existing public.luxor_bills;
  inserted public.luxor_bills;
  claim public.luxor_bill_intakes;
  provider_key text;
  invoice_key text;
begin
  candidate := jsonb_populate_record(null::public.luxor_bills, p_bill);
  select * into claim from public.luxor_bill_intakes where id = p_intake_id for update;
  if not found or claim.status <> 'processing' or claim.attempts <> p_attempt or claim.lease_until is null or claim.lease_until <= clock_timestamp() or claim.attachment_id <> candidate.source_attachment_id then
    raise exception 'Intake claim expired or changed';
  end if;
  if candidate.source_sha256 is null or candidate.source_attachment_id is null then
    raise exception 'Intake source is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('luxor-bill-sha:' || candidate.source_sha256, 0));
  provider_key := lower(regexp_replace(btrim(coalesce(candidate.provider, '')), '\s+', ' ', 'g'));
  invoice_key := lower(regexp_replace(btrim(coalesce(candidate.invoice_number, '')), '\s+', ' ', 'g'));
  if provider_key <> '' and invoice_key <> '' then
    perform pg_advisory_xact_lock(hashtextextended('luxor-bill-invoice:' || provider_key || ':' || invoice_key, 0));
  end if;
  select * into existing from public.luxor_bills
    where source_attachment_id = candidate.source_attachment_id or source_sha256 = candidate.source_sha256
    order by created_at asc limit 1;
  if found then return jsonb_build_object('bill', to_jsonb(existing), 'duplicate', true); end if;
  if provider_key <> '' and invoice_key <> '' then
    select * into existing from public.luxor_bills where
      lower(regexp_replace(btrim(provider), '\s+', ' ', 'g')) = provider_key and
      lower(regexp_replace(btrim(invoice_number), '\s+', ' ', 'g')) = invoice_key
      order by created_at asc limit 1;
    if found then
      candidate.duplicate_of_bill_id := existing.id;
      candidate.extraction_status := 'needs_review';
      candidate.payment_ready_at := null;
      candidate.review_notes := 'Another document has the same provider and invoice number. Compare both before paying.';
    end if;
  end if;
  insert into public.luxor_bills (
    service, frequency, provider, amount, status, due_date, vendor_id, amount_state, vendor_link_method,
    source_type, source_message_id, source_attachment_id, source_filename, source_content_type, source_sha256,
    source_sender, source_recipient, source_subject, received_at, invoice_number, issue_date,
    billing_period_start, billing_period_end, currency, line_items, extraction_status, extraction_confidence,
    extraction_model, extraction_schema_version, extraction_summary, extracted_fields, evidence, arithmetic_status, payment_ready_at, duplicate_of_bill_id, review_notes
  ) values (
    candidate.service, candidate.frequency, candidate.provider, candidate.amount, candidate.status, candidate.due_date, candidate.vendor_id, candidate.amount_state, candidate.vendor_link_method,
    candidate.source_type, candidate.source_message_id, candidate.source_attachment_id, candidate.source_filename, candidate.source_content_type, candidate.source_sha256,
    candidate.source_sender, candidate.source_recipient, candidate.source_subject, candidate.received_at, candidate.invoice_number, candidate.issue_date,
    candidate.billing_period_start, candidate.billing_period_end, candidate.currency, candidate.line_items, candidate.extraction_status, candidate.extraction_confidence,
    candidate.extraction_model, candidate.extraction_schema_version, candidate.extraction_summary, candidate.extracted_fields, candidate.evidence, candidate.arithmetic_status, candidate.payment_ready_at, candidate.duplicate_of_bill_id, candidate.review_notes
  ) returning * into inserted;
  return jsonb_build_object('bill', to_jsonb(inserted), 'duplicate', false);
end $$;
revoke all on function public.luxor_insert_intake_bill(jsonb,uuid,integer) from public, anon, authenticated;
grant execute on function public.luxor_insert_intake_bill(jsonb,uuid,integer) to service_role;

create or replace function public.luxor_link_bill_company(p_bill_id uuid, p_expected_updated_at timestamptz, p_vendor_id uuid, p_name text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare b public.luxor_bills; v public.luxor_vendors; clean_name text;
begin
  select * into b from public.luxor_bills where id = p_bill_id for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then raise exception 'Bill changed. Reload and try again.'; end if;
  if b.status = 'paid' then raise exception 'Paid bills cannot be changed without a correction workflow.'; end if;
  if p_vendor_id is not null then
    select * into v from public.luxor_vendors where id = p_vendor_id;
    if not found then raise exception 'Company not found.'; end if;
  else
    clean_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
    if length(clean_name) = 0 or length(clean_name) > 200 then raise exception 'Enter a company name.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('luxor-company:' || lower(clean_name), 0));
    if exists (select 1 from public.luxor_vendors where lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(clean_name)) then raise exception 'Company already exists. Select it instead.'; end if;
    insert into public.luxor_vendors(name, vendor_type, coi_active) values (clean_name, 'Service Company', false) returning * into v;
  end if;
  update public.luxor_bills set vendor_id = v.id, vendor_link_method = 'owner', extraction_status = 'needs_review', payment_ready_at = null, updated_at = clock_timestamp() where id = b.id returning * into b;
  return jsonb_build_object('bill', to_jsonb(b), 'vendor', to_jsonb(v));
end $$;
revoke all on function public.luxor_link_bill_company(uuid,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.luxor_link_bill_company(uuid,timestamptz,uuid,text) to service_role;
