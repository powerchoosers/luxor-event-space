-- Persist signed luxor-documents URLs on consumed developer support tickets (context_attachments jsonb).
create or replace function public.luxor_elena_update_developer_support_context_attachments(
  p_id uuid,
  p_token_hash text,
  p_member_id uuid,
  p_context_attachments jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.luxor_elena_developer_support_confirmations%rowtype;
begin
  if p_context_attachments is null
    or jsonb_typeof(p_context_attachments) is distinct from 'array'
    or jsonb_array_length(p_context_attachments) > 5 then
    raise exception 'Attachment update unavailable' using errcode = '22023';
  end if;
  select * into v_intent from public.luxor_elena_developer_support_confirmations where id = p_id for update;
  if not found or p_token_hash is null or v_intent.token_hash <> p_token_hash
    or p_member_id is null or v_intent.member_id <> p_member_id
    or v_intent.consumed_at is null then
    raise exception 'Attachment update unavailable' using errcode = '42501';
  end if;
  update public.luxor_elena_developer_support_confirmations
    set context_attachments = p_context_attachments
    where id = v_intent.id;
end;
$$;

revoke all on function public.luxor_elena_update_developer_support_context_attachments(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_elena_update_developer_support_context_attachments(uuid, text, uuid, jsonb) to service_role;