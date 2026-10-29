-- Give every explicitly scheduled tour a stable visit identity. Existing rows
-- are deliberately not backfilled; a legacy tour receives an identity only
-- when an owner explicitly reschedules or records its outcome.
BEGIN;

CREATE TABLE public.luxor_tour_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.luxor_inquiries(id) ON DELETE CASCADE,
  calendar_event_id uuid REFERENCES public.luxor_calendar_events(id) ON DELETE SET NULL,
  tour_date date NOT NULL,
  attendance_status text NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending','attended','no_show','rescheduled','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX luxor_tour_visits_inquiry_idx ON public.luxor_tour_visits(inquiry_id, created_at DESC);
ALTER TABLE public.luxor_inquiries
  ADD COLUMN current_tour_visit_id uuid REFERENCES public.luxor_tour_visits(id) ON DELETE SET NULL,
  ADD COLUMN current_tour_visit_version integer NOT NULL DEFAULT 0 CHECK (current_tour_visit_version >= 0);
ALTER TABLE public.luxor_tasks
  ADD COLUMN post_tour_source_visit_id uuid REFERENCES public.luxor_tour_visits(id) ON DELETE SET NULL,
  ADD COLUMN post_tour_reopen_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN post_tour_user_modified boolean NOT NULL DEFAULT false,
  ADD COLUMN post_tour_generated_due_date date,
  ADD COLUMN post_tour_generated_due_at timestamptz;
CREATE UNIQUE INDEX luxor_tasks_post_tour_source_visit_uidx
  ON public.luxor_tasks(post_tour_source_visit_id)
  WHERE post_tour_source_visit_id IS NOT NULL;
ALTER TABLE public.luxor_tour_schedule_receipts
  ADD COLUMN visit_id uuid REFERENCES public.luxor_tour_visits(id) ON DELETE SET NULL,
  ADD COLUMN visit_intent text CHECK (visit_intent IS NULL OR visit_intent IN ('new_visit','reschedule')),
  ADD COLUMN request_id uuid,
  ADD COLUMN request_payload jsonb,
  ADD COLUMN result jsonb;
