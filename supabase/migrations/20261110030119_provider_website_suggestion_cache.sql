create table public.luxor_provider_website_suggestions (
  lookup_key text primary key,
  state text not null check (state in ('pending', 'complete')),
  claim_id uuid not null,
  updated_at timestamptz not null default now(),
  website text,
  source text,
  check ((website is null and source is null) or (website is not null and source is not null))
);
alter table public.luxor_provider_website_suggestions enable row level security;
revoke all on public.luxor_provider_website_suggestions from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_provider_website_suggestions to service_role;
