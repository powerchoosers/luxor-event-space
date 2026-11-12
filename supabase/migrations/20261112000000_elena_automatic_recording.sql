-- Automatic live inbound recording is distinct from caller-confirmed consent.
alter table public.luxor_calls
  drop constraint if exists luxor_calls_recording_consent_status_check;

alter table public.luxor_calls
  add constraint luxor_calls_recording_consent_status_check
  check (
    recording_consent_status in ('not_requested', 'consented', 'declined', 'automatic')
    and (recording_consent_status <> 'automatic' or (
      metadata->>'scope' is not distinct from 'elena_live_inbound'
      and metadata->>'recording_consent_source' is not distinct from 'automatic'
      and recording_consent_at is null
    ))
  );
