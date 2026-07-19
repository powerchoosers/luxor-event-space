create table if not exists public.luxor_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  twilio_number_sid text not null unique,
  phone_number text not null unique,
  friendly_name text,
  locality text,
  region text,
  iso_country text not null default 'US',
  capabilities jsonb not null default '{}'::jsonb,
  monthly_price numeric(10, 4),
  price_unit text,
  is_active boolean not null default false,
  webhooks_configured boolean not null default false,
  purchased_by text,
  purchased_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_phone_numbers_one_active_idx
  on public.luxor_phone_numbers (is_active)
  where is_active = true;

alter table public.luxor_phone_numbers enable row level security;
revoke all on table public.luxor_phone_numbers from public, anon, authenticated;
grant all on table public.luxor_phone_numbers to service_role;

create policy "Service role can manage Luxor phone numbers"
  on public.luxor_phone_numbers for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);
