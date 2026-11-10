-- Reconcile an expected period with a bill already recorded as an expense.
-- The original expense, documents, and payments remain on that record.
begin;
alter table public.luxor_booking_expenses
  add column if not exists matched_expense_id uuid references public.luxor_booking_expenses(id) on delete restrict;
create unique index if not exists luxor_expense_matched_expense_uidx
  on public.luxor_booking_expenses (matched_expense_id) where matched_expense_id is not null;

create or replace function public.luxor_guard_reconciled_occurrence()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.matched_expense_id is not null and (new.matched_expense_id is distinct from old.matched_expense_id or new.status is distinct from old.status or new.recurring_template_id is distinct from old.recurring_template_id or new.source_bill_id is distinct from old.source_bill_id) then
    raise exception 'This period is reconciled to an existing expense and cannot be reopened or reassigned.' using errcode='55000';
  end if;
  if new.source_bill_id is distinct from old.source_bill_id and exists (select 1 from public.luxor_booking_expenses where matched_expense_id=old.id) then
    raise exception 'This expense is reconciled to a recurring period and its bill cannot be reassigned.' using errcode='55000';
  end if;
  return new;
end $$;
revoke all on function public.luxor_guard_reconciled_occurrence() from public, anon, authenticated;
drop trigger if exists luxor_reconciled_occurrence_guard on public.luxor_booking_expenses;
create trigger luxor_reconciled_occurrence_guard before update on public.luxor_booking_expenses
  for each row execute function public.luxor_guard_reconciled_occurrence();

create or replace function public.luxor_guard_reconciled_receipt()
returns trigger language plpgsql set search_path = public as $$
declare v_matched uuid;
begin
  if new.expense_id is null then return new; end if;
  select matched_expense_id into v_matched from public.luxor_booking_expenses where id=new.expense_id for update;
  if v_matched is not null then raise exception 'Attach the receipt to the matched bill expense instead.' using errcode='55000'; end if;
  return new;
end $$;
revoke all on function public.luxor_guard_reconciled_receipt() from public, anon, authenticated;
drop trigger if exists luxor_reconciled_receipt_guard on public.luxor_documents;
create trigger luxor_reconciled_receipt_guard before insert or update of expense_id on public.luxor_documents
  for each row execute function public.luxor_guard_reconciled_receipt();

create or replace function public.luxor_guard_reconciled_provider()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vendor_id is not distinct from old.vendor_id then return new; end if;
  if tg_table_name = 'luxor_bills' then
    if exists (select 1 from public.luxor_booking_expenses e join public.luxor_booking_expenses p on p.matched_expense_id=e.id join public.luxor_expense_templates t on t.id=p.recurring_template_id where e.source_bill_id=new.id and t.vendor_id is distinct from new.vendor_id) then
      raise exception 'This bill is reconciled to a period for another provider.' using errcode='55000';
    end if;
  elsif exists (select 1 from public.luxor_booking_expenses p join public.luxor_booking_expenses e on e.id=p.matched_expense_id join public.luxor_bills b on b.id=e.source_bill_id where p.recurring_template_id=new.id and b.vendor_id is distinct from new.vendor_id) then
    raise exception 'This schedule has a reconciled bill for another provider.' using errcode='55000';
  end if;
  return new;
end $$;
revoke all on function public.luxor_guard_reconciled_provider() from public, anon, authenticated;
drop trigger if exists luxor_reconciled_bill_provider_guard on public.luxor_bills;
drop trigger if exists luxor_reconciled_template_provider_guard on public.luxor_expense_templates;
create trigger luxor_reconciled_bill_provider_guard before update of vendor_id on public.luxor_bills for each row execute function public.luxor_guard_reconciled_provider();
create trigger luxor_reconciled_template_provider_guard before update of vendor_id on public.luxor_expense_templates for each row execute function public.luxor_guard_reconciled_provider();

