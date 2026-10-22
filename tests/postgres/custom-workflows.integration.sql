\set ON_ERROR_STOP on
BEGIN;

-- This script is for a disposable PostgreSQL database only. It creates a
-- synthetic subset of Luxor's existing queue schema; it never connects to
-- production or sends messages.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN BYPASSRLS'; END IF;
END
$roles$;

CREATE TABLE public.luxor_inquiries (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'new',
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  flow text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  email text,
  phone text,
  full_name text,
  event_type text,
  guest_count integer,
  target_date date,
  preferred_tour_date date,
  follow_up_disposition text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.luxor_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid,
  status text NOT NULL DEFAULT 'confirmed'
);
CREATE TABLE public.luxor_marketing_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  reason text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.luxor_sms_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  consent_scopes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.luxor_email_jobs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  inquiry_id uuid REFERENCES public.luxor_inquiries(id) ON DELETE SET NULL,
  automation_enrollment_id uuid,
  automation_step_key text,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  preview_text text,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 50,
  ignore_suppressions boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.luxor_text_jobs (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  inquiry_id uuid REFERENCES public.luxor_inquiries(id) ON DELETE SET NULL,
  job_type text NOT NULL DEFAULT 'manual_campaign',
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  last_error text,
  recipient_phone text,
  recipient_name text,
  body text,
  segment_count integer NOT NULL DEFAULT 1,
  automation_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  opted_out_at timestamptz,
  twilio_message_sid text
);

INSERT INTO public.luxor_inquiries(
  id,flow,is_test,status,email,phone,full_name,event_type,guest_count,target_date,preferred_tour_date,metadata
)
VALUES
  ('11111111-1111-4111-8111-111111111111','contact_form',false,'new','legacy@example.invalid','+16025550101','Legacy Synthetic','Private celebration',80,'2026-12-01',null,'{}'::jsonb),
  ('22222222-2222-4222-8222-222222222222','contact_form',true,'new','test@example.invalid','+16025550102','Test Synthetic',null,null,null,null,'{}'::jsonb);

INSERT INTO public.luxor_email_jobs(id, inquiry_id, job_type, status, recipient_email, subject, body, scheduled_for)
VALUES
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','marketing_campaign','queued','legacy@example.invalid','Legacy fixture','Synthetic body',now()-interval '1 hour'),
  ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','transactional_notice','queued','legacy@example.invalid','Transactional fixture','Synthetic body',now()-interval '1 hour'),
  ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222','test_notification','queued','test@example.invalid','Test fixture','Synthetic body',now()-interval '1 hour');

INSERT INTO public.luxor_text_jobs(id, inquiry_id, job_type, status, scheduled_for)
VALUES ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','manual_campaign','queued',now()-interval '1 hour');

\if :{?simulate_supabase_default_acl}
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
\endif

\ir ../../supabase/migrations/20261022123048_luxor_custom_workflow_foundation.sql
\ir ../../supabase/migrations/20261022123048_luxor_custom_workflow_foundation.sql

