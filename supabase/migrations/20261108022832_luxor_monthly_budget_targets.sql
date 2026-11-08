begin;

-- Portal users access this table only through the finance-authorized server.
create table public.luxor_monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  category_id uuid not null references public.luxor_expense_categories(id) on delete restrict,
  category text not null check (char_length(btrim(category)) between 1 and 100),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null,
  unique (month, category_id)
);

alter table public.luxor_monthly_budgets enable row level security;
revoke all on public.luxor_monthly_budgets from public, anon, authenticated;
grant select, insert, update on public.luxor_monthly_budgets to service_role;
notify pgrst, 'reload schema';

commit;
