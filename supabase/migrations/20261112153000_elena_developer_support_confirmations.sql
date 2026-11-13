-- Owner-only Elena developer support tickets. Consumed server-side after explicit confirmation.
create table public.luxor_elena_developer_support_confirmations (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.luxor_portal_members(id),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at_ms bigint not null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  description text check (description is null or (char_length(description) between 1 and 4000 and description = btrim(description))),
  priority text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  page_path text check (page_path is null or (char_length(page_path) between 1 and 2048 and page_path = btrim(page_path))),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  cursor_run_uuid text check (cursor_run_uuid is null or char_length(cursor_run_uuid) between 1 and 128),
  cursor_background_composer_id text check (cursor_background_composer_id is null or char_length(cursor_background_composer_id) between 1 and 128)
);
alter table public.luxor_elena_developer_support_confirmations enable row level security;
revoke all on public.luxor_elena_developer_support_confirmations from public, anon, authenticated, service_role;

create function public.luxor_elena_issue_developer_support_confirmation(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_session_hash text,
  p_session_issued_at_ms bigint,
  p_title text,
  p_description text,
  p_priority text,
  p_page_path text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member public.luxor_portal_members%rowtype;
  v_expires_at timestamptz;
begin
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
    or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
    or p_session_issued_at_ms < floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or p_title is null or char_length(p_title) not between 1 and 200 or p_title <> btrim(p_title)
    or (p_description is not null and (char_length(p_description) not between 1 and 4000 or p_description <> btrim(p_description)))
    or p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent')
    or (p_page_path is not null and (char_length(p_page_path) not between 1 and 2048 or p_page_path <> btrim(p_page_path))) then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or v_member.role is distinct from 'owner'
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  v_expires_at := clock_timestamp() + interval '10 minutes';
  insert into public.luxor_elena_developer_support_confirmations
    (id, token_hash, member_id, session_hash, session_issued_at_ms, title, description, priority, page_path, expires_at)
  values
    (p_id, p_token_hash, p_member_id, p_session_hash, p_session_issued_at_ms, p_title, p_description, p_priority, p_page_path, v_expires_at);
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('developer_support_confirmation_issued', 'portal_member', p_member_id::text, v_member.email,
      jsonb_build_object('confirmation_id', p_id, 'title', p_title, 'priority', p_priority, 'page_path', p_page_path, 'expires_at', v_expires_at));
  return jsonb_build_object('expires_at', v_expires_at, 'reporter_name', coalesce(v_member.display_name, v_member.email));
end;
$$;

create function public.luxor_elena_consume_developer_support_confirmation(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_session_hash text,
  p_session_issued_at_ms bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_intent public.luxor_elena_developer_support_confirmations%rowtype;
  v_member public.luxor_portal_members%rowtype;
begin
  select * into v_intent from public.luxor_elena_developer_support_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or p_session_hash is null or v_intent.session_hash <> p_session_hash
    or p_session_issued_at_ms is null or v_intent.session_issued_at_ms <> p_session_issued_at_ms
    or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp() then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or v_member.role is distinct from 'owner'
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  update public.luxor_elena_developer_support_confirmations set consumed_at = clock_timestamp() where id = v_intent.id;
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('developer_support_confirmation_consumed', 'developer_support', v_intent.id::text, v_member.email,
      jsonb_build_object('confirmation_id', v_intent.id, 'title', v_intent.title, 'priority', v_intent.priority, 'page_path', v_intent.page_path));
  return jsonb_build_object(
    'confirmation_id', v_intent.id,
    'title', v_intent.title,
    'description', v_intent.description,
    'priority', v_intent.priority,
    'page_path', v_intent.page_path,
    'reporter_email', v_member.email,
    'reporter_name', coalesce(v_member.display_name, v_member.email)
  );
end;
$$;

create function public.luxor_elena_record_developer_support_dispatch(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_cursor_run_uuid text,
  p_cursor_background_composer_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_intent public.luxor_elena_developer_support_confirmations%rowtype;
begin
  select * into v_intent from public.luxor_elena_developer_support_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or v_intent.consumed_at is null then
    raise exception 'Dispatch unavailable' using errcode = '42501';
  end if;
  update public.luxor_elena_developer_support_confirmations
    set cursor_run_uuid = nullif(btrim(p_cursor_run_uuid), ''),
        cursor_background_composer_id = nullif(btrim(p_cursor_background_composer_id), '')
    where id = v_intent.id;
end;
$$;

revoke all on function public.luxor_elena_issue_developer_support_confirmation(uuid,text,uuid,text,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.luxor_elena_consume_developer_support_confirmation(uuid,text,uuid,text,bigint) from public, anon, authenticated;
revoke all on function public.luxor_elena_record_developer_support_dispatch(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.luxor_elena_issue_developer_support_confirmation(uuid,text,uuid,text,bigint,text,text,text,text) to service_role;
grant execute on function public.luxor_elena_consume_developer_support_confirmation(uuid,text,uuid,text,bigint) to service_role;
grant execute on function public.luxor_elena_record_developer_support_dispatch(uuid,text,uuid,text,text) to service_role;
