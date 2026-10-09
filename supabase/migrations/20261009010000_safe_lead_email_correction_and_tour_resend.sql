-- Correcting a tour attendee address is a no-send operation. The saved
-- confirmation remains held until an owner explicitly confirms it.
create unique index if not exists luxor_email_jobs_email_edit_request_uidx
  on public.luxor_email_jobs ((metadata->>'email_change_request_id'))
  where metadata->>'email_change_request_id' is not null;

-- Persist every correction request, including edits which do not have a safe
-- branded confirmation to offer. A retry after a lost HTTP response can then
-- return the same result without applying the correction twice.
create table if not exists public.luxor_email_correction_requests (
  request_id text primary key check (request_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  inquiry_id uuid not null references public.luxor_inquiries(id),
  expected_email text not null,
  new_email text not null,
  resend_job_id uuid references public.luxor_email_jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.luxor_email_correction_requests enable row level security;
revoke all on public.luxor_email_correction_requests from public, anon, authenticated;
grant select, insert, update on public.luxor_email_correction_requests to service_role;

create or replace function public.luxor_update_inquiry_email_for_portal(
  p_inquiry_id uuid, p_expected_email text, p_new_email text, p_request_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  event public.luxor_calendar_events%rowtype;
  old_revision public.luxor_calendar_revisions%rowtype;
  new_revision public.luxor_calendar_revisions%rowtype;
  source_job public.luxor_email_jobs%rowtype;
  source_revision public.luxor_calendar_revisions%rowtype;
  prepared_job public.luxor_email_jobs%rowtype;
  correction public.luxor_email_correction_requests%rowtype;
  recipients text[];
  next_state jsonb;
  snapshot jsonb;
  stamp timestamptz := now();
  old_email text;
  new_email text;
  event_is_current boolean := false;
begin
  if p_inquiry_id is null or coalesce(p_request_id,'') !~ '^[A-Za-z0-9_-]{16,128}$'
    or lower(btrim(coalesce(p_new_email,''))) !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
    or length(btrim(p_new_email)) > 254 then
    raise exception 'Enter a valid email address';
  end if;
  old_email := lower(btrim(coalesce(p_expected_email,'')));
  new_email := lower(btrim(p_new_email));

  -- The inquiry is the serialization point shared with confirmation/delivery.
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;

  select * into correction from public.luxor_email_correction_requests where request_id=p_request_id;
  if found then
    if correction.inquiry_id<>p_inquiry_id or correction.expected_email<>old_email or correction.new_email<>new_email then
      raise exception 'Email correction request ID was reused with different values';
    end if;
    select * into prepared_job from public.luxor_email_jobs where id=correction.resend_job_id;
    return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',case when found then to_jsonb(prepared_job) else null end,'replayed',true);
  end if;

  if lower(btrim(coalesce(inquiry.email,'')))<>old_email then
    raise exception 'Email changed since this lead was loaded; refresh and try again';
  end if;

  if old_email=new_email then
    insert into public.luxor_email_correction_requests(request_id,inquiry_id,expected_email,new_email)
      values(p_request_id,p_inquiry_id,old_email,new_email);
    return jsonb_build_object('inquiry',to_jsonb(inquiry),'resendJob',null,'replayed',false);
  end if;

  select * into event from public.luxor_calendar_events where inquiry_id=p_inquiry_id for update;
  if found then
    event_is_current := event.status='confirmed'
      and inquiry.tour_attendance_status is not distinct from 'pending'
      and inquiry.status is distinct from 'closed_lost'
      and coalesce(event.state->>'startUtc','') <> ''
      and (event.state->>'startUtc')::timestamptz > stamp
      and jsonb_typeof(event.state->'attendeeEmails')='array';
  end if;

  -- A send already claimed by the worker cannot be safely retargeted. The
  -- owner may retry the edit after that delivery reaches a terminal state.
  perform 1 from public.luxor_email_jobs j
    where j.inquiry_id=p_inquiry_id and j.metadata->>'prepared_tour_email_resend'='true'
      and j.status='sending' for update;
  if found then raise exception 'The tour confirmation is already sending; retry the address edit after it finishes'; end if;

  if event_is_current then
    select * into old_revision from public.luxor_calendar_revisions
      where event_id=event.id and sequence=event.sequence for update;
    if not found then raise exception 'Current tour revision is missing'; end if;

    perform 1 from public.luxor_email_jobs j
      where j.inquiry_id=p_inquiry_id and j.tour_revision_id=old_revision.id
        and j.job_type='tour_reminder' and j.status='sending' and j.recipient_email=old_email for update;
    if found then raise exception 'A tour reminder is already sending; retry the address edit after it finishes'; end if;

    -- A resend candidate is optional. Only use a sent confirmation whose
    -- saved tour content still matches the current tour; attendee-only changes
    -- are allowed, but a reschedule/detail change fails closed.
    select j.* into source_job
      from public.luxor_email_jobs j
      join public.luxor_calendar_revisions r on r.id=j.calendar_revision_id
      where j.inquiry_id=p_inquiry_id and j.job_type='calendar_invitation'
        and j.calendar_method='REQUEST' and j.status='sent' and j.sent_at>=stamp-interval '30 days'
        and j.metadata->>'delivery'='branded_confirmation'
        and r.event_id=event.id and (r.state-'attendeeEmails')=(event.state-'attendeeEmails')
      order by j.sent_at desc, j.created_at desc limit 1;
    if found then
      select * into source_revision from public.luxor_calendar_revisions where id=source_job.calendar_revision_id;
    end if;

    select array_agg(email order by email) into recipients from (
      select distinct case when value=old_email then new_email else value end as email
        from jsonb_array_elements_text(event.state->'attendeeEmails') as attendees(value)
      union select new_email
    ) as next_attendees;
    next_state := jsonb_set(event.state,'{attendeeEmails}',to_jsonb(recipients),true);

    update public.luxor_calendar_events set state=next_state,status='confirmed',sequence=sequence+1,updated_at=stamp
      where id=event.id returning * into event;
    insert into public.luxor_calendar_revisions(event_id,sequence,state,requested_by,created_at)
      values(event.id,event.sequence,next_state,'Portal email correction',stamp) returning * into new_revision;

    -- Deactivate only the replaced address. Preserve every other attendee,
    -- RSVP, response message, and response timestamp. If the destination was
    -- already an attendee, keep its response state rather than resetting it.
    update public.luxor_calendar_attendees set active=false
      where event_id=event.id and email=old_email and email<>new_email;
    update public.luxor_calendar_attendees set sequence=event.sequence,active=true
      where event_id=event.id and email=any(recipients);
    insert into public.luxor_calendar_attendees(event_id,email,sequence,active)
      values(event.id,new_email,event.sequence,true)
      on conflict(event_id,email) do update set sequence=excluded.sequence,active=true;

    -- Move only future queued reminders to the new revision, preserving their
    -- timing, content, recipient, and status. If both old and destination
    -- recipients already have a queued reminder, keep the destination copy.
    update public.luxor_email_jobs old_job set status='cancelled',updated_at=stamp,
      last_error='Replaced by an existing reminder for the corrected attendee.'
      where old_job.inquiry_id=p_inquiry_id and old_job.tour_revision_id=old_revision.id
        and old_job.job_type='tour_reminder' and old_job.status='queued' and old_job.scheduled_for>stamp
        and old_job.recipient_email=old_email and exists (
          select 1 from public.luxor_email_jobs destination
          where destination.inquiry_id=old_job.inquiry_id and destination.tour_revision_id=old_job.tour_revision_id
            and destination.job_type='tour_reminder' and destination.status='queued'
            and destination.scheduled_for=old_job.scheduled_for and destination.tour_notice=old_job.tour_notice
            and destination.recipient_email=new_email
        );
    update public.luxor_email_jobs set tour_revision_id=new_revision.id,
      recipient_email=case when recipient_email=old_email then new_email else recipient_email end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('calendar_sequence',event.sequence,'email_corrected_at',stamp),
      updated_at=stamp
      where inquiry_id=p_inquiry_id and tour_revision_id=old_revision.id and job_type='tour_reminder'
        and status='queued' and scheduled_for>stamp;
  end if;

  -- Any previously prepared candidate belongs to the previous address and is
  -- no longer confirmable. This happens even when no new candidate is found.
  update public.luxor_email_jobs set status='cancelled',last_error='Superseded by a newer email correction.',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'awaiting_owner_confirmation',false,'superseded_by_request_id',p_request_id,'superseded_at',stamp),updated_at=stamp
    where inquiry_id=p_inquiry_id and metadata->>'prepared_tour_email_resend'='true'
      and coalesce(metadata->>'superseded_at','')=''
      and status in ('cancelled','failed','queued');

  update public.luxor_inquiries set email=new_email,updated_at=stamp,
    metadata=case when event_is_current then coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'calendarProvider','resend','calendarEventId',event.id,'calendarEventUid',event.uid,'calendarSequence',event.sequence)
      else coalesce(metadata,'{}'::jsonb) end
    where id=p_inquiry_id returning * into inquiry;

  if event_is_current and source_job.id is not null then
    snapshot := event.state||jsonb_build_object('uid',event.uid,'sequence',event.sequence,
      'stamp',stamp,'createdAt',event.created_at,'attendeeEmail',new_email,'method','REQUEST');
    insert into public.luxor_email_jobs(inquiry_id,job_type,status,recipient_email,subject,body,
      calendar_revision_id,calendar_method,metadata,last_error)
    values(p_inquiry_id,'calendar_invitation','cancelled',new_email,source_job.subject,source_job.body,
      new_revision.id,'REQUEST',coalesce(source_job.metadata,'{}'::jsonb)||jsonb_build_object(
        'calendar_snapshot',snapshot,'email_change_request_id',p_request_id,
        'source_job_id',source_job.id,'source_revision_id',source_revision.id,
        'prepared_tour_email_resend',true,'awaiting_owner_confirmation',true,
        'owner_confirmed_at',null,'superseded_at',null,'sender_from','booking@luxoratlaspalmas.com',
        'mail_provider','resend'), 'Waiting for owner confirmation.')
    returning * into prepared_job;
  end if;

  insert into public.luxor_email_correction_requests(request_id,inquiry_id,expected_email,new_email,resend_job_id)
    values(p_request_id,p_inquiry_id,old_email,new_email,prepared_job.id);
  return jsonb_build_object('inquiry',to_jsonb(inquiry),
    'resendJob',case when prepared_job.id is not null then to_jsonb(prepared_job) else null end,'replayed',false);
end;
$$;

-- Shared eligibility check keeps the saved message and calendar attachment
-- on the exact current tour revision, and is called before confirmation and
-- immediately before a worker claims the message for delivery.
create or replace function public.luxor_validate_prepared_tour_email_resend(
  p_inquiry_id uuid, p_job_id uuid, p_action text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  job public.luxor_email_jobs%rowtype;
  event public.luxor_calendar_events%rowtype;
  revision public.luxor_calendar_revisions%rowtype;
  source_job public.luxor_email_jobs%rowtype;
  source_revision public.luxor_calendar_revisions%rowtype;
  valid boolean := false;
  claimed boolean := false;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  select * into job from public.luxor_email_jobs where id=p_job_id and inquiry_id=p_inquiry_id for update;
  if not found or job.job_type<>'calendar_invitation' or job.calendar_method<>'REQUEST'
    or job.metadata->>'prepared_tour_email_resend' is distinct from 'true'
    or coalesce(job.metadata->>'superseded_at','')<>'' then
    raise exception 'Resend request is unavailable';
  end if;

  -- A recorded successful delivery remains an idempotent success even if the
  -- tour is later edited. All nonterminal responses must pass live checks.
  if job.status='sent' and job.sent_at is not null then
    return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',true,'completed',true);
  end if;

  select * into event from public.luxor_calendar_events where inquiry_id=p_inquiry_id for update;
  select * into revision from public.luxor_calendar_revisions where id=job.calendar_revision_id for update;
  if found and event.id=revision.event_id and event.status='confirmed'
    and event.sequence=revision.sequence and event.state=revision.state
    and inquiry.email=job.recipient_email and inquiry.tour_attendance_status is not distinct from 'pending'
    and inquiry.status is distinct from 'closed_lost'
    and (event.state->>'startUtc')::timestamptz>now()
    and (revision.state->'attendeeEmails' ? job.recipient_email)
    and job.metadata->>'source_job_id' ~* '^[0-9a-f-]{36}$'
    and job.metadata->>'source_revision_id' ~* '^[0-9a-f-]{36}$' then
    select * into source_job from public.luxor_email_jobs where id=(job.metadata->>'source_job_id')::uuid;
    select * into source_revision from public.luxor_calendar_revisions where id=(job.metadata->>'source_revision_id')::uuid;
    valid := found and source_job.inquiry_id=p_inquiry_id and source_job.status='sent'
      and source_job.job_type='calendar_invitation' and source_job.calendar_method='REQUEST'
      and source_job.metadata->>'delivery'='branded_confirmation'
      and source_job.calendar_revision_id=source_revision.id and source_revision.event_id=event.id
      and (source_revision.state-'attendeeEmails')=(event.state-'attendeeEmails')
      and source_job.subject=job.subject and source_job.body=job.body;
  end if;

  if not valid then
    if p_action='worker' and job.status in ('queued','sending') then
      update public.luxor_email_jobs set status='cancelled',last_error='Tour, recipient, or source confirmation changed before delivery.',updated_at=now()
        where id=job.id returning * into job;
      return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',false,'completed',false);
    end if;
    raise exception 'Lead or tour changed; refresh before resending';
  end if;

  if p_action='confirm' then
    if job.status in ('queued','sending') then
      if job.metadata->>'owner_confirmed_at' is null then raise exception 'Owner confirmation is required'; end if;
      return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',true,'completed',false);
    end if;
    if job.status not in ('cancelled','failed')
      or (coalesce(job.metadata->>'awaiting_owner_confirmation','false')<>'true'
        and job.status<>'failed') then
      raise exception 'Resend request is unavailable';
    end if;
    update public.luxor_email_jobs set status='queued',updated_at=now(),last_error=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'awaiting_owner_confirmation',false,'owner_confirmed_at',now())
      where id=job.id returning * into job;
    return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',true,'completed',false);
  elsif p_action='claim' then
    if job.status<>'queued' or job.metadata->>'owner_confirmed_at' is null then
      return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',true,'completed',false);
    end if;
    update public.luxor_email_jobs set status='sending',attempts=attempts+1,updated_at=now()
      where id=job.id and status='queued' returning * into job;
    claimed:=found;
    return jsonb_build_object('job',to_jsonb(job),'claimed',claimed,'eligible',true,'completed',false);
  elsif p_action='worker' then
    if job.status<>'sending' or job.metadata->>'owner_confirmed_at' is null then
      return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',false,'completed',false);
    end if;
    return jsonb_build_object('job',to_jsonb(job),'claimed',false,'eligible',true,'completed',false);
  end if;
  raise exception 'Invalid resend validation action';
end;
$$;

create or replace function public.luxor_confirm_prepared_tour_email_resend(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  result:=public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'confirm');
  return result->'job';
end;
$$;

create or replace function public.luxor_claim_prepared_tour_email_resend_delivery(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  return public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'claim');
end;
$$;

create or replace function public.luxor_check_prepared_tour_email_resend_delivery(p_inquiry_id uuid,p_job_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  return public.luxor_validate_prepared_tour_email_resend(p_inquiry_id,p_job_id,'worker');
end;
$$;

revoke all on function public.luxor_validate_prepared_tour_email_resend(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_update_inquiry_email_for_portal(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_claim_prepared_tour_email_resend_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.luxor_check_prepared_tour_email_resend_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_validate_prepared_tour_email_resend(uuid,uuid,text) to service_role;
grant execute on function public.luxor_update_inquiry_email_for_portal(uuid,text,text,text) to service_role;
grant execute on function public.luxor_confirm_prepared_tour_email_resend(uuid,uuid) to service_role;
grant execute on function public.luxor_claim_prepared_tour_email_resend_delivery(uuid,uuid) to service_role;
grant execute on function public.luxor_check_prepared_tour_email_resend_delivery(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
