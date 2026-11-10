-- Disposable database only. Roles are created at cluster scope by the test environment.
create table public.luxor_vendors (id uuid primary key, name text, archived_at timestamptz);
create table public.luxor_expense_templates (id uuid primary key, vendor_name text, created_by text, updated_by text);
create table public.luxor_bills (id uuid primary key, vendor_id uuid references public.luxor_vendors(id), vendor_link_method text, status text, archived_at timestamptz, updated_at timestamptz, amount numeric, payment_ready_at timestamptz);
create table public.luxor_booking_expenses (id uuid primary key, recurring_template_id uuid references public.luxor_expense_templates(id), source_bill_id uuid references public.luxor_bills(id));
create table public.luxor_expense_payments (id uuid primary key, expense_id uuid references public.luxor_booking_expenses(id), amount numeric);
grant select, update on public.luxor_bills to service_role;
grant select on public.luxor_vendors, public.luxor_expense_templates, public.luxor_booking_expenses, public.luxor_expense_payments to service_role;
