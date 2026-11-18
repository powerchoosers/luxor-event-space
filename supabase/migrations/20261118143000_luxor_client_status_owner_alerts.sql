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

-- Classic new-lead inquiry_notification rows have no notificationKind. Other kinds
-- (client status, tour cancel, staff reminder, etc.) use their own partial indexes.
drop index if exists public.luxor_inquiry_notification_recipient_unique;
create unique index luxor_inquiry_notification_recipient_unique on public.luxor_email_jobs (inquiry_id, lower(recipient_email))
  where job_type = 'inquiry_notification'
    and (metadata->>'notificationKind') is null;

create or replace function public.luxor_enqueue_inquiry_notifications() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare recipients text[]; recipient text; snapshot jsonb;
begin
  select array_agg(address order by address) into recipients from (
    select distinct lower(btrim(value)) as address from public.luxor_user_preferences p
    cross join lateral regexp_split_to_table(coalesce(p.notification_emails, ''), ',') value
    where length(btrim(value)) <= 254 and btrim(value) ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
  ) valid;
  recipients := coalesce(recipients, array['booking@luxoratlaspalmas.com']);
  snapshot := jsonb_build_object('id', new.id, 'full_name', new.full_name, 'email', new.email, 'phone', new.phone,
    'event_type', new.event_type, 'guest_count', new.guest_count, 'budget', to_jsonb(new)->'budget', 'target_date', new.target_date,
    'message', new.message, 'source', new.source, 'flow', new.flow, 'preferred_tour_date', new.preferred_tour_date,
    'preferred_tour_time', new.preferred_tour_time, 'metadata', jsonb_build_object('chatMessages', new.metadata->'chatMessages'));
  foreach recipient in array recipients loop
    insert into public.luxor_email_jobs(inquiry_id, job_type, recipient_email, subject, body, scheduled_for, metadata)
      values(new.id, 'inquiry_notification', recipient,
        '[New Lead] ' || regexp_replace(new.full_name || ' - ' || coalesce(new.event_type, 'Event Inquiry'), '[\r\n]+', ' ', 'g'),
        'Internal inquiry notification awaiting rendering.', now(),
        jsonb_build_object('notificationVersion', 1, 'inquirySnapshot', snapshot, 'sender_from', 'booking@luxoratlaspalmas.com', 'sender_name', 'Luxor Lead Alerts'))
      on conflict (inquiry_id, lower(recipient_email))
        where job_type = 'inquiry_notification' and (metadata->>'notificationKind') is null
        do nothing;
  end loop;
  return new;
end;
$$;

create unique index if not exists luxor_client_status_alert_unique on public.luxor_email_jobs
  ((metadata->>'clientStatusEventId'), lower(recipient_email))
  where job_type = 'inquiry_notification'
    and metadata->>'notificationKind' = 'client_status_change';