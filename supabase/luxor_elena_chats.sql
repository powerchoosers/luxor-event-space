-- Create elena chats table
create table if not exists public.luxor_elena_chats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  user_email text not null
);

-- Enable RLS
alter table public.luxor_elena_chats enable row level security;

-- Revoke all from anon/authenticated
revoke all on table public.luxor_elena_chats from anon, authenticated;

-- Grant all to service_role
grant select, insert, update, delete on table public.luxor_elena_chats to service_role;

-- Create policy for service_role
drop policy if exists "Service role can manage Luxor elena chats" on public.luxor_elena_chats;
create policy "Service role can manage Luxor elena chats"
  on public.luxor_elena_chats
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

-- Reload schema
notify pgrst, 'reload schema';
