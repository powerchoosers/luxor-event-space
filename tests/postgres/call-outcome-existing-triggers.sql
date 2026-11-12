\set ON_ERROR_STOP on
-- Run only after call-outcome-resolution-baseline.sql and the guarded candidate
-- (with its guard removed only in the runner's disposable copy).
-- Exercises the production brochure stop trigger plus exact invoice/receipt
-- guard bodies from migrations 20261102190000 and 20261109035941.

create table public.luxor_invoices(id uuid primary key, status text not null);
create table public.luxor_payments(id uuid primary key, status text not null);

create or replace function public.luxor_guard_invoice_reference_json()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare invoice_ref text; invoice_status text;
  reference_keys text[] := array['invoice_id','deposit_invoice_id','master_invoice_id','proposal_invoice_id'];
begin
  for invoice_ref in
    select distinct lower(coalesce(new.metadata->>key,'')) from unnest(reference_keys) as key
    where nullif(btrim(new.metadata->>key),'') is not null order by 1
  loop
    if invoice_ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Email record has an invalid invoice reference.' using errcode='23514';
    end if;
    select i.status into invoice_status from public.luxor_invoices i
      where lower(i.id::text)=invoice_ref for key share;
    if not found then raise exception 'Email record references an invoice that no longer exists.' using errcode='23503'; end if;
    if invoice_status='cancelled' and new.status in ('queued','sending','prepared','send_unconfirmed') then
      raise exception 'Email work cannot be created or resumed for a voided invoice.' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
create trigger luxor_email_jobs_invoice_reference_guard
before insert or update of metadata,status on public.luxor_email_jobs
for each row execute function public.luxor_guard_invoice_reference_json();

create or replace function public.luxor_guard_corrected_receipt_notice() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare receipt_key text;
begin
  if new.job_type<>'transactional_notice'
    or new.metadata #>> '{transactionalNotice,kind}' is distinct from 'payment_receipt'
    or new.status not in ('queued','sending') then return new; end if;
  receipt_key:=new.metadata #>> '{transactionalNotice,key}';
  if receipt_key !~ '^payment_receipt/[0-9a-fA-F-]{36}$' then
    raise exception 'Receipt notice identity requires review.' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(2147483000,400);
  if not exists(select 1 from public.luxor_payments
      where id=substring(receipt_key from 17)::uuid and status='paid') then
    raise exception 'A receipt cannot be sent for a corrected payment.' using errcode='23514'; end if;
  return new;
end $$;
create trigger luxor_corrected_receipt_notice_guard before insert or update on public.luxor_email_jobs
for each row execute function public.luxor_guard_corrected_receipt_notice();

insert into public.luxor_invoices values
 ('10000000-0000-4000-8000-000000000001','issued'),
 ('10000000-0000-4000-8000-000000000002','cancelled');
insert into public.luxor_payments values
 ('20000000-0000-4000-8000-000000000001','paid'),
 ('20000000-0000-4000-8000-000000000002','corrected');

-- Valid invoice-linked work is retained; canceled invoices reject queued work
-- but permit cancellation/history updates. Malformed or dangling references fail.
insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
values ('30000000-0000-4000-8000-000000000001','invoice_notice','x@example.invalid','Invoice','test',
  '{"invoice_id":"10000000-0000-4000-8000-000000000001"}','queued');
do $$ begin
  begin
    insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
    values ('30000000-0000-4000-8000-000000000002','invoice_notice','x@example.invalid','Void','test',
      '{"invoice_id":"10000000-0000-4000-8000-000000000002"}','queued');
    raise exception 'expected void-invoice queue rejection';
  exception when check_violation then null; end;
  begin
    insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
    values ('30000000-0000-4000-8000-000000000003','invoice_notice','x@example.invalid','Malformed','test',
      '{"invoice_id":"bad"}','cancelled');
    raise exception 'expected malformed invoice reference rejection';
  exception when check_violation then null; end;
end $$;
insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
values ('30000000-0000-4000-8000-000000000004','invoice_notice','x@example.invalid','Void history','test',
  '{"invoice_id":"10000000-0000-4000-8000-000000000002"}','cancelled');

-- Receipt guard permits only an unchanged paid receipt identity while queued or
-- sending. Cancellation itself is allowed and the row remains history.
insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
values ('30000000-0000-4000-8000-000000000005','transactional_notice','x@example.invalid','Receipt','test',
  '{"transactionalNotice":{"kind":"payment_receipt","key":"payment_receipt/20000000-0000-4000-8000-000000000001"}}','queued');
do $$ begin
  begin
    insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
    values ('30000000-0000-4000-8000-000000000006','transactional_notice','x@example.invalid','Corrected','test',
      '{"transactionalNotice":{"kind":"payment_receipt","key":"payment_receipt/20000000-0000-4000-8000-000000000002"}}','queued');
    raise exception 'expected corrected-payment receipt rejection';
  exception when check_violation then null; end;
  begin
    insert into public.luxor_email_jobs(id,job_type,recipient_email,subject,body,metadata,status)
    values ('30000000-0000-4000-8000-000000000007','transactional_notice','x@example.invalid','Bad key','test',
      '{"transactionalNotice":{"kind":"payment_receipt","key":"wrong"}}','queued');
    raise exception 'expected malformed receipt key rejection';
  exception when check_violation then null; end;
end $$;
update public.luxor_email_jobs set status='cancelled' where id='30000000-0000-4000-8000-000000000005';
do $$ begin
  if not exists(select 1 from public.luxor_email_jobs where id='30000000-0000-4000-8000-000000000005' and status='cancelled') then
    raise exception 'receipt cancellation/history was not preserved'; end if;
end $$;

-- Existing production brochure stop trigger: prospect work ends atomically,
-- while unrelated transactional receipt work stays queued.
insert into public.luxor_inquiries(id,flow,email,marketing_opt_in)
values ('40000000-0000-4000-8000-000000000001','contact_form','lead@example.invalid',true);
insert into public.luxor_follow_up_enrollments(inquiry_id,automation_key,status)
values ('40000000-0000-4000-8000-000000000001','brochure_lead','active');
insert into public.luxor_follow_up_actions(enrollment_id,step_key,channel,scheduled_at,status)
select id,'email_2','email',now()+interval '1 day','scheduled'
from public.luxor_follow_up_enrollments where inquiry_id='40000000-0000-4000-8000-000000000001';
insert into public.luxor_email_jobs(id,inquiry_id,automation_enrollment_id,job_type,recipient_email,subject,body,status)
select '40000000-0000-4000-8000-000000000002',inquiry_id,id,'marketing_campaign','lead@example.invalid','Prospect','test','queued'
from public.luxor_follow_up_enrollments where inquiry_id='40000000-0000-4000-8000-000000000001';
insert into public.luxor_tasks(inquiry_id,title,description,status,automation_enrollment_id)
select inquiry_id,'Prospect follow-up','[follow-up:email_2]', 'pending',id
from public.luxor_follow_up_enrollments where inquiry_id='40000000-0000-4000-8000-000000000001';
insert into public.luxor_email_jobs(id,inquiry_id,job_type,recipient_email,subject,body,metadata,status)
values ('40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001',
  'transactional_notice','lead@example.invalid','Independent receipt','test',
  '{"transactionalNotice":{"kind":"payment_receipt","key":"payment_receipt/20000000-0000-4000-8000-000000000001"}}','queued');
update public.luxor_inquiries set follow_up_disposition='not_interested'
where id='40000000-0000-4000-8000-000000000001';
do $$ begin
  if not exists(select 1 from public.luxor_follow_up_enrollments where inquiry_id='40000000-0000-4000-8000-000000000001' and status='stopped' and ended_reason='not_interested') then
    raise exception 'brochure enrollment stop did not fire'; end if;
  if not exists(select 1 from public.luxor_follow_up_actions a join public.luxor_follow_up_enrollments e on e.id=a.enrollment_id
      where e.inquiry_id='40000000-0000-4000-8000-000000000001' and a.status='cancelled') then
    raise exception 'brochure action cancellation did not fire'; end if;
  if not exists(select 1 from public.luxor_email_jobs where id='40000000-0000-4000-8000-000000000002' and status='cancelled') then
    raise exception 'prospect queue item was not cancelled'; end if;
  if not exists(select 1 from public.luxor_tasks where inquiry_id='40000000-0000-4000-8000-000000000001' and status='cancelled') then
    raise exception 'brochure prospect task was not cancelled'; end if;
  if not exists(select 1 from public.luxor_email_jobs where id='40000000-0000-4000-8000-000000000003' and status='queued') then
    raise exception 'independent transactional receipt was changed'; end if;
end $$;

select 'PASS existing stop, receipt, and invoice guards';
