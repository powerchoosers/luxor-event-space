-- Repeatable, read-only source inventories. These compare observations; they do
-- not release staged mail, delete originals, or certify calendar/cutover readiness.
create table public.luxor_mail_source_passes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luxor_mail_import_runs(id),
  generation integer not null check (generation > 0),
  status text not null default 'scanning' check (status in ('scanning','finalizing','complete')),
  folders jsonb not null check (jsonb_typeof(folders) = 'array' and jsonb_array_length(folders) > 0),
  folder_index integer not null default 0 check (folder_index >= 0),
  stream text not null default 'read' check (stream in ('read','unread')),
  page_start bigint not null default 1 check (page_start > 0),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  report jsonb,
  unique(run_id, generation),
  check ((status = 'complete') = (completed_at is not null and report is not null))
);
create unique index luxor_mail_source_pass_active_idx on public.luxor_mail_source_passes(run_id) where status <> 'complete';
create table public.luxor_mail_source_observations (
  pass_id uuid not null references public.luxor_mail_source_passes(id),
  source_message_id text not null check (source_message_id ~ '^[0-9]+$'),
  folder jsonb not null check (jsonb_typeof(folder) = 'object'),
  message jsonb not null check (jsonb_typeof(message) = 'object'),
  repeated boolean not null default false,
  primary key(pass_id, source_message_id)
);
alter table public.luxor_mail_source_passes enable row level security;
alter table public.luxor_mail_source_observations enable row level security;
revoke all on public.luxor_mail_source_passes, public.luxor_mail_source_observations from public, anon, authenticated;
grant select, insert, update on public.luxor_mail_source_passes, public.luxor_mail_source_observations to service_role;

-- Ignore API ordering, but preserve folder names/paths/types as source evidence.
create function public.luxor_mail_source_folders(p_folders jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare f jsonb;
begin
  if jsonb_typeof(p_folders) is distinct from 'array' or jsonb_array_length(p_folders) = 0 then
    raise exception 'Incomplete source folders'; end if;
  for f in select value from jsonb_array_elements(p_folders) loop
    if jsonb_typeof(f) is distinct from 'object' or f->>'id' is null or f->>'id' !~ '^[0-9]+$'
      or jsonb_typeof(f->'name') is distinct from 'string' or jsonb_typeof(f->'path') is distinct from 'string'
      or jsonb_typeof(f->'type') is distinct from 'string' then raise exception 'Invalid source folder'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_folders)) <> jsonb_array_length(p_folders) then
    raise exception 'Duplicate source folders'; end if;
  return (select jsonb_agg(value order by value->>'id') from jsonb_array_elements(p_folders));
end;
$$;

