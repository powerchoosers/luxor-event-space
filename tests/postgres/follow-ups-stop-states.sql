\set ON_ERROR_STOP on
set role service_role;

insert into public.luxor_inquiries (id,status,marketing_opt_in,follow_up_disposition) values
 ('61000000-0000-4000-8000-000000000001','new',true,null),
 ('61000000-0000-4000-8000-000000000002','new',true,null),
 ('61000000-0000-4000-8000-000000000003','new',true,null);
insert into public.luxor_follow_up_enrollments (id,inquiry_id,automation_key,status,marketing_consent_at_enrollment) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','brochure_lead','active',true),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','brochure_lead','active',true),
 ('62000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','brochure_lead','active',true);
insert into public.luxor_email_jobs (id,inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,automation_enrollment_id,automation_step_key) values
 ('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','marketing_campaign','queued','synthetic@example.invalid','Synthetic test','Fixture only',now(),'62000000-0000-4000-8000-000000000001','email_2'),
 ('63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000002','marketing_campaign','queued','synthetic@example.invalid','Synthetic test','Fixture only',now(),'62000000-0000-4000-8000-000000000002','email_2'),
 ('63000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000003','marketing_campaign','queued','synthetic@example.invalid','Synthetic test','Fixture only',now(),'62000000-0000-4000-8000-000000000003','email_2');

insert into public.luxor_tasks (id,inquiry_id,title,status,automation_enrollment_id,automation_step_key) values
 ('64000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Synthetic phone task one','pending','62000000-0000-4000-8000-000000000001','phone_1'),
 ('64000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Synthetic phone task two','pending','62000000-0000-4000-8000-000000000001','phone_2'),
 ('64000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','Synthetic phone task one','pending','62000000-0000-4000-8000-000000000002','phone_1'),
 ('64000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000002','Synthetic phone task two','pending','62000000-0000-4000-8000-000000000002','phone_2'),
 ('64000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000003','Synthetic phone task one','pending','62000000-0000-4000-8000-000000000003','phone_1'),
 ('64000000-0000-4000-8000-000000000006','61000000-0000-4000-8000-000000000003','Synthetic phone task two','pending','62000000-0000-4000-8000-000000000003','phone_2');

insert into public.luxor_follow_up_actions (enrollment_id,template_id,step_key,channel,scheduled_at,status,email_job_id,task_id)
select rows.enrollment_id::uuid, template.id, rows.step_key,
       case when rows.step_key like 'phone_%' then 'phone' else 'email' end,
       now() - interval '1 day', rows.action_status, rows.job_id, rows.task_id
from (values
 ('62000000-0000-4000-8000-000000000001','email_1','scheduled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','email_2','email_queued','63000000-0000-4000-8000-000000000001'::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','phone_1','task_created',null::uuid,'64000000-0000-4000-8000-000000000001'::uuid),
 ('62000000-0000-4000-8000-000000000001','phone_2','processing',null::uuid,'64000000-0000-4000-8000-000000000002'::uuid),
 ('62000000-0000-4000-8000-000000000001','email_3','completed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','phone_3','failed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','email_4','skipped',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','phone_4','cancelled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000001','email_5','existing_delivery',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','email_1','scheduled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','email_2','email_queued','63000000-0000-4000-8000-000000000002'::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','phone_1','task_created',null::uuid,'64000000-0000-4000-8000-000000000003'::uuid),
 ('62000000-0000-4000-8000-000000000002','phone_2','processing',null::uuid,'64000000-0000-4000-8000-000000000004'::uuid),
 ('62000000-0000-4000-8000-000000000002','email_3','completed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','phone_3','failed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','email_4','skipped',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','phone_4','cancelled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000002','email_5','existing_delivery',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','email_1','scheduled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','email_2','email_queued','63000000-0000-4000-8000-000000000003'::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','phone_1','task_created',null::uuid,'64000000-0000-4000-8000-000000000005'::uuid),
 ('62000000-0000-4000-8000-000000000003','phone_2','processing',null::uuid,'64000000-0000-4000-8000-000000000006'::uuid),
 ('62000000-0000-4000-8000-000000000003','email_3','completed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','phone_3','failed',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','email_4','skipped',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','phone_4','cancelled',null::uuid,null::uuid),
 ('62000000-0000-4000-8000-000000000003','email_5','existing_delivery',null::uuid,null::uuid)
) as rows(enrollment_id,step_key,action_status,job_id,task_id)
join public.luxor_follow_up_templates template on template.step_key=rows.step_key;

update public.luxor_inquiries set marketing_opt_in=false where id='61000000-0000-4000-8000-000000000001';
update public.luxor_inquiries set follow_up_disposition='not_interested' where id='61000000-0000-4000-8000-000000000002';
update public.luxor_inquiries set status='booked' where id='61000000-0000-4000-8000-000000000003';

do $$
declare fixture record; live_count integer; terminal_count integer;
begin
  for fixture in select * from (values
    ('61000000-0000-4000-8000-000000000001'::uuid,'62000000-0000-4000-8000-000000000001'::uuid,'unsubscribed'),
    ('61000000-0000-4000-8000-000000000002'::uuid,'62000000-0000-4000-8000-000000000002'::uuid,'not_interested'),
    ('61000000-0000-4000-8000-000000000003'::uuid,'62000000-0000-4000-8000-000000000003'::uuid,'booked')
  ) as v(inquiry_id,enrollment_id,reason)
  loop
    if not exists(select 1 from public.luxor_follow_up_enrollments where id=fixture.enrollment_id and status='stopped' and ended_reason=fixture.reason) then
      raise exception 'stop reason or enrollment state incorrect for %',fixture.reason;
    end if;
    select count(*) into live_count from public.luxor_follow_up_actions
    where enrollment_id=fixture.enrollment_id and step_key in ('email_1','email_2','phone_1','phone_2') and status='cancelled';
    if live_count <> 4 then raise exception 'expected all four live action states canceled for %, got %',fixture.reason,live_count; end if;
    select count(*) into terminal_count from public.luxor_follow_up_actions
    where enrollment_id=fixture.enrollment_id and (step_key, status) in (
      ('email_3','completed'),('phone_3','failed'),('email_4','skipped'),('phone_4','cancelled'),('email_5','existing_delivery'));
    if terminal_count <> 5 then raise exception 'terminal action history changed for %',fixture.reason; end if;
    if not exists(select 1 from public.luxor_email_jobs where automation_enrollment_id=fixture.enrollment_id and status='cancelled') then raise exception 'queued email job not canceled for %',fixture.reason; end if;
    if (select count(*) from public.luxor_tasks where automation_enrollment_id=fixture.enrollment_id and status='cancelled') <> 2 then raise exception 'pending phone tasks not canceled for %',fixture.reason; end if;
  end loop;
end $$;
reset role;
select 'stop trigger unsubscribe/decline/booking: 12 live action rows canceled; 15 terminal rows preserved; jobs/tasks canceled: PASS';
