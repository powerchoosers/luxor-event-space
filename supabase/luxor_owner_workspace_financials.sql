create table if not exists public.luxor_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  author text not null default 'Portal User',
  content text not null,
  note_type text not null default 'note' check (note_type in ('note', 'call_log', 'email_log', 'status_change'))
);

comment on table public.luxor_notes is
  'Owner follow-up notes and status-change history linked to Luxor inquiries.';

create index if not exists luxor_notes_inquiry_created_idx
  on public.luxor_notes (inquiry_id, created_at desc);

create table if not exists public.luxor_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled'))
);

comment on table public.luxor_tasks is
  'Follow-up tasks for Luxor inquiries and booked events.';

create index if not exists luxor_tasks_inquiry_status_due_idx
  on public.luxor_tasks (inquiry_id, status, due_date);

create table if not exists public.luxor_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  client_name text not null,
  event_type text,
  description text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  notes text
);

comment on table public.luxor_invoices is
  'Invoice records for Luxor inquiries and events. Payments should be tracked in luxor_payments.';

create index if not exists luxor_invoices_inquiry_created_idx
  on public.luxor_invoices (inquiry_id, created_at desc);

create index if not exists luxor_invoices_status_due_idx
  on public.luxor_invoices (status, due_date);

create table if not exists public.luxor_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  client_name text not null,
  email text,
  phone text,
  event_type text,
  event_date date,
  start_time time,
  end_time time,
  guest_count integer check (guest_count is null or guest_count >= 0),
  package_name text,
  status text not null default 'tentative' check (status in ('draft', 'tentative', 'confirmed', 'completed', 'cancelled')),
  booked_at timestamptz,
  contract_total numeric(12,2) not null default 0 check (contract_total >= 0),
  deposit_required numeric(12,2) not null default 0 check (deposit_required >= 0),
  final_payment_due_date date,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.luxor_bookings is
  'Booked Luxor events created from inquiries. This is the source for booked revenue and event schedule reporting.';

create index if not exists luxor_bookings_inquiry_idx
  on public.luxor_bookings (inquiry_id);

create index if not exists luxor_bookings_invoice_idx
  on public.luxor_bookings (invoice_id);

create index if not exists luxor_bookings_event_date_idx
  on public.luxor_bookings (event_date, status);

create table if not exists public.luxor_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  booking_id uuid references public.luxor_bookings(id) on delete cascade,
  invoice_id uuid references public.luxor_invoices(id) on delete set null,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'void')),
  payment_method text,
  paid_at timestamptz,
  processor text,
  processor_reference text,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.luxor_payments is
  'Payments and deposits collected for Luxor bookings and invoices.';

create index if not exists luxor_payments_booking_status_idx
  on public.luxor_payments (booking_id, status, paid_at desc);

create index if not exists luxor_payments_invoice_idx
  on public.luxor_payments (invoice_id);

create index if not exists luxor_payments_inquiry_idx
  on public.luxor_payments (inquiry_id);

create table if not exists public.luxor_booking_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  booking_id uuid not null references public.luxor_bookings(id) on delete cascade,
  category text not null default 'other',
  description text,
  vendor_name text,
  amount numeric(12,2) not null check (amount >= 0),
  incurred_on date,
  status text not null default 'planned' check (status in ('planned', 'incurred', 'paid', 'cancelled')),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.luxor_booking_expenses is
  'Costs tied to booked Luxor events so profitability can be calculated from real data.';

create index if not exists luxor_booking_expenses_booking_status_idx
  on public.luxor_booking_expenses (booking_id, status);

create or replace view public.luxor_booking_financials
with (security_invoker = true) as
select
  b.id as booking_id,
  b.inquiry_id,
  b.invoice_id,
  b.client_name,
  b.event_type,
  b.event_date,
  b.status as booking_status,
  b.contract_total,
  coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)::numeric(12,2) as paid_total,
  coalesce(sum(p.amount) filter (where p.status = 'pending'), 0)::numeric(12,2) as pending_payment_total,
  coalesce(sum(e.amount) filter (where e.status in ('incurred', 'paid')), 0)::numeric(12,2) as expense_total,
  (b.contract_total - coalesce(sum(e.amount) filter (where e.status in ('incurred', 'paid')), 0))::numeric(12,2) as projected_profit,
  (coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) - coalesce(sum(e.amount) filter (where e.status in ('incurred', 'paid')), 0))::numeric(12,2) as cash_profit,
  greatest((b.contract_total - coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)), 0)::numeric(12,2) as balance_due
