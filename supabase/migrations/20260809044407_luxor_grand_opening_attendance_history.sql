-- Keep historical Grand Opening check-ins available to the owner portal even
-- after the public RSVP, check-in, and raffle surfaces are retired.
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

create index if not exists luxor_grand_opening_attendees_history_idx
  on public.luxor_grand_opening_attendees (campaign_key, checked_in_at desc);

alter table public.luxor_grand_opening_attendees enable row level security;

revoke all on table public.luxor_grand_opening_attendees from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_grand_opening_attendees to service_role;

comment on table public.luxor_grand_opening_attendees is
  'Private historical Grand Opening check-ins retained after public RSVP and raffle retirement.';

notify pgrst, 'reload schema';
