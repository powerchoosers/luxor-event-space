create table if not exists public.luxor_phone_routing_settings (
  id text primary key default 'main' check (id = 'main'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  ring_to_number text,
  outbound_mode text not null default 'browser' check (outbound_mode in ('browser', 'ring_phone')),
  ring_browser boolean not null default true,
  ring_phone boolean not null default false,
  updated_by text,
  check (ring_to_number is null or ring_to_number ~ '^\+[1-9][0-9]{7,14}$'),
  check (ring_browser or ring_phone)
);

alter table public.luxor_phone_routing_settings enable row level security;
revoke all on table public.luxor_phone_routing_settings from public, anon, authenticated;
grant all on table public.luxor_phone_routing_settings to service_role;

create policy "Service role can manage Luxor phone routing"
  on public.luxor_phone_routing_settings for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);
