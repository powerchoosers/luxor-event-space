-- Extend the manual installment ledger and reconcile provider-originated
-- refunds by Stripe refund identity. The original payment row is immutable.

alter table public.luxor_payment_installments
  drop constraint if exists luxor_payment_installments_payment_method_check;
alter table public.luxor_payment_installments
  add constraint luxor_payment_installments_payment_method_check
  check (payment_method is null or payment_method in ('card', 'cash', 'check', 'Cash', 'Check', 'ACH', 'Zelle', 'Bank Transfer', 'Other'));

alter table public.luxor_payment_refunds
  drop constraint if exists luxor_payment_refunds_refund_kind_check;
alter table public.luxor_payment_refunds
  add constraint luxor_payment_refunds_refund_kind_check
  check (refund_kind in ('security_deposit', 'event_revenue', 'unclassified'));
alter table public.luxor_payment_refunds
  drop constraint if exists luxor_payment_refunds_booking_invoice_kind_unique;
alter table public.luxor_payment_refunds
  alter column booking_id drop not null,
  alter column invoice_id drop not null;

create index if not exists luxor_payment_refunds_booking_kind_status_idx
  on public.luxor_payment_refunds (booking_id, refund_kind, status);
create index if not exists luxor_payments_stripe_payment_intent_idx
  on public.luxor_payments ((metadata->>'payment_intent'))
  where processor = 'stripe' and metadata ? 'payment_intent';

