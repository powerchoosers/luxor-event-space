-- PROPOSAL ONLY: reserve a migration name and review with Finance owner.
-- No grants are made here. Do not apply until privileges, RLS, migration chain,
-- legacy monthly target writes and concurrency are verified in isolation.
begin;
create table public.luxor_annual_revenue_plans (
  year integer primary key check (year between 1900 and 9999),
  annual_target numeric(12,2) check (annual_target is null or annual_target >= 0),
  revision integer not null check (revision >= 0),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table public.luxor_annual_revenue_plan_history (
  year integer not null references public.luxor_annual_revenue_plans(year) on delete restrict,
  revision integer not null,
  annual_target numeric(12,2),
  months jsonb not null,
  actor text not null,
  recorded_at timestamptz not null default now(),
  primary key (year, revision)
);
alter table public.luxor_annual_revenue_plans enable row level security;
alter table public.luxor_annual_revenue_plan_history enable row level security;
revoke all on public.luxor_annual_revenue_plans, public.luxor_annual_revenue_plan_history from public, anon, authenticated;

create function public.luxor_read_revenue_plan(p_year integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_row public.luxor_annual_revenue_plans%rowtype; v_exists boolean; v_months jsonb;
begin
  if p_year is null or p_year not between 1900 and 9999 then raise exception 'Invalid year'; end if;
  -- A single SQL statement supplies one consistent snapshot for both sources.
  select a.year, a.annual_target, a.revision, a.updated_by, a.updated_at,
    a.year is not null,
    (select jsonb_agg(jsonb_build_object('month', to_char(make_date(p_year, m, 1), 'YYYY-MM'), 'amount', t.amount) order by m)
       from generate_series(1, 12) m left join public.luxor_monthly_revenue_targets t on t.month = make_date(p_year, m, 1))
    into v_row.year, v_row.annual_target, v_row.revision, v_row.updated_by, v_row.updated_at, v_exists, v_months
    from (select 1) anchor left join public.luxor_annual_revenue_plans a on a.year = p_year;
  return jsonb_build_object('exists', v_exists, 'plan', jsonb_build_object('year', p_year, 'annualTarget', v_row.annual_target, 'revision', coalesce(v_row.revision, 0), 'months', v_months), 'baseline', v_months);
end;
$$;

create function public.luxor_write_revenue_plan(p_actor text, p_operation_id uuid, p_expected_revision integer, p_plan jsonb, p_baseline jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_year integer; v_request jsonb; v_previous record; v_current jsonb; v_exists boolean;
  v_existing_revision integer; v_next integer; v_result jsonb; v_month jsonb; v_old jsonb;
  v_i integer; v_month_date date; v_amount numeric; v_annual numeric; v_sum numeric := 0; v_filled integer := 0;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 or p_operation_id is null or jsonb_typeof(p_plan) is distinct from 'object' or jsonb_typeof(p_baseline) is distinct from 'array' then raise exception 'Invalid plan request'; end if;
  v_year := (p_plan ->> 'year')::integer;
  if v_year is null or v_year not between 1900 and 9999 or jsonb_typeof(p_plan -> 'months') is distinct from 'array' or jsonb_array_length(p_plan -> 'months') <> 12 or jsonb_array_length(p_baseline) <> 12 or (p_plan ->> 'revision')::integer is distinct from coalesce(p_expected_revision, 0) then raise exception 'Invalid plan'; end if;
  if p_plan -> 'annualTarget' = 'null'::jsonb then v_annual := null;
  elsif jsonb_typeof(p_plan -> 'annualTarget') = 'number' then v_annual := (p_plan ->> 'annualTarget')::numeric;
  else raise exception 'Invalid annual target'; end if;
  if v_annual < 0 or v_annual > 9999999999.99 or v_annual <> round(v_annual, 2) then raise exception 'Invalid annual target'; end if;
  v_request := jsonb_build_object('kind', 'revenue_plan', 'expectedRevision', p_expected_revision, 'plan', p_plan, 'baseline', p_baseline);
  perform pg_advisory_xact_lock(hashtextextended(p_actor || ':' || p_operation_id::text, 0));
  select request, result into v_previous from public.luxor_financial_planning_operations where actor = p_actor and operation_id = p_operation_id;
  if found then
    if v_previous.request <> v_request then return jsonb_build_object('status', 'conflict', 'currentRevision', null); end if;
    if v_previous.result ->> 'status' = 'saved' then return jsonb_set(v_previous.result, '{status}', '"replayed"'::jsonb); end if;
    return v_previous.result;
  end if;
  -- Also serializes legacy direct monthly target writes for this transaction.
  lock table public.luxor_monthly_revenue_targets in share row exclusive mode;
  select public.luxor_read_revenue_plan(v_year) into v_current;
  v_exists := (v_current ->> 'exists')::boolean;
  v_existing_revision := (v_current -> 'plan' ->> 'revision')::integer;
  if (p_expected_revision is null and v_exists) or (p_expected_revision is not null and (not v_exists or p_expected_revision <> v_existing_revision)) or p_baseline is distinct from (v_current -> 'baseline') then
    v_result := jsonb_build_object('status', 'conflict', 'currentRevision', case when v_exists then v_existing_revision else null end);
  else
    for v_i in 0..11 loop
      v_month := p_plan -> 'months' -> v_i;
      v_old := p_baseline -> v_i;
      v_month_date := make_date(v_year, v_i + 1, 1);
      if jsonb_typeof(v_month) is distinct from 'object' or (v_month ->> 'month') is distinct from to_char(v_month_date, 'YYYY-MM') or not (v_month ? 'amount') then raise exception 'Invalid month order'; end if;
      if v_month -> 'amount' = 'null'::jsonb then
        if v_old -> 'amount' <> 'null'::jsonb then raise exception 'Clearing an existing target is not supported'; end if;
      elsif jsonb_typeof(v_month -> 'amount') = 'number' then
        v_amount := (v_month ->> 'amount')::numeric;
        if v_amount < 0 or v_amount > 9999999999.99 or v_amount <> round(v_amount, 2) then raise exception 'Invalid month amount'; end if;
        v_filled := v_filled + 1; v_sum := v_sum + v_amount;
      else raise exception 'Invalid month amount'; end if;
    end loop;
    if v_annual is not null and v_filled = 12 and v_annual <> v_sum then raise exception 'Annual target and monthly allocations differ'; end if;
    v_next := case when v_exists then v_existing_revision + 1 else 0 end;
    insert into public.luxor_annual_revenue_plans(year, annual_target, revision, updated_by) values(v_year, v_annual, v_next, p_actor)
      on conflict (year) do update set annual_target = excluded.annual_target, revision = excluded.revision, updated_by = excluded.updated_by, updated_at = now();
    for v_i in 0..11 loop
      v_month := p_plan -> 'months' -> v_i;
      if v_month -> 'amount' <> 'null'::jsonb then
        insert into public.luxor_monthly_revenue_targets(month, amount, updated_by) values(make_date(v_year, v_i + 1, 1), (v_month ->> 'amount')::numeric, p_actor)
          on conflict (month) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now()
          where public.luxor_monthly_revenue_targets.amount is distinct from excluded.amount;
      end if;
    end loop;
    insert into public.luxor_annual_revenue_plan_history(year, revision, annual_target, months, actor) values(v_year, v_next, v_annual, p_plan -> 'months', p_actor);
    v_result := jsonb_build_object('status', 'saved', 'plan', jsonb_set(p_plan, '{revision}', to_jsonb(v_next)), 'baseline', p_plan -> 'months', 'exists', true);
  end if;
  insert into public.luxor_financial_planning_operations(actor, operation_id, request, result) values(p_actor, p_operation_id, v_request, v_result);
  return v_result;
end;
$$;
revoke all on function public.luxor_read_revenue_plan(integer) from public, anon, authenticated;
revoke all on function public.luxor_write_revenue_plan(text, uuid, integer, jsonb, jsonb) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
