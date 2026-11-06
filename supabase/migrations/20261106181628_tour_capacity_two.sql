BEGIN;
-- Refuse a rollout with legacy future appointments not represented in slot counts.
LOCK TABLE public.luxor_inquiries, public.luxor_tour_slots IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.luxor_inquiries i
    WHERE i.preferred_tour_date >= (now() AT TIME ZONE 'America/Chicago')::date
      AND i.status <> 'closed_lost' AND i.tour_attendance_status IN ('pending','rescheduled')
      AND coalesce(i.metadata->>'selectedTourSlotId','') = '') THEN
    RAISE EXCEPTION 'Future untracked tours require reconciliation before enabling capacity';
  END IF;
  IF EXISTS (SELECT 1 FROM public.luxor_inquiries i
    LEFT JOIN public.luxor_tour_slots sl ON sl.id::text=i.metadata->>'selectedTourSlotId'
    WHERE i.preferred_tour_date >= (now() AT TIME ZONE 'America/Chicago')::date
      AND i.status <> 'closed_lost' AND i.tour_attendance_status IN ('pending','rescheduled')
      AND (sl.id IS NULL OR i.metadata->>'tourBookingType' IS DISTINCT FROM 'confirmed_slot'
        OR sl.slot_date IS DISTINCT FROM i.preferred_tour_date
        OR sl.start_time IS DISTINCT FROM i.preferred_tour_time::time)) THEN
    RAISE EXCEPTION 'Future tour reservation links require reconciliation before enabling capacity';
  END IF;
  IF EXISTS (SELECT 1 FROM public.luxor_inquiries i
    WHERE i.preferred_tour_date >= (now() AT TIME ZONE 'America/Chicago')::date
      AND i.status <> 'closed_lost' AND i.tour_attendance_status IN ('pending','rescheduled')
      AND NOT EXISTS (SELECT 1 FROM public.luxor_calendar_events e WHERE e.inquiry_id=i.id AND e.status='confirmed')) THEN
    RAISE EXCEPTION 'Future tours without confirmed calendar events require reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.luxor_tour_slots sl
    WHERE sl.slot_date >= (now() AT TIME ZONE 'America/Chicago')::date
      AND sl.booked_count <> (SELECT count(*) FROM public.luxor_inquiries i
        WHERE i.metadata->>'selectedTourSlotId'=sl.id::text AND i.status <> 'closed_lost'
          AND i.tour_attendance_status IN ('pending','rescheduled'))) THEN
    RAISE EXCEPTION 'Future tour capacity counts require reconciliation before enabling capacity';
  END IF;
END $$;
-- Preserve legacy past rows. The old app may still insert capacity=1 while
-- the new deployment is starting, so normalize future rows on insert/update.
ALTER TABLE public.luxor_tour_slots DROP CONSTRAINT IF EXISTS luxor_tour_slots_capacity_one_check;
ALTER TABLE public.luxor_tour_slots ALTER COLUMN capacity SET DEFAULT 2;
CREATE OR REPLACE FUNCTION public.luxor_tour_slot_capacity_two() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.slot_date >= (now() AT TIME ZONE 'America/Chicago')::date THEN NEW.capacity := 2; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.luxor_tour_slot_capacity_two() FROM public,anon,authenticated;
CREATE TRIGGER luxor_tour_slot_capacity_two BEFORE INSERT OR UPDATE ON public.luxor_tour_slots
 FOR EACH ROW EXECUTE FUNCTION public.luxor_tour_slot_capacity_two();
UPDATE public.luxor_tour_slots SET capacity=2,
 status=CASE WHEN status='booked' AND booked_count<2 THEN 'available' ELSE status END
 WHERE slot_date >= (now() AT TIME ZONE 'America/Chicago')::date;
CREATE OR REPLACE FUNCTION public.reserve_luxor_tour_slot(p_slot_id uuid)
RETURNS SETOF public.luxor_tour_slots LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.luxor_tour_slots SET booked_count=booked_count+1,
 status=CASE WHEN booked_count+1>=capacity THEN 'booked' ELSE 'available' END,updated_at=now()
 WHERE id=p_slot_id AND status='available' AND booked_count<capacity
 AND ((slot_date+start_time) AT TIME ZONE 'America/Chicago')>=now()+interval '24 hours' RETURNING *;
