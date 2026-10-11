-- Additive only. Apply/review before enabling LUXOR_SAME_DAY_BOOKING_ENABLED.
-- The catalog benefit remains INACTIVE until reviewed deployment is complete.
alter table public.luxor_promotions drop constraint luxor_promotions_discount_type_check;
alter table public.luxor_promotions add constraint luxor_promotions_discount_type_check
  check (discount_type in ('percent', 'fixed', 'complimentary', 'tax_coverage'));

insert into public.luxor_promotions(name, code, discount_type, value, active, metadata)
values ('Same-Day Booking — LUXOR Pays Your Sales Tax', 'LUXOR-SAME-DAY-TAX', 'tax_coverage', 1, false,
  '{"benefit":"same_day_tax_coverage","value_is_marker":true,"time_zone":"America/Chicago"}'::jsonb)
on conflict (code) do nothing;

alter table public.luxor_invoices
  add column if not exists original_proposal_created_at timestamptz,
  add column if not exists same_day_booking_status text check (same_day_booking_status in ('pending','eligible','review','revision_required')),
  add column if not exists same_day_booking_completed_at timestamptz,
  add column if not exists same_day_booking_review_reason text;

create table public.luxor_same_day_payment_evidence (
  payment_id uuid primary key references public.luxor_payments(id),
  master_invoice_id uuid not null references public.luxor_invoices(id),
  event_id text not null,
  successful_at timestamptz,
  timing_verified boolean not null default false,
  terms_fingerprint text not null,
  eligibility text not null check (eligibility in ('pending','eligible','review')),
  reason text,
  recorded_at timestamptz not null default now()
);
alter table public.luxor_same_day_payment_evidence enable row level security;
revoke all on public.luxor_same_day_payment_evidence from anon, authenticated;
grant all on public.luxor_same_day_payment_evidence to service_role;
create index luxor_same_day_evidence_master_idx on public.luxor_same_day_payment_evidence(master_invoice_id);

create or replace function public.luxor_preserve_same_day_origin() returns trigger
language plpgsql set search_path = public as $$
declare expected timestamptz; deadline timestamptz; benefit jsonb; prior public.luxor_invoices;
begin
  benefit := new.proposal_context->'same_day_booking';
  if new.supersedes_invoice_id is not null and (tg_op='INSERT' or (old.original_proposal_created_at is null and (benefit is not null or new.original_proposal_created_at is not null))) then
    with recursive ancestry as (
      select i.*,0 as depth,array[i.id] as seen from public.luxor_invoices i where i.id=new.supersedes_invoice_id and i.invoice_kind='event' and i.inquiry_id is not distinct from new.inquiry_id
      union all
      select i.*,a.depth+1,a.seen||i.id from ancestry a join public.luxor_invoices i on i.id=a.supersedes_invoice_id
        where a.original_proposal_created_at is null and a.proposal_context->>'original_proposal_created_at' is null
          and i.invoice_kind='event' and i.inquiry_id is not distinct from new.inquiry_id and not i.id=any(a.seen) and a.depth<99
    ) select coalesce(original_proposal_created_at,(proposal_context->>'original_proposal_created_at')::timestamptz,created_at) into expected
      from ancestry where original_proposal_created_at is not null or proposal_context->>'original_proposal_created_at' is not null or supersedes_invoice_id is null order by depth limit 1;
    if expected is null then raise exception 'Original proposal revision history could not be verified'; end if;
  end if;
  if tg_op='INSERT' and new.supersedes_invoice_id is not null then
    select * into prior from public.luxor_invoices where id=new.supersedes_invoice_id for update;
    if coalesce((prior.proposal_context->'same_day_booking'->>'coverage_amount')::numeric,0)>0 then
      if prior.same_day_booking_status='eligible' or prior.status='paid'
        or exists(select 1 from public.luxor_same_day_payment_evidence where master_invoice_id=prior.id)
        or exists(select 1 from public.luxor_payments where booking_id=prior.booking_id and status='paid')
        or (prior.proposal_context->>'same_day_revised_invoice_id' is not null and prior.proposal_context->>'same_day_revised_invoice_id'<>new.id::text)
        then raise exception 'A receipt or another revision requires owner reconciliation'; end if;
      if clock_timestamp() < (prior.proposal_context->'same_day_booking'->>'expires_at')::timestamptz then raise exception 'Original same-day deadline has not passed'; end if;
      update public.luxor_invoices set same_day_booking_status='revision_required',
        proposal_context=proposal_context||jsonb_build_object('same_day_revised_invoice_id',new.id) where id=prior.id;
    end if;
  end if;
  if tg_op='UPDATE' and old.proposal_context->'same_day_booking' is not null and old.price_locked_at is not null and
    (benefit is distinct from old.proposal_context->'same_day_booking' or new.total is distinct from old.total
      or new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.tax_rate is distinct from old.tax_rate or new.discount_amount is distinct from old.discount_amount
      or new.promotion_snapshot is distinct from old.promotion_snapshot
      or new.proposal_context->'pricing_snapshot' is distinct from old.proposal_context->'pricing_snapshot')
    then raise exception 'Published same-day pricing is immutable; issue a revision'; end if;
  if benefit is null then
    if tg_op='UPDATE' and old.original_proposal_created_at is not null and new.original_proposal_created_at is distinct from old.original_proposal_created_at then raise exception 'Original proposal creation timestamp is immutable'; end if;
    if tg_op='INSERT' and new.supersedes_invoice_id is not null then new.original_proposal_created_at:=expected; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.original_proposal_created_at is not null then
    expected := old.original_proposal_created_at;
  elsif new.supersedes_invoice_id is not null then
    -- Resolved from immutable ancestry above, including pre-feature revisions.
    null;
  else expected := new.created_at; end if;
  if expected is null then raise exception 'Original proposal creation timestamp is required'; end if;
  deadline := (((expected at time zone 'America/Chicago')::date + 1)::timestamp at time zone 'America/Chicago');
  if (benefit->>'original_created_at')::timestamptz is distinct from expected
    or (benefit->>'expires_at')::timestamptz is distinct from deadline
    or (new.original_proposal_created_at is not null and new.original_proposal_created_at is distinct from expected)
    then raise exception 'Same-day origin and deadline cannot be reset'; end if;
  new.original_proposal_created_at := expected;
  if tg_op='UPDATE' and old.price_locked_at is not null and
    (new.total is distinct from old.total or new.line_items is distinct from old.line_items or benefit is distinct from old.proposal_context->'same_day_booking')
    then raise exception 'Published same-day pricing is immutable; issue a revision'; end if;
  return new;
