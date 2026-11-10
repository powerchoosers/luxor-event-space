\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE TABLE public.luxor_inquiries (id uuid primary key, tour_attendance_status text, current_tour_visit_id uuid, current_tour_visit_version integer, is_test boolean default false, metadata jsonb default '{}', archived_at timestamptz, status text default 'new', follow_up_disposition text, email text, phone text, marketing_opt_in boolean default false, preferred_tour_date date);
CREATE TABLE public.luxor_tour_visits (id uuid primary key, inquiry_id uuid not null, version integer not null, attendance_status text not null);
CREATE TABLE public.luxor_custom_workflows (id uuid primary key, status text, trigger_type text, current_version_id uuid);
CREATE TABLE public.luxor_custom_workflow_versions (workflow_id uuid, id uuid, definition jsonb, primary key(workflow_id,id));
CREATE TABLE public.test_runtime (enabled boolean not null);
INSERT INTO public.test_runtime VALUES (true);
CREATE FUNCTION public.luxor_custom_workflow_runtime_enabled() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT enabled FROM public.test_runtime $$;
CREATE FUNCTION public.luxor_custom_workflow_definition_is_runnable(jsonb) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.luxor_custom_workflow_inquiry_is_eligible(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.luxor_workflow_normalize_phone(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
CREATE TABLE public.luxor_marketing_suppressions (email text);
CREATE TABLE public.luxor_sms_consents (phone_number text,status text,consent_scopes text[]);
CREATE TABLE public.luxor_custom_workflow_source_events (id uuid primary key default gen_random_uuid(), event_key text unique, trigger_type text, inquiry_id uuid, payload jsonb, status text, processed_at timestamptz, last_error text);
CREATE TABLE public.luxor_custom_workflow_enrollments (id uuid primary key default gen_random_uuid(),workflow_id uuid,workflow_version_id uuid,source_event_id uuid,inquiry_id uuid,status text,current_step_id text,next_run_at timestamptz,unique(workflow_id,workflow_version_id,inquiry_id));
CREATE TABLE public.luxor_custom_workflow_step_runs (id uuid primary key default gen_random_uuid(),enrollment_id uuid,workflow_version_id uuid,step_id text,step_order integer,channel text,status text,idempotency_key text unique,scheduled_for timestamptz,snapshot jsonb);
CREATE TABLE public.luxor_custom_workflow_activity (workflow_id uuid,enrollment_id uuid,step_run_id uuid,event_type text,details jsonb);
\ir ../../supabase/migrations/20261109213350_luxor_custom_workflow_tour_outbox.sql
\ir ../../supabase/migrations/20261109213440_luxor_custom_workflow_tour_enrollment.sql
INSERT INTO public.luxor_inquiries (id,tour_attendance_status,current_tour_visit_id,current_tour_visit_version) VALUES
  ('10000000-0000-4000-8000-000000000001','pending','20000000-0000-4000-8000-000000000001',1),
  ('10000000-0000-4000-8000-000000000002','pending','20000000-0000-4000-8000-000000000002',1);
INSERT INTO public.luxor_tour_visits VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',2,'attended'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',2,'attended');
INSERT INTO public.luxor_custom_workflows VALUES
  ('30000000-0000-4000-8000-000000000001','active','tour_attended','40000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002','paused','tour_attended','40000000-0000-4000-8000-000000000002');
INSERT INTO public.luxor_custom_workflow_versions VALUES
  ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','{"trigger":"tour_attended","steps":[{"id":"wait","type":"wait","amount":2,"unit":"hours"},{"id":"end","type":"end"}]}'),
  ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','{"trigger":"tour_attended"}');
UPDATE public.luxor_inquiries SET tour_attendance_status='attended',current_tour_visit_version=2 WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.luxor_inquiries SET tour_attendance_status='attended',current_tour_visit_version=2 WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.test_runtime SET enabled=false;
UPDATE public.luxor_inquiries SET tour_attendance_status='attended',current_tour_visit_version=2 WHERE id='10000000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.luxor_custom_workflow_tour_events) <> 1 THEN RAISE EXCEPTION 'Expected one active, enabled, non-replayed event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.luxor_custom_workflow_tour_events WHERE visit_version=2 AND workflow_version_id='40000000-0000-4000-8000-000000000001' AND status='pending') THEN RAISE EXCEPTION 'Event did not pin visit and workflow revision'; END IF;
  IF has_table_privilege('anon','public.luxor_custom_workflow_tour_events','select') OR has_table_privilege('authenticated','public.luxor_custom_workflow_tour_events','select') OR NOT has_table_privilege('service_role','public.luxor_custom_workflow_tour_events','select') THEN RAISE EXCEPTION 'Unexpected outbox privilege'; END IF;
