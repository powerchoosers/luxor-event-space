-- Minimal synthetic baseline for existing Luxor tables. Role grants and RLS
-- follow the production catalog snapshot collected read-only for this test.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

create table public.luxor_inquiries (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table public.luxor_email_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  booking_id uuid,
  signature_request_id uuid,
  job_type text not null check (job_type in ('tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder','proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder','final_payment_reminder','event_details_reminder','event_day_reminder','post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review','calendar_invitation','inquiry_notification','transactional_notice')),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  recipient_email text not null,
  subject text not null,
  body text not null,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  metadata jsonb not null default '{}'::jsonb
);
create index luxor_email_jobs_due_idx on public.luxor_email_jobs (status, scheduled_for) where status='queued';

create table public.luxor_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  author text not null default 'Portal User',
  content text not null,
  note_type text not null default 'note' check (note_type in ('note','call_log','email_log','status_change'))
);

alter table public.luxor_inquiries enable row level security;
alter table public.luxor_tasks enable row level security;
alter table public.luxor_email_jobs enable row level security;
alter table public.luxor_notes enable row level security;
create policy luxor_inquiries_service_role on public.luxor_inquiries for all to service_role using (true) with check (true);
create policy luxor_tasks_service_role on public.luxor_tasks for all to service_role using (true) with check (true);
create policy luxor_email_jobs_service_role on public.luxor_email_jobs for all to service_role using (true) with check (true);
create policy luxor_notes_service_role on public.luxor_notes for all to service_role using (true) with check (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.luxor_inquiries, public.luxor_tasks, public.luxor_email_jobs, public.luxor_notes to anon, authenticated;
grant all privileges on public.luxor_inquiries, public.luxor_tasks, public.luxor_email_jobs, public.luxor_notes to service_role;
grant usage, select on all sequences in schema public to service_role;
