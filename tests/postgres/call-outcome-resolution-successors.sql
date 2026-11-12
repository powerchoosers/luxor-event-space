\set ON_ERROR_STOP on
DO $$
declare lid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();r jsonb;wid uuid;ceid uuid;runid uuid;n integer;
begin
 insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','successor@example.invalid',true);
 insert into public.luxor_follow_up_enrollments(id,inquiry_id,automation_key,status,marketing_consent_at_enrollment) values(eid,lid,'brochure_lead','active',true);
 insert into public.luxor_tasks(id,inquiry_id,title,automation_enrollment_id,automation_step_key) values(tid,lid,'Call',eid,'call_1');
 insert into public.luxor_follow_up_actions(id,enrollment_id,step_key,channel,scheduled_at,status,task_id) values(aid,eid,'call_1','phone',now(),'task_created',tid);
 insert into public.luxor_follow_up_actions(enrollment_id,step_key,channel,scheduled_at,status) values(eid,'email_2','email',now()+interval '2 days','scheduled');
 r:=public.luxor_resolve_call_outcome(gen_random_uuid(),lid,tid,'no_answer','none','keep successor',null,null,null,'tester@example.invalid');
 if (select count(*) from public.luxor_follow_up_actions where enrollment_id=eid)<>2 or not exists(select 1 from public.luxor_follow_up_actions where enrollment_id=eid and step_key='email_2' and status='scheduled') or (select status from public.luxor_follow_up_actions where id=aid)<>'completed' then raise exception 'Brochure successors changed';end if;
 lid:=gen_random_uuid();tid:=gen_random_uuid();
 insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','custom-successor@example.invalid',true);
 select id into wid from public.luxor_custom_workflows where trigger_type='manual' and status='active' limit 1;
 perform public.luxor_custom_workflow_manual_enroll(wid,array[lid],'tester@example.invalid');
 select id into ceid from public.luxor_custom_workflow_enrollments where inquiry_id=lid;
 select id into runid from public.luxor_custom_workflow_step_runs where enrollment_id=ceid limit 1;
 insert into public.luxor_tasks(id,inquiry_id,title) values(tid,lid,'Existing custom call');
 update public.luxor_custom_workflow_step_runs set snapshot=snapshot||jsonb_build_object('task_id',tid) where id=runid;
 select count(*) into n from public.luxor_custom_workflow_step_runs where enrollment_id=ceid;
 r:=public.luxor_resolve_call_outcome(gen_random_uuid(),lid,tid,'interested','none','no double schedule',null,null,null,'tester@example.invalid');
 if (select count(*) from public.luxor_custom_workflow_step_runs where enrollment_id=ceid)<>n then raise exception 'Custom duplicated successor';end if;
 raise notice 'PASS brochure existing successor preserved and custom run count unchanged';
end $$;
