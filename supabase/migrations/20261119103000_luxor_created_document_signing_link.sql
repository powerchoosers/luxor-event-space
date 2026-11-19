-- Keep the original signing token so reminders and voided links still resolve.
-- Ciphertext is server-only. Existing created-document policies stay service_role only.
begin;

alter table public.luxor_created_document_signers
  add column if not exists token_ciphertext text;

alter table public.luxor_created_documents
  add column if not exists signing_link_origin text;

comment on column public.luxor_created_document_signers.token_ciphertext is
  'AES-GCM ciphertext of the signing token so reminders reuse the same link. Lookup stays on token_hash.';
comment on column public.luxor_created_documents.signing_link_origin is
  'Origin used in signature emails, including preview deployments.';

notify pgrst, 'reload schema';
commit;
