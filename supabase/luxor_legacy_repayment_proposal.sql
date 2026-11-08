-- ISOLATED DRAFT, NOT A MIGRATION. No production execution or access grants.
-- Assumes the expense ledger and append-only protection already exist.
begin;
create table public.luxor_legacy_refund_repayment_allocations (
 id uuid primary key default gen_random_uuid(),
 expense_id uuid not null references public.luxor_booking_expenses(id) on delete restrict,
 refund_id uuid not null references public.luxor_expense_payments(id) on delete restrict,
 repayment_id uuid not null unique references public.luxor_expense_payments(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0), created_by text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index on public.luxor_legacy_refund_repayment_allocations(expense_id,refund_id);
alter table public.luxor_legacy_refund_repayment_allocations enable row level security;
revoke all on public.luxor_legacy_refund_repayment_allocations from public,anon,authenticated,service_role;
create function public.luxor_no_legacy_allocation_change() returns trigger language plpgsql as $$
begin raise exception 'Allocations are append-only' using errcode='55000'; end; $$;
create trigger no_legacy_allocation_change before update or delete on public.luxor_legacy_refund_repayment_allocations for each row execute function public.luxor_no_legacy_allocation_change();
revoke all on function public.luxor_no_legacy_allocation_change() from public,anon,authenticated;

-- Trusted server supplies only claims from a verified signed cookie; SQL cannot verify the HMAC.
create function public.luxor_draft_auth_legacy_writer(p_actor text,p_issued bigint,p_expires bigint)
returns void language plpgsql security definer set search_path=public as $$
declare m public.luxor_portal_members%rowtype; now_ms numeric;
begin
 select * into m from public.luxor_portal_members where email=lower(btrim(p_actor)) for share;
 now_ms:=floor(extract(epoch from clock_timestamp())*1000);
 if not found or m.status<>'active' or not (m.role='owner' or (jsonb_typeof(m.permissions)='array' and m.permissions ? 'operations' and m.permissions ? 'finances'))
 or p_issued is null or p_expires is null or p_issued<=0 or p_issued>now_ms or p_expires<=now_ms or p_expires::numeric-p_issued::numeric>604800000
 or (m.sessions_revoked_at is not null and p_issued<=floor(extract(epoch from m.sessions_revoked_at)*1000)) then
 raise exception 'Authorized portal session required' using errcode='42501'; end if;
end; $$;
revoke all on function public.luxor_draft_auth_legacy_writer(text,bigint,bigint) from public,anon,authenticated,service_role;
create table public.luxor_legacy_repayment_corrections(
 id uuid primary key default gen_random_uuid(), allocation_id uuid not null references public.luxor_legacy_refund_repayment_allocations(id) on delete restrict,
 reversal_id uuid not null unique references public.luxor_expense_payments(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0), reason text not null check(char_length(btrim(reason)) between 1 and 4000), created_by text not null,
 created_at timestamptz not null default clock_timestamp());
alter table public.luxor_legacy_repayment_corrections enable row level security;
revoke all on public.luxor_legacy_repayment_corrections from public,anon,authenticated,service_role;
create trigger no_legacy_correction_change before update or delete on public.luxor_legacy_repayment_corrections for each row execute function public.luxor_no_legacy_allocation_change();
create function public.luxor_draft_legacy_refund_repayment(
 p_expense uuid,p_refund uuid,p_amount numeric,p_date date,p_method text,
 p_reference text,p_notes text,p_key text,p_actor text,p_issued bigint,p_expires bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 e public.luxor_booking_expenses%rowtype;
 r public.luxor_expense_payments%rowtype;
 old_payment public.luxor_expense_payments%rowtype;
 new_payment public.luxor_expense_payments%rowtype;
 a public.luxor_legacy_refund_repayment_allocations%rowtype;
 allocated numeric;
begin
 if p_expense is null or p_refund is null or p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)
 or p_date is null or p_date>(now() at time zone 'America/Chicago')::date
 or p_method is null or p_method not in ('Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other')
 or coalesce(btrim(p_key),'')='' or char_length(p_key)>200 or coalesce(btrim(p_actor),'')='' then
   raise exception 'Invalid repayment' using errcode='22023';
 end if;
 perform public.luxor_draft_auth_legacy_writer(p_actor,p_issued,p_expires);
 select * into e from public.luxor_booking_expenses where id=p_expense for update;
 if p_expires<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'Authorized portal session required' using errcode='42501'; end if;
 if not found then raise exception 'Expense not found' using errcode='P0002'; end if;
 select * into old_payment from public.luxor_expense_payments where idempotency_key=p_key;
 if found then
  select * into a from public.luxor_legacy_refund_repayment_allocations where repayment_id=old_payment.id;
  if not found or old_payment.expense_id is distinct from p_expense or a.refund_id is distinct from p_refund
   or old_payment.transaction_type is distinct from 'payment' or old_payment.amount is distinct from p_amount
   or old_payment.payment_date is distinct from p_date or old_payment.payment_method is distinct from p_method
   or old_payment.reference_number is distinct from nullif(btrim(p_reference),'') or old_payment.notes is distinct from nullif(btrim(p_notes),'')
   or old_payment.created_by is distinct from lower(btrim(p_actor)) then raise exception 'Request key conflict' using errcode='23505'; end if;
  return jsonb_build_object('payment',to_jsonb(old_payment),'replayed',true,'balance_state','unresolved');
 end if;
 if e.status='cancelled' or not coalesce(e.metadata ? 'legacy_paid_amount',false) then
  raise exception 'Expense requires legacy review' using errcode='55000'; end if;
 select * into r from public.luxor_expense_payments where id=p_refund and expense_id=p_expense and transaction_type='refund';
 if not found or p_date<r.payment_date then raise exception 'Select a preceding refund for this expense' using errcode='22023'; end if;
 -- No guessing whether an earlier payment or reversal has already offset this refund.
 if exists(select 1 from public.luxor_expense_payments p where p.expense_id=p_expense and
  ((p.transaction_type='reversal' and not exists (select 1 from public.luxor_legacy_repayment_corrections z where z.reversal_id=p.id)) or (p.transaction_type='payment' and not exists
   (select 1 from public.luxor_legacy_refund_repayment_allocations x where x.repayment_id=p.id)))) then
  raise exception 'Existing transactions require review before allocation' using errcode='55000'; end if;
 select coalesce(sum(x.amount-coalesce((select sum(z.amount) from public.luxor_legacy_repayment_corrections z where z.allocation_id=x.id),0)),0) into allocated from public.luxor_legacy_refund_repayment_allocations x where x.expense_id=p_expense and x.refund_id=p_refund;
 if p_amount>r.amount-allocated then raise exception 'Repayment exceeds refund allocation' using errcode='22023'; end if;
 if p_expires<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'Authorized portal session required' using errcode='42501'; end if;
 insert into public.luxor_expense_payments(expense_id,amount,transaction_type,payment_date,payment_method,reference_number,notes,idempotency_key,created_by)
 values(p_expense,p_amount,'payment',p_date,p_method,nullif(btrim(p_reference),''),nullif(btrim(p_notes),''),p_key,lower(btrim(p_actor))) returning * into new_payment;
 insert into public.luxor_legacy_refund_repayment_allocations(expense_id,refund_id,repayment_id,amount,created_by)
 values(p_expense,p_refund,new_payment.id,p_amount,lower(btrim(p_actor)));
 -- An unresolved historical baseline is not a cash amount, date or settlement.
 return jsonb_build_object('payment',to_jsonb(new_payment),'replayed',false,'balance_state','unresolved');
end; $$;
revoke all on function public.luxor_draft_legacy_refund_repayment(uuid,uuid,numeric,date,text,text,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;
-- Recorded cash reversal only; non-financial typo annotations need a separate workflow.
create function public.luxor_draft_correct_legacy_repayment(
 p_expense uuid,p_allocation uuid,p_amount numeric,p_date date,p_method text,
 p_reason text,p_key text,p_actor text,p_issued bigint,p_expires bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.luxor_booking_expenses%rowtype; a public.luxor_legacy_refund_repayment_allocations%rowtype;
 oldp public.luxor_expense_payments%rowtype; repayment public.luxor_expense_payments%rowtype;
 reversal public.luxor_expense_payments%rowtype; oldc public.luxor_legacy_repayment_corrections%rowtype; total numeric;
begin
 if p_expense is null or p_allocation is null or p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)
 or p_date is null or p_date>(now() at time zone 'America/Chicago')::date
 or p_method is null or p_method not in ('Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other')
 or char_length(btrim(coalesce(p_reason,''))) not between 1 and 4000 or coalesce(btrim(p_key),'')='' or char_length(p_key)>200
 or coalesce(btrim(p_actor),'')='' then raise exception 'Invalid correction' using errcode='22023'; end if;
 perform public.luxor_draft_auth_legacy_writer(p_actor,p_issued,p_expires);
 select * into e from public.luxor_booking_expenses where id=p_expense for update;
 if not found then raise exception 'Expense not found' using errcode='P0002'; end if;
 if p_expires<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'Authorized portal session required' using errcode='42501'; end if;
 select * into oldp from public.luxor_expense_payments where idempotency_key=p_key;
 if found then
  select * into oldc from public.luxor_legacy_repayment_corrections where reversal_id=oldp.id;
  if not found or oldp.expense_id is distinct from p_expense or oldc.allocation_id is distinct from p_allocation
   or oldp.transaction_type is distinct from 'reversal' or oldp.amount is distinct from p_amount or oldp.payment_date is distinct from p_date
   or oldp.payment_method is distinct from p_method or oldc.reason is distinct from btrim(p_reason)
   or oldp.created_by is distinct from lower(btrim(p_actor)) then raise exception 'Request key conflict' using errcode='23505'; end if;
  return jsonb_build_object('payment',to_jsonb(oldp),'replayed',true,'balance_state','unresolved');
 end if;
 if e.status='cancelled' or not coalesce(e.metadata ? 'legacy_paid_amount',false) then raise exception 'Expense requires legacy review' using errcode='55000'; end if;
 select * into a from public.luxor_legacy_refund_repayment_allocations where id=p_allocation and expense_id=p_expense;
 if not found then raise exception 'Allocation not found' using errcode='P0002'; end if;
 select * into repayment from public.luxor_expense_payments where id=a.repayment_id;
 if not found or p_date<repayment.payment_date then raise exception 'Invalid reversal date' using errcode='22023'; end if;
 select coalesce(sum(amount),0) into total from public.luxor_legacy_repayment_corrections where allocation_id=a.id;
 if p_amount>a.amount-total then raise exception 'Correction exceeds remaining repayment' using errcode='22023'; end if;
 if p_expires<=floor(extract(epoch from clock_timestamp())*1000) then raise exception 'Authorized portal session required' using errcode='42501'; end if;
 insert into public.luxor_expense_payments(expense_id,amount,transaction_type,payment_date,payment_method,reference_number,notes,idempotency_key,created_by)
 values(p_expense,p_amount,'reversal',p_date,p_method,null,btrim(p_reason),p_key,lower(btrim(p_actor))) returning * into reversal;
 insert into public.luxor_legacy_repayment_corrections(allocation_id,reversal_id,amount,reason,created_by) values(a.id,reversal.id,p_amount,btrim(p_reason),lower(btrim(p_actor)));
 return jsonb_build_object('payment',to_jsonb(reversal),'replayed',false,'balance_state','unresolved');
end; $$;
revoke all on function public.luxor_draft_correct_legacy_repayment(uuid,uuid,numeric,date,text,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;

-- Preserve the unresolved marker and a paid-without-ledger state until an
-- explicitly authorized reconciliation exists. This cannot repair a marker
-- erased before this candidate runs.
create function public.luxor_draft_protect_legacy_marker() returns trigger language plpgsql set search_path=public as $$
declare unresolved boolean;
begin
 unresolved := coalesce(old.metadata ? 'legacy_paid_amount',false) or
   (old.status='paid' and not exists(select 1 from public.luxor_expense_payments where expense_id=old.id));
 if unresolved and (new.metadata is distinct from old.metadata or new.status is distinct from old.status
    or new.amount is distinct from old.amount or new.source_bill_id is distinct from old.source_bill_id) then
  raise exception 'Legacy payment history requires review' using errcode='55000'; end if;
 return new;
end; $$;
create trigger luxor_draft_protect_legacy_marker before update of metadata,status,amount,source_bill_id on public.luxor_booking_expenses
 for each row execute function public.luxor_draft_protect_legacy_marker();
revoke all on function public.luxor_draft_protect_legacy_marker() from public,anon,authenticated;
-- Isolated integration candidate: existing RPC remains the implementation for
-- nonlegacy expenses, while legacy writes require the separately authorized path.
alter function public.luxor_record_expense_payment(uuid,numeric,text,date,text,text,text,text,text) rename to luxor_draft_nonlegacy_payment_inner;
revoke all on function public.luxor_draft_nonlegacy_payment_inner(uuid,numeric,text,date,text,text,text,text,text) from public,anon,authenticated,service_role;
create function public.luxor_record_expense_payment(p_expense_id uuid,p_amount numeric,p_transaction_type text,p_payment_date date,p_payment_method text,p_reference_number text,p_notes text,p_idempotency_key text,p_actor_email text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.luxor_booking_expenses%rowtype;
begin
 select * into e from public.luxor_booking_expenses where id=p_expense_id for update;
 if not found then raise exception 'Expense not found' using errcode='P0002'; end if;
 if exists(select 1 from public.luxor_expense_payments where idempotency_key=p_idempotency_key) then
  return public.luxor_draft_nonlegacy_payment_inner(p_expense_id,p_amount,p_transaction_type,p_payment_date,p_payment_method,p_reference_number,p_notes,p_idempotency_key,p_actor_email); end if;
 if coalesce(e.metadata ? 'legacy_paid_amount',false) or (e.status='paid' and not exists(select 1 from public.luxor_expense_payments where expense_id=e.id)) then
  raise exception 'Legacy payment history requires review' using errcode='55000'; end if;
 return public.luxor_draft_nonlegacy_payment_inner(p_expense_id,p_amount,p_transaction_type,p_payment_date,p_payment_method,p_reference_number,p_notes,p_idempotency_key,p_actor_email);
end; $$;
revoke all on function public.luxor_record_expense_payment(uuid,numeric,text,date,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.luxor_record_expense_payment(uuid,numeric,text,date,text,text,text,text,text) to service_role;
commit;