CREATE UNIQUE INDEX luxor_tour_schedule_receipts_request_uidx
  ON public.luxor_tour_schedule_receipts(request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.luxor_tour_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.luxor_tour_visits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.luxor_save_tour_visit_schedule(
  p_inquiry_id uuid, p_expected_sequence integer, p_state jsonb, p_tour jsonb,
  p_templates jsonb, p_requested_by text, p_visit_intent text,
  p_visit_id uuid, p_request_id uuid, p_expected_visit_id uuid, p_expected_visit_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_inquiry public.luxor_inquiries%rowtype;
  v_visit public.luxor_tour_visits%rowtype;
  v_result jsonb;
  v_event_id uuid;
  v_sequence integer;
  v_date date;
  v_receipt public.luxor_tour_schedule_receipts%rowtype;
  v_payload jsonb;
BEGIN
  IF p_visit_intent IS NULL OR p_visit_intent NOT IN ('new_visit','reschedule') OR p_visit_id IS NULL
     OR p_request_id IS NULL OR p_expected_visit_version IS NULL OR p_expected_visit_version < 0 THEN
    RAISE EXCEPTION 'A visit intent, request ID, and expected visit version are required.' USING ERRCODE='22023';
  END IF;
  IF p_expected_sequence IS NULL OR p_expected_sequence < -1 THEN
    RAISE EXCEPTION 'A valid expected calendar sequence is required.' USING ERRCODE='22023';
  END IF;
  IF p_visit_intent='reschedule' AND p_expected_visit_id IS NOT NULL AND p_visit_id IS DISTINCT FROM p_expected_visit_id THEN
    RAISE EXCEPTION 'Rescheduling must keep the current visit identity.' USING ERRCODE='22023';
  END IF;
  IF p_visit_intent='new_visit' AND p_expected_visit_id IS NOT NULL AND p_visit_id=p_expected_visit_id THEN
    RAISE EXCEPTION 'A separate visit must use a new visit identity.' USING ERRCODE='22023';
  END IF;
  v_payload := jsonb_build_object(
    'inquiry_id',p_inquiry_id,'expected_sequence',p_expected_sequence,'state',p_state,
    'tour',p_tour,'templates',p_templates,'requested_by',p_requested_by,
    'visit_intent',p_visit_intent,'visit_id',p_visit_id,
    'expected_visit_id',p_expected_visit_id,'expected_visit_version',p_expected_visit_version
  );
  SELECT * INTO v_inquiry FROM public.luxor_inquiries WHERE id=p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_receipt FROM public.luxor_tour_schedule_receipts WHERE request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_payload OR v_receipt.result IS NULL THEN
      RAISE EXCEPTION 'This schedule request ID was already used with different details.' USING ERRCODE='22023';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('replayed', true);
  END IF;
  IF v_inquiry.current_tour_visit_id IS DISTINCT FROM p_expected_visit_id THEN
    RAISE EXCEPTION 'The current tour visit changed. Refresh before scheduling.' USING ERRCODE='40001';
  END IF;
  IF p_expected_visit_id IS NOT NULL THEN
    SELECT * INTO v_visit FROM public.luxor_tour_visits
     WHERE id=p_expected_visit_id AND inquiry_id=p_inquiry_id FOR UPDATE;
    IF NOT FOUND OR v_visit.version<>p_expected_visit_version THEN
      RAISE EXCEPTION 'The current tour visit changed. Refresh before scheduling.' USING ERRCODE='40001';
    END IF;
  ELSIF p_expected_visit_version<>0 THEN
    RAISE EXCEPTION 'The current tour visit changed. Refresh before scheduling.' USING ERRCODE='40001';
  END IF;
  IF p_visit_intent='reschedule' THEN
    IF p_expected_visit_id IS NULL THEN
      -- Lazy identity creation for a legacy current tour, only after the
      -- owner explicitly chooses to reschedule it (never historical backfill).
      IF p_expected_sequence IS NULL OR p_expected_sequence<0 OR v_inquiry.preferred_tour_date IS NULL
         OR v_inquiry.tour_attendance_status IS DISTINCT FROM 'pending'
         OR NOT EXISTS (SELECT 1 FROM public.luxor_calendar_events WHERE inquiry_id=p_inquiry_id AND status='confirmed') THEN
        RAISE EXCEPTION 'A current scheduled tour is required to reschedule.' USING ERRCODE='40001';
      END IF;
    ELSIF v_visit.attendance_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'A completed or cancelled visit cannot be rescheduled. Schedule another visit.' USING ERRCODE='40001';
    END IF;
  ELSIF p_expected_visit_id IS NULL AND p_expected_sequence>=0
    AND v_inquiry.tour_attendance_status='pending'
    AND EXISTS (SELECT 1 FROM public.luxor_calendar_events WHERE inquiry_id=p_inquiry_id AND status='confirmed') THEN
    RAISE EXCEPTION 'Reschedule the current visit before scheduling another.' USING ERRCODE='40001';
  ELSIF p_expected_visit_id IS NOT NULL
    AND v_visit.attendance_status NOT IN ('attended','no_show','rescheduled','cancelled') THEN
    RAISE EXCEPTION 'Reschedule the current visit before scheduling another.' USING ERRCODE='40001';
  END IF;

  v_result := public.luxor_save_tour_schedule(p_inquiry_id,p_expected_sequence,p_state,
    p_tour,p_templates,p_requested_by);
  v_event_id := (v_result->'event'->>'id')::uuid;
  v_sequence := (v_result->'event'->>'sequence')::integer;
  v_date := (((p_state->>'startUtc')::timestamptz AT TIME ZONE 'America/Chicago')::date);
  SELECT r.* INTO v_receipt FROM public.luxor_tour_schedule_receipts r
   JOIN public.luxor_calendar_revisions cr ON cr.id=r.revision_id
   WHERE cr.event_id=v_event_id AND cr.sequence=v_sequence FOR UPDATE OF r;
  IF v_receipt.request_id IS NOT NULL THEN
    RAISE EXCEPTION 'This calendar revision is already linked to a different visit request.' USING ERRCODE='40001';
  END IF;

  IF p_visit_intent='new_visit' THEN
    INSERT INTO public.luxor_tour_visits(id,inquiry_id,calendar_event_id,tour_date)
    VALUES(p_visit_id,p_inquiry_id,v_event_id,v_date)
    RETURNING * INTO v_visit;
    UPDATE public.luxor_inquiries SET current_tour_visit_id=p_visit_id,current_tour_visit_version=v_visit.version WHERE id=p_inquiry_id RETURNING * INTO v_inquiry;
  ELSE
    IF p_expected_visit_id IS NULL THEN
      INSERT INTO public.luxor_tour_visits(id,inquiry_id,calendar_event_id,tour_date)
      VALUES(p_visit_id,p_inquiry_id,v_event_id,v_date) RETURNING * INTO v_visit;
      UPDATE public.luxor_inquiries SET current_tour_visit_id=p_visit_id,current_tour_visit_version=v_visit.version WHERE id=p_inquiry_id RETURNING * INTO v_inquiry;
    ELSE
      UPDATE public.luxor_tour_visits SET calendar_event_id=v_event_id,tour_date=v_date,
        version=version+1,updated_at=now() WHERE id=p_expected_visit_id RETURNING * INTO v_visit;
    END IF;
  END IF;
  UPDATE public.luxor_tour_schedule_receipts SET visit_id=p_visit_id,visit_intent=p_visit_intent,
    request_id=p_request_id,request_payload=v_payload
   WHERE revision_id=(SELECT id FROM public.luxor_calendar_revisions WHERE event_id=v_event_id AND sequence=v_sequence);
  UPDATE public.luxor_inquiries SET current_tour_visit_version=v_visit.version
   WHERE id=p_inquiry_id RETURNING * INTO v_inquiry;
  v_result := v_result || jsonb_build_object('inquiry',to_jsonb(v_inquiry),'visit',to_jsonb(v_visit));
  UPDATE public.luxor_tour_schedule_receipts SET result=v_result WHERE request_id=p_request_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.luxor_save_tour_visit_schedule(uuid,integer,jsonb,jsonb,jsonb,text,text,uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_save_tour_visit_schedule(uuid,integer,jsonb,jsonb,jsonb,text,text,uuid,uuid,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.luxor_record_tour_visit_outcome(
  p_inquiry_id uuid, p_visit_id uuid, p_expected_version integer,
  p_expected_sequence integer, p_attendance text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_inquiry public.luxor_inquiries%rowtype;
  v_visit public.luxor_tour_visits%rowtype;
  v_task public.luxor_tasks%rowtype;
  v_date date;
  v_event_id uuid;
  v_event_sequence integer;
BEGIN
  IF p_attendance IS NULL OR p_attendance NOT IN ('attended','no_show','pending','rescheduled')
     OR p_expected_version IS NULL OR p_expected_version<0 THEN
    RAISE EXCEPTION 'Invalid tour outcome.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_inquiry FROM public.luxor_inquiries WHERE id=p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inquiry not found.' USING ERRCODE='P0002'; END IF;
  IF v_inquiry.current_tour_visit_id IS NULL AND p_visit_id IS NULL THEN
    IF p_expected_sequence IS NULL OR p_expected_sequence<0 THEN
      RAISE EXCEPTION 'The scheduled tour changed. Refresh before recording attendance.' USING ERRCODE='40001';
    END IF;
    SELECT id,sequence INTO v_event_id,v_event_sequence FROM public.luxor_calendar_events
     WHERE inquiry_id=p_inquiry_id AND status='confirmed' FOR UPDATE;
    IF v_event_id IS NULL OR v_event_sequence IS DISTINCT FROM p_expected_sequence THEN
      RAISE EXCEPTION 'The scheduled tour changed. Refresh before recording attendance.' USING ERRCODE='40001';
    END IF;
    -- The UUID from the calendar row is a calendar-event identity; allocate a
    -- separate stable identity for this actual visit.
    p_visit_id := gen_random_uuid();
    v_date := v_inquiry.preferred_tour_date;
    IF v_date IS NULL THEN RAISE EXCEPTION 'The tour date is missing.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.luxor_tour_visits(id,inquiry_id,calendar_event_id,tour_date)
    VALUES(p_visit_id,p_inquiry_id,v_event_id,v_date);
    UPDATE public.luxor_inquiries SET current_tour_visit_id=p_visit_id,current_tour_visit_version=1
     WHERE id=p_inquiry_id RETURNING * INTO v_inquiry;
    p_expected_version := 1;
  END IF;
  IF v_inquiry.current_tour_visit_id IS DISTINCT FROM p_visit_id THEN
    RAISE EXCEPTION 'This is no longer the current visit. Refresh before recording attendance.' USING ERRCODE='40001';
  END IF;
  SELECT * INTO v_visit FROM public.luxor_tour_visits WHERE id=p_visit_id AND inquiry_id=p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tour visit not found.' USING ERRCODE='P0002'; END IF;
  IF v_visit.version<>p_expected_version THEN
    IF v_visit.attendance_status=p_attendance THEN
      SELECT * INTO v_task FROM public.luxor_tasks WHERE post_tour_source_visit_id=p_visit_id;
      RETURN jsonb_build_object('outcome','already_applied','visit_id',p_visit_id,'version',v_visit.version,'task_id',v_task.id,'due_date',v_task.due_date);
    END IF;
    RAISE EXCEPTION 'The visit changed. Refresh before recording attendance.' USING ERRCODE='40001';
  END IF;
  IF v_visit.attendance_status=p_attendance THEN
    SELECT * INTO v_task FROM public.luxor_tasks WHERE post_tour_source_visit_id=p_visit_id;
    RETURN jsonb_build_object('outcome','already_applied','visit_id',p_visit_id,'version',v_visit.version,'task_id',v_task.id,'due_date',v_task.due_date);
  END IF;
  IF v_visit.attendance_status IN ('cancelled','rescheduled') THEN
    RAISE EXCEPTION 'A cancelled or rescheduled visit cannot be completed.' USING ERRCODE='40001';
  END IF;
  UPDATE public.luxor_tour_visits SET attendance_status=p_attendance,version=version+1,updated_at=now()
   WHERE id=p_visit_id RETURNING * INTO v_visit;
  UPDATE public.luxor_inquiries SET tour_attendance_status=p_attendance,current_tour_visit_version=v_visit.version,
    status=CASE WHEN p_attendance='attended' AND status IN ('new','contacted','tour_requested','tour_confirmed') THEN 'tour_confirmed' ELSE status END,
    pipeline_stage=CASE WHEN p_attendance='attended' AND pipeline_stage IN ('inquiry','tour') THEN 'proposal'
      WHEN p_attendance='no_show' AND pipeline_stage='proposal' THEN 'tour' ELSE pipeline_stage END
   WHERE id=p_inquiry_id;
  IF p_attendance='attended' THEN
    INSERT INTO public.luxor_tasks(inquiry_id,title,description,due_date,due_at,priority,status,
      post_tour_source_visit_id,post_tour_source_event_id,post_tour_generated_due_date,post_tour_generated_due_at)
    VALUES(p_inquiry_id,'Post-Tour Follow-Up',
      '[follow-up:email] [post-tour] [automatic] Scheduled three calendar days after the completed tour.',
      v_visit.tour_date+3,NULL,'medium','pending',p_visit_id,v_visit.calendar_event_id,v_visit.tour_date+3,NULL)
    ON CONFLICT(post_tour_source_visit_id) WHERE post_tour_source_visit_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_task;
    IF NOT FOUND THEN
      SELECT * INTO v_task FROM public.luxor_tasks WHERE post_tour_source_visit_id=p_visit_id FOR UPDATE;
      IF v_task.post_tour_reopen_cancelled
         AND NOT v_task.post_tour_user_modified
         AND v_task.due_date IS NOT DISTINCT FROM v_task.post_tour_generated_due_date
         AND v_task.due_at IS NOT DISTINCT FROM v_task.post_tour_generated_due_at
         AND v_task.status='cancelled' THEN
        UPDATE public.luxor_tasks SET status='pending',completed_at=NULL,post_tour_reopen_cancelled=false
         WHERE id=v_task.id RETURNING * INTO v_task;
      END IF;
    END IF;
  ELSE
    UPDATE public.luxor_tasks SET status='cancelled',post_tour_reopen_cancelled=true
     WHERE post_tour_source_visit_id=p_visit_id AND status='pending' AND post_tour_user_modified=false
       AND due_date IS NOT DISTINCT FROM post_tour_generated_due_date
       AND due_at IS NOT DISTINCT FROM post_tour_generated_due_at;
  END IF;
  RETURN jsonb_build_object('outcome',CASE WHEN p_attendance='attended' THEN 'scheduled' ELSE 'not_completed' END,
    'visit_id',p_visit_id,'version',v_visit.version,'task_id',v_task.id,'due_date',v_task.due_date,'task_status',v_task.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.luxor_record_tour_visit_outcome(uuid,uuid,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_record_tour_visit_outcome(uuid,uuid,integer,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.luxor_cancel_visit_follow_up()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_visit_id uuid; v_version integer;
BEGIN
  IF NEW.tour_attendance_status='cancelled' AND OLD.tour_attendance_status IS DISTINCT FROM 'cancelled'
     AND NEW.current_tour_visit_id IS NOT NULL THEN
    v_visit_id := NEW.current_tour_visit_id;
    UPDATE public.luxor_tour_visits SET attendance_status='cancelled',version=version+1,updated_at=now()
     WHERE id=v_visit_id AND attendance_status='pending' RETURNING version INTO v_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only a pending current visit can be cancelled.' USING ERRCODE='40001';
    END IF;
    UPDATE public.luxor_tasks SET status='cancelled',post_tour_reopen_cancelled=false
     WHERE post_tour_source_visit_id=v_visit_id AND status='pending' AND post_tour_user_modified=false
       AND due_date IS NOT DISTINCT FROM post_tour_generated_due_date
       AND due_at IS NOT DISTINCT FROM post_tour_generated_due_at;
    UPDATE public.luxor_inquiries SET current_tour_visit_version=v_version WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.luxor_cancel_visit_follow_up() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER luxor_cancel_visit_follow_up_after_update
AFTER UPDATE OF tour_attendance_status ON public.luxor_inquiries
FOR EACH ROW EXECUTE FUNCTION public.luxor_cancel_visit_follow_up();

NOTIFY pgrst, 'reload schema';
COMMIT;
