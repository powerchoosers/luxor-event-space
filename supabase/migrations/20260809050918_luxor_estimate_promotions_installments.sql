create table if not exists public.luxor_promotions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name text not null check (char_length(trim(name)) between 1 and 120),
  code text not null unique check (char_length(trim(code)) between 1 and 60),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value numeric(12,2) not null check (value >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists luxor_promotions_active_idx on public.luxor_promotions (active, name);

create table if not exists public.luxor_payment_installments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  booking_id uuid not null references public.luxor_bookings(id) on delete cascade,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  label text not null check (char_length(trim(label)) between 1 and 160),
  installment_order integer not null check (installment_order >= 1),
  amount numeric(12,2) not null check (amount >= 0),
  due_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'partial', 'paid', 'void')),
  payment_method text check (payment_method is null or payment_method in ('card', 'cash', 'check', 'ACH', 'Zelle')),
  reference text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists luxor_payment_installments_booking_order_idx on public.luxor_payment_installments (booking_id, installment_order) where status <> 'void';
create index if not exists luxor_payment_installments_due_idx on public.luxor_payment_installments (status, due_at);

alter table public.luxor_promotions enable row level security;
alter table public.luxor_payment_installments enable row level security;
revoke all on table public.luxor_promotions from anon, authenticated;
revoke all on table public.luxor_payment_installments from anon, authenticated;
grant select, insert, update, delete on table public.luxor_promotions to service_role;
grant select, insert, update, delete on table public.luxor_payment_installments to service_role;

comment on table public.luxor_promotions is 'Owner-managed saved percentage or fixed-dollar estimate promotions.';
comment on table public.luxor_payment_installments is 'Owner-built deposit and final-payment installment schedule tied to a booking.';
notify pgrst, 'reload schema';