end $$;
create trigger luxor_same_day_origin_guard before insert or update on public.luxor_invoices
  for each row execute function public.luxor_preserve_same_day_origin();

-- Capture actual digital signing time under the same lock as payment/revision.
create or replace function public.luxor_guard_same_day_signature() returns trigger
language plpgsql set search_path=public as $$
declare master public.luxor_invoices; booking public.luxor_bookings; benefit jsonb; instant timestamptz;
begin
  if new.status<>'signed' or old.status='signed' then return new; end if;
  select i.* into master from public.luxor_invoices i join public.luxor_bookings b on b.invoice_id=i.id where b.id=new.booking_id for update of i;
  benefit:=master.proposal_context->'same_day_booking';
  if coalesce((benefit->>'coverage_amount')::numeric,0)<=0 then return new; end if;
  select * into booking from public.luxor_bookings where id=new.booking_id for update;
  instant:=clock_timestamp();
  if master.status='cancelled' or booking.status in ('cancelled','completed') or master.same_day_booking_status='revision_required'
    or instant >= (benefit->>'expires_at')::timestamptz or coalesce(new.metadata->>'sameDayTermsFingerprint','')=''
    or exists(select 1 from public.luxor_inquiries where id=master.inquiry_id and status='closed_lost')
    then raise exception 'Same-day benefit expired; revised pricing and a fresh agreement are required'; end if;
  new.signed_at:=instant;
  new.metadata:=new.metadata||jsonb_build_object('clientSignatureRecordedAt',instant);
  update public.luxor_bookings set contract_status='signed',contract_signed_at=instant where id=booking.id;
  return new;
end $$;
create trigger luxor_same_day_signature_guard before update on public.luxor_signature_requests
  for each row execute function public.luxor_guard_same_day_signature();

