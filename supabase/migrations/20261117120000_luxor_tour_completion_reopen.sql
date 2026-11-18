-- Reopen mistaken tour completions: restore scheduled attendance, rewind tour-stage pipeline, and stop not-yet-sent follow-up work.

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
  v_previous_attendance text;
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
  IF p_attendance='pending' AND v_visit.attendance_status NOT IN ('attended','no_show') THEN
    RAISE EXCEPTION 'Only a recorded tour outcome can be reopened.' USING ERRCODE='40001';
  END IF;
  v_previous_attendance := v_visit.attendance_status;
  UPDATE public.luxor_tour_visits SET attendance_status=p_attendance,version=version+1,updated_at=now()
   WHERE id=p_visit_id RETURNING * INTO v_visit;
  UPDATE public.luxor_inquiries SET tour_attendance_status=p_attendance,current_tour_visit_version=v_visit.version,
    status=CASE
      WHEN p_attendance='pending' AND v_previous_attendance='attended' AND status='tour_confirmed' THEN 'tour_confirmed'
      WHEN p_attendance='attended' AND status IN ('new','contacted','tour_requested','tour_confirmed') THEN 'tour_confirmed'
      ELSE status
    END,
    pipeline_stage=CASE
      WHEN p_attendance='attended' AND pipeline_stage IN ('inquiry','tour') THEN 'proposal'
      WHEN p_attendance='no_show' AND pipeline_stage='proposal' THEN 'tour'
      WHEN p_attendance='pending' AND v_previous_attendance='attended' AND pipeline_stage='proposal' THEN 'tour'
      WHEN p_attendance='pending' AND v_previous_attendance='no_show' AND pipeline_stage='tour' THEN 'tour'
      ELSE pipeline_stage
    END
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
  RETURN jsonb_build_object(
    'outcome',CASE WHEN p_attendance='attended' THEN 'scheduled' WHEN p_attendance='pending' THEN 'reopened' ELSE 'not_completed' END,
    'visit_id',p_visit_id,'version',v_visit.version,'task_id',v_task.id,'due_date',v_task.due_date,'task_status',v_task.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.luxor_stop_tour_attended_followups(p_inquiry_id uuid, p_visit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_run_id uuid;
  v_enrollment_id uuid;
BEGIN
  IF p_inquiry_id IS NULL OR p_visit_id IS NULL THEN
  RETURN;
  END IF;
  FOR v_run_id IN
    SELECT sr.id
      FROM public.luxor_custom_workflow_step_runs sr
      JOIN public.luxor_custom_workflow_enrollments e ON e.id = sr.enrollment_id
      JOIN public.luxor_custom_workflow_versions v ON v.id = e.workflow_version_id AND v.workflow_id = e.workflow_id
      WHERE e.inquiry_id = p_inquiry_id
        AND v.definition->>'trigger' = 'tour_attended'
        AND e.status IN ('active','paused','held')
        AND sr.status IN ('scheduled','queued','failed','held')
        AND EXISTS (
          SELECT 1
            FROM public.luxor_custom_workflow_source_events s
            JOIN public.luxor_custom_workflow_tour_events te ON te.id = (s.payload->>'tour_event_id')::uuid
           WHERE s.id = e.source_event_id
             AND te.inquiry_id = p_inquiry_id
             AND te.visit_id = p_visit_id
        )
  LOOP
    PERFORM public.luxor_custom_workflow_stop_step(v_run_id, 'Tour completion was reopened before the visit.');
  END LOOP;
  FOR v_enrollment_id IN
    SELECT e.id
      FROM public.luxor_custom_workflow_enrollments e
      JOIN public.luxor_custom_workflow_versions v ON v.id = e.workflow_version_id AND v.workflow_id = e.workflow_id
      WHERE e.inquiry_id = p_inquiry_id
        AND v.definition->>'trigger' = 'tour_attended'
        AND e.status IN ('active','paused','held')
        AND EXISTS (
          SELECT 1
            FROM public.luxor_custom_workflow_source_events s
            JOIN public.luxor_custom_workflow_tour_events te ON te.id = (s.payload->>'tour_event_id')::uuid
           WHERE s.id = e.source_event_id
             AND te.inquiry_id = p_inquiry_id
             AND te.visit_id = p_visit_id
        )
  LOOP
    UPDATE public.luxor_custom_workflow_enrollments
       SET status='stopped', stopped_at=COALESCE(stopped_at, now()), next_run_at=NULL,
           stop_reason='tour_reopened', last_error='Tour completion was reopened before the visit.', updated_at=now()
     WHERE id=v_enrollment_id AND status IN ('active','paused','held');
  END LOOP;
  UPDATE public.luxor_custom_workflow_tour_events te
     SET status='ignored', processed_at=COALESCE(processed_at, now()), last_error='Tour completion was reopened before the visit.'
   WHERE te.inquiry_id = p_inquiry_id
     AND te.visit_id = p_visit_id
     AND te.status = 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.luxor_stop_tour_attended_followups(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_stop_tour_attended_followups(uuid,uuid) TO service_role;