-- Retarget future, never-attempted lead lifecycle sequence email jobs after email correction.
-- Recipient only: preserve schedule, content, enrollment, step, and audit history.
-- Tour calendar reminders are retargeted by luxor_update_inquiry_email_for_portal.
-- Proposals, agreements, payments, and one-time recipient-bound notices are excluded.

create or replace function public.luxor_retarget_unattempted_inquiry_email_jobs()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  job public.luxor_email_jobs%rowtype;
  pre_booking_lead boolean;
begin
  if lower(btrim(coalesce(old.email,''))) is not distinct from lower(btrim(coalesce(new.email,''))) then
    return new;
  end if;

  pre_booking_lead := not coalesce(old.is_test,false) and not coalesce(new.is_test,false)
    and new.status in ('new','contacted','tour_requested','tour_confirmed')
    and coalesce(new.pipeline_stage,'inquiry') in ('newsletter','inquiry','tour')
    and new.status<>'closed_lost' and new.pipeline_stage is distinct from 'closed_lost';

  -- A prepared manual corrected-address resend has an explicit, immutable
  -- destination. Do not silently alter it during a later address correction.
  for job in select * from public.luxor_email_jobs
    where inquiry_id=old.id and lower(recipient_email)=lower(btrim(old.email))
      and status in ('queued','sending')
      and metadata->>'corrected_email_resend_request_id' is not null
    for update
  loop
    raise exception 'A corrected email resend is already queued or sending; wait for its result before changing the address';
  end loop;

  for job in select * from public.luxor_email_jobs j
    where j.inquiry_id=old.id and lower(j.recipient_email)=lower(btrim(old.email))
      and j.status='queued' and coalesce(j.attempts,0)=0 and j.scheduled_for>now()
      and (
        -- Consented brochure sequence; keep its existing enrollment and step.
        (pre_booking_lead and new.marketing_opt_in is true
          and j.job_type='marketing_campaign'
          and j.metadata->>'automation_key'='brochure_lead'
          and j.automation_enrollment_id is not null and j.automation_step_key is not null)
        -- Planning-generated event reminders, only while the same dated booking
        -- is active and the lead remains in a planning/event stage.
        or (not coalesce(new.is_test,false) and new.status='booked'
          and new.pipeline_stage in ('planning','final_payment','event')
          and j.job_type in ('event_details_reminder','event_day_reminder')
          and j.booking_id is not null
          and j.metadata->>'automation_key'=j.job_type||':'||j.booking_id::text
          and exists (
            select 1 from public.luxor_bookings b
            where b.id=j.booking_id and b.inquiry_id=new.id
              and b.status not in ('cancelled','completed')
          and nullif(b.metadata->>'planning_completed_at','') is not null
              and j.metadata->>'event_date'=b.event_date::text
          ))
        -- Post-event follow-up, only after the linked booking is completed and
        -- the lead remains in the same eligible closing stage as resend logic.
        or (not coalesce(new.is_test,false) and new.status='booked'
          and new.pipeline_stage in ('event','closing')
          and j.job_type='post_event_follow_up'
          and j.booking_id is not null
          and j.metadata->>'automation_key'='post_event_follow_up:'||j.booking_id::text
          and exists (
            select 1 from public.luxor_bookings b
            where b.id=j.booking_id and b.inquiry_id=new.id and b.status='completed'
          ))
      )
    order by j.id for update of j
  loop
    update public.luxor_email_jobs set recipient_email=lower(btrim(new.email)),updated_at=now()
      ,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'email_correction_history',
        (case when jsonb_typeof(metadata->'email_correction_history')='array'
          then metadata->'email_correction_history' else '[]'::jsonb end)
          || jsonb_build_array(jsonb_build_object(
            'from',job.recipient_email,'to',lower(btrim(new.email)),'at',now()))
      )
      where id=job.id and status='queued' and coalesce(attempts,0)=0 and scheduled_for>now();
    if not found then raise exception 'A lead email started sending; refresh and retry the address edit'; end if;
  end loop;
  return new;
end;
$$;

notify pgrst, 'reload schema';
