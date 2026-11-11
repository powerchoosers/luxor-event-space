-- Only an authenticated live phone session may capture a caller. Test sessions
-- have a different scope and cannot enter this function. No customer messages,
-- marketing permission, tour reservations or notification jobs are created.
create or replace function public.luxor_capture_elena_inbound_contact(
  p_call_sid text, p_session_id text, p_nonce uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_call public.luxor_calls%rowtype;
  v_pending jsonb;
  v_capture jsonb;
  v_name text;
  v_phone text;
  v_email text;
  v_best_time text;
  v_purpose text;
  v_inquiry_id uuid;
  v_matches integer;
  v_created boolean := false;
  v_note text;
begin
  select * into v_call from public.luxor_calls
    where twilio_call_sid = p_call_sid for update;
  if not found or v_call.direction <> 'inbound'
    or v_call.status not in ('ringing', 'in-progress')
    or v_call.metadata->>'scope' is distinct from 'elena_live_inbound'
    or v_call.metadata->>'ingress_mode' is distinct from 'programmable_sip'
    or v_call.metadata->>'openai_session_id' is distinct from p_session_id
    or v_call.metadata->'accepted' is distinct from 'true'::jsonb
    or v_call.metadata->'rehearsal_only' is distinct from 'false'::jsonb then
    raise exception 'Live call capture is not authorized' using errcode = '42501';
  end if;
  if v_call.metadata->'inbound_capture'->>'nonce' = p_nonce::text then
    return jsonb_build_object('saved', true, 'duplicate', true,
      'linked', v_call.inquiry_id is not null);
  end if;
  v_pending := v_call.metadata->'capture_pending';
  if v_pending->>'nonce' is distinct from p_nonce::text
    or coalesce((v_pending->>'expires_at')::timestamptz, '-infinity'::timestamptz) <= now() then
    raise exception 'Contact readback has expired' using errcode = '22023';
  end if;
  v_name := btrim(v_pending->>'full_name');
  v_phone := public.luxor_workflow_normalize_phone(v_pending->>'phone');
  v_email := nullif(lower(btrim(v_pending->>'email')), '');
  v_best_time := nullif(btrim(v_pending->>'best_callback_time'), '');
  v_purpose := v_pending->>'purpose';
  if v_name is null or length(v_name) not between 1 and 120 or v_phone is null
    or v_purpose not in ('transfer', 'callback', 'tour') or v_purpose is null
    or (v_email is not null and (length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
    or (v_best_time is not null and length(v_best_time) > 240)
    or (v_purpose = 'tour' and v_email is null)
    or (v_purpose = 'callback' and (v_best_time is null
      or (v_email is null and v_pending->'email_declined' is distinct from 'true'::jsonb))) then
    raise exception 'Confirmed contact details are incomplete' using errcode = '22023';
  end if;
  -- Serialize canonical-phone matching across different calls, not only retries
  -- of the same call. Keep existing lead identity, status and consent unchanged.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elena-contact:' || v_phone, 0));
  if exists (select 1 from public.luxor_test_settings s where s.id = 1 and s.enabled
    and ((v_email is not null and v_email = s.identification_email)
      or v_phone = public.luxor_workflow_normalize_phone(s.identification_phone))) then
    raise exception 'Test identifiers cannot be captured as customers' using errcode = '22023';
  end if;
  select count(*), (array_agg(i.id order by i.created_at, i.id))[1]
    into v_matches, v_inquiry_id from public.luxor_inquiries i
    where public.luxor_workflow_normalize_phone(i.phone) = v_phone
      and not coalesce(i.is_test, false)
      and lower(coalesce(i.metadata->>'is_test_record', 'false')) <> 'true'
      and i.archived_at is null;
  if v_matches > 1 then
    -- Preserve the confirmed callback on the call for owner review. Choosing an
    -- arbitrary customer or creating another duplicate would lose provenance.
    v_inquiry_id := null;
  elsif v_matches = 0 then
    insert into public.luxor_inquiries(full_name, phone, email, source, flow,
      status, pipeline_stage, marketing_opt_in, internal_notification_requested,
      is_test, metadata)
    values(v_name, v_phone, v_email, 'inbound_phone', 'phone_inquiry', 'new',
      'inquiry', false, false, false,
      jsonb_build_object('elena_inbound_call_sid', p_call_sid,
        'contact_details_caller_confirmed', true))
    returning id into v_inquiry_id;
    v_created := true;
  end if;
  v_capture := (v_pending - 'expires_at') || jsonb_build_object(
    'confirmed', true, 'saved_at', clock_timestamp(),
    'full_name', v_name, 'phone', v_phone, 'email', v_email,
    'inquiry_id', v_inquiry_id, 'matching_review_needed', v_matches > 1);
  v_note := 'Elena inbound call. Caller confirmed: ' || v_name || ', ' || v_phone
    || case when v_email is not null then ', ' || v_email else '' end
    || case when v_best_time is not null then '. Best callback time: ' || v_best_time else '' end
    || case when v_matches > 1 then '. Multiple existing leads share this number; contact matching needs review.' else '' end;
  update public.luxor_calls set inquiry_id = v_inquiry_id, contact_name = v_name,
    notes = case when notes is null or btrim(notes) = '' or notes = metadata->>'inbound_capture_note'
      then v_note else notes || E'\n' || v_note end,
    metadata = (metadata - 'capture_pending')
      || jsonb_build_object('inbound_capture', v_capture, 'inbound_capture_note', v_note),
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
    where id = v_call.id;
  return jsonb_build_object('saved', true, 'created', v_created,
    'linked', v_inquiry_id is not null, 'matching_review_needed', v_matches > 1);
end;
$$;
revoke all on function public.luxor_capture_elena_inbound_contact(text,text,uuid) from public, anon, authenticated;
grant execute on function public.luxor_capture_elena_inbound_contact(text,text,uuid) to service_role;
