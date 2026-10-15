-- Safe, idempotent resend of immutable lead-linked email job snapshots.
-- This migration is intentionally authored locally and must be reviewed before
-- applying to production. Tour confirmations continue to use their existing
-- calendar revision workflow; agreements and payment documents remain guarded
-- by their dedicated delivery engines.
do $$
begin
  if exists(select 1 from public.luxor_email_jobs
    where metadata->>'corrected_email_resend_request_id' is not null
    group by metadata->>'corrected_email_resend_request_id' having count(*)>1) then
    raise exception 'Duplicate corrected email resend request IDs exist; resolve them before applying this migration';
  end if;
  if exists(select 1 from public.luxor_email_jobs
    where metadata->>'corrected_email_resend_request_id' is not null
    group by metadata->>'corrected_email_resend_source_id',metadata->>'corrected_email_resend_expected_recipient'
    having count(*)>1) then
    raise exception 'Duplicate corrected email resend source/recipient pairs exist; resolve them before applying this migration';
  end if;
end;
$$;
create unique index if not exists luxor_email_jobs_corrected_resend_request_uidx
  on public.luxor_email_jobs ((metadata->>'corrected_email_resend_request_id'))
  where metadata->>'corrected_email_resend_request_id' is not null;
create unique index if not exists luxor_email_jobs_corrected_resend_source_recipient_uidx
  on public.luxor_email_jobs ((metadata->>'corrected_email_resend_source_id'), (metadata->>'corrected_email_resend_expected_recipient'))
  where metadata->>'corrected_email_resend_request_id' is not null;

-- Address edits and ordinary job claims serialize on the queued job row.
-- Correct only never-attempted messages and preserve their schedule, payload,
-- enrollment, and step. A claimed or previously attempted delivery blocks the
-- correction so an uncertain provider outcome is never silently retargeted.
create or replace function public.luxor_retarget_unattempted_inquiry_email_jobs()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  job public.luxor_email_jobs%rowtype;
begin
  if lower(btrim(coalesce(old.email,''))) is not distinct from lower(btrim(coalesce(new.email,''))) then
    return new;
  end if;

  for job in select * from public.luxor_email_jobs
    where inquiry_id=old.id and lower(recipient_email)=lower(btrim(old.email))
      and status in ('queued','sending')
      and metadata->>'corrected_email_resend_request_id' is not null
    for update
  loop
    raise exception 'A corrected email resend is already queued or sending; wait for its result before changing the address';
  end loop;

  for job in select * from public.luxor_email_jobs
    where inquiry_id=old.id and lower(recipient_email)=lower(btrim(old.email))
      and status in ('queued','sending')
      and job_type='marketing_campaign'
      and not coalesce(old.is_test,false) and not coalesce(new.is_test,false)
      and new.status<>'closed_lost' and new.pipeline_stage is distinct from 'closed_lost'
      and new.status in ('new','contacted','tour_requested','tour_confirmed')
      and coalesce(new.pipeline_stage,'inquiry') in ('newsletter','inquiry','tour')
      and new.marketing_opt_in is true and metadata->>'automation_key'='brochure_lead'
      and automation_enrollment_id is not null and automation_step_key is not null
    order by id for update
  loop
    if job.status='sending' then
      raise exception 'A lead email is already sending; retry the address edit after it finishes';
    elsif coalesce(job.attempts,0)>0 then
      raise exception 'A queued lead email has an uncertain prior attempt; resolve its delivery before changing the address';
    elsif job.scheduled_for<=now() then
      raise exception 'A brochure follow-up is due to send; retry the address edit after the worker finishes';
    end if;
    update public.luxor_email_jobs set recipient_email=lower(btrim(new.email)),updated_at=now()
      where id=job.id and status='queued' and attempts=0;
    if not found then raise exception 'A lead email started sending; refresh and retry the address edit'; end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists luxor_inquiry_retarget_unattempted_email_jobs on public.luxor_inquiries;
