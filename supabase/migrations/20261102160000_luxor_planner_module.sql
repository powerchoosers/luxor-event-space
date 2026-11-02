-- Luxor Planner: additive planning records behind the signed portal session.
-- Event and payment records remain in their existing source tables.

create table if not exists public.luxor_planner_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  event_type text,
  description text,
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.luxor_planner_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.luxor_planner_checklists(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text,
  category text,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  days_before_event integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (checklist_id, sort_order)
);

create table if not exists public.luxor_planner_tasks (
  id uuid primary key default gen_random_uuid(),
  -- Nullable only after the source booking is deleted; preserve the planning record.
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  checklist_item_id uuid references public.luxor_planner_checklist_items(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text,
  category text,
  assigned_to text,
  due_date date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (booking_id, checklist_item_id)
);

create index if not exists luxor_planner_tasks_booking_due_idx
  on public.luxor_planner_tasks (booking_id, due_date) where status <> 'completed';
create index if not exists luxor_planner_tasks_due_idx
  on public.luxor_planner_tasks (due_date) where status <> 'completed';

create table if not exists public.luxor_planner_meetings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  meeting_type text not null default 'design_consultation',
  video_url text,
  agenda text,
  internal_notes text,
  client_decisions text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_by text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists luxor_planner_meetings_starts_idx
  on public.luxor_planner_meetings (starts_at) where status = 'scheduled';

create table if not exists public.luxor_planner_designs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  source_template_id uuid references public.luxor_planner_designs(id) on delete set null,
  design_kind text not null check (design_kind in ('template','event_concept')),
  category text not null default 'design_template',
  name text not null check (char_length(btrim(name)) between 1 and 160),
  event_type text,
  design_style text,
  palette jsonb not null default '[]'::jsonb check (jsonb_typeof(palette) = 'array'),
  guest_count_min integer check (guest_count_min is null or guest_count_min >= 0),
  guest_count_max integer check (guest_count_max is null or guest_count_max >= 0),
  description text,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  internal_notes text,
  status text not null default 'draft' check (status in ('draft','ready_to_present','presented','revision_requested','approved')),
  revision integer not null default 1 check (revision > 0),
  approved_revision integer,
  approved_at timestamptz,
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  -- Event concepts remain in history after their booking FK is cleared.
  check ((design_kind = 'template' and booking_id is null) or design_kind = 'event_concept'),
  check (guest_count_min is null or guest_count_max is null or guest_count_max >= guest_count_min)
);
create index if not exists luxor_planner_designs_library_idx
  on public.luxor_planner_designs (category, updated_at desc) where design_kind = 'template' and archived_at is null;
create index if not exists luxor_planner_designs_booking_idx
  on public.luxor_planner_designs (booking_id, updated_at desc) where design_kind = 'event_concept';

-- Revision snapshots live in their own append-only route-managed table so the
-- history can be paginated and is not truncated as a JSON column grows.
create table if not exists public.luxor_planner_design_revisions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.luxor_planner_designs(id) on delete cascade,
  revision integer not null check (revision > 0),
  saved_at timestamptz not null default timezone('utc'::text, now()),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  unique (design_id, revision)
);
create index if not exists luxor_planner_design_revisions_page_idx
  on public.luxor_planner_design_revisions (design_id, revision desc);

create table if not exists public.luxor_planner_vendors (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(btrim(business_name)) between 1 and 200),
  contact_person text,
  email text,
  phone text,
  website text,
  category text not null default 'other',
  services text,
  internal_notes text,
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists luxor_planner_vendors_name_idx
  on public.luxor_planner_vendors (lower(business_name)) where archived_at is null;

