create table public.luxor_agreement_owner_copy_settings (
  key text primary key check (key = 'agreement_owner'),
  copy_override jsonb check (copy_override is null or jsonb_typeof(copy_override) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_agreement_owner_copy_settings (key) values ('agreement_owner');
alter table public.luxor_agreement_owner_copy_settings enable row level security;
revoke all on public.luxor_agreement_owner_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_agreement_owner_copy_settings to service_role;
