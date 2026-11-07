-- Phase 3 expenses extend the existing expense record rather than creating a
-- second spend ledger. Payments are append-only transactions against a record.
begin;

create table if not exists public.luxor_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  created_by text,
  updated_by text
);

create unique index if not exists luxor_expense_categories_name_lower_idx
  on public.luxor_expense_categories (lower(name));

insert into public.luxor_expense_categories (name, is_system, is_active)
values
  ('Rent', true, true),
  ('Utilities', true, true),
  ('Marketing', true, true),
  ('Cleaning', true, true),
  ('Supplies', true, true),
  ('Equipment', true, true),
  ('Insurance', true, true),
  ('Maintenance', true, true),
  ('Event Expenses', true, true),
  ('Labor', true, true),
  ('Decor', true, true),
  ('Professional Services', true, true),
  ('Office & Administrative', true, true),
  ('Other', true, true)
on conflict do nothing;

create table if not exists public.luxor_expense_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  category_id uuid references public.luxor_expense_categories(id) on delete restrict,
  vendor_name text,
  expected_amount numeric(12,2),
  is_variable boolean not null default false,
  frequency text not null check (frequency in ('weekly','biweekly','monthly','quarterly','annually','custom')),
  custom_interval integer,
  custom_unit text check (custom_unit is null or custom_unit in ('days','weeks','months','years')),
  first_due_date date not null,
  start_date date not null,
  end_date date,
  payment_method text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  created_by text,
  updated_by text,
  constraint luxor_expense_templates_expected_amount_check
    check ((is_variable and expected_amount is null) or (not is_variable and expected_amount > 0)),
  constraint luxor_expense_templates_custom_frequency_check
    check ((frequency = 'custom' and custom_interval between 1 and 365 and custom_unit is not null)
       or (frequency <> 'custom' and custom_interval is null and custom_unit is null)),
  constraint luxor_expense_templates_date_range_check
    check (end_date is null or end_date >= start_date)
);

create index if not exists luxor_expense_templates_active_idx
  on public.luxor_expense_templates (is_active, first_due_date, id);

create or replace function public.luxor_sync_expense_category_template_labels()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.luxor_expense_templates
       set category = new.name,
           updated_by = coalesce(new.updated_by, updated_by)
     where category_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_expense_category_sync_template_labels on public.luxor_expense_categories;
create trigger luxor_expense_category_sync_template_labels
  after update of name on public.luxor_expense_categories
  for each row execute function public.luxor_sync_expense_category_template_labels();

alter table public.luxor_booking_expenses
  add column if not exists due_date date,
  add column if not exists expense_type text,
  add column if not exists category_id uuid references public.luxor_expense_categories(id) on delete restrict,
  add column if not exists payment_method text,
  add column if not exists reference_number text,
  add column if not exists recurring_template_id uuid references public.luxor_expense_templates(id) on delete set null,
  add column if not exists billing_period_start date,
  add column if not exists billing_period_end date,
  add column if not exists source_bill_id uuid references public.luxor_bills(id) on delete restrict,
  add column if not exists client_request_id uuid,
  add column if not exists client_request_fingerprint text,
  add column if not exists created_by text,
  add column if not exists updated_by text;

do $$ begin
  alter table public.luxor_booking_expenses add constraint luxor_booking_expenses_create_request_pair_check
    check ((client_request_id is null and client_request_fingerprint is null)
        or (client_request_id is not null and client_request_fingerprint is not null and client_request_fingerprint ~ '^[0-9a-f]{64}$'));
exception when duplicate_object then null; end $$;

create unique index if not exists luxor_booking_expenses_client_request_uidx
  on public.luxor_booking_expenses (client_request_id) where client_request_id is not null;

create or replace function public.luxor_prevent_expense_request_key_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.client_request_id is distinct from old.client_request_id
     or new.client_request_fingerprint is distinct from old.client_request_fingerprint then
    raise exception 'Expense creation request keys are immutable.' using errcode = '55000';
  end if;
  return new;
end;
$$;
drop trigger if exists luxor_booking_expenses_request_key_immutable on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_request_key_immutable
  before update of client_request_id,client_request_fingerprint on public.luxor_booking_expenses
  for each row execute function public.luxor_prevent_expense_request_key_mutation();

update public.luxor_booking_expenses e
set category_id = c.id
from public.luxor_expense_categories c
where e.category_id is null and lower(btrim(e.category)) = lower(c.name);

