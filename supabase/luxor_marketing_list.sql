-- Create marketing list table
create table if not exists public.luxor_marketing_list (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  email text not null unique,
  full_name text,
  source text,
  metadata jsonb not null default '{}'::jsonb
);

-- Enable RLS
alter table public.luxor_marketing_list enable row level security;

-- Revoke all from anon/authenticated
revoke all on table public.luxor_marketing_list from anon, authenticated;

-- Grant all to service_role
grant select, insert, update, delete on table public.luxor_marketing_list to service_role;

-- Create policy for service_role
drop policy if exists "Service role can manage Luxor marketing list" on public.luxor_marketing_list;
create policy "Service role can manage Luxor marketing list"
  on public.luxor_marketing_list
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