create trigger luxor_inquiry_retarget_unattempted_email_jobs
  before update of email on public.luxor_inquiries
  for each row execute function public.luxor_retarget_unattempted_inquiry_email_jobs();
revoke all on function public.luxor_retarget_unattempted_inquiry_email_jobs() from public,anon,authenticated;
grant execute on function public.luxor_retarget_unattempted_inquiry_email_jobs() to service_role;

create or replace function public.luxor_prepare_corrected_email_resend(
  p_inquiry_id uuid,
  p_source_job_id uuid,
  p_expected_recipient text,
  p_request_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  source_job public.luxor_email_jobs%rowtype;
  resend_job public.luxor_email_jobs%rowtype;
  old_recipient text := lower(btrim(coalesce(p_expected_recipient,'')));
  request_id text := coalesce(p_request_id,'');
begin
  if p_inquiry_id is null or p_source_job_id is null
    or request_id !~ '^[A-Za-z0-9_-]{16,128}$'
    or old_recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then
    raise exception 'Invalid resend request';
  end if;

  -- Match the email-correction transaction's inquiry-first lock order. The
  -- source job lock serializes the UI resend against provider delivery status.
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if coalesce(inquiry.is_test,false) or inquiry.status='closed_lost' or inquiry.pipeline_stage='closed_lost'
    or lower(btrim(coalesce(inquiry.email,''))) !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' then
    raise exception 'Save a corrected email address on an active lead before resending';
  end if;

  select * into source_job from public.luxor_email_jobs
    where id=p_source_job_id and inquiry_id=p_inquiry_id for update;
  if not found then raise exception 'The original email is not linked to this lead'; end if;
  if lower(btrim(source_job.recipient_email))<>old_recipient
    or lower(btrim(source_job.recipient_email))=lower(btrim(inquiry.email)) then
    raise exception 'The selected message is not from the corrected address';
  end if;

  select * into resend_job from public.luxor_email_jobs
    where metadata->>'corrected_email_resend_request_id'=request_id for update;
  if found then
    if resend_job.inquiry_id<>p_inquiry_id
      or resend_job.metadata->>'corrected_email_resend_source_id'<>p_source_job_id::text
      or lower(resend_job.recipient_email)<>lower(inquiry.email) then
      raise exception 'Resend request ID was reused with different values';
    end if;
    return jsonb_build_object('job',to_jsonb(resend_job),'replayed',true);
  end if;
  select * into resend_job from public.luxor_email_jobs
    where metadata->>'corrected_email_resend_source_id'=p_source_job_id::text
      and metadata->>'corrected_email_resend_expected_recipient'=lower(inquiry.email)
      and metadata->>'corrected_email_resend_request_id' is not null
    for update;
  if found then return jsonb_build_object('job',to_jsonb(resend_job),'replayed',true); end if;

  -- Only immutable, ordinary transactional snapshots may use this worker path.
  -- Calendar invitations, contract/signature messages, payment and proposal
  -- messages have specialized state, attachment, or signer guards.
  if source_job.status<>'sent' or source_job.sent_at is null
    or source_job.attempts<1
    or source_job.job_type not in ('booking_package','post_event_follow_up','layout_review')
    or source_job.automation_enrollment_id is not null or source_job.automation_step_key is not null
    or source_job.signature_request_id is not null
    or source_job.calendar_revision_id is not null or source_job.tour_revision_id is not null
    or source_job.metadata->>'hasAttachments'='true'
    or coalesce(source_job.metadata->>'delivery','') in ('calendar_invitation','agreement','proposal','payment_link') then
    raise exception 'This message must be resent through its dedicated delivery flow';
  end if;
  if source_job.job_type='post_event_follow_up' and (source_job.booking_id is null or not exists (
    select 1 from public.luxor_bookings b where b.id=source_job.booking_id and b.inquiry_id=p_inquiry_id and b.status='completed'
  )) then raise exception 'The event must be completed before its follow-up can be resent'; end if;
  if source_job.job_type='booking_package' and not (
    inquiry.status in ('new','contacted','tour_requested','tour_confirmed')
    and coalesce(inquiry.pipeline_stage,'inquiry') in ('newsletter','inquiry','tour')
  ) then raise exception 'The lead has moved beyond the brochure resend stage'; end if;
  if source_job.job_type='post_event_follow_up' and not (
    inquiry.status='booked' and inquiry.pipeline_stage in ('event','closing')
  ) then raise exception 'The lead is no longer in the completed-event follow-up stage'; end if;
  if source_job.job_type='layout_review' and (
    coalesce(source_job.metadata->>'layout_review_id','') !~* '^[0-9a-f-]{36}$'
    or not exists(select 1 from public.luxor_layout_reviews r
      where r.id::text=source_job.metadata->>'layout_review_id' and r.inquiry_id=p_inquiry_id
        and r.status='open' and r.revoked_at is null and r.expires_at>now())
    or inquiry.status<>'booked' or inquiry.pipeline_stage not in ('planning','event')
  ) then raise exception 'The layout review is no longer open or its planning stage has changed'; end if;

  -- A successful later delivery to the corrected recipient supersedes older
  -- bounced snapshots. Prevent duplicate resends once the same content reached
  -- the current address successfully.
  if exists(select 1 from public.luxor_email_jobs j
    where j.inquiry_id=p_inquiry_id and j.status='sent'
      and lower(j.recipient_email)=lower(inquiry.email)
      and j.metadata->>'corrected_email_resend_source_id'=source_job.id::text) then
    raise exception 'This message was already resent successfully to the corrected address';
  end if;

  insert into public.luxor_email_jobs(
    inquiry_id,booking_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata
  ) values (
    p_inquiry_id,source_job.booking_id,source_job.job_type,'queued',lower(inquiry.email),source_job.subject,source_job.body,now(),
    (coalesce(source_job.metadata,'{}'::jsonb)-'automation_key'-'campaign_id'-'marketing_recipient_id')
      || jsonb_build_object(
        'corrected_email_resend_request_id',request_id,
        'corrected_email_resend_source_id',source_job.id,
        'corrected_email_resend_source_recipient',source_job.recipient_email,
        'corrected_email_resend_expected_recipient',lower(inquiry.email),
        'corrected_email_resend_snapshot_subject',source_job.subject,
        'corrected_email_resend_snapshot_body',source_job.body,
        'corrected_email_resend_layout_review_id',case when source_job.job_type='layout_review' then source_job.metadata->>'layout_review_id' else null end,
        'corrected_email_resend_confirmed_at',now())
  ) returning * into resend_job;
  return jsonb_build_object('job',to_jsonb(resend_job),'replayed',false);
end;
$$;

create or replace function public.luxor_validate_corrected_email_resend(
  p_inquiry_id uuid, p_job_id uuid, p_action text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  job public.luxor_email_jobs%rowtype;
  source_job public.luxor_email_jobs%rowtype;
  eligible boolean := false;
  claimed boolean := false;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Lead not found'; end if;
  select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
  if not found or job.metadata->>'corrected_email_resend_request_id' is null then
    raise exception 'Resend request is unavailable';
  end if;
  if job.status='sent' and job.sent_at is not null then
    return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',false,'completed',true);
  end if;
  if coalesce(inquiry.is_test,false) or inquiry.status='closed_lost' or inquiry.pipeline_stage='closed_lost'
    or lower(btrim(coalesce(inquiry.email,'')))<>lower(job.recipient_email)
    or job.subject is distinct from job.metadata->>'corrected_email_resend_snapshot_subject'
    or job.body is distinct from job.metadata->>'corrected_email_resend_snapshot_body'
    or job.job_type not in ('booking_package','post_event_follow_up','layout_review')
    or job.metadata->>'hasAttachments'='true' then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Lead, recipient, or saved message changed before delivery.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'Lead or saved message changed; refresh before resending';
  end if;
  if job.job_type='booking_package' and not (
    inquiry.status in ('new','contacted','tour_requested','tour_confirmed')
    and coalesce(inquiry.pipeline_stage,'inquiry') in ('newsletter','inquiry','tour')
  ) then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Lead stage changed before brochure resend delivery.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'The lead has moved beyond the brochure resend stage';
  end if;
  if job.job_type='post_event_follow_up' and not (
    inquiry.status='booked' and inquiry.pipeline_stage in ('event','closing')
    and exists(select 1 from public.luxor_bookings b where b.id=job.booking_id and b.inquiry_id=p_inquiry_id and b.status='completed')
  ) then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Completed-event follow-up is no longer eligible for resend delivery.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'The completed-event follow-up is no longer eligible';
  end if;
  if job.job_type='layout_review' and (
    coalesce(job.metadata->>'layout_review_id','') !~* '^[0-9a-f-]{36}$'
    or not exists(select 1 from public.luxor_layout_reviews r
      where r.id::text=job.metadata->>'layout_review_id' and r.inquiry_id=p_inquiry_id
        and r.status='open' and r.revoked_at is null and r.expires_at>now())
    or inquiry.status<>'booked' or inquiry.pipeline_stage not in ('planning','event')
    or job.metadata->>'corrected_email_resend_layout_review_id' is distinct from job.metadata->>'layout_review_id'
  ) then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Layout review is no longer open or its planning stage changed.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'The layout review is no longer open or its planning stage has changed';
  end if;
  select * into source_job from public.luxor_email_jobs
    where id=(job.metadata->>'corrected_email_resend_source_id')::uuid for update;
  eligible := found and source_job.inquiry_id=p_inquiry_id and source_job.status='sent'
    and source_job.sent_at is not null and source_job.subject=job.subject and source_job.body=job.body
    and source_job.job_type=job.job_type
    and (job.job_type<>'layout_review' or source_job.metadata->>'layout_review_id'=job.metadata->>'corrected_email_resend_layout_review_id')
    and lower(source_job.recipient_email)=lower(job.metadata->>'corrected_email_resend_source_recipient');
  if eligible and source_job.job_type='post_event_follow_up' then
    eligible := source_job.booking_id is not null and exists (
      select 1 from public.luxor_bookings b where b.id=source_job.booking_id and b.inquiry_id=p_inquiry_id and b.status='completed'
    );
  end if;
  if not eligible then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Original message is no longer eligible for resend.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'Original message is no longer eligible for resend';
  end if;
  if p_action='claim' then
    if job.status<>'queued' then return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',false,'completed',false); end if;
    update public.luxor_email_jobs set status='sending',attempts=attempts+1,updated_at=now()
      where id=job.id and status='queued' returning * into job;
    claimed:=found;
  elsif p_action='worker' then
    claimed := job.status='sending';
  else
    raise exception 'Invalid resend validation action';
  end if;
  return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',claimed,'completed',false);
end;
$$;

create or replace function public.luxor_claim_corrected_email_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin return public.luxor_validate_corrected_email_resend(p_inquiry_id,p_job_id,'claim'); end;
$$;

create or replace function public.luxor_check_corrected_email_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin return public.luxor_validate_corrected_email_resend(p_inquiry_id,p_job_id,'worker'); end;
$$;

revoke all on function public.luxor_prepare_corrected_email_resend(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.luxor_validate_corrected_email_resend(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_claim_corrected_email_resend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_check_corrected_email_resend(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_prepare_corrected_email_resend(uuid,uuid,text,text) to service_role;
grant execute on function public.luxor_validate_corrected_email_resend(uuid,uuid,text) to service_role;
grant execute on function public.luxor_claim_corrected_email_resend(uuid,uuid) to service_role;
grant execute on function public.luxor_check_corrected_email_resend(uuid,uuid) to service_role;

notify pgrst, 'reload schema';

-- Payment-link corrections are reserved once per invoice and corrected
-- recipient, then run through the normal durable email worker. The worker
-- rechecks the signed booking and outstanding balance under row locks.
create unique index if not exists luxor_email_jobs_corrected_payment_resend_uidx
  on public.luxor_email_jobs ((metadata->>'corrected_payment_resend_key'))
  where metadata->>'corrected_payment_resend_key' is not null;

create or replace function public.luxor_prepare_corrected_payment_email_resend(
  p_inquiry_id uuid,p_source_job_id uuid,p_invoice_id uuid,p_expected_recipient text,p_subject text,p_body text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype; source_job public.luxor_email_jobs%rowtype;
  invoice public.luxor_invoices%rowtype; booking public.luxor_bookings%rowtype;
  resend_job public.luxor_email_jobs%rowtype; target_email text:=lower(btrim(coalesce(p_expected_recipient,'')));
  resend_key text;
begin
  if p_inquiry_id is null or p_source_job_id is null or p_invoice_id is null
    or target_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or coalesce(p_subject,'')='' or coalesce(p_body,'')='' then raise exception 'Invalid payment resend request'; end if;
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found or coalesce(inquiry.is_test,false) or inquiry.status<>'booked'
    or inquiry.pipeline_stage not in ('deposit','final_payment','planning','event','closing')
    or lower(btrim(coalesce(inquiry.email,'')))<>target_email then raise exception 'Lead changed or is outside the payment resend stage'; end if;
  select * into source_job from public.luxor_email_jobs where id=p_source_job_id and inquiry_id=p_inquiry_id for update;
  select * into invoice from public.luxor_invoices where id=p_invoice_id and inquiry_id=p_inquiry_id for update;
  if not found or source_job.status<>'sent' or source_job.sent_at is null or source_job.booking_id is null
    or source_job.recipient_email is null or lower(source_job.recipient_email)=target_email
    or source_job.job_type not in ('unpaid_invoice_reminder','final_payment_reminder','final_payment_request')
    or invoice.booking_id<>source_job.booking_id or invoice.invoice_kind not in ('deposit','final_balance','security_deposit')
    or invoice.status in ('cancelled','paid') or invoice.status is null
    or (source_job.job_type='final_payment_reminder' and invoice.invoice_kind<>'final_balance')
    or (source_job.job_type='unpaid_invoice_reminder' and invoice.invoice_kind='final_balance') then
    raise exception 'The original payment reminder no longer matches this invoice';
  end if;
  select * into booking from public.luxor_bookings where id=invoice.booking_id and inquiry_id=p_inquiry_id for update;
  if not found or booking.contract_status<>'signed' or coalesce(invoice.due_date,booking.final_payment_due_date) is null
    or (select coalesce(sum(amount),0) from public.luxor_payments where invoice_id=invoice.id and status='paid')>=invoice.total then
    raise exception 'The signed booking, due date, or balance changed before the payment resend';
  end if;
  resend_key:=invoice.id::text||'/'||encode(convert_to(target_email,'UTF8'),'base64');
  select * into resend_job from public.luxor_email_jobs where metadata->>'corrected_payment_resend_key'=resend_key for update;
  if found then
    if resend_job.inquiry_id<>p_inquiry_id or resend_job.metadata->>'corrected_payment_resend_source_id'<>source_job.id::text
      or lower(resend_job.recipient_email)<>target_email or resend_job.metadata->>'corrected_payment_resend_invoice_id'<>invoice.id::text then
      raise exception 'Payment resend key was reused with different values';
    end if;
    return jsonb_build_object('job',to_jsonb(resend_job),'replayed',true);
  end if;
  insert into public.luxor_email_jobs(inquiry_id,booking_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata)
  values(p_inquiry_id,booking.id,source_job.job_type,'queued',target_email,p_subject,p_body,now(),jsonb_build_object(
    'manual',true,'corrected_payment_resend_key',resend_key,'corrected_payment_resend_source_id',source_job.id,
    'corrected_payment_resend_invoice_id',invoice.id,'corrected_payment_resend_source_recipient',source_job.recipient_email,
    'corrected_payment_resend_expected_recipient',target_email,'corrected_payment_resend_snapshot_subject',p_subject,
    'corrected_payment_resend_snapshot_body',p_body,'corrected_payment_resend_confirmed_at',now())) returning * into resend_job;
  return jsonb_build_object('job',to_jsonb(resend_job),'replayed',false);
end;
$$;

create or replace function public.luxor_validate_corrected_payment_resend(p_inquiry_id uuid,p_job_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype; job public.luxor_email_jobs%rowtype;
  source_job public.luxor_email_jobs%rowtype; invoice public.luxor_invoices%rowtype;
  booking public.luxor_bookings%rowtype; eligible boolean:=false; claimed boolean:=false;
  invoice_id_text text;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Lead not found'; end if;
  select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
  if not found or job.metadata->>'corrected_payment_resend_key' is null then raise exception 'Payment resend is unavailable'; end if;
  if job.status='sent' and job.sent_at is not null then
    return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',false,'completed',true);
  end if;
  invoice_id_text:=job.metadata->>'corrected_payment_resend_invoice_id';
  if coalesce(invoice_id_text,'') !~* '^[0-9a-f-]{36}$' then eligible:=false;
  else
    select * into source_job from public.luxor_email_jobs where id=(job.metadata->>'corrected_payment_resend_source_id')::uuid for update;
    select * into invoice from public.luxor_invoices where id=invoice_id_text::uuid and inquiry_id=p_inquiry_id for update;
    if found and invoice.booking_id is not null then
      select * into booking from public.luxor_bookings where id=invoice.booking_id and inquiry_id=p_inquiry_id for update;
    end if;
    eligible:=found and coalesce(inquiry.is_test,false)=false and inquiry.status='booked'
      and inquiry.pipeline_stage in ('deposit','final_payment','planning','event','closing')
      and lower(btrim(coalesce(inquiry.email,'')))=lower(job.recipient_email)
      and job.subject is not distinct from job.metadata->>'corrected_payment_resend_snapshot_subject'
      and job.body is not distinct from job.metadata->>'corrected_payment_resend_snapshot_body'
      and source_job.id is not null and source_job.inquiry_id=p_inquiry_id and source_job.status='sent'
      and source_job.sent_at is not null and source_job.booking_id=invoice.booking_id
      and source_job.job_type=job.job_type and source_job.job_type in ('unpaid_invoice_reminder','final_payment_reminder','final_payment_request')
      and lower(source_job.recipient_email)=lower(job.metadata->>'corrected_payment_resend_source_recipient')
      and lower(source_job.recipient_email)<>lower(job.recipient_email)
      and invoice.invoice_kind in ('deposit','final_balance','security_deposit') and invoice.status not in ('cancelled','paid')
      and (source_job.job_type<>'final_payment_reminder' or invoice.invoice_kind='final_balance')
      and (source_job.job_type<>'unpaid_invoice_reminder' or invoice.invoice_kind<>'final_balance')
      and booking.id is not null and booking.contract_status='signed'
      and coalesce(invoice.due_date,booking.final_payment_due_date) is not null
      and (select coalesce(sum(amount),0) from public.luxor_payments where invoice_id=invoice.id and status='paid')<invoice.total;
  end if;
  if not eligible then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Lead, invoice, signer status, recipient, or balance changed before payment delivery.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'eligible',false,'claimed',false,'completed',false);
    end if;
    raise exception 'Lead, invoice, or payment state changed; refresh before resending';
  end if;
  if p_action='claim' then
    if job.status<>'queued' then return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',false,'completed',false); end if;
    update public.luxor_email_jobs set status='sending',attempts=attempts+1,updated_at=now()
      where id=job.id and status='queued' returning * into job;
    claimed:=found;
  elsif p_action='worker' then claimed:=job.status='sending';
  else raise exception 'Invalid payment resend action'; end if;
  return jsonb_build_object('job',to_jsonb(job),'eligible',true,'claimed',claimed,'completed',false);
end;
$$;

create or replace function public.luxor_claim_corrected_payment_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin return public.luxor_validate_corrected_payment_resend(p_inquiry_id,p_job_id,'claim'); end;
$$;
create or replace function public.luxor_check_corrected_payment_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin return public.luxor_validate_corrected_payment_resend(p_inquiry_id,p_job_id,'worker'); end;
$$;

revoke all on function public.luxor_prepare_corrected_payment_email_resend(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_validate_corrected_payment_resend(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_claim_corrected_payment_resend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_check_corrected_payment_resend(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_prepare_corrected_payment_email_resend(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.luxor_validate_corrected_payment_resend(uuid,uuid,text) to service_role;
grant execute on function public.luxor_claim_corrected_payment_resend(uuid,uuid) to service_role;
grant execute on function public.luxor_check_corrected_payment_resend(uuid,uuid) to service_role;

notify pgrst, 'reload schema';

-- Keep the calendar delivery worker and portal confirmation on the same live
-- lead-stage rule as the shared correction dialog. These wrappers lock the
-- inquiry before invoking the existing calendar/revision safeguards.
create or replace function public.luxor_confirm_prepared_tour_email_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare inquiry public.luxor_inquiries%rowtype; result jsonb;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found or coalesce(inquiry.is_test,false) or inquiry.status not in ('new','contacted','tour_requested','tour_confirmed')
    or coalesce(inquiry.pipeline_stage,'inquiry') not in ('newsletter','inquiry','tour') then
    raise exception 'Lead has moved beyond the tour-email resend stage';
  end if;
  result:=public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'confirm');
  return result->'job';
end;
$$;

create or replace function public.luxor_claim_prepared_tour_email_resend_delivery(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare inquiry public.luxor_inquiries%rowtype; result jsonb; job public.luxor_email_jobs%rowtype;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if coalesce(inquiry.is_test,false) or inquiry.status not in ('new','contacted','tour_requested','tour_confirmed')
    or coalesce(inquiry.pipeline_stage,'inquiry') not in ('newsletter','inquiry','tour') then
    select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
    if found and job.status='queued' then
      update public.luxor_email_jobs set status='cancelled',last_error='Lead stage changed before tour resend delivery.',updated_at=now()
        where id=job.id returning * into job;
    end if;
    return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',false,'completed',false);
  end if;
  result:=public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'claim');
  return result;
end;
$$;

create or replace function public.luxor_check_prepared_tour_email_resend_delivery(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare inquiry public.luxor_inquiries%rowtype; job public.luxor_email_jobs%rowtype;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if coalesce(inquiry.is_test,false) or inquiry.status not in ('new','contacted','tour_requested','tour_confirmed')
    or coalesce(inquiry.pipeline_stage,'inquiry') not in ('newsletter','inquiry','tour') then
    select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
    if found and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Lead stage changed before tour resend delivery.',updated_at=now()
        where id=job.id returning * into job;
    end if;
    return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',false,'completed',false);
  end if;
  return public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'worker');
end;
$$;

revoke all on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_claim_prepared_tour_email_resend_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_check_prepared_tour_email_resend_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) to service_role;
grant execute on function public.luxor_claim_prepared_tour_email_resend_delivery(uuid,uuid) to service_role;
grant execute on function public.luxor_check_prepared_tour_email_resend_delivery(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