-- Ledger receipt + evidence + qualification are one transaction. Concurrent
-- duplicate events and manual/Card races serialize on the proposal row.
create or replace function public.luxor_record_same_day_payment(
  p_invoice_id uuid,p_booking_id uuid,p_amount numeric,p_paid_at timestamptz,
  p_processor text,p_reference text,p_method text,p_event_id text,p_timing_verified boolean,
  p_fingerprint text,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare child public.luxor_invoices; master public.luxor_invoices; booking public.luxor_bookings;
  receipt public.luxor_payments; evidence public.luxor_same_day_payment_evidence;
  signature public.luxor_signature_requests; paper public.luxor_documents; signed_instant timestamptz; inquiry public.luxor_inquiries; benefit jsonb; origin timestamptz; deadline timestamptz;
  decision text := 'review'; why text; total_paid numeric; completion timestamptz; duplicate boolean:=false;
begin
  if p_processor is null or p_processor not in ('stripe','manual') or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or coalesce(p_reference,'')='' or coalesce(p_event_id,'')='' then
    raise exception 'Invalid same-day payment evidence'; end if;
  select * into child from public.luxor_invoices where id=p_invoice_id;
  select * into master from public.luxor_invoices where id=child.parent_invoice_id for update;
  if master.id is null then raise exception 'Master proposal required'; end if;
  select * into child from public.luxor_invoices where id=p_invoice_id for update;
  select * into booking from public.luxor_bookings where id=p_booking_id for update;
  select * into inquiry from public.luxor_inquiries where id=master.inquiry_id for update;
  benefit := master.proposal_context->'same_day_booking';
  if benefit is null or (benefit->>'coverage_amount')::numeric<=0 then raise exception 'Same-day benefit required'; end if;
  origin := master.original_proposal_created_at;
  deadline := (((origin at time zone 'America/Chicago')::date + 1)::timestamp at time zone 'America/Chicago');
  select * into signature from public.luxor_signature_requests where booking_id=booking.id and status='signed' order by signed_at desc limit 1;
  signed_instant:=signature.signed_at;
  if signature.id is null then
    select * into paper from public.luxor_documents where id=(booking.metadata->>'manual_signed_agreement_document_id')::uuid;
    if paper.invoice_id=master.id and paper.document_type='executed_contract'
      and paper.metadata->>'same_day_terms_fingerprint'=p_fingerprint and paper.metadata->>'signature_timing_verified'='true'
      then signed_instant:=(paper.metadata->>'actual_signed_at')::timestamptz; end if;
  end if;
  select * into receipt from public.luxor_payments where processor=p_processor and processor_reference=p_reference;
  duplicate := receipt.id is not null;
  if duplicate and (receipt.invoice_id is distinct from child.id or receipt.amount<>p_amount) then raise exception 'Payment identity conflict'; end if;
  if not duplicate then
    insert into public.luxor_payments(booking_id,invoice_id,inquiry_id,amount,status,payment_method,paid_at,processor,processor_reference,metadata)
    values(booking.id,child.id,master.inquiry_id,p_amount,'pending',p_method,p_paid_at,p_processor,p_reference,
      coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('same_day_payment',true,'receipt_received',true,'recorded_at',now())) returning * into receipt;
  end if;
  select * into evidence from public.luxor_same_day_payment_evidence where payment_id=receipt.id;
  if duplicate and evidence.eligibility='eligible' and master.same_day_booking_status='eligible' then
    return jsonb_build_object('payment',to_jsonb(receipt),'eligibility','eligible','duplicate',true);
  end if;
  if evidence.timing_verified then p_paid_at:=evidence.successful_at; p_timing_verified:=true; p_fingerprint:=evidence.terms_fingerprint; p_event_id:=evidence.event_id; end if;
  if child.invoice_kind is distinct from 'deposit' or child.booking_id is distinct from booking.id or master.booking_id is distinct from booking.id or booking.invoice_id is distinct from master.id then why:='Payment does not match proposal and booking';
  elsif master.status='cancelled' or booking.status in ('cancelled','completed') or inquiry.status='closed_lost' or master.same_day_booking_status='revision_required' then why:='Proposal or booking withdrawn, completed, or revised';
  elsif p_metadata->>'competing_checkout'='true' or (p_processor='manual' and child.stripe_checkout_session_id is not null) or exists(select 1 from public.luxor_same_day_payment_evidence where master_invoice_id=master.id and eligibility='eligible' and payment_id<>receipt.id) then why:='Another payment is received or processing; review both receipts';
  elsif p_processor='stripe' and (child.stripe_checkout_session_id is distinct from p_reference or p_metadata->>'currency' is distinct from 'usd' or p_metadata->>'same_day_fingerprint' is distinct from p_fingerprint) then why:='Stale or mismatched checkout';
  elsif coalesce(p_fingerprint,'')='' or p_fingerprint is distinct from child.proposal_context->>'same_day_payment_fingerprint' then why:='Agreement version does not match payment';
  elsif p_timing_verified is distinct from true or p_paid_at is null or p_paid_at>now()+interval '1 minute' then why:='Successful receipt time requires verification';
  elsif signed_instant is null and booking.contract_status is not null and booking.contract_status<>'signed'
    and p_paid_at>=origin and p_paid_at<deadline and p_amount=child.total then decision:='pending'; why:='Verified receipt awaiting the exact signed agreement';
  elsif signed_instant is null or booking.contract_status is distinct from 'signed' or signed_instant is distinct from booking.contract_signed_at
    or (signature.id is not null and signature.metadata->>'sameDayTermsFingerprint' is distinct from p_fingerprint) then why:='Exact signed agreement could not be verified';
  elsif signed_instant<origin or signed_instant>=deadline or p_paid_at<origin or p_paid_at>=deadline then why:='Agreement and payment did not both complete on the original proposal day';
  elsif p_amount<>child.total then why:='Payment amount does not equal the locked initial payment';
  else decision:='pending'; end if;
  insert into public.luxor_same_day_payment_evidence(payment_id,master_invoice_id,event_id,successful_at,timing_verified,terms_fingerprint,eligibility,reason)
    values(receipt.id,master.id,p_event_id,p_paid_at,p_timing_verified,p_fingerprint,decision,why)
    on conflict(payment_id) do update set event_id=excluded.event_id,successful_at=excluded.successful_at,timing_verified=excluded.timing_verified,
      terms_fingerprint=excluded.terms_fingerprint,eligibility=excluded.eligibility,reason=excluded.reason;
  if decision='pending' and signed_instant is not null then
    select coalesce(sum(p.amount),0),max(e.successful_at) into total_paid,completion
      from public.luxor_payments p join public.luxor_same_day_payment_evidence e on e.payment_id=p.id
      where p.invoice_id=child.id and p.status in ('paid','pending') and e.eligibility<>'review' and e.timing_verified;
    if total_paid>=booking.deposit_required and total_paid>=child.total then
      decision:='eligible'; completion:=greatest(completion,signed_instant);
      update public.luxor_same_day_payment_evidence set eligibility='eligible' where payment_id=receipt.id;
      update public.luxor_payments set status='paid' where id=receipt.id returning * into receipt;
      update public.luxor_invoices set same_day_booking_status='eligible',same_day_booking_completed_at=coalesce(same_day_booking_completed_at,completion),same_day_booking_review_reason=null where id=master.id;
    end if;
  elsif decision='review' and master.same_day_booking_status is distinct from 'eligible' and booking.status is distinct from 'completed' then
    update public.luxor_invoices set same_day_booking_status='review',same_day_booking_review_reason=why where id=master.id;
    update public.luxor_bookings set metadata=metadata||jsonb_build_object('same_day_payment_review',true,'same_day_payment_review_reason',why,'same_day_payment_review_invoice_id',child.id) where id=booking.id;
  end if;
  if decision='eligible' then
    update public.luxor_invoices set status='paid',paid_at=coalesce(paid_at,p_paid_at) where id=child.id;
  end if;
  -- A duplicate/retry never overwrites an already recorded trusted receipt time.
  if p_timing_verified and evidence.timing_verified is distinct from true then update public.luxor_payments set paid_at=p_paid_at,
    metadata=metadata||jsonb_build_object('timing_verification',coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('verified_at',clock_timestamp(),'successful_event_id',p_event_id)) where id=receipt.id returning * into receipt; end if;
  return jsonb_build_object('payment',to_jsonb(receipt),'eligibility',decision,'duplicate',duplicate);
end $$;
revoke all on function public.luxor_record_same_day_payment(uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_record_same_day_payment(uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,text,jsonb) to service_role;

-- Recovery and payment side effects recheck owner state in one transaction.
-- Patches are server-only; current metadata is merged rather than replaced.
create or replace function public.luxor_finalize_same_day_booking(
  p_booking_id uuid,p_booking_patch jsonb,p_inquiry_patch jsonb,p_require_eligible boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare master public.luxor_invoices; booking public.luxor_bookings; inquiry public.luxor_inquiries;
  final_id uuid; receipt_at timestamptz; inquiry_metadata jsonb; next_stage text;
begin
  select i.* into master from public.luxor_invoices i join public.luxor_bookings b on b.invoice_id=i.id where b.id=p_booking_id for update of i;
  select * into booking from public.luxor_bookings where id=p_booking_id for update;
  select * into inquiry from public.luxor_inquiries where id=master.inquiry_id for update;
  if master.id is null or coalesce((master.proposal_context->'same_day_booking'->>'coverage_amount')::numeric,0)<=0 then raise exception 'Same-day proposal required'; end if;
  if master.booking_id is distinct from booking.id or booking.invoice_id is distinct from master.id or master.status='cancelled' or booking.status in ('cancelled','completed')
    or inquiry.status='closed_lost' or booking.contract_status is distinct from 'signed'
    or (p_require_eligible and master.same_day_booking_status is distinct from 'eligible') then
    return jsonb_build_object('applied',false,'booking',to_jsonb(booking),'inquiry',case when inquiry.id is null then null else to_jsonb(inquiry) end);
  end if;
  select min(e.successful_at) into receipt_at from public.luxor_same_day_payment_evidence e join public.luxor_payments p on p.id=e.payment_id
    join public.luxor_invoices c on c.id=p.invoice_id where e.master_invoice_id=master.id and e.eligibility='eligible' and e.timing_verified
    and p.status='paid' and p.booking_id=booking.id and c.parent_invoice_id=master.id and c.invoice_kind='deposit' and p.amount=c.total;
  if p_require_eligible and receipt_at is null then raise exception 'Qualified initial receipt required'; end if;
  if p_booking_patch->'metadata'->>'final_balance_invoice_id' is not null then
    final_id:=(p_booking_patch->'metadata'->>'final_balance_invoice_id')::uuid;
    if not exists(select 1 from public.luxor_invoices where id=final_id and parent_invoice_id=master.id and booking_id=booking.id and invoice_kind='final_balance') then raise exception 'Final invoice does not match booking'; end if;
  end if;
  update public.luxor_bookings set
    status=case when p_require_eligible and p_booking_patch->>'status'='confirmed' then 'confirmed' else status end,
    booked_at=case when p_require_eligible then coalesce(booked_at,master.same_day_booking_completed_at) else booked_at end,
    security_deposit_amount=case when p_booking_patch ? 'security_deposit_amount' then (p_booking_patch->>'security_deposit_amount')::numeric else security_deposit_amount end,
    security_deposit_status=coalesce(p_booking_patch->>'security_deposit_status',security_deposit_status),
    metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_booking_patch->'metadata','{}'::jsonb)||
      case when p_require_eligible then jsonb_build_object('deposit_paid_at',coalesce(metadata->>'deposit_paid_at',receipt_at::text),
        'reservation_confirmed_at',coalesce(metadata->>'reservation_confirmed_at',master.same_day_booking_completed_at::text),
        'same_day_payment_review',false,'same_day_payment_review_reason',null) else '{}'::jsonb end
    where id=booking.id returning * into booking;
  if inquiry.id is not null then
    inquiry_metadata:=coalesce(p_inquiry_patch->'metadata','{}'::jsonb);
    if inquiry.metadata->>'latest_payment_at' is not null and
      (inquiry_metadata->>'latest_payment_at' is null or (inquiry_metadata->>'latest_payment_at')::timestamptz < (inquiry.metadata->>'latest_payment_at')::timestamptz
        or ((inquiry_metadata->>'latest_payment_at')::timestamptz = (inquiry.metadata->>'latest_payment_at')::timestamptz and inquiry_metadata->>'latest_paid_invoice_id' is distinct from inquiry.metadata->>'latest_paid_invoice_id')) then
      inquiry_metadata:=inquiry_metadata-'latest_payment_at'-'latest_paid_invoice_id';
    end if;
    next_stage:=coalesce(p_inquiry_patch->>'pipeline_stage','planning');
    if (case inquiry.pipeline_stage when 'contract' then 1 when 'deposit' then 2 when 'planning' then 3 when 'final_payment' then 4 when 'event' then 5 when 'closing' then 6 when 'complete' then 7 else 0 end)
      > (case next_stage when 'contract' then 1 when 'deposit' then 2 when 'planning' then 3 when 'final_payment' then 4 when 'event' then 5 when 'closing' then 6 when 'complete' then 7 else 0 end) then next_stage:=inquiry.pipeline_stage; end if;
    update public.luxor_inquiries set
      status=case when master.same_day_booking_status='eligible' then 'booked' else status end,
      pipeline_stage=case when master.same_day_booking_status='eligible' then next_stage
        when status not in ('booked','closed_lost') then 'deposit' else pipeline_stage end,
      metadata=coalesce(metadata,'{}'::jsonb)||inquiry_metadata
      where id=inquiry.id returning * into inquiry;
  end if;
  return jsonb_build_object('applied',true,'booking',to_jsonb(booking),'inquiry',case when inquiry.id is null then null else to_jsonb(inquiry) end);
end $$;
revoke all on function public.luxor_finalize_same_day_booking(uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.luxor_finalize_same_day_booking(uuid,jsonb,jsonb,boolean) to service_role;

-- Later scheduled funds remain visible if an owner closes the booking while
-- Stripe/manual recording is in flight. Never rewrite a completed snapshot.
create or replace function public.luxor_record_same_day_scheduled_payment(
  p_invoice_id uuid,p_booking_id uuid,p_amount numeric,p_paid_at timestamptz,p_processor text,
  p_reference text,p_method text,p_event_id text,p_timing_verified boolean,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare child public.luxor_invoices; master public.luxor_invoices; booking public.luxor_bookings;
  inquiry public.luxor_inquiries; receipt public.luxor_payments; review boolean; reason text;
begin
  if p_processor is null or p_processor not in ('stripe','manual') or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or coalesce(p_reference,'')='' or coalesce(p_event_id,'')='' then raise exception 'Invalid scheduled receipt'; end if;
  select * into child from public.luxor_invoices where id=p_invoice_id;
  select * into master from public.luxor_invoices where id=child.parent_invoice_id for update;
  select * into child from public.luxor_invoices where id=p_invoice_id for update;
  select * into booking from public.luxor_bookings where id=p_booking_id for update;
  select * into inquiry from public.luxor_inquiries where id=master.inquiry_id for update;
  if master.id is null or coalesce((master.proposal_context->'same_day_booking'->>'coverage_amount')::numeric,0)<=0 then raise exception 'Same-day proposal required'; end if;
  review:=coalesce(master.same_day_booking_status is distinct from 'eligible' or master.status='cancelled' or booking.status in ('cancelled','completed') or inquiry.status='closed_lost'
    or child.status='cancelled' or child.invoice_kind is null or child.invoice_kind not in ('final_balance','security_deposit') or child.booking_id is distinct from booking.id or booking.invoice_id is distinct from master.id or master.booking_id is distinct from booking.id
    or booking.contract_status is distinct from 'signed' or p_amount is distinct from child.total or p_timing_verified is distinct from true or p_paid_at is null or p_paid_at>clock_timestamp()+interval '1 minute'
    or (p_processor='manual' and (child.stripe_checkout_session_id is not null or p_metadata->>'competing_checkout'='true'))
    or (p_processor='stripe' and (child.stripe_checkout_session_id is distinct from p_reference or p_metadata->>'currency' is distinct from 'usd')),true);
  reason:=case when review then 'Received scheduled funds require owner review; booking or payment state changed or proof is incomplete' else null end;
  select * into receipt from public.luxor_payments where processor=p_processor and processor_reference=p_reference;
  if receipt.id is not null then
    if receipt.invoice_id is distinct from child.id or receipt.amount is distinct from p_amount then raise exception 'Scheduled payment identity conflict'; end if;
    return jsonb_build_object('payment',to_jsonb(receipt),'reviewRequired',review or receipt.status<>'paid','duplicate',true);
  end if;
  if child.status='paid' or exists(select 1 from public.luxor_payments where invoice_id=child.id and status='paid') then
    review:=true; reason:='Additional received funds require owner review; this scheduled payment was already paid';
  end if;
  insert into public.luxor_payments(booking_id,invoice_id,inquiry_id,amount,status,payment_method,paid_at,processor,processor_reference,metadata)
    values(booking.id,child.id,master.inquiry_id,p_amount,case when review then 'pending' else 'paid' end,p_method,p_paid_at,p_processor,p_reference,
      coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('receipt_received',true,'same_day_payment',true,'timing_verified',p_timing_verified,'successful_event_id',p_event_id,'review_reason',reason,'recorded_at',clock_timestamp())) returning * into receipt;
  if not review then update public.luxor_invoices set status='paid',paid_at=coalesce(paid_at,p_paid_at) where id=child.id; end if;
  return jsonb_build_object('payment',to_jsonb(receipt),'reviewRequired',review,'duplicate',false);
end $$;
revoke all on function public.luxor_record_same_day_scheduled_payment(uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.luxor_record_same_day_scheduled_payment(uuid,uuid,numeric,timestamptz,text,text,text,text,boolean,jsonb) to service_role;
