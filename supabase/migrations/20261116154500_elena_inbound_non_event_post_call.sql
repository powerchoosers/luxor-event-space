-- Post-call reconcile: recover non-event caller messages when live capture did not persist.
create or replace function public.luxor_reconcile_elena_inbound_after_call(
  p_call_sid text,
  p_fields jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_call public.luxor_calls%rowtype;
  v_name text;
  v_phone text;
  v_email text;
  v_event_type text;
  v_target_date date;
  v_guest_count integer;
  v_call_note text;
  v_caller_category text;
  v_non_event boolean;
  v_inquiry_id uuid;
  v_matches integer := 0;
  v_created boolean := false;
  v_note text;
  v_existing uuid;
begin
  select * into v_call from public.luxor_calls where twilio_call_sid = p_call_sid for update;
  if not found or v_call.direction <> 'inbound'
    or v_call.metadata->>'scope' is distinct from 'elena_live_inbound'
    or v_call.metadata->>'ingress_mode' is distinct from 'programmable_sip'
    or v_call.metadata->'rehearsal_only' is distinct from 'false'::jsonb
    or v_call.metadata->'accepted' is distinct from 'true'::jsonb
    or v_call.status not in ('ringing', 'in-progress', 'completed')
    or not exists (
      select 1 from public.luxor_phone_numbers n where n.is_public and n.phone_number = v_call.to_number
    ) then
    raise exception 'Post-call reconcile is not authorized' using errcode = '42501';
  end if;
  if v_call.metadata->'post_call_reconcile'->>'saved_at' is not null then
    return jsonb_build_object('saved', true, 'duplicate', true, 'inquiry_id', v_call.inquiry_id);
  end if;
  if v_call.inquiry_id is not null and coalesce(v_call.metadata->'inbound_capture'->>'confirmed', 'false') = 'true' then
    return jsonb_build_object('saved', false, 'skipped', true, 'inquiry_id', v_call.inquiry_id);
  end if;

  v_name := nullif(btrim(p_fields->>'full_name'), '');
  v_phone := public.luxor_workflow_normalize_phone(coalesce(nullif(btrim(p_fields->>'phone'), ''), v_call.caller_number));
  v_email := nullif(lower(btrim(p_fields->>'email')), '');
  v_event_type := nullif(btrim(p_fields->>'event_type'), '');
  v_target_date := nullif(btrim(p_fields->>'target_date'), '')::date;
  v_guest_count := nullif(btrim(p_fields->>'guest_count'), '')::integer;
  v_call_note := nullif(btrim(p_fields->>'call_note'), '');
  v_caller_category := nullif(btrim(p_fields->>'caller_category'), '');
  v_non_event := v_caller_category is not null and v_caller_category <> 'event_inquiry';

  if v_name is null or length(v_name) not between 1 and 120 or v_phone is null
    or (v_email is not null and (length(v_email) > 254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
    or (v_event_type is not null and (length(v_event_type) > 120 or v_event_type ~ '[[:cntrl:]]'))
    or (v_guest_count is not null and v_guest_count not between 1 and 180)
    or (v_call_note is not null and (length(v_call_note) > 1500 or v_call_note ~ '[[:cntrl:]]'))
    or (v_caller_category is not null and length(v_caller_category) > 80) then
    raise exception 'Reconcile fields are incomplete' using errcode = '22023';
  end if;

  if v_non_event then
    if v_call_note is null then
      raise exception 'Reconcile fields are incomplete' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.luxor_test_settings s where s.id = 1 and s.enabled
        and v_phone = public.luxor_workflow_normalize_phone(s.identification_phone)
    ) then
      raise exception 'Test identifiers cannot be captured as customers' using errcode = '22023';
    end if;
    v_note := 'Elena inbound call (post-call reconcile). Non-event caller: ' || v_name || ', ' || v_phone
      || coalesce('. Note: ' || v_call_note, '');
    update public.luxor_calls set
      inquiry_id = null,
      contact_name = coalesce(v_name, contact_name),
      notes = case when notes is null or btrim(notes) = '' then v_note else notes || E'\n' || v_note end,
      metadata = metadata
        || jsonb_build_object(
          'inbound_capture', coalesce(metadata->'inbound_capture', '{}'::jsonb) || jsonb_build_object(
            'confirmed', true,
            'saved_at', clock_timestamp(),
            'full_name', v_name,
            'phone', v_phone,
            'email', v_email,
            'call_note', v_call_note,
            'caller_category', v_caller_category,
            'purpose', coalesce(nullif(btrim(p_fields->>'purpose'), ''), 'callback'),
            'inquiry_id', null,
            'matching_review_needed', false,
            'post_call_reconciled', true
          ),
          'caller_category', v_caller_category,
          'inbound_capture_note', v_note,
          'post_call_reconcile', jsonb_build_object(
            'saved_at', clock_timestamp(),
            'source', coalesce(p_fields->>'source', 'summary'),
            'non_event', true
          )
        ),
      updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
    where id = v_call.id;
    return jsonb_build_object(
      'saved', true,
      'duplicate', false,
      'non_event', true,
      'linked', false,
      'inquiry_id', null,
      'matching_review_needed', false
    );
  end if;

  if v_name is null and v_event_type is null and v_target_date is null and v_guest_count is null and v_email is null then
    raise exception 'Reconcile fields are incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.luxor_test_settings s where s.id = 1 and s.enabled
      and ((v_email is not null and v_email = s.identification_email)
        or v_phone = public.luxor_workflow_normalize_phone(s.identification_phone))
  ) then
    raise exception 'Test identifiers cannot be captured as customers' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elena-contact:' || v_phone, 0));
  if v_call.inquiry_id is not null then
    v_inquiry_id := v_call.inquiry_id;
  else
    select count(*), (array_agg(i.id order by i.created_at, i.id))[1]
      into v_matches, v_inquiry_id
    from public.luxor_inquiries i
    where public.luxor_workflow_normalize_phone(i.phone) = v_phone
      and not coalesce(i.is_test, false)
      and lower(coalesce(i.metadata->>'is_test_record', 'false')) <> 'true'
      and i.archived_at is null;
    if v_matches > 1 then
      v_inquiry_id := null;
    elsif v_matches = 0 then
      insert into public.luxor_inquiries (
        full_name, phone, email, source, flow, status, pipeline_stage,
        marketing_opt_in, internal_notification_requested, is_test, metadata,
        event_type, target_date, guest_count
      ) values (
        v_name, v_phone, v_email, 'inbound_phone', 'phone_inquiry', 'new', 'inquiry',
        false, false, false,
        jsonb_build_object(
          'elena_inbound_call_sid', p_call_sid,
          'contact_details_post_call_reconciled', true
        ),
        v_event_type, v_target_date::text, v_guest_count
      ) returning id into v_inquiry_id;
      v_created := true;
    end if;
  end if;
  if v_inquiry_id is not null and not v_created then
    select id into v_existing from public.luxor_inquiries where id = v_inquiry_id for update;
    update public.luxor_inquiries set
      full_name = coalesce(v_name, full_name),
      phone = coalesce(v_phone, phone),
      email = coalesce(v_email, email),
      event_type = coalesce(v_event_type, event_type),
      target_date = coalesce(v_target_date::text, target_date),
      guest_count = coalesce(v_guest_count, guest_count),
      updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
    where id = v_inquiry_id;
  end if;
  v_note := 'Elena inbound call (post-call reconcile). Caller details recovered: ' || v_name || ', ' || v_phone
    || coalesce(', ' || v_email, '')
    || coalesce('; event ' || v_event_type, '')
    || coalesce('; date ' || v_target_date::text, '')
    || coalesce('; guests ' || v_guest_count::text, '');
  update public.luxor_calls set
    inquiry_id = coalesce(v_inquiry_id, inquiry_id),
    contact_name = coalesce(v_name, contact_name),
    notes = case when notes is null or btrim(notes) = '' then v_note else notes || E'\n' || v_note end,
    metadata = metadata
      || jsonb_build_object(
        'inbound_capture', coalesce(metadata->'inbound_capture', '{}'::jsonb) || jsonb_build_object(
          'confirmed', true,
          'saved_at', clock_timestamp(),
          'full_name', v_name,
          'phone', v_phone,
          'email', v_email,
          'inquiry_id', v_inquiry_id,
          'matching_review_needed', v_matches > 1,
          'post_call_reconciled', true
        ),
        'post_call_reconcile', jsonb_build_object(
          'saved_at', clock_timestamp(),
          'source', coalesce(p_fields->>'source', 'summary'),
          'package_email_promised', coalesce((p_fields->>'package_email_promised')::boolean, false)
        ),
        'lead_update_receipt', coalesce(metadata->'lead_update_receipt', jsonb_build_object(
          'nonce', gen_random_uuid()::text,
          'saved_at', clock_timestamp(),
          'post_call_reconciled', true
        ))
      ),
    updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
  where id = v_call.id;
  return jsonb_build_object(
    'saved', true,
    'duplicate', false,
    'created', v_created,
    'linked', v_inquiry_id is not null,
    'inquiry_id', v_inquiry_id,
    'matching_review_needed', v_matches > 1
  );
end;
$$;
revoke all on function public.luxor_reconcile_elena_inbound_after_call(text, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_reconcile_elena_inbound_after_call(text, jsonb) to service_role;