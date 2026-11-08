-- ISOLATED PROPOSAL ONLY. NOT A MIGRATION. DO NOT APPLY WITHOUT REVIEW.
-- Reserve a unique migration name after the repayment handoff and verify the
-- target schema, grants, RLS, concurrent retries and existing revenue targets.
begin;
create table public.luxor_financial_planning_items (
  id uuid primary key,
  kind text not null check (kind in ('goal', 'opening_scenario')),
  revision integer not null check (revision >= 0),
  schema_version integer not null default 1 check (schema_version > 0),
  payload jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check (payload ->> 'id' = id::text),
  check (payload ->> 'status' in ('active', 'archived'))
);
create table public.luxor_financial_planning_history (
  item_id uuid not null references public.luxor_financial_planning_items(id) on delete restrict,
  revision integer not null,
  kind text not null,
  payload jsonb not null,
  actor text not null,
  recorded_at timestamptz not null default now(),
  primary key (item_id, revision)
);
create table public.luxor_financial_planning_operations (
  actor text not null,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor, operation_id)
);
alter table public.luxor_financial_planning_items enable row level security;
alter table public.luxor_financial_planning_history enable row level security;
alter table public.luxor_financial_planning_operations enable row level security;
revoke all on public.luxor_financial_planning_items, public.luxor_financial_planning_history, public.luxor_financial_planning_operations from public, anon, authenticated;
grant select, insert, update on public.luxor_financial_planning_items to service_role;
grant select, insert on public.luxor_financial_planning_history, public.luxor_financial_planning_operations to service_role;

-- Conservative v1 compatibility: never replace an unfamiliar stored shape.
-- Errors, including invalid dates or numeric casts, return false rather than
-- making assumptions about old data. Null remains distinct from zero.
create function public.luxor_planning_supported_v1(p_kind text, p_payload jsonb, p_id uuid, p_revision integer)
returns boolean language plpgsql immutable security invoker set search_path = public as $$
declare
  v_keys text[]; v_label text; v_amount numeric; v_start text; v_end text; v_key text;
