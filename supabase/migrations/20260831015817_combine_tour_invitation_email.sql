set local lock_timeout = '5s';

-- A scheduled tour has one immediate customer email: the frozen branded
-- confirmation is delivered as the calendar REQUEST itself. Timed reminders
-- remain separate because they happen later and serve a different action.
create or replace function public.luxor_save_tour_schedule(
  p_inquiry_id uuid, p_expected_sequence integer, p_state jsonb,
  p_tour jsonb, p_templates jsonb, p_requested_by text
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
  if nullif(inquiry.metadata->>'zohoCalendarEventUid','') is not null and not exists(
    select 1 from public.luxor_calendar_events where inquiry_id=p_inquiry_id
  ) then raise exception 'Import the existing Zoho invitation before scheduling through Resend'; end if;
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
