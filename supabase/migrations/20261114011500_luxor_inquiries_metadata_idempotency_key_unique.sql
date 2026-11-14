-- One luxor_inquiries row per client idempotency key (e.g. packages inquiry double-submit).
-- Nia applies on production after removing existing QA duplicate rows with the same keys.
create unique index if not exists luxor_inquiries_metadata_idempotency_key_uidx
  on public.luxor_inquiries ((metadata->>'idempotencyKey'))
  where (metadata->>'idempotencyKey') is not null
    and length(btrim(metadata->>'idempotencyKey')) >= 8;