-- Elena task confirmations are service-only and bind one exact task to one session.
create table public.luxor_elena_task_confirmations (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.luxor_portal_members(id),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at_ms bigint not null,
  inquiry_id uuid not null references public.luxor_inquiries(id),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  description text check (description is null or (char_length(description) between 1 and 4000 and description = btrim(description))),
  priority text not null check (priority in ('low', 'medium', 'high')),
  due_date date,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  task_id uuid references public.luxor_tasks(id)
);
alter table public.luxor_elena_task_confirmations enable row level security;
revoke all on public.luxor_elena_task_confirmations from public, anon, authenticated, service_role;

create function public.luxor_elena_issue_task_confirmation(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text,
  p_session_issued_at_ms bigint, p_inquiry_id uuid, p_title text,
  p_description text, p_priority text, p_due_date date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member public.luxor_portal_members%rowtype;
  v_client_name text;
  v_expires_at timestamptz;
begin
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
    or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
    or p_session_issued_at_ms < floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or p_title is null or char_length(p_title) not between 1 and 200 or p_title <> btrim(p_title)
    or (p_description is not null and (char_length(p_description) not between 1 and 4000 or p_description <> btrim(p_description)))
    or p_priority is null or p_priority not in ('low','medium','high') then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce((v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'leads' and v_member.permissions ? 'calendar')), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  select full_name into v_client_name from public.luxor_inquiries where id = p_inquiry_id;
  if not found then raise exception 'Confirmation unavailable' using errcode = '22023'; end if;
  v_expires_at := clock_timestamp() + interval '5 minutes';
  insert into public.luxor_elena_task_confirmations
    (id, token_hash, member_id, session_hash, session_issued_at_ms, inquiry_id, title, description, priority, due_date, expires_at)
    values (p_id, p_token_hash, p_member_id, p_session_hash, p_session_issued_at_ms, p_inquiry_id, p_title, p_description, p_priority, p_due_date, v_expires_at);
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('task_confirmation_issued', 'inquiry', p_inquiry_id::text, v_member.email,
      jsonb_build_object('confirmation_id', p_id, 'member_id', p_member_id, 'expires_at', v_expires_at));
  return jsonb_build_object('expires_at', v_expires_at, 'client_name', coalesce(v_client_name, 'Luxor client'));
end;
$$;

create function public.luxor_elena_consume_task_confirmation(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text, p_session_issued_at_ms bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_intent public.luxor_elena_task_confirmations%rowtype;
  v_member public.luxor_portal_members%rowtype;
  v_task_id uuid;
begin
  select * into v_intent from public.luxor_elena_task_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or p_session_hash is null or v_intent.session_hash <> p_session_hash
    or p_session_issued_at_ms is null or v_intent.session_issued_at_ms <> p_session_issued_at_ms
    or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp() then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce((v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and v_member.permissions ? 'leads' and v_member.permissions ? 'calendar')), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  if v_intent.expires_at <= clock_timestamp() then raise exception 'Confirmation unavailable' using errcode = '42501'; end if;
  insert into public.luxor_tasks(inquiry_id, title, description, priority, due_date, status)
    values (v_intent.inquiry_id, v_intent.title, v_intent.description, v_intent.priority, v_intent.due_date, 'pending') returning id into v_task_id;
  update public.luxor_elena_task_confirmations set consumed_at = clock_timestamp(), task_id = v_task_id where id = v_intent.id;
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('task_confirmation_consumed', 'task', v_task_id::text, v_member.email,
      jsonb_build_object('confirmation_id', v_intent.id, 'member_id', v_member.id, 'inquiry_id', v_intent.inquiry_id));
  return jsonb_build_object('task_id', v_task_id);
end;
$$;
revoke all on function public.luxor_elena_issue_task_confirmation(uuid,text,uuid,text,bigint,uuid,text,text,text,date) from public, anon, authenticated;
revoke all on function public.luxor_elena_consume_task_confirmation(uuid,text,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.luxor_elena_issue_task_confirmation(uuid,text,uuid,text,bigint,uuid,text,text,text,date) to service_role;
grant execute on function public.luxor_elena_consume_task_confirmation(uuid,text,uuid,text,bigint) to service_role;
notify pgrst, 'reload schema';
