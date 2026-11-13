-- Caller language is saved only through the existing confirmed, uniquely linked live-call update.
-- Only a caller-confirmed, active live call can update its uniquely linked lead.
-- Preserve owner edits: lock and compare the lead version frozen at readback.
create or replace function public.luxor_confirm_elena_lead_update(p_call_sid text, p_session_id text, p_nonce uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.luxor_calls%rowtype;
  i public.luxor_inquiries%rowtype;
  pending jsonb;
  capture jsonb;
  v_name text;
  v_phone text;
  v_email text;
  v_note text;
  v_event_type text;
  v_target_date date;
  v_guest_count integer;
  v_budget text;
  v_package_interest text;
  v_spoken_language text;
begin
  select * into c from public.luxor_calls where twilio_call_sid=p_call_sid for update;
  if not found or c.direction <> 'inbound' or c.status not in ('ringing','in-progress')
    or c.metadata->>'scope' is distinct from 'elena_live_inbound'
    or c.metadata->>'ingress_mode' is distinct from 'programmable_sip'
    or c.metadata->'rehearsal_only' is distinct from 'false'::jsonb
    or c.metadata->'accepted' is distinct from 'true'::jsonb
    or c.metadata->>'openai_session_id' is distinct from p_session_id
    or not exists (select 1 from public.luxor_phone_numbers n where n.is_public and n.phone_number=c.to_number) then
    raise exception 'Live call update is not authorized' using errcode='42501';
  end if;
  if c.metadata->'lead_update_receipt'->>'nonce'=p_nonce::text then
    return jsonb_build_object('saved',true,'duplicate',true);
  end if;
  pending := c.metadata->'lead_update_pending';
  capture := c.metadata->'inbound_capture';
  if p_nonce is null or pending->>'nonce' is distinct from p_nonce::text
    or coalesce((pending->>'expires_at')::timestamptz,'-infinity'::timestamptz)<=now()
    or (pending->>'expires_at')::timestamptz>now()+interval '4 minutes'
    or capture->'confirmed' is distinct from 'true'::jsonb
    or capture->'matching_review_needed' is distinct from 'false'::jsonb
    or c.inquiry_id is null or pending->>'inquiry_id' is distinct from c.inquiry_id::text
    or capture->>'inquiry_id' is distinct from c.inquiry_id::text
    or pending->>'contact_nonce' is distinct from capture->>'nonce' then
    raise exception 'Current confirmed contact and update readback required' using errcode='22023';
  end if;
  select * into i from public.luxor_inquiries where id=c.inquiry_id for update;
  if not found or coalesce(i.is_test,false) or i.archived_at is not null
    or lower(coalesce(i.metadata->>'is_test_record','false'))='true'
    or i.updated_at is distinct from (pending->>'inquiry_updated_at')::timestamptz
    or lower(regexp_replace(btrim(i.full_name),'\s+',' ','g')) is distinct from lower(regexp_replace(btrim(capture->>'full_name'),'\s+',' ','g'))
    or public.luxor_workflow_normalize_phone(i.phone) is null
    or public.luxor_workflow_normalize_phone(i.phone) is distinct from public.luxor_workflow_normalize_phone(capture->>'phone')
    or (nullif(btrim(i.email),'') is not null and nullif(btrim(capture->>'email'),'') is not null
      and lower(btrim(i.email)) is distinct from lower(btrim(capture->>'email')))
    or (nullif(btrim(pending->>'email'),'') is not null and nullif(btrim(i.email),'') is not null
      and nullif(btrim(capture->>'email'),'') is null and lower(btrim(i.email)) is distinct from lower(btrim(pending->>'email'))) then
    raise exception 'Lead identity or details changed; review required' using errcode='40001';
  end if;
  v_spoken_language := nullif(regexp_replace(btrim(pending->>'spoken_language'),'[[:space:]]+',' ','g'),'');
  v_name := nullif(btrim(pending->>'full_name'),'');
  v_phone := case when nullif(btrim(pending->>'phone'),'') is not null then public.luxor_workflow_normalize_phone(pending->>'phone') else null end;
  v_email := nullif(lower(btrim(pending->>'email')),'');
  v_note := nullif(btrim(pending->>'notes'),'');
  v_event_type := nullif(btrim(pending->>'event_type'),'');
  v_target_date := nullif(btrim(pending->>'target_date'),'')::date;
  v_guest_count := nullif(btrim(pending->>'guest_count'),'')::integer;
  v_budget := nullif(btrim(pending->>'budget'),'');
  v_package_interest := nullif(btrim(pending->>'package_interest'),'');
  if (v_name is null and v_phone is null and v_email is null and v_note is null and v_event_type is null and v_target_date is null and v_guest_count is null and v_budget is null and v_package_interest is null and v_spoken_language is null)
    or (v_spoken_language is not null and (jsonb_typeof(pending->'spoken_language') is distinct from 'string' or pending->>'spoken_language' ~ '[[:cntrl:]]' or length(v_spoken_language)>60 or v_spoken_language ~ '[[:cntrl:]]' or v_spoken_language !~ '^[[:alpha:]][[:alpha:] ()''-]*$'))
    or (v_name is not null and (length(v_name)>120 or v_name ~ '[[:cntrl:]]'))
    or (pending->>'phone' is not null and v_phone is null)
    or (v_email is not null and (length(v_email)>254 or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
    or (v_note is not null and (length(v_note)>1500 or v_note ~ '[[:cntrl:]]'))
    or (v_event_type is not null and (length(v_event_type)>120 or v_event_type ~ '[[:cntrl:]]'))
    or (v_guest_count is not null and v_guest_count not between 1 and 180)
    or (v_budget is not null and (length(v_budget)>120 or v_budget ~ '[[:cntrl:]]'))
    or (v_package_interest is not null and v_package_interest not in ('Essentials','Signature','Luxor')) then
    raise exception 'Invalid lead update' using errcode='22023';
  end if;
  if v_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elena-contact:' || v_phone, 0));
    if exists (select 1 from public.luxor_inquiries other where other.id<>i.id and other.archived_at is null and not coalesce(other.is_test,false)
      and public.luxor_workflow_normalize_phone(other.phone)=v_phone) then
      raise exception 'Phone number matches another lead; review required' using errcode='40001';
    end if;
  end if;
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elena-email:' || v_email, 0));
    if exists (select 1 from public.luxor_inquiries other where other.id<>i.id and other.archived_at is null and not coalesce(other.is_test,false)
      and lower(btrim(other.email))=v_email) then
      raise exception 'Email matches another lead; review required' using errcode='40001';
    end if;
  end if;
  if exists (select 1 from public.luxor_test_settings s where s.id=1 and s.enabled and
    ((v_phone is not null and v_phone=public.luxor_workflow_normalize_phone(s.identification_phone))
      or (v_email is not null and v_email=lower(btrim(s.identification_email))))) then
    raise exception 'Test identifiers cannot update customer leads' using errcode='22023';
  end if;
  update public.luxor_inquiries set full_name=coalesce(v_name,full_name), phone=coalesce(v_phone,phone), email=coalesce(v_email,email),
    event_type=coalesce(v_event_type,event_type),target_date=coalesce(v_target_date::text,target_date),guest_count=coalesce(v_guest_count,guest_count),
    budget=coalesce(v_budget,budget),package_interest=coalesce(v_package_interest,package_interest),
    metadata=case when v_spoken_language is null then metadata else coalesce(metadata,'{}'::jsonb) || jsonb_build_object('spokenLanguage',jsonb_build_object('language',v_spoken_language,'source','caller_confirmed','confirmedAt',clock_timestamp(),'callSid',p_call_sid)) end,
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=i.id;
  capture := capture || jsonb_build_object('full_name',coalesce(v_name,capture->>'full_name'),
    'phone',coalesce(v_phone,capture->>'phone'),'email',coalesce(v_email,capture->>'email'));
  update public.luxor_calls set contact_name=coalesce(v_name,contact_name),
    notes=case when v_note is null then notes when notes is null or btrim(notes)='' then 'Elena call: '||v_note else notes||E'\nElena call: '||v_note end,
    metadata=(metadata-'lead_update_pending') || jsonb_build_object('inbound_capture',capture,
      'lead_update_receipt',jsonb_build_object('nonce',p_nonce,'saved_at',clock_timestamp())),
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=c.id;
  return jsonb_build_object('saved',true,'duplicate',false);
end;
$$;
revoke all on function public.luxor_confirm_elena_lead_update(text,text,uuid) from public,anon,authenticated;
grant execute on function public.luxor_confirm_elena_lead_update(text,text,uuid) to service_role;