-- Keep the RPC as the sole authority for manual installment receipts while
-- widening its payment-method allowlist in a checked, narrowly scoped edit.
do $$
declare
  v_definition text;
  v_method_check text := 'p_payment_method not in (''Cash'', ''Zelle'', ''Check'', ''ACH'')';
  v_replacement text := 'p_payment_method not in (''Cash'', ''Zelle'', ''Check'', ''ACH'', ''Bank Transfer'', ''Other'')';
  v_other_check text := 'or p_actor_email is null or length(trim(p_actor_email)) = 0';
  v_other_replacement text := 'or (p_payment_method = ''Other'' and nullif(trim(p_notes), '''') is null)' || E'\n    ' || v_other_check;
begin
  select pg_get_functiondef(
    'public.luxor_record_manual_installment_payment(uuid,text,uuid,uuid,numeric,timestamptz,text,text,text,text,jsonb)'::regprocedure
  ) into v_definition;
  if length(v_definition) - length(replace(v_definition, v_method_check, '')) <> length(v_method_check) then
    raise exception 'Manual installment payment method allowlist changed; review this migration.';
  end if;
  if length(v_definition) - length(replace(v_definition, v_other_check, '')) <> length(v_other_check) then
    raise exception 'Manual installment payment validation changed; review this migration.';
  end if;
  v_definition := replace(v_definition, v_method_check, v_replacement);
  v_definition := replace(v_definition, v_other_check, v_other_replacement);
  execute v_definition;
end;
$$;

create or replace function public.luxor_guard_manual_installment_duplicate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (new.metadata ? 'installment_entry_key') then return new; end if;
  perform pg_advisory_xact_lock(2147483000,400);

  -- Stripe identifiers belong to Stripe, even when a caller tries to record
  -- the same reference as a manual payment.
  if nullif(trim(new.processor_reference), '') is not null and exists (
    select 1 from public.luxor_payments p
    where p.processor = 'stripe'
      and (p.processor_reference = new.processor_reference
        or p.metadata->>'payment_intent' = new.processor_reference)
  ) then
    raise exception 'LUXOR_INSTALLMENT_DUPLICATE: Stripe payment reference already exists.' using errcode = '23505';
  end if;

  -- A second request key must not create the same manual receipt twice. A
  -- distinct date, amount, method, note, or reference remains a separate entry.
  if exists (
    select 1 from public.luxor_payments p
    where p.processor = 'manual' and p.status = 'paid'
      and p.booking_id is not distinct from new.booking_id
      and p.invoice_id is not distinct from new.invoice_id
      and p.amount = new.amount
      and p.payment_method is not distinct from new.payment_method
      and ((p.paid_at at time zone 'America/Chicago')::date) = ((new.paid_at at time zone 'America/Chicago')::date)
      and coalesce(p.processor_reference, '') = coalesce(new.processor_reference, '')
      and coalesce(p.notes, '') = coalesce(new.notes, '')
  ) then
    raise exception 'LUXOR_INSTALLMENT_DUPLICATE: Possible duplicate manual payment.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_manual_installment_duplicate_guard on public.luxor_payments;
create trigger luxor_manual_installment_duplicate_guard
  before insert on public.luxor_payments
  for each row execute function public.luxor_guard_manual_installment_duplicate();
revoke all on function public.luxor_guard_manual_installment_duplicate() from public, anon, authenticated;

create or replace function public.luxor_record_external_stripe_refund(
  p_stripe_refund_id text,
  p_payment_intent_id text,
  p_amount numeric,
  p_currency text,
  p_status text,
  p_livemode boolean,
  p_event_id text,
  p_refund_created_at timestamptz,
  p_event_created_at timestamptz,
  p_failure_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.luxor_payments%rowtype;
  v_source_id uuid;
  v_invoice public.luxor_invoices%rowtype;
  v_booking public.luxor_bookings%rowtype;
  v_refund public.luxor_payment_refunds%rowtype;
  v_source_count integer;
  v_existing_refund boolean := false;
  v_source_booking_id uuid;
  v_active_refunds numeric(12,2);
  v_target_status text;
  v_success_at timestamptz;
  v_failure_at timestamptz;
  v_next_metadata jsonb;
  v_refund_kind text := 'unclassified';
  v_review_reason text := 'source_payment_context_unavailable';
  v_event_ids jsonb;
begin
  if p_stripe_refund_id is null or length(trim(p_stripe_refund_id)) < 4
    or p_payment_intent_id is null or length(trim(p_payment_intent_id)) < 4
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or p_currency is distinct from 'usd'
    or p_status is null or p_status not in ('pending', 'succeeded', 'failed', 'uncertain')
    or p_livemode is null or p_event_id is null or length(trim(p_event_id)) < 4
    or p_refund_created_at is null or p_event_created_at is null then
    raise exception 'LUXOR_REFUND_INVALID: Stripe refund details failed validation.' using errcode = '23514';
  end if;

  -- Serialize events for one source payment before checking the cumulative
  -- refund cap, and serialize redeliveries by their Stripe refund ID.
  perform pg_advisory_xact_lock(hashtextextended('stripe-refund-source:' || p_payment_intent_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('stripe-refund-id:' || p_stripe_refund_id, 0));

  -- The request-linked webhook path locks its refund row before the booking.
  -- Lock that same row first when this provider refund is already linked.
  select * into v_refund from public.luxor_payment_refunds r
    where r.processor = 'stripe' and r.processor_refund_id = p_stripe_refund_id
    for update;
  v_existing_refund := found;
  if v_existing_refund then
    v_source_id := v_refund.source_payment_id;
  else
    -- If an owner-requested refund has no provider ID yet, the external event
    -- cannot be linked safely. Wait on that reservation before any booking lock.
    perform 1 from public.luxor_payment_refunds r
      where r.processor = 'stripe' and r.processor_payment_intent_id = p_payment_intent_id
        and r.processor_refund_id is null and r.status in ('pending', 'uncertain')
      for update;
    if found then
      raise exception 'LUXOR_REFUND_LINK: An existing refund request needs its exact Stripe refund ID.' using errcode = '23514';
    end if;
  end if;

  select count(*) into v_source_count from public.luxor_payments p
    where p.processor = 'stripe' and p.status = 'paid'
      and p.metadata->>'payment_intent' = p_payment_intent_id;
  if v_source_count <> 1 then
    raise exception 'LUXOR_REFUND_SOURCE: Exact paid Stripe source payment is missing or ambiguous.' using errcode = '23514';
  end if;
  select * into v_source from public.luxor_payments p
    where p.processor = 'stripe' and p.status = 'paid'
      and p.metadata->>'payment_intent' = p_payment_intent_id
      and (v_source_id is null or p.id = v_source_id);
  if not found then
    raise exception 'LUXOR_REFUND_SOURCE: Exact paid Stripe source payment is missing or ambiguous.' using errcode = '23514';
  end if;
  if v_source_id is not null and v_source.id is distinct from v_source_id then
    raise exception 'LUXOR_REFUND_SOURCE: Stripe refund source does not match its saved request.' using errcode = '23514';
  end if;
  v_source_id := v_source.id;
  v_source_booking_id := v_source.booking_id;

  -- Match the established payment-refund claim lock order: booking first,
  -- then its payment row. This avoids a booking/payment deadlock with claims.
  if v_source.booking_id is not null then
    select * into v_booking from public.luxor_bookings b where b.id = v_source.booking_id for update;
    if not found then
      raise exception 'LUXOR_REFUND_SOURCE: Source booking is unavailable.' using errcode = '23514';
    end if;
  end if;

  -- An owner request may have committed while this event waited for the
  -- booking lock. Recheck without locking the refund row so result webhooks
  -- keep their refund-row-then-booking lock order without a deadlock cycle.
  if exists (
    select 1 from public.luxor_payment_refunds r
    where r.processor = 'stripe' and r.processor_payment_intent_id = p_payment_intent_id
      and r.processor_refund_id is null and r.status in ('pending', 'uncertain')
  ) then
    raise exception 'LUXOR_REFUND_LINK: An existing refund request needs its exact Stripe refund ID.' using errcode = '23514';
  end if;

  select * into v_source from public.luxor_payments p
    where p.id = v_source_id and p.processor = 'stripe' and p.status = 'paid'
      and p.metadata->>'payment_intent' = p_payment_intent_id
    for update;
  if not found or v_source.booking_id is distinct from v_source_booking_id or p_amount > v_source.amount then
    raise exception 'LUXOR_REFUND_SOURCE: Refund exceeds or cannot be linked to its source payment.' using errcode = '23514';
  end if;

  if v_existing_refund then
    if v_refund.source_payment_id is distinct from v_source.id
      or v_refund.booking_id is distinct from v_source.booking_id
      or v_refund.invoice_id is distinct from v_source.invoice_id
      or v_refund.processor_payment_intent_id is distinct from p_payment_intent_id
      or v_refund.amount is distinct from p_amount
      or v_refund.currency is distinct from p_currency
      or v_refund.livemode is distinct from p_livemode then
      raise exception 'LUXOR_REFUND_IDENTITY: Stripe refund identity changed across events.' using errcode = '23505';
    end if;
    v_target_status := v_refund.status;
    if v_refund.status <> 'succeeded' then
      if p_status = 'succeeded' then v_target_status := 'succeeded';
      elsif v_refund.status = 'failed' then v_target_status := 'failed';
      elsif p_status in ('failed', 'uncertain') then v_target_status := p_status;
      end if;
    end if;
    v_event_ids := coalesce(v_refund.metadata->'stripe_event_ids', '[]'::jsonb);
    if not (v_event_ids @> jsonb_build_array(p_event_id)) then
      v_event_ids := v_event_ids || jsonb_build_array(p_event_id);
    end if;
    v_next_metadata := jsonb_set(coalesce(v_refund.metadata, '{}'::jsonb), '{stripe_event_ids}', v_event_ids, true);
    if p_status = 'succeeded' then
      v_success_at := case
        when nullif(v_refund.metadata->>'stripe_succeeded_at', '') is null then p_event_created_at
        else least((v_refund.metadata->>'stripe_succeeded_at')::timestamptz, p_event_created_at)
      end;
      v_next_metadata := jsonb_set(v_next_metadata, '{stripe_succeeded_at}', to_jsonb(v_success_at), true);
    elsif v_target_status = 'succeeded' then
      v_success_at := coalesce(nullif(v_refund.metadata->>'stripe_succeeded_at', '')::timestamptz, v_refund.completed_at);
    end if;
    if p_status = 'failed' then
      v_failure_at := case
        when nullif(v_refund.metadata->>'stripe_failed_at', '') is null then p_event_created_at
        else least((v_refund.metadata->>'stripe_failed_at')::timestamptz, p_event_created_at)
      end;
      v_next_metadata := jsonb_set(v_next_metadata, '{stripe_failed_at}', to_jsonb(v_failure_at), true);
    elsif v_target_status = 'failed' then
      v_failure_at := coalesce(nullif(v_refund.metadata->>'stripe_failed_at', '')::timestamptz, v_refund.completed_at, p_event_created_at);
    end if;
    update public.luxor_payment_refunds r set
      status = v_target_status,
      failure_code = case when v_target_status = 'failed' then coalesce(p_failure_code, r.failure_code) else null end,
      completed_at = case when v_target_status = 'succeeded' then v_success_at when v_target_status = 'failed' then v_failure_at else null end,
      metadata = v_next_metadata,
      updated_at = timezone('utc'::text, now())
    where r.id = v_refund.id returning * into v_refund;
  else
    -- A Stripe refund is one source transaction. Deposits that mix event funds
    -- and a refundable hold remain unclassified until a human can resolve them.
    if v_source.invoice_id is not null then
      select * into v_invoice from public.luxor_invoices i where i.id = v_source.invoice_id;
    end if;
    if v_invoice.id is not null and v_booking.id is not null
      and v_invoice.booking_id = v_booking.id and v_invoice.invoice_kind = 'security_deposit'
      and v_booking.security_deposit_amount is not null
      and round(v_invoice.total, 2) = round(v_booking.security_deposit_amount, 2) then
      v_refund_kind := 'security_deposit';
      v_review_reason := null;
    elsif v_source.metadata ? 'refundable_security_deposit'
      or v_source.metadata ? 'security_deposit_amount'
      or v_source.metadata ? 'initial_booking_payment'
      or v_source.metadata->>'payment_kind' in ('deposit', 'initial_booking_payment') then
      v_review_reason := 'mixed_receipt_requires_review';
    elsif v_invoice.id is not null and v_booking.id is not null
      and v_invoice.booking_id = v_booking.id
      and v_booking.status in ('confirmed', 'completed')
      and v_booking.contract_status = 'signed'
      and v_booking.contract_signed_at is not null
      and v_invoice.status not in ('draft', 'cancelled')
      and ((v_invoice.invoice_kind = 'event' and v_booking.invoice_id = v_invoice.id)
        or (v_invoice.invoice_kind = 'final_balance' and v_invoice.parent_invoice_id = v_booking.invoice_id)) then
      v_refund_kind := 'event_revenue';
      v_review_reason := null;
    elsif v_invoice.invoice_kind = 'deposit' then
      v_review_reason := 'mixed_or_initial_deposit_requires_review';
    elsif v_invoice.invoice_kind = 'security_deposit' then
      v_review_reason := 'security_deposit_invoice_amount_mismatch';
    elsif v_booking.id is null or v_invoice.id is null then
      v_review_reason := 'source_payment_missing_booking_or_invoice';
    else
      v_review_reason := 'booking_or_invoice_not_eligible_for_automatic_classification';
    end if;

    select coalesce(sum(r.amount), 0) into v_active_refunds
      from public.luxor_payment_refunds r
      where r.source_payment_id = v_source.id
        and r.status in ('pending', 'uncertain', 'succeeded');
    if v_active_refunds + (case when p_status in ('pending', 'uncertain', 'succeeded') then p_amount else 0 end) > v_source.amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
    end if;
    if v_refund_kind = 'security_deposit' and exists (
      select 1 from public.luxor_payment_refunds r
      where r.source_payment_id = v_source.id and r.processor_refund_id is null
        and r.status in ('pending', 'uncertain')
    ) then
      raise exception 'LUXOR_REFUND_LINK: An existing security-deposit refund request needs its exact Stripe refund ID.' using errcode = '23514';
    end if;
    if v_refund_kind = 'security_deposit' then
      select coalesce(sum(r.amount), 0) into v_active_refunds
        from public.luxor_payment_refunds r
        where r.booking_id = v_booking.id and r.refund_kind = 'security_deposit'
          and r.status in ('pending', 'uncertain', 'succeeded');
      if v_active_refunds + (case when p_status in ('pending', 'uncertain', 'succeeded') then p_amount else 0 end)
        > v_booking.security_deposit_amount then
        raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
      end if;
    end if;
    insert into public.luxor_payment_refunds (
      source_payment_id, booking_id, invoice_id, inquiry_id, refund_kind, amount, currency, status,
      processor, processor_payment_intent_id, processor_refund_id, idempotency_key,
      requested_by, requested_at, completed_at, failure_code, livemode, metadata
    ) values (
      v_source.id, v_source.booking_id, v_source.invoice_id, v_source.inquiry_id, v_refund_kind, p_amount, p_currency, p_status,
      'stripe', p_payment_intent_id, p_stripe_refund_id, 'stripe-refund:' || p_stripe_refund_id,
      'stripe_webhook', p_refund_created_at,
      case when p_status in ('succeeded', 'failed') then p_event_created_at else null end,
      case when p_status = 'failed' then p_failure_code else null end, p_livemode,
      jsonb_strip_nulls(jsonb_build_object(
        'stripe_event_ids', jsonb_build_array(p_event_id),
        'stripe_succeeded_at', case when p_status = 'succeeded' then p_event_created_at else null end,
        'stripe_failed_at', case when p_status = 'failed' then p_event_created_at else null end,
        'review_reason', v_review_reason,
        'classification_source', case when v_refund_kind = 'unclassified' then null else 'verified_source_invoice_and_booking' end
      ))
    ) returning * into v_refund;
  end if;

  -- Booking security state changes only after the full accepted hold has been
  -- returned. Partial external Stripe refunds never mark it refunded.
  if v_refund.refund_kind = 'security_deposit' and v_refund.status = 'succeeded'
    and v_booking.id is not null and v_booking.security_deposit_amount is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds
      from public.luxor_payment_refunds r
      where r.booking_id = v_booking.id and r.refund_kind = 'security_deposit' and r.status = 'succeeded';
    if v_active_refunds >= v_booking.security_deposit_amount then
      update public.luxor_bookings b set
        security_deposit_status = 'refunded',
        metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
          'security_deposit_refunded_at', coalesce(v_refund.completed_at, p_event_created_at),
          'security_deposit_refund_id', p_stripe_refund_id,
          'security_deposit_refund_amount', v_active_refunds
        ),
        updated_at = timezone('utc'::text, now())
      where b.id = v_booking.id and b.security_deposit_status in ('held', 'refunded');
    end if;
  end if;

  select coalesce(sum(r.amount), 0) into v_active_refunds
    from public.luxor_payment_refunds r
    where r.source_payment_id = v_source.id
      and r.status in ('pending', 'uncertain', 'succeeded');
  if v_active_refunds > v_source.amount then
    raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
  end if;
  if v_refund.refund_kind = 'security_deposit' and v_booking.id is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds
      from public.luxor_payment_refunds r
      where r.booking_id = v_booking.id and r.refund_kind = 'security_deposit'
        and r.status in ('pending', 'uncertain', 'succeeded');
    if v_active_refunds > v_booking.security_deposit_amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
    end if;
  end if;

  return to_jsonb(v_refund);
end;
$$;

-- Keep owner-requested refunds safe after the booking/invoice/kind unique
-- constraint is removed. The booking lock serializes retries, while exact
-- identity checks preserve idempotency and both refund caps span all sources.
create or replace function public.luxor_reserve_payment_refund(
  p_source_payment_id uuid,
  p_booking_id uuid,
  p_invoice_id uuid,
  p_inquiry_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_processor_payment_intent_id text,
  p_requested_by text,
  p_livemode boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.luxor_payments%rowtype;
  v_booking public.luxor_bookings%rowtype;
  v_existing public.luxor_payment_refunds%rowtype;
  v_refund public.luxor_payment_refunds%rowtype;
  v_existing_count integer;
  v_active_refunds numeric(12,2);
  v_request_amount numeric(12,2);
begin
  select * into v_booking from public.luxor_bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found.' using errcode = 'P0002'; end if;

  select * into v_payment from public.luxor_payments p where p.id = p_source_payment_id for update;
  if not found then raise exception 'Source payment not found.' using errcode = 'P0002'; end if;
  if v_payment.processor is distinct from 'stripe' or v_payment.status is distinct from 'paid'
    or v_payment.booking_id is distinct from p_booking_id
    or v_payment.invoice_id is distinct from p_invoice_id
    or v_payment.inquiry_id is distinct from p_inquiry_id
    or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
    or p_amount > v_payment.amount
    or p_idempotency_key is null or length(trim(p_idempotency_key)) < 16
    or p_processor_payment_intent_id is null or length(trim(p_processor_payment_intent_id)) < 4
    or (v_payment.metadata->>'payment_intent' is not null
      and v_payment.metadata->>'payment_intent' is distinct from p_processor_payment_intent_id)
    or p_requested_by is null or p_livemode is null then
    raise exception 'The source payment or refund request failed validation.' using errcode = '23514';
  end if;

  select count(*) into v_existing_count from public.luxor_payment_refunds r
    where r.booking_id = p_booking_id and r.invoice_id = p_invoice_id and r.refund_kind = 'security_deposit';
  if v_existing_count > 1 then
    raise exception 'LUXOR_REFUND_AMBIGUOUS: Multiple security-deposit refunds already exist for this booking invoice.' using errcode = '23505';
  end if;
  if v_existing_count = 1 then
    select * into v_existing from public.luxor_payment_refunds r
      where r.booking_id = p_booking_id and r.invoice_id = p_invoice_id and r.refund_kind = 'security_deposit';
    if v_existing.source_payment_id is distinct from p_source_payment_id
      or v_existing.amount is distinct from p_amount
      or v_existing.idempotency_key is distinct from p_idempotency_key
      or v_existing.processor_payment_intent_id is distinct from p_processor_payment_intent_id
      or v_existing.livemode is distinct from p_livemode then
      raise exception 'A different refund request already exists for this booking invoice.' using errcode = '23505';
    end if;
    v_request_amount := case when v_existing.status in ('pending', 'uncertain', 'succeeded') then v_existing.amount else 0 end;
  else
    v_request_amount := p_amount;
  end if;

  if exists (
    select 1 from public.luxor_payment_refunds r
    where r.source_payment_id = p_source_payment_id and r.processor = 'stripe'
      and r.refund_kind = 'unclassified'
      and r.status in ('pending', 'uncertain', 'succeeded')
      and (v_existing.id is null or r.id <> v_existing.id)
  ) then
    raise exception 'LUXOR_REFUND_REVIEW: An unclassified Stripe refund on this payment must be reconciled before a security-deposit refund.' using errcode = '23514';
  end if;

  select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
    where r.source_payment_id = p_source_payment_id
      and r.status in ('pending', 'uncertain', 'succeeded')
      and (v_existing.id is null or r.id <> v_existing.id);
  if v_active_refunds + v_request_amount > v_payment.amount then
    raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
  end if;

  if v_booking.security_deposit_amount is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
      where r.booking_id = p_booking_id and r.refund_kind = 'security_deposit'
        and r.status in ('pending', 'uncertain', 'succeeded')
        and (v_existing.id is null or r.id <> v_existing.id);
    if v_active_refunds + v_request_amount > v_booking.security_deposit_amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
    end if;
  end if;

  if v_existing.id is not null then
    return to_jsonb(v_existing) || jsonb_build_object('created', false);
  end if;

  insert into public.luxor_payment_refunds (
    source_payment_id, booking_id, invoice_id, inquiry_id, refund_kind, amount,
    idempotency_key, processor_payment_intent_id, requested_by, livemode
  ) values (
    p_source_payment_id, p_booking_id, p_invoice_id, p_inquiry_id, 'security_deposit', p_amount,
    p_idempotency_key, p_processor_payment_intent_id, p_requested_by, p_livemode
  ) returning * into v_refund;

  select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
    where r.source_payment_id = p_source_payment_id
      and r.status in ('pending', 'uncertain', 'succeeded');
  if v_active_refunds > v_payment.amount then
    raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
  end if;
  if v_booking.security_deposit_amount is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
      where r.booking_id = p_booking_id and r.refund_kind = 'security_deposit'
        and r.status in ('pending', 'uncertain', 'succeeded');
    if v_active_refunds > v_booking.security_deposit_amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
    end if;
  end if;
  return to_jsonb(v_refund) || jsonb_build_object('created', true);
end;
$$;

-- Provider status updates use refund -> booking -> source-payment locks. This
-- matches the webhook path and rechecks caps before failed/uncertain refunds
-- become succeeded, including a later success after a recorded failure.
create or replace function public.luxor_record_payment_refund_result(
  p_refund_id uuid,
  p_status text,
  p_processor_refund_id text default null,
  p_failure_code text default null,
  p_livemode boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.luxor_payment_refunds%rowtype;
  v_booking public.luxor_bookings%rowtype;
  v_payment public.luxor_payments%rowtype;
  v_target text;
  v_active_refunds numeric(12,2);
  v_successful_refunds numeric(12,2);
  v_target_amount numeric(12,2);
begin
  if p_status is null or p_status not in ('pending', 'succeeded', 'failed', 'uncertain') then
    raise exception 'Invalid refund status.' using errcode = '22023';
  end if;
  select * into v_refund from public.luxor_payment_refunds r where r.id = p_refund_id for update;
  if not found then raise exception 'Refund request not found.' using errcode = 'P0002'; end if;
  if p_livemode is not null and v_refund.livemode is distinct from p_livemode then
    raise exception 'Refund environment does not match the recorded request.' using errcode = '23514';
  end if;
  if p_processor_refund_id is not null and v_refund.processor_refund_id is not null
    and v_refund.processor_refund_id is distinct from p_processor_refund_id then
    raise exception 'Refund request is already linked to a different Stripe refund.' using errcode = '23505';
  end if;
  if v_refund.processor is distinct from 'stripe' or v_refund.source_payment_id is null or v_refund.booking_id is null then
    raise exception 'Refund request has no verified Stripe payment and booking.' using errcode = '23514';
  end if;

  select * into v_booking from public.luxor_bookings b where b.id = v_refund.booking_id for update;
  if not found then raise exception 'Refund booking not found.' using errcode = 'P0002'; end if;
  select * into v_payment from public.luxor_payments p where p.id = v_refund.source_payment_id for update;
  if not found or v_payment.processor is distinct from 'stripe' or v_payment.status is distinct from 'paid'
    or v_payment.booking_id is distinct from v_refund.booking_id
    or v_payment.invoice_id is distinct from v_refund.invoice_id
    or (v_payment.metadata->>'payment_intent' is not null
      and v_payment.metadata->>'payment_intent' is distinct from v_refund.processor_payment_intent_id)
    or v_refund.amount > v_payment.amount then
    raise exception 'Refund request no longer matches its verified source payment.' using errcode = '23514';
  end if;

  v_target := v_refund.status;
  if v_refund.status <> 'succeeded' then
    if p_status = 'succeeded' then v_target := 'succeeded';
    elsif v_refund.status = 'pending' and p_status in ('failed', 'uncertain') then v_target := p_status;
    elsif v_refund.status = 'uncertain' and p_status = 'failed' then v_target := 'failed';
    elsif v_refund.status = 'failed' and p_status = 'uncertain' then v_target := 'uncertain';
    end if;
  end if;

  v_target_amount := case when v_target in ('pending', 'uncertain', 'succeeded') then v_refund.amount else 0 end;
  select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
    where r.source_payment_id = v_refund.source_payment_id
      and r.status in ('pending', 'uncertain', 'succeeded') and r.id <> v_refund.id;
  if v_active_refunds + v_target_amount > v_payment.amount then
    raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
  end if;

  if v_refund.refund_kind = 'security_deposit' and v_booking.security_deposit_amount is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
      where r.booking_id = v_refund.booking_id and r.refund_kind = 'security_deposit'
        and r.status in ('pending', 'uncertain', 'succeeded') and r.id <> v_refund.id;
    if v_active_refunds + v_target_amount > v_booking.security_deposit_amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
    end if;
  end if;

  update public.luxor_payment_refunds r set
    status = v_target,
    processor_refund_id = coalesce(r.processor_refund_id, p_processor_refund_id),
    failure_code = case when v_target = 'failed' then coalesce(p_failure_code, r.failure_code) else null end,
    completed_at = case
      when v_target = 'succeeded' and v_refund.status <> 'succeeded' then timezone('utc'::text, now())
      when v_target = 'succeeded' then coalesce(r.completed_at, timezone('utc'::text, now()))
      when v_target = 'failed' then coalesce(r.completed_at, timezone('utc'::text, now()))
      else null
    end,
    updated_at = timezone('utc'::text, now())
  where r.id = p_refund_id returning * into v_refund;

  select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
    where r.source_payment_id = v_refund.source_payment_id
      and r.status in ('pending', 'uncertain', 'succeeded');
  if v_active_refunds > v_payment.amount then
    raise exception 'LUXOR_REFUND_CAP: Cumulative active refunds exceed the source payment.' using errcode = '23514';
  end if;
  if v_refund.refund_kind = 'security_deposit' and v_booking.security_deposit_amount is not null then
    select coalesce(sum(r.amount), 0) into v_active_refunds from public.luxor_payment_refunds r
      where r.booking_id = v_refund.booking_id and r.refund_kind = 'security_deposit'
        and r.status in ('pending', 'uncertain', 'succeeded');
    if v_active_refunds > v_booking.security_deposit_amount then
      raise exception 'LUXOR_REFUND_CAP: Cumulative security-deposit refunds exceed the accepted hold.' using errcode = '23514';
    end if;
  end if;

  if v_refund.refund_kind = 'security_deposit' and v_target = 'succeeded' then
    select coalesce(sum(r.amount), 0) into v_successful_refunds from public.luxor_payment_refunds r
      where r.booking_id = v_refund.booking_id and r.refund_kind = 'security_deposit' and r.status = 'succeeded';
    if v_successful_refunds >= coalesce(v_booking.security_deposit_amount, v_refund.amount) then
      update public.luxor_bookings b set
        security_deposit_status = 'refunded',
        metadata = coalesce(b.metadata, '{}'::jsonb) || jsonb_build_object(
          'security_deposit_refunded_at', v_refund.completed_at,
          'security_deposit_refund_id', v_refund.processor_refund_id,
          'security_deposit_refund_amount', v_successful_refunds
        ),
        updated_at = timezone('utc'::text, now())
      where b.id = v_refund.booking_id and b.security_deposit_status in ('held', 'refunded');
    end if;
  end if;
  return to_jsonb(v_refund);
end;
$$;

-- Add event timestamps to the existing owner-requested security-refund path.
-- The legacy result RPC remains available, while the webhook uses this wrapper
-- to keep completed_at tied to the first successful Stripe event.
create or replace function public.luxor_record_payment_refund_event(
  p_refund_id uuid,
  p_status text,
  p_processor_refund_id text,
  p_failure_code text,
  p_livemode boolean,
  p_event_id text,
  p_event_created_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.luxor_payment_refunds%rowtype;
  v_event_ids jsonb;
  v_success_at timestamptz;
  v_failure_at timestamptz;
  v_next_metadata jsonb;
begin
  if p_event_created_at is null or p_event_id is null or length(trim(p_event_id)) < 4 then
    raise exception 'LUXOR_REFUND_INVALID: Stripe event timestamp and identity are required.' using errcode = '23514';
  end if;
  perform public.luxor_record_payment_refund_result(
    p_refund_id, p_status, p_processor_refund_id, p_failure_code, p_livemode
  );
  select * into v_refund from public.luxor_payment_refunds r where r.id = p_refund_id for update;
  if not found then raise exception 'Refund request not found.' using errcode = 'P0002'; end if;
  v_event_ids := coalesce(v_refund.metadata->'stripe_event_ids', '[]'::jsonb);
  if not (v_event_ids @> jsonb_build_array(p_event_id)) then
    v_event_ids := v_event_ids || jsonb_build_array(p_event_id);
  end if;
  v_next_metadata := jsonb_set(coalesce(v_refund.metadata, '{}'::jsonb), '{stripe_event_ids}', v_event_ids, true);

  if p_status = 'succeeded' and v_refund.status = 'succeeded' then
    v_success_at := case
      when nullif(v_refund.metadata->>'stripe_succeeded_at', '') is null then p_event_created_at
      else least((v_refund.metadata->>'stripe_succeeded_at')::timestamptz, p_event_created_at)
    end;
    v_next_metadata := jsonb_set(v_next_metadata, '{stripe_succeeded_at}', to_jsonb(v_success_at), true);
    update public.luxor_payment_refunds r set
      completed_at = v_success_at, metadata = v_next_metadata, updated_at = timezone('utc'::text, now())
    where r.id = p_refund_id returning * into v_refund;
  elsif p_status = 'failed' and v_refund.status = 'failed' then
    v_failure_at := case
      when nullif(v_refund.metadata->>'stripe_failed_at', '') is null then p_event_created_at
      else least((v_refund.metadata->>'stripe_failed_at')::timestamptz, p_event_created_at)
    end;
    v_next_metadata := jsonb_set(v_next_metadata, '{stripe_failed_at}', to_jsonb(v_failure_at), true);
    update public.luxor_payment_refunds r set
      completed_at = v_failure_at, metadata = v_next_metadata, updated_at = timezone('utc'::text, now())
    where r.id = p_refund_id returning * into v_refund;
  else
    update public.luxor_payment_refunds r set
      metadata = v_next_metadata, updated_at = timezone('utc'::text, now())
    where r.id = p_refund_id returning * into v_refund;
  end if;
  return to_jsonb(v_refund);
end;
$$;

alter table public.luxor_payment_refunds enable row level security;
revoke all on table public.luxor_payment_refunds from public, anon, authenticated;
grant select, insert, update on table public.luxor_payment_refunds to service_role;
revoke all on function public.luxor_record_external_stripe_refund(text,text,numeric,text,text,boolean,text,timestamptz,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.luxor_record_external_stripe_refund(text,text,numeric,text,text,boolean,text,timestamptz,timestamptz,text)
  to service_role;
revoke all on function public.luxor_record_payment_refund_event(uuid,text,text,text,boolean,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.luxor_record_payment_refund_event(uuid,text,text,text,boolean,text,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