DO $$
BEGIN
  IF (SELECT status FROM public.luxor_email_jobs WHERE id='33333333-3333-4333-8333-333333333333') <> 'queued'
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='44444444-4444-4444-8444-444444444444') <> 'queued'
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='55555555-5555-4555-8555-555555555555') <> 'queued'
    OR (SELECT status FROM public.luxor_text_jobs WHERE id='66666666-6666-4666-8666-666666666666') <> 'queued' THEN
    RAISE EXCEPTION 'Migration changed an existing synthetic queue row';
  END IF;
  IF has_table_privilege('anon','public.luxor_custom_workflows','SELECT')
    OR has_table_privilege('authenticated','public.luxor_custom_workflows','SELECT')
    OR has_table_privilege('anon','public.luxor_custom_workflow_activity','SELECT')
    OR has_table_privilege('authenticated','public.luxor_custom_workflow_activity','SELECT') THEN
    RAISE EXCEPTION 'Unauthenticated/portal roles can read private workflow data';
  END IF;
  IF has_table_privilege('service_role','public.luxor_custom_workflows','UPDATE')
    OR has_table_privilege('service_role','public.luxor_custom_workflow_activity','INSERT') THEN
    RAISE EXCEPTION 'Service role has direct table mutation rights beyond the staged RPC interface';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'luxor_custom_workflows','luxor_custom_workflow_versions',
      'luxor_custom_workflow_source_events','luxor_custom_workflow_enrollments',
      'luxor_custom_workflow_step_runs','luxor_custom_workflow_activity',
      'luxor_custom_workflow_unsubscribe_tokens','luxor_custom_workflow_runtime_controls'
    ]) AS tables(table_name)
    CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privileges(privilege)
    WHERE has_table_privilege('service_role',format('public.%I',tables.table_name),privileges.privilege)
  ) THEN
    RAISE EXCEPTION 'Service role retained inherited direct privileges on a custom-workflow table';
  END IF;
  IF NOT has_table_privilege('service_role','public.luxor_custom_workflows','SELECT')
    OR NOT has_table_privilege('service_role','public.luxor_custom_workflow_runtime_controls','SELECT') THEN
    RAISE EXCEPTION 'Service role lost the intended workflow-table read access';
  END IF;
  IF has_table_privilege('service_role','public.luxor_custom_workflow_runtime_controls','UPDATE')
    OR (SELECT authoring_enabled OR execution_enabled OR activation_enabled FROM public.luxor_custom_workflow_runtime_controls WHERE singleton)
    OR has_function_privilege('service_role','public.luxor_custom_workflow_authorize_message_job_at(uuid,text,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Release controls did not default closed or the deterministic pre-send seam was exposed';
  END IF;
  IF has_function_privilege('anon','public.luxor_custom_workflow_create_draft(text,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.luxor_custom_workflow_create_draft(text,jsonb,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.luxor_custom_workflow_create_draft(text,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Draft RPC execute ACL does not match the service-role-only boundary';
  END IF;
  IF has_function_privilege('anon','public.luxor_custom_workflow_change_lifecycle(uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.luxor_custom_workflow_change_lifecycle(uuid,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.luxor_custom_workflow_consume_pending_events(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.luxor_custom_workflow_consume_pending_events(integer)','EXECUTE')
    OR has_function_privilege('anon','public.luxor_custom_workflow_enqueue_text_step(uuid,text,text,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.luxor_custom_workflow_enqueue_text_step(uuid,text,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'A custom-workflow security-definer RPC is executable by an untrusted role';
  END IF;
END
$$;
SELECT 'migration reapply, legacy queue preservation, and private ACLs: PASS';

DO $$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.luxor_custom_workflow_create_draft('Blocked synthetic draft','{}'::jsonb,'tester@example.invalid');
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Database authoring gate allowed an RPC while disabled'; END IF;
  UPDATE public.luxor_custom_workflow_runtime_controls
    SET authoring_enabled=true,execution_enabled=true,activation_enabled=false WHERE singleton=true;
  IF NOT public.luxor_custom_workflow_runtime_enabled() OR NOT public.luxor_custom_workflow_authoring_enabled()
    OR public.luxor_custom_workflow_activation_enabled() THEN
    RAISE EXCEPTION 'Synthetic fixture could not prove independent closed activation gate';
  END IF;
END
$$;
SELECT 'fail-closed database authoring and independent activation gates: PASS';

DO $$
BEGIN
  IF NOT public.luxor_custom_workflow_is_within_sms_send_window(timestamp '2026-10-21 08:00:00' at time zone 'America/Chicago')
    OR NOT public.luxor_custom_workflow_is_within_sms_send_window(timestamp '2026-10-21 19:59:59' at time zone 'America/Chicago')
    OR public.luxor_custom_workflow_is_within_sms_send_window(timestamp '2026-10-21 20:00:00' at time zone 'America/Chicago')
    OR public.luxor_custom_workflow_is_within_sms_send_window(timestamp '2026-10-21 07:59:59' at time zone 'America/Chicago')
    OR public.luxor_custom_workflow_is_within_sms_send_window(null) THEN
    RAISE EXCEPTION 'Chicago SMS send-window boundary test failed';
  END IF;
  IF 'Luxor Event Space: A sample message. Reply STOP to opt out.' !~* '^Luxor Event Space\M'
    OR 'Luxor Event Spaces: A sample message. Reply STOP to opt out.' ~* '^Luxor Event Space\M' THEN
    RAISE EXCEPTION 'Luxor text sender word-boundary regression failed';
  END IF;
END
$$;
SELECT 'deterministic SMS send window and PostgreSQL sender boundary: PASS';

DO $$
DECLARE
  v_definition jsonb := '{
    "schemaVersion":1,
    "trigger":"contact_form_inquiry_created",
    "steps":[
      {"id":"inquiry-acknowledgment","type":"email","mode":"existing_inquiry_acknowledgment","name":"Existing inquiry acknowledgment","subject":"We have received your Luxor inquiry","previewText":"We received your Luxor inquiry and will connect with you shortly.","body":"","ctaText":"","ctaUrl":""},
      {"id":"follow-up-wait","type":"wait","name":"Wait","amount":null,"unit":"days"},
      {"id":"eligibility-check","type":"condition","name":"Eligibility","condition":"follow_up_eligible","whenFalse":"stop"},
      {"id":"marketing-text","type":"text","name":"Marketing text","body":"","requiredConsentScope":"marketing"},
      {"id":"finished","type":"end","name":"End"}
    ]
  }'::jsonb;
  v_workflow uuid;
  v_other_workflow uuid;
  v_revision integer;
  v_event_one uuid;
  v_event_two uuid;
  v_version uuid := gen_random_uuid();
  v_other_version uuid := gen_random_uuid();
  v_enrollment uuid := gen_random_uuid();
  v_email_step uuid := gen_random_uuid();
  v_text_step uuid := gen_random_uuid();
  v_invalid_definition jsonb;
  v_rejected boolean;
  v_activity uuid;
  v_count integer;
  v_allowed boolean;
  v_reason text;
BEGIN
  v_invalid_definition := v_definition || '{"activationMode":"immediate"}'::jsonb;
  IF public.luxor_custom_workflow_definition_is_structural(v_invalid_definition) THEN
    RAISE EXCEPTION 'Definition accepted an unsupported activation field';
  END IF;
  v_invalid_definition := jsonb_set(v_definition, '{steps,1,sendOutsideWindow}', 'true'::jsonb, true);
  IF public.luxor_custom_workflow_definition_is_structural(v_invalid_definition) THEN
    RAISE EXCEPTION 'Step accepted an unsupported send-window field';
  END IF;

  SELECT id, draft_revision INTO v_workflow, v_revision
  FROM public.luxor_custom_workflow_create_draft('Synthetic contact follow-up', v_definition, 'tester@example.invalid');
  IF v_revision <> 1 THEN RAISE EXCEPTION 'New draft did not begin at revision 1'; END IF;

  SELECT public.luxor_record_custom_workflow_source_event('11111111-1111-4111-8111-111111111111') INTO v_event_one;
  SELECT public.luxor_record_custom_workflow_source_event('11111111-1111-4111-8111-111111111111') INTO v_event_two;
  IF v_event_one <> v_event_two THEN RAISE EXCEPTION 'Duplicate source event was not idempotent'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.luxor_record_custom_workflow_source_event('22222222-2222-4222-8222-222222222222');
  EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Test inquiry was accepted as a live source event'; END IF;

  INSERT INTO public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by)
  VALUES (v_version,v_workflow,1,v_definition,'tester@example.invalid');
  UPDATE public.luxor_custom_workflows SET current_version_id=v_version WHERE id=v_workflow;

  SELECT draft_revision INTO v_revision FROM public.luxor_custom_workflow_save_draft(
    v_workflow,1,'Synthetic contact follow-up revised',v_definition,'tester@example.invalid'
  );
  IF v_revision <> 2 THEN RAISE EXCEPTION 'CAS save did not advance draft revision'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.luxor_custom_workflow_save_draft(
      v_workflow,1,'Stale write',v_definition,'tester@example.invalid'
    );
  EXCEPTION WHEN SQLSTATE '40001' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Stale draft write was accepted'; END IF;

  UPDATE public.luxor_custom_workflows SET status='active' WHERE id=v_workflow;
  INSERT INTO public.luxor_inquiries(id,flow,is_test,status,email,metadata)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','contact_form',false,'new','new@example.invalid','{}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM public.luxor_custom_workflow_source_events
    WHERE event_key='contact_form_inquiry_created:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND payload=jsonb_build_object('flow','contact_form','inquiry_created_at',(SELECT created_at FROM public.luxor_inquiries WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
  ) THEN RAISE EXCEPTION 'Eligible synthetic contact form did not create a durable outbox event'; END IF;
  INSERT INTO public.luxor_inquiries(id,flow,is_test,status,email,metadata)
  VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','contact_form',true,'new','test@example.invalid','{}'::jsonb);
  INSERT INTO public.luxor_inquiries(id,flow,is_test,status,email,metadata)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','newsletter_signup',false,'new','newsletter@example.invalid','{}'::jsonb);
  INSERT INTO public.luxor_inquiries(id,flow,is_test,status,email,preferred_tour_date,metadata)
  VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','contact_form',false,'tour_confirmed','tour@example.invalid','2026-10-23','{"autoScheduleTour":true}'::jsonb);
  IF (SELECT count(*) FROM public.luxor_custom_workflow_source_events
      WHERE inquiry_id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd')) <> 1 THEN
    RAISE EXCEPTION 'Outbox trigger captured a test, newsletter, or tour inquiry';
  END IF;

  SELECT id INTO v_activity FROM public.luxor_custom_workflow_activity
  WHERE workflow_id=v_workflow ORDER BY created_at LIMIT 1;
  v_rejected := false;
  BEGIN
    UPDATE public.luxor_custom_workflow_activity SET event_type='rewritten' WHERE id=v_activity;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Activity history was mutable'; END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.luxor_custom_workflow_versions SET version_number=99 WHERE id=v_version;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Immutable workflow version was mutable'; END IF;

  SELECT id INTO v_other_workflow
  FROM public.luxor_custom_workflow_create_draft('Other synthetic workflow', v_definition, 'tester@example.invalid');
  INSERT INTO public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by)
  VALUES (v_other_version,v_other_workflow,1,v_definition,'tester@example.invalid');

  INSERT INTO public.luxor_custom_workflow_enrollments(
    id,workflow_id,workflow_version_id,source_event_id,inquiry_id,status
  ) VALUES (
    v_enrollment,v_workflow,v_version,v_event_one,'11111111-1111-4111-8111-111111111111','active'
  );

  v_rejected := false;
  BEGIN
    INSERT INTO public.luxor_custom_workflow_step_runs(
      id,enrollment_id,workflow_version_id,step_id,step_order,channel,idempotency_key
    ) VALUES (
      gen_random_uuid(),v_enrollment,v_other_version,'wrong-version',1,'email','mismatch@example.invalid'
    );
  EXCEPTION WHEN foreign_key_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Step run accepted a version different from its enrollment'; END IF;

  INSERT INTO public.luxor_custom_workflow_step_runs(
    id,enrollment_id,workflow_version_id,step_id,step_order,channel,idempotency_key
  ) VALUES
    (v_email_step,v_enrollment,v_version,'marketing-email',1,'email','synthetic-email-step'),
    (v_text_step,v_enrollment,v_version,'marketing-text',2,'text','synthetic-text-step');

