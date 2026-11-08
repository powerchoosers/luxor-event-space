-- Elena actions are stored server-side and can only be issued/consumed by the
-- application service role. The bearer secret itself is never stored.
create table public.luxor_elena_note_confirmations (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  member_id uuid not null references public.luxor_portal_members(id),
  session_hash text not null check (session_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at_ms bigint not null,
  inquiry_id uuid not null references public.luxor_inquiries(id),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  note_id uuid references public.luxor_notes(id)
);

alter table public.luxor_elena_note_confirmations enable row level security;
revoke all on public.luxor_elena_note_confirmations from public, anon, authenticated, service_role;

create function public.luxor_elena_issue_note_confirmation(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text,
  p_session_issued_at_ms bigint, p_inquiry_id uuid, p_content text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_member public.luxor_portal_members%rowtype;
  v_expires_at timestamptz;
begin
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
    or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
    or p_session_issued_at_ms < floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or p_content is null or char_length(btrim(p_content)) not between 1 and 4000
    or p_content <> btrim(p_content) then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and coalesce(v_member.permissions ? 'leads', false)), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.luxor_inquiries where id = p_inquiry_id) then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  v_expires_at := clock_timestamp() + interval '5 minutes';
  insert into public.luxor_elena_note_confirmations
    (id, token_hash, member_id, session_hash, session_issued_at_ms, inquiry_id, content, expires_at)
    values (p_id, p_token_hash, p_member_id, p_session_hash, p_session_issued_at_ms, p_inquiry_id, p_content, v_expires_at);
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('note_confirmation_issued', 'inquiry', p_inquiry_id::text, v_member.email,
      jsonb_build_object('confirmation_id', p_id, 'member_id', p_member_id, 'expires_at', v_expires_at));
  return jsonb_build_object('expires_at', v_expires_at);
end;
$$;

create function public.luxor_elena_consume_note_confirmation(
  p_id uuid, p_token_hash text, p_member_id uuid, p_session_hash text, p_session_issued_at_ms bigint
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_intent public.luxor_elena_note_confirmations%rowtype;
  v_member public.luxor_portal_members%rowtype;
  v_note_id uuid;
begin
  select * into v_intent from public.luxor_elena_note_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or p_session_hash is null or v_intent.session_hash <> p_session_hash
    or p_session_issued_at_ms is null or v_intent.session_issued_at_ms <> p_session_issued_at_ms
    or v_intent.consumed_at is not null or v_intent.expires_at <= clock_timestamp() then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  select * into v_member from public.luxor_portal_members where id = p_member_id for update;
  if not found or v_member.status is distinct from 'active'
    or not coalesce(v_member.role = 'owner' or (jsonb_typeof(v_member.permissions) = 'array' and coalesce(v_member.permissions ? 'leads', false)), false)
    or p_session_issued_at_ms <= floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or (v_member.sessions_revoked_at is not null and p_session_issued_at_ms <= floor(extract(epoch from v_member.sessions_revoked_at) * 1000)) then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  -- Check expiry again after waiting for the member lock.
  if v_intent.expires_at <= clock_timestamp() then
    raise exception 'Confirmation unavailable' using errcode = '42501';
  end if;
  insert into public.luxor_notes(inquiry_id, content, note_type, author)
    values (v_intent.inquiry_id, v_intent.content, 'note', v_member.display_name)
    returning id into v_note_id;
  update public.luxor_elena_note_confirmations set consumed_at = clock_timestamp(), note_id = v_note_id where id = v_intent.id;
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('note_confirmation_consumed', 'note', v_note_id::text, v_member.email,
      jsonb_build_object('confirmation_id', v_intent.id, 'member_id', v_member.id, 'inquiry_id', v_intent.inquiry_id));
  return jsonb_build_object('note_id', v_note_id);
end;
$$;

revoke all on function public.luxor_elena_issue_note_confirmation(uuid,text,uuid,text,bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.luxor_elena_consume_note_confirmation(uuid,text,uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.luxor_elena_issue_note_confirmation(uuid,text,uuid,text,bigint,uuid,text) to service_role;
grant execute on function public.luxor_elena_consume_note_confirmation(uuid,text,uuid,text,bigint) to service_role;
notify pgrst, 'reload schema';


