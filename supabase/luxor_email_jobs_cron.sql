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
revoke all on function public.luxor_claim_due_email_jobs(integer) from anon, authenticated;
grant execute on function public.luxor_claim_due_email_jobs(integer) to service_role;

notify pgrst, 'reload schema';

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The endpoint secret must be created once in Vault with the same value as
-- LUXOR_CRON_SECRET in Vercel (the route can also use the existing
-- LUXOR_PORTAL_SESSION_SECRET as a compatibility fallback):
-- select vault.create_secret('replace-with-a-long-random-value', 'luxor_email_jobs_cron_secret');

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'luxor-email-jobs-supabase'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'luxor-email-jobs-supabase',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://www.luxoratlaspalmas.com/api/cron/luxor-email-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'luxor_email_jobs_cron_secret' limit 1),
          ''
        )
      ),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
