-- Draft only: register an unnamed job inactive before deploying the worker.
-- The two-argument API always creates a new job; unlike the named overload it
-- cannot replace an unrelated same-name job. Identify this job by its returned
-- ID and unique endpoint, not by jobname. No credential or Vercel cron is added.
do $$
declare v_job_id bigint;
begin
  -- This serializes cooperating Luxor registrars only, not arbitrary cron users.
  perform pg_advisory_xact_lock(hashtextextended('luxor-payment-allocation-supabase', 0));
  if exists (select 1 from cron.job where jobname = 'luxor-payment-allocation-supabase'
    or position('/api/cron/payment-allocation' in command) > 0) then
    raise exception 'Payment allocation cron name or endpoint already exists; inspect it before proceeding.';
  end if;
  v_job_id := cron.schedule('*/5 * * * *', $cron$
    -- luxor-payment-allocation-supabase
    select net.http_post(
      url := 'https://www.luxoratlaspalmas.com/api/cron/payment-allocation',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'luxor_email_jobs_cron_secret' limit 1)),
      body := jsonb_build_object('source', 'supabase-pg-cron', 'requested_at', now()),
      timeout_milliseconds := 120000
    );
  $cron$);
  perform cron.alter_job(job_id := v_job_id, active := false);
  if not exists (select 1 from cron.job where jobid = v_job_id and active = false and jobname is null
    and position('/api/cron/payment-allocation' in command) > 0) then
    raise exception 'Payment allocation cron job could not be registered inactive.';
  end if;
end;
$$;

-- Separate activation, only after deploying with allocation disabled, checking
-- authenticated health=1 and confirming the exact returned job ID and definition:
-- select cron.alter_job(job_id := <verified_job_id>, active := true);
-- Pause/rollback: select cron.alter_job(job_id := <verified_job_id>, active := false);
