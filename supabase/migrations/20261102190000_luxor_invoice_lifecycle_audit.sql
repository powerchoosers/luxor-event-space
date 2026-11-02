create table if not exists public.luxor_financial_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('draft_invoice_deleted', 'invoice_voided', 'payment_received_date_corrected')),
  actor_email text not null check (char_length(actor_email) between 3 and 320),
  invoice_id uuid,
  payment_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  reason text,
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists luxor_financial_audit_invoice_time_idx
  on public.luxor_financial_audit(invoice_id, occurred_at desc);
create index if not exists luxor_financial_audit_payment_time_idx
  on public.luxor_financial_audit(payment_id, occurred_at desc) where payment_id is not null;

alter table public.luxor_payments add column if not exists received_date date;

alter table public.luxor_financial_audit enable row level security;
revoke all on public.luxor_financial_audit from public, anon, authenticated, service_role;
grant select, insert on public.luxor_financial_audit to service_role;

create or replace function public.luxor_reject_financial_audit_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Financial audit history is append-only.' using errcode = '42501';
end;
$$;
drop trigger if exists luxor_financial_audit_append_only on public.luxor_financial_audit;
create trigger luxor_financial_audit_append_only
before update or delete on public.luxor_financial_audit
for each row execute function public.luxor_reject_financial_audit_mutation();

-- Email records hold invoice links in JSON rather than foreign keys. Serialize
-- those writers against delete/void and reject new linked work after cancellation.
create or replace function public.luxor_guard_invoice_reference_json()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  invoice_ref text;
  invoice_status text;
  reference_keys text[] := array['invoice_id', 'deposit_invoice_id', 'master_invoice_id', 'proposal_invoice_id'];
begin
  for invoice_ref in
    select distinct lower(coalesce(new.metadata ->> key, ''))
    from unnest(reference_keys) as key
    where nullif(btrim(new.metadata ->> key), '') is not null
    order by 1
  loop
    if invoice_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Email record has an invalid invoice reference.' using errcode = '23514';
    end if;
    select i.status into invoice_status
      from public.luxor_invoices i where lower(i.id::text) = invoice_ref for key share;
    if not found then
      raise exception 'Email record references an invoice that no longer exists.' using errcode = '23503';
    end if;
    if invoice_status = 'cancelled' and new.status in ('queued', 'sending', 'prepared', 'send_unconfirmed') then
      raise exception 'Email work cannot be created or resumed for a voided invoice.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists luxor_email_jobs_invoice_reference_guard on public.luxor_email_jobs;
create trigger luxor_email_jobs_invoice_reference_guard
before insert or update of metadata, status on public.luxor_email_jobs
for each row execute function public.luxor_guard_invoice_reference_json();

drop trigger if exists luxor_mail_messages_invoice_reference_guard on public.luxor_mail_messages;
create trigger luxor_mail_messages_invoice_reference_guard
before insert or update of metadata, status on public.luxor_mail_messages
for each row execute function public.luxor_guard_invoice_reference_json();

