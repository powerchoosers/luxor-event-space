-- Run as one transaction. All fixtures roll back; no email jobs become visible
-- to the worker and no real customer records are used or changed.
begin;
set local role service_role;
do $$
declare
  inquiry uuid;
  event jsonb;
  repeated jsonb;
  result jsonb;
  initial_state jsonb;
  next_state jsonb;
  mail_id uuid;
  second_mail_id uuid;
  test_event_id uuid;
begin
  insert into public.luxor_inquiries(full_name) values ('Offline calendar transaction test') returning id into inquiry;
  initial_state := jsonb_build_object('title','Test tour','description','Never sent','location','Luxor',
    'startUtc',now()+interval '2 days','endUtc',now()+interval '2 days 30 minutes',
    'attendeeEmails',jsonb_build_array('one@example.invalid','two@example.invalid'),'status','confirmed');
  event := public.luxor_save_calendar_revision(inquiry,-1,initial_state,'test@example.invalid');
  test_event_id := (event->>'id')::uuid;
  assert (event->>'sequence')::integer = 0, 'First sequence must be zero';
  repeated := public.luxor_save_calendar_revision(inquiry,-1,initial_state,'test@example.invalid');
  assert event = repeated, 'Request retry must return original event';
  assert (select count(*) from public.luxor_calendar_revisions where luxor_calendar_revisions.event_id=test_event_id) = 1, 'Only one initial revision';
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry) = 2, 'Only one request per attendee';

  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','offline-calendar-test','one@example.invalid',array['booking@luxoratlaspalmas.com'],'Test RSVP') returning id into mail_id;
  result := public.luxor_record_calendar_response(event->>'uid',mail_id,'one@example.invalid',0,'ACCEPTED',now(),false);
  assert result->>'disposition' = 'pending_review', 'Unsigned response needs review';
  assert (select partstat from public.luxor_calendar_attendees where luxor_calendar_attendees.event_id=test_event_id and email='one@example.invalid') = 'NEEDS-ACTION', 'Unsigned response cannot alter attendance';
  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','offline-calendar-test','one@example.invalid',array['booking@luxoratlaspalmas.com'],'Test RSVP') returning id into second_mail_id;
  result := public.luxor_record_calendar_response(event->>'uid',second_mail_id,'one@example.invalid',0,'ACCEPTED',now(),true);
  assert result->>'disposition' = 'applied', 'Verified response must apply';
  repeated := public.luxor_record_calendar_response(event->>'uid',second_mail_id,'one@example.invalid',0,'ACCEPTED',now(),true);
  assert repeated=result, 'Webhook retry must not duplicate RSVP';
  assert (select partstat from public.luxor_calendar_attendees where luxor_calendar_attendees.event_id=test_event_id and email='one@example.invalid') = 'ACCEPTED', 'Attendance must be saved';

  next_state := initial_state || jsonb_build_object('attendeeEmails',jsonb_build_array('one@example.invalid'),
    'startUtc',now()+interval '3 days','endUtc',now()+interval '3 days 30 minutes');
  repeated := public.luxor_save_calendar_revision(inquiry,0,next_state,'test@example.invalid');
  assert repeated->>'uid' = event->>'uid' and (repeated->>'sequence')::integer=1, 'Reschedule must preserve UID and increment sequence';
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=4, 'One update plus removed attendee cancellation';
  assert (select metadata->'calendar_snapshot'->>'startUtc' from public.luxor_email_jobs where inquiry_id=inquiry and calendar_method='CANCEL') = initial_state->>'startUtc', 'Removed attendee cancellation references original time';
  assert (select partstat from public.luxor_calendar_attendees where luxor_calendar_attendees.event_id=test_event_id and email='one@example.invalid')='NEEDS-ACTION', 'Reschedule requires new RSVP';
  begin
    perform public.luxor_save_calendar_revision(inquiry,0,initial_state,'test@example.invalid');
    raise exception 'Stale edit incorrectly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Calendar changed; refresh before editing' then raise; end if;
  end;
  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','offline-calendar-test','one@example.invalid',array['booking@luxoratlaspalmas.com'],'Old RSVP') returning id into mail_id;
  result := public.luxor_record_calendar_response(event->>'uid',mail_id,'one@example.invalid',0,'DECLINED',now(),true);
  assert result->>'disposition'='stale', 'Old revision response must be ignored';
  result := public.luxor_record_calendar_response(event->>'uid',mail_id,'two@example.invalid',1,'ACCEPTED',now(),true);
  assert result->>'disposition'='rejected', 'Removed attendee cannot respond';
  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','offline-calendar-test','one@example.invalid',array['booking@luxoratlaspalmas.com'],'Future RSVP') returning id into mail_id;
  result := public.luxor_record_calendar_response(event->>'uid',mail_id,'one@example.invalid',1,'ACCEPTED',now()+interval '1 day',true);
  assert result->>'disposition'='stale', 'Far-future response must be ignored';

  next_state := next_state || jsonb_build_object('status','cancelled');
  repeated := public.luxor_save_calendar_revision(inquiry,1,next_state,'test@example.invalid');
  assert (repeated->>'sequence')::integer=2 and repeated->>'status'='cancelled', 'Cancellation is next revision';
  perform public.luxor_save_calendar_revision(inquiry,1,next_state,'test@example.invalid');
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=5, 'Cancellation retry adds no duplicate job';
  assert not exists(select 1 from public.luxor_calendar_attendees where luxor_calendar_attendees.event_id=test_event_id and active), 'Cancelled event has no active attendees';
  assert (select metadata->>'calendarEventUid' from public.luxor_inquiries where id=inquiry)=event->>'uid', 'Inquiry calendar link must persist atomically';
end;
$$;
rollback;
