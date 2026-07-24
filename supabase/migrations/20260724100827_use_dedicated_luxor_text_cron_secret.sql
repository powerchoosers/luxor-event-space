do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'luxor-text-jobs-supabase'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'luxor-text-jobs-supabase',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://www.luxoratlaspalmas.com/api/cron/text-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(
          (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'luxor_text_jobs_cron_secret' limit 1
          ),
          (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'luxor_email_jobs_cron_secret' limit 1
          )
        )
      ),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
