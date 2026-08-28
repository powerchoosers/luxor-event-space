-- Run as one transaction, including rollback. No provider or storage writes.
begin;
set local role service_role;
do $$
declare notice uuid := gen_random_uuid(); second_notice uuid := gen_random_uuid(); stale_notice uuid := gen_random_uuid(); claimed integer;
begin
  insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,scheduled_for,status,attempts,updated_at)
    values(stale_notice,'transactional_notice','notice-test@example.invalid','Stale fixture','Stale','1900-01-01','sending',1,now()-interval '20 minutes');
  insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,scheduled_for,metadata)
    values(notice,'transactional_notice','notice-test@example.invalid','Transactional notice regression','Original','1900-01-01','{"qa":"transactional-notice"}');
  insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,scheduled_for,metadata)
    values(notice,'transactional_notice','other@example.invalid','Replacement','Changed',now(),'{}') on conflict(id) do nothing;
  if (select body from public.luxor_email_jobs where id=notice)<>'Original' then raise exception 'Retry replaced immutable notice'; end if;
  select count(*) into claimed from public.luxor_claim_inquiry_notification_jobs(1) j where j.id=notice and j.status='sending' and j.attempts=1;
  if claimed<>1 then raise exception 'All-hours claim missed transactional notice'; end if;
  -- Do not call the claim again without a known due fixture ahead of real mail.
  insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,scheduled_for)
    values(second_notice,'transactional_notice','notice-test@example.invalid','Second fixture','Second','1900-01-02');
  select count(*) into claimed from public.luxor_claim_inquiry_notification_jobs(1) j where j.id=second_notice;
  if claimed<>1 then raise exception 'Second fixture not claimed'; end if;
  if (select status from public.luxor_email_jobs where id=stale_notice)<>'failed' then raise exception 'Ambiguous notice automatically retried'; end if;
  if (select attempts from public.luxor_email_jobs where id=notice)<>1 then raise exception 'Notice was claimed twice'; end if;
  if has_function_privilege('anon','public.luxor_claim_inquiry_notification_jobs(integer)','execute')
    or has_function_privilege('authenticated','public.luxor_claim_due_email_jobs(integer)','execute') then raise exception 'Public claim permission'; end if;
  if exists(select 1 from pg_proc where oid in ('public.luxor_claim_inquiry_notification_jobs(integer)'::regprocedure,
    'public.luxor_claim_due_email_jobs(integer)'::regprocedure) and prosecdef) then raise exception 'Claim bypasses RLS'; end if;
end;
$$;
select 'PASS transactional notice constraint claim, replay immutability, interrupted-delivery review, private invoker permissions' as result;
rollback;
