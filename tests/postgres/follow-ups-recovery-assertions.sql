\set ON_ERROR_STOP on
set role service_role;
do $$
declare r jsonb; c integer;
begin
  if (select count(*) from public.luxor_follow_up_templates) <> 9 then raise exception 'template seed rows were lost'; end if;
  if (select enabled or send_approved from public.luxor_follow_up_automations where automation_key='brochure_lead') then raise exception 'existing disabled sending gate changed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.luxor_follow_up_actions'::regclass) then raise exception 'RLS is not enabled on actions'; end if;
  if not has_table_privilege('anon','public.luxor_inquiries','SELECT') or has_table_privilege('anon','public.luxor_inquiries','UPDATE') then raise exception 'synthetic core grants do not match production read-only privileges'; end if;
  if has_function_privilege('anon','public.luxor_stop_brochure_follow_up()','EXECUTE') or not has_function_privilege('service_role','public.luxor_stop_brochure_follow_up()','EXECUTE') then raise exception 'stop trigger function ACL does not match production catalog'; end if;
  if has_table_privilege('anon','public.luxor_follow_up_actions','SELECT') or has_table_privilege('authenticated','public.luxor_follow_up_actions','UPDATE') then raise exception 'untrusted role unexpectedly has follow-up table grants'; end if;
  if not has_table_privilege('service_role','public.luxor_follow_up_actions','UPDATE') then raise exception 'existing service role grant missing'; end if;
  if not (select prorettype='jsonb'::regtype and not prosecdef from pg_proc where oid='public.luxor_recover_brochure_follow_up_overdue(uuid,uuid,uuid,text,timestamp with time zone)'::regprocedure) then raise exception 'recovery RPC is not SECURITY INVOKER returning jsonb'; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'missing_enrollment' then raise exception 'wrong inquiry/enrollment validation failed: %', r; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','99999999-9999-4999-8999-999999999999','skip',null);
  if r->>'status' <> 'stale_action' then raise exception 'wrong action validation failed: %', r; end if;
  update public.luxor_follow_up_enrollments set status='active' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'ineligible' then raise exception 'non-paused sequence accepted: %', r; end if;
  update public.luxor_follow_up_enrollments set status='paused' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  update public.luxor_inquiries set marketing_opt_in=false where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'ineligible' then raise exception 'suppressed lead accepted: %', r; end if;
  if (select status from public.luxor_follow_up_actions where id='22222222-2222-4222-8222-222222222222') <> 'cancelled' then raise exception 'unsubscribe trigger did not stop sequence'; end if;
  if (select status from public.luxor_email_jobs where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 'cancelled' then raise exception 'unsubscribe trigger did not cancel queued job'; end if;
  update public.luxor_inquiries set marketing_opt_in=true, follow_up_disposition=null where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  update public.luxor_follow_up_enrollments set status='paused' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  update public.luxor_follow_up_actions set status='email_queued',scheduled_at=now()-interval '1 day' where id='22222222-2222-4222-8222-222222222222';
  update public.luxor_email_jobs set status='queued',scheduled_for=now()-interval '2 days' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  r := public.luxor_recover_brochure_follow_up_overdue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','33333333-3333-4333-8333-333333333333','skip',null);
  if r->>'status' <> 'terminal_skip_requires_reschedule_or_stop' then raise exception 'Day 30 skip was not rejected: %', r; end if;
  if (select status from public.luxor_follow_up_actions where id='33333333-3333-4333-8333-333333333333') <> 'email_queued' or (select status from public.luxor_email_jobs where id='11111111-1111-4111-8111-111111111111') <> 'queued' then raise exception 'Day 30 rejection changed state'; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','33333333-3333-4333-8333-333333333333','reschedule',now()+interval '2 days');
  if r->>'status' <> 'success' or (select scheduled_at from public.luxor_follow_up_actions where id='33333333-3333-4333-8333-333333333333') <= now() or (select scheduled_for from public.luxor_email_jobs where id='11111111-1111-4111-8111-111111111111') <= now() then raise exception 'Day 30 reschedule failed atomically: %',r; end if;
  update public.luxor_follow_up_automations set enabled=false,send_approved=false,timing_configured=true,timezone='America/Chicago' where automation_key='brochure_lead';
  select count(*) into c from public.luxor_claim_due_follow_up_email_jobs(1);
  if c <> 0 then raise exception 'disabled send gate claimed % jobs',c; end if;
  if (select status from public.luxor_email_jobs where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 'queued' then raise exception 'claim function modified a paused job'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='luxor_notes' and column_name='task_id') <> 1 then raise exception 'notes task_id migration missing'; end if;
  if (select column_default from information_schema.columns where table_schema='public' and table_name='luxor_notes' and column_name='note_type') is null then raise exception 'note_type database default lost'; end if;
  insert into public.luxor_tasks(id,inquiry_id,title) values('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic linked task');
  insert into public.luxor_notes(id,inquiry_id,task_id,content,note_type) values('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','Synthetic note','call_log');
  delete from public.luxor_tasks where id='44444444-4444-4444-8444-444444444444';
  if not exists(select 1 from public.luxor_notes where id='55555555-5555-4555-8555-555555555555' and task_id is null) then raise exception 'note did not survive task deletion with null task link'; end if;
end $$;
reset role;
select 'service role, recovery gates, email_5, reschedule, send gate, RLS/grants, note/task history: PASS';

\ir follow-ups-transaction-assertions.sql
