-- Shared payment-collection details shown only after a client has completed
-- their Event Agreement. Zelle details are operational, not payment proof:
-- the owner still confirms every Cash or Zelle payment before it is recorded.
create table if not exists public.luxor_payment_settings (
  id text primary key default 'main' check (id = 'main'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  zelle_recipient text,
  zelle_qr_code_url text,
  updated_by text,
  check (zelle_recipient is null or char_length(btrim(zelle_recipient)) between 1 and 160),
  check (zelle_qr_code_url is null or zelle_qr_code_url ~ '^https://')
);

alter table public.luxor_payment_settings enable row level security;
revoke all on table public.luxor_payment_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_payment_settings to service_role;

drop policy if exists "Service role can manage Luxor payment settings" on public.luxor_payment_settings;
create policy "Service role can manage Luxor payment settings"
  on public.luxor_payment_settings
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
