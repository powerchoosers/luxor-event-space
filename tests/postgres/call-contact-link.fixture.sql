create table if not exists public.luxor_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  phone text,
  email text,
  archived_at timestamptz,
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.luxor_vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text,
  archived_at timestamptz
);

create table if not exists public.luxor_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  twilio_call_sid text not null unique,
  direction text not null,
  status text not null default 'completed',
  from_number text not null,
  to_number text not null,
  caller_number text not null,
  callee_number text not null,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  vendor_id uuid references public.luxor_vendors(id) on delete set null,
  contact_name text,
  metadata jsonb not null default '{}'::jsonb
);

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;