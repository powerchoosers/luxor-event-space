-- Disposable fixtures, no provider calls, no committed messages or suppressions.
begin;
set local role service_role;
do $$
declare
  campaign uuid; job uuid; recipient uuid; mail uuid; other_mail uuid;
  key text := 'delivery-test-'||gen_random_uuid();
  target text := gen_random_uuid()||'@example.invalid';
  state jsonb; before_time timestamptz;
begin
  insert into public.luxor_marketing_campaigns(name,subject,html_body,status) values(key,'Offline','<p>Offline</p>','sending') returning id into campaign;
  insert into public.luxor_email_jobs(job_type,status,recipient_email,subject,body,scheduled_for)
    values('marketing_campaign','sending',target,'Offline','Offline',now()) returning id into job;
  insert into public.luxor_marketing_recipients(campaign_id,email_job_id,email,tracking_token)
    values(campaign,job,target,key) returning id into recipient;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,status,accepted_at,metadata)
    values('resend',key,'outgoing',key,'booking@luxoratlaspalmas.com',array[target],'Offline','bounced',now(),jsonb_build_object('emailJobId',job)) returning id into mail;
  insert into public.luxor_resend_events(event_id,event_type,provider_email_id,payload)
    values(key,'email.bounced',key,jsonb_build_object('type','email.bounced','data',jsonb_build_object('to',array[target],'bounce',jsonb_build_object('type','Permanent'))));
  perform public.luxor_resend_marketing_delivery(mail,key);
  select to_jsonb(r) into state from public.luxor_marketing_recipients r where id=recipient;
  if state->>'status'<>'failed' or state#>>'{metadata,provider_delivery,status}'<>'bounced' or state->>'sent_at' is null then raise exception 'Bounce did not reconcile campaign'; end if;
  if not exists(select 1 from public.luxor_marketing_suppressions where email=target and reason='hard_bounce' and metadata->>'blockMarketingDelivery'='true') then raise exception 'Hard bounce not suppressed'; end if;
  if (select status from public.luxor_email_jobs where id=job)<>'sending' then raise exception 'Webhook altered transport job'; end if;
  before_time := (state->>'sent_at')::timestamptz;
  perform public.luxor_resend_marketing_delivery(mail,key);
  perform public.luxor_marketing_job_result(job,'sent',null);
  if (select status from public.luxor_marketing_recipients where id=recipient)<>'failed' then raise exception 'Late acceptance overwrote bounce'; end if;
  if (select sent_at from public.luxor_marketing_recipients where id=recipient) is distinct from before_time then raise exception 'Replay reset send time'; end if;
  if (select count(*) from public.luxor_marketing_suppressions where email=target)<>1 then raise exception 'Replay duplicated suppression'; end if;
  if (select status from public.luxor_marketing_campaigns where id=campaign)<>'failed' then raise exception 'Failed campaign not updated'; end if;
  -- Preserve existing opt-out evidence while adding a non-bypassable provider block.
  update public.luxor_marketing_suppressions set reason='unsubscribe',source='marketing_email',metadata='{"original":true}' where email=target;
  update public.luxor_mail_messages set status='complained' where id=mail;
  update public.luxor_resend_events set event_type='email.complained' where event_id=key;
  perform public.luxor_resend_marketing_delivery(mail,key);
  if not exists(select 1 from public.luxor_marketing_suppressions where email=target and reason='unsubscribe' and source='marketing_email' and metadata->>'original'='true' and metadata->>'blockMarketingDelivery'='true') then raise exception 'Complaint destroyed opt-out evidence'; end if;
  if not exists(select 1 from public.luxor_marketing_recipients where id=recipient and status='sent' and last_error like '%spam%') then raise exception 'Complaint incorrectly counted as not delivered'; end if;
  -- Superseded delayed events use current canonical status, not event order.
  update public.luxor_resend_events set event_type='email.sent' where event_id=key;
  perform public.luxor_resend_marketing_delivery(mail,key);
  if (select metadata#>>'{provider_delivery,status}' from public.luxor_marketing_recipients where id=recipient)<>'complained' then raise exception 'Stale event regressed status'; end if;
  -- A different recipient in a valid provider payload must not poison a contact.
  delete from public.luxor_marketing_suppressions where email=target;
  update public.luxor_resend_events set event_type='email.complained',payload=jsonb_build_object('data',jsonb_build_object('to',array['other@example.invalid'])) where event_id=key;
  perform public.luxor_resend_marketing_delivery(mail,key);
  if exists(select 1 from public.luxor_marketing_suppressions where email=target) then raise exception 'Mismatched recipient suppressed'; end if;
  -- A transient bounce is not a permanent suppression.
  update public.luxor_resend_events set event_type='email.bounced',payload=jsonb_build_object('data',jsonb_build_object('to',array[target],'bounce',jsonb_build_object('type','Transient'))) where event_id=key;
  perform public.luxor_resend_marketing_delivery(mail,key);
  if exists(select 1 from public.luxor_marketing_suppressions where email=target) then raise exception 'Transient bounce permanently suppressed'; end if;
  update public.luxor_resend_events set event_type='email.suppressed' where event_id=key;
  perform public.luxor_resend_marketing_delivery(mail,key);
  if not exists(select 1 from public.luxor_marketing_suppressions where email=target and reason='provider_suppressed') then raise exception 'Provider suppression missing'; end if;
  -- Never associate an event with an unrelated provider id, including manual mail.
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,status)
    values('resend',key||'-other','outgoing',key,'booking@luxoratlaspalmas.com',array[target],'Offline','sent') returning id into other_mail;
  begin
    perform public.luxor_resend_marketing_delivery(other_mail,key);
    raise exception 'Expected mismatched provider rejection';
  exception when others then
    if sqlerrm not like 'Delivery event is not linked%' then raise; end if;
  end;
  -- Whole-campaign counts must include queued recipients beyond REST's 1000 rows.
  insert into public.luxor_marketing_recipients(campaign_id,email,tracking_token,status)
    select campaign,target,key||'-'||n,case when n=1105 then 'queued' else 'sent' end from generate_series(1,1105) n;
  perform public.luxor_marketing_job_result(job,'sent',null);
  if (select status from public.luxor_marketing_campaigns where id=campaign)<>'sending' then raise exception 'Campaign aggregation truncated'; end if;
  update public.luxor_marketing_campaigns set status='cancelled' where id=campaign;
  perform public.luxor_marketing_job_result(job,'sent',null);
  if (select status from public.luxor_marketing_campaigns where id=campaign)<>'cancelled' then raise exception 'Late webhook reopened cancelled campaign'; end if;
  if has_function_privilege('anon','public.luxor_resend_marketing_delivery(uuid,text)','execute') or
     has_function_privilege('authenticated','public.luxor_marketing_job_result(uuid,text,text)','execute') then raise exception 'Public delivery mutation'; end if;
end;
$$;
select 'PASS campaign delivery, retries, opt-out preservation, recipient isolation, 1106-recipient aggregates and private RPC grants' as result;
rollback;
