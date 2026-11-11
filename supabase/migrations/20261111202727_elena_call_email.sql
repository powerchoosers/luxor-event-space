-- Add a narrow queued email type for caller-approved messages during a live call.
alter table public.luxor_email_jobs drop constraint if exists luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','installment_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review',
  'calendar_invitation','inquiry_notification','transactional_notice','test_notification','custom_workflow','elena_call_email'
));

create or replace function public.luxor_queue_elena_call_email(p_call_sid text, p_session_id text, p_nonce uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  c public.luxor_calls%rowtype;
  pending jsonb;
  capture jsonb;
  job_id uuid;
begin
  select * into c from public.luxor_calls where twilio_call_sid=p_call_sid for update;
  if not found or c.direction<>'inbound' or c.status not in ('ringing','in-progress')
    or c.to_number='+18176630380' or c.metadata->>'scope' is distinct from 'elena_live_inbound'
    or c.metadata->>'ingress_mode' is distinct from 'programmable_sip'
    or c.metadata->>'openai_session_id' is distinct from p_session_id
    or c.metadata->'accepted' is distinct from 'true'::jsonb
    or c.metadata->'sip_answered' is distinct from 'true'::jsonb
    or c.metadata->'rehearsal_only' is distinct from 'false'::jsonb
    or not exists(select 1 from public.luxor_phone_numbers n where n.phone_number=c.to_number and n.is_public) then
    raise exception 'Live email is not authorized' using errcode='42501';
  end if;
  if c.metadata->'email_receipts' ? p_nonce::text then
    return jsonb_build_object('queued',true,'duplicate',true,'job_id',c.metadata->'email_receipts'->p_nonce::text->>'job_id');
  end if;
  pending := c.metadata->'email_pending'; capture := c.metadata->'inbound_capture';
  if p_nonce is null or pending->>'nonce' is distinct from p_nonce::text
    or coalesce((pending->>'expires_at')::timestamptz,'-infinity'::timestamptz)<=now()
    or (pending->>'expires_at')::timestamptz>now()+interval '4 minutes'
    or capture->'confirmed' is distinct from 'true'::jsonb
    or capture->'matching_review_needed' is distinct from 'false'::jsonb
    or c.inquiry_id is null or capture->>'inquiry_id' is distinct from c.inquiry_id::text
    or pending->>'contact_nonce' is distinct from capture->>'nonce'
    or lower(pending->>'recipient') is distinct from lower(capture->>'email')
    or coalesce(length(btrim(pending->>'subject')),0) not between 1 and 150
    or pending->>'subject' ~ '[[:cntrl:]]'
    or coalesce(length(btrim(pending->>'body')),0) not between 1 and 2000 then
    raise exception 'A current caller-confirmed email readback is required' using errcode='22023';
  end if;
  if not exists(select 1 from public.luxor_inquiries i where i.id=c.inquiry_id and not coalesce(i.is_test,false)
    and i.archived_at is null and i.updated_at=(pending->>'inquiry_updated_at')::timestamptz
    and lower(btrim(i.email))=lower(pending->>'recipient')
    and lower(regexp_replace(btrim(i.full_name),'\s+',' ','g'))=lower(regexp_replace(btrim(capture->>'full_name'),'\s+',' ','g'))
    and public.luxor_workflow_normalize_phone(i.phone) is not null
    and public.luxor_workflow_normalize_phone(i.phone)=public.luxor_workflow_normalize_phone(capture->>'phone') for update) then
    raise exception 'The recipient needs review' using errcode='22023';
  end if;
  insert into public.luxor_email_jobs(inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata)
    values(c.inquiry_id,'elena_call_email','queued',lower(pending->>'recipient'),pending->>'subject',pending->>'body',now(),
      jsonb_build_object('elena_call_sid',p_call_sid,'elena_email_nonce',p_nonce::text,'caller_approved',true))
    returning id into job_id;
  update public.luxor_calls set metadata=(metadata-'email_pending') || jsonb_build_object('email_receipts',
    coalesce(metadata->'email_receipts','{}'::jsonb) || jsonb_build_object(p_nonce::text,
      jsonb_build_object('job_id',job_id,'recipient',lower(pending->>'recipient'),'subject',pending->>'subject','body',pending->>'body'))),
    updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=c.id;
  return jsonb_build_object('queued',true,'duplicate',false,'job_id',job_id);
end;
$$;
revoke all on function public.luxor_queue_elena_call_email(text,text,uuid) from public,anon,authenticated;
grant execute on function public.luxor_queue_elena_call_email(text,text,uuid) to service_role;
