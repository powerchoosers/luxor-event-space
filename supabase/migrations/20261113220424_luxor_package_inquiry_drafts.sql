create table if not exists public.luxor_package_inquiry_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  locale text not null default 'en' check (locale in ('en', 'es')),
  configurator_input jsonb not null,
  quote_snapshot jsonb not null,
  pricing_config_version integer,
  inquiry_id uuid references public.luxor_inquiries (id) on delete set null
);

create index if not exists luxor_package_inquiry_drafts_expires_at_idx
  on public.luxor_package_inquiry_drafts (expires_at);

create index if not exists luxor_package_inquiry_drafts_inquiry_id_idx
  on public.luxor_package_inquiry_drafts (inquiry_id);

alter table public.luxor_package_inquiry_drafts enable row level security;

revoke all on table public.luxor_package_inquiry_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_package_inquiry_drafts to service_role;

drop policy if exists "Service role can manage package inquiry drafts" on public.luxor_package_inquiry_drafts;
create policy "Service role can manage package inquiry drafts"
  on public.luxor_package_inquiry_drafts
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.luxor_package_inquiry_drafts is
  'Short-lived server copies of website package configurator selections used for inquiry and tour handoff.';
