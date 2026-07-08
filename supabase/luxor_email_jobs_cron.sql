create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 25)
returns setof public.luxor_email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 25), 100));

  return query
  with due as (
    select id
    from public.luxor_email_jobs
    where status = 'queued'
      and scheduled_for <= timezone('utc'::text, now())
    order by scheduled_for asc, created_at asc
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.luxor_email_jobs job
    set
      status = 'sending',
      attempts = coalesce(job.attempts, 0) + 1,
      updated_at = timezone('utc'::text, now())
    from due
    where job.id = due.id
    returning job.*
  )
  select *
  from claimed
  order by scheduled_for asc, created_at asc;
end;
$$;

revoke all on function public.luxor_claim_due_email_jobs(integer) from public;
grant execute on function public.luxor_claim_due_email_jobs(integer) to service_role;

notify pgrst, 'reload schema';
