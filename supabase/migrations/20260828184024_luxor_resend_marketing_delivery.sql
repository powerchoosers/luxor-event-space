-- Delivery effects are private and transactional. Transport acceptance remains
-- distinct from recipient delivery; the existing job is never requeued here.
create or replace function public.luxor_marketing_job_result(p_job_id uuid, p_status text, p_error text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  recipient public.luxor_marketing_recipients%rowtype;
  mail public.luxor_mail_messages%rowtype;
  v_campaign_id uuid;
  result_status text := p_status;
  result_error text := left(p_error, 1000);
  queued_count bigint; sent_count bigint; failed_count bigint;
begin
  if p_status is null or p_status not in ('sent','failed','cancelled') then raise exception 'Invalid marketing result'; end if;
  select r.campaign_id into v_campaign_id from public.luxor_marketing_recipients r where r.email_job_id=p_job_id limit 1;
  if v_campaign_id is null then return; end if;
  -- Serialize campaign aggregation across workers, without the REST row cap.
  perform 1 from public.luxor_marketing_campaigns c where c.id=v_campaign_id for update;
  select r.* into recipient from public.luxor_marketing_recipients r where r.email_job_id=p_job_id for update;
  if not found then return; end if;
  select m.* into mail from public.luxor_mail_messages m
    where m.provider='resend' and m.direction='outgoing' and m.metadata->>'emailJobId'=p_job_id::text
      and lower(recipient.email)=any(m.to_addresses)
    order by m.created_at desc,m.id desc limit 1;
  if mail.id is not null then
    if mail.status in ('failed','bounced','suppressed') then
      result_status := 'failed'; result_error := 'Resend delivery: '||mail.status;
    elsif mail.accepted_at is not null then
      result_status := 'sent';
      result_error := case when mail.status='complained' then 'Recipient reported this message as spam.' else null end;
    end if;
  end if;
  update public.luxor_marketing_recipients r set status=result_status,
    sent_at=coalesce(r.sent_at,mail.accepted_at,case when result_status='sent' then now() end),
    last_error=result_error,updated_at=now(),
    metadata=r.metadata||case when mail.id is null then '{}'::jsonb else jsonb_build_object(
      'provider_delivery',jsonb_build_object('provider','resend','messageId',mail.id,'status',mail.status)) end
    where r.id=recipient.id;
  select count(*) filter(where r.status='queued'),count(*) filter(where r.status='sent'),count(*) filter(where r.status='failed')
    into queued_count,sent_count,failed_count from public.luxor_marketing_recipients r where r.campaign_id=v_campaign_id;
  update public.luxor_marketing_campaigns c set
    status=case when c.status='cancelled' then c.status when queued_count>0 then 'sending'
      when failed_count>0 and sent_count=0 then 'failed' when sent_count=0 then 'cancelled' else 'sent' end,
    sent_at=case when queued_count>0 then null when sent_count>0 then coalesce(c.sent_at,now()) else c.sent_at end,
    updated_at=now() where c.id=v_campaign_id;
end;
$$;
revoke all on function public.luxor_marketing_job_result(uuid,text,text) from public,anon,authenticated;
grant execute on function public.luxor_marketing_job_result(uuid,text,text) to service_role;

create or replace function public.luxor_resend_marketing_delivery(p_message_id uuid,p_event_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  mail public.luxor_mail_messages%rowtype;
  event public.luxor_resend_events%rowtype;
  target text; reason text; job_id uuid;
begin
  select * into mail from public.luxor_mail_messages where id=p_message_id and provider='resend' and direction='outgoing';
  select * into event from public.luxor_resend_events where event_id=p_event_id;
  if mail.id is null or event.event_id is null or mail.provider_id is distinct from event.provider_email_id then
    raise exception 'Delivery event is not linked to this outbox message';
  end if;
  -- All current Luxor sends have one recipient. Never infer who complained from
  -- an ambiguous future multi-recipient payload or suppress an unrelated address.
  if cardinality(mail.to_addresses)=1 then
    target := lower(mail.to_addresses[1]);
    if exists(select 1 from jsonb_array_elements_text(coalesce(event.payload->'data'->'to','[]'::jsonb)) t(value)
      where lower(btrim(case when t.value ~ '<[^<>]+>' then substring(t.value from '<([^<>]+)>') else t.value end))=target) then
      reason := case when event.event_type='email.complained' then 'spam_complaint'
        when event.event_type='email.suppressed' then 'provider_suppressed'
        when event.event_type='email.bounced' and coalesce(event.payload#>>'{data,bounce,type}','Permanent')='Permanent' then 'hard_bounce' end;
      if reason is not null then
        insert into public.luxor_marketing_suppressions(email,reason,source,metadata)
          values(target,reason,'resend_webhook',jsonb_build_object('eventId',p_event_id,'messageId',mail.id,'blockMarketingDelivery',true))
          on conflict(email) do update set metadata=luxor_marketing_suppressions.metadata||'{"blockMarketingDelivery":true}'::jsonb;
      end if;
    end if;
  end if;
  if mail.metadata->>'emailJobId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    job_id := (mail.metadata->>'emailJobId')::uuid;
    perform public.luxor_marketing_job_result(job_id,'sent',null);
  end if;
end;
$$;
revoke all on function public.luxor_resend_marketing_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_resend_marketing_delivery(uuid,text) to service_role;
