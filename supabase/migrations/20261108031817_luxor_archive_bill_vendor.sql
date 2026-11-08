begin;
alter table public.luxor_bills add column archived_at timestamptz, add column archive_changed_by text;
alter table public.luxor_vendors add column archived_at timestamptz, add column archive_changed_by text;

create table public.luxor_financial_archive_events (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('bill', 'vendor')),
  record_id uuid not null,
  action text not null check (action in ('archive', 'restore')),
  actor_email text not null check (length(btrim(actor_email)) > 0),
  created_at timestamptz not null default now()
);
alter table public.luxor_financial_archive_events enable row level security;
revoke all on public.luxor_financial_archive_events from public, anon, authenticated, service_role;
grant select on public.luxor_financial_archive_events to service_role;

-- A trigger cannot be called as an RPC. Its audit insert and marker update
-- share a transaction; reports continue to read all financial records.
create function public.luxor_audit_financial_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null then raise exception 'New records cannot start archived.' using errcode = '55000'; end if;
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at then
    if coalesce(btrim(new.archive_changed_by), '') = '' then raise exception 'The archive actor is required.' using errcode = '22023'; end if;
    insert into public.luxor_financial_archive_events(record_type, record_id, action, actor_email)
      values (case when tg_table_name = 'luxor_bills' then 'bill' else 'vendor' end, new.id,
        case when new.archived_at is null then 'restore' else 'archive' end, lower(btrim(new.archive_changed_by)));
  end if;
  return new;
end;
$$;
create trigger luxor_bills_archive_audit before insert or update of archived_at on public.luxor_bills
  for each row execute function public.luxor_audit_financial_archive();
create trigger luxor_vendors_archive_audit before insert or update of archived_at on public.luxor_vendors
  for each row execute function public.luxor_audit_financial_archive();
revoke all on function public.luxor_audit_financial_archive() from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
