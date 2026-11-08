-- Proposed review-only storage. Not a migration; coordinator must review and migrate it.
-- Requires luxor_accounting_setup_records. No matching, posting, or bank reconciliation occurs.
begin;
create table public.luxor_statement_imports (
  id uuid primary key,
  account_id uuid not null references public.luxor_accounting_setup_records(id) on delete restrict,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  preview_sha256 text not null check (preview_sha256 ~ '^[a-f0-9]{64}$'),
  filename text not null check (char_length(filename) between 1 and 150),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  choices jsonb not null check (jsonb_typeof(choices) = 'object'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 5000),
  imported_by text not null check (length(btrim(imported_by)) > 0),
  imported_at timestamptz not null default now(),
  unique (account_id, file_sha256)
);
create function public.luxor_statement_import_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Imported statements are immutable'; end if;
  if not exists (select 1 from public.luxor_accounting_setup_records a where a.id = new.account_id and a.kind = 'account' and a.status = 'confirmed' and a.details->>'classification' in ('asset', 'liability')) then
    raise exception 'A confirmed asset or liability account is required';
  end if;
  return new;
end $$;
create trigger luxor_statement_import_guard before insert or update or delete on public.luxor_statement_imports for each row execute function public.luxor_statement_import_guard();
alter table public.luxor_statement_imports enable row level security;
revoke all on public.luxor_statement_imports from public, anon, authenticated;
grant select, insert on public.luxor_statement_imports to service_role;
revoke all on function public.luxor_statement_import_guard() from public, anon, authenticated;
commit;
