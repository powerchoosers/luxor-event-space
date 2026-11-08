begin;

-- Targets are independent planning inputs; they never change transactions.
create table public.luxor_monthly_revenue_targets (
  month date primary key check (extract(day from month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table public.luxor_monthly_revenue_target_history (
  id bigint generated always as identity primary key,
  month date not null,
  amount numeric(12,2) not null,
  updated_by text not null,
  updated_at timestamptz not null
);
alter table public.luxor_monthly_revenue_targets enable row level security;
alter table public.luxor_monthly_revenue_target_history enable row level security;
revoke all on public.luxor_monthly_revenue_targets, public.luxor_monthly_revenue_target_history from public, anon, authenticated;
grant select, insert, update on public.luxor_monthly_revenue_targets to service_role;
grant select, insert on public.luxor_monthly_revenue_target_history to service_role;
grant usage, select on sequence public.luxor_monthly_revenue_target_history_id_seq to service_role;

create function public.luxor_record_revenue_target_history() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into public.luxor_monthly_revenue_target_history(month, amount, updated_by, updated_at)
  values (new.month, new.amount, new.updated_by, new.updated_at);
  return new;
end;
$$;
revoke all on function public.luxor_record_revenue_target_history() from public, anon, authenticated;
create trigger luxor_revenue_target_history after insert or update on public.luxor_monthly_revenue_targets
for each row execute function public.luxor_record_revenue_target_history();

notify pgrst, 'reload schema';
commit;
