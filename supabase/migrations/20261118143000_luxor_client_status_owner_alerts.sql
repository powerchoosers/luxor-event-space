-- Client-facing status changes flag the lead for owner attention and queue
-- a dedicated internal alert job. No historical backfill.

alter table public.luxor_inquiries
  add column if not exists client_attention_at timestamptz,
  add column if not exists client_attention_reason text,
  add column if not exists client_attention_kind text,
  add column if not exists client_attention_event_id text,
  add column if not exists client_attention_acknowledged_at timestamptz;

comment on column public.luxor_inquiries.client_attention_at is 'When a client-facing route last flagged this lead for owner follow-up.';
comment on column public.luxor_inquiries.client_attention_reason is 'Short owner-facing summary of the latest client-initiated status change.';
comment on column public.luxor_inquiries.client_attention_kind is 'Machine idempotency kind for the latest client attention event.';
comment on column public.luxor_inquiries.client_attention_event_id is 'Stable idempotency key for the latest client attention event.';
comment on column public.luxor_inquiries.client_attention_acknowledged_at is 'When portal staff acknowledged the current client attention flag.';

create unique index if not exists luxor_client_status_alert_unique on public.luxor_email_jobs
  ((metadata->>'clientStatusEventId'), lower(recipient_email))
  where job_type = 'inquiry_notification'
    and metadata->>'notificationKind' = 'client_status_change';