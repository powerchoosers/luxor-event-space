begin;

-- Non-sensitive business details. Existing vendor_type remains the Operations classification.
alter table public.luxor_vendors
  add column if not exists contact_person text,
  add column if not exists business_website text,
  add column if not exists mailing_address text,
  add column if not exists vendor_category text,
  add column if not exists internal_notes text;
alter table public.luxor_vendors add constraint luxor_vendor_profile_lengths_check check (
  length(coalesce(contact_person,'')) <= 200 and length(coalesce(business_website,'')) <= 500
  and length(coalesce(mailing_address,'')) <= 1000 and length(coalesce(vendor_category,'')) <= 100
  and length(coalesce(internal_notes,'')) <= 2000
);

-- Keep metadata out of the generic documents table: its download route has a
-- different authorization boundary. Objects remain in the existing private bucket.
create table public.luxor_vendor_documents (
  id uuid primary key,
  vendor_id uuid not null references public.luxor_vendors(id) on delete restrict,
  file_name text not null,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('contract','other')),
  no_tax_identifiers_confirmed boolean not null check (no_tax_identifiers_confirmed),
  created_by text not null check (length(btrim(created_by)) > 0),
  created_at timestamptz not null default now(),
  unique(vendor_id,sha256)
);
create index luxor_vendor_documents_idx on public.luxor_vendor_documents(vendor_id,created_at desc,id);
alter table public.luxor_vendor_documents enable row level security;
revoke all on public.luxor_vendor_documents from public,anon,authenticated,service_role;
grant select,insert on public.luxor_vendor_documents to service_role;
create function public.luxor_guard_active_vendor_document() returns trigger
language plpgsql set search_path = public as $$
declare v_archived timestamptz;
begin
  select archived_at into v_archived from public.luxor_vendors where id=new.vendor_id for share;
  if not found or v_archived is not null then raise exception 'An active vendor is required.' using errcode='55000'; end if;
  return new;
end $$;
create trigger luxor_vendor_document_active_guard before insert on public.luxor_vendor_documents
  for each row execute function public.luxor_guard_active_vendor_document();
revoke all on function public.luxor_guard_active_vendor_document() from public,anon,authenticated;

-- Durable immutable upload intents are created before storage writes. Claims are
-- never automatically deleted: a late storage response cannot race cleanup.
create table public.luxor_vendor_document_claims (
 id uuid primary key,
 vendor_id uuid not null references public.luxor_vendors(id) on delete restrict,
 file_name text not null,
 content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
 size_bytes integer not null check (size_bytes > 0 and size_bytes <= 20971520),
 sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
 kind text not null check (kind in ('contract','other')),
 created_by text not null check (length(btrim(created_by)) > 0),
 created_at timestamptz not null default now(),
 unique(vendor_id,sha256)
);
alter table public.luxor_vendor_document_claims enable row level security;
revoke all on public.luxor_vendor_document_claims from public,anon,authenticated,service_role;
grant select,insert on public.luxor_vendor_document_claims to service_role;
create trigger luxor_vendor_document_claim_active_guard before insert on public.luxor_vendor_document_claims
 for each row execute function public.luxor_guard_active_vendor_document();

create function public.luxor_guard_vendor_document_claim() returns trigger
language plpgsql set search_path = public as $$
begin
 if not exists (select 1 from public.luxor_vendor_document_claims c where c.id=new.id and c.vendor_id=new.vendor_id and c.file_name=new.file_name and c.content_type=new.content_type and c.size_bytes=new.size_bytes and c.sha256=new.sha256 and c.kind=new.kind) then
  raise exception 'Matching document claim required.' using errcode='23514';
 end if;
 return new;
end $$;
create trigger luxor_vendor_document_claim_guard before insert on public.luxor_vendor_documents
 for each row execute function public.luxor_guard_vendor_document_claim();
revoke all on function public.luxor_guard_vendor_document_claim() from public,anon,authenticated;

-- Plans are instructions for the owner, not payments and not an expense ledger.
create table public.luxor_bill_payment_plans (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.luxor_bills(id) on delete restrict,
  expense_id uuid not null references public.luxor_booking_expenses(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0 and amount = round(amount,2)),
  planned_date date not null,
  status text not null default 'planned' check (status in ('planned','cancelled')),
  client_request_id uuid not null unique,
  created_by text not null check (length(btrim(created_by)) > 0),
  created_at timestamptz not null default now(),
  payment_count_at_creation bigint not null default 0,
  closure_reason text check (closure_reason in ('cancelled','reviewed')),
  cancelled_by text,
  cancelled_at timestamptz,
  constraint luxor_bill_plan_cancel_check check ((status = 'planned' and cancelled_at is null and cancelled_by is null) or (status = 'cancelled' and cancelled_at is not null and length(btrim(cancelled_by)) > 0))
);
create index luxor_bill_plans_bill_date_idx on public.luxor_bill_payment_plans(bill_id,planned_date,id);
create unique index luxor_bill_active_plan_duplicate_uidx on public.luxor_bill_payment_plans(bill_id,planned_date,amount) where status='planned';
alter table public.luxor_bill_payment_plans enable row level security;
revoke all on public.luxor_bill_payment_plans from public, anon, authenticated, service_role;
grant select on public.luxor_bill_payment_plans to service_role;

