-- Calendar revisions and their outbound jobs commit together. No calendar mail
-- is sent by a database function; the existing email worker owns delivery.
set local lock_timeout = '5s';

create table public.luxor_calendar_events (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null unique references public.luxor_inquiries(id),
  uid text not null unique,
  sequence integer not null check (sequence >= 0),
  status text not null check (status in ('confirmed', 'cancelled')),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.luxor_calendar_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.luxor_calendar_events(id),
  sequence integer not null check (sequence >= 0),
  state jsonb not null,
  requested_by text not null,
  created_at timestamptz not null default now(),
  unique(event_id, sequence)
);
create table public.luxor_calendar_attendees (
  event_id uuid not null references public.luxor_calendar_events(id),
  email text not null,
  sequence integer not null,
  partstat text not null default 'NEEDS-ACTION' check (partstat in ('NEEDS-ACTION','ACCEPTED','TENTATIVE','DECLINED')),
  response_at timestamptz,
  response_message_id uuid references public.luxor_mail_messages(id),
  active boolean not null default true,
  primary key(event_id, email)
);
create index luxor_calendar_attendees_message_idx on public.luxor_calendar_attendees(response_message_id);
create table public.luxor_calendar_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.luxor_calendar_events(id),
  message_id uuid not null references public.luxor_mail_messages(id),
  attendee_email text not null,
  sequence integer not null,
  partstat text not null check (partstat in ('ACCEPTED','TENTATIVE','DECLINED')),
  reply_stamp timestamptz not null,
  disposition text not null check (disposition in ('applied','pending_review','stale','rejected')),
  reason text not null,
  created_at timestamptz not null default now(),
  unique(message_id, event_id, attendee_email)
);
create index luxor_calendar_responses_event_idx on public.luxor_calendar_responses(event_id, created_at desc);

alter table public.luxor_email_jobs drop constraint luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review','calendar_invitation'
));
alter table public.luxor_email_jobs add column calendar_revision_id uuid references public.luxor_calendar_revisions(id);
alter table public.luxor_email_jobs add column calendar_method text check (calendar_method in ('REQUEST','CANCEL'));
alter table public.luxor_email_jobs add constraint luxor_calendar_job_revision_check check (
  (job_type = 'calendar_invitation' and calendar_revision_id is not null and calendar_method is not null)
  or (job_type <> 'calendar_invitation' and calendar_revision_id is null and calendar_method is null)
);
create unique index luxor_calendar_delivery_unique on public.luxor_email_jobs(calendar_revision_id, recipient_email, calendar_method)
  where calendar_revision_id is not null;

alter table public.luxor_calendar_events enable row level security;
alter table public.luxor_calendar_revisions enable row level security;
alter table public.luxor_calendar_attendees enable row level security;
alter table public.luxor_calendar_responses enable row level security;
revoke all on public.luxor_calendar_events, public.luxor_calendar_revisions, public.luxor_calendar_attendees, public.luxor_calendar_responses from public, anon, authenticated;
grant select, insert, update on public.luxor_calendar_events, public.luxor_calendar_attendees, public.luxor_calendar_responses to service_role;
grant select, insert on public.luxor_calendar_revisions to service_role;

