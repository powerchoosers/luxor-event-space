-- Company information for operating costs, independent of event vendors.
create table public.luxor_recurring_cost_profiles (
  template_id uuid primary key references public.luxor_expense_templates(id) on delete cascade,
  contact_name text,
  phone text,
  email text,
  website text,
  account_notes text,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

alter table public.luxor_recurring_cost_profiles enable row level security;
revoke all on public.luxor_recurring_cost_profiles from public, anon, authenticated;
grant select, insert, update on public.luxor_recurring_cost_profiles to service_role;

-- Only a reviewed, explicitly reconciled bill can supply contact suggestions.
create or replace function public.luxor_recurring_profile_latest_bill(p_template_id uuid)
returns table(source_bill_id uuid, extracted_fields jsonb)
language sql security definer set search_path = public as $$
  select b.id, b.extracted_fields
  from public.luxor_booking_expenses p
  left join public.luxor_booking_expenses linked on linked.id = p.matched_expense_id
  join public.luxor_bills b on b.id = coalesce(p.source_bill_id, linked.source_bill_id)
  where p.recurring_template_id = p_template_id and b.archived_at is null
    and b.extraction_status = 'ready' and b.payment_ready_at is not null
    and b.duplicate_of_bill_id is null
  order by coalesce(b.due_date, b.issue_date, b.created_at::date) desc nulls last, b.created_at desc, b.id desc
  limit 1
$$;
revoke all on function public.luxor_recurring_profile_latest_bill(uuid) from public, anon, authenticated;
grant execute on function public.luxor_recurring_profile_latest_bill(uuid) to service_role;
