-- Private staging prevents an unvalidated upload from being publicly accessible.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luxor-brochures', 'luxor-brochures', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;

create table if not exists public.luxor_brochure_uploads (
  id uuid primary key,
  object_path text not null unique,
  uploaded_by text not null,
  original_name text not null,
  expected_size bigint not null check (expected_size > 0 and expected_size <= 104857600),
  expected_current_id uuid,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  page_count integer
);

create table if not exists public.luxor_brochure_current (
  singleton boolean primary key default true check (singleton),
  upload_id uuid not null references public.luxor_brochure_uploads(id),
  updated_at timestamptz not null default now()
);

alter table public.luxor_brochure_uploads enable row level security;
alter table public.luxor_brochure_current enable row level security;
revoke all on public.luxor_brochure_uploads, public.luxor_brochure_current from anon, authenticated;