from public.luxor_bookings b
left join public.luxor_payments p on p.booking_id = b.id
left join public.luxor_booking_expenses e on e.booking_id = b.id
group by b.id;

comment on view public.luxor_booking_financials is
  'Summary view for booked revenue, collected payments, expenses, balance due, and profitability.';

create or replace function public.luxor_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists luxor_invoices_set_updated_at on public.luxor_invoices;
create trigger luxor_invoices_set_updated_at
  before update on public.luxor_invoices
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_bookings_set_updated_at on public.luxor_bookings;
create trigger luxor_bookings_set_updated_at
  before update on public.luxor_bookings
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_payments_set_updated_at on public.luxor_payments;
create trigger luxor_payments_set_updated_at
  before update on public.luxor_payments
  for each row execute function public.luxor_set_updated_at();

drop trigger if exists luxor_booking_expenses_set_updated_at on public.luxor_booking_expenses;
create trigger luxor_booking_expenses_set_updated_at
  before update on public.luxor_booking_expenses
  for each row execute function public.luxor_set_updated_at();

alter table public.luxor_notes enable row level security;
alter table public.luxor_tasks enable row level security;
alter table public.luxor_invoices enable row level security;
alter table public.luxor_bookings enable row level security;
alter table public.luxor_payments enable row level security;
alter table public.luxor_booking_expenses enable row level security;

revoke all on table public.luxor_notes from anon, authenticated;
revoke all on table public.luxor_tasks from anon, authenticated;
revoke all on table public.luxor_invoices from anon, authenticated;
revoke all on table public.luxor_bookings from anon, authenticated;
revoke all on table public.luxor_payments from anon, authenticated;
revoke all on table public.luxor_booking_expenses from anon, authenticated;
revoke all on table public.luxor_booking_financials from anon, authenticated;

-- These SELECT grants expose the objects to Supabase's Data API.
-- RLS still blocks anon/auth row access because no anon/auth policies are defined.
grant select on table public.luxor_notes to anon, authenticated;
grant select on table public.luxor_tasks to anon, authenticated;
grant select on table public.luxor_invoices to anon, authenticated;
grant select on table public.luxor_bookings to anon, authenticated;
grant select on table public.luxor_payments to anon, authenticated;
grant select on table public.luxor_booking_expenses to anon, authenticated;
grant select on table public.luxor_booking_financials to anon, authenticated;

grant select, insert, update, delete on table public.luxor_notes to service_role;
grant select, insert, update, delete on table public.luxor_tasks to service_role;
grant select, insert, update, delete on table public.luxor_invoices to service_role;
grant select, insert, update, delete on table public.luxor_bookings to service_role;
grant select, insert, update, delete on table public.luxor_payments to service_role;
grant select, insert, update, delete on table public.luxor_booking_expenses to service_role;
grant select on table public.luxor_booking_financials to service_role;
grant select, insert, update, delete on table public.luxor_inquiries to service_role;

drop policy if exists "Service role can manage Luxor inquiries" on public.luxor_inquiries;
create policy "Service role can manage Luxor inquiries"
  on public.luxor_inquiries
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor notes" on public.luxor_notes;
create policy "Service role can manage Luxor notes"
  on public.luxor_notes
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor tasks" on public.luxor_tasks;
create policy "Service role can manage Luxor tasks"
  on public.luxor_tasks
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor invoices" on public.luxor_invoices;
create policy "Service role can manage Luxor invoices"
  on public.luxor_invoices
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor bookings" on public.luxor_bookings;
create policy "Service role can manage Luxor bookings"
  on public.luxor_bookings
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor payments" on public.luxor_payments;
create policy "Service role can manage Luxor payments"
  on public.luxor_payments
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

drop policy if exists "Service role can manage Luxor booking expenses" on public.luxor_booking_expenses;
create policy "Service role can manage Luxor booking expenses"
  on public.luxor_booking_expenses
  for all
  to service_role
  using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');

notify pgrst, 'reload schema';
