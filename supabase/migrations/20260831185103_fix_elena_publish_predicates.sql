create or replace function public.luxor_publish_elena_configuration(p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  published_time timestamptz := now();
  next_version integer;
begin
  update public.luxor_elena_settings
  set published_instructions = draft_instructions,
      version = version + 1,
      published_at = published_time,
      updated_by = nullif(btrim(p_actor), '')
  where scope = 'public'
  returning version into next_version;

  update public.luxor_elena_knowledge
  set published_payload = case when active and not archived then jsonb_build_object(
        'title', title,
        'content', content,
        'category', category,
        'source_type', source_type,
        'source_label', source_label
      ) else null end,
      published_at = published_time,
      updated_by = nullif(btrim(p_actor), '')
  where id is not null;

  update public.luxor_elena_flows
  set published_payload = case when active and not archived then jsonb_build_object(
        'name', name,
        'description', description,
        'trigger_text', trigger_text,
        'steps', steps
      ) else null end,
      published_at = published_time,
      updated_by = nullif(btrim(p_actor), '')
  where id is not null;

  insert into public.luxor_elena_audit (action, entity_type, entity_id, actor_email, details)
  values ('publish', 'configuration', 'public', nullif(btrim(p_actor), ''), jsonb_build_object('version', next_version));

  return jsonb_build_object('version', next_version, 'published_at', published_time);
end;
$$;

revoke all on function public.luxor_publish_elena_configuration(text) from public, anon, authenticated;
grant execute on function public.luxor_publish_elena_configuration(text) to service_role;

notify pgrst, 'reload schema';