create function public.luxor_save_calendar_revision(p_inquiry_id uuid, p_expected_sequence integer, p_state jsonb, p_requested_by text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_event public.luxor_calendar_events%rowtype;
  revision public.luxor_calendar_revisions%rowtype;
  old_state jsonb;
  recipient text;
  recipients text[];
  removed text[];
  snapshot jsonb;
  stamp timestamptz := now();
begin
  -- The inquiry lock serializes creation too, when no event row exists yet.
  perform id from public.luxor_inquiries where id = p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if p_state is null or p_expected_sequence is null or nullif(btrim(p_requested_by),'') is null
    or coalesce(p_state->>'status','') not in ('confirmed','cancelled')
    or coalesce(p_state->>'title','') = '' or coalesce(p_state->>'location','') = ''
    or p_state->>'description' is null
    or coalesce(p_state->>'startUtc','') = '' or coalesce(p_state->>'endUtc','') = ''
    or not isfinite((p_state->>'startUtc')::timestamptz) or not isfinite((p_state->>'endUtc')::timestamptz)
    or (p_state->>'endUtc')::timestamptz <= (p_state->>'startUtc')::timestamptz
    or jsonb_typeof(p_state->'attendeeEmails') is distinct from 'array' then
    raise exception 'Invalid calendar state';
  end if;
  select array_agg(value order by value) into recipients from jsonb_array_elements_text(p_state->'attendeeEmails');
  if coalesce(cardinality(recipients),0) not between 1 and 50 then raise exception 'Invalid attendee count'; end if;
  if exists(select 1 from unnest(recipients) as email where email is null or email <> lower(email)
    or email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' or length(email)>254)
    or cardinality(recipients) <> (select count(distinct email) from unnest(recipients) as email) then
    raise exception 'Invalid calendar attendees';
  end if;
  select * into current_event from public.luxor_calendar_events where inquiry_id = p_inquiry_id for update;
  if found then
    if current_event.state = p_state then return to_jsonb(current_event); end if;
    if current_event.sequence <> p_expected_sequence then raise exception 'Calendar changed; refresh before editing'; end if;
    old_state := current_event.state;
    update public.luxor_calendar_events set state = p_state, status = p_state->>'status',
      sequence = sequence + 1, updated_at = stamp where id = current_event.id returning * into current_event;
  else
    if p_expected_sequence <> -1 or p_state->>'status' = 'cancelled' then raise exception 'Calendar event not found'; end if;
    insert into public.luxor_calendar_events(inquiry_id,uid,sequence,status,state)
      values(p_inquiry_id, 'tour-' || gen_random_uuid()::text || '@luxoratlaspalmas.com',0,'confirmed',p_state)
      returning * into current_event;
    old_state := p_state;
  end if;
  insert into public.luxor_calendar_revisions(event_id,sequence,state,requested_by,created_at)
    values(current_event.id,current_event.sequence,p_state,p_requested_by,stamp) returning * into revision;

  -- Removed attendees receive cancellation for the previous time/location;
  -- remaining attendees receive the newest REQUEST using the same UID.
  select coalesce(array_agg(value), '{}') into removed from jsonb_array_elements_text(old_state->'attendeeEmails')
    where current_event.status = 'cancelled' or not (value = any(recipients));
  foreach recipient in array removed loop
    snapshot := old_state || jsonb_build_object('uid',current_event.uid,'sequence',current_event.sequence,
      'stamp',stamp,'createdAt',current_event.created_at,'attendeeEmail',recipient,'method','CANCEL');
    insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,calendar_revision_id,calendar_method,metadata)
      values(p_inquiry_id,'calendar_invitation',recipient,'Cancelled: ' || (old_state->>'title'),old_state->>'description',revision.id,'CANCEL',
        jsonb_build_object('calendar_snapshot',snapshot,'sender_from','booking@luxoratlaspalmas.com','mail_provider','resend'));
  end loop;
  update public.luxor_calendar_attendees set active = false where event_id = current_event.id;
  if current_event.status = 'confirmed' then
    foreach recipient in array recipients loop
      snapshot := p_state || jsonb_build_object('uid',current_event.uid,'sequence',current_event.sequence,
        'stamp',stamp,'createdAt',current_event.created_at,'attendeeEmail',recipient,'method','REQUEST');
      insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,calendar_revision_id,calendar_method,metadata)
        values(p_inquiry_id,'calendar_invitation',recipient,p_state->>'title',p_state->>'description',revision.id,'REQUEST',
          jsonb_build_object('calendar_snapshot',snapshot,'sender_from','booking@luxoratlaspalmas.com','mail_provider','resend'));
      insert into public.luxor_calendar_attendees(event_id,email,sequence,active)
        values(current_event.id,recipient,current_event.sequence,true)
        on conflict(event_id,email) do update set sequence=excluded.sequence,partstat='NEEDS-ACTION',response_at=null,response_message_id=null,active=true;
    end loop;
  end if;
  update public.luxor_inquiries set metadata = coalesce(metadata,'{}') || jsonb_build_object(
    'calendarProvider','resend','calendarEventId',current_event.id,'calendarEventUid',current_event.uid,'calendarSequence',current_event.sequence)
    where id=p_inquiry_id;
  return to_jsonb(current_event);
end;
$$;
revoke all on function public.luxor_save_calendar_revision(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.luxor_save_calendar_revision(uuid,integer,jsonb,text) to service_role;

create function public.luxor_record_calendar_response(p_uid text,p_message_id uuid,p_email text,p_sequence integer,p_partstat text,p_stamp timestamptz,p_verified boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  event public.luxor_calendar_events%rowtype;
  attendee public.luxor_calendar_attendees%rowtype;
  response public.luxor_calendar_responses%rowtype;
  outcome text := 'pending_review';
  explanation text := 'Sender signature could not be verified; owner review required.';
begin
  if p_uid is null or p_message_id is null or p_email is null or p_sequence is null or p_sequence < 0
    or p_stamp is null or not isfinite(p_stamp) or coalesce(p_partstat,'') not in ('ACCEPTED','TENTATIVE','DECLINED') then
    raise exception 'Invalid calendar response';
  end if;
  select * into event from public.luxor_calendar_events where uid=p_uid for update;
  if not found then return jsonb_build_object('disposition','unmatched'); end if;
  select * into response from public.luxor_calendar_responses where message_id=p_message_id and event_id=event.id and attendee_email=p_email;
  if found then return to_jsonb(response); end if;
  select * into attendee from public.luxor_calendar_attendees where event_id=event.id and email=p_email;
  if not found or not attendee.active or event.status <> 'confirmed' then
    outcome := 'rejected'; explanation := 'Not an active attendee of this event.';
  elsif p_sequence <> event.sequence or p_stamp > now()+interval '10 minutes'
    or p_stamp < event.updated_at-interval '5 minutes'
    or (attendee.response_at is not null and p_stamp <= attendee.response_at) then
    outcome := 'stale'; explanation := 'Response is not newer than the current event/attendee state.';
  elsif p_verified then
    outcome := 'applied'; explanation := 'Matching attendee and event revision; sender DKIM verified.';
    update public.luxor_calendar_attendees set partstat=p_partstat,response_at=p_stamp,response_message_id=p_message_id
      where event_id=event.id and email=p_email;
  end if;
  insert into public.luxor_calendar_responses(event_id,message_id,attendee_email,sequence,partstat,reply_stamp,disposition,reason)
    values(event.id,p_message_id,p_email,p_sequence,p_partstat,p_stamp,outcome,explanation) returning * into response;
  return to_jsonb(response);
end;
$$;
revoke all on function public.luxor_record_calendar_response(text,uuid,text,integer,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.luxor_record_calendar_response(text,uuid,text,integer,text,timestamptz,boolean) to service_role;
