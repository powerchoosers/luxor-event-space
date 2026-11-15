-- Persist owner element annotations on developer support confirmations until the ticket is consumed.
alter table public.luxor_elena_developer_support_confirmations
  add column if not exists element_annotations jsonb not null default '[]'::jsonb;

alter table public.luxor_elena_developer_support_confirmations
  add constraint luxor_elena_developer_support_confirmations_element_annotations_check
  check (jsonb_typeof(element_annotations) = 'array' and jsonb_array_length(element_annotations) <= 25);

create or replace function public.luxor_elena_validate_developer_support_annotations(p_annotations jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
begin
  if p_annotations is null or jsonb_typeof(p_annotations) is distinct from 'array' then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  if jsonb_array_length(p_annotations) > 25 then
    raise exception 'Confirmation unavailable' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_annotations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Confirmation unavailable' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item->'id') is distinct from 'string'
      or char_length(v_item->>'id') not between 1 and 64
      or jsonb_typeof(v_item->'note') is distinct from 'string'
      or char_length(btrim(v_item->>'note')) not between 1 and 2000
      or jsonb_typeof(v_item->'pagePath') is distinct from 'string'
      or char_length(btrim(v_item->>'pagePath')) not between 1 and 2048
      or jsonb_typeof(v_item->'element') is distinct from 'object'
      or jsonb_typeof(v_item#>'{element,selector}') is distinct from 'string'
      or char_length(v_item#>>'{element,selector}') not between 1 and 512
      or jsonb_typeof(v_item#>'{element,label}') is distinct from 'string'
      or char_length(v_item#>>'{element,label}') not between 1 and 120
      or jsonb_typeof(v_item->'viewport') is distinct from 'object'
      or jsonb_typeof(v_item#>'{viewport,width}') is distinct from 'number'
      or jsonb_typeof(v_item#>'{viewport,height}') is distinct from 'number' then
      raise exception 'Confirmation unavailable' using errcode = '22023';
    end if;
  end loop;
end;
$$;

drop function if exists public.luxor_elena_issue_developer_support_confirmation(uuid, text, uuid, text, bigint, text, text, text, text, jsonb);

create function public.luxor_elena_issue_developer_support_confirmation(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_session_hash text,
  p_session_issued_at_ms bigint,
  p_title text,
  p_description text,
  p_priority text,
  p_page_path text,
  p_context_attachments jsonb default '[]'::jsonb,
  p_element_annotations jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member public.luxor_portal_members%rowtype;
  v_expires_at timestamptz;
begin
  perform public.luxor_elena_validate_developer_support_attachments(p_context_attachments);
  perform public.luxor_elena_validate_developer_support_annotations(p_element_annotations);
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
    (id, token_hash, member_id, session_hash, session_issued_at_ms, title, description, priority, page_path, expires_at, context_attachments, element_annotations)
  values
    (p_id, p_token_hash, p_member_id, p_session_hash, p_session_issued_at_ms, p_title, p_description, p_priority, p_page_path, v_expires_at, p_context_attachments, p_element_annotations);
  insert into public.luxor_elena_audit(action, entity_type, entity_id, actor_email, details)
    values ('developer_support_confirmation_issued', 'portal_member', p_member_id::text, v_member.email,
      jsonb_build_object(
        'confirmation_id', p_id,
        'title', p_title,
        'priority', p_priority,
        'page_path', p_page_path,
        'attachment_count', jsonb_array_length(p_context_attachments),
        'annotation_count', jsonb_array_length(p_element_annotations),
        'expires_at', v_expires_at
      ));
  return jsonb_build_object('expires_at', v_expires_at, 'reporter_name', coalesce(v_member.display_name, v_member.email));
end;
$$;

drop function if exists public.luxor_elena_consume_developer_support_confirmation(uuid, text, uuid, text, bigint);

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
      jsonb_build_object(
        'confirmation_id', v_intent.id,
        'title', v_intent.title,
        'priority', v_intent.priority,
        'page_path', v_intent.page_path,
        'attachment_count', jsonb_array_length(v_intent.context_attachments),
        'annotation_count', jsonb_array_length(v_intent.element_annotations)
      ));
  return jsonb_build_object(
    'confirmation_id', v_intent.id,
    'title', v_intent.title,
    'description', v_intent.description,
    'priority', v_intent.priority,
    'page_path', v_intent.page_path,
    'context_attachments', v_intent.context_attachments,
    'element_annotations', v_intent.element_annotations,
    'reporter_email', v_member.email,
    'reporter_name', coalesce(v_member.display_name, v_member.email)
  );
end;
$$;

revoke all on function public.luxor_elena_validate_developer_support_annotations(jsonb) from public, anon, authenticated;
grant execute on function public.luxor_elena_validate_developer_support_annotations(jsonb) to service_role;

revoke all on function public.luxor_elena_issue_developer_support_confirmation(uuid, text, uuid, text, bigint, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_elena_issue_developer_support_confirmation(uuid, text, uuid, text, bigint, text, text, text, text, jsonb, jsonb) to service_role;