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

grant select, insert, update, delete on table public.luxor_inquiries to service_role;

notify pgrst, 'reload schema';
