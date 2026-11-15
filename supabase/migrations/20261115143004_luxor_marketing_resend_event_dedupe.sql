-- Checked-in only. Do not apply until a duplicate audit returns zero rows.
-- This migration does not delete or update production rows except the
-- backfill below, which only fills null resend_event_id values from metadata.

alter table public.luxor_marketing_events
  add column if not exists resend_event_id text;

comment on column public.luxor_marketing_events.resend_event_id is
  'Resend webhook event id used to deduplicate simultaneous open/click writes.';

update public.luxor_marketing_events
set resend_event_id = metadata->>'resendEventId'
where resend_event_id is null
  and coalesce(metadata->>'resendEventId', '') <> '';

-- Duplicate audit (must return zero rows before applying):
--   select recipient_id, resend_event_id, count(*) as row_count
--   from public.luxor_marketing_events
--   where resend_event_id is not null
--   group by recipient_id, resend_event_id
--   having count(*) > 1;

-- Non-partial unique index so PostgREST on_conflict=recipient_id,resend_event_id works.
-- NULL resend_event_id values remain distinct, so legacy rows are not constrained.
create unique index if not exists luxor_marketing_events_resend_recipient_event_uidx
  on public.luxor_marketing_events (recipient_id, resend_event_id);