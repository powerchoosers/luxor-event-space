-- One exact completed cleaning entry, bound to a member and signed session.
create table public.luxor_elena_cleaning_confirmations (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.luxor_portal_members(id),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at_ms bigint not null,
  task_name text not null check (char_length(task_name) between 1 and 200 and task_name = btrim(task_name)),
  notes text check (notes is null or (char_length(notes) between 1 and 2000 and notes = btrim(notes))),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  cleaning_id uuid
);
alter table public.luxor_elena_cleaning_confirmations enable row level security;
revoke all on public.luxor_elena_cleaning_confirmations from public, anon, authenticated, service_role;

create function public.luxor_elena_issue_cleaning_completion(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text,
  p_session_issued_at_ms bigint, p_task_name text, p_notes text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_member public.luxor_portal_members%rowtype; v_expires_at timestamptz;
begin
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
    or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
    or p_task_name is null or char_length(p_task_name) not between 1 and 200 or p_task_name <> btrim(p_task_name)
    or (p_notes is not null and (char_length(p_notes) not between 1 and 2000 or p_notes <> btrim(p_notes)))
  then raise exception 'Confirmation unavailable' using errcode = '22023'; end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'operations'), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000))
  then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
  v_expires_at := clock_timestamp() + interval '5 minutes';
  insert into public.luxor_elena_cleaning_confirmations(id,token_hash,member_id,session_hash,session_issued_at_ms,task_name,notes,expires_at)
  values(p_id,p_token_hash,p_member_id,p_session_hash,p_session_issued_at_ms,p_task_name,p_notes,v_expires_at);
  insert into public.luxor_elena_audit(action,entity_type,entity_id,actor_email,details)
  values('cleaning_confirmation_issued','cleaning_confirmation',p_id::text,v_member.email,jsonb_build_object('member_id',p_member_id,'expires_at',v_expires_at));
  return jsonb_build_object('expires_at',v_expires_at);
end;
$$;

create function public.luxor_elena_consume_cleaning_completion(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text, p_session_issued_at_ms bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_intent public.luxor_elena_cleaning_confirmations%rowtype; v_member public.luxor_portal_members%rowtype; v_cleaning_id uuid;
begin
  select * into v_intent from public.luxor_elena_cleaning_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or p_session_hash is null or v_intent.session_hash <> p_session_hash
    or p_session_issued_at_ms is null or v_intent.session_issued_at_ms <> p_session_issued_at_ms
    or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp()
  then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'operations'), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000))
    or v_intent.expires_at <= clock_timestamp()
  then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
  insert into public.luxor_cleaning_logs(task_name,completed,completed_at,notes)
  values(v_intent.task_name,true,clock_timestamp(),v_intent.notes) returning id into v_cleaning_id;
  update public.luxor_elena_cleaning_confirmations set consumed_at=clock_timestamp(),cleaning_id=v_cleaning_id where id=v_intent.id;
  insert into public.luxor_elena_audit(action,entity_type,entity_id,actor_email,details)
  values('cleaning_confirmation_consumed','cleaning_log',v_cleaning_id::text,v_member.email,jsonb_build_object('confirmation_id',v_intent.id,'member_id',v_member.id));
  return jsonb_build_object('cleaning_id',v_cleaning_id);
end;
$$;
revoke all on function public.luxor_elena_issue_cleaning_completion(uuid,text,uuid,text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.luxor_elena_consume_cleaning_completion(uuid,text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.luxor_elena_issue_cleaning_completion(uuid,text,uuid,text,bigint,text,text) to service_role;
grant execute on function public.luxor_elena_consume_cleaning_completion(uuid,text,uuid,text,bigint) to service_role;
notify pgrst, 'reload schema';
