-- One transaction: fixture mail and jobs are never visible to live workers.
begin;
set local role service_role;
do $$
declare
  inquiry uuid; event jsonb; state jsonb; reply jsonb; review jsonb; original jsonb;
  mail uuid; v_response_id uuid; v_event_id uuid; jobs bigint; denied boolean;
begin
  insert into public.luxor_inquiries(full_name) values('Calendar review transaction fixture') returning id into inquiry;
  state := jsonb_build_object('title','Review fixture','description','Never sent','location','Fixture',
    'startUtc',now()+interval '2 days','endUtc',now()+interval '2 days 30 minutes',
    'attendeeEmails',jsonb_build_array('review@example.invalid'),'status','confirmed');
  event := public.luxor_save_calendar_revision(inquiry,-1,state,'owner@example.invalid');
  v_event_id := (event->>'id')::uuid;
  select count(*) into jobs from public.luxor_email_jobs where inquiry_id=inquiry;
  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','review-transaction-test','review@example.invalid',array['booking@luxoratlaspalmas.com'],'Unsigned reply') returning id into mail;
  reply := public.luxor_record_calendar_response(event->>'uid',mail,'review@example.invalid',0,'ACCEPTED',now(),false);
  v_response_id := (reply->>'id')::uuid; original := reply;
  review := public.luxor_review_calendar_response(v_response_id,0,'approve','owner@example.invalid','Confirmed directly with guest');
  assert review->>'decision'='approve';
  assert (select partstat from public.luxor_calendar_attendees a where a.event_id=v_event_id)='ACCEPTED';
  assert public.luxor_review_calendar_response(v_response_id,0,'approve','owner@example.invalid','Confirmed directly with guest')=review, 'Retry must be idempotent';
  assert (select to_jsonb(r) from public.luxor_calendar_responses r where id=v_response_id)=original, 'Original unverified evidence must remain immutable';
  denied := false;
  begin perform public.luxor_review_calendar_response(v_response_id,0,'dismiss','other@example.invalid','Different decision');
  exception when raise_exception then denied := true; end;
  assert denied, 'Conflicting review must fail';

  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','review-transaction-test','review@example.invalid',array['booking@luxoratlaspalmas.com'],'Older unsigned reply') returning id into mail;
  reply := public.luxor_record_calendar_response(event->>'uid',mail,'review@example.invalid',0,'DECLINED',now()+interval '1 second',false);
  v_response_id := (reply->>'id')::uuid;
  -- A newer verified reply arriving while the owner reads the review wins.
  update public.luxor_calendar_attendees a set response_at=now()+interval '2 seconds' where a.event_id=v_event_id;
  denied := false;
  begin perform public.luxor_review_calendar_response(v_response_id,0,'approve','owner@example.invalid','Old tab');
  exception when raise_exception then denied := true; end;
  assert denied, 'Cannot overwrite a newer attendance response';
  assert not exists(select 1 from public.luxor_calendar_response_reviews r where r.response_id=v_response_id), 'Rejected action must not leave audit rows';
  review := public.luxor_review_calendar_response(v_response_id,0,'dismiss','owner@example.invalid','A newer response is already saved');
  assert review->>'decision'='dismiss';
  assert (select partstat from public.luxor_calendar_attendees a where a.event_id=v_event_id)='ACCEPTED', 'Dismissal must not change attendance';

  insert into public.luxor_mail_messages(provider,direction,thread_key,from_address,to_addresses,subject)
    values('resend','incoming','review-transaction-test','review@example.invalid',array['booking@luxoratlaspalmas.com'],'Reply before reschedule') returning id into mail;
  reply := public.luxor_record_calendar_response(event->>'uid',mail,'review@example.invalid',0,'TENTATIVE',now()+interval '3 seconds',false);
  v_response_id := (reply->>'id')::uuid;
  event := public.luxor_save_calendar_revision(inquiry,0,state || jsonb_build_object('title','Updated fixture'),'owner@example.invalid');
  select count(*) into jobs from public.luxor_email_jobs where inquiry_id=inquiry;
  denied := false;
  begin perform public.luxor_review_calendar_response(v_response_id,0,'approve','owner@example.invalid','Stale event');
  exception when raise_exception then denied := true; end;
  assert denied, 'Expected sequence must fence owner review';
  denied := false;
  begin perform public.luxor_review_calendar_response(v_response_id,1,'approve','owner@example.invalid','Old reply sequence');
  exception when raise_exception then denied := true; end;
  assert denied, 'Old reply cannot be approved against a newer event';
  perform public.luxor_review_calendar_response(v_response_id,1,'dismiss','owner@example.invalid','Reply belonged to previous schedule');
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=jobs, 'Review never queues or sends mail';
  assert not has_function_privilege('anon','public.luxor_review_calendar_response(uuid,integer,text,text,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.luxor_review_calendar_response(uuid,integer,text,text,text)','EXECUTE');
end;
$$;
rollback;
