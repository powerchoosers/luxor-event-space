\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.luxor_inquiries (
  id uuid primary key default gen_random_uuid(), full_name text not null, phone text, email text,
  source text, flow text, status text, pipeline_stage text, marketing_opt_in boolean default false,
  internal_notification_requested boolean default false, is_test boolean default false,
  archived_at timestamptz, metadata jsonb not null default '{}',
  event_type text, target_date text, guest_count integer, message text,
  preferred_tour_date text, preferred_tour_time text
);
create table public.luxor_email_jobs (
  id uuid primary key default gen_random_uuid(), inquiry_id uuid not null references public.luxor_inquiries(id),
  job_type text not null, status text not null default 'queued',
  recipient_email text not null, subject text, body text, scheduled_for timestamptz default now(),
  metadata jsonb not null default '{}'
);
create table public.luxor_user_preferences (
  notification_emails text
);
insert into public.luxor_user_preferences(notification_emails) values ('booking@luxoratlaspalmas.com');
alter table public.luxor_inquiries enable row level security;
alter table public.luxor_email_jobs enable row level security;
grant all on public.luxor_inquiries, public.luxor_email_jobs, public.luxor_user_preferences to service_role;
\ir ../../supabase/migrations/20260828184957_luxor_inquiry_notification_queue.sql
\ir ../../supabase/migrations/20261114210000_inbound_phone_inquiry_notification.sql
set local role service_role;
insert into public.luxor_inquiries(full_name, phone, email, source, flow, status, pipeline_stage, internal_notification_requested, is_test)
values ('Phone Caller', '+15550009999', 'caller@example.invalid', 'inbound_phone', 'phone_inquiry', 'new', 'inquiry', false, false);
reset role;
select case when count(*)=1 and min(job_type)='inquiry_notification' and min(recipient_email)='booking@luxoratlaspalmas.com' then 'ok' else 'fail' end
  as phone_inquiry_notification from public.luxor_email_jobs;
rollback;