create or replace function public.luxor_reconcile_bill_occurrence(
  p_bill_id uuid, p_occurrence_id uuid, p_bill_expense_id uuid,
  p_expected_occurrence_updated_at timestamptz, p_expected_expense_updated_at timestamptz,
  p_actor text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_period public.luxor_booking_expenses%rowtype; v_source public.luxor_booking_expenses%rowtype; v_bill public.luxor_bills%rowtype; v_vendor uuid;
begin
  if p_bill_id is null or p_occurrence_id is null or p_bill_expense_id is null or p_occurrence_id=p_bill_expense_id or nullif(btrim(p_actor),'') is null then
    raise exception 'Choose a bill and an expected period.' using errcode='22023';
  end if;
  -- Both expense rows are locked in ID order; payment and plan writers lock
  -- the expense first, so their history cannot race this decision.
  perform 1 from public.luxor_booking_expenses where id in (p_occurrence_id,p_bill_expense_id) order by id for update;
  select * into v_period from public.luxor_booking_expenses where id=p_occurrence_id;
  if not found then raise exception 'Expected period not found.' using errcode='P0002'; end if;
  select * into v_source from public.luxor_booking_expenses where id=p_bill_expense_id;
  if not found then raise exception 'Bill expense not found.' using errcode='P0002'; end if;
  if v_period.matched_expense_id=p_bill_expense_id and v_source.source_bill_id=p_bill_id then
    return jsonb_build_object('replayed',true,'occurrence_id',p_occurrence_id,'expense_id',p_bill_expense_id);
  end if;
  if v_period.updated_at is distinct from p_expected_occurrence_updated_at or v_source.updated_at is distinct from p_expected_expense_updated_at then
    raise exception 'A record changed. Refresh and review the match again.' using errcode='40001';
  end if;
  select * into v_bill from public.luxor_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found.' using errcode='P0002'; end if;
  select vendor_id into v_vendor from public.luxor_expense_templates where id=v_period.recurring_template_id for update;
  if v_vendor is null or v_bill.vendor_id is distinct from v_vendor then raise exception 'Confirm the same provider on the bill and schedule first.' using errcode='55000'; end if;
  if v_source.source_bill_id is distinct from p_bill_id or v_source.recurring_template_id is not null or v_source.status='cancelled'
    or v_bill.archived_at is not null or v_bill.extraction_status is distinct from 'ready' or v_bill.payment_ready_at is null
    or v_bill.duplicate_of_bill_id is not null or v_bill.amount_state is distinct from 'known' or upper(coalesce(v_bill.currency,'')) <> 'USD'
    or v_bill.amount is null or v_bill.amount <= 0 or v_source.amount is distinct from v_bill.amount then
    raise exception 'The bill and its expense need review before matching.' using errcode='55000';
  end if;
  if v_period.recurring_template_id is null or v_period.source_bill_id is not null or v_period.matched_expense_id is not null or v_period.status not in ('planned','incurred')
    or coalesce(v_period.metadata,'{}'::jsonb) ? 'legacy_paid_amount'
    or exists (select 1 from public.luxor_expense_payments where expense_id=v_period.id)
    or exists (select 1 from public.luxor_documents where expense_id=v_period.id)
    or exists (select 1 from public.luxor_bill_payment_plans where expense_id=v_period.id) then
    raise exception 'This period has linked history or is no longer available. Review it before matching.' using errcode='55000';
  end if;
  update public.luxor_booking_expenses set status='cancelled', matched_expense_id=v_source.id,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('reconciled_to_bill_id',p_bill_id,'reconciled_by',lower(btrim(p_actor)),'reconciled_at',clock_timestamp()),
    updated_by=lower(btrim(p_actor)) where id=v_period.id;
  return jsonb_build_object('replayed',false,'occurrence_id',p_occurrence_id,'expense_id',p_bill_expense_id);
end $$;
revoke all on function public.luxor_reconcile_bill_occurrence(uuid,uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.luxor_reconcile_bill_occurrence(uuid,uuid,uuid,timestamptz,timestamptz,text) to service_role;
commit;
