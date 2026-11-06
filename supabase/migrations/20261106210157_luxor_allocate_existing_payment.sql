-- Draft for review. No historical rows are changed by installing this function.
-- Called only by a server-authorized workflow for a specific existing receipt.
create or replace function public.luxor_allocate_existing_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  p public.luxor_payments%rowtype;
  b public.luxor_bookings%rowtype;
  m public.luxor_invoices%rowtype;
  f public.luxor_invoices%rowtype;
  i public.luxor_payment_installments%rowtype;
  q public.luxor_payments%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_meta jsonb;
  v_existing numeric;
  v_baseline numeric;
  v_total numeric := 0;
  v_credit numeric;
  v_remaining numeric;
  v_schedule_total numeric;
  v_reason text;
  v_booking_id uuid;
  v_event_amount numeric;
  v_security_amount numeric;
  v_seed_booking boolean := false;
  v_contract numeric;
begin
  if p_payment_id is null then
    return jsonb_build_object('status', 'review', 'reason', 'missing_payment_id', 'unapplied_amount', null);
  end if;
  -- Same lock and lock order as the manual installment RPC and ledger guard.
  perform pg_advisory_xact_lock(2147483000, 400);
  -- Discover only the lock target, then take booking before payment, matching
  -- the refund reservation RPC. Re-read and verify linkage under both locks.
  select booking_id into v_booking_id from public.luxor_payments where id = p_payment_id;
  if not found or v_booking_id is null then
    return jsonb_build_object('status', 'review', 'reason', 'payment_or_booking_not_found', 'unapplied_amount', null);
  end if;
  -- Other existing writers can hold booking/invoice locks before acquiring
  -- the shared advisory lock. NOWAIT prevents a lock-order cycle; the caller
  -- retains its pending receipt and retries on lock_not_available.
  select * into b from public.luxor_bookings where id = v_booking_id for update nowait;
  if not found then
    return jsonb_build_object('status', 'review', 'reason', 'booking_not_found', 'unapplied_amount', null);
  end if;
  select * into p from public.luxor_payments where id = p_payment_id for update nowait;
  if not found then
    return jsonb_build_object('status', 'review', 'reason', 'payment_not_found', 'unapplied_amount', null);
  end if;
  if p.status <> 'paid' or p.amount is null or p.amount <= 0 or p.amount <> round(p.amount, 2)
    or p.paid_at is null or p.paid_at > now() or p.booking_id is distinct from v_booking_id or p.invoice_id is null then
    return jsonb_build_object('status', 'review', 'reason', 'invalid_receipt', 'unapplied_amount', null);
  end if;
  select coalesce(sum(amount), 0) into v_total from public.luxor_payment_installment_allocations where payment_id = p.id;
  v_remaining := greatest(0, p.amount - v_total);
  if b.status <> 'confirmed' or b.contract_status <> 'signed' or b.contract_signed_at is null
    or p.paid_at < b.contract_signed_at or b.invoice_id is null
    or p.inquiry_id is distinct from b.inquiry_id then
    return jsonb_build_object('status', 'review', 'reason', 'booking_or_client_mismatch', 'unapplied_amount', v_remaining);
  end if;
  if b.inquiry_id is not null and exists (select 1 from public.luxor_inquiries where id = b.inquiry_id and status = 'closed_lost') then
    return jsonb_build_object('status', 'review', 'reason', 'archived_inquiry', 'unapplied_amount', v_remaining);
  end if;
  select * into m from public.luxor_invoices where id = b.invoice_id for update nowait;
  select * into f from public.luxor_invoices where id = p.invoice_id for update nowait;
  if m.id is null or f.id is null or m.booking_id is distinct from b.id
    or m.inquiry_id is distinct from b.inquiry_id or m.invoice_kind is distinct from 'event'
    or m.parent_invoice_id is not null or m.proposal_accepted_at is null
    or m.status in ('draft', 'cancelled') or m.offer_status = 'withdrawn'
    or f.booking_id is distinct from b.id or f.inquiry_id is distinct from b.inquiry_id
    or not coalesce((f.invoice_kind in ('deposit', 'final_balance') and f.parent_invoice_id = m.id)
      or (f.invoice_kind = 'event' and f.id = m.id), false)
    or f.status in ('draft', 'cancelled') or f.total is null or f.total <= 0
    or m.total is null or m.total <= 0
    or (f.invoice_kind = 'final_balance' and (select count(*) from public.luxor_invoices x where x.booking_id = b.id and x.invoice_kind = 'final_balance' and x.parent_invoice_id = m.id and x.status <> 'cancelled') <> 1)
    or exists (select 1 from public.luxor_invoices x where x.supersedes_invoice_id = m.id and x.proposal_accepted_at is not null and x.status not in ('draft', 'cancelled') and coalesce(x.offer_status, '') <> 'withdrawn')
    or exists (select 1 from public.luxor_invoices x where x.booking_id = b.id and x.invoice_kind = 'event' and x.id <> m.id and x.parent_invoice_id is null and x.proposal_accepted_at is not null and x.status not in ('draft', 'cancelled') and coalesce(x.offer_status, '') <> 'withdrawn' and not exists (select 1 from public.luxor_invoices y where y.id = m.id and y.supersedes_invoice_id = x.id)) then
    return jsonb_build_object('status', 'review', 'reason', 'invoice_linkage_or_master_ambiguous', 'unapplied_amount', v_remaining);
  end if;
  -- Mixed receipts need a saved transaction-specific split; invoice totals or
  -- names alone do not prove how a partial receipt was divided.
  if coalesce(p.metadata->>'payment_kind', '') not in ('final', 'installment', 'deposit', 'full')
    or coalesce(p.metadata->>'deposit_receipt_review', 'false') = 'true'
    or exists (select 1 from public.luxor_payment_refunds r where r.booking_id = b.id and r.refund_kind <> 'security_deposit' and r.status in ('pending', 'uncertain', 'succeeded')) then
    return jsonb_build_object('status', 'review', 'reason', 'payment_or_refund_classification', 'unapplied_amount', v_remaining);
  end if;
  if f.invoice_kind = 'final_balance' and jsonb_typeof(f.line_items) = 'array' and f.line_items <> '[]'::jsonb and coalesce(f.line_items::text, '') !~* 'security[ _-]+deposit'
    and not (p.metadata ? 'refundable_security_deposit' or p.metadata ? 'security_deposit_amount') then
    v_event_amount := p.amount;
  elsif coalesce(p.metadata->>'initial_booking_payment', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$'
    and coalesce(p.metadata->>'refundable_security_deposit', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$' then
    v_event_amount := (p.metadata->>'initial_booking_payment')::numeric;
    v_security_amount := (p.metadata->>'refundable_security_deposit')::numeric;
    if v_event_amount + v_security_amount <> p.amount then
      return jsonb_build_object('status', 'review', 'reason', 'receipt_split_disagrees', 'unapplied_amount', null);
    end if;
  elsif coalesce(p.metadata->>'allocated_event_amount', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$'
    and (p.metadata->>'allocated_event_amount')::numeric <= p.amount then
    v_event_amount := (p.metadata->>'allocated_event_amount')::numeric;
  elsif jsonb_typeof(f.line_items) = 'array' and f.line_items <> '[]'::jsonb and coalesce(f.line_items::text, '') !~* 'security[ _-]+deposit' and f.invoice_kind in ('deposit', 'event')
    and not (p.metadata ? 'refundable_security_deposit' or p.metadata ? 'security_deposit_amount') then
    v_event_amount := p.amount;
  else
    return jsonb_build_object('status', 'review', 'reason', 'receipt_split_missing', 'unapplied_amount', null);
  end if;
  if v_event_amount <= 0 or v_total > v_event_amount then
    return jsonb_build_object('status', 'review', 'reason', 'event_amount_or_allocation_invalid', 'unapplied_amount', null);
  end if;
  v_remaining := v_event_amount - v_total;
  if jsonb_typeof(m.line_items) is distinct from 'array' or exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(m.line_items) = 'array' then m.line_items else '[]'::jsonb end) item
    where (item->>'paymentBucket' = 'security_deposit' or item->>'category' = 'Security Deposit'
      or coalesce(item->>'description', '') ~* 'refundable\s+security\s+deposit')
      and coalesce(item->>'total', '') !~ '^([0-9]+)(\.[0-9]{1,2})?$') then
    return jsonb_build_object('status', 'review', 'reason', 'contract_security_amount_unknown', 'unapplied_amount', v_remaining);
  end if;
  if m.proposal_context->>'payment_collection_scope' = 'luxor_services_only' then
    if coalesce(m.proposal_context->>'luxor_services_total', '') !~ '^([0-9]+)(\.[0-9]{1,2})?$' then
      return jsonb_build_object('status', 'review', 'reason', 'contract_scope_amount_unknown', 'unapplied_amount', v_remaining);
    end if;
    v_contract := (m.proposal_context->>'luxor_services_total')::numeric;
  else
    select m.total - coalesce(sum((item->>'total')::numeric), 0) into v_contract
      from jsonb_array_elements(m.line_items) item
      where item->>'paymentBucket' = 'security_deposit' or item->>'category' = 'Security Deposit'
        or coalesce(item->>'description', '') ~* 'refundable\s+security\s+deposit';
  end if;
  if v_contract <= 0 then return jsonb_build_object('status', 'review', 'reason', 'event_contract_amount_invalid', 'unapplied_amount', v_remaining); end if;
  if (select coalesce(sum(amount), 0) from public.luxor_payments where invoice_id = f.id and status = 'paid') > f.total then
    return jsonb_build_object('status', 'review', 'reason', 'invoice_overpaid', 'unapplied_amount', v_remaining);
  end if;
  if exists (select 1 from public.luxor_payment_installment_allocations a
    join public.luxor_payment_installments x on x.id = a.installment_id
    join public.luxor_payments y on y.id = a.payment_id
    left join public.luxor_invoices yi on yi.id = y.invoice_id
    where x.booking_id = b.id and (y.status <> 'paid' or y.booking_id is distinct from b.id
      or yi.booking_id is distinct from b.id or (yi.id is distinct from m.id and yi.parent_invoice_id is distinct from m.id))) then
    return jsonb_build_object('status', 'review', 'reason', 'allocation_payment_link_disagrees', 'unapplied_amount', v_remaining);
  end if;
  -- Lock the complete saved schedule before inspecting it. Missing dates,
  -- alternate invoice links and security rows make the schedule ambiguous.
  perform id from public.luxor_payment_installments where booking_id = b.id order by id for update nowait;
  if exists (select 1 from public.luxor_payment_installments x where x.booking_id = b.id and x.status <> 'void' and coalesce(x.metadata->>'payment_bucket', '') <> 'security_deposit'
    and (x.invoice_id is distinct from m.id or x.inquiry_id is distinct from b.inquiry_id or x.due_at is null
      or x.amount is null or x.amount <= 0)) then
    return jsonb_build_object('status', 'review', 'reason', 'schedule_ambiguous', 'unapplied_amount', v_remaining);
  end if;
  select sum(x.amount) into v_schedule_total from public.luxor_payment_installments x
    where x.booking_id = b.id and x.status <> 'void' and coalesce(x.metadata->>'payment_bucket', '') <> 'security_deposit';
  if v_schedule_total is null or v_schedule_total > v_contract then
    return jsonb_build_object('status', 'review', 'reason', 'schedule_missing_or_exceeds_contract', 'unapplied_amount', v_remaining);
  end if;
  -- Every allocation representation for this booking must agree per payment.
  -- Metadata-only historical allocations are not silently converted.
  for q in select * from public.luxor_payments where booking_id = b.id and status = 'paid' order by id for update nowait loop
    if q.metadata ? 'installment_allocations' and jsonb_typeof(q.metadata->'installment_allocations') <> 'array' then
      v_reason := 'invalid_allocation_metadata'; exit;
    end if;
    v_meta := coalesce(q.metadata->'installment_allocations', '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(v_meta) e where jsonb_typeof(e) <> 'object'
      or coalesce(e->>'installment_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(e->>'amount', '') !~ '^([0-9]+)(\.[0-9]{1,2})?$') then
      v_reason := 'invalid_allocation_metadata'; exit;
    end if;
    if jsonb_array_length(v_meta) <> (select count(*) from public.luxor_payment_installment_allocations a where a.payment_id = q.id)
      or exists (select 1 from jsonb_array_elements(v_meta) e
        left join public.luxor_payment_installment_allocations a on a.payment_id = q.id and a.installment_id::text = e->>'installment_id'
        where a.installment_id is null or a.amount <> (e->>'amount')::numeric)
      or (select count(distinct e->>'installment_id') from jsonb_array_elements(v_meta) e) <> jsonb_array_length(v_meta)
      or exists (select 1 from public.luxor_payment_installment_allocations a join public.luxor_payment_installments x on x.id = a.installment_id where a.payment_id = q.id and (x.booking_id <> b.id or x.status = 'void'))
      or (select coalesce(sum(a.amount), 0) from public.luxor_payment_installment_allocations a where a.payment_id = q.id) > q.amount then
      v_reason := 'allocation_representations_disagree'; exit;
    end if;
    -- Another unassigned final receipt may already cover this schedule. Do not
    -- decide its order or implicitly backfill it during this request.
    if q.id <> p.id and q.paid_at is null and (q.invoice_id = f.id or q.metadata->>'installment_allocation_status' in ('pending', 'review')) then
      v_reason := 'other_receipt_missing_date'; exit;
    end if;
    if q.id <> p.id and (q.paid_at, q.id) < (p.paid_at, p.id)
      and (q.metadata->>'installment_allocation_status' in ('pending', 'review')
        or (q.invoice_id = f.id and f.invoice_kind = 'final_balance'
          and coalesce(q.metadata->>'installment_auto_allocation_version', '') <> '1'
          and coalesce((select sum(a.amount) from public.luxor_payment_installment_allocations a where a.payment_id = q.id), 0) < q.amount)) then
      v_reason := 'earlier_unassigned_receipt'; exit;
    end if;
  end loop;
  if v_reason is not null then return jsonb_build_object('status', 'review', 'reason', v_reason, 'unapplied_amount', v_remaining); end if;
  select coalesce(sum(amount), 0) into v_total from public.luxor_payment_installment_allocations where payment_id = p.id;
  v_remaining := v_event_amount - v_total;
  -- A replay first rechecks current eligibility; changed circumstances return
  -- review without changing the saved allocation. Otherwise return the
  -- saved result and never spend a prior remainder on a changed schedule.
  if p.metadata->>'installment_auto_allocation_version' = '1' then
    if coalesce(p.metadata->>'installment_unapplied_amount', '') !~ '^([0-9]+)(\.[0-9]{1,2})?$'
      or (p.metadata->>'installment_unapplied_amount')::numeric <> v_remaining then
      return jsonb_build_object('status', 'review', 'reason', 'saved_remainder_disagrees', 'unapplied_amount', v_remaining);
    end if;
    return jsonb_build_object('status', case when v_remaining > 0 then 'unapplied' else 'allocated' end,
      'payment_id', p.id, 'allocations', coalesce(p.metadata->'installment_allocations', '[]'::jsonb),
      'unapplied_amount', v_remaining, 'replayed', true);
  end if;
  -- First pass validates the entire schedule before writing any allocation.
  for i in select * from public.luxor_payment_installments where booking_id = b.id and status <> 'void' and coalesce(metadata->>'payment_bucket', '') <> 'security_deposit'
    order by due_at, id loop
    select coalesce(sum(a.amount), 0) into v_existing from public.luxor_payment_installment_allocations a join public.luxor_payments x on x.id = a.payment_id and x.status = 'paid' where a.installment_id = i.id;
    if coalesce(i.metadata->>'installment_allocation_legacy_baseline', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$' then
      v_baseline := (i.metadata->>'installment_allocation_legacy_baseline')::numeric;
    elsif i.status = 'paid' and v_existing = 0 then
      v_baseline := i.amount;
    elsif i.status = 'partial' and coalesce(i.metadata->>'paid_amount', '') !~ '^([0-9]+)(\.[0-9]{1,2})?$' and v_existing = 0 then
      return jsonb_build_object('status', 'review', 'reason', 'unreconciled_partial_installment', 'unapplied_amount', v_remaining);
    else
      v_baseline := greatest(0, case when coalesce(i.metadata->>'paid_amount', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$' then (i.metadata->>'paid_amount')::numeric else 0 end - v_existing);
    end if;
    if v_existing + v_baseline > i.amount or (i.status = 'paid' and v_existing + v_baseline <> i.amount)
      or (i.status = 'partial' and (v_existing + v_baseline <= 0 or v_existing + v_baseline >= i.amount)) then
      return jsonb_build_object('status', 'review', 'reason', 'installment_balance_disagrees', 'unapplied_amount', v_remaining);
    end if;
    -- The schedule creator marks the deposit-anchored booking row paid before
    -- this allocator runs. Only bind that credit to this receipt when the
    -- saved anchor, paid timestamp, and unique deposit receipt all agree.
    if f.invoice_kind = 'deposit' and i.installment_order = 1 and lower(trim(i.label)) = 'booking payment'
      and i.status = 'paid' and v_existing = 0 and i.metadata->>'schedule_anchor_policy' = 'first_deposit_paid_at_v1'
      and not (i.metadata ? 'installment_allocation_legacy_baseline' or i.metadata ? 'paid_amount')
      and i.paid_at = p.paid_at and pg_input_is_valid(b.metadata->>'deposit_paid_at', 'timestamp with time zone')
      and (b.metadata->>'deposit_paid_at')::timestamptz = p.paid_at
      and (select count(*) from public.luxor_payments x join public.luxor_invoices xi on xi.id = x.invoice_id
        where x.booking_id = b.id and x.status = 'paid' and xi.invoice_kind = 'deposit' and x.paid_at = p.paid_at) = 1 then
      if v_remaining < i.amount then
        return jsonb_build_object('status', 'review', 'reason', 'booking_credit_exceeds_receipt', 'unapplied_amount', v_remaining);
      end if;
      if exists (select 1 from public.luxor_payment_installments x where x.booking_id = b.id and x.status <> 'void'
        and coalesce(x.metadata->>'payment_bucket', '') <> 'security_deposit' and (x.due_at, x.id) < (i.due_at, i.id)) then
        return jsonb_build_object('status', 'review', 'reason', 'booking_credit_order_disagrees', 'unapplied_amount', v_remaining);
      end if;
      v_seed_booking := true;
    end if;
    if f.invoice_kind in ('deposit', 'event') and i.installment_order = 1 and lower(trim(i.label)) = 'booking payment'
      and i.status = 'paid' and v_existing = 0 and not v_seed_booking then
      return jsonb_build_object('status', 'review', 'reason', 'booking_credit_source_ambiguous', 'unapplied_amount', v_remaining);
    end if;
    if v_remaining > 0 and v_existing + v_baseline < i.amount
      and exists (select 1 from public.luxor_payment_installment_allocations where payment_id = p.id and installment_id = i.id) then
      return jsonb_build_object('status', 'review', 'reason', 'explicit_partial_allocation', 'unapplied_amount', v_remaining);
    end if;
  end loop;
  v_rows := coalesce(p.metadata->'installment_allocations', '[]'::jsonb);
  for i in select * from public.luxor_payment_installments where booking_id = b.id and status <> 'void' and coalesce(metadata->>'payment_bucket', '') <> 'security_deposit'
    order by due_at, id loop
    exit when v_remaining <= 0;
    -- Never alter an explicit allocation from this payment.
    if exists (select 1 from public.luxor_payment_installment_allocations where payment_id = p.id and installment_id = i.id) then continue; end if;
    select coalesce(sum(a.amount), 0) into v_existing from public.luxor_payment_installment_allocations a join public.luxor_payments x on x.id = a.payment_id and x.status = 'paid' where a.installment_id = i.id;
    v_baseline := case when coalesce(i.metadata->>'installment_allocation_legacy_baseline', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$' then (i.metadata->>'installment_allocation_legacy_baseline')::numeric
      when i.status = 'paid' and v_existing = 0 then i.amount
      else greatest(0, case when coalesce(i.metadata->>'paid_amount', '') ~ '^([0-9]+)(\.[0-9]{1,2})?$' then (i.metadata->>'paid_amount')::numeric else 0 end - v_existing) end;
    if v_seed_booking and i.installment_order = 1 and lower(trim(i.label)) = 'booking payment' then v_baseline := 0; end if;
    v_credit := least(v_remaining, greatest(0, i.amount - v_existing - v_baseline));
    if v_credit > 0 then
      insert into public.luxor_payment_installment_allocations(payment_id, installment_id, amount) values (p.id, i.id, v_credit);
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('installment_id', i.id, 'installment_order', i.installment_order, 'label', i.label, 'amount', v_credit));
      update public.luxor_payment_installments set status = case when v_existing + v_baseline + v_credit = amount then 'paid' else 'partial' end,
        paid_at = case when v_existing + v_baseline + v_credit = amount then p.paid_at else null end,
        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{installment_allocation_legacy_baseline}', to_jsonb(v_baseline), true), updated_at = now() where id = i.id;
      v_remaining := v_remaining - v_credit;
    end if;
  end loop;
  update public.luxor_payments set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('installment_allocations', v_rows, 'installment_unapplied_amount', v_remaining, 'installment_auto_allocation_version', 1) where id = p.id;
  return jsonb_build_object('status', case when v_remaining > 0 then 'unapplied' else 'allocated' end,
    'payment_id', p.id, 'allocations', v_rows, 'unapplied_amount', v_remaining);
end;
$$;

revoke all on function public.luxor_allocate_existing_payment(uuid) from public, anon, authenticated;
grant execute on function public.luxor_allocate_existing_payment(uuid) to service_role;
notify pgrst, 'reload schema';

-- Synthetic review cases (not executed by this migration):
-- 1. $150 receipt; due rows $100 and $100: credits $100/$50, remainder $0.
-- 2. $250 receipt; two $100 rows: credits $100/$100, remainder $50.
-- 3. Explicit $25 on a partly unpaid row with $75 unassigned: review;
--    do not overwrite the explicit row or skip it to credit a later row.
-- 4. Repeat case 2 after a valid schedule change: return the saved $50
--    remainder without inserting another allocation; an invalid or canceled
--    obligation returns review, still without changing allocations.
-- 5. Simultaneous calls for one receipt serialize on the shared lock; only
--    the first inserts and the second returns the saved replay result.
-- 6. Canceled/unsigned booking, conflicting inquiry/invoice, missing due date,
--    an earlier unassigned receipt, inconsistent metadata/table, event refund,
--    mixed security deposit, or unexplained partial status: review, no writes.
-- 7. Rescheduled dates determine order at first application; ties use row ID.
