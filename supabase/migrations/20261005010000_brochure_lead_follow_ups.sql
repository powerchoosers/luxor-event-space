-- Additive follow-up workflow storage. The send and enrollment gates are off
-- until an explicit release approval enables them; template edits alone never
-- permit customer delivery.

create table if not exists public.luxor_follow_up_automations (
  automation_key text primary key,
  name text not null,
  enabled boolean not null default false,
  send_approved boolean not null default false,
  timing_configured boolean not null default false,
  timezone text,
  updated_at timestamptz not null default now(),
  check (timezone is null or timezone = 'America/Chicago')
);

insert into public.luxor_follow_up_automations
  (automation_key, name, enabled, send_approved, timing_configured, timezone)
values
  ('brochure_lead', 'Brochure Lead Follow-Up', false, false, true, 'America/Chicago')
on conflict (automation_key) do nothing;

create table if not exists public.luxor_follow_up_templates (
  id uuid primary key default gen_random_uuid(),
  automation_key text not null references public.luxor_follow_up_automations(automation_key) on delete cascade,
  step_key text not null,
  sort_order integer not null,
  channel text not null check (channel in ('email', 'phone', 'sms')),
  delay_days integer not null check (delay_days >= 0),
  name text not null,
  subject text,
  body text,
  cta_text text,
  cta_url text,
  secondary_cta_text text,
  secondary_cta_url text,
  active boolean not null default false,
  uses_existing_delivery boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (automation_key, step_key),
  unique (automation_key, sort_order)
);

insert into public.luxor_follow_up_templates
  (automation_key, step_key, sort_order, channel, delay_days, name, subject, body, cta_text, cta_url, secondary_cta_text, secondary_cta_url, active, uses_existing_delivery)
values
  ('brochure_lead', 'email_1', 10, 'email', 0, 'Email #1 — Brochure Delivery', 'Your Luxor Venue Brochure is Here!', 'Thank you for your interest in Luxor at Las Palmas. Your free venue brochure is ready. We would be delighted to welcome you for a visit and answer questions about your celebration.', 'View Your Brochure', '/api/brochure/download', 'Schedule a Visit', '/visit', false, true),
  ('brochure_lead', 'phone_1', 20, 'phone', 0, 'Phone Call #1 — Personal Introduction', null, 'Introduce Luxor, answer questions, and invite the lead to tour.', null, null, null, null, false, false),
  ('brochure_lead', 'email_2', 30, 'email', 1, 'Email #2 — Venue Inclusions', 'Take a Closer Look at Luxor at Las Palmas', 'Luxor at Las Palmas offers a beautiful setting for your event, with tables and chairs, linens, a kitchenette and bar area, a VIP room, the Luxor Lounge, and ample parking. We would love to show you the space in person.', 'Schedule a Visit', '/visit', null, null, false, false),
  ('brochure_lead', 'phone_2', 40, 'phone', 3, 'Phone Call #2 — Questions and Check-In', null, 'Follow up and answer questions. Record reached, no answer, or voicemail left.', null, null, null, null, false, false),
  ('brochure_lead', 'email_3', 50, 'email', 5, 'Email #3 — Common Questions', 'Your Venue Questions, Answered', 'We have answers to common questions about event types, guest capacity, decorating, included items, rental times, alcohol, parking, and availability. Reply to this email if you have a question we can answer.', 'Schedule a Visit', '/visit', null, null, false, false),
  ('brochure_lead', 'phone_3', 60, 'phone', 10, 'Phone Call #3 — Check-In', null, 'Check in and invite the lead to schedule a visit.', null, null, null, null, false, false),
  ('brochure_lead', 'email_4', 70, 'email', 14, 'Email #4 — Still Looking?', 'Still Looking for the Perfect Venue?', 'If you are comparing venues, we would be glad to show you Luxor at Las Palmas. Our elegant design, flexible packages, VIP room, and lounge make a thoughtful setting for celebrations.', 'Schedule a Visit', '/visit', null, null, false, false),
  ('brochure_lead', 'phone_4', 80, 'phone', 21, 'Phone Call #4 — Final Personal Check-In', null, 'A friendly, low-pressure final active-sequence call.', null, null, null, null, false, false),
  ('brochure_lead', 'email_5', 90, 'email', 30, 'Email #5 — Final Touch', 'We''d Love to Host Your Celebration', 'Whenever you are ready, Luxor at Las Palmas would be honored to host your celebration. Reach out whenever it feels like the right time.', 'Get in Touch', '/contact', 'Schedule a Visit', '/visit', false, false)
on conflict (automation_key, step_key) do nothing;

