create extension if not exists pgcrypto;

-- Keep the existing one-to-one message history available on projects where the
-- original Twilio migrations have not yet been applied.
create table if not exists public.luxor_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  twilio_message_sid text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'received',
  from_number text not null,
  to_number text not null,
  body text not null default '',
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  contact_name text,
  owner_email text,
  error_code text,
  error_message text,
  media_urls jsonb not null default '[]'::jsonb,
  is_read boolean not null default false
);

alter table public.luxor_messages
  drop constraint if exists luxor_messages_status_check;
alter table public.luxor_messages
  add constraint luxor_messages_status_check
  check (status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'received'));

create index if not exists luxor_messages_created_at_idx
  on public.luxor_messages (created_at desc);
create index if not exists luxor_messages_inquiry_created_idx
  on public.luxor_messages (inquiry_id, created_at desc);

create table if not exists public.luxor_sms_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  phone_number text not null unique check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'unknown' check (status in ('unknown', 'opted_in', 'opted_out')),
  source text,
  opted_in_at timestamptz,
  opted_out_at timestamptz
);

alter table public.luxor_sms_consents
  add column if not exists consent_scopes text[] not null default array[]::text[],
  add column if not exists proof jsonb not null default '{}'::jsonb,
  add column if not exists last_confirmed_at timestamptz;

create index if not exists luxor_sms_consents_status_idx
  on public.luxor_sms_consents (status, updated_at desc);

create table if not exists public.luxor_text_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  name text not null check (char_length(name) between 1 and 160),
  body_template text not null check (char_length(body_template) between 1 and 480),
  campaign_type text not null default 'customer_care'
    check (campaign_type in ('customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice', 'elena')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  audience_label text,
  audience_filter jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  opt_out_count integer not null default 0 check (opt_out_count >= 0),
  estimated_segments integer not null default 0 check (estimated_segments >= 0),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.luxor_text_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  campaign_id uuid not null references public.luxor_text_campaigns(id) on delete cascade,
  text_job_id uuid,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  name text,
  personalized_body text not null check (char_length(personalized_body) between 1 and 480),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled', 'skipped')),
  twilio_message_sid text,
  segment_count integer not null default 1 check (segment_count between 1 and 10),
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  opted_out_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  unique (campaign_id, phone_number)
);

create table if not exists public.luxor_text_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  campaign_id uuid references public.luxor_text_campaigns(id) on delete cascade,
  campaign_recipient_id uuid references public.luxor_text_campaign_recipients(id) on delete cascade,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  job_type text not null check (job_type in (
    'manual_campaign',
    'inquiry_confirmation',
    'tour_confirmation',
    'tour_reminder',
    'event_reminder',
    'payment_confirmation',
    'invoice_due_reminder',
    'invoice_overdue_reminder'
  )),
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled', 'skipped')),
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  recipient_name text,
  body text not null check (char_length(body) between 1 and 480),
  segment_count integer not null default 1 check (segment_count between 1 and 10),
  scheduled_for timestamptz not null default timezone('utc'::text, now()),
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  twilio_message_sid text,
  last_error text,
  automation_key text unique,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.luxor_text_campaign_recipients
  drop constraint if exists luxor_text_campaign_recipients_text_job_id_fkey;
alter table public.luxor_text_campaign_recipients
  add constraint luxor_text_campaign_recipients_text_job_id_fkey
  foreign key (text_job_id) references public.luxor_text_jobs(id) on delete set null;

create index if not exists luxor_text_campaigns_status_schedule_idx
  on public.luxor_text_campaigns (status, scheduled_for, created_at);
create index if not exists luxor_text_campaign_recipients_campaign_status_idx
  on public.luxor_text_campaign_recipients (campaign_id, status, created_at);
create index if not exists luxor_text_campaign_recipients_phone_idx
  on public.luxor_text_campaign_recipients (phone_number, created_at desc);
create index if not exists luxor_text_jobs_due_idx
  on public.luxor_text_jobs (status, scheduled_for, created_at);
create index if not exists luxor_text_jobs_inquiry_idx
  on public.luxor_text_jobs (inquiry_id, job_type, status, scheduled_for);
create index if not exists luxor_text_jobs_invoice_idx
  on public.luxor_text_jobs (invoice_id, job_type, status, scheduled_for);

alter table public.luxor_messages enable row level security;
alter table public.luxor_sms_consents enable row level security;
alter table public.luxor_text_campaigns enable row level security;
alter table public.luxor_text_campaign_recipients enable row level security;
alter table public.luxor_text_jobs enable row level security;

revoke all on table public.luxor_messages from public, anon, authenticated;
revoke all on table public.luxor_sms_consents from public, anon, authenticated;
revoke all on table public.luxor_text_campaigns from public, anon, authenticated;
revoke all on table public.luxor_text_campaign_recipients from public, anon, authenticated;
revoke all on table public.luxor_text_jobs from public, anon, authenticated;
grant all on table public.luxor_messages to service_role;
grant all on table public.luxor_sms_consents to service_role;
grant all on table public.luxor_text_campaigns to service_role;
grant all on table public.luxor_text_campaign_recipients to service_role;
grant all on table public.luxor_text_jobs to service_role;

drop policy if exists "Service role can manage Luxor messages" on public.luxor_messages;
create policy "Service role can manage Luxor messages"
  on public.luxor_messages for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

drop policy if exists "Service role can manage Luxor SMS consent" on public.luxor_sms_consents;
create policy "Service role can manage Luxor SMS consent"
  on public.luxor_sms_consents for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

create policy "Service role can manage Luxor text campaigns"
  on public.luxor_text_campaigns for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

create policy "Service role can manage Luxor text campaign recipients"
  on public.luxor_text_campaign_recipients for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

create policy "Service role can manage Luxor text jobs"
  on public.luxor_text_jobs for all to service_role
  using ((select current_setting('role'::text, true)) = 'service_role'::text)
  with check ((select current_setting('role'::text, true)) = 'service_role'::text);

create or replace function public.luxor_claim_due_text_jobs(job_limit integer default 10)
returns setof public.luxor_text_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 10), 50));

  update public.luxor_text_jobs
  set
    status = case when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case when attempts >= 3 then scheduled_for else now() + interval '5 minutes' end,
    last_error = case
      when attempts >= 3 then coalesce(last_error, 'Text worker stopped before completing the job.')
      else coalesce(last_error, 'Text worker interrupted; automatically queued for retry.')
    end,
    updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '15 minutes';

  return query
  with due as (
    select id
    from public.luxor_text_jobs
    where status = 'queued'
      and scheduled_for <= now()
    order by scheduled_for asc, created_at asc
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.luxor_text_jobs job
    set
      status = 'sending',
      attempts = coalesce(job.attempts, 0) + 1,
      updated_at = now()
    from due
    where job.id = due.id
    returning job.*
  )
  select *
  from claimed
  order by scheduled_for asc, created_at asc;
end;
$$;

revoke all on function public.luxor_claim_due_text_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_text_jobs(integer) to service_role;

notify pgrst, 'reload schema';

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'luxor-text-jobs-supabase'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'luxor-text-jobs-supabase',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://www.luxoratlaspalmas.com/api/cron/text-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'luxor_email_jobs_cron_secret' limit 1
        )
      ),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
