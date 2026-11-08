-- A close-day intent stores its exact date set; the bearer secret is never stored.
create table public.luxor_elena_tour_close_confirmations (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.luxor_portal_members(id),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at_ms bigint not null,
  dates date[] not null check (cardinality(dates) between 1 and 62),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.luxor_elena_tour_close_confirmations enable row level security;
revoke all on public.luxor_elena_tour_close_confirmations from public, anon, authenticated, service_role;

create function public.luxor_elena_issue_close_tour_days(
 p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text,
 p_session_issued_at_ms bigint, p_dates date[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member public.luxor_portal_members%rowtype; v_expires_at timestamptz;
begin
 if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
   or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
   or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
   or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
   or p_dates is null or cardinality(p_dates) not between 1 and 62
   or exists (select 1 from unnest(p_dates) as d where d is null or d < (clock_timestamp() at time zone 'America/Chicago')::date)
   or (select count(distinct d) from unnest(p_dates) as d) <> cardinality(p_dates)
 then raise exception 'Confirmation unavailable' using errcode = '22023'; end if;
 select * into v_member from public.luxor_portal_members where id = p_member_id for update;
 if not found or v_member.status is distinct from 'active'
   or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'calendar'), false)
   or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
   or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000))
   or exists (select 1 from unnest(p_dates) as d where d < (clock_timestamp() at time zone 'America/Chicago')::date)
 then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
 v_expires_at := clock_timestamp() + interval '5 minutes';
 insert into public.luxor_elena_tour_close_confirmations(id,token_hash,member_id,session_hash,session_issued_at_ms,dates,expires_at)
 values(p_id,p_token_hash,p_member_id,p_session_hash,p_session_issued_at_ms,p_dates,v_expires_at);
 insert into public.luxor_elena_audit(action,entity_type,entity_id,actor_email,details)
 values('tour_close_confirmation_issued','tour_days',p_id::text,v_member.email,jsonb_build_object('member_id',p_member_id,'dates',p_dates,'expires_at',v_expires_at));
 return jsonb_build_object('expires_at',v_expires_at);
end;
$$;

create function public.luxor_elena_consume_close_tour_days(
 p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text, p_session_issued_at_ms bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_intent public.luxor_elena_tour_close_confirmations%rowtype; v_member public.luxor_portal_members%rowtype; v_count integer;
begin
 select * into v_intent from public.luxor_elena_tour_close_confirmations where id = p_id for update;
 if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
   or p_member_id is null or v_intent.member_id <> p_member_id
   or p_session_hash is null or v_intent.session_hash <> p_session_hash
   or p_session_issued_at_ms is null or v_intent.session_issued_at_ms <> p_session_issued_at_ms
   or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp()
 then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
 -- Exclude concurrent inserts, schedule rewrites and reservations while closing
 -- the date set. This lock is released on commit or rollback.
 perform pg_catalog.set_config('lock_timeout', '3s', true);
 lock table public.luxor_tour_slots in share row exclusive mode;
 select * into v_member from public.luxor_portal_members where id = p_member_id for update;
 if not found or v_member.status is distinct from 'active'
   or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'calendar'), false)
   or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
   or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000))
   or v_intent.expires_at <= clock_timestamp()
   or exists (select 1 from unnest(v_intent.dates) as d where d < (clock_timestamp() at time zone 'America/Chicago')::date)
 then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
 update public.luxor_tour_slots set status='unavailable', updated_at=clock_timestamp()
 where slot_date=any(v_intent.dates) and status in ('available','booked');
 get diagnostics v_count = row_count;
 update public.luxor_elena_tour_close_confirmations set consumed_at=clock_timestamp() where id=v_intent.id;
 insert into public.luxor_elena_audit(action,entity_type,entity_id,actor_email,details)
 values('tour_close_confirmation_consumed','tour_days',v_intent.id::text,v_member.email,jsonb_build_object('member_id',v_member.id,'dates',v_intent.dates,'slots_closed',v_count));
 return jsonb_build_object('slots_closed',v_count);
end;
$$;
revoke all on function public.luxor_elena_issue_close_tour_days(uuid,text,uuid,text,bigint,date[]) from public,anon,authenticated;
revoke all on function public.luxor_elena_consume_close_tour_days(uuid,text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.luxor_elena_issue_close_tour_days(uuid,text,uuid,text,bigint,date[]) to service_role;
grant execute on function public.luxor_elena_consume_close_tour_days(uuid,text,uuid,text,bigint) to service_role;
notify pgrst, 'reload schema';
