-- Opt-in at the server's public inquiry insert; no historical backfill and no
-- alerts for unrelated imports/manual SQL inserts. The alert and lead commit
-- together, so a terminated HTTP request cannot lose the notification.
alter table public.luxor_inquiries add column internal_notification_requested boolean not null default false;
alter table public.luxor_email_jobs drop constraint luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review','calendar_invitation','inquiry_notification'
));
create unique index luxor_inquiry_notification_recipient_unique on public.luxor_email_jobs(inquiry_id,lower(recipient_email))
  where job_type='inquiry_notification';

create function public.luxor_enqueue_inquiry_notifications() returns trigger
language plpgsql security invoker set search_path='' as $$
declare recipients text[]; recipient text; snapshot jsonb;
begin
  select array_agg(address order by address) into recipients from (
    select distinct lower(btrim(value)) as address from public.luxor_user_preferences p
    cross join lateral regexp_split_to_table(coalesce(p.notification_emails,''),',') value
    where length(btrim(value))<=254 and btrim(value) ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
  ) valid;
  recipients := coalesce(recipients,array['booking@luxoratlaspalmas.com']);
  snapshot := jsonb_build_object('id',new.id,'full_name',new.full_name,'email',new.email,'phone',new.phone,
    'event_type',new.event_type,'guest_count',new.guest_count,'budget',to_jsonb(new)->'budget','target_date',new.target_date,
    'message',new.message,'source',new.source,'flow',new.flow,'preferred_tour_date',new.preferred_tour_date,
    'preferred_tour_time',new.preferred_tour_time,'metadata',jsonb_build_object('chatMessages',new.metadata->'chatMessages'));
  foreach recipient in array recipients loop
    insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,scheduled_for,metadata)
      values(new.id,'inquiry_notification',recipient,
        '[New Lead] '||regexp_replace(new.full_name||' - '||coalesce(new.event_type,'Event Inquiry'),'[\r\n]+',' ','g'),
        'Internal inquiry notification awaiting rendering.',now(),
        jsonb_build_object('notificationVersion',1,'inquirySnapshot',snapshot,'sender_from','booking@luxoratlaspalmas.com','sender_name','Luxor Lead Alerts'))
      on conflict(inquiry_id,lower(recipient_email)) where job_type='inquiry_notification' do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.luxor_enqueue_inquiry_notifications() from public,anon,authenticated;
grant execute on function public.luxor_enqueue_inquiry_notifications() to service_role;
create trigger luxor_inquiry_notification_enqueue after insert on public.luxor_inquiries
  for each row when (new.internal_notification_requested) execute function public.luxor_enqueue_inquiry_notifications();

-- Internal notifications have their own all-hours claim. Interrupted delivery
-- is flagged for review, not blindly resent through a non-idempotent transport.
create function public.luxor_claim_inquiry_notification_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security invoker set search_path='' as $$
begin
  update public.luxor_email_jobs set status='failed',last_error='Internal alert worker was interrupted; review delivery before retrying.',updated_at=now()
    where job_type='inquiry_notification' and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where job_type='inquiry_notification' and status='queued' and scheduled_for<=now()
    order by scheduled_for,created_at,id for update skip locked limit greatest(1,least(coalesce(job_limit,1),3))
  ) update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
    from due where j.id=due.id returning j.*;
end;
$$;
revoke all on function public.luxor_claim_inquiry_notification_jobs(integer) from public,anon,authenticated;
grant execute on function public.luxor_claim_inquiry_notification_jobs(integer) to service_role;

-- Preserve existing customer-mail pacing/recovery, excluding the separately
-- claimed internal jobs from both the retry scan and the one-minute throttle.
create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security invoker set search_path='' as $$
begin
  job_limit := greatest(1,least(coalesce(job_limit,1),100));
  update public.luxor_email_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,
    scheduled_for=case when attempts>=3 then scheduled_for else now()+interval '5 minutes' end,
    last_error=case when attempts>=3 then coalesce(last_error,'Delivery worker stopped before completing the job.')
      else coalesce(last_error,'Delivery worker interrupted; automatically queued for retry.') end,updated_at=now()
    where job_type<>'inquiry_notification' and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where job_type<>'inquiry_notification' and status='queued' and scheduled_for<=now()
      and not exists(select 1 from public.luxor_email_jobs recent where recent.job_type<>'inquiry_notification'
        and recent.status in ('sending','sent') and coalesce(recent.sent_at,recent.updated_at)>now()-interval '60 seconds')
    order by scheduled_for,created_at,id for update skip locked limit job_limit
  ), claimed as (
    update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ) select * from claimed order by scheduled_for,created_at,id;
end;
$$;
revoke all on function public.luxor_claim_due_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.luxor_claim_due_email_jobs(integer) to service_role;