INSERT INTO public.luxor_email_jobs(
    id,job_type,status,recipient_email,subject,body,scheduled_for,custom_workflow_step_run_id
  ) VALUES (
    '77777777-7777-4777-8777-777777777777','custom_workflow','queued','synthetic@example.invalid','Custom fixture','Synthetic body',now()-interval '1 hour',v_email_step
  );
  INSERT INTO public.luxor_text_jobs(id,inquiry_id,job_type,status,scheduled_for,recipient_phone,custom_workflow_step_run_id)
  VALUES ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','custom_workflow','queued',now()-interval '1 hour','+16025550101',v_text_step);

  INSERT INTO public.luxor_sms_consents(phone_number,status,consent_scopes)
  VALUES ('+16025550101','opted_in',ARRAY['marketing']::text[]);
  UPDATE public.luxor_custom_workflow_enrollments
    SET current_step_id='marketing-text',next_run_at=now()-interval '1 hour' WHERE id=v_enrollment;
  UPDATE public.luxor_custom_workflow_step_runs
    SET status='sending',scheduled_for=now()-interval '1 hour' WHERE id=v_text_step;
  UPDATE public.luxor_text_jobs
    SET status='sending',attempts=1 WHERE custom_workflow_step_run_id=v_text_step;
  SELECT allowed,reason INTO v_allowed,v_reason
    FROM public.luxor_custom_workflow_authorize_message_job_at(
      '88888888-8888-4888-8888-888888888888','text',timestamp '2026-10-21 07:59:00' at time zone 'America/Chicago'
    );
  IF v_allowed OR v_reason <> 'outside_sms_send_window'
    OR (SELECT status FROM public.luxor_text_jobs WHERE custom_workflow_step_run_id=v_text_step) <> 'queued'
    OR (SELECT status FROM public.luxor_custom_workflow_step_runs WHERE id=v_text_step) <> 'queued' THEN
    RAISE EXCEPTION 'The deterministic pre-send window check did not safely release an outside-window job';
  END IF;
  UPDATE public.luxor_custom_workflow_step_runs SET status='sending' WHERE id=v_text_step;
  UPDATE public.luxor_text_jobs SET status='sending',attempts=1 WHERE custom_workflow_step_run_id=v_text_step;
  SELECT allowed,reason INTO v_allowed,v_reason
    FROM public.luxor_custom_workflow_authorize_message_job_at(
      '88888888-8888-4888-8888-888888888888','text',timestamp '2026-10-21 10:00:00' at time zone 'America/Chicago'
    );
  IF NOT v_allowed OR v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'The deterministic pre-send window check rejected a consented in-window synthetic recipient: %',v_reason;
  END IF;
  UPDATE public.luxor_custom_workflow_step_runs SET status='queued' WHERE id=v_text_step;
  UPDATE public.luxor_text_jobs SET status='queued',attempts=0 WHERE custom_workflow_step_run_id=v_text_step;

  SELECT count(*) INTO v_count FROM public.luxor_claim_due_email_jobs(20);
  IF v_count <> 1
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='33333333-3333-4333-8333-333333333333') <> 'sending'
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='77777777-7777-4777-8777-777777777777') <> 'queued'
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='44444444-4444-4444-8444-444444444444') <> 'queued'
    OR (SELECT status FROM public.luxor_email_jobs WHERE id='55555555-5555-4555-8555-555555555555') <> 'queued' THEN
    RAISE EXCEPTION 'General email claimer did not isolate synthetic custom, transactional, or test jobs';
  END IF;

  SELECT count(*) INTO v_count FROM public.luxor_claim_due_text_jobs(20);
  IF v_count <> 1
    OR (SELECT status FROM public.luxor_text_jobs WHERE id='66666666-6666-4666-8666-666666666666') <> 'sending'
    OR (SELECT status FROM public.luxor_text_jobs WHERE id='88888888-8888-4888-8888-888888888888') <> 'queued' THEN
    RAISE EXCEPTION 'General text claimer did not isolate the synthetic custom job';
  END IF;

  PERFORM public.luxor_custom_workflow_archive_draft(v_other_workflow,'tester@example.invalid');
  IF (SELECT status FROM public.luxor_custom_workflows WHERE id=v_other_workflow) <> 'archived' THEN
    RAISE EXCEPTION 'Draft archive transition failed';
  END IF;
