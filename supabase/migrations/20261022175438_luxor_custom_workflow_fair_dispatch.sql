-- Persist and serialize the last claimed marketing lane so delayed or
-- overlapping cron ticks cannot starve one queue through wall-clock parity.
alter table public.luxor_custom_workflow_runtime_controls
  add column if not exists last_email_dispatch_lane text not null default 'custom',
  add column if not exists last_text_dispatch_lane text not null default 'custom';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'luxor_custom_workflow_runtime_controls_email_lane_check'
      and conrelid = 'public.luxor_custom_workflow_runtime_controls'::regclass
  ) then
    alter table public.luxor_custom_workflow_runtime_controls
      add constraint luxor_custom_workflow_runtime_controls_email_lane_check
      check (last_email_dispatch_lane in ('legacy', 'custom'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'luxor_custom_workflow_runtime_controls_text_lane_check'
      and conrelid = 'public.luxor_custom_workflow_runtime_controls'::regclass
  ) then
    alter table public.luxor_custom_workflow_runtime_controls
      add constraint luxor_custom_workflow_runtime_controls_text_lane_check
      check (last_text_dispatch_lane in ('legacy', 'custom'));
  end if;
end
$$;

create or replace function public.luxor_claim_due_marketing_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs
language plpgsql security definer set search_path = '' as $$
declare
  last_lane text;
  claimed_count integer;
begin
  -- Marketing email keeps its existing one-message worker budget.
  insert into public.luxor_custom_workflow_runtime_controls(singleton)
    values (true) on conflict (singleton) do nothing;
  select last_email_dispatch_lane into last_lane
    from public.luxor_custom_workflow_runtime_controls
    where singleton = true for update;

  if last_lane = 'legacy' then
    return query select * from public.luxor_custom_workflow_claim_due_email_jobs(1);
    get diagnostics claimed_count = row_count;
    if claimed_count > 0 then
      update public.luxor_custom_workflow_runtime_controls
        set last_email_dispatch_lane = 'custom' where singleton = true;
      return;
    end if;
    return query select * from public.luxor_claim_due_email_jobs(1);
    get diagnostics claimed_count = row_count;
    if claimed_count > 0 then
      update public.luxor_custom_workflow_runtime_controls
        set last_email_dispatch_lane = 'legacy' where singleton = true;
    end if;
    return;
  end if;

  return query select * from public.luxor_claim_due_email_jobs(1);
  get diagnostics claimed_count = row_count;
  if claimed_count > 0 then
    update public.luxor_custom_workflow_runtime_controls
      set last_email_dispatch_lane = 'legacy' where singleton = true;
    return;
  end if;
  return query select * from public.luxor_custom_workflow_claim_due_email_jobs(1);
  get diagnostics claimed_count = row_count;
  if claimed_count > 0 then
    update public.luxor_custom_workflow_runtime_controls
      set last_email_dispatch_lane = 'custom' where singleton = true;
  end if;
end;
$$;
revoke all on function public.luxor_claim_due_marketing_email_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_marketing_email_jobs(integer) to service_role;

create or replace function public.luxor_claim_due_marketing_text_jobs(job_limit integer default 10, segment_budget integer default 100)
returns setof public.luxor_text_jobs
language plpgsql security definer set search_path = '' as $$
declare
  last_lane text;
  claimed_count integer;
begin
  insert into public.luxor_custom_workflow_runtime_controls(singleton)
    values (true) on conflict (singleton) do nothing;
  select last_text_dispatch_lane into last_lane
    from public.luxor_custom_workflow_runtime_controls
    where singleton = true for update;

  job_limit := greatest(1, least(coalesce(job_limit, 10), 50));
  segment_budget := greatest(0, least(coalesce(segment_budget, 0), 100000));

  if last_lane = 'legacy' then
    return query select * from public.luxor_custom_workflow_claim_due_text_jobs(job_limit, segment_budget);
    get diagnostics claimed_count = row_count;
    if claimed_count > 0 then
      update public.luxor_custom_workflow_runtime_controls
        set last_text_dispatch_lane = 'custom' where singleton = true;
      return;
    end if;
    return query select * from public.luxor_claim_due_text_jobs(job_limit);
    get diagnostics claimed_count = row_count;
    if claimed_count > 0 then
      update public.luxor_custom_workflow_runtime_controls
        set last_text_dispatch_lane = 'legacy' where singleton = true;
    end if;
    return;
  end if;

  return query select * from public.luxor_claim_due_text_jobs(job_limit);
  get diagnostics claimed_count = row_count;
  if claimed_count > 0 then
    update public.luxor_custom_workflow_runtime_controls
      set last_text_dispatch_lane = 'legacy' where singleton = true;
    return;
  end if;
  return query select * from public.luxor_custom_workflow_claim_due_text_jobs(job_limit, segment_budget);
  get diagnostics claimed_count = row_count;
  if claimed_count > 0 then
    update public.luxor_custom_workflow_runtime_controls
      set last_text_dispatch_lane = 'custom' where singleton = true;
  end if;
end;
$$;
revoke all on function public.luxor_claim_due_marketing_text_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_marketing_text_jobs(integer, integer) to service_role;
