create table if not exists public.luxor_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  name text not null,
  subject text not null,
  html_body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  audience_label text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.luxor_marketing_recipients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  campaign_id uuid not null references public.luxor_marketing_campaigns(id) on delete cascade,
  email_job_id uuid references public.luxor_email_jobs(id) on delete set null,
  email text not null,
  name text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'cancelled')),
  tracking_token text not null unique,
  sent_at timestamptz,
  last_error text,
  open_count integer not null default 0 check (open_count >= 0),
  click_count integer not null default 0 check (click_count >= 0),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.luxor_marketing_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  campaign_id uuid not null references public.luxor_marketing_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.luxor_marketing_recipients(id) on delete cascade,
  event_type text not null check (event_type in ('open', 'click')),
  url text,
  ip_address text,
  user_agent text,
  device_type text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists luxor_marketing_campaigns_status_idx
  on public.luxor_marketing_campaigns (status, scheduled_for desc nulls last, created_at desc);

create index if not exists luxor_marketing_recipients_campaign_idx
  on public.luxor_marketing_recipients (campaign_id, status);

create index if not exists luxor_marketing_recipients_email_job_idx
  on public.luxor_marketing_recipients (email_job_id)
  where email_job_id is not null;

create index if not exists luxor_marketing_events_campaign_idx
  on public.luxor_marketing_events (campaign_id, event_type, created_at desc);

create index if not exists luxor_marketing_events_recipient_idx
  on public.luxor_marketing_events (recipient_id, created_at desc);

alter table public.luxor_email_jobs
  drop constraint if exists luxor_email_jobs_job_type_check;

alter table public.luxor_email_jobs
  add constraint luxor_email_jobs_job_type_check
  check (job_type in ('tour_confirmation', 'tour_reminder', 'tour_no_show_reschedule', 'contract_signature', 'marketing_campaign'));

drop trigger if exists luxor_marketing_campaigns_set_updated_at on public.luxor_marketing_campaigns;
create trigger luxor_marketing_campaigns_set_updated_at
  before update on public.luxor_marketing_campaigns
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_marketing_recipients_set_updated_at on public.luxor_marketing_recipients;
create trigger luxor_marketing_recipients_set_updated_at
  before update on public.luxor_marketing_recipients
  for each row execute function public.luxor_set_updated_at();

alter table public.luxor_marketing_campaigns enable row level security;
alter table public.luxor_marketing_recipients enable row level security;
alter table public.luxor_marketing_events enable row level security;

revoke all on table public.luxor_marketing_campaigns from anon, authenticated;
revoke all on table public.luxor_marketing_recipients from anon, authenticated;
revoke all on table public.luxor_marketing_events from anon, authenticated;

grant select, insert, update, delete on table public.luxor_marketing_campaigns to service_role;
grant select, insert, update, delete on table public.luxor_marketing_recipients to service_role;
grant select, insert, update, delete on table public.luxor_marketing_events to service_role;

drop policy if exists "Service role can manage Luxor marketing campaigns" on public.luxor_marketing_campaigns;
create policy "Service role can manage Luxor marketing campaigns"
  on public.luxor_marketing_campaigns
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor marketing recipients" on public.luxor_marketing_recipients;
create policy "Service role can manage Luxor marketing recipients"
  on public.luxor_marketing_recipients
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor marketing events" on public.luxor_marketing_events;
create policy "Service role can manage Luxor marketing events"
  on public.luxor_marketing_events
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