begin
  if p_id is null or p_revision is null or p_revision < 0 or jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  if p_kind = 'goal' then
    v_keys := array['id','metric','title','periodStart','periodEnd','target','direction','status','revision'];
    v_label := 'title';
  elsif p_kind = 'opening_scenario' then
    v_keys := array['id','label','source','asOf','openingAmount','minimumReserve','status','revision'];
    v_label := 'label';
  else return false; end if;
  if not (p_payload ?& v_keys) or p_payload - v_keys <> '{}'::jsonb then return false; end if;
  if jsonb_typeof(p_payload->'id') is distinct from 'string' or p_payload->>'id' is distinct from p_id::text
     or jsonb_typeof(p_payload->'revision') is distinct from 'number' or (p_payload->>'revision')::numeric is distinct from p_revision::numeric
     or jsonb_typeof(p_payload->'status') is distinct from 'string' or coalesce(p_payload->>'status','') not in ('active','archived')
     or jsonb_typeof(p_payload->v_label) is distinct from 'string' or length(translate(coalesce(p_payload->>v_label,''), chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279), '')) = 0
     or octet_length(p_payload->>v_label) > 120 then return false; end if;
  if p_kind = 'goal' then
    if jsonb_typeof(p_payload->'metric') is distinct from 'string' or coalesce(p_payload->>'metric','') not in ('event_collections','paid_expenses','booking_count','net_recorded_flows','minimum_reserve','event_margin')
      or jsonb_typeof(p_payload->'direction') is distinct from 'string' or coalesce(p_payload->>'direction','') not in ('at_least','at_most') then return false; end if;
    if jsonb_typeof(p_payload->'target') is distinct from 'number' then return false; end if;
    v_amount := (p_payload->>'target')::numeric;
    if abs(v_amount) > 9999999999.99 or v_amount * 100 <> trunc(v_amount * 100)
      or (p_payload->>'metric' <> 'net_recorded_flows' and v_amount < 0)
      or (p_payload->>'metric' = 'booking_count' and v_amount <> trunc(v_amount))
      or (p_payload->>'metric' = 'event_margin' and (v_amount < 0 or v_amount > 100)) then return false; end if;
    if jsonb_typeof(p_payload->'periodStart') is distinct from 'string' or jsonb_typeof(p_payload->'periodEnd') is distinct from 'string' then return false; end if;
    v_start := p_payload->>'periodStart'; v_end := p_payload->>'periodEnd';
  else
    if jsonb_typeof(p_payload->'source') is distinct from 'string' or p_payload->>'source' <> 'manual'
      or jsonb_typeof(p_payload->'asOf') is distinct from 'string' then return false; end if;
    v_start := p_payload->>'asOf'; v_end := v_start;
    foreach v_key in array array['openingAmount','minimumReserve'] loop
      if jsonb_typeof(p_payload->v_key) = 'number' then
        v_amount := (p_payload->>v_key)::numeric;
        if abs(v_amount) > 9999999999.99 or v_amount * 100 <> trunc(v_amount * 100) or (v_key = 'minimumReserve' and v_amount < 0) then return false; end if;
      elsif jsonb_typeof(p_payload->v_key) is distinct from 'null' then return false; end if;
    end loop;
  end if;
  if v_start !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_end !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or v_start < '1900-01-01' or v_end < v_start
    or to_char(v_start::date, 'YYYY-MM-DD') <> v_start or to_char(v_end::date, 'YYYY-MM-DD') <> v_end then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create function public.luxor_write_financial_planning_item(
  p_actor text, p_operation_id uuid, p_expected_revision integer,
  p_kind text, p_payload jsonb, p_schema_version integer, p_expected_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_request jsonb := jsonb_build_object('kind', p_kind, 'expectedRevision', p_expected_revision, 'payload', p_payload, 'schemaVersion', p_schema_version, 'expectedPayload', p_expected_payload);
  v_previous record;
  v_current public.luxor_financial_planning_items%rowtype;
  v_item_id uuid;
  v_next integer;
  v_payload jsonb;
  v_result jsonb;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 or p_operation_id is null or p_kind not in ('goal', 'opening_scenario') or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid planning request';
  end if;
  v_item_id := (p_payload ->> 'id')::uuid;
  if v_item_id is null or coalesce(p_payload ->> 'status', '') not in ('active', 'archived') or (p_payload ->> 'revision')::integer is distinct from coalesce(p_expected_revision, 0) then
    raise exception 'Invalid planning item';
  end if;
  -- Serializes retries using the same actor and operation, including initial creation.
  perform pg_advisory_xact_lock(hashtextextended(p_actor || ':' || p_operation_id::text, 0));
  select request, result into v_previous from public.luxor_financial_planning_operations where actor = p_actor and operation_id = p_operation_id;
  if found then
    if v_previous.request <> v_request then return jsonb_build_object('status', 'conflict', 'currentRevision', null); end if;
    if v_previous.result ->> 'status' = 'saved' then return jsonb_set(v_previous.result, '{status}', '"replayed"'::jsonb); end if;
    return v_previous.result;
  end if;
  -- The contract version is mandatory; no old-signature overload is installed.
  -- A mismatched version is a recorded conflict, never a data conversion.
  if p_schema_version is distinct from 1 then
    v_result := jsonb_build_object('status', 'conflict', 'currentRevision', null);
  elsif not public.luxor_planning_supported_v1(p_kind, p_payload, v_item_id, coalesce(p_expected_revision, 0)) then
    raise exception 'Unsupported planning item';
  elsif (p_expected_revision is null and p_expected_payload is not null)
     or (p_expected_revision is not null and p_expected_payload is null) then
    v_result := jsonb_build_object('status', 'conflict', 'currentRevision', null);
  end if;
  if v_result is null then
  select * into v_current from public.luxor_financial_planning_items where id = v_item_id for update;
  if p_expected_revision is null then
    if found then v_result := jsonb_build_object('status', 'conflict', 'currentRevision', v_current.revision);
    else
      -- Concurrent creates for the same item are serialized, including absence.
      perform pg_advisory_xact_lock(hashtextextended('planning-item:' || v_item_id::text, 0));
      select * into v_current from public.luxor_financial_planning_items where id = v_item_id for update;
      if found then v_result := jsonb_build_object('status', 'conflict', 'currentRevision', v_current.revision);
      else v_next := 0; end if;
    end if;
  elsif not found or v_current.kind <> p_kind or v_current.revision <> p_expected_revision
     or v_current.schema_version is distinct from p_schema_version
     or v_current.payload is distinct from p_expected_payload
     or not public.luxor_planning_supported_v1(v_current.kind, v_current.payload, v_current.id, v_current.revision) then
    v_result := jsonb_build_object('status', 'conflict', 'currentRevision', case when found then v_current.revision else null end);
  else
    v_next := p_expected_revision + 1;
  end if;
  end if;
  if v_result is null then
    v_payload := jsonb_set(p_payload, '{revision}', to_jsonb(v_next));
    insert into public.luxor_financial_planning_items(id, kind, revision, schema_version, payload, updated_by)
      values(v_item_id, p_kind, v_next, p_schema_version, v_payload, p_actor)
      on conflict (id) do update set revision = excluded.revision, schema_version = excluded.schema_version, payload = excluded.payload, updated_by = excluded.updated_by, updated_at = now();
    insert into public.luxor_financial_planning_history(item_id, revision, kind, payload, actor)
      values(v_item_id, v_next, p_kind, v_payload, p_actor);
    v_result := jsonb_build_object('status', 'saved', 'item', jsonb_build_object('kind', p_kind, 'payload', v_payload));
  end if;
  insert into public.luxor_financial_planning_operations(actor, operation_id, request, result) values(p_actor, p_operation_id, v_request, v_result);
  return v_result;
end;
$$;

create function public.luxor_list_financial_planning_items() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_count bigint; v_rows jsonb;
begin
  select count(*), coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'revision', revision, 'schemaVersion', schema_version, 'supportedV1', schema_version = 1 and public.luxor_planning_supported_v1(kind, payload, id, revision), 'payload', payload) order by id), '[]'::jsonb)
    into v_count, v_rows from public.luxor_financial_planning_items;
  if v_count > 10000 then raise exception 'Planning item limit exceeded'; end if;
  return jsonb_build_object('rows', v_rows, 'complete', true);
end;
$$;
revoke all on function public.luxor_write_financial_planning_item(text, uuid, integer, text, jsonb, integer, jsonb) from public, anon, authenticated;
revoke all on function public.luxor_planning_supported_v1(text, jsonb, uuid, integer) from public, anon, authenticated;
grant execute on function public.luxor_planning_supported_v1(text, jsonb, uuid, integer) to service_role;
revoke all on function public.luxor_list_financial_planning_items() from public, anon, authenticated;
grant execute on function public.luxor_write_financial_planning_item(text, uuid, integer, text, jsonb, integer, jsonb) to service_role;
grant execute on function public.luxor_list_financial_planning_items() to service_role;
notify pgrst, 'reload schema';
commit;
