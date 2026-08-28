set local lock_timeout = '5s';

-- A review is an owner decision, not evidence that the sender authenticated.
-- Keep the received reply immutable and record the decision separately.
create table public.luxor_calendar_response_reviews (
  response_id uuid primary key references public.luxor_calendar_responses(id),
  decision text not null check (decision in ('approve','dismiss')),
  reviewed_by text not null check (length(btrim(reviewed_by)) between 1 and 254),
  reviewed_at timestamptz not null default now(),
  event_sequence integer not null check (event_sequence >= 0),
  note text not null check (length(btrim(note)) between 1 and 500)
);
alter table public.luxor_calendar_response_reviews enable row level security;
revoke all on public.luxor_calendar_response_reviews from public,anon,authenticated;
grant select,insert on public.luxor_calendar_response_reviews to service_role;

create function public.luxor_review_calendar_response(
  p_response_id uuid, p_expected_sequence integer, p_decision text, p_reviewed_by text, p_note text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  reply public.luxor_calendar_responses%rowtype;
  event public.luxor_calendar_events%rowtype;
  attendee public.luxor_calendar_attendees%rowtype;
  review public.luxor_calendar_response_reviews%rowtype;
begin
  if p_response_id is null or p_expected_sequence is null or p_expected_sequence < 0
    or coalesce(p_decision,'') not in ('approve','dismiss')
    or coalesce(length(btrim(p_reviewed_by)),0) not between 1 and 254
    or coalesce(length(btrim(p_note)),0) not between 1 and 500 then
    raise exception 'Invalid calendar review';
  end if;
  select * into reply from public.luxor_calendar_responses where id=p_response_id;
  if not found then raise exception 'Calendar reply not found'; end if;
  -- Match the lock order of revisions and automatic response processing.
  select * into event from public.luxor_calendar_events where id=reply.event_id for update;
  select * into reply from public.luxor_calendar_responses where id=p_response_id for update;
  select * into review from public.luxor_calendar_response_reviews where response_id=p_response_id;
  if found then
    if review.decision=p_decision and review.reviewed_by=p_reviewed_by
      and review.note=btrim(p_note) and review.event_sequence=p_expected_sequence then
      return to_jsonb(review);
    end if;
    raise exception 'Calendar reply already reviewed';
  end if;
  if reply.disposition <> 'pending_review' then raise exception 'Calendar reply does not require review'; end if;
  if event.sequence <> p_expected_sequence then raise exception 'Calendar changed; refresh before reviewing'; end if;
  if p_decision='approve' then
    select * into attendee from public.luxor_calendar_attendees
      where event_id=event.id and email=reply.attendee_email for update;
    if not found or not attendee.active or event.status <> 'confirmed'
      or attendee.sequence <> event.sequence or reply.sequence <> event.sequence
      or reply.reply_stamp > now()+interval '10 minutes'
      or reply.reply_stamp < event.updated_at-interval '5 minutes'
      or (attendee.response_at is not null and reply.reply_stamp <= attendee.response_at) then
      raise exception 'Calendar reply is no longer current; refresh before reviewing';
    end if;
    update public.luxor_calendar_attendees set partstat=reply.partstat,
      response_at=reply.reply_stamp,response_message_id=reply.message_id
      where event_id=event.id and email=reply.attendee_email;
  end if;
  insert into public.luxor_calendar_response_reviews(response_id,decision,reviewed_by,event_sequence,note)
    values(p_response_id,p_decision,p_reviewed_by,event.sequence,btrim(p_note)) returning * into review;
  return to_jsonb(review);
end;
$$;
revoke all on function public.luxor_review_calendar_response(uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.luxor_review_calendar_response(uuid,integer,text,text,text) to service_role;
