create table if not exists public.luxor_installment_reminder_copy_settings (
  key text primary key check (key in ('installment_7_days_before', 'installment_1_day_overdue')),
  copy_override jsonb check (copy_override is null or jsonb_typeof(copy_override) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_installment_reminder_copy_settings (key) values ('installment_7_days_before'), ('installment_1_day_overdue') on conflict (key) do nothing;
alter table public.luxor_installment_reminder_copy_settings enable row level security;
revoke all on public.luxor_installment_reminder_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_installment_reminder_copy_settings to service_role;
