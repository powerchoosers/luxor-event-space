-- Correct only receipts created by the manual installment workflow. Keep the
-- receipt and allocation as history, and serialize with all payment writers.
create table public.luxor_manual_payment_corrections (
  payment_id uuid primary key references public.luxor_payments(id) on delete restrict,
  installment_id uuid not null references public.luxor_payment_installments(id) on delete restrict,
  booking_id uuid not null references public.luxor_bookings(id) on delete restrict,
  invoice_id uuid not null references public.luxor_invoices(id) on delete restrict,
  actor_email text not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  payment_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.luxor_manual_payment_corrections enable row level security;
revoke all on public.luxor_manual_payment_corrections from public, anon, authenticated;
grant select, insert on public.luxor_manual_payment_corrections to service_role;

-- Serialize receipt queueing and claiming with corrections. A receipt that has
-- already been queued needs human review instead of silently being invalidated.
create function public.luxor_guard_corrected_receipt_notice() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare receipt_key text;
begin
  if new.job_type <> 'transactional_notice' or new.metadata #>> '{transactionalNotice,kind}' is distinct from 'payment_receipt'
    or new.status not in ('queued','sending') then return new; end if;
  receipt_key := new.metadata #>> '{transactionalNotice,key}';
  if receipt_key !~ '^payment_receipt/[0-9a-fA-F-]{36}$' then raise exception 'Receipt notice identity requires review.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  if not exists(select 1 from public.luxor_payments where id=substring(receipt_key from 17)::uuid and status='paid') then
    raise exception 'A receipt cannot be sent for a corrected payment.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.luxor_guard_corrected_receipt_notice() from public, anon, authenticated;
create trigger luxor_corrected_receipt_notice_guard before insert or update on public.luxor_email_jobs
for each row execute function public.luxor_guard_corrected_receipt_notice();

create function public.luxor_correct_manual_installment_payment(
  p_payment_id uuid, p_installment_id uuid, p_expected_updated_at timestamptz,
  p_actor_email text, p_reason text
) returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  payment public.luxor_payments%rowtype;
  booking public.luxor_bookings%rowtype;
  invoice public.luxor_invoices%rowtype;
  installment public.luxor_payment_installments%rowtype;
  allocated numeric;
  remaining_credit numeric;
  balance numeric;
  last_paid_at timestamptz;
begin
  if p_payment_id is null or p_installment_id is null or p_expected_updated_at is null
    or length(trim(coalesce(p_actor_email,''))) = 0 or length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'A payment, current version, and reason are required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(2147483000,400);
  select * into payment from public.luxor_payments where id=p_payment_id;
  if not found then raise exception 'Payment not found.' using errcode='23514'; end if;
  select * into booking from public.luxor_bookings where id=payment.booking_id for update;
  if not found then raise exception 'Booking not found.' using errcode='23514'; end if;
  select * into invoice from public.luxor_invoices where id=payment.invoice_id for update;
  if not found or invoice.booking_id is distinct from booking.id or invoice.invoice_kind <> 'final_balance'
    or invoice.parent_invoice_id is distinct from booking.invoice_id or invoice.status not in ('sent','paid')
    or invoice.stripe_checkout_session_id is not null then
    raise exception 'The final invoice needs review before correcting this payment.' using errcode='23514';
  end if;
  select * into installment from public.luxor_payment_installments where id=p_installment_id for update;
  select * into payment from public.luxor_payments where id=p_payment_id for update;
  if payment.status <> 'paid' or payment.updated_at is distinct from p_expected_updated_at
    or payment.processor is distinct from 'manual' or payment.metadata->>'manual_entry' is distinct from 'true'
    or not (payment.metadata ? 'installment_entry_key') or installment.booking_id is distinct from booking.id
    or installment.invoice_id is distinct from booking.invoice_id or installment.status not in ('partial','paid') then
    raise exception 'Payment changed or cannot be corrected here. Refresh and review it.' using errcode='40001';
  end if;
  if exists(select 1 from public.luxor_email_jobs where job_type='transactional_notice' and metadata #>> '{transactionalNotice,kind}'='payment_receipt' and metadata #>> '{transactionalNotice,key}'='payment_receipt/' || payment.id::text) then
    raise exception 'A receipt email exists; review it before correcting this payment.' using errcode='23514';
  end if;
  if exists(select 1 from public.luxor_payment_refunds where source_payment_id=payment.id)
    or (select count(*) from public.luxor_payment_installment_allocations where payment_id=payment.id) <> 1
    or not exists(select 1 from public.luxor_payment_installment_allocations where payment_id=payment.id and installment_id=installment.id and amount=payment.amount)
    or jsonb_typeof(payment.metadata->'installment_allocations') is distinct from 'array'
    or jsonb_array_length(payment.metadata->'installment_allocations') <> 1
    or payment.metadata->'installment_allocations'->0->>'installment_id' <> installment.id::text
    or (payment.metadata->'installment_allocations'->0->>'amount')::numeric <> payment.amount then
    raise exception 'This payment has allocations or refunds that require review.' using errcode='23514';
  end if;
  if coalesce(installment.metadata->>'installment_allocation_legacy_baseline','') !~ '^0+(\.0{1,2})?$' then
    raise exception 'This installment has a legacy balance that requires review.' using errcode='23514';
  end if;
  select coalesce(sum(a.amount),0) into allocated from public.luxor_payment_installment_allocations a
    join public.luxor_payments p on p.id=a.payment_id and p.status='paid' where a.installment_id=installment.id;
  if (select count(*) from public.luxor_payment_installment_allocations a join public.luxor_payments p on p.id=a.payment_id and p.status='paid' where a.installment_id=installment.id) <> 1 then
    raise exception 'Multiple receipts require manual reconciliation.' using errcode='23514';
  end if;
  if allocated > installment.amount or (installment.status='paid' and allocated <> installment.amount)
    or (installment.status='partial' and (allocated <= 0 or allocated >= installment.amount)) then
    raise exception 'The saved installment and its allocations disagree.' using errcode='23514';
  end if;
  insert into public.luxor_manual_payment_corrections(payment_id,installment_id,booking_id,invoice_id,actor_email,reason,payment_snapshot)
    values(payment.id,installment.id,booking.id,invoice.id,lower(trim(p_actor_email)),trim(p_reason),to_jsonb(payment));
  update public.luxor_payments set status='void', metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('manual_correction',true) where id=payment.id;
  remaining_credit := allocated-payment.amount;
  select max(p.paid_at) into last_paid_at from public.luxor_payment_installment_allocations a
    join public.luxor_payments p on p.id=a.payment_id and p.status='paid' where a.installment_id=installment.id;
  update public.luxor_payment_installments set
    status=case when remaining_credit=0 then 'scheduled' when remaining_credit>=amount then 'paid' else 'partial' end,
    paid_at=case when remaining_credit>=amount then last_paid_at else null end,
    payment_method=case when remaining_credit=0 then null else payment_method end,
    reference=case when remaining_credit=0 then null else reference end,
    metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{paid_amount}',to_jsonb(remaining_credit),true), updated_at=now()
    where id=installment.id;
  select invoice.total-coalesce(sum(amount),0) into balance from public.luxor_payments where invoice_id=invoice.id and status='paid';
  if balance>0 and invoice.status='paid' then update public.luxor_invoices set status='sent', paid_at=null, updated_at=now() where id=invoice.id; end if;
  return jsonb_build_object('payment_id',payment.id,'corrected',true);
end $$;
revoke all on function public.luxor_correct_manual_installment_payment(uuid,uuid,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.luxor_correct_manual_installment_payment(uuid,uuid,timestamptz,text,text) to service_role;
