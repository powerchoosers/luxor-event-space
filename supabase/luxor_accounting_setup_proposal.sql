-- Proposed schema for coordinator review. Not a migration; do not apply directly.
-- Setup records capture user choices only. They never post a journal or verify a bank balance.
begin;
create table public.luxor_accounting_setup_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('basis', 'account', 'mapping', 'opening_balance')),
  status text not null check (status in ('draft', 'confirmed')),
  draft_id uuid references public.luxor_accounting_setup_records(id) on delete restrict,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  created_by text not null check (length(btrim(created_by)) > 0),
  check ((status = 'draft' and draft_id is null) or (status = 'confirmed' and draft_id is not null))
);
create unique index luxor_accounting_setup_one_confirmation on public.luxor_accounting_setup_records(draft_id) where status = 'confirmed';
create function public.luxor_accounting_setup_guard() returns trigger language plpgsql set search_path = public as $$
declare original public.luxor_accounting_setup_records%rowtype;
begin
  if tg_op <> 'INSERT' then raise exception 'Accounting setup records are immutable'; end if;
  if new.kind in ('mapping', 'opening_balance') and not exists (
    select 1 from public.luxor_accounting_setup_records a
    where a.id::text = new.details->>'account_id' and a.kind = 'account' and a.status = 'confirmed'
  ) then raise exception 'A confirmed account is required'; end if;
  if new.kind = 'mapping' and not exists (
    select 1 from public.luxor_expense_categories c
    where c.id::text = new.details->>'source_id' and c.is_active
      and c.name = new.details->>'source_name' and new.details->>'source_type' = 'expense_category'
  ) then raise exception 'The expense category is unavailable or changed'; end if;
  if new.kind = 'opening_balance' and new.details->>'currency' is distinct from 'USD' then
    raise exception 'Choose the balance currency explicitly';
  end if;
  if new.status = 'confirmed' then
    select * into original from public.luxor_accounting_setup_records where id = new.draft_id;
    if not found or original.status <> 'draft' or original.kind <> new.kind or original.details <> new.details then
      raise exception 'Confirmation must preserve an existing draft';
    end if;
  end if;
  return new;
end $$;
create trigger luxor_accounting_setup_guard before insert or update or delete on public.luxor_accounting_setup_records for each row execute function public.luxor_accounting_setup_guard();
alter table public.luxor_accounting_setup_records enable row level security;
revoke all on public.luxor_accounting_setup_records from public, anon, authenticated;
grant select, insert on public.luxor_accounting_setup_records to service_role;
revoke all on function public.luxor_accounting_setup_guard() from public, anon, authenticated;
commit;