create table if not exists public.luxor_planner_event_vendors (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  vendor_id uuid not null references public.luxor_planner_vendors(id) on delete restrict,
  services text,
  arrival_at timestamptz,
  setup_at timestamptz,
  departure_at timestamptz,
  access_instructions text,
  internal_notes text,
  required_documents jsonb not null default '[]'::jsonb check (jsonb_typeof(required_documents) = 'array'),
  status text not null default 'proposed' check (status in ('proposed','contacted','confirmed','documents_pending','ready_for_event','completed','cancelled')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (booking_id, vendor_id)
);

create table if not exists public.luxor_planner_files (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  vendor_id uuid references public.luxor_planner_vendors(id) on delete cascade,
  design_id uuid references public.luxor_planner_designs(id) on delete set null,
  event_vendor_id uuid references public.luxor_planner_event_vendors(id) on delete set null,
  category text not null default 'other',
  title text not null check (char_length(btrim(title)) between 1 and 200),
  file_name text not null,
  storage_path text not null unique,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  expires_at date,
  internal_only boolean not null default true,
  uploaded_by text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (num_nonnulls(booking_id, vendor_id, design_id, event_vendor_id) <= 1)
);
create index if not exists luxor_planner_files_booking_idx on public.luxor_planner_files (booking_id, created_at desc);
create index if not exists luxor_planner_files_vendor_idx on public.luxor_planner_files (vendor_id, created_at desc);

-- Attachment membership and the matching design revision must commit together.
-- Storage bytes are staged in the private bucket before this call; deletion of
-- old bytes happens only after it commits. Locking the design row serializes
-- uploads/deletes against each other and against revision-checked design edits.
create or replace function public.luxor_planner_commit_attachment_change(
  p_design_id uuid,
  p_expected_revision integer,
  p_operation text,
  p_revision_snapshot jsonb,
  p_file jsonb default null,
  p_file_id uuid default null
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_design public.luxor_planner_designs%rowtype;
  current_file public.luxor_planner_files%rowtype;
  saved_file public.luxor_planner_files%rowtype;
begin
  if p_operation not in ('upload', 'delete') then
    raise exception 'Unsupported Planner attachment operation.' using errcode = '22023';
  end if;

  select * into current_design
  from public.luxor_planner_designs
  where id = p_design_id
  for update;

  if not found then
    return jsonb_build_object('committed', false, 'reason', 'design_not_found');
  end if;
  if current_design.revision <> p_expected_revision then
    return jsonb_build_object('committed', false, 'reason', 'revision_conflict', 'current_revision', current_design.revision);
  end if;

  if p_operation = 'upload' then
    if p_file is null
      or nullif(p_file->>'id', '') is null
      or (p_file->>'design_id')::uuid is distinct from p_design_id
      or coalesce(p_file->>'category', '') = 'design_revision_snapshot' then
      raise exception 'Invalid staged Planner design attachment.' using errcode = '22023';
    end if;
  else
    select * into current_file
    from public.luxor_planner_files
    where id = p_file_id and design_id = p_design_id and category <> 'design_revision_snapshot'
    for update;
    if not found then
      return jsonb_build_object('committed', false, 'reason', 'file_not_found', 'current_revision', current_design.revision);
    end if;
  end if;

  insert into public.luxor_planner_design_revisions (design_id, revision, saved_at, snapshot)
  values (p_design_id, p_expected_revision, coalesce(nullif(p_revision_snapshot->>'saved_at', '')::timestamptz, now()), p_revision_snapshot);

  if p_operation = 'upload' then
    insert into public.luxor_planner_files (
      id, booking_id, vendor_id, design_id, event_vendor_id, category, title, file_name,
      storage_path, content_type, size_bytes, expires_at, internal_only, uploaded_by, created_at, updated_at
    ) values (
      (p_file->>'id')::uuid, nullif(p_file->>'booking_id', '')::uuid, nullif(p_file->>'vendor_id', '')::uuid,
      (p_file->>'design_id')::uuid, nullif(p_file->>'event_vendor_id', '')::uuid, p_file->>'category', p_file->>'title',
      p_file->>'file_name', p_file->>'storage_path', p_file->>'content_type', (p_file->>'size_bytes')::integer,
      nullif(p_file->>'expires_at', '')::date, coalesce((p_file->>'internal_only')::boolean, true), p_file->>'uploaded_by',
      coalesce(nullif(p_file->>'created_at', '')::timestamptz, now()), coalesce(nullif(p_file->>'updated_at', '')::timestamptz, now())
    ) returning * into saved_file;
  else
    delete from public.luxor_planner_files where id = p_file_id and design_id = p_design_id;
  end if;

  update public.luxor_planner_designs
  set revision = revision + 1,
      status = case when status = 'approved' then 'revision_requested' else status end,
      approved_revision = null,
      approved_at = null,
      updated_at = now()
  where id = p_design_id
  returning * into current_design;

  return jsonb_build_object(
    'committed', true,
    'design', to_jsonb(current_design),
    'file', case when p_operation = 'upload' then to_jsonb(saved_file) else null end,
    'deleted_storage_path', case when p_operation = 'delete' then current_file.storage_path else null end
  );
end;
$$;

-- Serialize design edits and approval transitions through the same row lock as
-- attachment membership changes. This prevents competing writers from staging
-- two snapshots for one revision or applying approval to a stale asset set.
create or replace function public.luxor_planner_save_design_revision(
  p_design_id uuid,
  p_expected_revision integer,
  p_revision_snapshot jsonb,
  p_design jsonb
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_design public.luxor_planner_designs%rowtype;
begin
  select * into current_design
  from public.luxor_planner_designs
  where id = p_design_id
  for update;

  if not found then
    return jsonb_build_object('committed', false, 'reason', 'design_not_found');
  end if;
  if current_design.revision <> p_expected_revision then
    return jsonb_build_object('committed', false, 'reason', 'revision_conflict', 'current_revision', current_design.revision);
  end if;
  if (p_design->>'booking_id')::uuid is distinct from current_design.booking_id
    or p_design->>'design_kind' is distinct from current_design.design_kind
    or nullif(p_design->>'source_template_id', '')::uuid is distinct from current_design.source_template_id then
    raise exception 'Planner design event and source links cannot be changed.' using errcode = '22023';
  end if;

  insert into public.luxor_planner_design_revisions (design_id, revision, saved_at, snapshot)
  values (p_design_id, p_expected_revision, coalesce(nullif(p_revision_snapshot->>'saved_at', '')::timestamptz, now()), p_revision_snapshot);

  update public.luxor_planner_designs
  set category = p_design->>'category',
      name = p_design->>'name',
      event_type = p_design->>'event_type',
      design_style = p_design->>'design_style',
      palette = coalesce(p_design->'palette', '[]'::jsonb),
      guest_count_min = nullif(p_design->>'guest_count_min', '')::integer,
      guest_count_max = nullif(p_design->>'guest_count_max', '')::integer,
      description = p_design->>'description',
      content = coalesce(p_design->'content', '{}'::jsonb),
      internal_notes = p_design->>'internal_notes',
      status = p_design->>'status',
      revision = p_expected_revision + 1,
      approved_revision = case when p_design->>'status' = 'approved' then p_expected_revision + 1 else null end,
      approved_at = case when p_design->>'status' = 'approved' then coalesce(nullif(p_design->>'approved_at', '')::timestamptz, now()) else null end,
      updated_at = now()
  where id = p_design_id
  returning * into current_design;

  return jsonb_build_object('committed', true, 'design', to_jsonb(current_design));
end;
$$;


-- Milestone tasks can point to an event-specific meeting and private document.
alter table public.luxor_planner_tasks
  add column if not exists milestone_meeting_id uuid references public.luxor_planner_meetings(id) on delete set null,
  add column if not exists milestone_file_id uuid references public.luxor_planner_files(id) on delete set null;
create index if not exists luxor_planner_tasks_milestone_meeting_idx on public.luxor_planner_tasks (milestone_meeting_id) where milestone_meeting_id is not null;
create index if not exists luxor_planner_tasks_milestone_file_idx on public.luxor_planner_tasks (milestone_file_id) where milestone_file_id is not null;

-- Selective client presentations freeze a sanitized design revision and a
-- separately allowlisted set of private image copies. Booking deletion keeps
-- every Planner row but severs the booking link and immediately revokes live
-- client access. Tokens and one-time verification challenges are server-only.
create table if not exists public.luxor_planner_presentations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.luxor_bookings(id) on delete set null,
  design_id uuid references public.luxor_planner_designs(id) on delete set null,
  design_revision integer not null check (design_revision > 0),
  design_snapshot jsonb not null check (jsonb_typeof(design_snapshot) = 'object'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  lifecycle_status text not null default 'preparing' check (lifecycle_status in ('preparing','ready','queued')),
  expected_asset_count integer not null default 0 check (expected_asset_count between 0 and 20),
  preparation_claim_id uuid,
  preparation_lease_until timestamptz,
  recipient_email text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_ciphertext text not null,
  created_by text not null,
  expires_at timestamptz not null,
  invitation_email_job_id uuid references public.luxor_email_jobs(id) on delete set null,
  sent_at timestamptz,
  revoked_at timestamptz,
  client_action text check (client_action is null or client_action in ('feedback','approved')),
  client_note text check (client_note is null or char_length(client_note) <= 4000),
  response_revision integer,
  response_submission_key text,
  response_ip_hash text,
  response_user_agent text,
  responded_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check ((client_action is null and responded_at is null and response_revision is null)
    or (client_action is not null and responded_at is not null and response_revision = design_revision)),
  check ((lifecycle_status = 'preparing' and preparation_claim_id is not null and preparation_lease_until is not null)
    or (lifecycle_status <> 'preparing' and preparation_claim_id is null and preparation_lease_until is null))
);
create index if not exists luxor_planner_presentations_booking_idx on public.luxor_planner_presentations (booking_id, created_at desc);
create index if not exists luxor_planner_presentations_design_idx on public.luxor_planner_presentations (design_id, created_at desc);

-- A single idempotency key owns preparation. Retries with a matching request
-- fingerprint can observe progress or continue queue reconciliation, but they
-- cannot queue a client link until the original request marks all assets ready.
create or replace function public.luxor_planner_begin_presentation(
  p_id uuid, p_booking_id uuid, p_design_id uuid, p_design_revision integer,
  p_design_snapshot jsonb, p_request_fingerprint text, p_expected_asset_count integer,
  p_recipient_email text, p_token_hash text, p_token_ciphertext text,
  p_created_by text, p_expires_at timestamptz, p_claim_id uuid
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_row public.luxor_planner_presentations%rowtype;
  previous_claim uuid;
  abandoned_paths jsonb := '[]'::jsonb;
begin
  if p_id is null or p_booking_id is null or p_design_id is null or p_design_revision is null or p_design_revision < 1
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[a-f0-9]{64}$'
    or p_expected_asset_count is null or p_expected_asset_count < 0 or p_expected_asset_count > 20
    or p_recipient_email is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_token_ciphertext is null
    or p_created_by is null or p_expires_at is null or p_expires_at <= now() or p_claim_id is null
    or p_design_snapshot is null or jsonb_typeof(p_design_snapshot) <> 'object' then
    raise exception 'Invalid Planner presentation reservation.' using errcode = '22023';
  end if;
  insert into public.luxor_planner_presentations(
    id,booking_id,design_id,design_revision,design_snapshot,request_fingerprint,expected_asset_count,
    recipient_email,token_hash,token_ciphertext,created_by,expires_at,lifecycle_status,preparation_claim_id,preparation_lease_until
  ) values (
    p_id,p_booking_id,p_design_id,p_design_revision,p_design_snapshot,p_request_fingerprint,p_expected_asset_count,
    p_recipient_email,p_token_hash,p_token_ciphertext,p_created_by,p_expires_at,'preparing',p_claim_id,now()+interval '2 minutes'
  ) on conflict (id) do nothing returning * into current_row;
  if found then return jsonb_build_object('reserved',true,'created',true,'state','preparing','presentation',to_jsonb(current_row)); end if;
  select * into current_row from public.luxor_planner_presentations where id=p_id for update;
  if not found then return jsonb_build_object('reserved',false,'state','unavailable'); end if;
  if current_row.request_fingerprint is distinct from p_request_fingerprint then
    return jsonb_build_object('reserved',false,'state','conflict');
  end if;
  if current_row.lifecycle_status = 'preparing' then
    if current_row.preparation_lease_until > now() then
      return jsonb_build_object('reserved',false,'state','preparing','lease_until',current_row.preparation_lease_until);
    end if;
    previous_claim := current_row.preparation_claim_id;
    select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into abandoned_paths
    from public.luxor_planner_presentation_files where presentation_id=p_id and preparation_claim_id=previous_claim;
    delete from public.luxor_planner_presentation_files where presentation_id=p_id and preparation_claim_id=previous_claim;
    update public.luxor_planner_presentations set preparation_claim_id=p_claim_id,preparation_lease_until=now()+interval '2 minutes',updated_at=now()
    where id=p_id returning * into current_row;
    return jsonb_build_object('reserved',true,'created',false,'reclaimed',true,'state','preparing','presentation',to_jsonb(current_row),'abandoned_paths',abandoned_paths);
  end if;
  return jsonb_build_object('reserved',false,'state',current_row.lifecycle_status,'presentation',to_jsonb(current_row));
end;
$$;

create or replace function public.luxor_planner_mark_presentation_ready(p_id uuid, p_request_fingerprint text, p_claim_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare current_row public.luxor_planner_presentations%rowtype; attached_count integer;
begin
  select * into current_row from public.luxor_planner_presentations where id=p_id for update;
  if not found or current_row.request_fingerprint is distinct from p_request_fingerprint then return jsonb_build_object('ready',false,'reason','conflict'); end if;
  if current_row.lifecycle_status in ('ready','queued') then return jsonb_build_object('ready',true,'state',current_row.lifecycle_status); end if;
  if current_row.preparation_claim_id is distinct from p_claim_id or current_row.preparation_lease_until <= now() then return jsonb_build_object('ready',false,'reason','lease_lost'); end if;
  select count(*) into attached_count from public.luxor_planner_presentation_files where presentation_id=p_id and preparation_claim_id=p_claim_id;
  if attached_count <> current_row.expected_asset_count then return jsonb_build_object('ready',false,'reason','assets_incomplete'); end if;
  update public.luxor_planner_presentations set lifecycle_status='ready',preparation_claim_id=null,preparation_lease_until=null,updated_at=now() where id=p_id;
  return jsonb_build_object('ready',true,'state','ready');
end;
$$;

create or replace function public.luxor_planner_abort_presentation_preparation(p_id uuid, p_request_fingerprint text, p_claim_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare current_row public.luxor_planner_presentations%rowtype;
begin
  select * into current_row from public.luxor_planner_presentations where id=p_id for update;
  if not found then return jsonb_build_object('aborted',true,'already_removed',true); end if;
  if current_row.request_fingerprint is distinct from p_request_fingerprint or current_row.lifecycle_status <> 'preparing' or current_row.invitation_email_job_id is not null or current_row.preparation_claim_id is distinct from p_claim_id then
    return jsonb_build_object('aborted',false,'reason','already_ready_or_conflict');
  end if;
  delete from public.luxor_planner_presentations where id=p_id;
  return jsonb_build_object('aborted',true);
end;
$$;

create table if not exists public.luxor_planner_presentation_files (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.luxor_planner_presentations(id) on delete cascade,
  source_file_id uuid,
  file_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_path text not null unique,
  preparation_claim_id uuid not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (presentation_id, source_file_id)
);
create index if not exists luxor_planner_presentation_files_presentation_idx on public.luxor_planner_presentation_files (presentation_id, created_at);

create or replace function public.luxor_planner_register_presentation_file(
  p_id uuid, p_request_fingerprint text, p_claim_id uuid, p_file jsonb
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare current_row public.luxor_planner_presentations%rowtype; inserted_id uuid;
begin
  select * into current_row from public.luxor_planner_presentations where id=p_id for update;
  if not found or current_row.lifecycle_status <> 'preparing' or current_row.request_fingerprint is distinct from p_request_fingerprint
    or current_row.preparation_claim_id is distinct from p_claim_id or current_row.preparation_lease_until <= now() then
    return jsonb_build_object('registered',false,'reason','lease_lost');
  end if;
  if p_file is null or jsonb_typeof(p_file) <> 'object' or (p_file->>'storage_path') not like ('presentations/'||p_id::text||'/'||p_claim_id::text||'/%') then
    raise exception 'Invalid Planner presentation attachment.' using errcode = '22023';
  end if;
  insert into public.luxor_planner_presentation_files(id,presentation_id,source_file_id,file_name,content_type,size_bytes,storage_path,preparation_claim_id)
  values ((p_file->>'id')::uuid,p_id,nullif(p_file->>'source_file_id','')::uuid,p_file->>'file_name',p_file->>'content_type',(p_file->>'size_bytes')::integer,p_file->>'storage_path',p_claim_id)
  on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select id into inserted_id from public.luxor_planner_presentation_files
    where id=(p_file->>'id')::uuid and presentation_id=p_id and preparation_claim_id=p_claim_id and storage_path=p_file->>'storage_path';
    if inserted_id is null then return jsonb_build_object('registered',false,'reason','conflict'); end if;
  end if;
  update public.luxor_planner_presentations set preparation_lease_until=now()+interval '2 minutes',updated_at=now() where id=p_id;
  return jsonb_build_object('registered',true,'id',inserted_id);
end;
$$;

create table if not exists public.luxor_planner_presentation_challenges (
  presentation_id uuid primary key references public.luxor_planner_presentations(id) on delete cascade,
  generation_id uuid not null,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  code_ciphertext text,
  code_expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 6),
  request_window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count between 1 and 3),
  last_sent_at timestamptz not null,
  verified_at timestamptz,
  delivery_state text not null default 'pending' check (delivery_state in ('pending','sending','sent')),
  delivery_job_id uuid references public.luxor_email_jobs(id) on delete set null,
  delivered_at timestamptz,
  last_ip_hash text check (last_ip_hash is null or last_ip_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.luxor_planner_issue_presentation_code(
  p_presentation_id uuid, p_generation_id uuid, p_code_hash text, p_code_ciphertext text, p_ip_hash text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  presentation public.luxor_planner_presentations%rowtype;
  challenge public.luxor_planner_presentation_challenges%rowtype;
  window_start timestamptz;
  next_count integer;
begin
  if p_generation_id is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' or p_code_ciphertext is null or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Planner verification request.' using errcode = '22023';
  end if;
  select * into presentation from public.luxor_planner_presentations where id = p_presentation_id for update;
  if not found or presentation.booking_id is null or presentation.revoked_at is not null or presentation.expires_at <= now() then
    return jsonb_build_object('issued', false, 'reason', 'unavailable');
  end if;
  if presentation.client_action is not null then return jsonb_build_object('issued', false, 'reason', 'already_responded'); end if;
  next_count := 1;
  select * into challenge from public.luxor_planner_presentation_challenges where presentation_id = p_presentation_id for update;
  if found then
    if challenge.last_sent_at > now() - interval '60 seconds' then
      return jsonb_build_object('issued', false, 'reason', 'too_soon');
    end if;
    if challenge.delivery_state = 'sending' and challenge.last_sent_at > now() - interval '3 minutes' then
      return jsonb_build_object('issued', false, 'reason', 'send_in_progress');
    end if;
    window_start := case when challenge.request_window_started_at > now() - interval '1 hour' then challenge.request_window_started_at else now() end;
    next_count := case when window_start = challenge.request_window_started_at then challenge.request_count + 1 else 1 end;
    if next_count > 3 then return jsonb_build_object('issued', false, 'reason', 'rate_limited'); end if;
    update public.luxor_planner_presentation_challenges set generation_id = p_generation_id, code_hash = p_code_hash,
      code_ciphertext = p_code_ciphertext, code_expires_at = least(presentation.expires_at, now() + interval '10 minutes'),
      attempts = 0, request_window_started_at = window_start, request_count = next_count,
      last_sent_at = now(), verified_at = null, delivery_state = 'pending', delivery_job_id = null,
      delivered_at = null, last_ip_hash = p_ip_hash, updated_at = now()
    where presentation_id = p_presentation_id;
  else
    insert into public.luxor_planner_presentation_challenges(presentation_id,generation_id,code_hash,code_ciphertext,code_expires_at,request_window_started_at,request_count,last_sent_at,last_ip_hash)
    values(p_presentation_id,p_generation_id,p_code_hash,p_code_ciphertext,least(presentation.expires_at,now()+interval '10 minutes'),now(),1,now(),p_ip_hash);
  end if;
  return jsonb_build_object('issued', true, 'request_count', next_count);
end;
$$;

create or replace function public.luxor_planner_verify_presentation_code(p_presentation_id uuid, p_generation_id uuid, p_code_hash text)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  presentation public.luxor_planner_presentations%rowtype;
  challenge public.luxor_planner_presentation_challenges%rowtype;
begin
  if p_generation_id is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Planner verification code.' using errcode = '22023';
  end if;
  select * into presentation from public.luxor_planner_presentations where id = p_presentation_id for update;
  if not found or presentation.booking_id is null or presentation.revoked_at is not null or presentation.expires_at <= now() then
    return jsonb_build_object('verified', false, 'reason', 'unavailable');
  end if;
  select * into challenge from public.luxor_planner_presentation_challenges where presentation_id = p_presentation_id for update;
  if not found or challenge.code_expires_at <= now() then return jsonb_build_object('verified', false, 'reason', 'expired'); end if;
  if challenge.generation_id is distinct from p_generation_id then return jsonb_build_object('verified', false, 'reason', 'stale'); end if;
  if challenge.verified_at is not null then return jsonb_build_object('verified', false, 'reason', 'already_used'); end if;
  if challenge.attempts >= 6 then return jsonb_build_object('verified', false, 'reason', 'rate_limited'); end if;
  if challenge.code_hash is distinct from p_code_hash then
    update public.luxor_planner_presentation_challenges set attempts = attempts + 1, updated_at = now() where presentation_id = p_presentation_id;
    return jsonb_build_object('verified', false, 'reason', case when challenge.attempts + 1 >= 6 then 'rate_limited' else 'invalid' end);
  end if;
  update public.luxor_planner_presentation_challenges set verified_at = now(), code_ciphertext = null, updated_at = now() where presentation_id = p_presentation_id;
  return jsonb_build_object('verified', true, 'verified_at', now());
end;
$$;

create or replace function public.luxor_planner_claim_presentation_code_email(
  p_presentation_id uuid, p_generation_id uuid, p_code_hash text, p_job_id uuid, p_recipient_email text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  presentation public.luxor_planner_presentations%rowtype;
  challenge public.luxor_planner_presentation_challenges%rowtype;
begin
  select * into presentation from public.luxor_planner_presentations where id = p_presentation_id for update;
  if not found or presentation.booking_id is null or presentation.revoked_at is not null or presentation.expires_at <= now()
    or lower(presentation.recipient_email) is distinct from lower(p_recipient_email) then
    return jsonb_build_object('claimed', false, 'reason', 'unavailable');
  end if;
  select * into challenge from public.luxor_planner_presentation_challenges where presentation_id = p_presentation_id for update;
  if not found or challenge.generation_id is distinct from p_generation_id or challenge.code_hash is distinct from p_code_hash then
    return jsonb_build_object('claimed', false, 'reason', 'stale_generation');
  end if;
  if challenge.code_expires_at <= now() or challenge.code_ciphertext is null or challenge.verified_at is not null then
    return jsonb_build_object('claimed', false, 'reason', 'expired_or_used');
  end if;
  if challenge.delivery_state = 'sent' then return jsonb_build_object('claimed', false, 'reason', 'already_sent'); end if;
  if challenge.delivery_state = 'sending' and challenge.delivery_job_id is distinct from p_job_id then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;
  update public.luxor_planner_presentation_challenges set delivery_state='sending', delivery_job_id=p_job_id, updated_at=now()
  where presentation_id=p_presentation_id;
  return jsonb_build_object('claimed', true, 'code_ciphertext', challenge.code_ciphertext);
end;
$$;

create or replace function public.luxor_planner_finish_presentation_code_email(
  p_presentation_id uuid, p_generation_id uuid, p_code_hash text, p_job_id uuid, p_sent boolean
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare challenge public.luxor_planner_presentation_challenges%rowtype;
begin
  select * into challenge from public.luxor_planner_presentation_challenges where presentation_id=p_presentation_id for update;
  if not found or challenge.generation_id is distinct from p_generation_id or challenge.code_hash is distinct from p_code_hash or challenge.delivery_job_id is distinct from p_job_id then
    return jsonb_build_object('finished', false, 'reason', 'stale_generation');
  end if;
  if p_sent then
    update public.luxor_planner_presentation_challenges set code_ciphertext=null, delivery_state='sent', delivered_at=now(), updated_at=now()
    where presentation_id=p_presentation_id;
  else
    update public.luxor_planner_presentation_challenges set delivery_state='pending', delivery_job_id=null, updated_at=now()
    where presentation_id=p_presentation_id;
  end if;
  return jsonb_build_object('finished', true);
end;
$$;

-- The final share snapshot read locks the design row before reading either the
-- revision or its attachment membership. Attachment mutations and design edits
-- use the same row lock, so this returns one coherent immutable revision.
create or replace function public.luxor_planner_get_design_revision_for_share(
  p_design_id uuid, p_booking_id uuid, p_expected_revision integer
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  current_design public.luxor_planner_designs%rowtype;
  revision_snapshot jsonb;
  current_assets jsonb;
begin
  select * into current_design from public.luxor_planner_designs where id=p_design_id for update;
  if not found or current_design.design_kind <> 'event_concept' or current_design.booking_id is distinct from p_booking_id
    or current_design.archived_at is not null or p_expected_revision < 1 or p_expected_revision > current_design.revision then
    return null;
  end if;
  if p_expected_revision = current_design.revision then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'source_file_id',id,'title',title,'file_name',file_name,'content_type',content_type,
      'size_bytes',size_bytes,'storage_path',storage_path
    ) order by created_at,id), '[]'::jsonb) into current_assets
    from public.luxor_planner_files
    where design_id=p_design_id and category <> 'design_revision_snapshot';
    revision_snapshot := jsonb_build_object(
      'revision',current_design.revision,'name',current_design.name,'event_type',current_design.event_type,
      'design_style',current_design.design_style,'palette',current_design.palette,'description',current_design.description,
      'content',current_design.content,'assets',current_assets
    );
  else
    select snapshot into revision_snapshot from public.luxor_planner_design_revisions
    where design_id=p_design_id and revision=p_expected_revision;
    if revision_snapshot is null then return null; end if;
  end if;
  return jsonb_build_object(
    'design',jsonb_build_object('id',current_design.id,'booking_id',current_design.booking_id,
      'design_kind',current_design.design_kind,'revision',current_design.revision,'archived_at',current_design.archived_at),
    'snapshot',revision_snapshot
  );
end;
$$;

create or replace function public.luxor_planner_record_presentation_response(
  p_presentation_id uuid, p_action text, p_note text, p_submission_key text, p_ip_hash text, p_user_agent text
) returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  presentation public.luxor_planner_presentations%rowtype;
  challenge public.luxor_planner_presentation_challenges%rowtype;
begin
  if p_action is null or p_action not in ('feedback','approved') or length(coalesce(p_note,'')) > 4000 or p_submission_key is null or p_submission_key !~ '^[a-zA-Z0-9_-]{16,100}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Planner presentation response.' using errcode = '22023';
  end if;
  select * into presentation from public.luxor_planner_presentations where id = p_presentation_id for update;
  if not found or presentation.booking_id is null or presentation.revoked_at is not null or presentation.expires_at <= now() then
    return jsonb_build_object('saved', false, 'reason', 'unavailable');
  end if;
  if presentation.client_action is not null then
    if presentation.response_submission_key = p_submission_key then return jsonb_build_object('saved', true, 'presentation', to_jsonb(presentation)); end if;
    return jsonb_build_object('saved', false, 'reason', 'already_responded');
  end if;
  select * into challenge from public.luxor_planner_presentation_challenges where presentation_id = p_presentation_id for update;
  if not found or challenge.verified_at is null or challenge.verified_at <= now() - interval '30 minutes' then
    return jsonb_build_object('saved', false, 'reason', 'verification_required');
  end if;
  update public.luxor_planner_presentations set client_action = p_action, client_note = nullif(btrim(p_note),''),
    response_revision = design_revision, response_submission_key = p_submission_key, response_ip_hash = p_ip_hash,
    response_user_agent = left(p_user_agent,500), responded_at = now(), updated_at = now()
  where id = p_presentation_id returning * into presentation;
  return jsonb_build_object('saved', true, 'presentation', to_jsonb(presentation));
end;
$$;

create or replace function public.luxor_planner_revoke_booking_presentations()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.luxor_planner_presentations set revoked_at = coalesce(revoked_at, now()), updated_at = now()
  where booking_id = old.id and revoked_at is null;
  return old;
end;
$$;
drop trigger if exists luxor_planner_revoke_presentations_on_booking_delete on public.luxor_bookings;
create trigger luxor_planner_revoke_presentations_on_booking_delete
before delete on public.luxor_bookings
for each row execute function public.luxor_planner_revoke_booking_presentations();

-- All new tables are reachable through authenticated, session-checked server routes only.
-- Never grant direct API access to anon or authenticated roles.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'luxor_planner_checklists', 'luxor_planner_checklist_items', 'luxor_planner_tasks',
    'luxor_planner_meetings', 'luxor_planner_designs', 'luxor_planner_vendors',
    'luxor_planner_event_vendors', 'luxor_planner_files', 'luxor_planner_design_revisions',
    'luxor_planner_presentations', 'luxor_planner_presentation_files', 'luxor_planner_presentation_challenges'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    -- The project's public-schema default ACL grants ALL to anon, authenticated,
    -- and service_role. Remove those inherited grants before granting only the
    -- CRUD operations the owner-portal server routes need.
    execute format('revoke all privileges on table public.%I from anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
    execute format('drop policy if exists "Service role can manage %I" on public.%I', table_name, table_name);
    execute format('create policy "Service role can manage %I" on public.%I for all to service_role using ((select current_setting(''role'', true)) = ''service_role'') with check ((select current_setting(''role'', true)) = ''service_role'')', table_name, table_name);
  end loop;
end $$;

revoke all on function public.luxor_planner_commit_attachment_change(uuid, integer, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.luxor_planner_commit_attachment_change(uuid, integer, text, jsonb, jsonb, uuid) to service_role;
revoke all on function public.luxor_planner_save_design_revision(uuid, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_planner_save_design_revision(uuid, integer, jsonb, jsonb) to service_role;
revoke all on function public.luxor_planner_issue_presentation_code(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.luxor_planner_issue_presentation_code(uuid, uuid, text, text, text) to service_role;
revoke all on function public.luxor_planner_verify_presentation_code(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.luxor_planner_verify_presentation_code(uuid, uuid, text) to service_role;
revoke all on function public.luxor_planner_claim_presentation_code_email(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.luxor_planner_claim_presentation_code_email(uuid, uuid, text, uuid, text) to service_role;
revoke all on function public.luxor_planner_finish_presentation_code_email(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.luxor_planner_finish_presentation_code_email(uuid, uuid, text, uuid, boolean) to service_role;
revoke all on function public.luxor_planner_get_design_revision_for_share(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.luxor_planner_get_design_revision_for_share(uuid, uuid, integer) to service_role;
revoke all on function public.luxor_planner_begin_presentation(uuid, uuid, uuid, integer, jsonb, text, integer, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.luxor_planner_begin_presentation(uuid, uuid, uuid, integer, jsonb, text, integer, text, text, text, text, timestamptz, uuid) to service_role;
revoke all on function public.luxor_planner_mark_presentation_ready(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.luxor_planner_mark_presentation_ready(uuid, text, uuid) to service_role;
revoke all on function public.luxor_planner_abort_presentation_preparation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.luxor_planner_abort_presentation_preparation(uuid, text, uuid) to service_role;
revoke all on function public.luxor_planner_register_presentation_file(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.luxor_planner_register_presentation_file(uuid, text, uuid, jsonb) to service_role;
revoke all on function public.luxor_planner_record_presentation_response(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.luxor_planner_record_presentation_response(uuid, text, text, text, text, text) to service_role;
revoke all on function public.luxor_planner_revoke_booking_presentations() from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('luxor-planner-files', 'luxor-planner-files', false, 26214400,
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'])
on conflict (id) do update set name=excluded.name, public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

notify pgrst, 'reload schema';

-- Rollback is permanently destructive to Planner metadata. After exporting any
-- Planner records and confirming deletion is authorized, run in this order:
-- drop trigger if exists luxor_planner_revoke_presentations_on_booking_delete on public.luxor_bookings;
-- drop function if exists public.luxor_planner_revoke_booking_presentations();
-- drop function if exists public.luxor_planner_record_presentation_response(uuid,text,text,text,text,text);
-- drop function if exists public.luxor_planner_register_presentation_file(uuid,text,uuid,jsonb);
-- drop function if exists public.luxor_planner_abort_presentation_preparation(uuid,text,uuid);
-- drop function if exists public.luxor_planner_mark_presentation_ready(uuid,text,uuid);
-- drop function if exists public.luxor_planner_begin_presentation(uuid,uuid,uuid,integer,jsonb,text,integer,text,text,text,text,timestamptz,uuid);
-- drop function if exists public.luxor_planner_get_design_revision_for_share(uuid,uuid,integer);
-- drop function if exists public.luxor_planner_finish_presentation_code_email(uuid,uuid,text,uuid,boolean);
-- drop function if exists public.luxor_planner_claim_presentation_code_email(uuid,uuid,text,uuid,text);
-- drop function if exists public.luxor_planner_verify_presentation_code(uuid,uuid,text);
-- drop function if exists public.luxor_planner_issue_presentation_code(uuid,uuid,text,text,text);
-- drop function if exists public.luxor_planner_commit_attachment_change(uuid,integer,text,jsonb,jsonb,uuid);
-- drop function if exists public.luxor_planner_save_design_revision(uuid,integer,jsonb,jsonb);
-- drop table if exists public.luxor_planner_presentation_challenges;
-- drop table if exists public.luxor_planner_presentation_files;
-- drop table if exists public.luxor_planner_presentations;
-- drop table if exists public.luxor_planner_files;
-- drop table if exists public.luxor_planner_design_revisions;
-- drop table if exists public.luxor_planner_event_vendors;
-- drop table if exists public.luxor_planner_vendors;
-- drop table if exists public.luxor_planner_designs;
-- drop table if exists public.luxor_planner_meetings;
-- drop table if exists public.luxor_planner_tasks;
-- drop table if exists public.luxor_planner_checklist_items;
-- drop table if exists public.luxor_planner_checklists;
-- Do not delete storage.buckets while it contains private Planner objects. After
-- exporting/removing those bytes through Storage's object API, drop the bucket:
-- delete from storage.buckets where id = 'luxor-planner-files';
