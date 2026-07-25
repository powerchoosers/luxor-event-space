alter table public.luxor_grand_opening_attendees
  add column if not exists email text;

update public.luxor_grand_opening_attendees attendee
set email = lower(inquiry.email)
from public.luxor_inquiries inquiry
where attendee.inquiry_id = inquiry.id
  and attendee.email is null
  and inquiry.email is not null;

alter table public.luxor_grand_opening_attendees
  alter column email set not null;

alter table public.luxor_grand_opening_attendees
  drop constraint if exists luxor_grand_opening_attendees_email_check;

alter table public.luxor_grand_opening_attendees
  add constraint luxor_grand_opening_attendees_email_check
  check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');

create index if not exists luxor_grand_opening_attendees_email_idx
  on public.luxor_grand_opening_attendees (email);
