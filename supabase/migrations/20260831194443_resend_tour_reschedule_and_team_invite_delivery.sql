set local lock_timeout = '5s';

-- Team sign-in links are created in Supabase, delivered by Resend, and only
-- consumable after the delivery attempt has been recorded.
alter table public.luxor_portal_invites
  add column if not exists sent_at timestamptz,
  add column if not exists resend_message_id text;

create index if not exists luxor_portal_invites_delivery_idx
  on public.luxor_portal_invites(member_id, sent_at desc);

alter table public.luxor_portal_members enable row level security;
alter table public.luxor_portal_invites enable row level security;
revoke all on public.luxor_portal_members, public.luxor_portal_invites from public, anon, authenticated;
grant select, insert, update on public.luxor_portal_members, public.luxor_portal_invites to service_role;

drop policy if exists "Service role manages portal members" on public.luxor_portal_members;
create policy "Service role manages portal members"
  on public.luxor_portal_members for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages portal invites" on public.luxor_portal_invites;
create policy "Service role manages portal invites"
  on public.luxor_portal_invites for all to service_role
  using (true) with check (true);

-- When an existing tour was originally created through Zoho, preserve its UID
-- and start the Resend-owned revision at a higher sequence. Calendar clients
-- then treat the Resend REQUEST as an update instead of a duplicate event.
create or replace function public.luxor_save_calendar_revision(
  p_inquiry_id uuid,
  p_expected_sequence integer,
  p_state jsonb,
  p_requested_by text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_event public.luxor_calendar_events%rowtype;
  revision public.luxor_calendar_revisions%rowtype;
  inquiry_metadata jsonb;
  legacy_uid text;
  initial_sequence integer := 0;
  old_state jsonb;
  recipient text;
  recipients text[];
  removed text[];
  snapshot jsonb;
  stamp timestamptz := now();
begin
  select coalesce(metadata, '{}'::jsonb) into inquiry_metadata
    from public.luxor_inquiries where id = p_inquiry_id for update;
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
    legacy_uid := coalesce(
      nullif(btrim(inquiry_metadata->>'calendarEventUid'), ''),
      nullif(btrim(inquiry_metadata->>'zohoCalendarEventUid'), '')
    );
    if legacy_uid is not null and (length(legacy_uid) > 512 or legacy_uid ~ E'[\r\n]') then
      raise exception 'Invalid legacy calendar UID';
    end if;
    if legacy_uid is not null then
      initial_sequence := case
        when coalesce(inquiry_metadata->>'calendarSequence', '') ~ '^[0-9]+$'
          then greatest((inquiry_metadata->>'calendarSequence')::integer + 1, 1)
        else 1
      end;
    end if;
    insert into public.luxor_calendar_events(inquiry_id,uid,sequence,status,state)
      values(
        p_inquiry_id,
        coalesce(legacy_uid, 'tour-' || gen_random_uuid()::text || '@luxoratlaspalmas.com'),
        initial_sequence,
        'confirmed',
        p_state
      )
      returning * into current_event;
    old_state := p_state;
  end if;
  insert into public.luxor_calendar_revisions(event_id,sequence,state,requested_by,created_at)
    values(current_event.id,current_event.sequence,p_state,p_requested_by,stamp) returning * into revision;

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

-- Scheduling now always owns the current calendar revision in Supabase. The
-- calendar function above safely adopts a legacy UID on the first reschedule.
create or replace function public.luxor_save_tour_schedule(
  p_inquiry_id uuid,
  p_expected_sequence integer,
  p_state jsonb,
  p_tour jsonb,
  p_templates jsonb,
  p_requested_by text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  inquiry public.luxor_inquiries%rowtype;
  event public.luxor_calendar_events%rowtype;
  revision public.luxor_calendar_revisions%rowtype;
  event_json jsonb;
  stamp timestamptz := now();
  start_at timestamptz;
  end_at timestamptz;
  duration_minutes numeric;
  template jsonb;
  key text;
  recipient text;
  send_at timestamptz;
  hours_before integer;
  common_metadata jsonb;
  replayed boolean;
  saved_tour jsonb;
begin
  select * into inquiry from public.luxor_inquiries where id=p_inquiry_id for update;
  if not found then raise exception 'Inquiry not found'; end if;
  if inquiry.status='closed_lost' then raise exception 'Reopen the inquiry before scheduling'; end if;
  if coalesce(p_state->>'status','') <> 'confirmed'
    or jsonb_typeof(p_tour) is distinct from 'object'
    or jsonb_typeof(p_templates) is distinct from 'object'
    or coalesce(length(btrim(p_requested_by)),0) not between 1 and 254
    or coalesce(length(btrim(p_tour->>'meetingType')),0) not between 1 and 120
    or p_tour->>'clientFacingNotes' is null or length(p_tour->>'clientFacingNotes')>2000
    or coalesce(p_tour->>'responseToken','') !~ '^[A-Za-z0-9_-]{32,128}$'
    or jsonb_typeof(p_tour->'assignees') is distinct from 'array' then
    raise exception 'Invalid tour schedule';
  end if;
  if jsonb_array_length(p_tour->'assignees')>12 or exists(
    select 1 from jsonb_array_elements(p_tour->'assignees') value
    where jsonb_typeof(value)<>'string' or length(value #>> '{}') not between 1 and 254
  ) then raise exception 'Invalid tour assignees'; end if;
  if inquiry.tour_response_token is not null and inquiry.tour_response_token <> p_tour->>'responseToken' then
    raise exception 'Tour response link changed; refresh before scheduling';
  end if;
  start_at := (p_state->>'startUtc')::timestamptz;
  end_at := (p_state->>'endUtc')::timestamptz;
  duration_minutes := extract(epoch from end_at-start_at)/60;
  if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at)
    or duration_minutes not between 30 and 180 then raise exception 'Invalid tour time'; end if;
  foreach key in array array['confirmation','reminder_24','reminder_2'] loop
    template := p_templates->key;
    if jsonb_typeof(template) is distinct from 'object'
      or coalesce(length(btrim(template->>'subject')),0) not between 1 and 300
      or template->>'subject' ~ E'[\r\n]'
      or coalesce(length(btrim(template->>'body')),0) not between 1 and 250000 then
      raise exception 'Invalid tour email template';
    end if;
  end loop;

  event_json := public.luxor_save_calendar_revision(p_inquiry_id,p_expected_sequence,p_state,p_requested_by);
  select * into event from public.luxor_calendar_events where id=(event_json->>'id')::uuid;
  select * into revision from public.luxor_calendar_revisions where event_id=event.id and sequence=event.sequence;
  if not found then raise exception 'Saved calendar revision missing'; end if;
  select exists(select 1 from public.luxor_tour_schedule_receipts where revision_id=revision.id) into replayed;
  if replayed then
    select tour into saved_tour from public.luxor_tour_schedule_receipts where revision_id=revision.id;
    if (saved_tour-'assignees') is distinct from (p_tour-'assignees') then
      raise exception 'Tour details changed without a calendar revision; refresh before scheduling';
    end if;
    if jsonb_array_length(p_tour->'assignees')>0 then
      update public.luxor_inquiries set metadata=coalesce(metadata,'{}') || jsonb_build_object('tour_assignees',p_tour->'assignees')
        where id=p_inquiry_id returning * into inquiry;
    end if;
  else
    if start_at<=stamp then raise exception 'Choose a future tour time'; end if;
    update public.luxor_email_jobs set status='cancelled',updated_at=stamp,
      last_error='Replaced by the current tour schedule.'
      where inquiry_id=p_inquiry_id and status='queued'
      and job_type in ('tour_confirmation','tour_reminder','tour_no_show_reschedule');

    common_metadata := jsonb_build_object('meeting_type',p_tour->>'meetingType',
      'client_facing_notes',p_tour->>'clientFacingNotes','tour_start_at',start_at,'tour_end_at',end_at,
      'timezone','America/Chicago','calendar_provider','resend','calendar_event_id',event.id,
      'calendar_event_uid',event.uid,'calendar_sequence',event.sequence,'calendar_url','/portal/calendar',
      'hero_image',p_templates->'confirmation'->>'heroImage','requested_by',p_requested_by,
      'sender_from','booking@luxoratlaspalmas.com','mail_provider','resend');

    template := p_templates->'confirmation';
    update public.luxor_email_jobs
      set subject=template->>'subject', body=template->>'body',
        metadata=metadata || common_metadata || jsonb_build_object(
          'delivery','branded_confirmation',
          'ai_generated',coalesce(template->'aiGenerated','false'::jsonb),
          'plain_text',coalesce(template->>'text',p_state->>'description')
        )
      where calendar_revision_id=revision.id and calendar_method='REQUEST';
    if not found then raise exception 'Calendar invitation job missing'; end if;

    foreach key in array array['reminder_24','reminder_2'] loop
      hours_before := case key when 'reminder_24' then 24 else 2 end;
      send_at := start_at-make_interval(hours=>hours_before);
      if send_at<=stamp then continue; end if;
      template := p_templates->key;
      for recipient in select value from jsonb_array_elements_text(p_state->'attendeeEmails') loop
        insert into public.luxor_email_jobs(inquiry_id,job_type,recipient_email,subject,body,scheduled_for,
          tour_revision_id,tour_notice,metadata)
        values(p_inquiry_id,'tour_reminder',recipient,template->>'subject',template->>'body',send_at,revision.id,key,
          common_metadata || jsonb_build_object('reminder_hours_before',hours_before));
      end loop;
    end loop;
    update public.luxor_inquiries set status='tour_confirmed',pipeline_stage='tour',updated_at=stamp,
      preferred_tour_date=(start_at at time zone 'America/Chicago')::date,
      preferred_tour_time=to_char(start_at at time zone 'America/Chicago','FMHH12:MI AM'),
      tour_confirmed_at=stamp,tour_attendance_status='pending',tour_response_token=p_tour->>'responseToken',
      metadata=coalesce(metadata,'{}') || jsonb_build_object('tourMeetingType',p_tour->>'meetingType',
        'tourClientFacingNotes',p_tour->>'clientFacingNotes','tourDurationMinutes',duration_minutes,
        'tourStartAt',start_at) || case when jsonb_array_length(p_tour->'assignees')>0 then
          jsonb_build_object('tour_assignees',p_tour->'assignees') else '{}'::jsonb end
      where id=p_inquiry_id returning * into inquiry;
    insert into public.luxor_tour_schedule_receipts(revision_id,requested_by,tour) values(revision.id,p_requested_by,p_tour);
  end if;
  return jsonb_build_object('event',to_jsonb(event),'inquiry',to_jsonb(inquiry),'replayed',replayed,
    'confirmationJobs',coalesce((select jsonb_agg(to_jsonb(j) order by recipient_email) from public.luxor_email_jobs j
      where calendar_revision_id=revision.id and calendar_method='REQUEST'),'[]'::jsonb),
    'reminderJobs',coalesce((select jsonb_agg(to_jsonb(j) order by scheduled_for,recipient_email) from public.luxor_email_jobs j
      where tour_revision_id=revision.id and tour_notice in ('reminder_24','reminder_2')),'[]'::jsonb));
end;
$$;

revoke all on function public.luxor_save_tour_schedule(uuid,integer,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.luxor_save_tour_schedule(uuid,integer,jsonb,jsonb,jsonb,text) to service_role;

notify pgrst, 'reload schema';
