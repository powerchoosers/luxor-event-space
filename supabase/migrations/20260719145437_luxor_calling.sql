create table if not exists public.luxor_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  twilio_call_sid text not null unique,
  child_call_sid text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'queued' check (
    status in ('queued', 'initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled')
  ),
  from_number text not null,
  to_number text not null,
  caller_number text not null,
  callee_number text not null,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  contact_name text,
  owner_email text,
  started_at timestamptz not null default timezone('utc'::text, now()),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  outcome text,
  notes text,
  recording_sid text unique,
  recording_url text,
  recording_duration_seconds integer check (recording_duration_seconds is null or recording_duration_seconds >= 0),
  is_voicemail boolean not null default false,
  is_read boolean not null default false,
  last_sequence_number integer not null default -1,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.luxor_calls is
  'Inbound and outbound Luxor browser-phone calls, including Twilio status and voicemail metadata.';

comment on column public.luxor_calls.recording_url is
  'Twilio recording API URL. It is not public and must only be fetched through an authenticated server route.';

create index if not exists luxor_calls_created_at_idx
  on public.luxor_calls (created_at desc);

create index if not exists luxor_calls_inquiry_created_idx
  on public.luxor_calls (inquiry_id, created_at desc);

create index if not exists luxor_calls_direction_status_idx
  on public.luxor_calls (direction, status);

create index if not exists luxor_calls_unread_inbound_idx
  on public.luxor_calls (created_at desc)
  where direction = 'inbound' and is_read = false;

alter table public.luxor_calls enable row level security;

revoke all on table public.luxor_calls from public, anon, authenticated;
grant all on table public.luxor_calls to service_role;