END
$$;
SELECT 'idempotent outbox, test exclusion, CAS save, append-only history, version pinning, and legacy/custom queue separation: PASS';

DO $$
DECLARE
  workflow_id uuid;
  lifecycle_id uuid;
  lifecycle_version_id uuid;
  source_event_id uuid;
  enrollment_id uuid := gen_random_uuid();
  step_run_id uuid := gen_random_uuid();
  job_id uuid := '99999999-9999-4999-8999-999999999999';
  acknowledgment_job_id uuid := 'cacacaca-caca-4aca-8aca-cacacacacaca';
  acknowledgment_enrollment_id uuid;
  acknowledgment_step_run_id uuid;
  enrollments_created integer;
  definition jsonb := '{
    "schemaVersion":1,
    "trigger":"contact_form_inquiry_created",
    "steps":[
      {"id":"inquiry-acknowledgment","type":"email","mode":"existing_inquiry_acknowledgment","name":"Existing inquiry acknowledgment","subject":"We have received your Luxor inquiry","previewText":"We received your Luxor inquiry and will connect with you shortly.","body":"","ctaText":"","ctaUrl":""},
      {"id":"follow-up-wait","type":"wait","name":"Wait","amount":2,"unit":"days"},
      {"id":"eligibility-check","type":"condition","name":"Eligibility","condition":"follow_up_eligible","whenFalse":"stop"},
      {"id":"marketing-text","type":"text","name":"Marketing text","body":"Luxor Event Space: Thank you for your inquiry. Reply STOP to opt out.","requiredConsentScope":"marketing"},
      {"id":"finished","type":"end","name":"End"}
    ]
  }'::jsonb;
  rejected boolean := false;
  job_status text;
  enrollment_status text;
  legacy_text_status_before text;
