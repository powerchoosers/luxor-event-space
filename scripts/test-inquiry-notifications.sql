-- No email delivery. All preference/inquiry/job fixtures roll back together.
begin;
set local role service_role;
do $$
declare
  marker text := 'inquiry-alert-test-'||gen_random_uuid();
  pref text := gen_random_uuid()||'@example.invalid';
  lead uuid; silent_lead uuid; job public.luxor_email_jobs%rowtype;
  jobs_count integer; claim_count integer; expected_count integer;
begin
  insert into public.luxor_user_preferences(email,theme,notification_emails)
    values(pref,'light',' Queue-Test@Example.invalid,queue-test@example.invalid,not an address,bad@example.invalid'||chr(10)||'Bcc:spoof@example.invalid');
  select count(distinct lower(btrim(value))) into expected_count from public.luxor_user_preferences p
    cross join lateral regexp_split_to_table(coalesce(p.notification_emails,''),',') value
    where length(btrim(value))<=254 and btrim(value) ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$';
  insert into public.luxor_inquiries(full_name,email,source,flow,metadata)
    values(marker,'guest@example.invalid','test','tour_request','{"notification_emails":"attacker@example.invalid","internal_notification_requested":true}') returning id into silent_lead;
  if exists(select 1 from public.luxor_email_jobs where inquiry_id=silent_lead and job_type='inquiry_notification') then raise exception 'Metadata requested an unauthorized alert'; end if;
  insert into public.luxor_inquiries(full_name,email,source,flow,message,internal_notification_requested,metadata)
    values(marker||chr(10)||'Guest','guest@example.invalid','test','tour_request','Original inquiry',true,'{"chatMessages":[],"notification_emails":"attacker@example.invalid"}') returning id into lead;
  select count(*) into jobs_count from public.luxor_email_jobs where inquiry_id=lead and job_type='inquiry_notification';
  if jobs_count<>expected_count then raise exception 'Configured recipients not deduplicated/normalized'; end if;
  select * into job from public.luxor_email_jobs where inquiry_id=lead and job_type='inquiry_notification' and recipient_email='queue-test@example.invalid';
  if job.id is null or job.status<>'queued' or position(chr(10) in job.subject)>0 then raise exception 'Atomic queued alert or header sanitization missing'; end if;
  if job.metadata#>>'{inquirySnapshot,message}'<>'Original inquiry' or job.metadata#>>'{inquirySnapshot,metadata,notification_emails}' is not null then raise exception 'Snapshot invalid or includes arbitrary metadata'; end if;
  update public.luxor_inquiries set message='Changed after submission' where id=lead;
  if (select metadata#>>'{inquirySnapshot,message}' from public.luxor_email_jobs where id=job.id)<>'Original inquiry' then raise exception 'Inquiry update altered queued snapshot'; end if;
  if (select count(*) from public.luxor_email_jobs where inquiry_id=lead)<>jobs_count then raise exception 'Update duplicated alerts'; end if;
  begin
    insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,scheduled_for)
      values(lead,'inquiry_notification','QUEUE-TEST@example.invalid','Duplicate','Duplicate',now());
    raise exception 'Duplicate alert accepted';
  exception when unique_violation then null;
  end;
  -- Only fixtures can be due: postpone the other alerts created in this same transaction.
  update public.luxor_email_jobs set scheduled_for=now()+interval '1 day' where inquiry_id=lead and id<>job.id;
  update public.luxor_email_jobs set scheduled_for='1970-01-01' where id=job.id;
  select count(*) into claim_count from public.luxor_claim_inquiry_notification_jobs(1) c where c.id=job.id and c.status='sending' and c.attempts=1;
  if claim_count<>1 then raise exception 'Internal alert claim failed'; end if;
  if exists(select 1 from public.luxor_claim_inquiry_notification_jobs(1) c where c.id=job.id) then raise exception 'Internal alert claimed twice'; end if;
  if has_function_privilege('anon','public.luxor_claim_inquiry_notification_jobs(integer)','execute') or
    has_function_privilege('authenticated','public.luxor_enqueue_inquiry_notifications()','execute') then raise exception 'Public queue access'; end if;
end;
$$;
select 'PASS atomic inquiry alerts, configured recipient normalization, metadata isolation, frozen snapshot, duplicate protection and exclusive private claims' as result;
rollback;
