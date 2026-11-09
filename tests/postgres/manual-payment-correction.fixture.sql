create role anon; create role authenticated; create role service_role;
create table public.luxor_bookings(id uuid primary key, invoice_id uuid, status text, contract_status text, metadata jsonb);
create table public.luxor_invoices(id uuid primary key, booking_id uuid, parent_invoice_id uuid, invoice_kind text, status text, total numeric, stripe_checkout_session_id text, paid_at timestamptz, updated_at timestamptz);
create table public.luxor_payment_installments(id uuid primary key, booking_id uuid, invoice_id uuid, amount numeric, status text, paid_at timestamptz, payment_method text, reference text, metadata jsonb, updated_at timestamptz);
create table public.luxor_payments(id uuid primary key, booking_id uuid, invoice_id uuid, amount numeric, status text, processor text, payment_method text, paid_at timestamptz, metadata jsonb, updated_at timestamptz);
create table public.luxor_payment_installment_allocations(payment_id uuid, installment_id uuid, amount numeric, primary key(payment_id,installment_id));
create table public.luxor_payment_refunds(source_payment_id uuid);
create table public.luxor_email_jobs(id uuid primary key, job_type text, status text, metadata jsonb);