create function public.luxor_create_bill_payment_plan(p_bill_id uuid,p_amount numeric,p_date date,p_request_id uuid,p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_expense public.luxor_booking_expenses%rowtype; v_bill public.luxor_bills%rowtype; v_plan public.luxor_bill_payment_plans%rowtype; v_paid numeric; v_reserved numeric; v_payment_count bigint;
begin
  if p_bill_id is null or p_request_id is null or p_date is null or p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount,2) or coalesce(btrim(p_actor),'') = '' then raise exception 'Invalid payment plan.' using errcode='22023'; end if;
  select * into v_expense from public.luxor_booking_expenses where source_bill_id=p_bill_id for update;
  if not found then raise exception 'Link a reviewed bill to an expense first.' using errcode='22023'; end if;
  select * into v_bill from public.luxor_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found.' using errcode='P0002'; end if;
  select * into v_plan from public.luxor_bill_payment_plans where client_request_id=p_request_id;
  if found then
    if v_plan.bill_id<>p_bill_id or v_plan.amount<>p_amount or v_plan.planned_date<>p_date then raise exception 'Request key already used for different plan.' using errcode='23505'; end if;
    return jsonb_build_object('plan',to_jsonb(v_plan),'replayed',true);
  end if;
  if p_date < (now() at time zone 'America/Chicago')::date then raise exception 'Choose today or a future date.' using errcode='22023'; end if;
  if v_bill.archived_at is not null or v_bill.status='paid' or v_bill.extraction_status<>'ready' or v_bill.payment_ready_at is null or v_bill.duplicate_of_bill_id is not null or v_bill.arithmetic_status='mismatch' or v_bill.amount_state is distinct from 'known' or upper(v_bill.currency)<>'USD' or v_expense.status in ('cancelled','paid') or v_expense.amount<>v_bill.amount then raise exception 'Bill and expense require review before planning.' using errcode='22023'; end if;
  if nullif(v_expense.metadata->>'legacy_paid_amount','') is not null then raise exception 'Legacy payment history requires review before planning.' using errcode='22023'; end if;
  select coalesce(sum(case when transaction_type='payment' then amount else -amount end),0) into v_paid from public.luxor_expense_payments where expense_id=v_expense.id;
  if v_paid<0 or v_paid>v_expense.amount then raise exception 'Payment history needs reconciliation.' using errcode='22023'; end if;
  select count(*) into v_payment_count from public.luxor_expense_payments where expense_id=v_expense.id;
  select coalesce(sum(amount),0) into v_reserved from public.luxor_bill_payment_plans where expense_id=v_expense.id and status='planned';
  if p_amount>v_expense.amount-v_paid-v_reserved then raise exception 'Plan exceeds the unplanned remaining balance.' using errcode='22023'; end if;
  insert into public.luxor_bill_payment_plans(bill_id,expense_id,amount,planned_date,client_request_id,created_by,payment_count_at_creation) values(p_bill_id,v_expense.id,p_amount,p_date,p_request_id,lower(btrim(p_actor)),v_payment_count) returning * into v_plan;
  return jsonb_build_object('plan',to_jsonb(v_plan),'replayed',false);
end $$;
create function public.luxor_cancel_bill_payment_plan(p_plan_id uuid,p_actor text,p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.luxor_bill_payment_plans%rowtype; v_expense_id uuid;
begin
  if p_plan_id is null or coalesce(btrim(p_actor),'')='' or p_reason is null or p_reason not in ('cancelled','reviewed') then raise exception 'Invalid cancellation.' using errcode='22023'; end if;
  select expense_id into v_expense_id from public.luxor_bill_payment_plans where id=p_plan_id;
  if not found then raise exception 'Plan not found.' using errcode='P0002'; end if;
  perform 1 from public.luxor_booking_expenses where id=v_expense_id for update;
  select * into v_plan from public.luxor_bill_payment_plans where id=p_plan_id for update;
  if v_plan.status='cancelled' then return to_jsonb(v_plan); end if;
  update public.luxor_bill_payment_plans set status='cancelled',closure_reason=p_reason,cancelled_at=clock_timestamp(),cancelled_by=lower(btrim(p_actor)) where id=p_plan_id returning * into v_plan;
  return to_jsonb(v_plan);
end $$;
revoke all on function public.luxor_create_bill_payment_plan(uuid,numeric,date,uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_cancel_bill_payment_plan(uuid,text,text) from public,anon,authenticated;
grant execute on function public.luxor_create_bill_payment_plan(uuid,numeric,date,uuid,text) to service_role;
grant execute on function public.luxor_cancel_bill_payment_plan(uuid,text,text) to service_role;

-- Immutable payment rows are compared in one snapshot; no payment is matched to a plan.
create function public.luxor_read_bill_payment_plans(p_bill_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'requires_review', p.status='planned' and p.payment_count_at_creation <
      (select count(*) from public.luxor_expense_payments x where x.expense_id=p.expense_id)
  ) order by p.planned_date,p.id), '[]'::jsonb)
  from public.luxor_bill_payment_plans p where p.bill_id=p_bill_id;
$$;
revoke all on function public.luxor_read_bill_payment_plans(uuid) from public,anon,authenticated;
grant execute on function public.luxor_read_bill_payment_plans(uuid) to service_role;

-- Saved preferences only. No worker or notification delivery is enabled here.
create table public.luxor_bill_reminder_preferences (
  bill_id uuid primary key references public.luxor_bills(id) on delete restrict,
  seven_days boolean not null default false,
  three_days boolean not null default false,
  due_day boolean not null default false,
  overdue boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null check (length(btrim(updated_by)) > 0)
);
alter table public.luxor_bill_reminder_preferences enable row level security;
revoke all on public.luxor_bill_reminder_preferences from public,anon,authenticated,service_role;
grant select,insert,update on public.luxor_bill_reminder_preferences to service_role;
notify pgrst, 'reload schema';
commit;
