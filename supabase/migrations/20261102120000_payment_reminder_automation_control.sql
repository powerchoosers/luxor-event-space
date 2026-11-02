-- Add a global control for the existing final-payment-due-date reminder
-- scheduler and the owner-confirmed installment offsets. The enabled default
-- preserves the existing final-payment behavior and cadence.
-- No email jobs, invoices, payments, contracts, or schedules are rewritten.
insert into public.luxor_follow_up_automations
  (automation_key, name, enabled, send_approved, timing_configured, timezone)
values
  ('payment_reminders', 'Payment reminders', true, true, true, 'America/Chicago')
on conflict (automation_key) do nothing;

-- Enforce scheduler idempotency under concurrent cron workers. The feature
-- gate remains off until this migration and the allocation migration are
-- reviewed and installed.
create unique index if not exists luxor_email_jobs_installment_reminder_identity_uidx
  on public.luxor_email_jobs ((metadata ->> 'automation_key'))
  where job_type = 'installment_payment_reminder' and test_run_id is null;
