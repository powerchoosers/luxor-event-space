-- Provider associations are explicit; historical text names are not proof of identity.
begin;

alter table public.luxor_expense_templates
  add column if not exists vendor_id uuid references public.luxor_vendors(id) on delete restrict;

create index if not exists luxor_expense_templates_vendor_id_idx
  on public.luxor_expense_templates (vendor_id) where vendor_id is not null;

create table if not exists public.luxor_expense_template_provider_audit (
  id bigint generated always as identity primary key,
  template_id uuid not null,
  old_vendor_id uuid,
  new_vendor_id uuid,
  changed_by text,
  changed_at timestamptz not null default now()
);
alter table public.luxor_expense_template_provider_audit enable row level security;
revoke all on public.luxor_expense_template_provider_audit from public, anon, authenticated, service_role;
grant select on public.luxor_expense_template_provider_audit to service_role;

create or replace function public.luxor_audit_template_provider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.vendor_id is not null)
     or (tg_op = 'UPDATE' and old.vendor_id is distinct from new.vendor_id) then
    insert into public.luxor_expense_template_provider_audit (template_id, old_vendor_id, new_vendor_id, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.vendor_id else null end, new.vendor_id, coalesce(new.updated_by, new.created_by));
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_audit_template_provider() from public, anon, authenticated;
drop trigger if exists luxor_template_provider_audit on public.luxor_expense_templates;
create trigger luxor_template_provider_audit after insert or update of vendor_id on public.luxor_expense_templates
  for each row execute function public.luxor_audit_template_provider();

-- A provider link is a statement about the whole schedule. Existing matched
-- invoices must agree, and future invoice matches must use that same provider.
create or replace function public.luxor_guard_template_provider()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vendor_id is distinct from old.vendor_id and exists (
    select 1 from public.luxor_booking_expenses e
    join public.luxor_bills b on b.id = e.source_bill_id
    where e.recurring_template_id = new.id
      and b.vendor_id is distinct from new.vendor_id
  ) then
    raise exception 'This schedule has linked bills for a different or unconfirmed provider. Review those records before changing the provider.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_template_provider() from public, anon, authenticated;
drop trigger if exists luxor_template_provider_guard on public.luxor_expense_templates;
create trigger luxor_template_provider_guard before update of vendor_id on public.luxor_expense_templates
  for each row execute function public.luxor_guard_template_provider();

create or replace function public.luxor_guard_recurring_bill_provider()
returns trigger language plpgsql set search_path = public as $$
declare v_template_vendor uuid; v_bill_vendor uuid;
begin
  if new.recurring_template_id is null or new.source_bill_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.source_bill_id is not distinct from old.source_bill_id
     and new.recurring_template_id is not distinct from old.recurring_template_id then return new; end if;
  select vendor_id into v_template_vendor from public.luxor_expense_templates where id = new.recurring_template_id for update;
  select vendor_id into v_bill_vendor from public.luxor_bills where id = new.source_bill_id for update;
  if v_template_vendor is null or v_bill_vendor is distinct from v_template_vendor then
    raise exception 'Confirm the same provider on the bill and recurring schedule before matching.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_recurring_bill_provider() from public, anon, authenticated;
drop trigger if exists luxor_recurring_bill_provider_guard on public.luxor_booking_expenses;
create trigger luxor_recurring_bill_provider_guard before insert or update of source_bill_id, recurring_template_id on public.luxor_booking_expenses
  for each row execute function public.luxor_guard_recurring_bill_provider();

create or replace function public.luxor_guard_bill_recurring_provider()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.vendor_id is distinct from old.vendor_id and exists (
    select 1 from public.luxor_booking_expenses e
    join public.luxor_expense_templates t on t.id = e.recurring_template_id
    where e.source_bill_id = new.id and t.vendor_id is distinct from new.vendor_id
  ) then
    raise exception 'This bill is matched to a recurring schedule for another provider.' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function public.luxor_guard_bill_recurring_provider() from public, anon, authenticated;
drop trigger if exists luxor_bill_recurring_provider_guard on public.luxor_bills;
create trigger luxor_bill_recurring_provider_guard before update of vendor_id on public.luxor_bills
  for each row execute function public.luxor_guard_bill_recurring_provider();

commit;
