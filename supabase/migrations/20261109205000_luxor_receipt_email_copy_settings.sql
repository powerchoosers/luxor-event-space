-- Independent overrides; null keeps the existing receipt and queued jobs retain their snapshots.
create table if not exists public.luxor_receipt_email_copy_settings (
  key text primary key check (key in ('tour_request_received', 'newsletter_confirmation')),
  copy_override jsonb check (copy_override is null or jsonb_typeof(copy_override) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.luxor_receipt_email_copy_settings (key) values ('tour_request_received'), ('newsletter_confirmation') on conflict (key) do nothing;
alter table public.luxor_receipt_email_copy_settings enable row level security;
revoke all on public.luxor_receipt_email_copy_settings from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_receipt_email_copy_settings to service_role;
