-- Store one-off proposal correction approvals in a private, server-only table.
-- No end-user role can read or write these recipient and approval details.
create table if not exists public.luxor_approved_proposal_resends (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.luxor_invoices(id) on delete restrict,
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  approval_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint luxor_approved_proposal_resends_data_object check (jsonb_typeof(approval_data) = 'object'),
  constraint luxor_approved_proposal_resends_approved check (coalesce(approval_data->>'approved' = 'true', false)),
  constraint luxor_approved_proposal_resends_version check (coalesce(approval_data->>'version' = '1', false)),
  constraint luxor_approved_proposal_resends_identity check (
    coalesce(approval_data->>'invoiceId' = invoice_id::text, false)
    and coalesce(approval_data->>'inquiryId' = inquiry_id::text, false)
  )
);

alter table public.luxor_approved_proposal_resends enable row level security;
revoke all on table public.luxor_approved_proposal_resends from anon, authenticated;
grant select, insert on table public.luxor_approved_proposal_resends to service_role;

create policy "Service role manages approved proposal resends"
  on public.luxor_approved_proposal_resends
  for all
  to service_role
  using (true)
  with check (true);
