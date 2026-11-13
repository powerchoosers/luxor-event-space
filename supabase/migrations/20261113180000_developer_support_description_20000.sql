-- Raise developer support ticket extra-details cap for long owner specs.
alter table public.luxor_elena_developer_support_confirmations
  drop constraint if exists luxor_elena_developer_support_confirmations_description_check;

alter table public.luxor_elena_developer_support_confirmations
  add constraint luxor_elena_developer_support_confirmations_description_check
  check (description is null or (char_length(description) between 1 and 20000 and description = btrim(description)));

create or replace function public.luxor_elena_issue_developer_support_confirmation(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_session_hash text,
  p_session_issued_at_ms bigint,
  p_title text,
  p_description text,
  p_priority text,
  p_page_path text,
  p_context_attachments jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member public.luxor_portal_members%rowtype;
  v_expires_at timestamptz;
begin
  perform public.luxor_elena_validate_developer_support_attachments(p_context_attachments);
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_session_issued_at_ms is null or p_session_issued_at_ms <= 0
    or p_session_issued_at_ms > floor(extract(epoch from clock_timestamp()) * 1000)
    or p_session_issued_at_ms < floor(extract(epoch from clock_timestamp() - interval '7 days') * 1000)
    or p_title is null or char_length(p_title) not between 1 and 200 or p_title <> btrim(p_title)
    or (p_description is not null and (char_length(p_description) not between 1 and 20000 or p_description <> btrim(p_description)))
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
    (id, token_hash, member_id, session_hash, session_issued_at_ms, title, description, priority, page_path, expires_at, context_attachments)
  values
    (p_id, p_token_hash, p_member_id, p_session_hash, p_session_issued_at_ms, p_title, p_description, p_priority, p_page_path, v_expires_at, p_context_attachments);
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('developer_support_confirmation_issued', 'portal_member', p_member_id::text, v_member.email,
      jsonb_build_object(
        'confirmation_id', p_id,
        'title', p_title,
        'priority', p_priority,
        'page_path', p_page_path,
        'attachment_count', jsonb_array_length(p_context_attachments),
        'expires_at', v_expires_at
      ));
  return jsonb_build_object('expires_at', v_expires_at, 'reporter_name', coalesce(v_member.display_name, v_member.email));
end;
$$;