create or replace function public.luxor_delete_unissued_draft_invoice(
  p_invoice_id uuid,
  p_actor_email text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.luxor_invoices%rowtype;
  storage_paths text[];
begin
  if nullif(btrim(p_actor_email), '') is null then
    raise exception 'An authenticated administrator is required.' using errcode = '42501';
  end if;
  select i.* into invoice from public.luxor_invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if invoice.status is distinct from 'draft'
    or invoice.proposal_sent_at is not null
    or invoice.proposal_first_sent_at is not null
    or invoice.proposal_latest_sent_at is not null
    or invoice.proposal_number is not null
    or invoice.proposal_accepted_at is not null
    or invoice.booking_id is not null
    or invoice.paid_at is not null
    or invoice.payment_requested_at is not null
    or invoice.payment_requested_amount is not null
    or invoice.stripe_checkout_session_id is not null
    or invoice.stripe_checkout_url is not null
    or invoice.price_locked_at is not null
    or invoice.proposal_context ? 'payment_finalization_attempt' then
    raise exception 'Only never-issued, unpaid draft invoices without payment activity can be deleted.' using errcode = '23514';
  end if;
  if exists (select 1 from public.luxor_payments p where p.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_invoices child where child.parent_invoice_id = invoice.id)
    or exists (select 1 from public.luxor_proposal_send_attempts a where a.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_payment_installments pi where pi.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_payment_installments pi where invoice.booking_id is not null and pi.booking_id = invoice.booking_id)
    or exists (select 1 from public.luxor_bookings b where b.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_invoices prior where prior.supersedes_invoice_id = invoice.id)
    or exists (select 1 from public.luxor_proposal_activity a where a.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_same_day_payment_evidence e where e.master_invoice_id = invoice.id)
    or exists (select 1 from public.luxor_approved_proposal_resends r where r.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_text_jobs j where j.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_text_campaign_recipients r where r.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_booking_financials f where f.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_signature_requests s where s.inquiry_id = invoice.inquiry_id) then
    raise exception 'Draft invoice has linked financial records and must be preserved.' using errcode = '23514';
  end if;
  if exists (select 1 from public.luxor_email_jobs j where
      lower(coalesce(j.metadata ->> 'invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'deposit_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'master_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'proposal_invoice_id', '')) = lower(invoice.id::text))
    or exists (select 1 from public.luxor_mail_messages m where
      lower(coalesce(m.metadata ->> 'invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'deposit_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'master_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'proposal_invoice_id', '')) = lower(invoice.id::text)) then
    raise exception 'Draft invoice has linked mailbox history and must be preserved.' using errcode = '23514';
  end if;

  select coalesce(array_agg(d.storage_path order by d.storage_path), array[]::text[])
    into storage_paths from public.luxor_documents d where d.invoice_id = invoice.id;
  insert into public.luxor_financial_audit(action, actor_email, invoice_id, occurred_at, before_state, details)
  values ('draft_invoice_deleted', lower(btrim(p_actor_email)), invoice.id, clock_timestamp(),
    jsonb_build_object('status', invoice.status, 'invoice_kind', invoice.invoice_kind, 'total', invoice.total,
      'created_at', invoice.created_at, 'proposal_sent_at', invoice.proposal_sent_at),
    jsonb_build_object('document_storage_paths', to_jsonb(storage_paths)));
  delete from public.luxor_documents d where d.invoice_id = invoice.id;
  delete from public.luxor_invoices i where i.id = invoice.id;
  return jsonb_build_object('deleted', true, 'storage_paths', to_jsonb(storage_paths));
end;
$$;

create or replace function public.luxor_void_unpaid_sent_invoice(
  p_invoice_id uuid,
  p_actor_email text,
  p_reason text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  invoice public.luxor_invoices%rowtype;
  changed public.luxor_invoices%rowtype;
  clean_reason text := left(btrim(coalesce(p_reason, '')), 1000);
begin
  if nullif(btrim(p_actor_email), '') is null then
    raise exception 'An authenticated administrator is required.' using errcode = '42501';
  end if;
  if char_length(clean_reason) < 8 then
    raise exception 'Enter a reason of at least 8 characters.' using errcode = '22023';
  end if;
  select i.* into invoice from public.luxor_invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode = 'P0002'; end if;
  if invoice.status not in ('sent', 'overdue') or invoice.proposal_sent_at is null
    or invoice.proposal_accepted_at is not null or invoice.booking_id is not null or invoice.paid_at is not null
    or invoice.payment_requested_at is not null or invoice.stripe_checkout_session_id is not null
    or invoice.stripe_checkout_url is not null then
    raise exception 'Only unpaid, unaccepted sent invoices without a payment request can be voided.' using errcode = '23514';
  end if;
  if exists (select 1 from public.luxor_payments p where p.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_invoices child where child.parent_invoice_id = invoice.id)
    or exists (select 1 from public.luxor_proposal_send_attempts a where a.invoice_id = invoice.id and a.state in ('preparing', 'sending', 'delivery_unconfirmed'))
    or exists (select 1 from public.luxor_payment_installments pi where pi.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_bookings b where b.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_booking_financials f where f.invoice_id = invoice.id)
    or exists (select 1 from public.luxor_same_day_payment_evidence e where e.master_invoice_id = invoice.id)
    or exists (select 1 from public.luxor_text_jobs j where j.invoice_id = invoice.id and j.status in ('queued', 'sending'))
    or exists (select 1 from public.luxor_text_campaign_recipients r where r.invoice_id = invoice.id and r.status in ('queued', 'sending'))
    or exists (select 1 from public.luxor_email_jobs j where j.status in ('queued', 'sending') and (
      lower(coalesce(j.metadata ->> 'invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'deposit_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'master_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(j.metadata ->> 'proposal_invoice_id', '')) = lower(invoice.id::text)))
    or exists (select 1 from public.luxor_mail_messages m where m.status in ('prepared', 'sending', 'send_unconfirmed') and (
      lower(coalesce(m.metadata ->> 'invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'deposit_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'master_invoice_id', '')) = lower(invoice.id::text)
      or lower(coalesce(m.metadata ->> 'proposal_invoice_id', '')) = lower(invoice.id::text)))
    or exists (select 1 from public.luxor_signature_requests s where s.inquiry_id = invoice.inquiry_id and s.status not in ('expired', 'cancelled')) then
    raise exception 'Invoice has linked financial records and must be reconciled before voiding.' using errcode = '23514';
  end if;
  update public.luxor_invoices i set status = 'cancelled', updated_at = clock_timestamp()
    where i.id = invoice.id and i.status in ('sent', 'overdue') returning i.* into changed;
  if not found then raise exception 'Invoice changed while it was being voided.' using errcode = '40001'; end if;
  insert into public.luxor_financial_audit(action, actor_email, invoice_id, occurred_at, reason, before_state, after_state)
  values ('invoice_voided', lower(btrim(p_actor_email)), invoice.id, clock_timestamp(), clean_reason,
    jsonb_build_object('status', invoice.status, 'due_date', invoice.due_date, 'total', invoice.total,
      'proposal_sent_at', invoice.proposal_sent_at),
    jsonb_build_object('status', changed.status, 'due_date', changed.due_date, 'total', changed.total));
  return jsonb_build_object('voided', true, 'invoice_id', changed.id, 'status', changed.status);
end;
$$;

create or replace function public.luxor_correct_manual_payment_received_date(
  p_payment_id uuid,
  p_new_received_date date,
  p_expected_received_date date,
  p_actor_email text,
  p_reason text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  payment public.luxor_payments%rowtype;
  prior_received_date date;
begin
  if nullif(btrim(p_actor_email), '') is null then
    raise exception 'An authenticated administrator is required.' using errcode = '42501';
  end if;
  if p_new_received_date is null or p_new_received_date > (clock_timestamp() at time zone 'America/Chicago')::date then
    raise exception 'Received date must be a valid date that is not in the future.' using errcode = '22023';
  end if;
  if char_length(left(btrim(coalesce(p_reason, '')), 1000)) < 8 then
    raise exception 'Enter a reason of at least 8 characters.' using errcode = '22023';
  end if;
  select p.* into payment from public.luxor_payments p where p.id = p_payment_id for update;
  if not found then raise exception 'Payment record not found.' using errcode = 'P0002'; end if;
  if payment.status is distinct from 'paid' or payment.processor is distinct from 'manual'
    or payment.paid_at is null then
    raise exception 'Only confirmed paid manual receipts can have their received date corrected.' using errcode = '23514';
  end if;
  prior_received_date := coalesce(payment.received_date, (payment.paid_at at time zone 'America/Chicago')::date);
  if p_expected_received_date is distinct from prior_received_date then
    raise exception 'Payment received date changed since this correction form was opened.' using errcode = '40001';
  end if;
  if prior_received_date = p_new_received_date then
    return jsonb_build_object('changed', false, 'payment_id', payment.id, 'received_date', prior_received_date, 'paid_at', payment.paid_at, 'created_at', payment.created_at);
  end if;
  update public.luxor_payments p set received_date = p_new_received_date, updated_at = clock_timestamp()
    where p.id = payment.id and p.status = 'paid' and p.processor = 'manual' returning p.* into payment;
  if not found then raise exception 'Payment changed while received date was being corrected.' using errcode = '40001'; end if;

  insert into public.luxor_financial_audit(action, actor_email, invoice_id, payment_id, occurred_at, reason, before_state, after_state, details)
  values ('payment_received_date_corrected', lower(btrim(p_actor_email)), payment.invoice_id, payment.id,
    clock_timestamp(), left(btrim(p_reason), 1000),
    jsonb_build_object('received_date', prior_received_date, 'paid_at', payment.paid_at, 'created_at', payment.created_at, 'status', payment.status),
    jsonb_build_object('received_date', p_new_received_date, 'paid_at', payment.paid_at, 'created_at', payment.created_at, 'status', payment.status),
    jsonb_build_object('timestamp_preserved', true, 'signed_installment_schedule_changed', false));
  return jsonb_build_object('changed', true, 'payment_id', payment.id, 'received_date', p_new_received_date, 'paid_at', payment.paid_at, 'created_at', payment.created_at);
end;
$$;

revoke all on function public.luxor_reject_financial_audit_mutation() from public, anon, authenticated;
revoke all on function public.luxor_guard_invoice_reference_json() from public, anon, authenticated;
revoke all on function public.luxor_delete_unissued_draft_invoice(uuid, text) from public, anon, authenticated;
revoke all on function public.luxor_void_unpaid_sent_invoice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.luxor_correct_manual_payment_received_date(uuid, date, date, text, text) from public, anon, authenticated;
grant execute on function public.luxor_delete_unissued_draft_invoice(uuid, text) to service_role;
grant execute on function public.luxor_guard_invoice_reference_json() to service_role;
grant execute on function public.luxor_void_unpaid_sent_invoice(uuid, text, text) to service_role;
grant execute on function public.luxor_correct_manual_payment_received_date(uuid, date, date, text, text) to service_role;

notify pgrst, 'reload schema';
