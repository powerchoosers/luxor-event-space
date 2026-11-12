\set ON_ERROR_STOP on
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN BYPASSRLS'; END IF;
END
$roles$;

CREATE TABLE public.luxor_inquiries (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'new',
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  flow text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  email text,
  phone text,
  full_name text,
  event_type text,
  guest_count integer,
  target_date date,
  preferred_tour_date date,
  follow_up_disposition text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.luxor_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid,
  status text NOT NULL DEFAULT 'confirmed'
);
CREATE TABLE public.luxor_marketing_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  reason text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.luxor_sms_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  consent_scopes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.luxor_email_jobs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  inquiry_id uuid REFERENCES public.luxor_inquiries(id) ON DELETE SET NULL,
  automation_enrollment_id uuid,
  automation_step_key text,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  preview_text text,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 50,
  ignore_suppressions boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.luxor_text_jobs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  inquiry_id uuid REFERENCES public.luxor_inquiries(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'manual_campaign',
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  last_error text,
  recipient_phone text,
  recipient_name text,
  body text,
  segment_count integer NOT NULL DEFAULT 1,
  automation_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  opted_out_at timestamptz,
  twilio_message_sid text
);

create table public.luxor_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled'))
);
create table public.luxor_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  author text not null default 'Portal User',
  content text not null,
  note_type text not null default 'note' check (note_type in ('note','call_log','email_log','status_change'))
);
alter table public.luxor_inquiries add column archived_at timestamptz, add column tour_attendance_status text, add column current_tour_visit_id uuid, add column current_tour_visit_version integer not null default 0;
alter table public.luxor_bookings add column contract_status text;
alter table public.luxor_tasks add column due_at timestamptz, add column assigned_to text, add column post_tour_reopen_cancelled boolean not null default false, add column post_tour_user_modified boolean not null default false;
alter table public.luxor_email_jobs alter column id set default gen_random_uuid();
alter table public.luxor_text_jobs alter column id set default gen_random_uuid();
create table public.luxor_tour_visits(id uuid primary key,inquiry_id uuid not null,version integer not null,attendance_status text not null);
create table public.luxor_portal_members(email text primary key,status text,role text,permissions jsonb);
insert into public.luxor_portal_members values ('tester@example.invalid','active','owner','["marketing"]');
\ir ../../supabase/migrations/20261005010000_brochure_lead_follow_ups.sql

\ir ../../supabase/migrations/20261005020000_brochure_follow_up_unsubscribe.sql

\ir ../../supabase/migrations/20261005030000_follow_up_indexes.sql

\ir ../../supabase/migrations/20261005040000_brochure_follow_up_stop_action_states.sql

\ir ../../supabase/migrations/20261005050000_atomic_brochure_follow_up_finalization.sql

\ir ../../supabase/migrations/20261005060000_restrict_follow_up_finalizer_helper.sql

\ir ../../supabase/migrations/20261008010000_follow_up_note_task_link.sql

\ir ../../supabase/migrations/20261008020000_atomic_follow_up_overdue_recovery.sql

\ir ../../supabase/migrations/20261022123048_luxor_custom_workflow_foundation.sql

\ir ../../supabase/migrations/20261030040000_luxor_custom_workflows_expansion.sql

\ir ../../supabase/migrations/20261103130508_workflow_email_design_sender_context.sql

\ir ../../supabase/migrations/20261103131459_workflow_trigger_aware_eligibility.sql

\ir ../../supabase/migrations/20261103131607_workflow_manual_enrollment_and_call_tasks.sql

\ir ../../supabase/migrations/20261103132905_workflow_enrollment_deduplication.sql

\ir ../../supabase/migrations/20261109211054_luxor_workflow_normalize_sms_recipients.sql

\ir ../../supabase/migrations/20261109213350_luxor_custom_workflow_tour_outbox.sql

\ir ../../supabase/migrations/20261109213440_luxor_custom_workflow_tour_enrollment.sql

\ir ../../supabase/migrations/20261109214052_luxor_custom_workflow_recipient_fence.sql

\ir ../../supabase/migrations/20261105123623_manual_calendar_tasks.sql
