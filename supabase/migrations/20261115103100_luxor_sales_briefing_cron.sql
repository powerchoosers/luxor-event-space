-- Schedule the sales briefing worker at :10 past 13:00 and 14:00 UTC Mon–Sat (~8:10 America/Chicago;
-- after luxor-daily-priorities-supabase at minute 0). The route still requires 8 AM CT and sent_at idempotency for DST.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'luxor-sales-briefing-supabase'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'luxor-sales-briefing-supabase',
  '10 13,14 * * 1-6',
  $cron$
    select net.http_post(
      url := 'https://www.luxoratlaspalmas.com/api/cron/sales-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'luxor_email_jobs_cron_secret' limit 1
        )
      ),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 120000
    );
  $cron$
);