create table if not exists public.luxor_portal_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email))),
  display_name text not null check (char_length(display_name) between 1 and 100),
  role text not null default 'agent' check (role in ('owner', 'admin', 'agent')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  permissions jsonb not null default '[]'::jsonb,
  sender_email text,
  assigned_phone_number_id uuid references public.luxor_phone_numbers(id) on delete set null,
  invited_at timestamptz,
  last_signed_in_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.luxor_portal_invites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.luxor_portal_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists luxor_portal_invites_active_member_idx
  on public.luxor_portal_invites(member_id, expires_at desc)
  where used_at is null;

alter table public.luxor_portal_members enable row level security;
alter table public.luxor_portal_invites enable row level security;
revoke all on public.luxor_portal_members from anon, authenticated;
revoke all on public.luxor_portal_invites from anon, authenticated;

insert into public.luxor_portal_members (email, display_name, role, status, permissions, sender_email)
values ('booking@luxoratlaspalmas.com', 'Arianna Patterson', 'owner', 'active', '["*"]'::jsonb, 'booking@luxoratlaspalmas.com')
on conflict (email) do update
set role = 'owner', status = 'active', permissions = '["*"]'::jsonb, updated_at = timezone('utc', now());

insert into public.luxor_portal_members (email, display_name, role, status, permissions, sender_email)
values ('a.patterson@luxoratlaspalmas.com', 'Arianna Patterson', 'owner', 'active', '["*"]'::jsonb, 'booking@luxoratlaspalmas.com')
on conflict (email) do update
set role = 'owner', status = 'active', permissions = '["*"]'::jsonb, updated_at = timezone('utc', now());
