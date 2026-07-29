-- Saved marketing lists
create table if not exists public.luxor_marketing_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  name text not null check (name = trim(name) and char_length(name) between 1 and 120),
  description text,
  is_builtin boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_marketing_lists_name_uidx on public.luxor_marketing_lists (lower(name));

insert into public.luxor_marketing_lists (name, description, is_builtin, metadata)
select 'Marketing', 'All contacts who can receive Luxor marketing email.', true, '{"system_key":"marketing"}'::jsonb
where not exists (select 1 from public.luxor_marketing_lists where lower(name) = 'marketing');

-- List memberships. Source remains the contact's acquisition source; list_id
-- identifies the saved audience.
create table if not exists public.luxor_marketing_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  email text not null check (email = lower(trim(email))),
  full_name text,
  source text not null default 'Uncategorized' check (char_length(source) between 1 and 120),
  list_id uuid not null references public.luxor_marketing_lists(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_marketing_list_email_list_uidx
  on public.luxor_marketing_list (email, list_id);

create unique index if not exists luxor_marketing_list_email_source_uidx
  on public.luxor_marketing_list (email, source);

create index if not exists luxor_marketing_list_source_idx
  on public.luxor_marketing_list (source, created_at desc);

create index if not exists luxor_marketing_list_list_created_idx
  on public.luxor_marketing_list (list_id, created_at desc);

-- Enable RLS
alter table public.luxor_marketing_list enable row level security;
alter table public.luxor_marketing_lists enable row level security;

-- Revoke all from anon/authenticated
revoke all on table public.luxor_marketing_list from anon, authenticated;
revoke all on table public.luxor_marketing_lists from anon, authenticated;

-- Grant all to service_role
grant select, insert, update, delete on table public.luxor_marketing_list to service_role;
grant select, insert, update, delete on table public.luxor_marketing_lists to service_role;

-- Create policy for service_role
drop policy if exists "Service role can manage Luxor marketing list" on public.luxor_marketing_list;
create policy "Service role can manage Luxor marketing list"
  on public.luxor_marketing_list
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor marketing lists" on public.luxor_marketing_lists;
create policy "Service role can manage Luxor marketing lists"
  on public.luxor_marketing_lists
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create or replace function public.set_default_luxor_marketing_list_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marketing_list_id uuid;
  existing_source text;
begin
  if new.list_id is null then
    select id into marketing_list_id from public.luxor_marketing_lists
    where metadata ->> 'system_key' = 'marketing' limit 1;
    select source into existing_source from public.luxor_marketing_list
    where email = new.email and list_id = marketing_list_id limit 1;
    new.list_id := marketing_list_id;
    if existing_source is not null then new.source := existing_source; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_default_luxor_marketing_list_id() from public, anon, authenticated;
grant execute on function public.set_default_luxor_marketing_list_id() to service_role;

drop trigger if exists set_default_luxor_marketing_list_id on public.luxor_marketing_list;
create trigger set_default_luxor_marketing_list_id
  before insert on public.luxor_marketing_list
  for each row execute function public.set_default_luxor_marketing_list_id();

notify pgrst, 'reload schema';
