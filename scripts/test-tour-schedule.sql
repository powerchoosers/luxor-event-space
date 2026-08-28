-- Execute the whole file: no fixture jobs become visible to any live worker.
begin;
set local role service_role;
do $$
declare
  inquiry uuid; state jsonb; tour jsonb; templates jsonb; saved jsonb; replay jsonb;
  original_uid text; old_revision uuid; v_event uuid; before_count bigint; denied boolean;
begin
  insert into public.luxor_inquiries(full_name,metadata) values('Atomic tour transaction fixture','{"preserved":"yes"}') returning id into inquiry;
  state := jsonb_build_object('title','Atomic tour fixture','description','Never sent','location','Fixture',
    'startUtc',now()+interval '3 days','endUtc',now()+interval '3 days 30 minutes',
    'attendeeEmails',jsonb_build_array('a@example.invalid','b@example.invalid'),'status','confirmed');
  tour := jsonb_build_object('meetingType','Private Venue Tour','clientFacingNotes','',
    'responseToken',repeat('a',32),'assignees',jsonb_build_array('Owner'));
  templates := jsonb_build_object('confirmation',jsonb_build_object('subject','Confirmation','body','Frozen confirmation'),
    'reminder_24',jsonb_build_object('subject','Tomorrow','body','Frozen tomorrow'),
    'reminder_2',jsonb_build_object('subject','Soon','body','Frozen soon'));
  saved := public.luxor_save_tour_schedule(inquiry,-1,state,tour,templates,'owner@example.invalid');
  v_event := (saved->'event'->>'id')::uuid;
  original_uid := saved->'event'->>'uid';
  old_revision := (saved->'confirmationJobs'->0->>'tour_revision_id')::uuid;
  assert saved->>'replayed'='false';
  assert jsonb_array_length(saved->'confirmationJobs')=2 and jsonb_array_length(saved->'reminderJobs')=4;
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=8;
  assert saved->'inquiry'->>'status'='tour_confirmed';
  assert saved->'inquiry'->'metadata'->>'preserved'='yes';
  assert saved->'inquiry'->'metadata'->>'calendarProvider'='resend';
  assert (select count(*) from public.luxor_tour_schedule_receipts where revision_id=old_revision)=1;
  assert not exists(select 1 from public.luxor_email_jobs where tour_revision_id=old_revision and metadata->>'mail_provider'<>'resend');

  update public.luxor_inquiries set tour_attendance_status='attended' where id=inquiry;
  replay := public.luxor_save_tour_schedule(inquiry,-1,state,tour,
    jsonb_set(templates,'{confirmation,body}','"Regenerated AI copy"'),'owner@example.invalid');
  assert replay->>'replayed'='true';
  assert replay->'inquiry'->>'tour_attendance_status'='attended', 'Retry must not reset attendance';
  assert replay->'confirmationJobs'=saved->'confirmationJobs', 'Retry must keep frozen jobs and copy';
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=8;
  replay := public.luxor_save_tour_schedule(inquiry,0,state,jsonb_set(tour,'{assignees}','["Second owner"]'),templates,'owner@example.invalid');
  assert replay->'inquiry'->'metadata'->'tour_assignees'='["Second owner"]'::jsonb;
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=8, 'Assignment-only edit must not resend';

  -- Simulate a job already claimed; queued old notices are cancelled, claimed
  -- notices remain for the worker's revision guard to suppress.
  update public.luxor_email_jobs set status='sending' where id=(saved->'confirmationJobs'->0->>'id')::uuid;
  state := state || jsonb_build_object('startUtc',now()+interval '4 days','endUtc',now()+interval '4 days 30 minutes',
    'attendeeEmails',jsonb_build_array('a@example.invalid','c@example.invalid'));
  saved := public.luxor_save_tour_schedule(inquiry,0,state,tour,templates,'owner@example.invalid');
  assert saved->'event'->>'uid'=original_uid and saved->'event'->>'sequence'='1';
  assert (select count(*) from public.luxor_email_jobs where tour_revision_id=old_revision and status='cancelled')=5;
  assert (select count(*) from public.luxor_email_jobs where tour_revision_id=old_revision and status='sending')=1;
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry and calendar_method='CANCEL' and recipient_email='b@example.invalid')=1;
  assert saved->'inquiry'->>'tour_attendance_status'='pending';

  select count(*) into before_count from public.luxor_email_jobs where inquiry_id=inquiry;
  denied := false;
  begin
    perform public.luxor_save_tour_schedule(inquiry,0,jsonb_set(state,'{title}','"Stale edit"'),tour,templates,'owner@example.invalid');
  exception when raise_exception then denied := true; end;
  assert denied, 'Stale conflicting edit must fail';
  denied := false;
  begin
    -- Failure occurs AFTER the inner calendar RPC; all its changes must roll back.
    perform public.luxor_save_tour_schedule(inquiry,1,state || jsonb_build_object('startUtc',now()-interval '2 hours','endUtc',now()-interval '1 hour'),tour,templates,'owner@example.invalid');
  exception when raise_exception then denied := true; end;
  assert denied, 'Past-time save must fail atomically';
  assert (select sequence from public.luxor_calendar_events where id=v_event)=1;
  assert (select count(*) from public.luxor_email_jobs where inquiry_id=inquiry)=before_count;
  denied := false;
  begin
    perform public.luxor_save_tour_schedule(inquiry,1,state,tour,jsonb_set(templates,'{confirmation,body}','""'),'owner@example.invalid');
  exception when raise_exception then denied := true; end;
  assert denied, 'Empty email must fail before queueing';
  denied := false;
  begin
    perform public.luxor_save_tour_schedule(inquiry,1,state,jsonb_set(tour,'{responseToken}',to_jsonb(repeat('b',32))),templates,'owner@example.invalid');
  exception when raise_exception then denied := true; end;
  assert denied, 'Changed response token must fail';

  state := state || jsonb_build_object('startUtc',now()+interval '1 hour','endUtc',now()+interval '90 minutes','attendeeEmails',jsonb_build_array('a@example.invalid'));
  saved := public.luxor_save_tour_schedule(inquiry,1,state,tour,templates,'owner@example.invalid');
  assert jsonb_array_length(saved->'confirmationJobs')=1 and jsonb_array_length(saved->'reminderJobs')=0, 'Do not queue elapsed reminders';
  update public.luxor_inquiries set status='closed_lost' where id=inquiry;
  denied := false;
  begin perform public.luxor_save_tour_schedule(inquiry,2,state,tour,templates,'owner@example.invalid');
  exception when raise_exception then denied := true; end;
  assert denied, 'Closed lead must not schedule';
end;
$$;
reset role;
do $$
begin
  assert not has_function_privilege('anon','public.luxor_save_tour_schedule(uuid,integer,jsonb,jsonb,jsonb,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.luxor_save_tour_schedule(uuid,integer,jsonb,jsonb,jsonb,text)','EXECUTE');
  assert not has_table_privilege('anon','public.luxor_tour_schedule_receipts','SELECT');
  assert not has_table_privilege('service_role','public.luxor_tour_schedule_receipts','UPDATE');
  assert (select relrowsecurity from pg_class where oid='public.luxor_tour_schedule_receipts'::regclass);
end;
$$;
rollback;