END $$;
-- A transaction that records an outcome and then fails cannot leave an event.
SAVEPOINT outcome;
UPDATE public.test_runtime SET enabled=true;
UPDATE public.luxor_inquiries SET tour_attendance_status='pending' WHERE id='10000000-0000-4000-8000-000000000002';
UPDATE public.luxor_inquiries SET tour_attendance_status='attended' WHERE id='10000000-0000-4000-8000-000000000002';
ROLLBACK TO SAVEPOINT outcome;
DO $$ BEGIN IF (SELECT count(*) FROM public.luxor_custom_workflow_tour_events) <> 1 THEN RAISE EXCEPTION 'Rolled-back outcome left an event'; END IF; END $$;
UPDATE public.test_runtime SET enabled=true;
UPDATE public.luxor_inquiries SET email='tour@example.invalid',phone='+12105550100',marketing_opt_in=true WHERE id='10000000-0000-4000-8000-000000000001';
INSERT INTO public.luxor_sms_consents VALUES ('+12105550100','opted_in',ARRAY['marketing']);
SAVEPOINT corrected_before_consumption;
UPDATE public.luxor_tour_visits SET attendance_status='no_show',version=3 WHERE id='20000000-0000-4000-8000-000000000001';
DO $$ DECLARE result record; BEGIN
  SELECT * INTO result FROM public.luxor_custom_workflow_consume_attended_tours(20);
  IF result.events_ignored<>1 OR result.enrollments_created<>0 OR EXISTS (SELECT 1 FROM public.luxor_custom_workflow_enrollments) THEN RAISE EXCEPTION 'Stale tour enrolled'; END IF;
END $$;
ROLLBACK TO SAVEPOINT corrected_before_consumption;
DO $$ DECLARE result record; enrollment uuid; BEGIN
  SELECT * INTO result FROM public.luxor_custom_workflow_consume_attended_tours(20);
  IF result.events_consumed<>1 OR result.enrollments_created<>1 THEN RAISE EXCEPTION 'Expected one enrollment'; END IF;
  SELECT id INTO enrollment FROM public.luxor_custom_workflow_enrollments;
  IF NOT public.luxor_custom_workflow_enrollment_is_eligible(enrollment,'email') OR NOT public.luxor_custom_workflow_enrollment_is_eligible(enrollment,'text') THEN RAISE EXCEPTION 'Eligible contact blocked'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.luxor_custom_workflow_step_runs r JOIN public.luxor_custom_workflow_tour_events e ON true WHERE r.enrollment_id=enrollment AND r.scheduled_for=e.occurred_at+interval '2 hours') THEN RAISE EXCEPTION 'Wait not based on outcome time'; END IF;
  SELECT * INTO result FROM public.luxor_custom_workflow_consume_attended_tours(20);
  IF result.enrollments_created<>0 THEN RAISE EXCEPTION 'Replay enrolled twice'; END IF;
  UPDATE public.luxor_sms_consents SET status='opted_out';
  IF public.luxor_custom_workflow_enrollment_is_eligible(enrollment,'text') THEN RAISE EXCEPTION 'STOP did not block text'; END IF;
  INSERT INTO public.luxor_marketing_suppressions VALUES ('tour@example.invalid');
  IF public.luxor_custom_workflow_enrollment_is_eligible(enrollment,'email') THEN RAISE EXCEPTION 'Suppressed email eligible'; END IF;
  UPDATE public.luxor_tour_visits SET attendance_status='no_show',version=3 WHERE id='20000000-0000-4000-8000-000000000001';
  IF public.luxor_custom_workflow_enrollment_is_eligible(enrollment,'follow_up_eligible') THEN RAISE EXCEPTION 'Corrected visit remained eligible'; END IF;
END $$;
ROLLBACK;