BEGIN
  SELECT id INTO workflow_id FROM public.luxor_custom_workflows WHERE name='Synthetic contact follow-up revised';
  SELECT id INTO lifecycle_id FROM public.luxor_custom_workflow_create_draft('Lifecycle synthetic workflow',definition,'arianna@example.invalid');
  BEGIN
    PERFORM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'activate','arianna@example.invalid');
  EXCEPTION WHEN SQLSTATE '55000' THEN rejected := true;
  END;
  IF NOT rejected OR (SELECT status FROM public.luxor_custom_workflows WHERE id=lifecycle_id) <> 'draft' THEN
    RAISE EXCEPTION 'Activation was not blocked by the separate default-off owner gate';
  END IF;

  PERFORM public.luxor_custom_workflow_change_lifecycle(workflow_id,'pause','arianna@example.invalid');
  IF (SELECT status FROM public.luxor_custom_workflows WHERE id=workflow_id) <> 'paused' THEN
    RAISE EXCEPTION 'Synthetic active workflow did not pause';
  END IF;
  UPDATE public.luxor_custom_workflow_runtime_controls SET activation_enabled=true WHERE singleton=true;
  SELECT id INTO lifecycle_id FROM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'activate','arianna@example.invalid');
  SELECT current_version_id INTO lifecycle_version_id FROM public.luxor_custom_workflows WHERE id=lifecycle_id;
  IF lifecycle_version_id IS NULL OR (SELECT status FROM public.luxor_custom_workflows WHERE id=lifecycle_id) <> 'active' THEN
    RAISE EXCEPTION 'Synthetic activation did not pin a new immutable version';
  END IF;

  -- Reuse the existing inquiry receipt; the custom workflow must not enqueue another one.
  INSERT INTO public.luxor_email_jobs(id,inquiry_id,job_type,status,recipient_email,subject,body,metadata)
  VALUES (acknowledgment_job_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','marketing_campaign','queued',
    'new@example.invalid','Existing synthetic receipt','Synthetic receipt body','{"source":"inquiry_acknowledgment"}'::jsonb);
  SELECT e.enrollments_created INTO enrollments_created
    FROM public.luxor_custom_workflow_consume_pending_events(20) e;
  SELECT e.id INTO acknowledgment_enrollment_id FROM public.luxor_custom_workflow_enrollments e
    WHERE e.workflow_id=lifecycle_id AND e.inquiry_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT sr.id INTO acknowledgment_step_run_id FROM public.luxor_custom_workflow_step_runs sr
    WHERE sr.enrollment_id=acknowledgment_enrollment_id AND sr.step_id='inquiry-acknowledgment';
  IF enrollments_created <> 1 OR acknowledgment_enrollment_id IS NULL OR acknowledgment_step_run_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.luxor_custom_workflow_step_runs
      WHERE id=acknowledgment_step_run_id AND status='queued'
        AND snapshot->>'existing_acknowledgment'='true'
        AND snapshot->>'email_job_id'=acknowledgment_job_id::text)
    OR (SELECT count(*) FROM public.luxor_email_jobs WHERE inquiry_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND job_type='marketing_campaign' AND metadata->>'source'='inquiry_acknowledgment') <> 1
    OR EXISTS (SELECT 1 FROM public.luxor_email_jobs WHERE inquiry_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND job_type='custom_workflow') THEN
    RAISE EXCEPTION 'Consumer did not reuse the existing synthetic acknowledgment exactly once';
  END IF;
  SELECT e.enrollments_created INTO enrollments_created
    FROM public.luxor_custom_workflow_consume_pending_events(20) e;
  IF enrollments_created <> 0
    OR (SELECT count(*) FROM public.luxor_custom_workflow_enrollments e
      WHERE e.workflow_id=lifecycle_id AND e.inquiry_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
    OR (SELECT count(*) FROM public.luxor_email_jobs WHERE inquiry_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND job_type='marketing_campaign' AND metadata->>'source'='inquiry_acknowledgment') <> 1 THEN
    RAISE EXCEPTION 'Repeat consumer pass duplicated the acknowledgment or enrollment';
  END IF;

  SELECT id INTO source_event_id FROM public.luxor_custom_workflow_source_events
    WHERE inquiry_id='11111111-1111-4111-8111-111111111111' ORDER BY received_at LIMIT 1;
  INSERT INTO public.luxor_custom_workflow_enrollments(
    id,workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at
  ) VALUES (
    enrollment_id,lifecycle_id,lifecycle_version_id,source_event_id,'11111111-1111-4111-8111-111111111111','active','marketing-text',now()-interval '1 hour'
  );
  INSERT INTO public.luxor_custom_workflow_step_runs(
    id,enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for
  ) VALUES (
    step_run_id,enrollment_id,lifecycle_version_id,'marketing-text',3,'text','queued','lifecycle-text-step',now()-interval '1 hour'
  );
  INSERT INTO public.luxor_text_jobs(
    id,inquiry_id,job_type,status,scheduled_for,recipient_phone,custom_workflow_step_run_id
  ) VALUES (
    job_id,'11111111-1111-4111-8111-111111111111','custom_workflow','queued',now()-interval '1 hour','+16025550101',step_run_id
  );
  PERFORM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'pause','lewis@example.invalid');
  IF (SELECT status FROM public.luxor_text_jobs WHERE id=job_id) <> 'queued' THEN
    RAISE EXCEPTION 'Pause dispatched or cancelled queued custom work instead of holding it';
  END IF;
  PERFORM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'resume','arianna@example.invalid');
  IF (SELECT status FROM public.luxor_custom_workflows WHERE id=lifecycle_id) <> 'active'
    OR (SELECT status FROM public.luxor_text_jobs WHERE id=job_id) <> 'queued' THEN
    RAISE EXCEPTION 'Resume changed the immutable queued custom work';
  END IF;
  PERFORM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'pause','arianna@example.invalid');
  SELECT status INTO legacy_text_status_before FROM public.luxor_text_jobs
    WHERE id='66666666-6666-4666-8666-666666666666';
  PERFORM public.luxor_custom_workflow_change_lifecycle(lifecycle_id,'archive','arianna@example.invalid');
  SELECT status INTO job_status FROM public.luxor_text_jobs WHERE id=job_id;
  SELECT status INTO enrollment_status FROM public.luxor_custom_workflow_enrollments WHERE id=enrollment_id;
  IF job_status <> 'cancelled' OR enrollment_status <> 'stopped'
    OR (SELECT status FROM public.luxor_custom_workflow_step_runs WHERE id=step_run_id) <> 'cancelled'
    OR (SELECT status FROM public.luxor_text_jobs WHERE id='66666666-6666-4666-8666-666666666666') IS DISTINCT FROM legacy_text_status_before THEN
    RAISE EXCEPTION 'Archive failed to cancel only unsent custom work while preserving the legacy job';
  END IF;
END
$$;
SELECT 'synthetic lifecycle gates, pause/resume, version pinning, and custom-only archive: PASS';
ROLLBACK;
