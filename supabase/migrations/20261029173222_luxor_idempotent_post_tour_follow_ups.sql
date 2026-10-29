-- Create one application-generated follow-up per completed lead tour.
-- The inquiry is the stable tour identity in Luxor's current model; calendar
-- revisions retain one event row per inquiry and are linked when available.
BEGIN;

ALTER TABLE public.luxor_tasks
  ADD COLUMN post_tour_source_inquiry_id uuid REFERENCES public.luxor_inquiries(id) ON DELETE CASCADE,
  ADD COLUMN post_tour_source_event_id uuid REFERENCES public.luxor_calendar_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX luxor_tasks_post_tour_source_inquiry_uidx
  ON public.luxor_tasks (post_tour_source_inquiry_id)
  WHERE post_tour_source_inquiry_id IS NOT NULL;

CREATE INDEX luxor_tasks_post_tour_source_event_idx
  ON public.luxor_tasks (post_tour_source_event_id)
  WHERE post_tour_source_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.luxor_sync_post_tour_follow_up(p_inquiry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_attendance text;
  v_tour_date date;
  v_event_id uuid;
  v_task public.luxor_tasks%rowtype;
BEGIN
  SELECT inquiry.tour_attendance_status, inquiry.preferred_tour_date, calendar_event.id
    INTO v_attendance, v_tour_date, v_event_id
    FROM public.luxor_inquiries AS inquiry
    LEFT JOIN public.luxor_calendar_events AS calendar_event
      ON calendar_event.inquiry_id = inquiry.id
   WHERE inquiry.id = p_inquiry_id
   FOR UPDATE OF inquiry;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Luxor inquiry not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_attendance IS DISTINCT FROM 'attended' THEN
    UPDATE public.luxor_tasks
       SET status = 'cancelled'
     WHERE post_tour_source_inquiry_id = p_inquiry_id
       AND status = 'pending';
    RETURN jsonb_build_object('outcome', 'not_completed');
  END IF;

  IF v_tour_date IS NULL THEN
    RETURN jsonb_build_object('outcome', 'missing_tour_date');
  END IF;

  INSERT INTO public.luxor_tasks (
    inquiry_id, title, description, due_date, due_at, priority, status,
    post_tour_source_inquiry_id, post_tour_source_event_id
  ) VALUES (
    p_inquiry_id,
    'Post-Tour Follow-Up',
    '[follow-up:email] [post-tour] [automatic] Scheduled three calendar days after the completed tour.',
    v_tour_date + 3,
    NULL,
    'medium',
    'pending',
    p_inquiry_id,
    v_event_id
  )
  ON CONFLICT (post_tour_source_inquiry_id)
    WHERE post_tour_source_inquiry_id IS NOT NULL
  DO UPDATE SET
    due_date = EXCLUDED.due_date,
    post_tour_source_event_id = EXCLUDED.post_tour_source_event_id,
    status = 'pending'
  WHERE public.luxor_tasks.status <> 'completed'
  RETURNING * INTO v_task;

  IF NOT FOUND THEN
    SELECT * INTO v_task
      FROM public.luxor_tasks
     WHERE post_tour_source_inquiry_id = p_inquiry_id;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'scheduled',
    'task_id', v_task.id,
    'due_date', v_task.due_date,
    'task_status', v_task.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.luxor_sync_post_tour_follow_up(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_sync_post_tour_follow_up(uuid) TO service_role;

COMMIT;
