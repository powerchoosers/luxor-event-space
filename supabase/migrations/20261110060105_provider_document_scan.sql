begin;
-- NULL means no owner attestation. Existing true values retain their original meaning.
alter table public.luxor_vendor_documents alter column no_tax_identifiers_confirmed drop not null;
alter table public.luxor_vendor_documents add column if not exists scan_metadata jsonb;
comment on column public.luxor_vendor_documents.no_tax_identifiers_confirmed is 'True only when explicitly confirmed by the owner; NULL means no owner attestation.';

-- One immutable destination for a request, shared by bill intake and documents.
-- Claims survive failed responses so concurrent or later retries cannot switch paths.
create table public.luxor_provider_upload_destinations (
  id uuid primary key,
  vendor_id uuid not null references public.luxor_vendors(id) on delete restrict,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by text not null check (length(btrim(created_by)) > 0),
  kind text not null check (kind in ('bill', 'contract', 'other')),
  created_at timestamptz not null default now()
);
create index luxor_provider_upload_destinations_vendor_id_idx
  on public.luxor_provider_upload_destinations(vendor_id);
alter table public.luxor_provider_upload_destinations enable row level security;
revoke all on public.luxor_provider_upload_destinations from public, anon, authenticated, service_role;
grant select, insert on public.luxor_provider_upload_destinations to service_role;
commit;
