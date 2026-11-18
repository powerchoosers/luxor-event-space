-- Phase 2: field placement, signers, and immutable audit for created documents.
begin;

create table if not exists public.luxor_created_document_fields (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  document_id uuid not null references public.luxor_created_documents (id) on delete cascade,
  field_type text not null check (field_type in (
    'signature',
    'name',
    'date',
    'initials',
    'email',
    'text',
    'checkbox'
  )),
  role_key text not null check (char_length(btrim(role_key)) between 1 and 80),
  label text not null default '' check (char_length(label) <= 200),
  required boolean not null default false,
  page_index integer not null check (page_index >= 0),
  x numeric(8, 6) not null check (x >= 0 and x <= 1),
  y numeric(8, 6) not null check (y >= 0 and y <= 1),
  w numeric(8, 6) not null check (w > 0 and w <= 1),
  h numeric(8, 6) not null check (h > 0 and h <= 1),
  sort_order integer not null default 0
);

create index if not exists luxor_created_document_fields_document_idx
  on public.luxor_created_document_fields (document_id, sort_order, page_index);

create table if not exists public.luxor_created_document_signers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  document_id uuid not null references public.luxor_created_documents (id) on delete cascade,
  role_key text not null check (char_length(btrim(role_key)) between 1 and 80),
  role_label text not null check (char_length(btrim(role_label)) between 1 and 120),
  name text not null default '' check (char_length(name) <= 200),
  email text not null default '' check (char_length(email) <= 320),
  sign_order integer not null default 1 check (sign_order >= 1),
  status text not null default 'pending' check (status in (
    'pending',
    'viewed',
    'signed',
    'declined',
    'expired'
  )),
  token_hash text,
  token_expires_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  viewed_at timestamptz,
  last_ip text,
  last_user_agent text,
  signed_pdf_path text,
  unique (document_id, role_key)
);

create index if not exists luxor_created_document_signers_document_idx
  on public.luxor_created_document_signers (document_id, sign_order);

create unique index if not exists luxor_created_document_signers_token_hash_idx
  on public.luxor_created_document_signers (token_hash)
  where token_hash is not null;

create table if not exists public.luxor_created_document_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  document_id uuid not null references public.luxor_created_documents (id) on delete cascade,
  signer_id uuid references public.luxor_created_document_signers (id) on delete set null,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists luxor_created_document_events_document_idx
  on public.luxor_created_document_events (document_id, created_at desc);

drop trigger if exists luxor_created_document_fields_set_updated_at on public.luxor_created_document_fields;
create trigger luxor_created_document_fields_set_updated_at
  before update on public.luxor_created_document_fields
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_created_document_signers_set_updated_at on public.luxor_created_document_signers;
create trigger luxor_created_document_signers_set_updated_at
  before update on public.luxor_created_document_signers
  for each row execute function public.luxor_set_updated_at();

create or replace function public.luxor_created_document_events_deny_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'luxor_created_document_events rows are immutable';
end;
$$;

drop trigger if exists luxor_created_document_events_no_update on public.luxor_created_document_events;
create trigger luxor_created_document_events_no_update
  before update on public.luxor_created_document_events
  for each row execute function public.luxor_created_document_events_deny_mutation();

drop trigger if exists luxor_created_document_events_no_delete on public.luxor_created_document_events;
create trigger luxor_created_document_events_no_delete
  before delete on public.luxor_created_document_events
  for each row execute function public.luxor_created_document_events_deny_mutation();

alter table public.luxor_created_document_fields enable row level security;
alter table public.luxor_created_document_signers enable row level security;
alter table public.luxor_created_document_events enable row level security;

revoke all on table public.luxor_created_document_fields from anon, authenticated;
revoke all on table public.luxor_created_document_signers from anon, authenticated;
revoke all on table public.luxor_created_document_events from anon, authenticated;

grant select, insert, update, delete on table public.luxor_created_document_fields to service_role;
grant select, insert, update, delete on table public.luxor_created_document_signers to service_role;
grant select, insert on table public.luxor_created_document_events to service_role;

drop policy if exists "Service role can manage created document fields" on public.luxor_created_document_fields;
create policy "Service role can manage created document fields"
  on public.luxor_created_document_fields
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage created document signers" on public.luxor_created_document_signers;
create policy "Service role can manage created document signers"
  on public.luxor_created_document_signers
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can insert created document events" on public.luxor_created_document_events;
create policy "Service role can insert created document events"
  on public.luxor_created_document_events
  for insert
  to service_role
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can read created document events" on public.luxor_created_document_events;
create policy "Service role can read created document events"
  on public.luxor_created_document_events
  for select
  to service_role
  using ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
commit;