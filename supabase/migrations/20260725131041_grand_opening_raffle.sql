create table if not exists public.luxor_grand_opening_attendees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  campaign_key text not null default 'grand_opening_2026_07_25',
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  invited_by_inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  phone text,
  attendee_type text not null check (attendee_type in ('rsvp', 'guest')),
  checked_in_at timestamptz not null default timezone('utc'::text, now()),
  checked_in_by text not null check (checked_in_by in ('self', 'staff')),
  marketing_opt_in boolean not null default false,
  eligible boolean not null default true,
  winner_at timestamptz,
  prize_label text,
  disqualified_at timestamptz,
  disqualification_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_grand_opening_attendees_campaign_inquiry_uidx
  on public.luxor_grand_opening_attendees (campaign_key, inquiry_id)
  where inquiry_id is not null;

create index if not exists luxor_grand_opening_attendees_raffle_pool_idx
  on public.luxor_grand_opening_attendees (campaign_key, eligible, checked_in_at)
  where winner_at is null and disqualified_at is null;

create index if not exists luxor_grand_opening_attendees_invited_by_idx
  on public.luxor_grand_opening_attendees (invited_by_inquiry_id, checked_in_at desc)
  where invited_by_inquiry_id is not null;

alter table public.luxor_grand_opening_attendees enable row level security;

revoke all on table public.luxor_grand_opening_attendees from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_grand_opening_attendees to service_role;

alter table public.luxor_email_jobs
  drop constraint if exists luxor_email_jobs_job_type_check;

alter table public.luxor_email_jobs
  add constraint luxor_email_jobs_job_type_check check (job_type in (
    'tour_confirmation',
    'tour_reminder',
    'tour_no_show_reschedule',
    'proposal_view_reminder',
    'proposal_payment_reminder',
    'contract_signature',
    'contract_view_reminder',
    'contract_signature_reminder',
    'final_payment_reminder',
    'event_details_reminder',
    'event_day_reminder',
    'post_event_follow_up',
    'marketing_campaign',
    'grand_opening_rsvp_confirmation',
    'grand_opening_check_in'
  ));

create unique index if not exists luxor_grand_opening_check_in_email_automation_uidx
  on public.luxor_email_jobs ((metadata ->> 'automation_key'))
  where job_type = 'grand_opening_check_in'
    and metadata ->> 'automation_key' is not null;

notify pgrst, 'reload schema';
