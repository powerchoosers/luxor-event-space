create table if not exists public.luxor_event_contacts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 160),
  email text null,
  phone text null,
  role_label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists luxor_event_contacts_inquiry_idx
  on public.luxor_event_contacts (inquiry_id, created_at asc);

alter table public.luxor_event_contacts enable row level security;
grant select, insert, update, delete on public.luxor_event_contacts to service_role;