update public.luxor_booking_expenses
set expense_type = case when booking_id is null then 'business' else 'event' end
where expense_type is null;

do $$ begin
  alter table public.luxor_booking_expenses alter column expense_type set not null;
exception when others then
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='luxor_booking_expenses' and column_name='expense_type' and is_nullable='NO') then raise; end if;
end $$;

do $$ begin
  alter table public.luxor_booking_expenses add constraint luxor_booking_expenses_expense_type_check
    check (expense_type in ('business','event') and ((expense_type = 'event') = (booking_id is not null)));
exception when duplicate_object then null; end $$;

create or replace function public.luxor_set_expense_type_from_booking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.booking_id is not null then
    new.expense_type := 'event';
  elsif new.expense_type is null then
    new.expense_type := 'business';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_booking_expenses_set_type on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_set_type
  before insert or update of booking_id, expense_type on public.luxor_booking_expenses
  for each row execute function public.luxor_set_expense_type_from_booking();

create unique index if not exists luxor_booking_expenses_recurring_period_uidx
  on public.luxor_booking_expenses (recurring_template_id, billing_period_start);
create unique index if not exists luxor_booking_expenses_source_bill_uidx
  on public.luxor_booking_expenses (source_bill_id) where source_bill_id is not null;
create index if not exists luxor_booking_expenses_due_status_idx
  on public.luxor_booking_expenses (due_date, status, expense_type);
create index if not exists luxor_booking_expenses_category_idx
  on public.luxor_booking_expenses (category_id, incurred_on desc);

-- A source bill may be linked only after the bill facts have been reviewed.
-- Locking the bill serializes linking with Operations' status updates.
create or replace function public.luxor_guard_expense_source_bill()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_bill public.luxor_bills%rowtype;
begin
  if new.source_bill_id is null then return new; end if;

  select * into v_bill from public.luxor_bills where id = new.source_bill_id for update;
  if not found then raise exception 'Source bill not found.' using errcode = 'P0002'; end if;
  if v_bill.extraction_status is distinct from 'ready' or v_bill.payment_ready_at is null
     or v_bill.amount_state is distinct from 'known' or upper(coalesce(v_bill.currency, '')) <> 'USD'
     or v_bill.amount is null or abs(v_bill.amount - new.amount) > 0.001 then
    raise exception 'Only a reviewed, payment-ready USD bill with a matching confirmed amount can be linked.' using errcode = '22023';
  end if;
  if v_bill.status = 'paid' and (tg_op <> 'UPDATE' or new.source_bill_id is distinct from old.source_bill_id or new.amount is distinct from old.amount) then
    raise exception 'A paid bill cannot be linked or have its linked expense total changed.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_booking_expenses_source_bill_guard on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_source_bill_guard
  before insert or update of source_bill_id,amount on public.luxor_booking_expenses
  for each row execute function public.luxor_guard_expense_source_bill();

create table if not exists public.luxor_expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.luxor_booking_expenses(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0 and amount = round(amount, 2)),
  transaction_type text not null check (transaction_type in ('payment','refund','reversal')),
  payment_date date not null,
  payment_method text not null check (payment_method in ('Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other')),
  reference_number text,
  notes text,
  idempotency_key text not null unique,
  created_at timestamptz not null default timezone('utc'::text, now()),
  created_by text not null
);

create index if not exists luxor_expense_payments_expense_date_idx
  on public.luxor_expense_payments (expense_id, payment_date desc, created_at desc);
create index if not exists luxor_expense_payments_date_idx
  on public.luxor_expense_payments (payment_date desc, transaction_type);

create table if not exists public.luxor_expense_audit (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  operation text not null check (operation in ('insert','update')),
  changed_at timestamptz not null default timezone('utc'::text, now()),
  changed_by text,
  old_record jsonb,
  new_record jsonb not null
);
create index if not exists luxor_expense_audit_expense_date_idx
  on public.luxor_expense_audit (expense_id, changed_at desc);

