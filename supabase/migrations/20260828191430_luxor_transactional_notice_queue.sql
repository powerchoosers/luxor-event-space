-- Signed-agreement and paid-invoice notices retain exact private PDFs and use
-- the all-hours worker. Keep the existing claim RPC name for compatibility.
alter table public.luxor_email_jobs drop constraint luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review','calendar_invitation','inquiry_notification','transactional_notice'
));
create or replace function public.luxor_claim_inquiry_notification_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security invoker set search_path='' as $$
begin
  update public.luxor_email_jobs set status='failed',last_error='Transactional notification worker was interrupted; review delivery before retrying.',updated_at=now()
    where job_type in ('inquiry_notification','transactional_notice') and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where job_type in ('inquiry_notification','transactional_notice') and status='queued' and scheduled_for<=now()
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
    where job_type not in ('inquiry_notification','transactional_notice') and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where job_type not in ('inquiry_notification','transactional_notice') and status='queued' and scheduled_for<=now()
      and not exists(select 1 from public.luxor_email_jobs recent where recent.job_type not in ('inquiry_notification','transactional_notice')
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
