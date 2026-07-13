alter table public.luxor_inquiries
  add column if not exists campaign_key text,
  add column if not exists rsvp_status text
    check (rsvp_status in ('attending', 'not_attending', 'maybe')),
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists attendee_count integer
    check (attendee_count is null or attendee_count >= 0);

create index if not exists luxor_inquiries_campaign_key_idx
  on public.luxor_inquiries (campaign_key, created_at desc)
  where campaign_key is not null;

create index if not exists luxor_inquiries_rsvp_status_idx
  on public.luxor_inquiries (rsvp_status, created_at desc)
  where rsvp_status is not null;

update public.luxor_inquiries
set
  target_date = '2026-07-25',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'eventDateLabel', 'Saturday, July 25, 2026',
    'eventTimeLabel', '1:00 PM–5:00 PM',
    'start_time', '13:00',
    'end_time', '17:00',
    'duration_minutes', 240
  ),
  updated_at = now()
where campaign_key = 'grand_opening_2026_07_25'
   or flow = 'grand_opening_rsvp'
   or source = 'grand_opening_rsvp';

grant select, insert, update, delete on table public.luxor_inquiries to service_role;

notify pgrst, 'reload schema';
