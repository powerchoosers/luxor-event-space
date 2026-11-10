\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE TABLE public.luxor_bookings(id uuid PRIMARY KEY, inquiry_id uuid, event_date date, status text, metadata jsonb);
CREATE TABLE public.luxor_inquiries(id uuid PRIMARY KEY, email text, status text);
CREATE TABLE public.luxor_email_jobs(id uuid DEFAULT gen_random_uuid() PRIMARY KEY, inquiry_id uuid, booking_id uuid, job_type text, status text, recipient_email text, subject text, body text, scheduled_for timestamptz, updated_at timestamptz DEFAULT now(), last_error text, metadata jsonb DEFAULT '{}', custom_workflow_step_run_id uuid, test_run_id uuid);
\ir ../../supabase/migrations/20261109211408_luxor_event_email_reschedule.sql
\ir ../../supabase/migrations/20261109211554_luxor_event_email_reconciliation.sql
DO $$
DECLARE b uuid := gen_random_uuid(); i uuid := gen_random_uuid(); ok boolean; n integer; stopped integer; old_generation uuid;
  messages jsonb := '[{"kind":"event_details_reminder","subject":"Details","body":"Sample details"},{"kind":"event_day_reminder","subject":"Day","body":"Sample reminder"}]';
BEGIN
  IF has_function_privilege('anon','public.luxor_sync_event_email_reminders(uuid,uuid,date,text,jsonb,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','public.luxor_sync_event_email_reminders(uuid,uuid,date,text,jsonb,boolean)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.luxor_sync_event_email_reminders(uuid,uuid,date,text,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Incorrect function permissions'; END IF;
  INSERT INTO public.luxor_inquiries VALUES (i,'sample@example.invalid','booked');
  INSERT INTO public.luxor_bookings VALUES (b,i,'2099-12-10','confirmed','{"planning_completed_at":"2026-01-01"}');
  SELECT generation INTO old_generation FROM public.luxor_event_email_reconciliation WHERE booking_id=b;
  IF old_generation IS NULL OR has_table_privilege('anon','public.luxor_event_email_reconciliation','SELECT') THEN RAISE EXCEPTION 'Scheduling outbox or permissions missing'; END IF;
  UPDATE public.luxor_event_email_reconciliation SET next_attempt_at=now()+interval '1 day' WHERE booking_id=b;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,'2099-12-10','sample@example.invalid',messages,false);
  IF NOT ok OR n<>2 OR stopped<>0 THEN RAISE EXCEPTION 'Initial schedule failed'; END IF;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,'2099-12-10','sample@example.invalid',messages,false);
  IF NOT ok OR n<>0 OR stopped<>0 THEN RAISE EXCEPTION 'Retry duplicated reminders'; END IF;
  UPDATE public.luxor_bookings SET event_date='2099-12-20' WHERE id=b;
  IF old_generation=(SELECT generation FROM public.luxor_event_email_reconciliation WHERE booking_id=b) THEN RAISE EXCEPTION 'Changed booking did not advance generation'; END IF;
  IF (SELECT next_attempt_at FROM public.luxor_event_email_reconciliation WHERE booking_id=b)>now() THEN RAISE EXCEPTION 'New generation did not reset retry delay'; END IF;
  UPDATE public.luxor_event_email_reconciliation SET next_attempt_at=now()+interval '1 day' WHERE booking_id=b AND generation=old_generation;
  IF (SELECT next_attempt_at FROM public.luxor_event_email_reconciliation WHERE booking_id=b)>now() THEN RAISE EXCEPTION 'Stale retry deferred new scheduling work'; END IF;
  DELETE FROM public.luxor_event_email_reconciliation WHERE booking_id=b AND generation=old_generation;
  IF NOT EXISTS (SELECT 1 FROM public.luxor_event_email_reconciliation WHERE booking_id=b) THEN RAISE EXCEPTION 'Stale acknowledgment removed new scheduling work'; END IF;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,'2099-12-10','sample@example.invalid',messages,false);
  IF ok OR n<>0 OR stopped<>0 THEN RAISE EXCEPTION 'Stale update changed reminders'; END IF;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,'2099-12-20','sample@example.invalid',messages,false);
  IF NOT ok OR n<>2 OR stopped<>2 THEN RAISE EXCEPTION 'Reschedule failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.luxor_email_jobs WHERE booking_id=b AND status='queued' AND metadata->>'event_date'<>'2099-12-20') THEN RAISE EXCEPTION 'Stale queued reminder survived'; END IF;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,'2099-12-20','changed@example.invalid',messages,false);
  IF ok OR n<>0 OR stopped<>0 THEN RAISE EXCEPTION 'A stale recipient changed the schedule'; END IF;
  UPDATE public.luxor_bookings SET event_date=current_date + 1 WHERE id=b;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,current_date + 1,'sample@example.invalid',messages,false);
  IF NOT ok OR n<>0 OR stopped<>2 THEN RAISE EXCEPTION 'Past reminder windows were not skipped'; END IF;
  UPDATE public.luxor_bookings SET status='cancelled' WHERE id=b;
  SELECT * INTO ok,n,stopped FROM public.luxor_sync_event_email_reminders(b,i,current_date + 1,'sample@example.invalid',messages,false);
  IF ok THEN RAISE EXCEPTION 'Cancelled booking was scheduled'; END IF;
END $$;
SELECT 'atomic event reminder scheduling: PASS';
ROLLBACK;
