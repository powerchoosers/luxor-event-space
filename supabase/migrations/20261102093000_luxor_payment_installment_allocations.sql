-- Add an append-only transaction-to-obligation ledger for manual installment
-- receipts. No historical payment or installment rows are backfilled.
create table if not exists public.luxor_payment_installment_allocations (
  payment_id uuid not null references public.luxor_payments(id) on delete restrict,
  installment_id uuid not null references public.luxor_payment_installments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0 and amount = round(amount, 2)),
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (payment_id, installment_id)
);

create index if not exists luxor_payment_installment_allocations_installment_idx
  on public.luxor_payment_installment_allocations (installment_id, created_at);

alter table public.luxor_payment_installment_allocations enable row level security;
revoke all on table public.luxor_payment_installment_allocations from public, anon, authenticated;
grant select, insert on table public.luxor_payment_installment_allocations to service_role;

create unique index if not exists luxor_payments_installment_entry_key_uidx
  on public.luxor_payments ((metadata->>'installment_entry_key'))
  where metadata ? 'installment_entry_key';

create or replace function public.luxor_record_manual_installment_payment(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_booking_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_actor_email text,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_booking public.luxor_bookings%rowtype;
  v_master public.luxor_invoices%rowtype;
  v_invoice public.luxor_invoices%rowtype;
  v_payment public.luxor_payments%rowtype;
  v_allocation jsonb;
  v_installment public.luxor_payment_installments%rowtype;
  v_allocated numeric(12,2);
  v_balance numeric(12,2);
  v_existing numeric(12,2);
  v_existing_metadata_allocated numeric(12,2);
  v_legacy_paid numeric(12,2);
  v_legacy_baseline numeric(12,2);
  v_count integer := 0;
  v_distinct_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_replayed boolean := false;
begin
  if p_idempotency_key is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid installment payment identity.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or p_paid_at is null or p_paid_at > now()
    or p_payment_method is null or p_payment_method not in ('Cash', 'Zelle', 'Check', 'ACH')
    or p_actor_email is null or length(trim(p_actor_email)) = 0
    or p_booking_id is null or p_invoice_id is null or p_allocations is null
    or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Invalid manual installment payment details.' using errcode = '22023';
  end if;

  -- Serialize retries using the same client request key before looking for an
  -- existing payment, so concurrent duplicate requests replay instead of
  -- racing into the unique index.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  -- Match the lock used by the existing payment-claim trigger. This serializes
  -- installment entries with legacy final-balance/manual/Stripe ledger writes.
  perform pg_advisory_xact_lock(2147483000,400);
  select * into v_payment from public.luxor_payments
    where metadata->>'installment_entry_key' = p_idempotency_key::text for update;
  if found then
    if v_payment.metadata->>'installment_entry_fingerprint' <> p_request_fingerprint then
      raise exception 'This payment request key was already used with different details.' using errcode = '23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('installment_id', a.installment_id, 'amount', a.amount)), '[]'::jsonb)
      into v_rows from public.luxor_payment_installment_allocations a where a.payment_id = v_payment.id;
    return jsonb_build_object('payment', to_jsonb(v_payment), 'allocations', v_rows, 'replayed', true);
  end if;

  select * into v_booking from public.luxor_bookings where id = p_booking_id for update;
  if not found or v_booking.contract_status <> 'signed' or v_booking.status in ('cancelled', 'completed') then
    raise exception 'A signed, active booking is required for an installment payment.' using errcode = '23514';
  end if;
  if v_booking.inquiry_id is not null then
    perform 1 from public.luxor_inquiries where id = v_booking.inquiry_id and status = 'closed_lost' for update;
    if found then raise exception 'Archived bookings cannot receive new payments.' using errcode = '23514'; end if;
  end if;

  select * into v_master from public.luxor_invoices where id = v_booking.invoice_id for update;
  select * into v_invoice from public.luxor_invoices
    where id = p_invoice_id and booking_id = p_booking_id and invoice_kind = 'final_balance'
      and parent_invoice_id = v_master.id for update;
  if not found or v_master.id is null or v_master.status = 'cancelled' or v_invoice.status = 'cancelled' then
    raise exception 'The approved final-balance invoice for this booking is unavailable.' using errcode = '23514';
  end if;
  if v_invoice.stripe_checkout_session_id is not null then
    raise exception 'An active Stripe checkout must be reconciled before recording installment funds.' using errcode = '23514';
  end if;

  select count(*), count(distinct (item->>'installment_id')::uuid), round(sum((item->>'amount')::numeric), 2)
    into v_count, v_distinct_count, v_allocated
    from jsonb_array_elements(p_allocations) as allocation_rows(item);
  if v_count <> v_distinct_count or v_allocated <> p_amount then
    raise exception 'Allocation rows must be unique and sum to the received amount.' using errcode = '23514';
  end if;

  -- Lock each selected obligation in stable ID order, then check the ledger
  -- balance while those locks prevent competing manual allocations.
  for v_installment in
    select i.* from public.luxor_payment_installments i
    join (select distinct (item->>'installment_id')::uuid as id from jsonb_array_elements(p_allocations) as allocation_rows(item)) requested
      on requested.id = i.id
    where i.booking_id = p_booking_id and (i.invoice_id is null or i.invoice_id = v_master.id)
    order by i.id for update of i
  loop
    select item into v_allocation from jsonb_array_elements(p_allocations) as allocation_rows(item)
      where (item->>'installment_id')::uuid = v_installment.id limit 1;
    if v_installment.status = 'void' or v_installment.status = 'paid' then
      raise exception 'A selected installment is no longer payable.' using errcode = '23514';
    end if;
    if coalesce((v_installment.metadata->>'schedule_anchor_policy'), '') = 'first_deposit_paid_at_v1'
      and v_installment.installment_order = 1 then
      raise exception 'The booking payment milestone is not a monthly installment.' using errcode = '23514';
    end if;
    if coalesce((v_allocation->>'amount')::numeric, 0) <= 0
      or (v_allocation->>'amount')::numeric <> round((v_allocation->>'amount')::numeric, 2) then
      raise exception 'Each obligation allocation must be a positive cent amount.' using errcode = '22023';
    end if;
    select coalesce(sum(a.amount), 0) into v_existing
      from public.luxor_payment_installment_allocations a
      join public.luxor_payments p on p.id = a.payment_id and p.status = 'paid'
      where a.installment_id = v_installment.id;
    select coalesce(sum((allocation->>'amount')::numeric), 0) into v_existing_metadata_allocated
      from public.luxor_payments p
      cross join lateral jsonb_array_elements(case
        when jsonb_typeof(p.metadata->'installment_allocations') = 'array' then p.metadata->'installment_allocations'
        else '[]'::jsonb end) as allocation
      where p.status = 'paid' and (allocation->>'installment_id')::uuid = v_installment.id;
    v_existing := greatest(v_existing, v_existing_metadata_allocated);
    if v_installment.status = 'partial'
      and v_existing = 0
      and coalesce(v_installment.metadata->>'paid_amount', '') !~ '^\d+(\.\d{1,2})?$' then
      raise exception 'An earlier partial installment amount needs reconciliation before another payment.' using errcode = '23514';
    end if;
    if coalesce(v_installment.metadata->>'installment_allocation_legacy_baseline', '') ~ '^\d+(\.\d{1,2})?$' then
      v_legacy_baseline := (v_installment.metadata->>'installment_allocation_legacy_baseline')::numeric;
    else
      v_legacy_paid := case when coalesce(v_installment.metadata->>'paid_amount', '') ~ '^\d+(\.\d{1,2})?$'
        then (v_installment.metadata->>'paid_amount')::numeric else 0 end;
      -- Legacy paid_amount may already include receipts whose allocation is
      -- represented in either ledger. Freeze only its unreconciled remainder.
      v_legacy_baseline := greatest(0, v_legacy_paid - v_existing);
      update public.luxor_payment_installments set
        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{installment_allocation_legacy_baseline}', to_jsonb(v_legacy_baseline), true),
        updated_at = now()
        where id = v_installment.id;
      v_installment.metadata := jsonb_set(coalesce(v_installment.metadata, '{}'::jsonb), '{installment_allocation_legacy_baseline}', to_jsonb(v_legacy_baseline), true);
    end if;
    v_existing := v_existing + v_legacy_baseline;
    if v_existing + (v_allocation->>'amount')::numeric > v_installment.amount then
      raise exception 'The allocation exceeds the selected installment balance.' using errcode = '23514';
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'installment_id', v_installment.id, 'installment_order', v_installment.installment_order,
      'label', v_installment.label, 'amount', (v_allocation->>'amount')::numeric
    ));
  end loop;
  if v_count <> jsonb_array_length(v_rows) then
    raise exception 'One or more selected installments do not belong to this booking.' using errcode = '23514';
  end if;

  select round(v_invoice.total - coalesce(sum(amount), 0), 2) into v_balance
    from public.luxor_payments where invoice_id = v_invoice.id and status = 'paid';
  if p_amount > coalesce(v_balance, v_invoice.total) then
    raise exception 'The received amount exceeds the remaining final-balance invoice.' using errcode = '23514';
  end if;

  insert into public.luxor_payments (
    inquiry_id, booking_id, invoice_id, amount, status, payment_method, paid_at,
    processor, processor_reference, notes, metadata
  ) values (
    v_booking.inquiry_id, v_booking.id, v_invoice.id, p_amount, 'paid', p_payment_method, p_paid_at,
    'manual', nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    jsonb_build_object(
      'payment_kind', 'installment', 'manual_entry', true, 'recorded_by', p_actor_email,
      'installment_entry_key', p_idempotency_key::text, 'installment_entry_fingerprint', p_request_fingerprint,
      'installment_allocations', v_rows
    )
  ) returning * into v_payment;

  for v_allocation in select value from jsonb_array_elements(v_rows) as allocation_rows(value)
  loop
    insert into public.luxor_payment_installment_allocations (payment_id, installment_id, amount)
      values (v_payment.id, (v_allocation->>'installment_id')::uuid, (v_allocation->>'amount')::numeric);
    select * into v_installment from public.luxor_payment_installments
      where id = (v_allocation->>'installment_id')::uuid for update;
    select coalesce(sum(a.amount), 0) into v_existing
      from public.luxor_payment_installment_allocations a
      join public.luxor_payments p on p.id = a.payment_id and p.status = 'paid'
      where a.installment_id = v_installment.id;
    select coalesce(sum((allocation->>'amount')::numeric), 0) into v_existing_metadata_allocated
      from public.luxor_payments p
      cross join lateral jsonb_array_elements(case
        when jsonb_typeof(p.metadata->'installment_allocations') = 'array' then p.metadata->'installment_allocations'
        else '[]'::jsonb end) as allocation
      where p.status = 'paid' and (allocation->>'installment_id')::uuid = v_installment.id;
    v_existing := greatest(v_existing, v_existing_metadata_allocated);
    v_legacy_baseline := case when coalesce(v_installment.metadata->>'installment_allocation_legacy_baseline', '') ~ '^\d+(\.\d{1,2})?$'
      then (v_installment.metadata->>'installment_allocation_legacy_baseline')::numeric else 0 end;
    v_existing := v_existing + v_legacy_baseline;
    update public.luxor_payment_installments set
      status = case when v_existing >= amount then 'paid' else 'partial' end,
      payment_method = p_payment_method,
      reference = nullif(trim(p_reference), ''),
      paid_at = case when v_existing >= amount then p_paid_at else null end,
      updated_at = now()
    where id = v_installment.id;
  end loop;

  select round(v_invoice.total - coalesce(sum(amount), 0), 2) into v_balance
    from public.luxor_payments where invoice_id = v_invoice.id and status = 'paid';
  if coalesce(v_balance, v_invoice.total) <= 0 then
    update public.luxor_invoices set status = 'paid', paid_at = p_paid_at, updated_at = now()
      where id = v_invoice.id and status <> 'cancelled';
  end if;

  return jsonb_build_object('payment', to_jsonb(v_payment), 'allocations', v_rows, 'replayed', v_replayed);
