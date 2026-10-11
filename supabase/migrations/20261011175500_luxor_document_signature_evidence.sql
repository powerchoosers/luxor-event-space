-- Preserve verified paper-agreement evidence alongside its immutable document.
-- Existing documents receive no signature attestation or eligibility backfill.
alter table public.luxor_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.luxor_documents.metadata is
  'Server-recorded document provenance and verified paper-agreement signature evidence.';
