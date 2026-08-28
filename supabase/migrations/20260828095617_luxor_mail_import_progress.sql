-- History migration only. Nothing here sends mail, enables a worker, or switches
-- providers. Browser access is exclusively through authorized portal routes.
create table public.luxor_mail_import_runs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique check (account_id ~ '^[0-9]+$'),
  mailbox text not null,
  started_by text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'review')),
  phase text not null default 'inventory' check (phase in ('inventory', 'archive', 'reconcile')),
  folders jsonb not null check (jsonb_typeof(folders) = 'array' and jsonb_array_length(folders) > 0),
  folder_index integer not null default 0 check (folder_index >= 0),
  stream text not null default 'read' check (stream in ('read', 'unread')),
  page_start bigint not null default 1 check (page_start > 0),
  lease_token uuid,
  lease_until timestamptz,
  failures integer not null default 0 check (failures >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lease_token is null) = (lease_until is null))
);

create table public.luxor_mail_import_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luxor_mail_import_runs(id),
  source_message_id text not null check (source_message_id ~ '^[0-9]+$'),
  folder jsonb not null check (jsonb_typeof(folder) = 'object'),
  message jsonb not null check (jsonb_typeof(message) = 'object'),
  source_conflict boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'verifying', 'verified', 'failed')),
  local_message_id uuid references public.luxor_mail_messages(id),
  failures integer not null default 0 check (failures >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, source_message_id),
  check (status <> 'verified' or (local_message_id is not null and verified_at is not null))
);
create index luxor_mail_import_items_work_idx on public.luxor_mail_import_items(run_id, status, next_attempt_at, id);
create index luxor_mail_import_items_local_idx on public.luxor_mail_import_items(local_message_id);
alter table public.luxor_mail_import_runs enable row level security;
alter table public.luxor_mail_import_items enable row level security;
revoke all on public.luxor_mail_import_runs, public.luxor_mail_import_items from public, anon, authenticated;
grant select, insert, update on public.luxor_mail_import_runs, public.luxor_mail_import_items to service_role;

-- Persist an entire page and its cursor in one transaction. A failed/replayed
-- response cannot skip inventory, and an expired worker cannot advance a run.
create function public.luxor_commit_mail_import_page(p_run_id uuid, p_token uuid, p_messages jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  r public.luxor_mail_import_runs;
  m jsonb;
  f jsonb;
  next_folder integer;
  next_stream text;
  next_start bigint;
begin
  select * into r from public.luxor_mail_import_runs where id = p_run_id for update;
  if not found or p_token is null or r.lease_until is null or r.status <> 'active' or r.phase <> 'inventory'
    or r.lease_token is distinct from p_token or r.lease_until <= clock_timestamp() then return false; end if;
  if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_array_length(p_messages) > 100 then
    raise exception 'Invalid history page';
  end if;
  f := r.folders -> r.folder_index;
  if f is null then raise exception 'Missing history folder'; end if;
  for m in select value from jsonb_array_elements(p_messages) loop
    if (m->>'id') is null or (m->>'id') !~ '^[0-9]+$'
      or (m->>'threadId') is null or (m->>'threadId') !~ '^[0-9]+$'
      or (m->>'folderId') is distinct from (f->>'id')
      or (m->>'isRead') is distinct from ((r.stream = 'read')::text) then
      raise exception 'History item does not match cursor';
    end if;
    insert into public.luxor_mail_import_items(run_id, source_message_id, folder, message)
    values (r.id, m->>'id', f, m)
    on conflict (run_id, source_message_id) do update set
      source_conflict = public.luxor_mail_import_items.source_conflict
        or public.luxor_mail_import_items.folder is distinct from excluded.folder
        or public.luxor_mail_import_items.message is distinct from excluded.message,
      updated_at = clock_timestamp();
  end loop;
  next_folder := r.folder_index;
  next_stream := r.stream;
  next_start := r.page_start + jsonb_array_length(p_messages);
  if jsonb_array_length(p_messages) < 100 then
    next_start := 1;
    if r.stream = 'read' then next_stream := 'unread';
    else next_folder := next_folder + 1; next_stream := 'read'; end if;
  end if;
  update public.luxor_mail_import_runs set folder_index = next_folder, stream = next_stream, page_start = next_start,
    phase = case when next_folder >= jsonb_array_length(r.folders) then 'archive' else 'inventory' end,
    lease_token = null, lease_until = null, failures = 0, last_error = null,
    next_attempt_at = clock_timestamp(), updated_at = clock_timestamp() where id = r.id;
  return true;
end;
$$;

create function public.luxor_commit_mail_import_item(p_run_id uuid, p_token uuid, p_item_id uuid,
  p_status text, p_local_id uuid, p_failures integer, p_next_attempt timestamptz, p_error text, p_verified_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs;
begin
  select * into r from public.luxor_mail_import_runs where id = p_run_id for update;
  if not found or p_token is null or r.lease_until is null or r.status <> 'active' or r.phase <> 'archive'
    or r.lease_token is distinct from p_token or r.lease_until <= clock_timestamp() then return false; end if;
  update public.luxor_mail_import_items set status = p_status, local_message_id = p_local_id,
    failures = p_failures, next_attempt_at = p_next_attempt, last_error = p_error,
    verified_at = p_verified_at, updated_at = clock_timestamp()
  where id = p_item_id and run_id = r.id and status in ('pending', 'verifying');
  if not found then return false; end if;
  update public.luxor_mail_import_runs set lease_token = null, lease_until = null,
    failures = 0, last_error = null, next_attempt_at = clock_timestamp(), updated_at = clock_timestamp() where id = r.id;
  return true;
end;
$$;

-- Avoid returning bodies or a capped list to compute progress counts.
create function public.luxor_mail_import_counts(p_run_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'verifying', count(*) filter (where status = 'verifying'),
    'verified', count(*) filter (where status = 'verified'),
    'failed', count(*) filter (where status = 'failed'),
    'sourceConflicts', count(*) filter (where source_conflict))
  from public.luxor_mail_import_items where run_id = p_run_id;
$$;

-- POST bodies, not enormous URL filters, carry MIME manifests for compare/swap.
create function public.luxor_compare_import_metadata(p_id uuid, p_expected jsonb, p_next jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.luxor_mail_messages set metadata = p_next
  where id = p_id and provider = 'zoho' and metadata = p_expected
    and metadata->>'importComplete' = 'true';
  return found;
end;
$$;
revoke all on function public.luxor_commit_mail_import_page(uuid, uuid, jsonb),
  public.luxor_mail_import_counts(uuid), public.luxor_compare_import_metadata(uuid, jsonb, jsonb),
  public.luxor_commit_mail_import_item(uuid, uuid, uuid, text, uuid, integer, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.luxor_commit_mail_import_page(uuid, uuid, jsonb),
  public.luxor_mail_import_counts(uuid), public.luxor_compare_import_metadata(uuid, jsonb, jsonb),
  public.luxor_commit_mail_import_item(uuid, uuid, uuid, text, uuid, integer, timestamptz, text, timestamptz) to service_role;