end;
$$;

create or replace function public.luxor_lookup_manual_installment_payment_replay(
  p_idempotency_key uuid,
  p_request_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.luxor_payments%rowtype;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_idempotency_key is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid installment payment identity.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into v_payment from public.luxor_payments
    where metadata->>'installment_entry_key' = p_idempotency_key::text for update;
  if not found then return jsonb_build_object('payment', null, 'allocations', '[]'::jsonb, 'replayed', false); end if;
  if v_payment.metadata->>'installment_entry_fingerprint' <> p_request_fingerprint then
    raise exception 'This payment request key was already used with different details.' using errcode = '23505';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('installment_id', a.installment_id, 'amount', a.amount)), '[]'::jsonb)
    into v_rows from public.luxor_payment_installment_allocations a where a.payment_id = v_payment.id;
  if v_rows = '[]'::jsonb then
    v_rows := coalesce(v_payment.metadata->'installment_allocations', '[]'::jsonb);
  end if;
  return jsonb_build_object('payment', to_jsonb(v_payment), 'allocations', v_rows, 'replayed', true);
end;
$$;

revoke all on function public.luxor_lookup_manual_installment_payment_replay(uuid,text)
  from public, anon, authenticated;
grant execute on function public.luxor_lookup_manual_installment_payment_replay(uuid,text)
  to service_role;

