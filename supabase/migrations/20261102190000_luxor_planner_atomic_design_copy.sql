-- Publish a duplicated Planner design and all of its private copied-file
-- metadata in one transaction. Storage bytes are staged privately before this
-- function is called, so no owner can see or edit a partial copy.
create or replace function public.luxor_planner_publish_design_copy(
  p_design jsonb,
  p_files jsonb
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  saved_design public.luxor_planner_designs%rowtype;
  file_input record;
  saved_file public.luxor_planner_files%rowtype;
  saved_files jsonb := '[]'::jsonb;
  design_id uuid;
begin
  if jsonb_typeof(p_design) is distinct from 'object'
    or jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'Invalid Planner design copy payload.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_files) > 1000 then
    raise exception 'Too many Planner design copy files.' using errcode = '22023';
  end if;

  design_id := nullif(p_design->>'id', '')::uuid;
  if design_id is null then
    raise exception 'Planner design copy id is required.' using errcode = '22023';
  end if;

  insert into public.luxor_planner_designs (
    id, booking_id, source_template_id, design_kind, category, name, event_type,
    design_style, palette, guest_count_min, guest_count_max, description, content,
    internal_notes, status, revision, approved_revision, approved_at, archived_at,
    created_by, created_at, updated_at
  ) values (
    design_id,
    nullif(p_design->>'booking_id', '')::uuid,
    nullif(p_design->>'source_template_id', '')::uuid,
    p_design->>'design_kind',
    coalesce(nullif(p_design->>'category', ''), 'design_template'),
    p_design->>'name',
    p_design->>'event_type',
    p_design->>'design_style',
    coalesce(p_design->'palette', '[]'::jsonb),
    nullif(p_design->>'guest_count_min', '')::integer,
    nullif(p_design->>'guest_count_max', '')::integer,
    p_design->>'description',
    coalesce(p_design->'content', '{}'::jsonb),
    p_design->>'internal_notes',
    coalesce(p_design->>'status', 'draft'),
    coalesce(nullif(p_design->>'revision', '')::integer, 1),
    nullif(p_design->>'approved_revision', '')::integer,
    nullif(p_design->>'approved_at', '')::timestamptz,
    nullif(p_design->>'archived_at', '')::timestamptz,
    p_design->>'created_by',
    coalesce(nullif(p_design->>'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_design->>'updated_at', '')::timestamptz, now())
  ) returning * into saved_design;

  for file_input in
    select * from jsonb_to_recordset(p_files) as item(
      id uuid, design_id uuid, category text, title text, file_name text,
      storage_path text, content_type text, size_bytes integer, expires_at date,
      internal_only boolean, uploaded_by text, created_at timestamptz, updated_at timestamptz
    )
  loop
    if file_input.design_id is distinct from design_id then
      raise exception 'Planner copy file belongs to a different design.' using errcode = '22023';
    end if;
    insert into public.luxor_planner_files (
      id, booking_id, vendor_id, design_id, event_vendor_id, category, title,
      file_name, storage_path, content_type, size_bytes, expires_at, internal_only,
      uploaded_by, created_at, updated_at
    ) values (
      file_input.id, null, null, design_id, null, file_input.category, file_input.title,
      file_input.file_name, file_input.storage_path, file_input.content_type,
      file_input.size_bytes, file_input.expires_at, coalesce(file_input.internal_only, true),
      file_input.uploaded_by, coalesce(file_input.created_at, now()), coalesce(file_input.updated_at, now())
    ) returning * into saved_file;
    saved_files := saved_files || jsonb_build_array(to_jsonb(saved_file));
  end loop;

  return jsonb_build_object('published', true, 'design', to_jsonb(saved_design), 'files', saved_files);
end;
$$;

revoke all on function public.luxor_planner_publish_design_copy(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_planner_publish_design_copy(jsonb, jsonb) to service_role;

-- Rollback: drop this function only. No existing records are modified.
-- drop function if exists public.luxor_planner_publish_design_copy(jsonb, jsonb);
