-- Confirm only a caller-reviewed live-session booking. Existing scheduling,
-- inventory and portal calendar lifecycle remain the authority. Its newly
-- queued notices are cancelled before commit, so no worker can dispatch them.
create or replace function public.luxor_confirm_elena_inbound_tour(
  p_call_sid text, p_session_id text, p_nonce uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.luxor_calls%rowtype;
  i public.luxor_inquiries%rowtype;
  s public.luxor_tour_slots%rowtype;
  capture jsonb;
  pending jsonb;
  saved jsonb;
  result jsonb;
  state jsonb;
  tour jsonb;
  templates jsonb;
  revision_id uuid;
  start_at timestamptz;
begin
  select * into c from public.luxor_calls where twilio_call_sid=p_call_sid for update;
  if not found or c.direction <> 'inbound' or c.status not in ('ringing','in-progress')
    or c.to_number='+18176630380'
    or c.metadata->>'scope' is distinct from 'elena_live_inbound'
    or c.metadata->>'ingress_mode' is distinct from 'programmable_sip'
    or c.metadata->>'openai_session_id' is distinct from p_session_id
    or c.metadata->'accepted' is distinct from 'true'::jsonb
    or c.metadata->'sip_answered' is distinct from 'true'::jsonb
    or c.metadata->'rehearsal_only' is distinct from 'false'::jsonb
    or not exists(select 1 from public.luxor_phone_numbers n where n.phone_number=c.to_number and n.is_public) then
    raise exception 'Live tour booking is not authorized' using errcode='42501';
  end if;
  if c.metadata->'booking_receipt'->>'nonce'=p_nonce::text then
    return (c.metadata->'booking_receipt'->'result') || jsonb_build_object('replayed',true);
  end if;
  if c.metadata ? 'booking_receipt' then raise exception 'This call already booked a tour'; end if;
  pending := c.metadata->'booking_pending';
  capture := c.metadata->'inbound_capture';
  if p_nonce is null or pending->>'nonce' is distinct from p_nonce::text
    or coalesce((pending->>'expires_at')::timestamptz,'-infinity'::timestamptz)<=now()
    or (pending->>'expires_at')::timestamptz>now()+interval '4 minutes'
    or capture->'confirmed' is distinct from 'true'::jsonb
    or capture->'matching_review_needed' is distinct from 'false'::jsonb
    or c.inquiry_id is null
    or capture->>'inquiry_id' is distinct from c.inquiry_id::text
    or pending->>'inquiry_id' is distinct from c.inquiry_id::text
    or coalesce(length(btrim(pending->>'venue_location')),0) not between 1 and 500
    or pending->>'venue_location' ~ '[[:cntrl:]]'
    or pending->>'contact_nonce' is distinct from capture->>'nonce' then
    raise exception 'Confirm the current caller details and tour readback first' using errcode='22023';
  end if;
  select * into i from public.luxor_inquiries where id=c.inquiry_id for update;
  if not found or coalesce(i.is_test,false) or i.archived_at is not null
    or i.status not in ('new','contacted','tour_requested')
    or lower(coalesce(i.metadata->>'is_test_record','false'))='true'
    or i.updated_at is distinct from (pending->>'inquiry_updated_at')::timestamptz
    or lower(regexp_replace(btrim(i.full_name),'\s+',' ','g')) is distinct from lower(regexp_replace(btrim(capture->>'full_name'),'\s+',' ','g'))
    or nullif(lower(btrim(i.email)),'') is null
    or lower(btrim(i.email)) is distinct from lower(btrim(capture->>'email'))
    or public.luxor_workflow_normalize_phone(i.phone) is null
    or public.luxor_workflow_normalize_phone(i.phone) is distinct from public.luxor_workflow_normalize_phone(capture->>'phone') then
    raise exception 'Caller identity or inquiry changed; Arianna must review it' using errcode='40001';
  end if;
  if i.preferred_tour_date is not null or nullif(btrim(i.preferred_tour_time),'') is not null
    or i.current_tour_visit_id is not null
    or exists(select 1 from public.luxor_calendar_events e where e.inquiry_id=i.id)
    or exists(select 1 from public.luxor_tour_visits v where v.inquiry_id=i.id) then
    raise exception 'Existing tour history requires Arianna review' using errcode='40001';
  end if;
  select * into s from public.luxor_tour_slots where id=(pending->>'slot_id')::uuid for update;
  start_at := (s.slot_date+s.start_time) at time zone 'America/Chicago';
  if not found or s.status<>'available' or s.booked_count>=s.capacity
    or start_at<now()+interval '24 hours'
    or s.slot_date is distinct from (pending->>'slot_date')::date
    or s.start_time is distinct from (pending->>'slot_time')::time then
    raise exception 'That published tour time is no longer available' using errcode='40001';
  end if;
  state := jsonb_build_object('title','Private Venue Tour · '||i.full_name,
    'description','Caller-confirmed private venue tour arranged by Elena. No email or SMS delivery requested.',
    'location',pending->>'venue_location',
    'startUtc',start_at,'endUtc',start_at+interval '30 minutes','status','confirmed',
    'attendeeEmails',jsonb_build_array(lower(btrim(i.email))));
  tour := jsonb_build_object('meetingType','Private Venue Tour','clientFacingNotes','',
    'responseToken',pending->>'response_token','assignees','[]'::jsonb);
  templates := jsonb_build_object(
    'confirmation',jsonb_build_object('subject','Your private Luxor tour','body','Your private venue tour was booked by phone.'),
    'reminder_24',jsonb_build_object('subject','Private Luxor tour reminder','body','Your private venue tour is tomorrow.'),
    'reminder_2',jsonb_build_object('subject','Private Luxor tour reminder','body','Your private venue tour is coming up.'));
  saved := public.luxor_save_tour_visit_schedule(i.id,-1,state,tour,templates,'Elena inbound call',
    'new_visit',(pending->>'visit_id')::uuid,(pending->>'request_id')::uuid,null,0);
  select r.id into revision_id from public.luxor_calendar_revisions r
    where r.event_id=(saved->'event'->>'id')::uuid and r.sequence=(saved->'event'->>'sequence')::integer;
  if revision_id is null then raise exception 'Saved tour revision missing'; end if;
  update public.luxor_email_jobs set status='cancelled',updated_at=clock_timestamp(),
    last_error='Phone booking confirmed verbally; no email or SMS requested.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('elena_voice_no_send',true)
    where status='queued' and (calendar_revision_id=revision_id or tour_revision_id=revision_id);
  if exists(select 1 from public.luxor_email_jobs where status='queued'
    and (calendar_revision_id=revision_id or tour_revision_id=revision_id)) then
    raise exception 'Phone booking delivery suppression failed';
  end if;
  insert into public.luxor_notes(inquiry_id,content,note_type,author)
    values(i.id,'Elena booked a private venue tour by phone after caller confirmation. No email or text was sent.','note','Elena');
  result := jsonb_build_object('booked',true,'replayed',false,
    'slot',jsonb_build_object('date',s.slot_date,'time',to_char(s.start_time,'FMHH12:MI AM')),
    'message','Your private venue tour is booked. No email or text was sent.');
  update public.luxor_calls set metadata=(metadata-'booking_pending') || jsonb_build_object(
    'booking_receipt',jsonb_build_object('nonce',p_nonce,'result',result,'inquiry_id',i.id,'calendar_revision_id',revision_id,'confirmed_at',clock_timestamp())),
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=c.id;
  return result;
end;
$$;
revoke all on function public.luxor_confirm_elena_inbound_tour(text,text,uuid) from public,anon,authenticated;
grant execute on function public.luxor_confirm_elena_inbound_tour(text,text,uuid) to service_role;