revoke all on function public.luxor_record_manual_installment_payment(uuid,text,uuid,uuid,numeric,timestamptz,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.luxor_record_manual_installment_payment(uuid,text,uuid,uuid,numeric,timestamptz,text,text,text,text,jsonb)
  to service_role;

comment on table public.luxor_payment_installment_allocations is
  'Explicit cents-precise allocations from confirmed paid payment transactions to event payment installments.';

-- Existing manual final-payment and Stripe webhook paths insert directly into
-- luxor_payments. Enforce the final-invoice cap at the shared ledger boundary
-- so those paths cannot race a newly allocated installment payment into an
-- overpaid ledger. The existing guard takes the same advisory lock first; the
-- installment RPC also takes it before locking booking/invoice rows.
create or replace function public.luxor_guard_final_balance_payment_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.luxor_invoices;
  v_paid numeric(12,2);
begin
  if new.status <> 'paid' or new.invoice_id is null then return new; end if;
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.amount is not distinct from old.amount
    and new.invoice_id is not distinct from old.invoice_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(2147483000,400);
  select * into v_invoice from public.luxor_invoices where id = new.invoice_id for update;
  if not found or v_invoice.invoice_kind <> 'final_balance' then return new; end if;

  if tg_op = 'UPDATE' then
    select coalesce(sum(p.amount),0) into v_paid from public.luxor_payments p
      where p.invoice_id = new.invoice_id and p.status = 'paid' and p.id <> old.id;
  else
    select coalesce(sum(p.amount),0) into v_paid from public.luxor_payments p
      where p.invoice_id = new.invoice_id and p.status = 'paid';
  end if;
  if v_paid + new.amount > v_invoice.total then
    raise exception 'The payment exceeds the remaining final-balance invoice.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_final_balance_payment_total_guard on public.luxor_payments;
create trigger luxor_final_balance_payment_total_guard
  before insert or update on public.luxor_payments
  for each row execute function public.luxor_guard_final_balance_payment_total();
revoke all on function public.luxor_guard_final_balance_payment_total() from public, anon, authenticated;
notify pgrst, 'reload schema';
