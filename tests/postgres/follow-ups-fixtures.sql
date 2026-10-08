\set ON_ERROR_STOP on
set role service_role;
insert into public.luxor_inquiries (id, status, marketing_opt_in, follow_up_disposition) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','new',true,null),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','new',true,null);
insert into public.luxor_follow_up_enrollments (id,inquiry_id,automation_key,status,marketing_consent_at_enrollment) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','brochure_lead','paused',true),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','brochure_lead','paused',true);
update public.luxor_follow_up_templates set active=true where step_key in ('email_2','email_5');
insert into public.luxor_email_jobs (id,inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,automation_enrollment_id,automation_step_key) values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','marketing_campaign','queued','synthetic@example.invalid','Synthetic fixture','Synthetic fixture only',now()-interval '2 days','cccccccc-cccc-4ccc-8ccc-cccccccccccc','email_2'),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','marketing_campaign','queued','synthetic@example.invalid','Synthetic fixture','Synthetic fixture only',now()-interval '2 days','dddddddd-dddd-4ddd-8ddd-dddddddddddd','email_5');
insert into public.luxor_follow_up_actions (id,enrollment_id,template_id,step_key,channel,scheduled_at,status,email_job_id) values
 ('22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc',(select id from public.luxor_follow_up_templates where step_key='email_2'),'email_2','email',now()-interval '1 day','email_queued','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
 ('33333333-3333-4333-8333-333333333333','dddddddd-dddd-4ddd-8ddd-dddddddddddd',(select id from public.luxor_follow_up_templates where step_key='email_5'),'email_5','email',now()-interval '1 day','email_queued','11111111-1111-4111-8111-111111111111');
reset role;
