create table if not exists public.luxor_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  document_type text not null check (document_type in ('proposal', 'invoice')),
  title text not null,
  file_name text not null,
  storage_path text not null unique,
  content_type text not null default 'application/pdf',
  size_bytes integer not null check (size_bytes >= 0),
  created_by text
);

create unique index if not exists luxor_documents_invoice_type_idx
  on public.luxor_documents (invoice_id, document_type)
  where invoice_id is not null;

create index if not exists luxor_documents_inquiry_created_idx
  on public.luxor_documents (inquiry_id, created_at desc);

drop trigger if exists luxor_documents_set_updated_at on public.luxor_documents;
create trigger luxor_documents_set_updated_at
  before update on public.luxor_documents
  for each row execute function public.luxor_set_updated_at();

alter table public.luxor_documents enable row level security;
revoke all on table public.luxor_documents from anon, authenticated;
grant select on table public.luxor_documents to anon, authenticated;
grant select, insert, update, delete on table public.luxor_documents to service_role;

drop policy if exists "Service role can manage Luxor documents" on public.luxor_documents;
create policy "Service role can manage Luxor documents"
  on public.luxor_documents
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luxor-documents', 'luxor-documents', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
