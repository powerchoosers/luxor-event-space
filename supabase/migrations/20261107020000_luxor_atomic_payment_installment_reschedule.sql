-- Draft for local review. This migration is intentionally not applied here.
-- Serialize due-date edits with every receipt mutation and installment
-- allocation, then recheck eligibility and the ledger inside one transaction.
create or replace function public.luxor_reschedule_payment_installment(
  p_installment_id uuid,
  p_expected_updated_at timestamptz,
  p_due_date date,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking_id uuid;
  v_booking public.luxor_bookings%rowtype;
  v_invoice public.luxor_invoices%rowtype;
  v_installment public.luxor_payment_installments%rowtype;
  v_inquiry_status text;
  v_today date := timezone('America/Chicago', clock_timestamp())::date;
  v_final_date_text text;
  v_final_date date;
  v_security_amount numeric := 0;
  v_bad_security_amount boolean;
  v_event_amount numeric;
  v_schedule_total numeric;
  v_active_count integer;
  v_bad_schedule boolean;
  v_current_due_date date;
  v_changed_at timestamptz;
  v_metadata jsonb;
  v_history jsonb;
begin
  if p_installment_id is null or p_expected_updated_at is null or p_due_date is null
    or nullif(btrim(coalesce(p_actor_email, '')), '') is null then
    return jsonb_build_object('http_status', 400, 'error', 'A valid installment, current version, due date, and editor are required.');
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    return jsonb_build_object('http_status', 409, 'error', 'The payment schedule changed while you were editing. Refresh and try again.');
  end if;

  -- The payment trigger and both allocation RPCs use this same ledger fence.
  -- Fail fast under contention: several legacy receipt paths lock booking or
  -- invoice rows before reaching the payment trigger, so waiting here could
  -- form a lock cycle.
  if not pg_try_advisory_xact_lock(2147483000, 400) then
    return jsonb_build_object('http_status', 409, 'error', 'A payment is being recorded. Refresh and try again shortly.');
  end if;

  begin
    select i.booking_id into v_booking_id
    from public.luxor_payment_installments i
    where i.id = p_installment_id;
    if not found or v_booking_id is null then
      return jsonb_build_object('http_status', 404, 'error', 'Payment schedule entry not found.');
    end if;

    -- Booking FOR UPDATE prevents a new installment row from appearing after
    -- the complete schedule is locked. All potentially contested locks use
    -- NOWAIT because older workflows can acquire them before the shared fence.
    select * into v_booking
    from public.luxor_bookings b
    where b.id = v_booking_id
    for update nowait;
    if not found then
      return jsonb_build_object('http_status', 404, 'error', 'Booking record not found.');
    end if;
    if v_booking.status is distinct from 'confirmed'
      or v_booking.contract_status is distinct from 'signed'
      or v_booking.contract_signed_at is null
      or v_booking.invoice_id is null then
      return jsonb_build_object('http_status', 409, 'error', 'A confirmed booking with a signed agreement is required to change its payment schedule.');
    end if;

    if v_booking.inquiry_id is not null then
      select q.status into v_inquiry_status
      from public.luxor_inquiries q
      where q.id = v_booking.inquiry_id
      for update nowait;
      if found and v_inquiry_status = 'closed_lost' then
        return jsonb_build_object('http_status', 409, 'error', 'Archived bookings cannot receive schedule changes.');
      end if;
    end if;

    select * into v_invoice
    from public.luxor_invoices f
    where f.id = v_booking.invoice_id
    for update nowait;
    if not found or v_invoice.booking_id is distinct from v_booking.id
      or v_invoice.inquiry_id is distinct from v_booking.inquiry_id
      or v_invoice.invoice_kind is distinct from 'event'
      or v_invoice.status in ('draft', 'cancelled')
      or v_invoice.offer_status = 'withdrawn'
      or v_invoice.proposal_accepted_at is null then
      return jsonb_build_object('http_status', 409, 'error', 'The signed booking does not have an eligible accepted event proposal.');
    end if;

    perform i.id
    from public.luxor_payment_installments i
    where i.booking_id = v_booking.id
    order by i.id
    for update nowait;

    select * into v_installment
    from public.luxor_payment_installments i
    where i.id = p_installment_id and i.booking_id = v_booking.id;
    if not found then
      return jsonb_build_object('http_status', 409, 'error', 'The schedule changed while you were editing. Refresh and try again.');
    end if;
    if v_installment.updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('http_status', 409, 'error', 'This schedule changed since it was loaded. Refresh before editing.');
    end if;
    if v_installment.invoice_id is distinct from v_invoice.id
      or v_installment.status not in ('scheduled', 'sent')
      or v_installment.metadata->>'payment_bucket' = 'security_deposit'
      or v_installment.due_at is null then
      return jsonb_build_object('http_status', 409, 'error', 'Only an unpaid event installment on the signed schedule can be rescheduled.');
    end if;
    if jsonb_typeof(coalesce(v_installment.metadata, '{}'::jsonb)) is distinct from 'object' then
      return jsonb_build_object('http_status', 409, 'error', 'The installment record needs reconciliation before its date can change.');
    end if;

    v_current_due_date := timezone('America/Chicago', v_installment.due_at)::date;
    if v_current_due_date <= v_today then
      return jsonb_build_object('http_status', 409, 'error', 'Only an installment with a future due date can be rescheduled.');
    end if;
    if p_due_date <= v_today then
      return jsonb_build_object('http_status', 409, 'error', 'The new due date must be in the future.');
    end if;

    v_final_date_text := v_invoice.proposal_context #>> '{payment_plan,final_payment_due_date}';
    if v_final_date_text is null or v_final_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('http_status', 409, 'error', 'The new date must remain on or before the signed plan’s final-payment deadline.');
    end if;
    begin
      v_final_date := v_final_date_text::date;
    exception when others then
      return jsonb_build_object('http_status', 409, 'error', 'The new date must remain on or before the signed plan’s final-payment deadline.');
    end;
    if to_char(v_final_date, 'YYYY-MM-DD') <> v_final_date_text or p_due_date > v_final_date then
      return jsonb_build_object('http_status', 409, 'error', 'The new date must remain on or before the signed plan’s final-payment deadline.');
    end if;

    if v_invoice.total::text in ('NaN', 'Infinity', '-Infinity') then
      return jsonb_build_object('http_status', 409, 'error', 'The accepted event amount could not be verified. Review the payment plan before editing dates.');
    end if;

    select exists (
      select 1
      from jsonb_array_elements(case
        when jsonb_typeof(v_invoice.line_items) = 'array' then v_invoice.line_items
        else '[]'::jsonb
      end) as item(value)
      where (item.value->>'paymentBucket' = 'security_deposit'
        or item.value->>'category' = 'Security Deposit'
        or coalesce(item.value->>'description', '') ~* 'refundable\s+security\s+deposit')
        and not (
          not (item.value ? 'total')
          or item.value->'total' = 'null'::jsonb
          or item.value->'total' in ('false'::jsonb, 'true'::jsonb)
          or jsonb_typeof(item.value->'total') = 'number'
          or (jsonb_typeof(item.value->'total') = 'string'
            and (btrim(item.value->>'total') = ''
              or btrim(item.value->>'total') ~* '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$'))
        )
    ) into v_bad_security_amount;
    if v_bad_security_amount then
      return jsonb_build_object('http_status', 409, 'error', 'The accepted event amount could not be verified. Review the payment plan before editing dates.');
    end if;

    begin
      select coalesce(sum(case
        when item.value->'total' = 'true'::jsonb then 1
        when jsonb_typeof(item.value->'total') = 'number'
          or (jsonb_typeof(item.value->'total') = 'string'
            and btrim(item.value->>'total') ~* '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$')
          then btrim(item.value->>'total')::numeric
        else 0
      end), 0)
      into v_security_amount
      from jsonb_array_elements(case
        when jsonb_typeof(v_invoice.line_items) = 'array' then v_invoice.line_items
        else '[]'::jsonb
      end) as item(value)
      where item.value->>'paymentBucket' = 'security_deposit'
        or item.value->>'category' = 'Security Deposit'
        or coalesce(item.value->>'description', '') ~* 'refundable\s+security\s+deposit';
    exception when others then
      return jsonb_build_object('http_status', 409, 'error', 'The accepted event amount could not be verified. Review the payment plan before editing dates.');
    end;
    if v_security_amount::text in ('NaN', 'Infinity', '-Infinity') then
      return jsonb_build_object('http_status', 409, 'error', 'The accepted event amount could not be verified. Review the payment plan before editing dates.');
    end if;

    if v_invoice.proposal_context->>'payment_collection_scope' = 'luxor_services_only'
      and v_invoice.proposal_context ? 'luxor_services_total'
      and (v_invoice.proposal_context->>'luxor_services_total' is null
        or btrim(v_invoice.proposal_context->>'luxor_services_total') = ''
        or v_invoice.proposal_context->>'luxor_services_total' ~* '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$') then
      v_event_amount := round(greatest(0, coalesce(nullif(btrim(v_invoice.proposal_context->>'luxor_services_total'), '')::numeric, 0)), 2);
    else
      v_event_amount := round(greatest(0, coalesce(v_invoice.total, 0) - v_security_amount), 2);
    end if;
    if v_event_amount is null or v_event_amount::text in ('NaN', 'Infinity', '-Infinity') or v_event_amount <= 0 then
      return jsonb_build_object('http_status', 409, 'error', 'The accepted event amount could not be verified. Review the payment plan before editing dates.');
    end if;

    select count(*) filter (where i.status <> 'void'),
      coalesce(sum(i.amount) filter (where i.status <> 'void'), 0),
      coalesce(bool_or(i.status <> 'void' and (
        i.invoice_id is distinct from v_invoice.id
        or i.amount::text in ('NaN', 'Infinity', '-Infinity')
        or i.amount <= 0
        or i.due_at is null
      )), false)
    into v_active_count, v_schedule_total, v_bad_schedule
    from public.luxor_payment_installments i
    where i.booking_id = v_booking.id;

    if v_active_count = 0 or v_active_count > 24 or v_bad_schedule
      or v_schedule_total::text in ('NaN', 'Infinity', '-Infinity') then
      return jsonb_build_object('http_status', 409, 'error', 'The saved installments do not reconcile with the accepted event amount. Review the payment plan before editing dates.');
    end if;
    if round(v_schedule_total * 100)::bigint <> round(v_event_amount * 100)::bigint then
      return jsonb_build_object('http_status', 409, 'error', 'The saved installments do not reconcile with the accepted event amount. Review the payment plan before editing dates.');
    end if;

    -- These rows are protected by the shared fence. A pending receipt inserted
    -- after this transaction commits will observe the new date; an earlier
    -- receipt or allocation is visible here and blocks the edit.
    if exists (select 1 from public.luxor_payment_installment_allocations a where a.installment_id = v_installment.id)
      or exists (
        select 1 from public.luxor_payments p
        cross join lateral jsonb_array_elements(case
          when jsonb_typeof(p.metadata->'installment_allocations') = 'array' then p.metadata->'installment_allocations'
          else '[]'::jsonb
        end) as allocation(value)
        where p.booking_id = v_booking.id and p.status = 'paid'
          and allocation.value->>'installment_id' = v_installment.id::text
      ) then
      return jsonb_build_object('http_status', 409, 'error', 'This installment already has a payment allocation and cannot be rescheduled.');
    end if;
    if exists (
      select 1 from public.luxor_payments p
      where p.booking_id = v_booking.id
        and p.status in ('paid', 'pending', 'refunded')
        and (p.status <> 'paid' or p.metadata->>'installment_allocation_status' in ('pending', 'review', 'unapplied'))
    ) then
      return jsonb_build_object('http_status', 409, 'error', 'A payment receipt for this booking still needs allocation review. Reconcile it before changing installment dates.');
    end if;

    if v_current_due_date = p_due_date then
      return jsonb_build_object('installment', to_jsonb(v_installment), 'changed', false);
    end if;

    v_changed_at := clock_timestamp();
    v_metadata := coalesce(v_installment.metadata, '{}'::jsonb);
    v_history := case
      when jsonb_typeof(v_metadata->'due_date_change_history') = 'array' then v_metadata->'due_date_change_history'
      else '[]'::jsonb
    end;
    v_metadata := v_metadata || jsonb_build_object(
      'manual_due_date_override', p_due_date::text,
      'due_date_change_history', v_history || jsonb_build_array(jsonb_build_object(
        'from', v_current_due_date::text,
        'to', p_due_date::text,
        'edited_by', btrim(p_actor_email),
        'occurred_at', v_changed_at
      ))
    );

    update public.luxor_payment_installments i
    set due_at = (p_due_date + time '12:00') at time zone 'UTC',
      metadata = v_metadata,
      updated_at = v_changed_at
    where i.id = v_installment.id
      and i.updated_at = p_expected_updated_at
    returning * into v_installment;
    if not found then
      return jsonb_build_object('http_status', 409, 'error', 'The schedule changed while you were editing. Refresh and try again.');
    end if;
    return jsonb_build_object('installment', to_jsonb(v_installment), 'changed', true);
  exception when lock_not_available then
    return jsonb_build_object('http_status', 409, 'error', 'A payment or schedule update is being processed. Refresh and try again shortly.');
  end;
end;
$$;

revoke all on function public.luxor_reschedule_payment_installment(uuid,timestamptz,date,text) from public, anon, authenticated;
grant execute on function public.luxor_reschedule_payment_installment(uuid,timestamptz,date,text) to service_role;
notify pgrst, 'reload schema';
