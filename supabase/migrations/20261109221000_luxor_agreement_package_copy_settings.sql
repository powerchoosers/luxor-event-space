create table if not exists public.luxor_agreement_package_copy_settings (
  key text primary key check (key in ('package')),
  copy_override jsonb check (copy_override is null or jsonb_typeof(copy_override) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_agreement_package_copy_settings (key) values ('package') on conflict (key) do nothing;
alter table public.luxor_agreement_package_copy_settings enable row level security;
revoke all on public.luxor_agreement_package_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_agreement_package_copy_settings to service_role;