create table if not exists public.luxor_follow_up_enrollments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  automation_key text not null references public.luxor_follow_up_automations(automation_key),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'stopped')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  response_received_at timestamptz,
  completed_at timestamptz,
  ended_reason text,
  nurture_eligible_at timestamptz,
  marketing_consent_at_enrollment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, automation_key)
);

create table if not exists public.luxor_follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.luxor_follow_up_enrollments(id) on delete cascade,
  template_id uuid references public.luxor_follow_up_templates(id) on delete set null,
  step_key text not null,
  channel text not null check (channel in ('email', 'phone', 'sms')),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'email_queued', 'task_created', 'completed', 'skipped', 'cancelled', 'failed', 'existing_delivery')),
  email_job_id uuid references public.luxor_email_jobs(id) on delete set null,
  task_id uuid references public.luxor_tasks(id) on delete set null,
  outcome text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, step_key)
);

alter table public.luxor_inquiries
  add column if not exists follow_up_disposition text,
  add column if not exists follow_up_disposition_reason text,
  add column if not exists follow_up_disposition_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'luxor_inquiries_follow_up_disposition_check') then
    alter table public.luxor_inquiries
      add constraint luxor_inquiries_follow_up_disposition_check
      check (follow_up_disposition is null or follow_up_disposition in ('no_response', 'not_interested', 'lost_another_venue', 'event_canceled'));
  end if;
end $$;

alter table public.luxor_tasks
  add column if not exists due_at timestamptz,
  add column if not exists assigned_to text,
  add column if not exists call_outcome text,
  add column if not exists automation_enrollment_id uuid references public.luxor_follow_up_enrollments(id) on delete set null,
  add column if not exists automation_step_key text;

alter table public.luxor_email_jobs
  add column if not exists automation_enrollment_id uuid references public.luxor_follow_up_enrollments(id) on delete set null,
  add column if not exists automation_step_key text;

-- Keep this workflow out of the legacy general-purpose claim path. A separate
-- atomic RPC claims only approved, consented follow-up messages, at any hour.
create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs
language plpgsql
set search_path = ''
as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 1), 100));
  update public.luxor_email_jobs set status = case when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case when attempts >= 3 then scheduled_for else now() + interval '5 minutes' end,
    last_error = case when attempts >= 3 then coalesce(last_error, 'Delivery worker stopped before completing the job.')
      else coalesce(last_error, 'Delivery worker interrupted; automatically queued for retry.') end,
    updated_at = now()
  where automation_enrollment_id is null
    and job_type not in ('inquiry_notification', 'transactional_notice')
    and status = 'sending' and updated_at < now() - interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs
    where automation_enrollment_id is null
      and job_type not in ('inquiry_notification', 'transactional_notice')
      and status = 'queued' and scheduled_for <= now()
      and not exists (
        select 1 from public.luxor_email_jobs recent
        where recent.automation_enrollment_id is null
          and recent.job_type not in ('inquiry_notification', 'transactional_notice')
          and recent.status in ('sending', 'sent')
          and coalesce(recent.sent_at, recent.updated_at) > now() - interval '60 seconds'
      )
    order by scheduled_for, created_at, id for update skip locked limit job_limit
  ), claimed as (
    update public.luxor_email_jobs j set status = 'sending', attempts = j.attempts + 1, updated_at = now()
    from due where j.id = due.id returning j.*
  ) select * from claimed order by scheduled_for, created_at, id;
end;
$$;

create or replace function public.luxor_claim_due_follow_up_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 1), 1));
  update public.luxor_email_jobs set status = case when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case when attempts >= 3 then scheduled_for else now() + interval '5 minutes' end,
    last_error = case when attempts >= 3 then coalesce(last_error, 'Follow-up worker stopped before completing the job.')
      else coalesce(last_error, 'Follow-up worker interrupted; automatically queued for retry.') end,
    updated_at = now()
  where automation_enrollment_id is not null and job_type = 'marketing_campaign'
    and status = 'sending' and updated_at < now() - interval '15 minutes';
  return query with due as (
    select job.id
    from public.luxor_email_jobs job
    join public.luxor_follow_up_enrollments enrollment on enrollment.id = job.automation_enrollment_id
    join public.luxor_follow_up_automations automation on automation.automation_key = enrollment.automation_key
    join public.luxor_follow_up_actions action on action.enrollment_id = enrollment.id and action.step_key = job.automation_step_key
    join public.luxor_follow_up_templates template on template.id = action.template_id
    join public.luxor_inquiries inquiry on inquiry.id = job.inquiry_id
    where job.job_type = 'marketing_campaign' and job.status = 'queued' and job.scheduled_for <= now()
      and enrollment.status = 'active' and automation.enabled and automation.send_approved and automation.timing_configured
      and automation.timezone = 'America/Chicago' and template.active and inquiry.marketing_opt_in
      and inquiry.status not in ('tour_confirmed', 'booked', 'closed_lost')
      and (inquiry.follow_up_disposition is null or inquiry.follow_up_disposition = 'no_response')
      and action.status in ('email_queued', 'scheduled')
      and not exists (
        select 1 from public.luxor_email_jobs recent
        where recent.automation_enrollment_id is not null
          and recent.status in ('sending', 'sent')
          and coalesce(recent.sent_at, recent.updated_at) > now() - interval '60 seconds'
      )
    order by job.scheduled_for, job.created_at, job.id for update of job skip locked limit job_limit
  ), claimed as (
    update public.luxor_email_jobs job set status = 'sending', attempts = job.attempts + 1, updated_at = now()
    from due where job.id = due.id returning job.*
  ) select * from claimed order by scheduled_for, created_at, id;
