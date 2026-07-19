create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 25)
returns setof public.luxor_email_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 25), 100));

  -- Recover work claimed by an Edge Function that stopped before it could
  -- record a result. Three attempted deliveries become a visible failure.
  update public.luxor_email_jobs
  set
    status = case when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case
      when attempts >= 3 then scheduled_for
      else now() + interval '5 minutes'
    end,
    last_error = case
      when attempts >= 3 then coalesce(last_error, 'Delivery worker stopped before completing the job.')
      else coalesce(last_error, 'Delivery worker interrupted; automatically queued for retry.')
    end,
    updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '15 minutes';

  return query
  with due as (
    select id
    from public.luxor_email_jobs
    where status = 'queued'
      and scheduled_for <= now()
    order by scheduled_for asc, created_at asc
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.luxor_email_jobs job
    set
      status = 'sending',
      attempts = coalesce(job.attempts, 0) + 1,
      updated_at = now()
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

-- Supabase owns the complete scheduled-delivery path. pg_cron invokes the
-- Supabase Edge Function directly; Vercel is not part of reminder processing.
-- Create these Vault values once using the project's own URL and publishable key:
-- select vault.create_secret('https://project-ref.supabase.co', 'luxor_project_url');
-- select vault.create_secret('sb_publishable_...', 'luxor_publishable_key');

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
      url := (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'luxor_project_url' limit 1
      ) || '/functions/v1/process-luxor-email-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'luxor_publishable_key' limit 1),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'luxor_publishable_key' limit 1)
      ),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