$$;
CREATE OR REPLACE FUNCTION public.luxor_publish_tour_slots(p_slot_ids uuid[])
RETURNS SETOF public.luxor_tour_slots LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.luxor_tour_slots SET status=CASE WHEN booked_count>=capacity THEN 'booked' ELSE 'available' END,updated_at=now()
 WHERE id=ANY(p_slot_ids) AND status='unavailable' RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.luxor_publish_tour_slots(uuid[]) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_publish_tour_slots(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.luxor_unpublish_tour_slots(p_slot_ids uuid[])
RETURNS SETOF public.luxor_tour_slots LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.luxor_tour_slots SET status='unavailable',updated_at=now()
 WHERE id=ANY(p_slot_ids) AND status IN ('available','booked') RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.luxor_unpublish_tour_slots(uuid[]) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_unpublish_tour_slots(uuid[]) TO service_role;

-- Legacy Zoho cancellation has provider work outside this transaction. An
-- immutable receipt makes the inventory decrement safe to repeat.
CREATE TABLE public.luxor_legacy_tour_slot_releases (
 inquiry_id uuid NOT NULL REFERENCES public.luxor_inquiries(id) ON DELETE CASCADE,
 slot_id uuid NOT NULL, released_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(inquiry_id,slot_id)
);
ALTER TABLE public.luxor_legacy_tour_slot_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.luxor_legacy_tour_slot_releases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.luxor_legacy_tour_slot_releases TO service_role;
CREATE OR REPLACE FUNCTION public.luxor_release_legacy_tour_slot(p_inquiry_id uuid,p_slot_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.luxor_inquiries%rowtype; sl public.luxor_tour_slots%rowtype;
BEGIN
 SELECT * INTO i FROM public.luxor_inquiries WHERE id=p_inquiry_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.luxor_legacy_tour_slot_releases WHERE inquiry_id=p_inquiry_id AND slot_id=p_slot_id) THEN RETURN true; END IF;
 IF i.metadata->>'selectedTourSlotId' IS DISTINCT FROM p_slot_id::text
    OR i.tour_attendance_status IN ('attended','no_show','cancelled')
    OR i.preferred_tour_date < (now() AT TIME ZONE 'America/Chicago')::date THEN RETURN false; END IF;
 SELECT * INTO sl FROM public.luxor_tour_slots WHERE id=p_slot_id FOR UPDATE;
 IF NOT FOUND OR sl.slot_date IS DISTINCT FROM i.preferred_tour_date OR sl.start_time IS DISTINCT FROM i.preferred_tour_time::time OR sl.booked_count<1 THEN RETURN false; END IF;
 UPDATE public.luxor_tour_slots SET booked_count=booked_count-1,
   status=CASE WHEN status='booked' THEN 'available' ELSE status END,updated_at=now() WHERE id=p_slot_id;
 INSERT INTO public.luxor_legacy_tour_slot_releases(inquiry_id,slot_id) VALUES(p_inquiry_id,p_slot_id);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.luxor_release_legacy_tour_slot(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_release_legacy_tour_slot(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.luxor_create_tour_inquiry(p_slot_id uuid,p_payload jsonb)
RETURNS SETOF public.luxor_inquiries LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_slot public.luxor_tour_slots%rowtype; v_row public.luxor_inquiries%rowtype;
BEGIN
  SELECT * INTO v_slot FROM public.reserve_luxor_tour_slot(p_slot_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'That tour time is full or no longer available.' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_row FROM jsonb_populate_record(NULL::public.luxor_inquiries,p_payload);
  RETURN QUERY INSERT INTO public.luxor_inquiries (
    full_name,email,phone,event_type,target_date,guest_count,budget,preferred_tour_date,preferred_tour_time,
    package_interest,message,source,flow,campaign_key,rsvp_status,marketing_opt_in,attendee_count,
    page_path,referrer,user_agent,metadata,internal_notification_requested,status,pipeline_stage,tour_attendance_status
  ) VALUES (
    v_row.full_name,v_row.email,v_row.phone,v_row.event_type,v_row.target_date,v_row.guest_count,v_row.budget,
    v_slot.slot_date,to_char(v_slot.start_time,'FMHH12:MI AM'),v_row.package_interest,v_row.message,v_row.source,v_row.flow,
    v_row.campaign_key,v_row.rsvp_status,v_row.marketing_opt_in,v_row.attendee_count,v_row.page_path,v_row.referrer,v_row.user_agent,
    coalesce(v_row.metadata,'{}'::jsonb)||jsonb_build_object('selectedTourSlotId',p_slot_id,'autoScheduleTour',true,'tourBookingType','confirmed_slot'),
    true,'tour_confirmed','tour','pending'
  ) RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.luxor_create_tour_inquiry(uuid,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_create_tour_inquiry(uuid,jsonb) TO service_role;

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
  v_old_slot uuid;
  v_new_slot uuid;
  v_local_start timestamp;
  v_slot public.luxor_tour_slots%rowtype;
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
         OR v_inquiry.tour_attendance_status NOT IN ('pending','rescheduled')
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

  -- Public requests have already reserved their row. Other appointments
  -- acquire the destination and release the origin in this transaction.
  v_local_start := (p_state->>'startUtc')::timestamptz AT TIME ZONE 'America/Chicago';
  IF v_local_start IS NULL THEN RAISE EXCEPTION 'Invalid tour time'; END IF;
  IF (p_visit_intent='reschedule' OR p_requested_by='Public tour request')
     AND coalesce(v_inquiry.metadata->>'selectedTourSlotId','')<>'' THEN
    v_old_slot := (v_inquiry.metadata->>'selectedTourSlotId')::uuid;
  END IF;
  INSERT INTO public.luxor_tour_slots(slot_date,start_time,end_time,status,capacity,booked_count,title)
    VALUES(v_local_start::date,v_local_start::time,v_local_start::time + interval '30 minutes','unavailable',2,0,'Private venue tour')
    ON CONFLICT (slot_date,start_time) DO NOTHING;
  SELECT id INTO v_new_slot FROM public.luxor_tour_slots
    WHERE slot_date=v_local_start::date AND start_time=v_local_start::time;
  -- Deterministic ordering prevents opposite-direction reschedules deadlocking.
  PERFORM id FROM public.luxor_tour_slots WHERE id IN (v_old_slot,v_new_slot) ORDER BY id FOR UPDATE;
  IF v_old_slot IS NOT NULL THEN
    SELECT * INTO v_slot FROM public.luxor_tour_slots WHERE id=v_old_slot;
    IF NOT FOUND OR v_slot.booked_count<1 OR v_inquiry.metadata->>'tourBookingType' IS DISTINCT FROM 'confirmed_slot'
      OR v_slot.slot_date IS DISTINCT FROM v_inquiry.preferred_tour_date
      OR v_slot.start_time IS DISTINCT FROM v_inquiry.preferred_tour_time::time THEN
      RAISE EXCEPTION 'The existing tour reservation needs staff review.';
    END IF;
  END IF;
  IF v_new_slot IS DISTINCT FROM v_old_slot THEN
    SELECT * INTO v_slot FROM public.luxor_tour_slots WHERE id=v_new_slot;
    IF v_slot.booked_count>=v_slot.capacity OR v_slot.status IN ('booked','held') THEN
      RAISE EXCEPTION 'That tour time is full. Please choose another time.' USING ERRCODE='40001';
    END IF;
    UPDATE public.luxor_tour_slots SET booked_count=booked_count+1,
      status=CASE WHEN status='available' AND booked_count+1>=capacity THEN 'booked' ELSE status END,
      updated_at=now() WHERE id=v_new_slot;
    IF v_old_slot IS NOT NULL THEN
      UPDATE public.luxor_tour_slots SET booked_count=booked_count-1,
        status=CASE WHEN status='booked' THEN 'available' ELSE status END,
        updated_at=now() WHERE id=v_old_slot;
    END IF;
  END IF;
  UPDATE public.luxor_inquiries SET metadata=coalesce(metadata,'{}'::jsonb) ||
    jsonb_build_object('selectedTourSlotId',v_new_slot,'tourBookingType','confirmed_slot') WHERE id=p_inquiry_id;

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

-- Public inquiry, capacity reservation, calendar revision and queued notices
-- commit together. No provider requests occur in this transaction.
CREATE TABLE public.luxor_public_tour_requests (
  request_id uuid PRIMARY KEY,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  inquiry_id uuid NOT NULL REFERENCES public.luxor_inquiries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.luxor_public_tour_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.luxor_public_tour_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.luxor_public_tour_requests TO service_role;
CREATE OR REPLACE FUNCTION public.luxor_find_public_tour_request(p_request_id uuid,p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.luxor_public_tour_requests%rowtype; i public.luxor_inquiries%rowtype;
BEGIN
 SELECT * INTO r FROM public.luxor_public_tour_requests WHERE request_id=p_request_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'This request was already used for different details.'; END IF;
 SELECT * INTO i FROM public.luxor_inquiries WHERE id=r.inquiry_id;
 IF i.tour_attendance_status='cancelled' THEN RAISE EXCEPTION 'This tour has been cancelled. Please start a new booking.'; END IF;
 RETURN to_jsonb(i);
END; $$;
REVOKE ALL ON FUNCTION public.luxor_find_public_tour_request(uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_find_public_tour_request(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.luxor_create_scheduled_tour_inquiry(
  p_slot_id uuid,p_payload jsonb,p_state jsonb,p_tour jsonb,p_templates jsonb,
  p_visit_id uuid,p_request_id uuid,p_idempotency_key uuid,p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_lead public.luxor_inquiries%rowtype; v_result jsonb; v_previous jsonb;
BEGIN
 IF p_idempotency_key IS NULL OR coalesce(p_fingerprint,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid booking request key'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
 v_previous := public.luxor_find_public_tour_request(p_idempotency_key,p_fingerprint);
 IF v_previous IS NOT NULL THEN RETURN jsonb_build_object('inquiry',v_previous,'replayed',true); END IF;
 SELECT * INTO v_lead FROM public.luxor_create_tour_inquiry(p_slot_id,p_payload);
 IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Tour inquiry could not be created'; END IF;
 IF ((p_state->>'startUtc')::timestamptz AT TIME ZONE 'America/Chicago')::date IS DISTINCT FROM v_lead.preferred_tour_date
    OR ((p_state->>'startUtc')::timestamptz AT TIME ZONE 'America/Chicago')::time IS DISTINCT FROM v_lead.preferred_tour_time::time THEN
   RAISE EXCEPTION 'The selected tour time changed. Please choose again.';
 END IF;
 v_result := public.luxor_save_tour_visit_schedule(v_lead.id,-1,p_state,p_tour,p_templates,
   'Public tour request','new_visit',p_visit_id,p_request_id,NULL,0);
 INSERT INTO public.luxor_public_tour_requests(request_id,fingerprint,inquiry_id) VALUES(p_idempotency_key,p_fingerprint,v_lead.id);
 RETURN v_result || jsonb_build_object('replayed',false);
END; $$;
REVOKE ALL ON FUNCTION public.luxor_create_scheduled_tour_inquiry(uuid,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.luxor_create_scheduled_tour_inquiry(uuid,jsonb,jsonb,jsonb,jsonb,uuid,uuid,uuid,text) TO service_role;

create or replace function public.luxor_cancel_tour(p_inquiry_id uuid, p_token text, p_requested_by text, p_expected_sequence integer, p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  lead public.luxor_inquiries%rowtype;
  event public.luxor_calendar_events%rowtype;
  slot public.luxor_tour_slots%rowtype;
  event_json jsonb;
  start_at timestamptz;
  slot_id uuid;
  released boolean := false;
  stamp timestamptz := now();
  recipients text[];
  recipient text;
  seq text;
  last_cancel jsonb;
  client_email text;
begin
  if p_inquiry_id is null or coalesce(length(btrim(p_requested_by)),0) not between 1 and 254
    or length(coalesce(p_reason,''))>500 then raise exception 'Invalid cancellation request'; end if;
  select * into lead from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found or (p_token is not null and (p_token='' or lead.tour_response_token is distinct from p_token)) then
    return jsonb_build_object('status','not_found');
  end if;
  if lead.is_test then return jsonb_build_object('status','unavailable'); end if;
  select * into event from public.luxor_calendar_events where inquiry_id=lead.id for update;
  last_cancel := coalesce(lead.metadata->'tourCancellation','{}'::jsonb);
  if lead.tour_attendance_status='cancelled' then
    if event.id is not null and event.status='cancelled' and last_cancel->>'calendarSequence'=event.sequence::text
      and (p_token is null or p_expected_sequence=event.sequence-1) then
      return jsonb_build_object('status','already_cancelled','inquiry',to_jsonb(lead),'slotReleased',coalesce((last_cancel->>'slotReleased')::boolean,false),'calendarSequence',event.sequence);
    end if;
    return jsonb_build_object('status','unavailable');
  end if;
  if p_token is not null and (p_expected_sequence is null or event.id is null or event.sequence<>p_expected_sequence) then
    return jsonb_build_object('status','stale');
  end if;
  if lead.status='closed_lost' or coalesce(lead.tour_attendance_status,'') in ('attended','no_show') then
    return jsonb_build_object('status','unavailable');
  end if;
  -- Legacy Zoho cancellation is external and has no recorded retry queue.
  -- Refuse the transaction rather than claim a calendar cancellation occurred.
  if event.id is null or event.status<>'confirmed' then return jsonb_build_object('status','calendar_attention'); end if;
  begin start_at := (event.state->>'startUtc')::timestamptz; exception when others then return jsonb_build_object('status','calendar_attention'); end;
  if start_at is null or start_at<=stamp then return jsonb_build_object('status','unavailable'); end if;
  client_email := lower(btrim(lead.email));
  if client_email is null or length(client_email)>254 or client_email !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' then
    if p_token is not null then return jsonb_build_object('status','contact_attention'); end if;
    client_email := null;
  end if;
  if lead.preferred_tour_date is distinct from (start_at at time zone 'America/Chicago')::date
     or coalesce(lead.metadata->>'tourStartAt','')='' then return jsonb_build_object('status','slot_attention'); end if;
  begin
    if (lead.metadata->>'tourStartAt')::timestamptz is distinct from start_at
      or lead.preferred_tour_time::time is distinct from (start_at at time zone 'America/Chicago')::time then
      return jsonb_build_object('status','slot_attention'); end if;
  exception when others then return jsonb_build_object('status','slot_attention'); end;
  if coalesce(lead.metadata->>'selectedTourSlotId','')<>'' then
    begin slot_id := (lead.metadata->>'selectedTourSlotId')::uuid; exception when others then return jsonb_build_object('status','slot_attention'); end;
    select * into slot from public.luxor_tour_slots where id=slot_id for update;
    if not found or lead.metadata->>'tourBookingType' is distinct from 'confirmed_slot'
      or slot.slot_date is distinct from lead.preferred_tour_date
      or slot.start_time is distinct from (start_at at time zone 'America/Chicago')::time
      or slot.booked_count < 1
      or slot.status not in ('available','booked','unavailable','held') then return jsonb_build_object('status','slot_attention'); end if;
    update public.luxor_tour_slots set booked_count=booked_count-1,
      status=case when status='booked' then 'available' else status end,updated_at=stamp where id=slot.id;
    released := true;
  end if;
  update public.luxor_email_jobs set status='cancelled',updated_at=stamp,last_error='Tour cancelled.'
    where inquiry_id=lead.id and status='queued' and job_type in ('tour_confirmation','tour_reminder','tour_no_show_reschedule');
  update public.luxor_text_jobs set status='cancelled',updated_at=stamp
    where inquiry_id=lead.id and status='queued' and job_type in ('tour_confirmation','tour_reminder');
  event_json := public.luxor_save_calendar_revision(lead.id,event.sequence,event.state || jsonb_build_object('status','cancelled'),p_requested_by);
  seq := event_json->>'sequence';
  update public.luxor_inquiries set tour_attendance_status='cancelled',updated_at=stamp,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('tourCancellation',jsonb_build_object(
      'status','cancelled','cancelledAt',stamp,'cancelledBy',p_requested_by,'reason',nullif(btrim(p_reason),''),
      'slotReleased',released,'calendarStatus','cancellation_queued','calendarSequence',seq))
    where id=lead.id returning * into lead;
  insert into public.luxor_notes(inquiry_id,content,note_type,author)
    values(lead.id,'Tour cancelled: ' || to_char(start_at at time zone 'America/Chicago','YYYY-MM-DD HH24:MI') ||
      ' Central Time; calendar sequence ' || seq ||
      case when nullif(btrim(p_reason),'') is not null then '; reason: ' || regexp_replace(btrim(p_reason),'[[:space:]]+',' ','g') else '' end ||
      '. Queued reminders were stopped and the calendar cancellation was queued.', 'status_change',p_requested_by);
  select array_agg(address order by address) into recipients from (
    select distinct lower(btrim(value)) as address from public.luxor_user_preferences p
    cross join lateral regexp_split_to_table(coalesce(p.notification_emails,''),',') value
    where length(btrim(value))<=254 and btrim(value) ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
  ) valid;
  foreach recipient in array coalesce(recipients,array['booking@luxoratlaspalmas.com']) loop
    -- Existing calendar attendees (including the client) receive the CANCEL
    -- invitation from luxor_save_calendar_revision; never send a duplicate.
    if recipient = lower(btrim(lead.email)) or exists (
      select 1 from jsonb_array_elements_text(event.state->'attendeeEmails') a(email)
      where lower(a.email)=recipient
    ) then continue; end if;
    insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,scheduled_for,metadata)
      values(null,'inquiry_notification',recipient,'Luxor tour cancelled',
        'Tour for lead ' || lead.id::text || ' scheduled for ' ||
          to_char(start_at at time zone 'America/Chicago','FMMonth FMDD, YYYY at FMHH12:MI AM') || ' has been cancelled.',stamp,
        jsonb_build_object('notificationKind','tour_cancellation','tourInquiryId',lead.id,
          'calendarEventId',event.id,'calendarSequence',seq,
          'notificationRendered',true,'notificationProvider','resend',
          'sender_from','booking@luxoratlaspalmas.com','sender_name','Luxor Lead Alerts'))
      on conflict ((metadata->>'tourInquiryId'),(metadata->>'calendarSequence'),(metadata->>'notificationKind'),lower(recipient_email))
        where job_type='inquiry_notification' and metadata->>'notificationKind' in ('tour_cancellation','tour_cancellation_client') do nothing;
  end loop;
  -- If the current inquiry address is not an attendee, the calendar CANCEL
  -- cannot reach it. Queue exactly one client-only notice to that address.
  if client_email is not null and not exists (
    select 1 from jsonb_array_elements_text(event.state->'attendeeEmails') a(email)
    where lower(btrim(a.email))=client_email
  ) then
    insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,scheduled_for,metadata)
      values(null,'inquiry_notification',client_email,'Your Luxor tour has been cancelled',
        'Your Luxor tour scheduled for ' ||
          to_char(start_at at time zone 'America/Chicago','FMMonth FMDD, YYYY at FMHH12:MI AM') ||
          ' has been cancelled. Please contact Luxor if you would like to arrange another visit.',stamp,
        jsonb_build_object('notificationKind','tour_cancellation_client','tourInquiryId',lead.id,
          'calendarEventId',event.id,'calendarSequence',seq,
          'notificationRendered',true,'notificationProvider','resend',
          'sender_from','booking@luxoratlaspalmas.com','sender_name','Luxor Event Space'))
      on conflict ((metadata->>'tourInquiryId'),(metadata->>'calendarSequence'),(metadata->>'notificationKind'),lower(recipient_email))
        where job_type='inquiry_notification' and metadata->>'notificationKind' in ('tour_cancellation','tour_cancellation_client') do nothing;
  end if;
  return jsonb_build_object('status','cancelled','inquiry',to_jsonb(lead),'slotReleased',released,'calendarSequence',seq);
end;
$$;
revoke all on function public.luxor_cancel_tour(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.luxor_cancel_tour(uuid,text,text,integer,text) to service_role;

COMMIT;
