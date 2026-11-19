-- Phase 3 document creator: send settings, reminder preference, and the combined PDF path.
-- Existing created-document policies stay service_role only. These columns do not add anon or authenticated access.
begin;

alter table public.luxor_created_documents
  add column if not exists signing_order text not null default 'parallel'
    check (signing_order in ('parallel', 'sequential')),
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists reminder_after_days integer not null default 3
    check (reminder_after_days between 1 and 30),
  add column if not exists sent_subject text,
  add column if not exists sent_message text,
  add column if not exists sent_at timestamptz,
  add column if not exists voided_at timestamptz,
  add column if not exists final_pdf_path text,
  add column if not exists recipient_summary text;

alter table public.luxor_created_document_signers
  add column if not exists invited_at timestamptz;

comment on column public.luxor_created_documents.signing_order is
  'parallel invites every signer when the operator clicks Send. sequential invites the next signer only after the previous one signs.';
comment on column public.luxor_created_documents.reminder_enabled is
  'When true, clicking Send also queues one reminder per invited signer. Nothing is queued until that click.';
comment on column public.luxor_created_documents.final_pdf_path is
  'Private luxor-documents path of the combined PDF written after every signer finishes.';
comment on column public.luxor_created_document_signers.invited_at is
  'Set when a signature email is queued for this signer. Empty means no email has been queued.';

notify pgrst, 'reload schema';
commit;
