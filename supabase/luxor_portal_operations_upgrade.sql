alter table public.luxor_inquiries
  add column if not exists pipeline_stage text not null default 'inquiry'
    check (pipeline_stage in ('inquiry', 'tour', 'proposal_sent', 'book_reserve', 'planning_begins', 'final_details', 'setup_event_day', 'after_event', 'closed_lost')),
  add column if not exists tour_attendance_status text default 'pending'
    check (tour_attendance_status in ('pending', 'attended', 'no_show', 'rescheduled', 'cancelled')),
  add column if not exists tour_confirmed_at timestamptz,
  add column if not exists tour_reminder_sent_at timestamptz,
  add column if not exists tour_no_show_email_sent_at timestamptz,
  add column if not exists tour_response_token text;

create unique index if not exists luxor_inquiries_tour_response_token_idx
  on public.luxor_inquiries (tour_response_token)
  where tour_response_token is not null;

alter table public.luxor_bookings
  add column if not exists contract_status text not null default 'not_sent'
    check (contract_status in ('not_sent', 'sent', 'viewed', 'signed', 'needs_follow_up', 'void')),
  add column if not exists contract_sent_at timestamptz,
  add column if not exists contract_signed_at timestamptz,
  add column if not exists security_deposit_status text not null default 'not_collected';

create table if not exists public.luxor_email_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  signature_request_id uuid,
  job_type text not null check (job_type in ('tour_confirmation', 'tour_reminder', 'tour_no_show_reschedule', 'contract_signature')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  recipient_email text not null,
  subject text not null,
  body text not null,
  scheduled_for timestamptz not null default timezone('utc'::text, now()),
  sent_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists luxor_email_jobs_due_idx
  on public.luxor_email_jobs (status, scheduled_for)
  where status = 'queued';

create table if not exists public.luxor_signature_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  booking_id uuid not null references public.luxor_bookings(id) on delete cascade,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  client_name text not null,
  client_email text not null,
  token text not null unique,
  status text not null default 'sent' check (status in ('draft', 'sent', 'viewed', 'signed', 'void')),
  contract_title text not null,
  contract_body text not null,
  signed_name text,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists luxor_signature_requests_booking_idx
  on public.luxor_signature_requests (booking_id, created_at desc);

create table if not exists public.luxor_signature_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  signature_request_id uuid not null references public.luxor_signature_requests(id) on delete cascade,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists luxor_signature_events_request_idx
  on public.luxor_signature_events (signature_request_id, created_at desc);

drop trigger if exists luxor_email_jobs_set_updated_at on public.luxor_email_jobs;
create trigger luxor_email_jobs_set_updated_at
  before update on public.luxor_email_jobs
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_signature_requests_set_updated_at on public.luxor_signature_requests;
create trigger luxor_signature_requests_set_updated_at
  before update on public.luxor_signature_requests
  for each row execute function public.luxor_set_updated_at();

alter table public.luxor_email_jobs enable row level security;
alter table public.luxor_signature_requests enable row level security;
alter table public.luxor_signature_events enable row level security;

revoke all on table public.luxor_email_jobs from anon, authenticated;
revoke all on table public.luxor_signature_requests from anon, authenticated;
revoke all on table public.luxor_signature_events from anon, authenticated;

grant select on table public.luxor_email_jobs to anon, authenticated;
grant select on table public.luxor_signature_requests to anon, authenticated;
grant select on table public.luxor_signature_events to anon, authenticated;

grant select, insert, update, delete on table public.luxor_email_jobs to service_role;
grant select, insert, update, delete on table public.luxor_signature_requests to service_role;
grant select, insert, update, delete on table public.luxor_signature_events to service_role;

drop policy if exists "Service role can manage Luxor email jobs" on public.luxor_email_jobs;
create policy "Service role can manage Luxor email jobs"
  on public.luxor_email_jobs
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor signature requests" on public.luxor_signature_requests;
create policy "Service role can manage Luxor signature requests"
  on public.luxor_signature_requests
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor signature events" on public.luxor_signature_events;
create policy "Service role can manage Luxor signature events"
  on public.luxor_signature_events
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- Replace YOUR_SITE_OR_DEPLOYMENT_URL and YOUR_CRON_SECRET before running this block.
-- select cron.schedule(
--   'luxor-email-jobs-every-5-minutes',
--   '*/5 * * * *',
--   $$
--     select net.http_post(
--       url := 'https://YOUR_SITE_OR_DEPLOYMENT_URL/api/cron/luxor-email-jobs',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
--       body := jsonb_build_object('source', 'supabase-cron'),
--       timeout_milliseconds := 10000
--     );
--   $$
-- );

notify pgrst, 'reload schema';