end;
$$;

revoke all on function public.luxor_claim_due_follow_up_email_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_follow_up_email_jobs(integer) to service_role;

create unique index if not exists luxor_tasks_follow_up_step_unique
  on public.luxor_tasks (automation_enrollment_id, automation_step_key);

create unique index if not exists luxor_email_jobs_follow_up_step_unique
  on public.luxor_email_jobs (automation_enrollment_id, automation_step_key);

create index if not exists luxor_follow_up_actions_due_idx
  on public.luxor_follow_up_actions (scheduled_at, status);
create index if not exists luxor_follow_up_enrollments_active_idx
  on public.luxor_follow_up_enrollments (status, inquiry_id);

alter table public.luxor_follow_up_automations enable row level security;
alter table public.luxor_follow_up_templates enable row level security;
alter table public.luxor_follow_up_enrollments enable row level security;
alter table public.luxor_follow_up_actions enable row level security;

revoke all on public.luxor_follow_up_automations, public.luxor_follow_up_templates,
  public.luxor_follow_up_enrollments, public.luxor_follow_up_actions from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_follow_up_automations,
  public.luxor_follow_up_templates, public.luxor_follow_up_enrollments,
  public.luxor_follow_up_actions to service_role;

-- Record all stop conditions in one place. Only pending actions belonging to
-- this sequence are canceled; sent mail and unrelated tasks/jobs stay intact.
create or replace function public.luxor_stop_brochure_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stop_reason text;
begin
  if old.marketing_opt_in and not new.marketing_opt_in then stop_reason := 'unsubscribed';
  elsif new.status = 'tour_confirmed' then stop_reason := 'tour_scheduled';
  elsif new.status = 'booked' then stop_reason := 'booked';
  elsif new.status = 'closed_lost' then stop_reason := 'lost_another_venue';
  elsif new.follow_up_disposition in ('not_interested', 'lost_another_venue', 'event_canceled') then stop_reason := new.follow_up_disposition;
  else return new;
  end if;

  update public.luxor_follow_up_enrollments
  set status = 'stopped', ended_reason = stop_reason, updated_at = now()
  where inquiry_id = new.id and automation_key = 'brochure_lead' and status in ('active', 'paused');

  update public.luxor_follow_up_actions action
  set status = 'cancelled', updated_at = now()
  from public.luxor_follow_up_enrollments enrollment
  where action.enrollment_id = enrollment.id
    and enrollment.inquiry_id = new.id
    and enrollment.automation_key = 'brochure_lead'
    and action.status = 'scheduled';

  update public.luxor_email_jobs job
  set status = 'cancelled', last_error = 'Brochure follow-up stopped: ' || stop_reason, updated_at = now()
  where job.inquiry_id = new.id
    and job.status = 'queued'
    and job.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments where inquiry_id = new.id and automation_key = 'brochure_lead'
    );

  update public.luxor_tasks task
  set status = 'cancelled'
  where task.inquiry_id = new.id
    and task.status = 'pending'
    and task.automation_enrollment_id in (
      select id from public.luxor_follow_up_enrollments where inquiry_id = new.id and automation_key = 'brochure_lead'
    );
  return new;
end;
$$;

revoke all on function public.luxor_stop_brochure_follow_up() from public, anon, authenticated;

drop trigger if exists luxor_stop_brochure_follow_up_on_inquiry on public.luxor_inquiries;
create trigger luxor_stop_brochure_follow_up_on_inquiry
after update of status, follow_up_disposition, marketing_opt_in on public.luxor_inquiries
for each row execute function public.luxor_stop_brochure_follow_up();

notify pgrst, 'reload schema';
