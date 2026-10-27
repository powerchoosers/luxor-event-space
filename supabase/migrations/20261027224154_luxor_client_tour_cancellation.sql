-- Unapplied candidate: serializes the tour, calendar and slot changes.
-- No provider requests are performed in this transaction.
-- Cancellation confirmations and internal alerts use the existing all-hours inquiry notification
-- worker. The inquiry reference is frozen in metadata because the existing
-- new-inquiry uniqueness constraint permits one alert per inquiry/recipient.
create unique index luxor_tour_cancellation_notice_unique on public.luxor_email_jobs
  ((metadata->>'tourInquiryId'), (metadata->>'calendarSequence'), (metadata->>'notificationKind'), lower(recipient_email))
  where job_type='inquiry_notification' and metadata->>'notificationKind' in ('tour_cancellation','tour_cancellation_client');

create function public.luxor_cancel_tour(p_inquiry_id uuid, p_token text, p_requested_by text, p_expected_sequence integer, p_reason text default null)
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
      or slot.capacity is distinct from 1 or slot.booked_count is distinct from 1 or slot.status is distinct from 'booked'
      or exists(select 1 from public.luxor_inquiries other where other.id<>lead.id
        and other.metadata->>'selectedTourSlotId'=slot_id::text
        and other.preferred_tour_date=slot.slot_date
        and coalesce(other.tour_attendance_status,'') not in ('cancelled','attended','no_show')
        and other.status<>'closed_lost') then return jsonb_build_object('status','slot_attention'); end if;
    update public.luxor_tour_slots set booked_count=0,status='available',updated_at=stamp where id=slot.id;
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
