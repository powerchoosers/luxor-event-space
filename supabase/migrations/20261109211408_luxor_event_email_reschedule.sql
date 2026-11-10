-- Atomically replace only unsent pre-event reminders for a still-current
-- booking date. Claimed messages retain the separate send-time eligibility guard.
create or replace function public.luxor_sync_event_email_reminders(
  p_booking_id uuid, p_inquiry_id uuid, p_expected_date date, p_recipient_email text,
  p_reminders jsonb, p_copy_settings_unavailable boolean default false
) returns table(applied boolean, queued integer, cancelled integer)
language plpgsql security definer set search_path = '' as $$
declare
  booking public.luxor_bookings%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  item jsonb;
  send_at timestamptz;
  count_queued integer := 0;
  count_cancelled integer := 0;
begin
  if jsonb_typeof(p_reminders) is distinct from 'array' or jsonb_array_length(p_reminders) <> 2
    or (select count(distinct value->>'kind') from jsonb_array_elements(p_reminders)) <> 2
    or exists (select 1 from jsonb_array_elements(p_reminders) r(value)
      where value->>'kind' not in ('event_details_reminder','event_day_reminder')
        or coalesce(length(btrim(value->>'subject')),0) = 0
        or coalesce(length(btrim(value->>'body')),0) = 0) then
    raise exception 'Invalid event reminder content';
  end if;
  select * into booking from public.luxor_bookings where id=p_booking_id for update;
  if not found or booking.inquiry_id is distinct from p_inquiry_id or booking.event_date is distinct from p_expected_date
    or booking.status in ('cancelled','completed') or nullif(booking.metadata->>'planning_completed_at','') is null
    or nullif(booking.metadata->>'event_completed_at','') is not null then
    return query select false,0,0; return;
  end if;
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found or inquiry.status='closed_lost' or nullif(btrim(inquiry.email),'') is null
    or lower(btrim(inquiry.email)) is distinct from lower(btrim(coalesce(p_recipient_email,''))) then
    return query select false,0,0; return;
  end if;
  update public.luxor_email_jobs set status='cancelled', last_error='Event date changed before delivery.', updated_at=now()
    where booking_id=p_booking_id and inquiry_id=p_inquiry_id and status='queued'
      and job_type in ('event_details_reminder','event_day_reminder')
      and custom_workflow_step_run_id is null and test_run_id is null
      and coalesce(metadata->>'corrected_email_resend_request_id','') = ''
      and metadata->>'event_date' is distinct from p_expected_date::text;
  get diagnostics count_cancelled = row_count;
  for item in select value from jsonb_array_elements(p_reminders) loop
    send_at := ((p_expected_date::text || 'T12:00:00-05:00')::timestamptz
      - case when item->>'kind'='event_details_reminder' then interval '14 days' else interval '2 days' end);
    if send_at <= now() then continue; end if;
    if exists (select 1 from public.luxor_email_jobs j where j.booking_id=p_booking_id and j.inquiry_id=p_inquiry_id
      and j.job_type=item->>'kind' and j.status in ('queued','sending','sent') and j.metadata->>'event_date'=p_expected_date::text
      and j.custom_workflow_step_run_id is null and j.test_run_id is null
      and coalesce(j.metadata->>'corrected_email_resend_request_id','') = '') then continue; end if;
    insert into public.luxor_email_jobs(inquiry_id,booking_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata)
      values(p_inquiry_id,p_booking_id,item->>'kind','queued',p_recipient_email,item->>'subject',item->>'body',send_at,
        jsonb_build_object('event_date',p_expected_date::text,'automation_key',item->>'kind'||':'||p_booking_id::text||':'||p_expected_date::text)
          || case when p_copy_settings_unavailable then jsonb_build_object('copy_settings_unavailable',true) else '{}'::jsonb end);
    count_queued := count_queued + 1;
  end loop;
  return query select true,count_queued,count_cancelled;
end;
$$;
revoke all on function public.luxor_sync_event_email_reminders(uuid,uuid,date,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.luxor_sync_event_email_reminders(uuid,uuid,date,text,jsonb,boolean) to service_role;
