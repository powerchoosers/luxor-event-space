-- Correcting a tour attendee address is a no-send operation. The owner must
-- explicitly confirm the prepared calendar invitation through the portal.
create unique index if not exists luxor_email_jobs_email_edit_request_uidx
  on public.luxor_email_jobs ((metadata->>'email_change_request_id'))
  where metadata->>'email_change_request_id' is not null;

create or replace function public.luxor_update_inquiry_email_for_portal(
  p_inquiry_id uuid, p_expected_email text, p_new_email text, p_request_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  event public.luxor_calendar_events%rowtype;
  old_revision public.luxor_calendar_revisions%rowtype;
  new_revision public.luxor_calendar_revisions%rowtype;
  source_job public.luxor_email_jobs%rowtype;
  prepared_job public.luxor_email_jobs%rowtype;
  reminder record;
  next_state jsonb;
  recipients text[];
  recipient text;
  snapshot jsonb;
  stamp timestamptz := now();
begin
  if p_inquiry_id is null or p_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
    or lower(btrim(p_new_email)) !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or length(btrim(p_new_email)) > 254 then raise exception 'Enter a valid email address'; end if;

  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;

  select * into prepared_job from public.luxor_email_jobs
    where inquiry_id=p_inquiry_id and metadata->>'email_change_request_id'=p_request_id limit 1;
  if found then
    if prepared_job.recipient_email <> lower(btrim(p_new_email)) or inquiry.email <> lower(btrim(p_new_email)) then
      raise exception 'Email changed since this request was prepared'; end if;
    return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',to_jsonb(prepared_job),'replayed',true);
  end if;
  if lower(coalesce(inquiry.email,'')) <> lower(btrim(coalesce(p_expected_email,''))) then
    raise exception 'Email changed since this lead was loaded; refresh and try again'; end if;

  select * into event from public.luxor_calendar_events where inquiry_id=p_inquiry_id for update;
  if not found or event.status <> 'confirmed' or inquiry.tour_attendance_status is distinct from 'pending'
    or inquiry.status='closed_lost' or (event.state->>'startUtc')::timestamptz <= stamp
    or not (event.state->'attendeeEmails' ? lower(inquiry.email)) then
    update public.luxor_inquiries set email=lower(btrim(p_new_email)),updated_at=stamp
      where id=p_inquiry_id returning * into inquiry;
    return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',null,'replayed',false);
  end if;

  select * into source_job from public.luxor_email_jobs
    where inquiry_id=p_inquiry_id and job_type='calendar_invitation' and calendar_method='REQUEST'
      and status='sent' and recipient_email=lower(inquiry.email) and sent_at >= stamp-interval '30 days'
      and metadata->>'delivery'='branded_confirmation'
    order by sent_at desc limit 1;
  if not found then
    update public.luxor_inquiries set email=lower(btrim(p_new_email)),updated_at=stamp
      where id=p_inquiry_id returning * into inquiry;
    return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',null,'replayed',false);
  end if;

  select * into old_revision from public.luxor_calendar_revisions
    where event_id=event.id and sequence=event.sequence;
  if not found then raise exception 'Current tour revision is missing'; end if;

  select array_agg(distinct email order by email) into recipients
    from (select value as email from jsonb_array_elements_text(event.state->'attendeeEmails')
      where value <> lower(inquiry.email) union all select lower(btrim(p_new_email))) current_recipients;
  next_state := jsonb_set(event.state,'{attendeeEmails}',to_jsonb(recipients),true);

  update public.luxor_calendar_events set state=next_state,status='confirmed',sequence=sequence+1,updated_at=stamp
    where id=event.id returning * into event;
  insert into public.luxor_calendar_revisions(event_id,sequence,state,requested_by,created_at)
    values(event.id,event.sequence,next_state,'Portal email correction',stamp) returning * into new_revision;

  update public.luxor_calendar_attendees set active=false where event_id=event.id;
  foreach recipient in array recipients loop
    insert into public.luxor_calendar_attendees(event_id,email,sequence,active)
      values(event.id,recipient,event.sequence,true)
      on conflict(event_id,email) do update set sequence=excluded.sequence,partstat='NEEDS-ACTION',
        response_at=null,response_message_id=null,active=true;
  end loop;

  update public.luxor_inquiries set email=lower(btrim(p_new_email)),updated_at=stamp,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('calendarProvider','resend','calendarEventId',event.id,
      'calendarEventUid',event.uid,'calendarSequence',event.sequence)
    where id=p_inquiry_id returning * into inquiry;

  -- Prepare, but do not queue, the same confirmation for explicit owner review.
  snapshot := next_state || jsonb_build_object('uid',event.uid,'sequence',event.sequence,
    'stamp',stamp,'createdAt',event.created_at,'attendeeEmail',lower(btrim(p_new_email)),'method','REQUEST');
  insert into public.luxor_email_jobs(inquiry_id,job_type,status,recipient_email,subject,body,
    calendar_revision_id,calendar_method,metadata)
  values(p_inquiry_id,'calendar_invitation','cancelled',lower(btrim(p_new_email)),source_job.subject,source_job.body,
    new_revision.id,'REQUEST',source_job.metadata || jsonb_build_object(
      'calendar_snapshot',snapshot,'email_change_request_id',p_request_id,'source_job_id',source_job.id,
      'sender_from','booking@luxoratlaspalmas.com','mail_provider','resend','awaiting_owner_confirmation',true))
  returning * into prepared_job;

  -- The email edit itself must not send either side of the calendar change.
  update public.luxor_email_jobs set status='cancelled',updated_at=stamp,
    last_error='Held for owner-confirmed email correction.'
    where inquiry_id=p_inquiry_id and calendar_revision_id=new_revision.id
      and job_type='calendar_invitation' and id<>prepared_job.id and status='queued';
  update public.luxor_email_jobs set status='cancelled',updated_at=stamp,
    last_error='Replaced by the corrected tour attendee address.'
    where inquiry_id=p_inquiry_id and tour_revision_id=old_revision.id
      and tour_notice in ('reminder_24','reminder_2') and status='queued';

  for reminder in select * from public.luxor_email_jobs
    where inquiry_id=p_inquiry_id and tour_revision_id=old_revision.id
      and tour_notice in ('reminder_24','reminder_2') and status='cancelled'
      and last_error='Replaced by the corrected tour attendee address.' and scheduled_for>stamp
  loop
    insert into public.luxor_email_jobs(inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,
      tour_revision_id,tour_notice,metadata)
    values(p_inquiry_id,reminder.job_type,'queued',lower(btrim(p_new_email)),reminder.subject,reminder.body,
      reminder.scheduled_for,new_revision.id,reminder.tour_notice,reminder.metadata || jsonb_build_object(
        'calendar_sequence',event.sequence,'email_corrected_at',stamp));
  end loop;

  return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',to_jsonb(prepared_job),'replayed',false);
end;
$$;

create or replace function public.luxor_confirm_prepared_tour_email_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  job public.luxor_email_jobs%rowtype;
  event public.luxor_calendar_events%rowtype;
  revision public.luxor_calendar_revisions%rowtype;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
  if not found or job.job_type<>'calendar_invitation' or job.calendar_method<>'REQUEST'
    or job.metadata->>'awaiting_owner_confirmation'<>'true' then raise exception 'Resend request is unavailable'; end if;
  if job.status in ('queued','sending','sent') then return to_jsonb(job); end if;
  if job.status not in ('cancelled','failed') or inquiry.email<>job.recipient_email or inquiry.tour_attendance_status is distinct from 'pending'
    or inquiry.status='closed_lost' then raise exception 'Lead or tour changed; refresh before resending'; end if;
  select * into event from public.luxor_calendar_events where inquiry_id=p_inquiry_id for update;
  select * into revision from public.luxor_calendar_revisions where id=job.calendar_revision_id;
  if not found or event.status<>'confirmed' or event.sequence<>revision.sequence
    or (event.state->>'startUtc')::timestamptz<=now()
    or not (revision.state->'attendeeEmails' ? job.recipient_email) then
    raise exception 'Tour changed; refresh before resending'; end if;
  update public.luxor_email_jobs set status='queued',updated_at=now(),last_error=null
    where id=p_job_id returning * into job;
  return to_jsonb(job);
end;
$$;

revoke all on function public.luxor_update_inquiry_email_for_portal(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_update_inquiry_email_for_portal(uuid,text,text,text) to service_role;
grant execute on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
