alter table public.luxor_signature_requests
  add column if not exists client_first_name text,
  add column if not exists client_last_name text,
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists owner_signed_at timestamptz,
  add column if not exists contract_document_path text,
  add column if not exists guest_guide_path text,
  add column if not exists executed_document_path text,
  add column if not exists audit_document_path text,
  add column if not exists document_hash text;

alter table public.luxor_documents drop constraint if exists luxor_documents_document_type_check;
alter table public.luxor_documents
  add constraint luxor_documents_document_type_check
  check (document_type in ('proposal', 'invoice', 'contract', 'guest_guide', 'executed_contract', 'contract_audit'));

notify pgrst, 'reload schema';