create or replace function public.luxor_audit_expense_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.luxor_expense_audit (expense_id, operation, changed_by, new_record)
    values (new.id, 'insert', coalesce(new.created_by, new.updated_by), to_jsonb(new));
    return new;
  end if;
  insert into public.luxor_expense_audit (expense_id, operation, changed_by, old_record, new_record)
  values (new.id, 'update', coalesce(new.updated_by, new.created_by), to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists luxor_booking_expenses_audit on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_audit
  after insert or update on public.luxor_booking_expenses
  for each row execute function public.luxor_audit_expense_change();

create or replace function public.luxor_prevent_expense_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Expense records are retained; cancel an expense to remove it from active totals.' using errcode = '55000';
end;
$$;
drop trigger if exists luxor_booking_expenses_no_delete on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_no_delete
  before delete on public.luxor_booking_expenses
  for each row execute function public.luxor_prevent_expense_delete();

create or replace function public.luxor_prevent_expense_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Expense payment and audit history is append-only; record an adjustment instead.' using errcode = '55000';
end;
$$;
drop trigger if exists luxor_expense_payments_immutable on public.luxor_expense_payments;
create trigger luxor_expense_payments_immutable
  before update or delete on public.luxor_expense_payments
  for each row execute function public.luxor_prevent_expense_ledger_mutation();
drop trigger if exists luxor_expense_audit_immutable on public.luxor_expense_audit;
create trigger luxor_expense_audit_immutable
  before update or delete on public.luxor_expense_audit
  for each row execute function public.luxor_prevent_expense_ledger_mutation();

create or replace function public.luxor_record_expense_payment(
  p_expense_id uuid,
  p_amount numeric,
  p_transaction_type text,
  p_payment_date date,
  p_payment_method text,
  p_reference_number text,
  p_notes text,
  p_idempotency_key text,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.luxor_booking_expenses%rowtype;
  v_payment public.luxor_expense_payments%rowtype;
  v_existing public.luxor_expense_payments%rowtype;
  v_has_history boolean;
  v_history_total numeric(12,2);
  v_legacy_paid numeric(12,2);
  v_paid_before numeric(12,2);
  v_paid_after numeric(12,2);
  v_new_status text;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a positive amount to the nearest cent.' using errcode = '22023';
  end if;
  if p_transaction_type not in ('payment','refund','reversal') then
    raise exception 'Unsupported expense transaction type.' using errcode = '22023';
  end if;
  if p_payment_date is null or p_payment_date > v_today then
    raise exception 'A valid payment date on or before today is required.' using errcode = '22023';
  end if;
  if p_payment_method not in ('Credit Card','Debit Card','Cash','Zelle','Bank Transfer','Check','Stripe','Other') then
    raise exception 'A valid payment method is required.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_idempotency_key), '') = '' or char_length(p_idempotency_key) > 200 then
    raise exception 'A stable payment request key is required.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_actor_email), '') = '' then
    raise exception 'The recording user is required.' using errcode = '22023';
  end if;

  select * into v_expense from public.luxor_booking_expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found.' using errcode = 'P0002'; end if;

  select * into v_existing from public.luxor_expense_payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.expense_id <> p_expense_id
       or v_existing.amount <> p_amount
       or v_existing.transaction_type <> p_transaction_type
       or v_existing.payment_date <> p_payment_date
       or v_existing.payment_method <> p_payment_method
       or coalesce(v_existing.reference_number, '') <> coalesce(nullif(btrim(p_reference_number), ''), '')
       or coalesce(v_existing.notes, '') <> coalesce(nullif(btrim(p_notes), ''), '') then
      raise exception 'This payment request key was already used for a different transaction.' using errcode = '23505';
    end if;
    return jsonb_build_object('payment', to_jsonb(v_existing), 'replayed', true);
  end if;
  if v_expense.status = 'cancelled' then raise exception 'Canceled expenses cannot receive payments.' using errcode = '55000'; end if;
  if v_expense.metadata->>'amount_state' = 'variable' and v_expense.amount = 0 then
    raise exception 'Enter and confirm the variable bill amount before recording a payment.' using errcode = '22023';
  end if;

  select count(*) > 0,
         coalesce(sum(case when transaction_type = 'payment' then amount else -amount end), 0)::numeric(12,2)
    into v_has_history, v_history_total
    from public.luxor_expense_payments where expense_id = p_expense_id;

  v_legacy_paid := nullif(v_expense.metadata->>'legacy_paid_amount', '')::numeric(12,2);
  if v_legacy_paid is null and not v_has_history and v_expense.status = 'paid' then
    -- The existing paid status is preserved as the known historical basis. We
    -- do not invent a payment row or a payment date for a legacy record.
    v_legacy_paid := v_expense.amount;
  end if;
  v_legacy_paid := coalesce(v_legacy_paid, 0);
  v_paid_before := v_legacy_paid + v_history_total;

  if p_transaction_type = 'payment' then
    if v_expense.amount <= v_paid_before then raise exception 'This expense has no remaining balance.' using errcode = '22023'; end if;
    if p_amount > v_expense.amount - v_paid_before then raise exception 'Payment exceeds the remaining expense balance.' using errcode = '22023'; end if;
    v_paid_after := v_paid_before + p_amount;
  else
    if v_paid_before < p_amount then raise exception 'Adjustment exceeds the amount previously paid.' using errcode = '22023'; end if;
    v_paid_after := v_paid_before - p_amount;
  end if;

  if not v_has_history and v_expense.status = 'paid' and nullif(v_expense.metadata->>'legacy_paid_amount', '') is null then
    update public.luxor_booking_expenses
       set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{legacy_paid_amount}', to_jsonb(v_legacy_paid), true),
           updated_by = p_actor_email
     where id = p_expense_id;
  end if;

  insert into public.luxor_expense_payments (
    expense_id, amount, transaction_type, payment_date, payment_method,
    reference_number, notes, idempotency_key, created_by
  ) values (
    p_expense_id, p_amount, p_transaction_type, p_payment_date, p_payment_method,
    nullif(btrim(p_reference_number), ''), nullif(btrim(p_notes), ''), p_idempotency_key, lower(btrim(p_actor_email))
  ) returning * into v_payment;

  v_new_status := case when v_paid_after >= v_expense.amount then 'paid' else 'incurred' end;
  update public.luxor_booking_expenses
     set status = v_new_status, updated_by = lower(btrim(p_actor_email))
   where id = p_expense_id;

  if v_expense.source_bill_id is not null then
    update public.luxor_bills
       set status = case
         when v_paid_after >= v_expense.amount then 'paid'
         when due_date is not null and due_date < v_today then 'overdue'
         else 'unpaid'
       end,
       updated_at = timezone('utc'::text, now())
     where id = v_expense.source_bill_id;
  end if;

  return jsonb_build_object('payment', to_jsonb(v_payment), 'replayed', false,
    'paid_amount', v_paid_after, 'remaining_balance', greatest(v_expense.amount - v_paid_after, 0),
    'status', v_new_status);
end;
$$;

-- All corrections serialize against the same expense row lock as payments.
-- Routes still validate user-friendly field formats; the database enforces
-- stale-write and balance invariants at the financial write boundary.
create or replace function public.luxor_update_expense_safely(
  p_expense_id uuid,
  p_expected_updated_at timestamptz,
  p_changes jsonb,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.luxor_booking_expenses%rowtype;
  v_result public.luxor_booking_expenses%rowtype;
  v_has_history boolean;
  v_history_total numeric(12,2);
  v_legacy_paid numeric(12,2);
  v_paid_total numeric(12,2);
  v_new_amount numeric(12,2);
  v_new_status text;
  v_metadata jsonb;
begin
  if p_expense_id is null or p_expected_updated_at is null or p_changes is null or jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'A valid expense update is required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) as item(key)
    where item.key not in ('description','amount','incurred_on','due_date','category','category_id','vendor_name','payment_method','reference_number','notes','status','booking_id','expense_type','source_bill_id','metadata')
  ) then raise exception 'Unsupported expense update field.' using errcode = '22023'; end if;
  if p_changes ? 'metadata' and jsonb_typeof(p_changes->'metadata') is distinct from 'object' then
    raise exception 'Expense metadata must be an object.' using errcode = '22023';
  end if;

  select * into v_expense from public.luxor_booking_expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found.' using errcode = 'P0002'; end if;
  if v_expense.updated_at is distinct from p_expected_updated_at then
    raise exception 'This expense changed while you were editing it. Refresh and review the latest details.' using errcode = '40001';
  end if;

  select count(*) > 0,
         coalesce(sum(case when transaction_type = 'payment' then amount else -amount end), 0)::numeric(12,2)
    into v_has_history, v_history_total
    from public.luxor_expense_payments where expense_id = p_expense_id;
  v_metadata := coalesce(v_expense.metadata, '{}'::jsonb);
  v_legacy_paid := nullif(v_metadata->>'legacy_paid_amount', '')::numeric(12,2);
  if v_legacy_paid is null and not v_has_history and v_expense.status = 'paid' then
    v_legacy_paid := v_expense.amount;
    v_metadata := jsonb_set(v_metadata, '{legacy_paid_amount}', to_jsonb(v_legacy_paid), true);
  end if;
  v_paid_total := coalesce(v_legacy_paid, 0) + v_history_total;
  v_metadata := v_metadata || coalesce(p_changes->'metadata', '{}'::jsonb);
  v_new_amount := case when p_changes ? 'amount' then (p_changes->>'amount')::numeric(12,2) else v_expense.amount end;
  if v_new_amount is null or v_new_amount <= 0 or v_new_amount <> round(v_new_amount, 2) then
    raise exception 'Enter a positive expense amount to the nearest cent.' using errcode = '22023';
  end if;
  if v_new_amount < v_paid_total then
    raise exception 'The expense total cannot be lower than its recorded paid amount. Record an adjustment first.' using errcode = '22023';
  end if;
  if v_expense.source_bill_id is not null and p_changes ? 'amount' and v_new_amount <> v_expense.amount then
    raise exception 'A bill-linked expense total is locked to its reviewed bill amount.' using errcode = '55000';
  end if;
  v_new_status := case when p_changes ? 'status' then p_changes->>'status' else v_expense.status end;
  if v_new_status not in ('planned','incurred','paid','cancelled') then raise exception 'Unsupported expense status.' using errcode = '22023'; end if;
  if v_new_status = 'paid' and v_expense.status <> 'paid' then
    raise exception 'Use a recorded payment to mark an expense paid.' using errcode = '22023';
  end if;
  if v_new_status = 'cancelled' and v_paid_total > 0 then
    raise exception 'An expense with a remaining paid balance cannot be canceled. Record a refund or reversal first.' using errcode = '55000';
  end if;
  if v_new_status = 'cancelled' and v_expense.source_bill_id is not null then
    raise exception 'A linked bill must be resolved before its expense can be canceled.' using errcode = '55000';
  end if;
  if v_new_status <> 'cancelled' then
    if v_paid_total >= v_new_amount then v_new_status := 'paid';
    elsif v_paid_total > 0 or v_new_status = 'paid' then v_new_status := 'incurred';
    end if;
  end if;

  update public.luxor_booking_expenses set
    description = case when p_changes ? 'description' then p_changes->>'description' else description end,
    amount = v_new_amount,
    incurred_on = case when p_changes ? 'incurred_on' then (p_changes->>'incurred_on')::date else incurred_on end,
    due_date = case when p_changes ? 'due_date' then nullif(p_changes->>'due_date','')::date else due_date end,
    category = case when p_changes ? 'category' then p_changes->>'category' else category end,
    category_id = case when p_changes ? 'category_id' then nullif(p_changes->>'category_id','')::uuid else category_id end,
    vendor_name = case when p_changes ? 'vendor_name' then nullif(p_changes->>'vendor_name','') else vendor_name end,
    payment_method = case when p_changes ? 'payment_method' then nullif(p_changes->>'payment_method','') else payment_method end,
    reference_number = case when p_changes ? 'reference_number' then nullif(p_changes->>'reference_number','') else reference_number end,
    notes = case when p_changes ? 'notes' then nullif(p_changes->>'notes','') else notes end,
    status = v_new_status,
    booking_id = case when p_changes ? 'booking_id' then nullif(p_changes->>'booking_id','')::uuid else booking_id end,
    expense_type = case when p_changes ? 'expense_type' then p_changes->>'expense_type' else expense_type end,
    source_bill_id = case when p_changes ? 'source_bill_id' then nullif(p_changes->>'source_bill_id','')::uuid else source_bill_id end,
    metadata = v_metadata,
    updated_by = lower(btrim(p_actor_email))
  where id = p_expense_id
  returning * into v_result;
  return to_jsonb(v_result);
end;
$$;

revoke all on function public.luxor_update_expense_safely(uuid,timestamptz,jsonb,text) from public, anon, authenticated;
grant execute on function public.luxor_update_expense_safely(uuid,timestamptz,jsonb,text) to service_role;

revoke all on function public.luxor_record_expense_payment(uuid,numeric,text,date,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.luxor_record_expense_payment(uuid,numeric,text,date,text,text,text,text,text) to service_role;

-- Existing bill status flows remain unchanged for unlinked bills. Once a bill
-- is linked, it can become paid only when explicit, immutable payment history
-- fully covers the expense; legacy paid baselines do not count as evidence.
create or replace function public.luxor_guard_linked_bill_paid_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expense public.luxor_booking_expenses%rowtype;
  v_net_paid numeric(12,2);
begin
  if new.status is distinct from 'paid' or old.status is not distinct from 'paid' then return new; end if;
  select * into v_expense from public.luxor_booking_expenses where source_bill_id = new.id limit 1;
  if not found then return new; end if;
  select coalesce(sum(case when transaction_type = 'payment' then amount else -amount end), 0)::numeric(12,2)
    into v_net_paid from public.luxor_expense_payments where expense_id = v_expense.id;
  if v_expense.status <> 'paid' or v_net_paid < v_expense.amount then
    raise exception 'A linked bill cannot be marked paid before its expense has fully recorded payment.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_bills_require_paid_expense on public.luxor_bills;
create trigger luxor_bills_require_paid_expense
  before update of status on public.luxor_bills
  for each row execute function public.luxor_guard_linked_bill_paid_status();

create or replace function public.luxor_guard_linked_bill_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_expense public.luxor_booking_expenses%rowtype;
begin
  select * into v_expense from public.luxor_booking_expenses where source_bill_id = new.id limit 1;
  if not found then return new; end if;
  if new.amount is distinct from v_expense.amount
     or upper(coalesce(new.currency, '')) <> 'USD'
     or new.amount_state is distinct from 'known'
     or new.extraction_status is distinct from 'ready'
     or new.payment_ready_at is null then
    raise exception 'A linked bill must keep the reviewed total and payment-ready facts aligned with its expense.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_bills_preserve_linked_expense_total on public.luxor_bills;
create trigger luxor_bills_preserve_linked_expense_total
  before update of amount,currency,amount_state,extraction_status,payment_ready_at on public.luxor_bills
  for each row execute function public.luxor_guard_linked_bill_amount();

alter table public.luxor_documents
  add column if not exists expense_id uuid references public.luxor_booking_expenses(id) on delete restrict;

alter table public.luxor_documents drop constraint if exists luxor_documents_document_type_check;
alter table public.luxor_documents add constraint luxor_documents_document_type_check
  check (document_type in ('proposal','invoice','contract','guest_guide','executed_contract','contract_audit','expense_receipt'));
create index if not exists luxor_documents_expense_created_idx
  on public.luxor_documents (expense_id, created_at desc) where expense_id is not null;
create index if not exists luxor_documents_receipt_type_idx
  on public.luxor_documents (document_type, created_at desc) where document_type='expense_receipt';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luxor-documents','luxor-documents',false,20971520,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

do $$
declare v_table text;
begin
  foreach v_table in array array['luxor_expense_categories','luxor_expense_templates','luxor_expense_payments','luxor_expense_audit'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select, insert, update, delete on table public.%I to service_role', v_table);
    execute format('drop policy if exists %I on public.%I', 'Service role can manage ' || v_table, v_table);
    execute format('create policy %I on public.%I for all to service_role using ((select current_setting(''role'', true)) = ''service_role'') with check ((select current_setting(''role'', true)) = ''service_role'')', 'Service role can manage ' || v_table, v_table);
  end loop;
end;
$$;

-- Payment history is written only by the balance-checking RPC; audit history
-- is written only by its trigger. Server routes can read but cannot forge it.
revoke insert, update, delete on table public.luxor_expense_payments from service_role;
grant select on table public.luxor_expense_payments to service_role;
revoke insert, update, delete on table public.luxor_expense_audit from service_role;
grant select on table public.luxor_expense_audit to service_role;

drop trigger if exists luxor_expense_categories_set_updated_at on public.luxor_expense_categories;
create trigger luxor_expense_categories_set_updated_at before update on public.luxor_expense_categories
  for each row execute function public.luxor_set_updated_at();
drop trigger if exists luxor_expense_templates_set_updated_at on public.luxor_expense_templates;
create trigger luxor_expense_templates_set_updated_at before update on public.luxor_expense_templates
  for each row execute function public.luxor_set_updated_at();

notify pgrst, 'reload schema';
commit;
