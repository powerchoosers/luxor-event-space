-- Preserve user-owned post-tour task changes when completion sync is replayed.
BEGIN;

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
  SELECT inquiry.tour_attendance_status,
         inquiry.preferred_tour_date,
         calendar_event.id
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
  DO NOTHING
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

COMMIT;
