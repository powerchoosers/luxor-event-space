-- Work With Us partner and market vendor applications (server routes only; no anon/authenticated policies).

create table public.luxor_market_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text not null unique check (char_length(slug) between 2 and 80),
  title text not null check (char_length(title) between 1 and 200),
  event_date date not null,
  location text not null check (char_length(location) between 1 and 240)
);

create trigger luxor_market_events_set_updated_at
  before update on public.luxor_market_events
  for each row execute function public.luxor_set_updated_at();

insert into public.luxor_market_events (id, slug, title, event_date, location)
values (
  'a8c4e2f1-6b3d-4e9a-9c1f-2d8e7b5a4c30',
  'christmas-market-2026',
  'Luxor Christmas Market',
  '2026-12-12',
  'Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237'
)
on conflict (slug) do nothing;

create table public.luxor_partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  application_type text not null check (
    application_type in (
      'market_vendor',
      'preferred_vendor',
      'workshop',
      'sponsorship',
      'activity_partner',
      'general'
    )
  ),
  event_id uuid references public.luxor_market_events (id) on delete set null,
  status text not null default 'new' check (
    status in ('new', 'under_review', 'approved', 'declined', 'archived')
  ),
  payment_status text check (payment_status is null or payment_status in ('payment_pending', 'confirmed')),
  business_name text not null check (char_length(business_name) between 1 and 200),
  contact_name text not null check (char_length(contact_name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  phone text not null check (char_length(phone) between 7 and 40),
  instagram_handle text check (instagram_handle is null or char_length(instagram_handle) <= 120),
  city text check (city is null or char_length(city) <= 160),
  website_url text check (website_url is null or char_length(website_url) <= 500),
  vendor_category text check (vendor_category is null or char_length(vendor_category) <= 120),
  selected_space text check (
    selected_space is null or selected_space in ('single', 'double', 'premium')
  ),
  selected_space_price_cents integer check (
    selected_space_price_cents is null or selected_space_price_cents in (4500, 6000, 7500)
  ),
  requires_electricity boolean,
  additional_displays jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_displays) = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 8000),
  submission_key uuid not null,
  ip_hash text check (ip_hash is null or char_length(ip_hash) <= 128),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  constraint luxor_partner_applications_market_vendor_space
    check (
      application_type <> 'market_vendor'
      or (
        selected_space is not null
        and selected_space_price_cents is not null
        and event_id is not null
      )
    )
);

create unique index luxor_partner_applications_submission_key_idx
  on public.luxor_partner_applications (submission_key);

create index luxor_partner_applications_type_status_created_idx
  on public.luxor_partner_applications (application_type, status, created_at desc);

create index luxor_partner_applications_event_created_idx
  on public.luxor_partner_applications (event_id, created_at desc)
  where event_id is not null;

create trigger luxor_partner_applications_set_updated_at
  before update on public.luxor_partner_applications
  for each row execute function public.luxor_set_updated_at();

create table public.luxor_partner_application_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.luxor_partner_applications (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) between 8 and 500),
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (char_length(content_type) between 3 and 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sort_order smallint not null default 0 check (sort_order >= 0 and sort_order < 8)
);

create index luxor_partner_application_files_app_sort_idx
  on public.luxor_partner_application_files (application_id, sort_order, created_at);

alter table public.luxor_market_events enable row level security;
alter table public.luxor_partner_applications enable row level security;
alter table public.luxor_partner_application_files enable row level security;

revoke all on table public.luxor_market_events from anon, authenticated;
revoke all on table public.luxor_partner_applications from anon, authenticated;
revoke all on table public.luxor_partner_application_files from anon, authenticated;

grant select, insert, update, delete on table public.luxor_market_events to service_role;
grant select, insert, update, delete on table public.luxor_partner_applications to service_role;
grant select, insert, update, delete on table public.luxor_partner_application_files to service_role;

create policy "Service role can manage Luxor market events"
  on public.luxor_market_events
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create policy "Service role can manage Luxor partner applications"
  on public.luxor_partner_applications
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create policy "Service role can manage Luxor partner application files"
  on public.luxor_partner_application_files
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

update storage.buckets
set
  file_size_limit = greatest(file_size_limit, 10485760),
  allowed_mime_types = (
    select array(
      select distinct unnest(
        coalesce(allowed_mime_types, array[]::text[])
        || array['image/jpeg', 'image/png', 'image/heic', 'image/heif']::text[]
      )
    )
  )
where id = 'luxor-documents';

notify pgrst, 'reload schema';