create function public.luxor_start_mail_source_pass(p_run_id uuid, p_expected_generation integer, p_folders jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; g integer; f jsonb;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or r.status <> 'review' or r.phase <> 'reconcile'
    or r.lease_until > clock_timestamp() then return false; end if;
  select coalesce(max(generation),0) into g from public.luxor_mail_source_passes where run_id=r.id;
  if g is distinct from p_expected_generation or exists (
    select 1 from public.luxor_mail_source_passes where run_id=r.id and status <> 'complete'
  ) then return false; end if;
  f := public.luxor_mail_source_folders(p_folders);
  insert into public.luxor_mail_source_passes(run_id,generation,folders) values (r.id,g+1,f);
  update public.luxor_mail_import_runs set status='active', lease_token=null, lease_until=null,
    failures=0, last_error=null, next_attempt_at=clock_timestamp(), updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create function public.luxor_commit_mail_source_page(p_run_id uuid, p_token uuid, p_pass_id uuid, p_messages jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; s public.luxor_mail_source_passes; m jsonb; f jsonb;
  next_folder integer; next_stream text; next_start bigint;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or p_token is null or r.status <> 'active' or r.phase <> 'reconcile'
    or r.lease_token is distinct from p_token or r.lease_until is null or r.lease_until <= clock_timestamp() then return false; end if;
  select * into s from public.luxor_mail_source_passes where id=p_pass_id and run_id=r.id and status='scanning' for update;
  if not found then return false; end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) > 100 then
    raise exception 'Invalid source page'; end if;
  f := s.folders->s.folder_index;
  if f is null then raise exception 'Missing source folder'; end if;
  for m in select value from jsonb_array_elements(p_messages) loop
    if m->>'id' is null or m->>'id' !~ '^[0-9]+$' or m->>'threadId' is null or m->>'threadId' !~ '^[0-9]+$'
      or m->>'folderId' is distinct from f->>'id' or m->>'isRead' is distinct from ((s.stream='read')::text) then
      raise exception 'Source item does not match cursor'; end if;
    -- Even an identical repeat can indicate a shifted offset page. Do not hide it.
    insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message)
    values (s.id,m->>'id',f,m) on conflict (pass_id,source_message_id) do update set repeated=true;
    -- New arrivals join the same bounded archive queue; existing evidence is immutable.
    insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,created_at)
    values (r.id,m->>'id',f,m,clock_timestamp()) on conflict (run_id,source_message_id) do nothing;
  end loop;
  next_folder := s.folder_index; next_stream := s.stream; next_start := s.page_start + jsonb_array_length(p_messages);
  if jsonb_array_length(p_messages) < 100 then
    next_start := 1;
    if s.stream='read' then next_stream := 'unread'; else next_folder := next_folder+1; next_stream := 'read'; end if;
  end if;
  update public.luxor_mail_source_passes set folder_index=next_folder,stream=next_stream,page_start=next_start,
    status=case when next_folder >= jsonb_array_length(s.folders) then 'finalizing' else 'scanning' end where id=s.id;
  update public.luxor_mail_import_runs set lease_token=null,lease_until=null,failures=0,last_error=null,
    next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create function public.luxor_finish_mail_source_pass(p_run_id uuid,p_token uuid,p_pass_id uuid,p_folders jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; s public.luxor_mail_source_passes; previous public.luxor_mail_source_passes;
  v_report jsonb; folders_changed boolean; previous_folders_changed boolean; work_left boolean;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or p_token is null or r.status <> 'active' or r.phase <> 'reconcile'
    or r.lease_token is distinct from p_token or r.lease_until is null or r.lease_until <= clock_timestamp() then return false; end if;
  select * into s from public.luxor_mail_source_passes where id=p_pass_id and run_id=r.id and status='finalizing' for update;
  if not found then return false; end if;
  folders_changed := s.folders is distinct from public.luxor_mail_source_folders(p_folders);
  select * into previous from public.luxor_mail_source_passes where run_id=r.id and generation=s.generation-1 and status='complete';
  previous_folders_changed := s.folders is distinct from coalesce(previous.folders,public.luxor_mail_source_folders(r.folders));
  with baseline as (
    select source_message_id,folder,message from public.luxor_mail_source_observations where pass_id=previous.id
    union all
    select source_message_id,folder,message from public.luxor_mail_import_items
      where previous.id is null and run_id=r.id and created_at < s.started_at
  ), latest as (select * from public.luxor_mail_source_observations where pass_id=s.id)
  select jsonb_build_object(
    'observed',count(*) filter (where n.source_message_id is not null),
    'added',count(*) filter (where b.source_message_id is null),
    'missing',count(*) filter (where n.source_message_id is null),
    'moved',count(*) filter (where b.source_message_id is not null and n.source_message_id is not null and b.folder->>'id' is distinct from n.folder->>'id'),
    'changed',count(*) filter (where b.source_message_id is not null and n.source_message_id is not null and b.message is distinct from n.message),
    'repeated',count(*) filter (where n.repeated)
  ) into v_report from baseline b full join latest n using(source_message_id);
  v_report := v_report || jsonb_build_object('comparedWith',case when previous.id is null then 'initial_inventory' else 'previous_pass' end,
    'foldersChangedDuringScan',folders_changed,'foldersChangedSincePrevious',previous_folders_changed,
    'matchesPrevious', previous.id is not null and not folders_changed and not previous_folders_changed
      and not (previous.report->>'foldersChangedDuringScan')::boolean and (previous.report->>'repeated')::bigint=0
      and (v_report->>'added')::bigint=0 and (v_report->>'missing')::bigint=0 and (v_report->>'changed')::bigint=0 and (v_report->>'repeated')::bigint=0);
  update public.luxor_mail_source_passes set status='complete',completed_at=clock_timestamp(),report=v_report where id=s.id;
  select exists(select 1 from public.luxor_mail_import_items where run_id=r.id and status in ('pending','verifying')) into work_left;
  update public.luxor_mail_import_runs set phase=case when work_left then 'archive' else 'reconcile' end,
    status=case when work_left then 'active' else 'review' end, lease_token=null,lease_until=null,failures=0,
    last_error=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

-- All controls serialize with the same run lock as page/item commits. Retrying
-- failed items cannot race a resume and reset work under an active worker.
create function public.luxor_control_mail_import(p_run_id uuid,p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; source_active boolean;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found then return false; end if;
  if p_action='pause' then
    if r.status <> 'active' then return false; end if;
    update public.luxor_mail_import_runs set status='paused',updated_at=clock_timestamp() where id=r.id;
    return true;
  end if;
  if p_action not in ('resume','retry_failed') or p_action is null or r.status='active' or r.lease_until > clock_timestamp() then return false; end if;
  select exists(select 1 from public.luxor_mail_source_passes where run_id=r.id and status <> 'complete') into source_active;
  if p_action='resume' and r.phase='reconcile' and not source_active then return false; end if;
  if p_action='retry_failed' then
    if source_active then return false; end if;
    update public.luxor_mail_import_items set status='pending',failures=0,last_error=null,
      next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where run_id=r.id and status='failed';
    if not found then return false; end if;
  end if;
  update public.luxor_mail_import_runs set status='active',phase=case when p_action='retry_failed' then 'archive' else phase end,
    lease_token=null,lease_until=null,failures=0,last_error=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;
revoke all on function public.luxor_mail_source_folders(jsonb), public.luxor_start_mail_source_pass(uuid,integer,jsonb),
  public.luxor_commit_mail_source_page(uuid,uuid,uuid,jsonb), public.luxor_finish_mail_source_pass(uuid,uuid,uuid,jsonb),
  public.luxor_control_mail_import(uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_mail_source_folders(jsonb), public.luxor_start_mail_source_pass(uuid,integer,jsonb),
  public.luxor_commit_mail_source_page(uuid,uuid,uuid,jsonb), public.luxor_finish_mail_source_pass(uuid,uuid,uuid,jsonb),
  public.luxor_control_mail_import(uuid,text) to service_role;
