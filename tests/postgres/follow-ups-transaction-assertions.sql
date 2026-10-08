\set ON_ERROR_STOP on
set role service_role;
do $$ declare r jsonb; t timestamptz;
begin
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'missing_enrollment' then raise exception 'wrong inquiry/enrollment accepted: %',r; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','99999999-9999-4999-8999-999999999999','skip',null);
  if r->>'status' <> 'stale_action' then raise exception 'wrong action accepted: %',r; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('99999999-9999-4999-8999-999999999999','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'missing_lead' then raise exception 'missing lead accepted: %',r; end if;
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','reschedule',now()-interval '1 minute');
  if r->>'status' <> 'future_time_required' then raise exception 'past reschedule accepted: %',r; end if;
  update public.luxor_follow_up_enrollments set status='active' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'ineligible' then raise exception 'non-paused enrollment accepted: %',r; end if;
  update public.luxor_follow_up_enrollments set status='paused',marketing_consent_at_enrollment=false where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'ineligible' then raise exception 'unconsented enrollment accepted: %',r; end if;
  update public.luxor_follow_up_enrollments set marketing_consent_at_enrollment=true where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  update public.luxor_email_jobs set status='sent' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status' <> 'stale_job' then raise exception 'non-queued job accepted: %',r; end if;
  update public.luxor_email_jobs set status='queued' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  t := now()+interval '3 days';
  r := public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','reschedule',t);
  if r->>'status' <> 'success' then raise exception 'eligible reschedule failed: %',r; end if;
  if (select scheduled_at from public.luxor_follow_up_actions where id='22222222-2222-4222-8222-222222222222') <> t or (select scheduled_for from public.luxor_email_jobs where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> t then raise exception 'reschedule was not paired'; end if;
  update public.luxor_follow_up_actions set scheduled_at=now()-interval '1 day' where id='22222222-2222-4222-8222-222222222222';
  update public.luxor_email_jobs set scheduled_for=now()-interval '2 days' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
end $$;
reset role;

create or replace function public.synthetic_fail_action_skip() returns trigger language plpgsql as $$ begin if new.status='skipped' then raise exception using errcode='P0002', message='synthetic action update fault'; end if; return new; end $$;
create trigger synthetic_fail_action_skip before update on public.luxor_follow_up_actions for each row execute function public.synthetic_fail_action_skip();
set role service_role;
do $$ begin
  begin
    perform public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
    raise exception using errcode='P0001',message='expected action trigger to abort';
  exception when sqlstate 'P0002' then null; end;
  if (select status from public.luxor_email_jobs where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') <> 'queued' or (select status from public.luxor_follow_up_actions where id='22222222-2222-4222-8222-222222222222') <> 'email_queued' then raise exception 'function error failed to roll back both writes'; end if;
end $$;
reset role;
drop trigger synthetic_fail_action_skip on public.luxor_follow_up_actions;
drop function public.synthetic_fail_action_skip();
set role service_role;
do $$ declare r jsonb; begin
  r:=public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null);
  if r->>'status'<>'success' then raise exception 'retry did not succeed: %',r; end if;
  if (select status from public.luxor_email_jobs where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>'cancelled' or (select status from public.luxor_follow_up_actions where id='22222222-2222-4222-8222-222222222222')<>'skipped' then raise exception 'retry did not change both rows'; end if;
  if (select status from public.luxor_follow_up_enrollments where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'paused' then raise exception 'recovery resumed sequence'; end if;
end $$;
reset role;
select 'eligibility, paired writes, forced rollback, retry, no implicit resume: PASS';
