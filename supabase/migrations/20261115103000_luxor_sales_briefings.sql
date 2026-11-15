-- Migration: 20261115103000_luxor_sales_briefings.sql
-- Owner coaching copy for the daily sales briefing email.

create table if not exists public.luxor_sales_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_date date not null,
  headline text,
  coaching_markdown text,
  focus_items jsonb not null default '[]'::jsonb,
  author text not null default 'marcus',
  status text not null default 'ready'
    check (status in ('draft', 'ready', 'sent', 'skipped', 'preview')),
  sent_at timestamptz,
  resend_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint luxor_sales_briefings_briefing_date_unique unique (briefing_date)
);

create index if not exists idx_luxor_sales_briefings_briefing_date
  on public.luxor_sales_briefings (briefing_date desc);

alter table public.luxor_sales_briefings enable row level security;

revoke all on table public.luxor_sales_briefings from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_sales_briefings to service_role;

drop trigger if exists luxor_sales_briefings_set_updated_at on public.luxor_sales_briefings;
create trigger luxor_sales_briefings_set_updated_at
  before update on public.luxor_sales_briefings
  for each row execute function public.luxor_set_updated_at();

comment on table public.luxor_sales_briefings is
  'Daily sales briefing coaching content and delivery audit for the owner morning email.';