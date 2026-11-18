-- Phase 1 document creator: operator-authored agreements separate from luxor_documents invoice/proposal files.
begin;

create table if not exists public.luxor_created_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  document_type text not null check (document_type in (
    'venue_use_agreement',
    'partnership_agreement',
    'vendor_agreement',
    'rental_contract',
    'waiver',
    'other'
  )),
  body_json jsonb not null default '{}'::jsonb,
  body_html text not null default '',
  is_template boolean not null default false,
  status text not null default 'draft' check (status in (
    'draft',
    'template',
    'sent',
    'opened',
    'partially_signed',
    'signed',
    'declined',
    'expired',
    'voided',
    'archived'
  )),
  archived_at timestamptz,
  created_by text not null,
  version integer not null default 1 check (version >= 1),
  pdf_storage_path text,
  source_template_id uuid references public.luxor_created_documents(id) on delete set null
);

comment on table public.luxor_created_documents is
  'Portal-authored legal documents and templates for operations. Distinct from luxor_documents lead/invoice PDFs.';

create index if not exists luxor_created_documents_list_idx
  on public.luxor_created_documents (archived_at, is_template, status, updated_at desc);

create index if not exists luxor_created_documents_type_idx
  on public.luxor_created_documents (document_type, updated_at desc);

drop trigger if exists luxor_created_documents_set_updated_at on public.luxor_created_documents;
create trigger luxor_created_documents_set_updated_at
  before update on public.luxor_created_documents
  for each row execute function public.luxor_set_updated_at();

alter table public.luxor_created_documents enable row level security;
revoke all on table public.luxor_created_documents from anon, authenticated;
grant select, insert, update, delete on table public.luxor_created_documents to service_role;

drop policy if exists "Service role can manage Luxor created documents" on public.luxor_created_documents;
create policy "Service role can manage Luxor created documents"
  on public.luxor_created_documents
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
commit;