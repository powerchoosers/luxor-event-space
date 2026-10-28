-- Atomically reserve signed booking deposits, preserve payment evidence, and
-- prevent stale agreement, invoice, booking, and installment writes while a
-- checkout or verified receipt is being reconciled. All new callable functions
-- are restricted to service_role; trigger helpers remain non-callable by app roles.

BEGIN;

-- Replaces the existing invoker function without changing its ACL or trigger.
CREATE OR REPLACE FUNCTION public.luxor_guard_weekday_booking_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  candidate_context jsonb;
  candidate_snapshot jsonb;
  other_context jsonb;
  other_snapshot jsonb;
  other public.luxor_bookings%rowtype;
  candidate_start timestamp;
  candidate_end timestamp;
  other_start timestamp;
  other_end timestamp;
begin
  if tg_op = 'UPDATE' and new.event_date is not distinct from old.event_date
     and new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time
     and new.status is not distinct from old.status and new.invoice_id is not distinct from old.invoice_id
     and new.inquiry_id is not distinct from old.inquiry_id
     and new.metadata -> 'is_test_record' is not distinct from old.metadata -> 'is_test_record'
     and new.metadata -> 'deposit_checkout_claim' is not distinct from old.metadata -> 'deposit_checkout_claim'
     and new.metadata -> 'final_proposal_context' is not distinct from old.metadata -> 'final_proposal_context'
     and new.metadata -> 'manual_signed_agreement_document_id' is not distinct from old.metadata -> 'manual_signed_agreement_document_id'
     and new.contract_status is not distinct from old.contract_status
     and new.contract_signed_at is not distinct from old.contract_signed_at
     and new.deposit_required is not distinct from old.deposit_required then
    return new;
  end if;
  if new.status not in ('tentative', 'confirmed') and (tg_op <> 'UPDATE' or old.status not in ('tentative', 'confirmed'))
     and coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') not in ('starting','open','uncertain') then return new; end if;
  -- Volatile function queries take a fresh snapshot after waiting at READ
  -- COMMITTED. Older transaction snapshots cannot safely enforce this rule.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'LUXOR_WEEKDAY_INVALID: Scheduling writes require READ COMMITTED isolation.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(2147483000, 400);
  -- Existing claims remain fenced until the receipt is recorded. Do not let a
  -- stale metadata replacement, cancellation or schedule edit release one.
  if tg_op = 'UPDATE' and coalesce(old.metadata #>> '{deposit_checkout_claim,state}', '') in ('starting','open','uncertain') then
    if new.metadata #>> '{deposit_checkout_claim,id}' is distinct from old.metadata #>> '{deposit_checkout_claim,id}'
       or coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') not in ('starting','open','uncertain','paid','released')
       or new.event_date is distinct from old.event_date or new.start_time is distinct from old.start_time
       or new.end_time is distinct from old.end_time or new.invoice_id is distinct from old.invoice_id
       or new.inquiry_id is distinct from old.inquiry_id or new.status = 'cancelled'
       or new.contract_status is distinct from old.contract_status
       or new.contract_signed_at is distinct from old.contract_signed_at
       or new.deposit_required is distinct from old.deposit_required
       or new.metadata -> 'is_test_record' is distinct from old.metadata -> 'is_test_record'
       or new.metadata -> 'final_proposal_context' is distinct from old.metadata -> 'final_proposal_context'
       or new.metadata -> 'manual_signed_agreement_document_id' is distinct from old.metadata -> 'manual_signed_agreement_document_id'
       or ((new.metadata -> 'deposit_checkout_claim') - 'state' - 'session_id' - 'terminal_evidence') is distinct from
          ((old.metadata -> 'deposit_checkout_claim') - 'state' - 'session_id' - 'terminal_evidence') then
      raise exception 'LUXOR_CLAIM_PROTECTED: Payment is in progress or needs reconciliation.' using errcode = 'P0001';
    end if;
    if new.metadata #>> '{deposit_checkout_claim,state}' = 'released' and (
      old.metadata #>> '{deposit_checkout_claim,session_id}' is null
      or new.metadata #>> '{deposit_checkout_claim,terminal_evidence,session_id}' is distinct from old.metadata #>> '{deposit_checkout_claim,session_id}'
      or new.metadata #>> '{deposit_checkout_claim,terminal_evidence,status}' is distinct from 'expired'
      or new.metadata #>> '{deposit_checkout_claim,terminal_evidence,payment_status}' is distinct from 'unpaid'
      or new.metadata #>> '{deposit_checkout_claim,terminal_evidence,async_pending}' is distinct from 'false'
      or new.metadata #>> '{deposit_checkout_claim,terminal_evidence,verified_at}' is null
    ) then raise exception 'LUXOR_CLAIM_PROTECTED: Verified terminal provider evidence required.' using errcode = 'P0001'; end if;
    if new.metadata #>> '{deposit_checkout_claim,state}' = 'paid' and not exists (
      select 1 from public.luxor_invoices deposit
      where deposit.id::text = old.metadata #>> '{deposit_checkout_claim,invoice_id}'
        and deposit.booking_id = new.id and deposit.invoice_kind = 'deposit' and deposit.total > 0
        and (select coalesce(sum(p.amount),0) from public.luxor_payments p
          where p.booking_id=new.id and p.invoice_id=deposit.id and p.status='paid' and p.metadata ->> 'deposit_receipt_review' is distinct from 'true') >= deposit.total
    ) then
      raise exception 'LUXOR_CLAIM_PROTECTED: Payment evidence is required.' using errcode = 'P0001';
    end if;
  end if;
  if coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') in ('starting','open','uncertain')
     and (tg_op = 'INSERT' or coalesce(old.metadata #>> '{deposit_checkout_claim,state}', '') not in ('starting','open','uncertain')) then
    if not exists (select 1 from public.luxor_invoices d join public.luxor_invoices m on m.id = d.parent_invoice_id
      where d.id::text = new.metadata #>> '{deposit_checkout_claim,invoice_id}'
        and d.booking_id = new.id and m.id = new.invoice_id
        and not exists(select 1 from public.luxor_payments pending where pending.invoice_id=d.id and pending.status='pending' and (pending.metadata ->> 'deposit_receipt_review'='true' or pending.metadata ->> 'same_day_payment'='true') and pending.metadata ->> 'receipt_received'='true')
        and to_jsonb(d.total) = new.metadata #> '{deposit_checkout_claim,invoice_total}'
        and to_jsonb(d.proposal_version) = new.metadata #> '{deposit_checkout_claim,deposit_proposal_version}'
        and d.proposal_context = new.metadata #> '{deposit_checkout_claim,deposit_proposal_context}'
        and to_jsonb(m.proposal_version) = new.metadata #> '{deposit_checkout_claim,master_proposal_version}'
        and to_jsonb(new.contract_signed_at) is not distinct from nullif(new.metadata #> '{deposit_checkout_claim,contract_signed_at}','null'::jsonb)
        and (select coalesce(sum(p.amount),0) from public.luxor_payments p where p.invoice_id=d.id and p.status='paid' and p.metadata ->> 'deposit_receipt_review' is distinct from 'true') = (new.metadata #>> '{deposit_checkout_claim,paid_before}')::numeric
        and m.proposal_context = new.metadata #> '{deposit_checkout_claim,proposal_context}'
        and to_jsonb(new.event_date) = new.metadata #> '{deposit_checkout_claim,event_date}'
        and to_jsonb(new.start_time) = new.metadata #> '{deposit_checkout_claim,start_time}'
        and to_jsonb(new.end_time) = new.metadata #> '{deposit_checkout_claim,end_time}')
       or exists (select 1 from public.luxor_inquiries i where i.id=new.inquiry_id and i.status='closed_lost')
       or new.status not in ('tentative','confirmed') or new.contract_status is distinct from 'signed'
       or coalesce(new.metadata #>> '{deposit_checkout_claim,id}', '') !~ '^[0-9a-f-]{36}$'
       or not exists (select 1 from public.luxor_invoices d join public.luxor_invoices m on m.id=d.parent_invoice_id
         where d.id::text=new.metadata #>> '{deposit_checkout_claim,invoice_id}' and d.booking_id=new.id
           and d.invoice_kind='deposit' and d.status not in ('paid','cancelled') and d.total > 0
           and m.id=new.invoice_id and m.inquiry_id=new.inquiry_id
           and m.proposal_accepted_at is not null and m.price_locked_at is not null and m.status='sent')
       or (not exists (select 1 from public.luxor_signature_requests s where s.booking_id=new.id
         and s.status='signed' and s.signed_at is not null and s.owner_signed_at is not null
         and nullif(s.executed_document_path,'') is not null and nullif(s.audit_document_path,'') is not null
         and s.metadata ->> 'claim_master_invoice_id'=new.invoice_id::text
         and exists(select 1 from public.luxor_invoices bound_master where bound_master.id=new.invoice_id
           and s.metadata ->> 'claim_master_proposal_version'=bound_master.proposal_version::text
           and s.metadata -> 'claim_master_proposal_context'=bound_master.proposal_context)
         and s.metadata -> 'claim_booking_terms'=jsonb_build_object(
           'client_name',new.client_name,'email',new.email,'event_type',new.event_type,'event_date',new.event_date,
           'start_time',new.start_time,'end_time',new.end_time,'guest_count',new.guest_count,'package_name',new.package_name,
           'contract_total',new.contract_total,'deposit_required',new.deposit_required,'security_deposit_amount',new.security_deposit_amount,
           'final_payment_due_date',new.final_payment_due_date,'notes',new.notes,
           'proposal_line_items',coalesce(new.metadata->'proposalLineItems','[]'::jsonb),
           'proposal_tax_rate',coalesce(new.metadata->'proposalTaxRate','0'::jsonb),
           'proposal_offer',coalesce(new.metadata->'proposalOffer','{}'::jsonb),
           'final_proposal_context',coalesce(new.metadata->'final_proposal_context','null'::jsonb)))
         and not exists (select 1 from public.luxor_documents d where d.id::text=new.metadata ->> 'manual_signed_agreement_document_id'
           and d.invoice_id=new.invoice_id and d.inquiry_id=new.inquiry_id and d.document_type='executed_contract'
           and d.metadata ->> 'signature_method'='manual_upload' and d.metadata ->> 'booking_id'=new.id::text
           and nullif(d.storage_path,'') is not null and new.contract_signed_at is not null))
       or exists (select 1 from public.luxor_inquiries i where i.id=new.inquiry_id and (i.is_test is true or i.metadata -> 'is_test_record' = 'true'::jsonb))
       or exists (select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=new.inquiry_id and e.reason='owner_confirmed_legacy_test')
       or new.inquiry_id = '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
       or new.metadata -> 'is_test_record' = 'true'::jsonb then
      raise exception 'LUXOR_CLAIM_INVALID: Verified signed terms and initial payment invoice are required.' using errcode = 'P0001';
    end if;
  end if;
  -- Test bookings never consume or conflict with production availability.
  -- Claim creation above remains forbidden for verified test records.
  if coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') not in ('starting','open','uncertain') and (
    new.inquiry_id='00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid or new.metadata -> 'is_test_record'='true'::jsonb
    or exists(select 1 from public.luxor_inquiries t where t.id=new.inquiry_id and (t.is_test is true or t.metadata -> 'is_test_record'='true'::jsonb))
    or exists(select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=new.inquiry_id and e.reason='owner_confirmed_legacy_test')) then return new; end if;
  if new.status <> 'confirmed' and coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') not in ('starting','open','uncertain') then return new; end if;
  -- A claimed checkout or newly confirmed booking must not overlap a real
  -- confirmed booking or another protected checkout, including fixed periods.
  if new.status = 'confirmed' or coalesce(new.metadata #>> '{deposit_checkout_claim,state}', '') in ('starting','open','uncertain') then
    if new.event_date is null then raise exception 'LUXOR_CLAIM_CONFLICT: Unverified date.' using errcode = 'P0001'; end if;
    select proposal_context into candidate_context from public.luxor_invoices where id = new.invoice_id;
    candidate_snapshot := public.luxor_validate_weekday_rental_context(candidate_context);
    candidate_start := new.event_date::date + time '06:00';
    candidate_end := new.event_date::date + interval '1 day 1 hour';
    if new.start_time is not null and new.end_time is not null
       and coalesce(new.metadata #>> '{final_proposal_context,weekday_custom_rental,booking_policy}', '') <> 'one_per_date' then
      candidate_start := new.event_date::date + new.start_time;
      candidate_end := new.event_date::date + new.end_time;
      if new.start_time < time '06:00' then candidate_start := candidate_start + interval '1 day'; end if;
      if new.end_time < time '06:00' then candidate_end := candidate_end + interval '1 day'; end if;
      if candidate_end <= candidate_start then candidate_end := candidate_end + interval '1 day'; end if;
      if candidate_start >= new.event_date::date + interval '1 day 1 hour' or candidate_end > new.event_date::date + interval '1 day 1 hour' then
        candidate_start := new.event_date::date + time '06:00'; candidate_end := new.event_date::date + interval '1 day 1 hour';
      end if;
    end if;
    if candidate_snapshot is not null then
      if new.event_date::text is distinct from candidate_snapshot ->> 'event_date'
         or new.start_time is distinct from (candidate_snapshot ->> 'start_time')::time
         or new.end_time is distinct from (candidate_snapshot ->> 'end_time')::time then
        raise exception 'LUXOR_CLAIM_CONFLICT: Unverified rental terms.' using errcode = 'P0001';
      end if;
      if candidate_snapshot ->> 'booking_policy' = 'one_per_date' then
        candidate_start := new.event_date::date + time '06:00';
        candidate_end := new.event_date::date + interval '1 day 1 hour';
      else
        candidate_start := candidate_start - make_interval(mins => (candidate_snapshot ->> 'cleanup_buffer_minutes')::integer);
        candidate_end := candidate_end + make_interval(mins => (candidate_snapshot ->> 'cleanup_buffer_minutes')::integer);
      end if;
    end if;
    for other in
      select b.* from public.luxor_bookings b
      where b.id is distinct from new.id
        and (b.status = 'confirmed' or coalesce(b.metadata #>> '{deposit_checkout_claim,state}', '') in ('starting','open','uncertain') or exists(select 1 from public.luxor_payments rp join public.luxor_invoices ri on ri.id=rp.invoice_id and ri.booking_id=b.id and ri.invoice_kind='deposit' where rp.booking_id=b.id and rp.status='pending' and (rp.metadata ->> 'deposit_receipt_review'='true' or rp.metadata ->> 'same_day_payment'='true') and rp.metadata ->> 'receipt_received'='true') or (b.status = 'tentative' and exists(select 1 from public.luxor_payments dp join public.luxor_invoices di on di.id=dp.invoice_id and di.booking_id=b.id and di.invoice_kind='deposit' where dp.booking_id=b.id and dp.status='paid' and dp.amount>0)))
        and b.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
        and b.metadata -> 'is_test_record' is distinct from 'true'::jsonb
        and not exists (select 1 from public.luxor_inquiries i where i.id=b.inquiry_id and (i.is_test is true or i.metadata -> 'is_test_record' = 'true'::jsonb))
        and not exists (select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=b.inquiry_id and e.reason='owner_confirmed_legacy_test')
    loop
      if other.event_date is null then raise exception 'LUXOR_CLAIM_CONFLICT: Existing reservation has no date.' using errcode = 'P0001'; end if;
      select proposal_context into other_context from public.luxor_invoices where id = other.invoice_id;
      other_snapshot := public.luxor_validate_weekday_rental_context(other_context);
      other_start := other.event_date::date + time '06:00';
      other_end := other.event_date::date + interval '1 day 1 hour';
      if other.start_time is not null and other.end_time is not null
         and coalesce(other.metadata #>> '{final_proposal_context,weekday_custom_rental,booking_policy}', '') <> 'one_per_date' then
        other_start := other.event_date::date + other.start_time;
        other_end := other.event_date::date + other.end_time;
        if other.start_time < time '06:00' then other_start := other_start + interval '1 day'; end if;
        if other.end_time < time '06:00' then other_end := other_end + interval '1 day'; end if;
        if other_end <= other_start then other_end := other_end + interval '1 day'; end if;
        if other_start >= other.event_date::date + interval '1 day 1 hour' or other_end > other.event_date::date + interval '1 day 1 hour' then
          other_start := other.event_date::date + time '06:00'; other_end := other.event_date::date + interval '1 day 1 hour';
        end if;
      end if;
      if other_snapshot is not null then
        if other.event_date::text is distinct from other_snapshot ->> 'event_date'
           or other.start_time is distinct from (other_snapshot ->> 'start_time')::time
           or other.end_time is distinct from (other_snapshot ->> 'end_time')::time then
          raise exception 'LUXOR_CLAIM_CONFLICT: Existing rental terms are unverified.' using errcode = 'P0001';
        end if;
        if other_snapshot ->> 'booking_policy' = 'one_per_date' then
          other_start := other.event_date::date + time '06:00';
          other_end := other.event_date::date + interval '1 day 1 hour';
        else
          other_start := other_start - make_interval(mins => (other_snapshot ->> 'cleanup_buffer_minutes')::integer);
          other_end := other_end + make_interval(mins => (other_snapshot ->> 'cleanup_buffer_minutes')::integer);
        end if;
      end if;
      if candidate_start < other_end and other_start < candidate_end then
        raise exception 'LUXOR_CLAIM_CONFLICT: This rental period is reserved or payment is processing.' using errcode = 'P0001';
      end if;
    end loop;
  end if;
  select i.proposal_context into candidate_context from public.luxor_invoices i where i.id = new.invoice_id;
  candidate_snapshot := public.luxor_validate_weekday_rental_context(candidate_context);
  if candidate_snapshot is not null then
    if new.event_date::text is distinct from candidate_snapshot ->> 'event_date'
       or new.start_time is null or new.end_time is null
       or new.start_time::time is distinct from (candidate_snapshot ->> 'start_time')::time
       or new.end_time::time is distinct from (candidate_snapshot ->> 'end_time')::time then
      raise exception 'LUXOR_WEEKDAY_INVALID: Booking timing differs from its locked proposal.' using errcode = 'P0001';
    end if;
    candidate_start := new.event_date::date + (candidate_snapshot ->> 'start_time')::time;
    candidate_end := new.event_date::date + (candidate_snapshot ->> 'end_time')::time;
    if (candidate_snapshot ->> 'end_time')::time < time '06:00' then candidate_end := candidate_end + interval '1 day'; end if;
    candidate_end := candidate_end + make_interval(mins => (candidate_snapshot ->> 'cleanup_buffer_minutes')::integer);
  elsif new.event_date is not null then
    -- All historical agreements reserve their date exclusively, regardless of
    -- whether old clock-time columns happen to be populated.
    candidate_start := new.event_date::date + time '06:00';
    candidate_end := new.event_date::date + interval '1 day 1 hour';
  end if;
  for other in
    select b.* from public.luxor_bookings b
    where (b.status = 'confirmed' or coalesce(b.metadata #>> '{deposit_checkout_claim,state}', '') in ('starting','open','uncertain') or exists(select 1 from public.luxor_payments rp join public.luxor_invoices ri on ri.id=rp.invoice_id and ri.booking_id=b.id and ri.invoice_kind='deposit' where rp.booking_id=b.id and rp.status='pending' and (rp.metadata ->> 'deposit_receipt_review'='true' or rp.metadata ->> 'same_day_payment'='true') and rp.metadata ->> 'receipt_received'='true') or (b.status = 'tentative' and exists(select 1 from public.luxor_payments dp join public.luxor_invoices di on di.id=dp.invoice_id and di.booking_id=b.id and di.invoice_kind='deposit' where dp.booking_id=b.id and dp.status='paid' and dp.amount>0))) and b.id is distinct from new.id
      and b.inquiry_id is distinct from '00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid
      and b.metadata -> 'is_test_record' is distinct from 'true'::jsonb
      and not exists (
        select 1 from public.luxor_inquiries inquiry
        where inquiry.id = b.inquiry_id
          and (inquiry.is_test is true or inquiry.metadata -> 'is_test_record' = 'true'::jsonb)
      )
      and not exists (
        select 1 from public.luxor_test_identifier_collision_exemptions exemption
        where exemption.inquiry_id = b.inquiry_id and exemption.reason = 'owner_confirmed_legacy_test'
      )
  loop
    select i.proposal_context into other_context from public.luxor_invoices i where i.id = other.invoice_id;
    other_snapshot := public.luxor_validate_weekday_rental_context(other_context);
    if candidate_snapshot is null and other_snapshot is null then continue; end if;
    if other.event_date is null or new.event_date is null then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: An active reservation has unverified timing.' using errcode = 'P0001';
    end if;
    if new.event_date = other.event_date and (
      candidate_snapshot is null or other_snapshot is null
      or candidate_snapshot ->> 'booking_policy' = 'one_per_date'
      or other_snapshot ->> 'booking_policy' = 'one_per_date'
    ) then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: This date is exclusively reserved.' using errcode = 'P0001';
    end if;
    if other_snapshot is null then
      other_start := other.event_date::date + time '06:00';
      other_end := other.event_date::date + interval '1 day 1 hour';
    else
      if other.event_date::text is distinct from other_snapshot ->> 'event_date'
         or other.start_time is null or other.end_time is null
         or other.start_time::time is distinct from (other_snapshot ->> 'start_time')::time
         or other.end_time::time is distinct from (other_snapshot ->> 'end_time')::time then
        raise exception 'LUXOR_WEEKDAY_CONFLICT: An active custom reservation has unverified timing.' using errcode = 'P0001';
      end if;
      other_start := other.event_date::date + (other_snapshot ->> 'start_time')::time;
      other_end := other.event_date::date + (other_snapshot ->> 'end_time')::time;
      if (other_snapshot ->> 'end_time')::time < time '06:00' then other_end := other_end + interval '1 day'; end if;
      other_end := other_end + make_interval(mins => (other_snapshot ->> 'cleanup_buffer_minutes')::integer);
    end if;
    if candidate_start < other_end and other_start < candidate_end then
      raise exception 'LUXOR_WEEKDAY_CONFLICT: Rental access or cleanup overlaps an active reservation.' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$function$

;

create or replace function public.luxor_guard_claim_invoice_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare protected boolean; protected_claim jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'LUXOR_CLAIM_INVALID: READ COMMITTED required'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  select exists(select 1 from public.luxor_bookings b where
    (b.invoice_id=old.id or b.metadata #>> '{deposit_checkout_claim,invoice_id}'=old.id::text)
    and b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain')) into protected;
  if protected then
    select b.metadata -> 'deposit_checkout_claim' into protected_claim from public.luxor_bookings b where
      (b.invoice_id=old.id or b.metadata #>> '{deposit_checkout_claim,invoice_id}'=old.id::text)
      and b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain') limit 1;
    if tg_op='UPDATE' and old.id::text=protected_claim ->> 'invoice_id'
       and new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id
       and new.stripe_checkout_session_id is distinct from protected_claim ->> 'session_id' then
      raise exception 'LUXOR_CLAIM_PROTECTED: Checkout session differs from active claim.' using errcode='P0001';
    end if;
  end if;
  if protected and tg_op='UPDATE' and new.status is distinct from old.status and (new.status <> 'paid' or not exists(select 1 from public.luxor_payments p where p.invoice_id=old.id and p.status='paid' group by p.invoice_id having sum(p.amount)>=old.total)) then
    raise exception 'LUXOR_CLAIM_PROTECTED: Invoice status has an active payment.' using errcode='P0001';
  end if;
  if protected and (tg_op='DELETE' or (to_jsonb(new) - array['updated_at','stripe_checkout_session_id','stripe_checkout_url','stripe_checkout_opened_at','payment_requested_at','payment_requested_amount','payment_requested_label','same_day_booking_status','same_day_booking_completed_at','same_day_booking_review_reason','status','paid_at']) is distinct from (to_jsonb(old) - array['updated_at','stripe_checkout_session_id','stripe_checkout_url','stripe_checkout_opened_at','payment_requested_at','payment_requested_amount','payment_requested_label','same_day_booking_status','same_day_booking_completed_at','same_day_booking_review_reason','status','paid_at'])) then
    raise exception 'LUXOR_CLAIM_PROTECTED: Invoice terms have an active payment.' using errcode='P0001';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger luxor_deposit_claim_invoice_guard before update or delete on public.luxor_invoices for each row execute function public.luxor_guard_claim_invoice_change();

create or replace function public.luxor_guard_claim_signature_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare protected boolean;
begin
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'LUXOR_CLAIM_INVALID: READ COMMITTED required'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  select exists(select 1 from public.luxor_bookings b where b.id=old.booking_id
    and b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain')) into protected;
  if protected and (tg_op='DELETE' or (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at')) then
    raise exception 'LUXOR_CLAIM_PROTECTED: Agreement has an active payment.' using errcode='P0001';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger z_luxor_deposit_claim_signature_guard before update or delete on public.luxor_signature_requests for each row execute function public.luxor_guard_claim_signature_change();

create or replace function public.luxor_guard_claim_booking_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain') then
    raise exception 'LUXOR_CLAIM_PROTECTED: Booking has an active payment.' using errcode='P0001';
  end if;
  return old;
end $$;
create trigger luxor_deposit_claim_booking_delete_guard before delete on public.luxor_bookings for each row execute function public.luxor_guard_claim_booking_delete();

create or replace function public.luxor_guard_claim_inquiry_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare protected boolean;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.is_test is not distinct from old.is_test and new.metadata -> 'is_test_record' is not distinct from old.metadata -> 'is_test_record' then return new; end if;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'LUXOR_CLAIM_INVALID: READ COMMITTED required'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  select exists(select 1 from public.luxor_bookings b where b.inquiry_id=old.id
    and b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain')) into protected;
  if protected and (tg_op='DELETE' or new.status='closed_lost' or new.is_test is distinct from old.is_test or new.metadata -> 'is_test_record' is distinct from old.metadata -> 'is_test_record') then
    raise exception 'LUXOR_CLAIM_PROTECTED: Inquiry has an active payment.' using errcode='P0001';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger luxor_deposit_claim_inquiry_guard before update or delete on public.luxor_inquiries for each row execute function public.luxor_guard_claim_inquiry_change();

-- Payment mutations must match the active claim or existing same-day evidence.
create or replace function public.luxor_guard_claim_payment_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; p public.luxor_payments; c jsonb;
begin
  p := case when tg_op='DELETE' then old else new end;
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'LUXOR_CLAIM_INVALID: READ COMMITTED required'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  -- Check the previous invoice before looking up NEW: otherwise moving a paid
  -- receipt away from its claimed invoice bypasses the protected binding.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (
      (old.status = 'paid' and (new.amount is distinct from old.amount or new.status is distinct from old.status
       or new.invoice_id is distinct from old.invoice_id or new.booking_id is distinct from old.booking_id
       or new.processor is distinct from old.processor or new.processor_reference is distinct from old.processor_reference))
      or (old.status = 'pending' and old.metadata ->> 'receipt_received' = 'true' and (
       new.amount is distinct from old.amount or new.invoice_id is distinct from old.invoice_id
       or new.booking_id is distinct from old.booking_id or new.processor is distinct from old.processor
       or new.processor_reference is distinct from old.processor_reference
       or new.status not in ('pending','paid')
       or new.metadata -> 'receipt_received' is distinct from old.metadata -> 'receipt_received'
       or new.metadata -> 'deposit_receipt_review' is distinct from old.metadata -> 'deposit_receipt_review'
       or new.metadata -> 'provider_payment_status' is distinct from old.metadata -> 'provider_payment_status'
       or new.metadata -> 'same_day_payment' is distinct from old.metadata -> 'same_day_payment')))) then
    if exists (select 1 from public.luxor_bookings claimed
      where claimed.metadata #>> '{deposit_checkout_claim,invoice_id}' = old.invoice_id::text
        and claimed.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain')) then
      raise exception 'LUXOR_CLAIM_PROTECTED: Existing receipt has an active payment.' using errcode='P0001';
    end if;
  end if;
  select * into b from public.luxor_bookings where metadata #>> '{deposit_checkout_claim,invoice_id}'=p.invoice_id::text and metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain') limit 1;
  if b.id is null then return case when tg_op='DELETE' then old else new end; end if;
  c := b.metadata -> 'deposit_checkout_claim';
  if p.booking_id is distinct from b.id then raise exception 'LUXOR_CLAIM_PROTECTED: Receipt booking does not match claimed invoice.' using errcode='P0001'; end if;
  if tg_op='DELETE' or (tg_op='UPDATE' and old.status='paid' and (new.amount is distinct from old.amount or new.status is distinct from old.status or new.invoice_id is distinct from old.invoice_id or new.booking_id is distinct from old.booking_id or new.processor is distinct from old.processor or new.processor_reference is distinct from old.processor_reference)) then raise exception 'LUXOR_CLAIM_PROTECTED: Existing receipt has an active payment.' using errcode='P0001'; end if;
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') and (
    (tg_op='INSERT' and new.metadata ->> 'deposit_receipt_review' = 'true')
    or     (new.metadata ->> 'deposit_claim_id' = c ->> 'id' and ((new.processor='stripe' and new.processor_reference=c ->> 'session_id') or (new.processor='manual' and c ->> 'session_id' is null)))
    or (new.metadata ->> 'same_day_payment' = 'true' and exists(select 1 from public.luxor_same_day_payment_evidence e where e.payment_id=new.id and e.eligibility='eligible'))
  ) is not true then raise exception 'LUXOR_CLAIM_PROTECTED: Receipt requires reconciliation.' using errcode='P0001'; end if;
  return new;
end $$;
create trigger luxor_deposit_claim_payment_guard before insert or update or delete on public.luxor_payments for each row execute function public.luxor_guard_claim_payment_change();

revoke all on function public.luxor_guard_claim_invoice_change() from public, anon, authenticated;
revoke all on function public.luxor_guard_claim_signature_change() from public, anon, authenticated;
revoke all on function public.luxor_guard_claim_booking_delete() from public, anon, authenticated;
revoke all on function public.luxor_guard_claim_inquiry_change() from public, anon, authenticated;
revoke all on function public.luxor_guard_claim_payment_change() from public, anon, authenticated;

-- booking cancellation. Existing paid/partial installment adjustments are
-- not routed through this schedule guard.
create or replace function public.luxor_guard_deposit_anchored_installments()
returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; q public.luxor_inquiries;
begin
  if new.metadata ->> 'schedule_anchor_policy' is distinct from 'first_deposit_paid_at_v1' then return new; end if;
  if tg_op='UPDATE' and old.status not in ('scheduled','sent') then return new; end if;
  begin
    select * into b from public.luxor_bookings where id=new.booking_id for update nowait;
    if b.id is not null and b.metadata -> 'deposit_checkout_claim' is null then return new; end if;
    select * into q from public.luxor_inquiries where id=b.inquiry_id for update nowait;
  exception when lock_not_available then
    raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03';
  end;
  if b.id is null or q.id is null or b.status is distinct from 'confirmed' or b.contract_status is distinct from 'signed'
     or q.status='closed_lost' or new.invoice_id is distinct from b.invoice_id or new.inquiry_id is distinct from q.id
     or b.metadata #>> '{deposit_checkout_claim,state}' is distinct from 'paid' or b.metadata ->> 'deposit_paid_at' is null then
    raise exception 'LUXOR_INSTALLMENT_REVIEW: Booking is not eligible for deposit-anchored scheduling.' using errcode='P0001';
  end if;
  return new;
end $$;
create trigger luxor_deposit_anchored_installment_guard before insert or update on public.luxor_payment_installments for each row execute function public.luxor_guard_deposit_anchored_installments();
revoke all on function public.luxor_guard_deposit_anchored_installments() from public, anon, authenticated;

-- to claimed bookings. Payment/status bookkeeping is deliberately excluded.
create or replace function public.luxor_guard_claimed_final_balance()
returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; q public.luxor_inquiries;
begin
  if new.invoice_kind is distinct from 'final_balance' then return new; end if;
  if tg_op='UPDATE' and new.booking_id is not distinct from old.booking_id
     and new.parent_invoice_id is not distinct from old.parent_invoice_id and new.inquiry_id is not distinct from old.inquiry_id
     and new.line_items is not distinct from old.line_items and new.subtotal is not distinct from old.subtotal
     and new.tax_rate is not distinct from old.tax_rate and new.total is not distinct from old.total
     and new.due_date is not distinct from old.due_date and new.notes is not distinct from old.notes
     and new.promotion_id is not distinct from old.promotion_id and new.promotion_snapshot is not distinct from old.promotion_snapshot
     and new.discount_amount is not distinct from old.discount_amount and new.discount_percent is not distinct from old.discount_percent then return new; end if;
  begin
    select * into b from public.luxor_bookings where id=new.booking_id for update nowait;
    if b.id is not null and b.metadata -> 'deposit_checkout_claim' is null then return new; end if;
    select * into q from public.luxor_inquiries where id=b.inquiry_id for update nowait;
  exception when lock_not_available then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end;
  if b.id is null or q.id is null or b.status is distinct from 'confirmed' or b.contract_status is distinct from 'signed'
     or q.status='closed_lost' or new.parent_invoice_id is distinct from b.invoice_id or new.inquiry_id is distinct from q.id
     or b.metadata #>> '{deposit_checkout_claim,state}' is distinct from 'paid' or b.metadata ->> 'deposit_paid_at' is null then
    raise exception 'LUXOR_FINAL_BALANCE_REVIEW: Booking is not eligible for final-balance scheduling.' using errcode='P0001';
  end if;
  return new;
end $$;
create trigger z_luxor_claimed_final_balance_guard before insert or update on public.luxor_invoices for each row execute function public.luxor_guard_claimed_final_balance();
revoke all on function public.luxor_guard_claimed_final_balance() from public, anon, authenticated;

-- claim is in flight. No documents, files or legal records are changed.
create or replace function public.luxor_guard_claim_manual_document()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then raise exception 'LUXOR_CLAIM_INVALID: READ COMMITTED required'; end if;
  if not pg_try_advisory_xact_lock(2147483000,400) then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end if;
  if exists(select 1 from public.luxor_bookings b where b.metadata ->> 'manual_signed_agreement_document_id'=old.id::text
    and b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain'))
    and (tg_op='DELETE' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')) then
    raise exception 'LUXOR_CLAIM_PROTECTED: Agreement has an active payment.' using errcode='P0001';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger z_luxor_claim_manual_document_guard before update or delete on public.luxor_documents for each row execute function public.luxor_guard_claim_manual_document();
revoke all on function public.luxor_guard_claim_manual_document() from public,anon,authenticated;

-- trusted server snapshot checked at signing, not a guessed legacy backfill.
create or replace function public.luxor_guard_signed_claim_binding()
returns trigger language plpgsql security invoker set search_path='' as $$
declare initial_booking public.luxor_bookings; b public.luxor_bookings; m public.luxor_invoices; q public.luxor_inquiries; current_terms jsonb;
begin
  if tg_op='UPDATE' and (old.status='signed' or old.signed_at is not null) and (
    new.signed_at is distinct from old.signed_at or new.signed_name is distinct from old.signed_name
    or new.booking_id is distinct from old.booking_id or new.inquiry_id is distinct from old.inquiry_id
    or new.metadata -> 'clientSignatureSha256' is distinct from old.metadata -> 'clientSignatureSha256'
    or new.metadata -> 'claim_master_invoice_id' is distinct from old.metadata -> 'claim_master_invoice_id'
    or new.metadata -> 'claim_master_proposal_version' is distinct from old.metadata -> 'claim_master_proposal_version'
    or new.metadata -> 'claim_master_proposal_context' is distinct from old.metadata -> 'claim_master_proposal_context'
    or new.metadata -> 'claim_booking_terms' is distinct from old.metadata -> 'claim_booking_terms'
    or new.metadata -> 'bookingFingerprint' is distinct from old.metadata -> 'bookingFingerprint') then
    raise exception 'LUXOR_SIGNATURE_BINDING: Signed evidence and binding are immutable.' using errcode='P0001';
  end if;
  if new.status is distinct from 'signed' then return new; end if;
  select * into initial_booking from public.luxor_bookings where id=new.booking_id;
  if initial_booking.id is null then raise exception 'LUXOR_SIGNATURE_BINDING: Booking unavailable.' using errcode='P0001'; end if;
  if initial_booking.inquiry_id='00b264d6-a3fb-4ea3-9142-415f76385c39'::uuid or initial_booking.metadata -> 'is_test_record'='true'::jsonb
    or exists(select 1 from public.luxor_inquiries t where t.id=initial_booking.inquiry_id and (t.is_test is true or t.metadata -> 'is_test_record'='true'::jsonb))
    or exists(select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=initial_booking.inquiry_id and e.reason='owner_confirmed_legacy_test') then return new; end if;
  if tg_op='INSERT' then raise exception 'LUXOR_SIGNATURE_BINDING: Direct signed insertion is not supported.' using errcode='P0001'; end if;
  if old.status is distinct from 'signed' and old.signed_at is not null then raise exception 'LUXOR_SIGNATURE_BINDING: A previously signed request cannot be signed again.' using errcode='P0001'; end if;
  if old.status='signed' then
    if new.metadata -> 'claim_master_invoice_id' is distinct from old.metadata -> 'claim_master_invoice_id'
       or new.metadata -> 'claim_master_proposal_version' is distinct from old.metadata -> 'claim_master_proposal_version'
       or new.metadata -> 'claim_master_proposal_context' is distinct from old.metadata -> 'claim_master_proposal_context'
       or new.metadata -> 'claim_booking_terms' is distinct from old.metadata -> 'claim_booking_terms'
       or new.metadata -> 'bookingFingerprint' is distinct from old.metadata -> 'bookingFingerprint' then
      raise exception 'LUXOR_SIGNATURE_BINDING: Signed binding is immutable.' using errcode='P0001';
    end if;
    return new;
  end if;
  begin
    select * into m from public.luxor_invoices where id=initial_booking.invoice_id for update nowait;
    select * into b from public.luxor_bookings where id=new.booking_id for update nowait;
    select * into q from public.luxor_inquiries where id=b.inquiry_id for update nowait;
  exception when lock_not_available then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end;
  current_terms := jsonb_build_object(
    'client_name',b.client_name,'email',b.email,'event_type',b.event_type,'event_date',b.event_date,
    'start_time',b.start_time,'end_time',b.end_time,'guest_count',b.guest_count,'package_name',b.package_name,
    'contract_total',b.contract_total,'deposit_required',b.deposit_required,'security_deposit_amount',b.security_deposit_amount,
    'final_payment_due_date',b.final_payment_due_date,'notes',b.notes,
    'proposal_line_items',coalesce(b.metadata->'proposalLineItems','[]'::jsonb),
    'proposal_tax_rate',coalesce(b.metadata->'proposalTaxRate','0'::jsonb),
    'proposal_offer',coalesce(b.metadata->'proposalOffer','{}'::jsonb),
    'final_proposal_context',coalesce(b.metadata->'final_proposal_context','null'::jsonb));
  if m.id is null or b.id is null or q.id is null or q.status='closed_lost' or b.invoice_id is distinct from m.id or b.inquiry_id is distinct from new.inquiry_id
     or b.status in ('cancelled','completed') or m.inquiry_id is distinct from b.inquiry_id or m.status is distinct from 'sent'
     or m.proposal_accepted_at is null or m.price_locked_at is null
     or new.metadata ->> 'claim_master_invoice_id' is distinct from m.id::text
     or new.metadata ->> 'claim_master_proposal_version' is distinct from m.proposal_version::text
     or new.metadata -> 'claim_master_proposal_context' is distinct from m.proposal_context
     or new.metadata -> 'claim_booking_terms' is distinct from current_terms then
    raise exception 'LUXOR_SIGNATURE_BINDING: Signed terms changed or are unverified.' using errcode='P0001';
  end if;
  return new;
end $$;
create trigger zz_luxor_signed_claim_binding before insert or update on public.luxor_signature_requests for each row execute function public.luxor_guard_signed_claim_binding();
revoke all on function public.luxor_guard_signed_claim_binding() from public,anon,authenticated;

-- Depends on the weekday booking guard and shared advisory lock. Never release on elapsed time.
create or replace function public.luxor_claim_deposit_checkout(p_booking_id uuid,p_deposit_invoice_id uuid,p_attempt_id uuid,p_provider_account text,p_livemode boolean,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; deposit public.luxor_invoices; master public.luxor_invoices; c jsonb; paid_before numeric;
begin
  if p_booking_id is null or p_deposit_invoice_id is null or p_attempt_id is null or (coalesce(p_provider_account,'') !~ '^acct_[A-Za-z0-9]+$' and p_provider_account is distinct from 'manual') or (p_provider_account='manual' and p_livemode is distinct from false) or p_livemode is null or p_currency is distinct from 'usd' then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  select * into b from public.luxor_bookings where id=p_booking_id for update;
  if b.id is null or b.status not in ('tentative','confirmed') or b.contract_status is distinct from 'signed' then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  c := b.metadata -> 'deposit_checkout_claim';
  if c is not null and c ->> 'state' in ('starting','open','uncertain') then
    if c ->> 'id' = p_attempt_id::text and c ->> 'invoice_id' = p_deposit_invoice_id::text and c ->> 'provider_account'=p_provider_account and (c ->> 'livemode')::boolean is not distinct from p_livemode and c ->> 'currency'=p_currency then return c; end if;
    raise exception 'LUXOR_CLAIM_BUSY';
  end if;
  if c is not null and c ->> 'state' <> 'released' then raise exception 'LUXOR_CLAIM_REVIEW'; end if;
  select * into deposit from public.luxor_invoices where id=p_deposit_invoice_id;
  select * into master from public.luxor_invoices where id=b.invoice_id;
  if deposit.id is null or master.id is null or deposit.booking_id is distinct from b.id
     or deposit.parent_invoice_id is distinct from master.id or deposit.invoice_kind <> 'deposit' then
    raise exception 'LUXOR_CLAIM_INVALID';
  end if;
  if exists(select 1 from public.luxor_payments where invoice_id=deposit.id and status='pending' and (metadata ->> 'deposit_receipt_review'='true' or metadata ->> 'same_day_payment'='true') and metadata ->> 'receipt_received'='true') then raise exception 'LUXOR_RECEIPT_REVIEW'; end if;
  select coalesce(sum(amount),0) into paid_before from public.luxor_payments where invoice_id=deposit.id and status='paid' and metadata ->> 'deposit_receipt_review' is distinct from 'true';
  if paid_before >= deposit.total then raise exception 'LUXOR_CLAIM_ALREADY_PAID'; end if;
  -- Snapshot is not a complete freeze: related-table writes still need a common lock.
  c := jsonb_build_object('id',p_attempt_id,'invoice_id',p_deposit_invoice_id,'state','starting',
    'started_at',clock_timestamp(),'provider_account',p_provider_account,'livemode',p_livemode,'currency',p_currency,'invoice_total',deposit.total,'paid_before',paid_before,'amount_due',deposit.total-paid_before,
    'master_invoice_id',master.id,'master_proposal_version',master.proposal_version,
    'deposit_proposal_version',deposit.proposal_version,'deposit_proposal_context',deposit.proposal_context,
    'contract_signed_at',b.contract_signed_at,'proposal_context',master.proposal_context,
    'event_date',b.event_date,'start_time',b.start_time,'end_time',b.end_time);
  update public.luxor_bookings set metadata=jsonb_set(
    case when b.metadata #>> '{deposit_checkout_claim,state}' = 'released' then
      jsonb_set(metadata,'{deposit_checkout_claim_history}',coalesce(metadata -> 'deposit_checkout_claim_history','[]'::jsonb) || jsonb_build_array(metadata -> 'deposit_checkout_claim'),true)
    else metadata end,'{deposit_checkout_claim}',c,true) where id=b.id;
  return c;
end $$;

create or replace function public.luxor_update_deposit_checkout(p_booking_id uuid,p_attempt_id uuid,p_state text,p_session_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; c jsonb;
begin
  if p_state not in ('open','uncertain') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  select * into b from public.luxor_bookings where id=p_booking_id for update;
  c := b.metadata -> 'deposit_checkout_claim';
  if b.id is null or c ->> 'id' is distinct from p_attempt_id::text or c ->> 'state' not in ('starting','open','uncertain') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if c ->> 'provider_account' = 'manual' and p_session_id is not null then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if p_state='open' and coalesce(p_session_id,'')='' then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if c ->> 'session_id' is not null and p_session_id is not null and c ->> 'session_id' <> p_session_id then raise exception 'LUXOR_CLAIM_SESSION_CONFLICT'; end if;
  c := c || jsonb_build_object('state',p_state) || case when p_session_id is not null then jsonb_build_object('session_id',p_session_id) else '{}'::jsonb end;
  update public.luxor_bookings set metadata=jsonb_set(metadata,'{deposit_checkout_claim}',c,true) where id=b.id;
  return c;
end $$;

create or replace function public.luxor_record_claimed_deposit(p_booking_id uuid,p_attempt_id uuid,p_invoice_id uuid,p_amount numeric,p_processor text,p_reference text,p_paid_at timestamptz,p_method text,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; i public.luxor_invoices; receipt public.luxor_payments; master public.luxor_invoices; c jsonb; paid_now numeric; review_reason text; inquiry_status text; inquiry_metadata jsonb; prior_paid_at timestamptz; security_write_eligible boolean;
begin
  if p_processor is null or p_processor not in ('stripe','manual') or coalesce(p_reference,'')='' or p_paid_at is null or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then raise exception 'LUXOR_RECEIPT_INVALID'; end if;
  select * into b from public.luxor_bookings where id=p_booking_id for update;
  c := b.metadata -> 'deposit_checkout_claim';
  if b.id is null or c ->> 'id' is distinct from p_attempt_id::text or c ->> 'invoice_id' is distinct from p_invoice_id::text then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  begin
    select * into i from public.luxor_invoices where id=p_invoice_id for update nowait;
    select q.status into inquiry_status from public.luxor_inquiries q where q.id=b.inquiry_id for update nowait;
  exception when lock_not_available then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end;
  if i.id is null or i.booking_id is distinct from b.id or i.invoice_kind <> 'deposit' then raise exception 'LUXOR_RECEIPT_INVALID'; end if;
  if not pg_try_advisory_xact_lock(2147483000,400) then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end if;
  if (p_processor='stripe' and coalesce(c ->> 'provider_account','') !~ '^acct_[A-Za-z0-9]+$') or (p_processor='manual' and c ->> 'provider_account' is distinct from 'manual') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if p_processor='stripe' and c ->> 'session_id' is distinct from p_reference then raise exception 'LUXOR_CLAIM_SESSION_CONFLICT'; end if;
  if p_processor='manual' and c ->> 'session_id' is not null then raise exception 'LUXOR_CLAIM_SESSION_CONFLICT'; end if;
  select * into receipt from public.luxor_payments where processor=p_processor and processor_reference=p_reference;
  -- A settled, non-review replay is immutable even if the booking later
  -- completes, is cancelled, or the proposal is changed after settlement.
  if receipt.id is not null and c ->> 'state' = 'paid' and receipt.status = 'paid'
     and receipt.metadata ->> 'deposit_receipt_review' is distinct from 'true' then
    if receipt.booking_id is distinct from b.id or receipt.invoice_id is distinct from i.id
       or receipt.amount is distinct from p_amount then raise exception 'LUXOR_RECEIPT_CONFLICT'; end if;
    if receipt.paid_at is null then return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'replay',true,'invoice_applied',false,'booking_terminal',b.status in ('cancelled','completed'),'reason','Receipt timing requires review'); end if;
    select coalesce(sum(p.amount),0) into paid_now from public.luxor_payments p
      where p.booking_id=b.id and p.invoice_id=i.id and p.status='paid' and p.metadata ->> 'deposit_receipt_review' is distinct from 'true';
    if i.status in ('sent','overdue','paid') and i.total = (c ->> 'invoice_total')::numeric and paid_now>=i.total then
      update public.luxor_invoices set status='paid',paid_at=coalesce(paid_at,receipt.paid_at) where id=i.id returning * into i;
      if b.status='confirmed' and b.contract_status='signed' and inquiry_status is not null and inquiry_status <> 'closed_lost' then
        update public.luxor_bookings set booked_at=coalesce(booked_at,receipt.paid_at),metadata=metadata || jsonb_build_object('deposit_paid_at',coalesce(metadata->>'deposit_paid_at',receipt.paid_at::text),'reservation_confirmed_at',coalesce(metadata->>'reservation_confirmed_at',receipt.paid_at::text),'reservation_state','confirmed') where id=b.id returning * into b;
      end if;
      if b.status='confirmed' and b.contract_status='signed' and inquiry_status is not null and inquiry_status <> 'closed_lost' then
        begin
          select * into master from public.luxor_invoices where id=b.invoice_id for update nowait;
          perform 1 from public.luxor_email_jobs where inquiry_id=b.inquiry_id and booking_id=b.id and status='queued'
            and metadata ->> 'invoice_id' in (i.id::text,b.invoice_id::text)
            and job_type in ('proposal_view_reminder','proposal_payment_reminder','contract_view_reminder','contract_signature_reminder') for update nowait;
        exception when lock_not_available then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end;
        select metadata into inquiry_metadata from public.luxor_inquiries where id=b.inquiry_id;
        begin prior_paid_at:=nullif(inquiry_metadata->>'latest_payment_at','')::timestamptz;
        exception when invalid_datetime_format or datetime_field_overflow then prior_paid_at:=null; end;
        update public.luxor_inquiries set status='booked',
          pipeline_stage=case when pipeline_stage in ('final_payment','event','closing') then pipeline_stage else 'final_payment' end,
          metadata=coalesce(metadata,'{}'::jsonb)||case when prior_paid_at is null or prior_paid_at<receipt.paid_at
            or (prior_paid_at=receipt.paid_at and metadata->>'latest_paid_invoice_id'=i.id::text)
            then jsonb_build_object('latest_payment_at',receipt.paid_at,'latest_paid_invoice_id',i.id) else '{}'::jsonb end
          where id=b.inquiry_id and coalesce(nullif(metadata->>'latest_proposal_invoice_id',''),b.invoice_id::text) in (b.invoice_id::text,i.id::text);
        update public.luxor_email_jobs set status='cancelled',updated_at=now()
          where inquiry_id=b.inquiry_id and booking_id=b.id and status='queued'
            and metadata ->> 'invoice_id' in (i.id::text,b.invoice_id::text)
            and job_type in ('proposal_view_reminder','proposal_payment_reminder','contract_view_reminder','contract_signature_reminder');
        if master.id is not null and master.discount_percent>0 and coalesce(nullif(master.original_total,0),master.total,0)>coalesce(master.total,0)+0.005
           and coalesce(master.offer_status,'active') not in ('withdrawn','expired')
           and (master.proposal_accepted_at is not null or master.offer_expires_at is null or master.offer_expires_at>receipt.paid_at)
           and (master.offer_expires_at is null or (b.contract_signed_at is not null and b.contract_signed_at<=master.offer_expires_at)) then
          update public.luxor_invoices set offer_status='redeemed',offer_redeemed_at=coalesce(offer_redeemed_at,receipt.paid_at) where id=master.id;
        end if;
      end if;
      return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'replay',true,'invoice_applied',true,'booking_terminal',b.status in ('cancelled','completed'));
    end if;
    return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'replay',true,'invoice_applied',false,'booking_terminal',b.status in ('cancelled','completed'),'reason','Invoice changed; review needed');
  end if;
  if i.total is distinct from (c ->> 'invoice_total')::numeric or i.status='cancelled' then review_reason := 'Invoice terms changed'; end if;
  if b.status in ('cancelled','completed') or b.contract_status is distinct from 'signed' or inquiry_status is null or inquiry_status='closed_lost' then review_reason := 'Booking or inquiry is not eligible'; end if;
  if exists(select 1 from public.luxor_payments where invoice_id=i.id and status='pending' and (metadata ->> 'deposit_receipt_review'='true' or metadata ->> 'same_day_payment'='true') and metadata ->> 'receipt_received'='true') then review_reason := 'Another provider receipt requires review'; end if;
  if exists(select 1 from public.luxor_bookings x join public.luxor_payments rp on rp.booking_id=x.id join public.luxor_invoices ri on ri.id=rp.invoice_id and ri.booking_id=x.id and ri.invoice_kind='deposit' where x.id<>b.id and (x.event_date is null or b.event_date is null or abs(x.event_date-b.event_date)<=2) and rp.status='pending' and (rp.metadata ->> 'deposit_receipt_review'='true' or rp.metadata ->> 'same_day_payment'='true') and rp.metadata ->> 'receipt_received'='true' and x.metadata -> 'is_test_record' is distinct from 'true'::jsonb and not exists(select 1 from public.luxor_inquiries q where q.id=x.inquiry_id and (q.is_test or q.metadata -> 'is_test_record'='true'::jsonb)) and not exists(select 1 from public.luxor_test_identifier_collision_exemptions e where e.inquiry_id=x.inquiry_id and e.reason='owner_confirmed_legacy_test')) then review_reason := 'Another provider receipt near this date requires review'; end if;
  if coalesce((c #>> '{proposal_context,same_day_booking,coverage_amount}')::numeric,0)>0 and not exists (select 1 from public.luxor_payments p join public.luxor_same_day_payment_evidence e on e.payment_id=p.id where p.processor=p_processor and p.processor_reference=p_reference and p.booking_id=b.id and p.invoice_id=i.id and p.status='paid' and e.eligibility='eligible') then review_reason := 'Same-day receipt requires promotion eligibility review'; end if;
  if receipt.id is not null then
    if receipt.booking_id is distinct from b.id or receipt.invoice_id is distinct from i.id or receipt.amount is distinct from p_amount or (receipt.status <> 'paid' and not (receipt.status='pending' and (receipt.metadata ->> 'deposit_receipt_review' = 'true' or (receipt.metadata ->> 'same_day_payment' = 'true' and receipt.metadata ->> 'receipt_received' = 'true')))) then raise exception 'LUXOR_RECEIPT_CONFLICT'; end if;
    if receipt.metadata ->> 'deposit_receipt_review' = 'true' or (receipt.status='pending' and receipt.metadata ->> 'same_day_payment'='true' and receipt.metadata ->> 'receipt_received'='true') then review_reason := coalesce(receipt.metadata ->> 'deposit_receipt_review_reason','Receipt requires review'); end if;
  else
    if c ->> 'state' not in ('starting','open','uncertain') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
    select coalesce(sum(amount),0) into paid_now from public.luxor_payments where invoice_id=i.id and status='paid' and metadata ->> 'deposit_receipt_review' is distinct from 'true';
    if paid_now is distinct from (c ->> 'paid_before')::numeric or p_amount <> i.total-paid_now then review_reason := 'Payment amount or prior receipts require review'; end if;
    insert into public.luxor_payments(booking_id,invoice_id,inquiry_id,amount,status,payment_method,paid_at,processor,processor_reference,metadata)
    values(b.id,i.id,b.inquiry_id,p_amount,case when review_reason is null then 'paid' else 'pending' end,p_method,p_paid_at,p_processor,p_reference,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('deposit_claim_id',p_attempt_id)||case when review_reason is not null then jsonb_build_object('deposit_receipt_review',true,'provider_payment_status','paid','receipt_received',true,'deposit_receipt_review_reason',review_reason) else '{}'::jsonb end) returning * into receipt;
  end if;
  if review_reason is not null then
    if receipt.metadata ->> 'same_day_payment' is distinct from 'true' then update public.luxor_payments set metadata=metadata || jsonb_build_object('deposit_receipt_review',true,'deposit_receipt_review_reason',review_reason) where id=receipt.id returning * into receipt; end if;
    return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'review',true,'reason',review_reason);
  end if;
  if c ->> 'state' <> 'paid' then
    security_write_eligible := p_processor='stripe' and coalesce(b.security_deposit_status,'not_collected') in ('not_collected','due')
      and nullif(b.metadata->>'security_deposit_collected_at','') is null
      and nullif(b.metadata->>'security_deposit_held_at','') is null
      and nullif(b.metadata->>'security_deposit_payment_invoice_id','') is null
      and nullif(b.metadata->>'security_deposit_refunded_at','') is null
      and nullif(b.metadata->>'security_deposit_refund_id','') is null
      and nullif(b.metadata->>'security_deposit_refund_amount','') is null
      and nullif(b.metadata->>'security_deposit_released_at','') is null
      and not exists(select 1 from public.luxor_payments sp join public.luxor_invoices si on si.id=sp.invoice_id
        where sp.booking_id=b.id and si.booking_id=b.id and si.invoice_kind='security_deposit'
          and (sp.status in ('paid','refunded') or (sp.status='pending' and sp.metadata->>'receipt_received'='true')));
    c := c || jsonb_build_object('state','paid');
    update public.luxor_bookings set status='confirmed',booked_at=coalesce(booked_at,receipt.paid_at),
      security_deposit_status=case when security_write_eligible then 'held' else security_deposit_status end,
      metadata=jsonb_set(metadata,'{deposit_checkout_claim}',c,true) || jsonb_build_object('deposit_paid_at',coalesce(metadata->>'deposit_paid_at',receipt.paid_at::text),'reservation_confirmed_at',coalesce(metadata->>'reservation_confirmed_at',receipt.paid_at::text),'reservation_state','confirmed')
        || case when security_write_eligible then jsonb_build_object(
          'security_deposit_collected_at',receipt.paid_at,
          'security_deposit_held_at',receipt.paid_at,
          'security_deposit_payment_invoice_id',i.id) else '{}'::jsonb end
      where id=b.id returning * into b;
  end if;
  select coalesce(sum(p.amount),0) into paid_now from public.luxor_payments p
    where p.booking_id=b.id and p.invoice_id=i.id and p.status='paid' and p.metadata ->> 'deposit_receipt_review' is distinct from 'true';
  if i.status in ('sent','overdue','paid') and i.total = (c ->> 'invoice_total')::numeric and paid_now>=i.total then
    update public.luxor_invoices set status='paid',paid_at=coalesce(paid_at,receipt.paid_at) where id=i.id;
    if b.status='confirmed' and b.contract_status='signed' and inquiry_status is not null and inquiry_status <> 'closed_lost' then
      begin
        select * into master from public.luxor_invoices where id=b.invoice_id for update nowait;
        perform 1 from public.luxor_email_jobs where inquiry_id=b.inquiry_id and booking_id=b.id and status='queued'
        and metadata ->> 'invoice_id' in (i.id::text,b.invoice_id::text)
        and job_type in ('proposal_view_reminder','proposal_payment_reminder','contract_view_reminder','contract_signature_reminder') for update nowait;
      exception when lock_not_available then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end;
      select metadata into inquiry_metadata from public.luxor_inquiries where id=b.inquiry_id;
      begin prior_paid_at:=nullif(inquiry_metadata->>'latest_payment_at','')::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then prior_paid_at:=null; end;
      update public.luxor_inquiries set status='booked',
        pipeline_stage=case when pipeline_stage in ('final_payment','event','closing') then pipeline_stage else 'final_payment' end,
        metadata=coalesce(metadata,'{}'::jsonb)||case when prior_paid_at is null or prior_paid_at<receipt.paid_at
        or (prior_paid_at=receipt.paid_at and metadata->>'latest_paid_invoice_id'=i.id::text)
        then jsonb_build_object('latest_payment_at',receipt.paid_at,'latest_paid_invoice_id',i.id) else '{}'::jsonb end
        where id=b.inquiry_id and coalesce(nullif(metadata->>'latest_proposal_invoice_id',''),b.invoice_id::text) in (b.invoice_id::text,i.id::text);
      update public.luxor_email_jobs set status='cancelled',updated_at=now()
        where inquiry_id=b.inquiry_id and booking_id=b.id and status='queued'
        and metadata ->> 'invoice_id' in (i.id::text,b.invoice_id::text)
        and job_type in ('proposal_view_reminder','proposal_payment_reminder','contract_view_reminder','contract_signature_reminder');
      if master.id is not null and master.discount_percent>0 and coalesce(nullif(master.original_total,0),master.total,0)>coalesce(master.total,0)+0.005
         and coalesce(master.offer_status,'active') not in ('withdrawn','expired')
         and (master.proposal_accepted_at is not null or master.offer_expires_at is null or master.offer_expires_at>receipt.paid_at)
         and (master.offer_expires_at is null or (b.contract_signed_at is not null and b.contract_signed_at<=master.offer_expires_at)) then
        update public.luxor_invoices set offer_status='redeemed',offer_redeemed_at=coalesce(offer_redeemed_at,receipt.paid_at) where id=master.id;
      end if;
    end if;
    return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'invoice_applied',true);
  end if;
  return jsonb_build_object('payment',to_jsonb(receipt),'claim',c,'invoice_applied',false,'reason','Invoice changed; review needed');
end $$;

-- only service_role. CREATE OR REPLACE does not preserve ACL for these NEW names.

-- Caller must fetch authoritative Stripe session in the configured account and
-- verify expired, unpaid and no pending asynchronous settlement. Assertions are
-- trusted application inputs, not independently verifiable by PostgreSQL.
create or replace function public.luxor_release_deposit_checkout(p_booking_id uuid,p_attempt_id uuid,p_session_id text,p_status text,p_payment_status text,p_async_pending boolean,p_verified_at timestamptz,p_provider_account text,p_livemode boolean,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; c jsonb;
begin
  if coalesce(p_session_id,'')='' or p_status is distinct from 'expired' or p_payment_status is distinct from 'unpaid' or p_async_pending is distinct from false or p_verified_at is null or p_verified_at > clock_timestamp() + interval '1 minute' then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  select * into b from public.luxor_bookings where id=p_booking_id for update;
  c := b.metadata -> 'deposit_checkout_claim';
  if b.id is null or c ->> 'id' is distinct from p_attempt_id::text or c ->> 'session_id' is distinct from p_session_id or c ->> 'provider_account' is distinct from p_provider_account or (c ->> 'livemode')::boolean is distinct from p_livemode or c ->> 'currency' is distinct from p_currency then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if c ->> 'state' = 'released' then return c; end if;
  if c ->> 'state' not in ('open','uncertain') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  c := c || jsonb_build_object('state','released','terminal_evidence',jsonb_build_object('session_id',p_session_id,'status',p_status,'payment_status',p_payment_status,'async_pending',p_async_pending,'verified_at',p_verified_at,'provider_account',p_provider_account,'livemode',p_livemode,'currency',p_currency));
  update public.luxor_bookings set metadata=jsonb_set(metadata,'{deposit_checkout_claim}',c,true) where id=b.id;
  return c;
end $$;

-- Called only after the server verifies the actual provider event and its
-- booking/invoice binding. Never confirms availability; persists review evidence.
create or replace function public.luxor_record_unmatched_deposit_review(p_booking_id uuid,p_invoice_id uuid,p_amount numeric,p_processor text,p_reference text,p_event_id text,p_paid_at timestamptz,p_method text,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.luxor_bookings; i public.luxor_invoices; r public.luxor_payments; ev jsonb; collision boolean:=false;
begin
  if p_processor is null or p_processor not in ('stripe','manual') or coalesce(p_reference,'')='' or coalesce(p_event_id,'')='' or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'LUXOR_RECEIPT_INVALID'; end if;
  -- Never wait on a booking while holding the shared advisory lock: the
  -- ordinary booking writer takes these locks in the reverse order.
  if not pg_try_advisory_xact_lock(2147483000,400) then raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03'; end if;
  begin
    select * into b from public.luxor_bookings where id=p_booking_id for update nowait;
  exception when lock_not_available then
    raise exception 'LUXOR_RETRY_CONTENTION' using errcode='55P03';
  end;
  select * into i from public.luxor_invoices where id=p_invoice_id;
  if b.id is null or i.id is null or i.booking_id is distinct from b.id or i.invoice_kind<>'deposit' then raise exception 'LUXOR_RECEIPT_INVALID'; end if;
  select * into r from public.luxor_payments where processor=p_processor and processor_reference=p_reference;
  if r.id is null then
    insert into public.luxor_payments(booking_id,invoice_id,inquiry_id,amount,status,payment_method,paid_at,processor,processor_reference,metadata)
    values(b.id,i.id,b.inquiry_id,p_amount,'pending',p_method,p_paid_at,p_processor,p_reference,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('deposit_receipt_review',true,'provider_payment_status','paid','receipt_received',true,'provider_timing_known',p_paid_at is not null,'deposit_receipt_review_reason','Unmatched or late provider receipt','provider_event_id',p_event_id)) returning * into r;
  else
    collision := r.booking_id is distinct from b.id or r.invoice_id is distinct from i.id or r.amount is distinct from p_amount or (r.status is distinct from 'paid' and not (r.status='pending' and (r.metadata ->> 'deposit_receipt_review'='true' or (r.metadata ->> 'same_day_payment'='true' and r.metadata ->> 'receipt_received'='true'))));
  end if;
  ev:=jsonb_build_object('event_id',p_event_id,'invoice_id',i.id,'processor',p_processor,'reference',p_reference,'amount',p_amount,'paid_at',p_paid_at,'identity_conflict',collision);
  if not exists(select 1 from jsonb_array_elements(coalesce(b.metadata -> 'deposit_receipt_review_events','[]'::jsonb)) e where e ->> 'event_id'=p_event_id) then
    update public.luxor_bookings set metadata=jsonb_set(metadata,'{deposit_receipt_review_events}',coalesce(metadata -> 'deposit_receipt_review_events','[]'::jsonb)||jsonb_build_array(ev),true) where id=b.id;
  end if;
  return jsonb_build_object('review',true,'identity_conflict',collision,'payment',to_jsonb(r),'in_flight_session',case when b.metadata #>> '{deposit_checkout_claim,state}' in ('starting','open','uncertain') then b.metadata #>> '{deposit_checkout_claim,session_id}' else null end);
end $$;

-- Same-day path uses the existing promotion evidence and finalization logic in
-- one invoker transaction. Callers must validate provider events first.
create or replace function public.luxor_record_claimed_same_day_deposit(
  p_invoice_id uuid,p_booking_id uuid,p_attempt_id uuid,p_amount numeric,p_paid_at timestamptz,
  p_processor text,p_reference text,p_method text,p_event_id text,p_timing_verified boolean,
  p_fingerprint text,p_metadata jsonb,p_booking_patch jsonb,p_inquiry_patch jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare master public.luxor_invoices; child public.luxor_invoices; b public.luxor_bookings; inquiry_id uuid; c jsonb; recorded jsonb; finalized jsonb; claimed jsonb; saved_paid_at timestamptz;
begin
  -- Resend locks inquiry first; existing same-day paths lock invoice first.
  -- NOWAIT avoids retaining the inquiry lock while waiting on any opposing
  -- writer. On contention, subtransaction rollback releases locks before the
  -- independently verified receipt is recorded for manual review.
  begin
    select bk.inquiry_id into inquiry_id from public.luxor_bookings bk where bk.id=p_booking_id;
    perform 1 from public.luxor_inquiries where id=inquiry_id for update nowait;
    select i.* into master from public.luxor_invoices i join public.luxor_bookings bk on bk.invoice_id=i.id where bk.id=p_booking_id for update of i nowait;
    select * into child from public.luxor_invoices where id=p_invoice_id for update nowait;
    select * into b from public.luxor_bookings where id=p_booking_id for update nowait;
  exception when lock_not_available then
    return public.luxor_record_unmatched_deposit_review(p_booking_id,p_invoice_id,p_amount,p_processor,p_reference,p_event_id,p_paid_at,p_method,p_metadata);
  end;
  c:=b.metadata -> 'deposit_checkout_claim';
  if master.id is null or b.inquiry_id is distinct from inquiry_id or master.inquiry_id is distinct from inquiry_id or child.parent_invoice_id is distinct from master.id or child.booking_id is distinct from b.id
     or c ->> 'id' is distinct from p_attempt_id::text or c ->> 'invoice_id' is distinct from child.id::text
     or c ->> 'state' not in ('starting','open','uncertain','paid')
     or (p_processor='stripe' and (c ->> 'session_id' is distinct from p_reference or coalesce(c ->> 'provider_account','') !~ '^acct_[A-Za-z0-9]+$'))
     or (p_processor='manual' and (c ->> 'provider_account' is distinct from 'manual' or c ->> 'session_id' is not null))
     or p_processor is null or p_processor not in ('stripe','manual') then raise exception 'LUXOR_CLAIM_INVALID'; end if;
  if c ->> 'state' = 'paid' then
    select p.paid_at into saved_paid_at from public.luxor_payments p
      where p.processor=p_processor and p.processor_reference=p_reference
        and p.booking_id=p_booking_id and p.invoice_id=p_invoice_id and p.amount=p_amount
        and p.status='paid' and p.metadata ->> 'deposit_receipt_review' is distinct from 'true';
    if saved_paid_at is not null then
      claimed:=public.luxor_record_claimed_deposit(p_booking_id,p_attempt_id,p_invoice_id,p_amount,p_processor,p_reference,saved_paid_at,p_method,p_metadata);
      if claimed ->> 'replay' = 'true' then
        return jsonb_build_object('review',false,'replay',true,'claimed',claimed);
      end if;
    end if;
  end if;
  if exists(select 1 from public.luxor_payments where processor=p_processor and processor_reference=p_reference and (metadata ->> 'deposit_receipt_review'='true' or (status='pending' and metadata ->> 'same_day_payment'='true' and metadata ->> 'receipt_received'='true'))) then
    return public.luxor_record_unmatched_deposit_review(p_booking_id,p_invoice_id,p_amount,p_processor,p_reference,p_event_id,p_paid_at,p_method,p_metadata);
  end if;
  begin
    recorded:=public.luxor_record_same_day_payment(p_invoice_id,p_booking_id,p_amount,p_paid_at,p_processor,p_reference,p_method,p_event_id,p_timing_verified,p_fingerprint,p_metadata);
    if recorded ->> 'eligibility' <> 'eligible' then raise exception 'LUXOR_SAME_DAY_REVIEW'; end if;
    finalized:=public.luxor_finalize_same_day_booking(p_booking_id,p_booking_patch,p_inquiry_patch,true);
    if coalesce((finalized ->> 'applied')::boolean,false) is not true then raise exception 'LUXOR_SAME_DAY_REVIEW'; end if;
    claimed:=public.luxor_record_claimed_deposit(p_booking_id,p_attempt_id,p_invoice_id,p_amount,p_processor,p_reference,p_paid_at,p_method,p_metadata);
    if coalesce((claimed ->> 'review')::boolean,false) then raise exception 'LUXOR_SAME_DAY_REVIEW'; end if;
    return jsonb_build_object('review',false,'same_day',recorded,'finalized',finalized,'claimed',claimed);
  exception when others then
    -- Roll back new same-day mutations, then retain the externally verified
    -- receipt as pending review. Existing paid rows remain untouched.
    return public.luxor_record_unmatched_deposit_review(p_booking_id,p_invoice_id,p_amount,p_processor,p_reference,p_event_id,p_paid_at,p_method,p_metadata);
  end;
end $$;

-- is restricted in the same transaction as creation, never exposed to PUBLIC.
revoke all on function public.luxor_record_claimed_same_day_deposit(uuid,uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.luxor_record_unmatched_deposit_review(uuid,uuid,numeric,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.luxor_claim_deposit_checkout(uuid,uuid,uuid,text,boolean,text) from public, anon, authenticated;
revoke all on function public.luxor_update_deposit_checkout(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.luxor_record_claimed_deposit(uuid,uuid,uuid,numeric,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.luxor_release_deposit_checkout(uuid,uuid,text,text,text,boolean,timestamptz,text,boolean,text) from public, anon, authenticated;
grant execute on function public.luxor_record_claimed_same_day_deposit(uuid,uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.luxor_record_unmatched_deposit_review(uuid,uuid,numeric,text,text,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.luxor_claim_deposit_checkout(uuid,uuid,uuid,text,boolean,text) to service_role;
grant execute on function public.luxor_update_deposit_checkout(uuid,uuid,text,text) to service_role;
grant execute on function public.luxor_record_claimed_deposit(uuid,uuid,uuid,numeric,text,text,timestamptz,text,jsonb) to service_role;
grant execute on function public.luxor_release_deposit_checkout(uuid,uuid,text,text,text,boolean,timestamptz,text,boolean,text) to service_role;

CREATE OR REPLACE FUNCTION public.luxor_finalize_corrected_payment_resend(p_inquiry_id uuid, p_job_id uuid, p_subject text, p_body text, p_checkout_session_id text, p_balance_due numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare job public.luxor_email_jobs%rowtype; invoice public.luxor_invoices%rowtype; result jsonb; deferred boolean := coalesce(p_checkout_session_id,'')='';
begin
  if coalesce(p_subject,'')='' or coalesce(p_body,'')=''
    or coalesce(p_balance_due,0)<=0 then raise exception 'Payment resend content is incomplete'; end if;
  result:=public.luxor_validate_corrected_payment_resend(p_inquiry_id,p_job_id,'worker');
  if coalesce((result->>'eligible')::boolean,false) is not true then raise exception 'Payment resend is not eligible'; end if;
  select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
  if not found or job.status<>'sending' or job.metadata->>'corrected_payment_resend_preparing' is distinct from 'true' then
    raise exception 'Payment resend reservation is no longer being prepared';
  end if;
  if deferred then
    select * into invoice from public.luxor_invoices where id=(job.metadata->>'corrected_payment_resend_invoice_id')::uuid and inquiry_id=p_inquiry_id and booking_id=job.booking_id;
    if invoice.id is null or invoice.invoice_kind <> 'deposit' or invoice.public_token is null
      or position('/api/public/proposals/'||invoice.public_token::text||'/checkout' in p_body)=0
      or p_balance_due <> invoice.total - (select coalesce(sum(amount),0) from public.luxor_payments where invoice_id=invoice.id and status='paid') then
      raise exception 'Deferred deposit payment link is invalid or balance changed';
    end if;
  end if;
  update public.luxor_email_jobs set status='queued',subject=p_subject,body=p_body,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'corrected_payment_resend_preparing',false,
      'corrected_payment_resend_snapshot_subject',p_subject,
      'corrected_payment_resend_snapshot_body',p_body,
      'corrected_payment_resend_checkout_session_id',p_checkout_session_id,
      'corrected_payment_resend_deferred_invoice_id',case when deferred then invoice.id else null end,
      'corrected_payment_resend_balance_due',p_balance_due),updated_at=now()
    where id=job.id returning * into job;
  return jsonb_build_object('job',to_jsonb(job),'preparing',false);
end;
$function$;
COMMIT;
