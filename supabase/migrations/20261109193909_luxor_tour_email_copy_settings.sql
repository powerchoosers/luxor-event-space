-- Null copy keeps the existing code/AI behavior. Queue jobs keep rendered snapshots.
create table if not exists public.luxor_tour_email_copy_settings (
  notice_key text primary key check (notice_key in ('confirmation', 'reminder_24', 'reminder_2')),
  copy_override jsonb check (copy_override is null or jsonb_typeof(copy_override) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_tour_email_copy_settings (notice_key) values ('confirmation'), ('reminder_24'), ('reminder_2') on conflict (notice_key) do nothing;
alter table public.luxor_tour_email_copy_settings enable row level security;
revoke all on public.luxor_tour_email_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_tour_email_copy_settings to service_role;
