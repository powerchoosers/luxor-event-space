-- Additive, fail-closed foundation for owner-authored workflows.
-- No workflow is activated, no existing workflow content is changed, and the
-- legacy brochure/tour queue identities remain separate.

create table if not exists public.luxor_custom_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  trigger_type text not null check (trigger_type = 'contact_form_inquiry_created'),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  draft_definition jsonb not null,
  draft_revision integer not null default 1 check (draft_revision > 0),
  current_version_id uuid,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (jsonb_typeof(draft_definition) = 'object'),
  check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.luxor_custom_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.luxor_custom_workflows(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_number),
  unique (workflow_id, id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'luxor_custom_workflows_current_version_fkey'
      and conrelid = 'public.luxor_custom_workflows'::regclass
  ) then
    alter table public.luxor_custom_workflows
      add constraint luxor_custom_workflows_current_version_fkey
      foreign key (id, current_version_id)
      references public.luxor_custom_workflow_versions(workflow_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.luxor_custom_workflow_source_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (char_length(event_key) between 1 and 200),
  trigger_type text not null check (trigger_type = 'contact_form_inquiry_created'),
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'consumed', 'ignored', 'held')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  check (status not in ('consumed', 'ignored') or processed_at is not null)
);

create table if not exists public.luxor_custom_workflow_enrollments (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.luxor_custom_workflows(id) on delete restrict,
  workflow_version_id uuid not null,
  source_event_id uuid not null references public.luxor_custom_workflow_source_events(id) on delete restrict,
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'stopped', 'held')),
  current_step_id text,
  next_run_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workflow_id, workflow_version_id)
    references public.luxor_custom_workflow_versions(workflow_id, id) on delete restrict,
  unique (workflow_id, source_event_id),
  unique (id, workflow_version_id),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'stopped') = (stopped_at is not null))
);

create table if not exists public.luxor_custom_workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  workflow_version_id uuid not null,
  step_id text not null check (step_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
  step_order integer not null check (step_order >= 0),
  channel text not null check (channel in ('email', 'text', 'wait', 'condition', 'end')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'queued', 'sending', 'sent', 'completed', 'skipped', 'failed', 'held', 'cancelled')),
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 240),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  provider_accepted_at timestamptz,
  provider_reference text,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (enrollment_id, workflow_version_id)
    references public.luxor_custom_workflow_enrollments(id, workflow_version_id) on delete restrict,
  unique (enrollment_id, step_id),
  unique (enrollment_id, step_order)
);

create table if not exists public.luxor_custom_workflow_activity (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.luxor_custom_workflows(id) on delete restrict,
  enrollment_id uuid references public.luxor_custom_workflow_enrollments(id) on delete restrict,
  step_run_id uuid references public.luxor_custom_workflow_step_runs(id) on delete restrict,
  event_type text not null check (char_length(event_type) between 1 and 80),
  actor_email text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  check (workflow_id is not null or enrollment_id is not null or step_run_id is not null)
);

-- The database has its own fail-closed release gate. Service-role application
-- code can read this row but cannot enable custom execution; changing it is a
-- separate reviewed database-owner operation.
create table if not exists public.luxor_custom_workflow_runtime_controls (
  singleton boolean primary key default true check (singleton),
  execution_enabled boolean not null default false,
  authoring_enabled boolean not null default false,
  activation_enabled boolean not null default false
);
alter table public.luxor_custom_workflow_runtime_controls
  add column if not exists authoring_enabled boolean not null default false,
  add column if not exists activation_enabled boolean not null default false;
insert into public.luxor_custom_workflow_runtime_controls(singleton,execution_enabled,authoring_enabled,activation_enabled)
  values(true,false,false,false) on conflict(singleton) do nothing;

create index if not exists luxor_custom_workflows_status_updated_idx
  on public.luxor_custom_workflows (status, updated_at desc);
create index if not exists luxor_custom_workflow_outbox_due_idx
  on public.luxor_custom_workflow_source_events (status, received_at, id)
  where status = 'pending';
create index if not exists luxor_custom_workflow_enrollment_due_idx
  on public.luxor_custom_workflow_enrollments (status, next_run_at, updated_at)
  where status = 'active';
create index if not exists luxor_custom_workflow_step_due_idx
  on public.luxor_custom_workflow_step_runs (status, scheduled_for, created_at)
  where status in ('scheduled', 'queued');
create index if not exists luxor_custom_workflow_activity_recent_idx
  on public.luxor_custom_workflow_activity (workflow_id, created_at desc);
create unique index if not exists luxor_custom_workflows_one_active_trigger_idx
  on public.luxor_custom_workflows (trigger_type) where status = 'active';

alter table public.luxor_email_jobs
  add column if not exists custom_workflow_step_run_id uuid
    references public.luxor_custom_workflow_step_runs(id) on delete restrict;
alter table public.luxor_text_jobs
  add column if not exists custom_workflow_step_run_id uuid
    references public.luxor_custom_workflow_step_runs(id) on delete restrict;
create unique index if not exists luxor_email_jobs_custom_workflow_step_unique
  on public.luxor_email_jobs (custom_workflow_step_run_id)
  where custom_workflow_step_run_id is not null;
create unique index if not exists luxor_text_jobs_custom_workflow_step_unique
  on public.luxor_text_jobs (custom_workflow_step_run_id)
  where custom_workflow_step_run_id is not null;

-- Custom marketing email links use opaque one-time bearer tokens. Store only
-- the SHA-256 digest; the plaintext token appears only in the queued email.
create table if not exists public.luxor_custom_workflow_unsubscribe_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  step_run_id uuid not null unique references public.luxor_custom_workflow_step_runs(id) on delete restrict,
  inquiry_id uuid not null references public.luxor_inquiries(id) on delete restrict,
  email text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.luxor_email_jobs drop constraint if exists luxor_email_jobs_job_type_check;
alter table public.luxor_email_jobs add constraint luxor_email_jobs_job_type_check check (job_type in (
  'tour_confirmation','tour_reminder','tour_no_show_reschedule','proposal_view_reminder',
  'proposal_payment_reminder','contract_signature','contract_view_reminder','contract_signature_reminder',
  'booking_package','deposit_payment_confirmation','unpaid_invoice_reminder','sixty_day_payment_reminder',
  'final_payment_request','final_payment_reminder','event_details_reminder','event_day_reminder',
  'post_event_follow_up','marketing_campaign','grand_opening_rsvp_confirmation','layout_review',
  'calendar_invitation','inquiry_notification','transactional_notice','test_notification','custom_workflow'
));

alter table public.luxor_text_jobs drop constraint if exists luxor_text_jobs_job_type_check;
alter table public.luxor_text_jobs add constraint luxor_text_jobs_job_type_check check (job_type in (
  'manual_campaign','inquiry_confirmation','tour_confirmation','tour_reminder','event_reminder',
  'payment_confirmation','invoice_due_reminder','invoice_overdue_reminder','custom_workflow'
));

alter table public.luxor_custom_workflows enable row level security;
alter table public.luxor_custom_workflow_versions enable row level security;
alter table public.luxor_custom_workflow_source_events enable row level security;
alter table public.luxor_custom_workflow_enrollments enable row level security;
alter table public.luxor_custom_workflow_step_runs enable row level security;
alter table public.luxor_custom_workflow_activity enable row level security;
alter table public.luxor_custom_workflow_unsubscribe_tokens enable row level security;
alter table public.luxor_custom_workflow_runtime_controls enable row level security;

revoke all on table public.luxor_custom_workflows, public.luxor_custom_workflow_versions,
  public.luxor_custom_workflow_source_events, public.luxor_custom_workflow_enrollments,
  public.luxor_custom_workflow_step_runs, public.luxor_custom_workflow_activity,
  public.luxor_custom_workflow_unsubscribe_tokens, public.luxor_custom_workflow_runtime_controls
  from public, anon, authenticated;
revoke all on table public.luxor_custom_workflows, public.luxor_custom_workflow_versions,
  public.luxor_custom_workflow_source_events, public.luxor_custom_workflow_enrollments,
  public.luxor_custom_workflow_step_runs, public.luxor_custom_workflow_activity,
  public.luxor_custom_workflow_unsubscribe_tokens, public.luxor_custom_workflow_runtime_controls
  from service_role;
grant select on table public.luxor_custom_workflows, public.luxor_custom_workflow_versions,
  public.luxor_custom_workflow_source_events, public.luxor_custom_workflow_enrollments,
  public.luxor_custom_workflow_step_runs, public.luxor_custom_workflow_activity,
  public.luxor_custom_workflow_unsubscribe_tokens, public.luxor_custom_workflow_runtime_controls to service_role;
drop policy if exists luxor_custom_workflows_service_role on public.luxor_custom_workflows;
create policy luxor_custom_workflows_service_role on public.luxor_custom_workflows
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_versions_service_role on public.luxor_custom_workflow_versions;
create policy luxor_custom_workflow_versions_service_role on public.luxor_custom_workflow_versions
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_source_events_service_role on public.luxor_custom_workflow_source_events;
create policy luxor_custom_workflow_source_events_service_role on public.luxor_custom_workflow_source_events
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_enrollments_service_role on public.luxor_custom_workflow_enrollments;
create policy luxor_custom_workflow_enrollments_service_role on public.luxor_custom_workflow_enrollments
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_step_runs_service_role on public.luxor_custom_workflow_step_runs;
create policy luxor_custom_workflow_step_runs_service_role on public.luxor_custom_workflow_step_runs
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_activity_service_role on public.luxor_custom_workflow_activity;
create policy luxor_custom_workflow_activity_service_role on public.luxor_custom_workflow_activity
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_unsubscribe_tokens_service_role on public.luxor_custom_workflow_unsubscribe_tokens;
create policy luxor_custom_workflow_unsubscribe_tokens_service_role on public.luxor_custom_workflow_unsubscribe_tokens
  for all to service_role using ((select current_setting('role', true)) = 'service_role')
  with check ((select current_setting('role', true)) = 'service_role');
drop policy if exists luxor_custom_workflow_runtime_controls_service_role on public.luxor_custom_workflow_runtime_controls;
create policy luxor_custom_workflow_runtime_controls_service_role on public.luxor_custom_workflow_runtime_controls
  for select to service_role using ((select current_setting('role', true)) = 'service_role');
revoke insert,update,delete,truncate,references,trigger on public.luxor_custom_workflow_runtime_controls from service_role;

create or replace function public.luxor_custom_workflow_runtime_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select execution_enabled from public.luxor_custom_workflow_runtime_controls where singleton=true),false);
$$;
revoke all on function public.luxor_custom_workflow_runtime_enabled() from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_runtime_enabled() to service_role;

-- Independent fail-closed authoring and activation gates. The API feature
-- constants are also false; service-role access alone cannot enable either.
create or replace function public.luxor_custom_workflow_authoring_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select authoring_enabled from public.luxor_custom_workflow_runtime_controls where singleton=true),false);
$$;
create or replace function public.luxor_custom_workflow_activation_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select activation_enabled from public.luxor_custom_workflow_runtime_controls where singleton=true),false);
$$;
revoke all on function public.luxor_custom_workflow_authoring_enabled() from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_activation_enabled() from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_authoring_enabled() to service_role;
grant execute on function public.luxor_custom_workflow_activation_enabled() to service_role;

-- Supplying a fixed instant makes the production Chicago send-window policy
-- deterministic to test without changing the clock or the policy itself.
create or replace function public.luxor_custom_workflow_is_within_sms_send_window(p_at timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select p_at is not null
    and extract(hour from p_at at time zone 'America/Chicago') >= 8
    and extract(hour from p_at at time zone 'America/Chicago') < 20;
$$;
revoke all on function public.luxor_custom_workflow_is_within_sms_send_window(timestamptz) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_is_within_sms_send_window(timestamptz) to service_role;

create or replace function public.luxor_custom_workflow_block_immutable_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Custom workflow versions and activity are append-only.' using errcode = '55000';
end;
$$;
drop trigger if exists luxor_custom_workflow_versions_immutable on public.luxor_custom_workflow_versions;
create trigger luxor_custom_workflow_versions_immutable
  before update or delete on public.luxor_custom_workflow_versions
  for each row execute function public.luxor_custom_workflow_block_immutable_mutation();
drop trigger if exists luxor_custom_workflow_activity_immutable on public.luxor_custom_workflow_activity;
create trigger luxor_custom_workflow_activity_immutable
  before update or delete on public.luxor_custom_workflow_activity
  for each row execute function public.luxor_custom_workflow_block_immutable_mutation();

create or replace function public.luxor_custom_workflow_definition_is_structural(p_definition jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  steps jsonb;
  step jsonb;
  step_id text;
  step_type text;
  key text;
  ids text[] := array[]::text[];
  step_count integer := 0;
  end_count integer := 0;
begin
  if jsonb_typeof(p_definition) is distinct from 'object'
    or p_definition->>'schemaVersion' is distinct from '1'
    or p_definition->>'trigger' is distinct from 'contact_form_inquiry_created'
    or jsonb_typeof(p_definition->'steps') is distinct from 'array' then
    return false;
  end if;
  for key in select jsonb_object_keys(p_definition) loop
    if key not in ('schemaVersion', 'trigger', 'steps') then return false; end if;
  end loop;
  steps := p_definition->'steps';
  step_count := jsonb_array_length(steps);
  if step_count < 2 or step_count > 20 then return false; end if;
  if jsonb_typeof(steps->0) is distinct from 'object'
    or steps->0->>'type' is distinct from 'email'
    or steps->0->>'mode' is distinct from 'existing_inquiry_acknowledgment' then
    return false;
  end if;

  for step in select value from jsonb_array_elements(steps) with ordinality as entries(value, ordinal) order by ordinal loop
    if jsonb_typeof(step) is distinct from 'object'
      or jsonb_typeof(step->'id') is distinct from 'string'
      or jsonb_typeof(step->'type') is distinct from 'string'
      or jsonb_typeof(step->'name') is distinct from 'string' then return false; end if;
    step_type := step->>'type';
    for key in select jsonb_object_keys(step) loop
      if step_type = 'email' and key not in ('id', 'type', 'mode', 'name', 'subject', 'previewText', 'body', 'ctaText', 'ctaUrl') then return false; end if;
      if step_type = 'text' and key not in ('id', 'type', 'name', 'body', 'requiredConsentScope') then return false; end if;
      if step_type = 'wait' and key not in ('id', 'type', 'name', 'amount', 'unit') then return false; end if;
      if step_type = 'condition' and key not in ('id', 'type', 'name', 'condition', 'whenFalse') then return false; end if;
      if step_type = 'end' and key not in ('id', 'type', 'name') then return false; end if;
    end loop;
    step_id := step->>'id';
    if step_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      or length(btrim(step->>'name')) not between 1 and 120
      or step_id = any(ids) then return false; end if;
    ids := array_append(ids, step_id);

    if step->>'type' = 'email' then
      if step->>'mode' is null or step->>'mode' not in ('existing_inquiry_acknowledgment', 'marketing')
        or jsonb_typeof(step->'subject') is distinct from 'string'
        or jsonb_typeof(step->'previewText') is distinct from 'string'
        or jsonb_typeof(step->'body') is distinct from 'string'
        or jsonb_typeof(step->'ctaText') is distinct from 'string'
        or jsonb_typeof(step->'ctaUrl') is distinct from 'string'
        or (step->>'mode' = 'existing_inquiry_acknowledgment'
          and (step_id <> 'inquiry-acknowledgment' or array_length(ids, 1) <> 1
            or step->>'name' <> 'Existing inquiry acknowledgment'
            or step->>'subject' <> 'We have received your Luxor inquiry'
            or step->>'previewText' <> 'We received your Luxor inquiry and will connect with you shortly.'
            or step->>'body' <> '' or step->>'ctaText' <> '' or step->>'ctaUrl' <> '')) then
        return false;
      end if;
    elsif step->>'type' = 'text' then
      if step->>'requiredConsentScope' is distinct from 'marketing'
        or jsonb_typeof(step->'body') is distinct from 'string' then return false; end if;
    elsif step->>'type' = 'wait' then
      if step->>'unit' not in ('minutes', 'hours', 'days') or step->'amount' is null then return false; end if;
      if step->'amount' <> 'null'::jsonb
        and (jsonb_typeof(step->'amount') <> 'number' or (step->>'amount')::numeric not between 0 and 365
          or trunc((step->>'amount')::numeric) <> (step->>'amount')::numeric) then return false; end if;
    elsif step->>'type' = 'condition' then
      if step->>'condition' is null
        or step->>'condition' not in ('follow_up_eligible', 'marketing_email_consent', 'marketing_sms_consent')
        or step->>'whenFalse' is distinct from 'stop' then return false; end if;
    elsif step->>'type' = 'end' then
      end_count := end_count + 1;
      if step_id <> 'finished' or step_count <> array_length(ids, 1) then return false; end if;
    else
      return false;
    end if;
  end loop;

  return end_count = 1;
exception when others then
  return false;
end;
$$;

-- These RPCs run under the trusted server's service_role key. Their actor email
-- is audit metadata supplied only after the portal API verifies the signed
-- session, approved operator email, and marketing permission. Do not expose
-- these RPCs to anon/authenticated clients or treat p_actor_email as identity.
create or replace function public.luxor_custom_workflow_create_draft(
  p_name text, p_definition jsonb, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare created public.luxor_custom_workflows%rowtype;
begin
  if not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Custom workflow authoring is disabled.' using errcode = '55000';
  end if;
  if not public.luxor_custom_workflow_definition_is_structural(p_definition) then
    raise exception 'Workflow structure is not supported.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
    or char_length(btrim(coalesce(p_actor_email, ''))) not between 3 and 254 then
    raise exception 'Workflow name or editor identity is invalid.' using errcode = '22023';
  end if;
  insert into public.luxor_custom_workflows(name, trigger_type, status, draft_definition, draft_revision, created_by, updated_by)
  values (btrim(p_name), 'contact_form_inquiry_created', 'draft', p_definition, 1, lower(btrim(p_actor_email)), lower(btrim(p_actor_email)))
  returning * into created;
  insert into public.luxor_custom_workflow_activity(workflow_id, event_type, actor_email, details)
  values (created.id, 'draft_created', lower(btrim(p_actor_email)), jsonb_build_object('revision', created.draft_revision));
  return next created;
end;
$$;

create or replace function public.luxor_custom_workflow_save_draft(
  p_workflow_id uuid, p_expected_revision integer, p_name text, p_definition jsonb, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare saved public.luxor_custom_workflows%rowtype;
begin
  if not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Custom workflow authoring is disabled.' using errcode = '55000';
  end if;
  if p_expected_revision < 1 or char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
    or char_length(btrim(coalesce(p_actor_email, ''))) not between 3 and 254
    or not public.luxor_custom_workflow_definition_is_structural(p_definition) then
    raise exception 'Draft is invalid. Reload before saving.' using errcode = '22023';
  end if;
  update public.luxor_custom_workflows
  set name = btrim(p_name), trigger_type = 'contact_form_inquiry_created', draft_definition = p_definition,
      draft_revision = draft_revision + 1, updated_by = lower(btrim(p_actor_email)), updated_at = now()
  where id = p_workflow_id and status = 'draft' and draft_revision = p_expected_revision
  returning * into saved;
  if not found then raise exception 'Draft revision changed or is no longer editable.' using errcode = '40001'; end if;
  insert into public.luxor_custom_workflow_activity(workflow_id, event_type, actor_email, details)
  values (saved.id, 'draft_saved', lower(btrim(p_actor_email)), jsonb_build_object('revision', saved.draft_revision));
  return next saved;
end;
$$;

create or replace function public.luxor_custom_workflow_archive_draft(
  p_workflow_id uuid, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare archived public.luxor_custom_workflows%rowtype;
begin
  if not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Custom workflow authoring is disabled.' using errcode = '55000';
  end if;
  update public.luxor_custom_workflows
  set status = 'archived', archived_at = now(), updated_by = lower(btrim(p_actor_email)), updated_at = now()
  where id = p_workflow_id and status = 'draft'
  returning * into archived;
  if not found then raise exception 'Only an inactive draft can be archived here.' using errcode = '40001'; end if;
  insert into public.luxor_custom_workflow_activity(workflow_id, event_type, actor_email, details)
  values (archived.id, 'draft_archived', lower(btrim(p_actor_email)), '{}'::jsonb);
  return next archived;
end;
$$;

-- Lifecycle transitions are atomic and operate only on custom workflow rows.
-- Activation requires two independent database-owner gates in addition to
-- application authorization. All gates default off and service_role cannot
-- update the control row.
create or replace function public.luxor_custom_workflow_change_lifecycle(
  p_workflow_id uuid, p_action text, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare
  changed public.luxor_custom_workflows%rowtype;
  next_version_id uuid;
  next_version_number integer;
begin
  if not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Custom workflow lifecycle is disabled.' using errcode = '55000';
  end if;
  if p_action is null or p_action not in ('activate','pause','resume','archive')
    or char_length(btrim(coalesce(p_actor_email,''))) not between 3 and 254 then
    raise exception 'Workflow lifecycle request is invalid.' using errcode = '22023';
  end if;

  select * into changed from public.luxor_custom_workflows where id=p_workflow_id for update;
  if not found then raise exception 'Custom workflow not found.' using errcode = 'P0002'; end if;

  if p_action='activate' then
    if not public.luxor_custom_workflow_activation_enabled() or not public.luxor_custom_workflow_runtime_enabled() then
      raise exception 'Workflow activation is unavailable pending separate owner approval.' using errcode = '55000';
    end if;
    if changed.status <> 'draft' or not public.luxor_custom_workflow_definition_is_runnable(changed.draft_definition) then
      raise exception 'Only a complete inactive draft can be activated.' using errcode = '40001';
    end if;
    select coalesce(max(version_number),0)+1 into next_version_number
      from public.luxor_custom_workflow_versions where workflow_id=changed.id;
    insert into public.luxor_custom_workflow_versions(workflow_id,version_number,definition,created_by)
      values(changed.id,next_version_number,changed.draft_definition,lower(btrim(p_actor_email)))
      returning id into next_version_id;
    update public.luxor_custom_workflows
      set status='active',current_version_id=next_version_id,updated_by=lower(btrim(p_actor_email)),updated_at=now()
      where id=changed.id returning * into changed;
  elsif p_action='pause' then
    if changed.status <> 'active' then raise exception 'Only an active workflow can be paused.' using errcode = '40001'; end if;
    update public.luxor_custom_workflows
      set status='paused',updated_by=lower(btrim(p_actor_email)),updated_at=now()
      where id=changed.id returning * into changed;
  elsif p_action='resume' then
    if not public.luxor_custom_workflow_activation_enabled() or not public.luxor_custom_workflow_runtime_enabled() then
      raise exception 'Workflow resume is unavailable pending separate owner approval.' using errcode = '55000';
    end if;
    if changed.status <> 'paused' or changed.current_version_id is null then
      raise exception 'Only a previously activated workflow can be resumed.' using errcode = '40001';
    end if;
    update public.luxor_custom_workflows
      set status='active',updated_by=lower(btrim(p_actor_email)),updated_at=now()
      where id=changed.id returning * into changed;
  elsif p_action='archive' then
    if changed.status not in ('draft','paused') then
      raise exception 'Only an inactive workflow can be archived.' using errcode = '40001';
    end if;
    update public.luxor_email_jobs j
      set status='cancelled',last_error='Custom workflow archived before dispatch.',updated_at=now()
      from public.luxor_custom_workflow_step_runs sr
      join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
      where e.workflow_id=changed.id and j.custom_workflow_step_run_id=sr.id
        and j.job_type='custom_workflow' and j.status='queued';
    update public.luxor_text_jobs j
      set status='cancelled',last_error='Custom workflow archived before dispatch.',updated_at=now()
      from public.luxor_custom_workflow_step_runs sr
      join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
      where e.workflow_id=changed.id and j.custom_workflow_step_run_id=sr.id
        and j.job_type='custom_workflow' and j.status='queued';
    update public.luxor_custom_workflow_step_runs sr
      set status='cancelled',last_error='Custom workflow archived before dispatch.',updated_at=now()
      from public.luxor_custom_workflow_enrollments e
      where e.workflow_id=changed.id and e.id=sr.enrollment_id
        and sr.status in ('scheduled','queued');
    update public.luxor_custom_workflow_enrollments
      set status='stopped',stopped_at=coalesce(stopped_at,now()),stop_reason='workflow_archived',
          next_run_at=null,updated_at=now()
      where workflow_id=changed.id and status in ('active','paused');
    update public.luxor_custom_workflows
      set status='archived',archived_at=now(),updated_by=lower(btrim(p_actor_email)),updated_at=now()
      where id=changed.id returning * into changed;
  end if;

  insert into public.luxor_custom_workflow_activity(workflow_id,event_type,actor_email,details)
    values(changed.id,'workflow_'||p_action,lower(btrim(p_actor_email)),jsonb_build_object('status',changed.status));
  return next changed;
end;
$$;

create or replace function public.luxor_record_custom_workflow_source_event(p_inquiry_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inquiry public.luxor_inquiries%rowtype; event_id uuid;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return null; end if;
  select * into inquiry from public.luxor_inquiries where id = p_inquiry_id;
  if not found or coalesce(inquiry.is_test, false) or inquiry.flow <> 'contact_form' then
    raise exception 'Only real website contact-form inquiries are supported.' using errcode = '22023';
  end if;
  insert into public.luxor_custom_workflow_source_events(event_key, trigger_type, inquiry_id, payload)
  values ('contact_form_inquiry_created:' || inquiry.id::text, 'contact_form_inquiry_created', inquiry.id,
    jsonb_build_object('flow', inquiry.flow))
  on conflict (event_key) do update set event_key = excluded.event_key
  returning id into event_id;
  return event_id;
end;
$$;

-- Durable, transaction-bound source capture. No event is recorded for drafts,
-- paused workflows, tests, tour bookings, newsletter records, or inquiries
-- without an email address that can receive the existing acknowledgment.
create or replace function public.luxor_custom_workflow_capture_inquiry_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.flow = 'contact_form'
    and public.luxor_custom_workflow_runtime_enabled()
    and coalesce(new.is_test, false) = false
    and lower(coalesce(new.metadata->>'is_test_record', 'false')) <> 'true'
    and new.email is not null
    and new.preferred_tour_date is null
    and new.status not in ('tour_requested', 'tour_confirmed', 'booked', 'closed_lost')
    and coalesce(new.metadata->>'autoScheduleTour', 'false') <> 'true'
    and exists (
      select 1 from public.luxor_custom_workflows w
      where w.trigger_type = 'contact_form_inquiry_created'
        and w.status = 'active'
        and w.current_version_id is not null
    ) then
    insert into public.luxor_custom_workflow_source_events(event_key, trigger_type, inquiry_id, payload)
    values (
      'contact_form_inquiry_created:' || new.id::text,
      'contact_form_inquiry_created',
      new.id,
      jsonb_build_object('flow', new.flow, 'inquiry_created_at', new.created_at)
    )
    on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists luxor_custom_workflow_capture_inquiry_after_insert on public.luxor_inquiries;
create trigger luxor_custom_workflow_capture_inquiry_after_insert
  after insert on public.luxor_inquiries
  for each row execute function public.luxor_custom_workflow_capture_inquiry_event();

revoke all on function public.luxor_custom_workflow_block_immutable_mutation() from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_definition_is_structural(jsonb) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_create_draft(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_save_draft(uuid, integer, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_archive_draft(uuid, text) from public, anon, authenticated;
revoke all on function public.luxor_record_custom_workflow_source_event(uuid) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_capture_inquiry_event() from public, anon, authenticated;
grant execute on function public.luxor_custom_workflow_create_draft(text, jsonb, text) to service_role;
grant execute on function public.luxor_custom_workflow_save_draft(uuid, integer, text, jsonb, text) to service_role;
grant execute on function public.luxor_custom_workflow_archive_draft(uuid, text) to service_role;
grant execute on function public.luxor_record_custom_workflow_source_event(uuid) to service_role;
grant execute on function public.luxor_custom_workflow_block_immutable_mutation() to service_role;

-- Keep new custom jobs out of the existing general claims until the custom
-- runtime is separately enabled. Legacy jobs have a NULL link and retain the
-- existing claim/retry/pacing rules verbatim.
create or replace function public.luxor_claim_due_email_jobs(job_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security invoker set search_path = '' as $$
begin
  job_limit := greatest(1,least(coalesce(job_limit,1),100));
  update public.luxor_email_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,
    scheduled_for=case when attempts>=3 then scheduled_for else now()+interval '5 minutes' end,
    last_error=case when attempts>=3 then coalesce(last_error,'Delivery worker stopped before completing the job.')
      else coalesce(last_error,'Delivery worker interrupted; automatically queued for retry.') end,updated_at=now()
    where automation_enrollment_id is null and custom_workflow_step_run_id is null
      and job_type not in ('inquiry_notification','transactional_notice','test_notification','custom_workflow')
      and status='sending' and updated_at<now()-interval '15 minutes';
  return query with due as (
    select id from public.luxor_email_jobs where automation_enrollment_id is null
      and custom_workflow_step_run_id is null
      and job_type not in ('inquiry_notification','transactional_notice','test_notification','custom_workflow')
      and status='queued' and scheduled_for<=now()
      and not exists(select 1 from public.luxor_email_jobs recent where recent.automation_enrollment_id is null
        and recent.job_type not in ('inquiry_notification','transactional_notice','test_notification')
        and recent.status in ('sending','sent') and coalesce(recent.sent_at,recent.updated_at)>now()-interval '60 seconds')
    order by scheduled_for,created_at,id for update skip locked limit job_limit
  ), claimed as (
    update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ) select * from claimed order by scheduled_for,created_at,id;
end;
$$;
revoke all on function public.luxor_claim_due_email_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_email_jobs(integer) to service_role;

create or replace function public.luxor_claim_due_text_jobs(job_limit integer default 10)
returns setof public.luxor_text_jobs language plpgsql security definer set search_path = '' as $$
begin
  job_limit := greatest(1, least(coalesce(job_limit, 10), 50));
  update public.luxor_text_jobs set status = case when attempts >= 3 then 'failed' else 'queued' end,
    scheduled_for = case when attempts >= 3 then scheduled_for else now() + interval '5 minutes' end,
    last_error = case when attempts >= 3 then coalesce(last_error, 'Text worker stopped before completing the job.')
      else coalesce(last_error, 'Text worker interrupted; automatically queued for retry.') end,
    updated_at = now()
  where custom_workflow_step_run_id is null and job_type <> 'custom_workflow' and status = 'sending' and updated_at < now() - interval '15 minutes';
  return query with due as (
    select id from public.luxor_text_jobs
    where custom_workflow_step_run_id is null and job_type <> 'custom_workflow' and status = 'queued' and scheduled_for <= now()
    order by scheduled_for asc, created_at asc for update skip locked limit job_limit
  ), claimed as (
    update public.luxor_text_jobs job set status = 'sending', attempts = coalesce(job.attempts, 0) + 1, updated_at = now()
    from due where job.id = due.id returning job.*
  ) select * from claimed order by scheduled_for asc, created_at asc;
end;
$$;
revoke all on function public.luxor_claim_due_text_jobs(integer) from public, anon, authenticated;
grant execute on function public.luxor_claim_due_text_jobs(integer) to service_role;

create or replace function public.luxor_custom_workflow_definition_is_runnable(p_definition jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare step jsonb;
begin
  if not public.luxor_custom_workflow_definition_is_structural(p_definition) then return false; end if;
  for step in select value from jsonb_array_elements(p_definition->'steps') loop
    if step->>'type' = 'wait'
      and (step->'amount' is null or step->'amount' = 'null'::jsonb) then return false; end if;
    if step->>'type' = 'email' and step->>'mode' = 'marketing'
      and (length(btrim(coalesce(step->>'subject',''))) = 0
        or length(btrim(coalesce(step->>'body',''))) = 0) then return false; end if;
    if step->>'type' = 'text'
      and (length(btrim(coalesce(step->>'body',''))) = 0
        or length(step->>'body') > 480) then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

-- Advances one immutable version-pinned enrollment in the same transaction
-- that completes the current non-message step. The next step is durable and
-- idempotent; relative waits are anchored to this completion timestamp.
create or replace function public.luxor_custom_workflow_schedule_next_step(p_step_run_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  current_run public.luxor_custom_workflow_step_runs%rowtype;
  workflow_status text;
  definition jsonb;
  next_step jsonb;
  next_step_id text;
  next_run_id uuid;
  next_at timestamptz := now();
  wait_amount integer;
  wait_unit text;
begin
  select e.* into enrollment
  from public.luxor_custom_workflow_enrollments e
  where e.id = (select enrollment_id from public.luxor_custom_workflow_step_runs where id = p_step_run_id)
  for update of e;
  if not found then return null; end if;
  select w.status, v.definition into workflow_status, definition
  from public.luxor_custom_workflows w
  join public.luxor_custom_workflow_versions v on v.id = enrollment.workflow_version_id and v.workflow_id = enrollment.workflow_id
  where w.id = enrollment.workflow_id;
  if not found or enrollment.status <> 'active' or workflow_status <> 'active' then return null; end if;

  select * into current_run from public.luxor_custom_workflow_step_runs
  where id = p_step_run_id and enrollment_id = enrollment.id for update;
  if not found or enrollment.current_step_id is distinct from current_run.step_id
    or current_run.status not in ('scheduled','queued','sending','sent','completed') then return null; end if;

  if not public.luxor_custom_workflow_runtime_enabled() then
    update public.luxor_custom_workflow_step_runs
      set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
      where id=current_run.id;
    update public.luxor_custom_workflow_enrollments
      set status='held',next_run_at=null,last_error='Custom workflow execution is disabled; review before continuing.',updated_at=now()
      where id=enrollment.id and status='active';
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(enrollment.workflow_id,enrollment.id,current_run.id,'execution_disabled_after_provider_acceptance','{"automatic_retry":false}'::jsonb);
    return null;
  end if;

  if current_run.step_order < 0 or current_run.step_order + 1 >= jsonb_array_length(definition->'steps') then
    update public.luxor_custom_workflow_step_runs
      set status='held', last_error='The pinned workflow version has no valid next step.', updated_at=now()
      where id=current_run.id;
    update public.luxor_custom_workflow_enrollments
      set status='held', next_run_at=null, last_error='The pinned workflow version has no valid next step.', updated_at=now()
      where id=enrollment.id;
    return null;
  end if;

  next_step := definition->'steps'->(current_run.step_order + 1);
  next_step_id := next_step->>'id';
  if not public.luxor_custom_workflow_definition_is_runnable(definition)
    or next_step_id is null then
    update public.luxor_custom_workflow_step_runs
      set status='held', last_error='The pinned workflow version is incomplete or invalid.', updated_at=now()
      where id=current_run.id;
    update public.luxor_custom_workflow_enrollments
      set status='held', next_run_at=null, last_error='The pinned workflow version is incomplete or invalid.', updated_at=now()
      where id=enrollment.id;
    return null;
  end if;

  update public.luxor_custom_workflow_step_runs
    set status='completed', completed_at=coalesce(completed_at, now()), last_error=null, updated_at=now()
    where id=current_run.id;

  if next_step->>'type' = 'wait' then
    wait_amount := (next_step->>'amount')::integer;
    wait_unit := next_step->>'unit';
    next_at := case wait_unit
      when 'minutes' then now() + make_interval(mins => wait_amount)
      when 'hours' then now() + make_interval(hours => wait_amount)
      when 'days' then now() + make_interval(days => wait_amount)
      else null
    end;
    if next_at is null then
      update public.luxor_custom_workflow_enrollments
        set status='held', next_run_at=null, last_error='The workflow wait unit is unsupported.', updated_at=now()
        where id=enrollment.id;
      update public.luxor_custom_workflow_step_runs
        set status='held', last_error='The workflow wait unit is unsupported.', updated_at=now()
        where id=current_run.id;
      return null;
    end if;
  end if;

  insert into public.luxor_custom_workflow_step_runs(
    enrollment_id, workflow_version_id, step_id, step_order, channel, status,
    idempotency_key, scheduled_for, snapshot
  ) values (
    enrollment.id, enrollment.workflow_version_id, next_step_id, current_run.step_order + 1,
    next_step->>'type', 'scheduled', enrollment.id::text || ':' || next_step_id,
    next_at, next_step
  ) on conflict (enrollment_id, step_id) do nothing returning id into next_run_id;

  if next_run_id is null then
    select id into next_run_id from public.luxor_custom_workflow_step_runs
    where enrollment_id=enrollment.id and step_id=next_step_id;
  end if;
  update public.luxor_custom_workflow_enrollments
    set current_step_id=next_step_id, next_run_at=next_at, last_error=null, updated_at=now()
    where id=enrollment.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values (enrollment.workflow_id,enrollment.id,next_run_id,'step_scheduled',
      jsonb_build_object('step_id',next_step_id,'channel',next_step->>'type','scheduled_for',next_at));
  return next_run_id;
end;
$$;

-- Consumes transaction-bound inquiry events only after the existing receipt
-- job exists. The receipt is represented as step zero; no second email job is
-- created. If the receipt is missing, the event stays pending for a later pass.
create or replace function public.luxor_custom_workflow_consume_pending_events(p_limit integer default 20)
returns table(events_consumed integer, waiting_for_ack integer, ignored_events integer,
  enrollments_created integer, held_enrollments integer)
language plpgsql security definer set search_path = '' as $$
declare
  source_event public.luxor_custom_workflow_source_events%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  ack_job public.luxor_email_jobs%rowtype;
  workflow record;
  enrollment_id uuid;
  ack_run_id uuid;
  active_count integer;
  v_consumed integer := 0;
  v_waiting integer := 0;
  v_ignored integer := 0;
  v_created integer := 0;
  v_held integer := 0;
  ack_run_status text;
  enrollment_status text;
begin
  p_limit := greatest(1, least(coalesce(p_limit,20),100));
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select 0,0,0,0,0;
    return;
  end if;
  for source_event in
    select * from public.luxor_custom_workflow_source_events
    where status='pending' order by received_at,id for update skip locked limit p_limit
  loop
    select * into inquiry from public.luxor_inquiries where id=source_event.inquiry_id;
    if not found or inquiry.flow <> 'contact_form' or coalesce(inquiry.is_test,false)
      or lower(coalesce(inquiry.metadata->>'is_test_record','false'))='true'
      or nullif(btrim(coalesce(inquiry.email,'')),'') is null
      or inquiry.preferred_tour_date is not null
      or inquiry.status in ('tour_requested','tour_confirmed','booked','closed_lost')
      or coalesce(inquiry.metadata->>'autoScheduleTour','false')='true' then
      update public.luxor_custom_workflow_source_events
        set status='ignored',processed_at=now(),last_error='The inquiry is not eligible for custom follow-up.'
        where id=source_event.id;
      v_ignored := v_ignored + 1;
      continue;
    end if;

    select count(*) into active_count from public.luxor_custom_workflows w
    join public.luxor_custom_workflow_versions v on v.id=w.current_version_id and v.workflow_id=w.id
    where w.trigger_type='contact_form_inquiry_created' and w.status='active';
    if active_count = 0 then
      update public.luxor_custom_workflow_source_events
        set status='ignored',processed_at=now(),last_error='No active custom workflow remained when the event was consumed.'
        where id=source_event.id;
      v_ignored := v_ignored + 1;
      continue;
    end if;

    select * into ack_job from public.luxor_email_jobs j
    where j.inquiry_id=inquiry.id and j.job_type='marketing_campaign'
      and j.metadata->>'source'='inquiry_acknowledgment'
    order by j.created_at asc,j.id asc limit 1;
    if not found then
      update public.luxor_custom_workflow_source_events
        set last_error='Waiting for the existing inquiry acknowledgment queue job.'
        where id=source_event.id;
      v_waiting := v_waiting + 1;
      continue;
    end if;

    for workflow in
      select w.id,w.current_version_id,v.definition
      from public.luxor_custom_workflows w
      join public.luxor_custom_workflow_versions v on v.id=w.current_version_id and v.workflow_id=w.id
      where w.trigger_type='contact_form_inquiry_created' and w.status='active'
      order by w.created_at,w.id
    loop
      if not public.luxor_custom_workflow_definition_is_runnable(workflow.definition) then
        insert into public.luxor_custom_workflow_activity(workflow_id,event_type,details)
          values (workflow.id,'workflow_version_held',jsonb_build_object('reason','active version is incomplete or invalid'));
        continue;
      end if;

      enrollment_id := null;
      enrollment_status := case when ack_job.status in ('failed','cancelled') then 'held' else 'active' end;
      insert into public.luxor_custom_workflow_enrollments(
        workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,
        next_run_at,started_at,last_error
      ) values (
        workflow.id,workflow.current_version_id,source_event.id,inquiry.id,enrollment_status,
        'inquiry-acknowledgment',case when enrollment_status='active' then now() else null end,
        now(),case when enrollment_status='held' then 'The existing inquiry acknowledgment failed; review before continuing.' else null end
      ) on conflict (workflow_id,source_event_id) do nothing returning id into enrollment_id;
      if enrollment_id is null then continue; end if;

      ack_run_status := case
        when ack_job.status='sent' then 'completed'
        when ack_job.status in ('queued','sending') then 'queued'
        else 'held'
      end;
      insert into public.luxor_custom_workflow_step_runs(
        enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,
        scheduled_for,completed_at,last_error,snapshot
      ) values (
        enrollment_id,workflow.current_version_id,'inquiry-acknowledgment',0,'email',ack_run_status,
        enrollment_id::text || ':inquiry-acknowledgment',now(),
        case when ack_run_status='completed' then now() else null end,
        case when ack_run_status='held' then 'The existing inquiry acknowledgment failed; review before continuing.' else null end,
        jsonb_build_object('existing_acknowledgment',true,'email_job_id',ack_job.id,'email_job_status',ack_job.status)
      ) returning id into ack_run_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (workflow.id,enrollment_id,ack_run_id,'enrollment_created',
          jsonb_build_object('version_id',workflow.current_version_id,'acknowledgment_job_id',ack_job.id));
      if ack_run_status='completed' then
        perform public.luxor_custom_workflow_schedule_next_step(ack_run_id);
      elsif ack_run_status='held' then
        v_held := v_held + 1;
      end if;
      v_created := v_created + 1;
    end loop;

    update public.luxor_custom_workflow_source_events
      set status='consumed',processed_at=now(),last_error=null
      where id=source_event.id;
    v_consumed := v_consumed + 1;
  end loop;
  return query select v_consumed,v_waiting,v_ignored,v_created,v_held;
end;
$$;

create or replace function public.luxor_custom_workflow_reconcile_acknowledgments(p_limit integer default 25)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  step_run record;
  email_status text;
  reconciled integer := 0;
  failure_reason text := 'The existing acknowledgment did not complete; custom follow-up is held for review.';
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return 0; end if;
  p_limit := greatest(1,least(coalesce(p_limit,25),100));
  for step_run in
    select sr.id,sr.enrollment_id,sr.snapshot,e.workflow_id
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.step_id='inquiry-acknowledgment' and sr.status='queued'
      and sr.snapshot->>'existing_acknowledgment'='true'
      and e.status='active' and e.current_step_id=sr.step_id and w.status='active'
    order by sr.scheduled_for,sr.created_at for update of sr skip locked limit p_limit
  loop
    select status into email_status from public.luxor_email_jobs
      where id=(step_run.snapshot->>'email_job_id')::uuid;
    if email_status='sent' then
      perform public.luxor_custom_workflow_schedule_next_step(step_run.id);
      reconciled := reconciled + 1;
    elsif email_status is null or email_status in ('failed','cancelled') then
      update public.luxor_custom_workflow_step_runs
        set status='held',last_error=failure_reason,updated_at=now()
        where id=step_run.id;
      update public.luxor_custom_workflow_enrollments
        set status='held',next_run_at=null,last_error=failure_reason,updated_at=now()
        where id=step_run.enrollment_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'acknowledgment_held',
          jsonb_build_object('reason',failure_reason));
      reconciled := reconciled + 1;
    end if;
  end loop;
  return reconciled;
end;
$$;

create or replace function public.luxor_custom_workflow_advance_control_steps(p_limit integer default 25)
returns table(advanced_count integer, stopped_count integer, completed_count integer, held_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  step_run record;
  inquiry public.luxor_inquiries%rowtype;
  eligible boolean;
  reason text;
  next_id uuid;
  v_advanced integer := 0;
  v_stopped integer := 0;
  v_completed integer := 0;
  v_held integer := 0;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select 0,0,0,0;
    return;
  end if;
  p_limit := greatest(1,least(coalesce(p_limit,25),100));
  for step_run in
    select sr.id,sr.enrollment_id,sr.step_id,sr.step_order,sr.channel,sr.snapshot,e.workflow_id,e.inquiry_id
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.channel in ('wait','condition','end') and sr.status='scheduled'
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id
      and e.next_run_at<=now() and w.status='active'
    order by sr.scheduled_for,sr.created_at for update of sr skip locked limit p_limit
  loop
    if step_run.channel='end' then
      update public.luxor_custom_workflow_step_runs
        set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
        where id=step_run.id;
      update public.luxor_custom_workflow_enrollments
        set status='completed',completed_at=coalesce(completed_at,now()),next_run_at=null,last_error=null,updated_at=now()
        where id=step_run.enrollment_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'enrollment_completed','{}'::jsonb);
      v_completed := v_completed + 1;
      continue;
    end if;

    if step_run.channel='condition' then
      select * into inquiry from public.luxor_inquiries where id=step_run.inquiry_id;
      eligible := false;
      reason := step_run.snapshot->>'condition';
      if not found or not public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'follow_up_eligible') then
        eligible := false;
        reason := 'follow_up_eligible';
      elsif reason='follow_up_eligible' then
        eligible := true;
      elsif reason='marketing_email_consent' then
        eligible := public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'email');
      elsif reason='marketing_sms_consent' then
        eligible := public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'text');
      end if;

      if not coalesce(eligible,false) then
        update public.luxor_custom_workflow_step_runs
          set status='skipped',completed_at=now(),last_error='Condition was false; workflow stopped.',updated_at=now()
          where id=step_run.id;
        update public.luxor_custom_workflow_enrollments
          set status='stopped',stopped_at=now(),next_run_at=null,stop_reason='condition_false:'||coalesce(reason,'unknown'),updated_at=now()
          where id=step_run.enrollment_id;
        insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
          values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'enrollment_stopped',
            jsonb_build_object('reason','condition_false','condition',reason));
        v_stopped := v_stopped + 1;
        continue;
      end if;
    end if;

    next_id := public.luxor_custom_workflow_schedule_next_step(step_run.id);
    if next_id is null then
      v_held := v_held + 1;
    else
      v_advanced := v_advanced + 1;
    end if;
  end loop;
  return query select v_advanced,v_stopped,v_completed,v_held;
end;
$$;

revoke all on function public.luxor_custom_workflow_definition_is_runnable(jsonb) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_schedule_next_step(uuid) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_consume_pending_events(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_reconcile_acknowledgments(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_advance_control_steps(integer) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_definition_is_runnable(jsonb) to service_role;
grant execute on function public.luxor_custom_workflow_schedule_next_step(uuid) to service_role;
grant execute on function public.luxor_custom_workflow_consume_pending_events(integer) to service_role;
grant execute on function public.luxor_custom_workflow_reconcile_acknowledgments(integer) to service_role;
grant execute on function public.luxor_custom_workflow_advance_control_steps(integer) to service_role;

create or replace function public.luxor_custom_workflow_inquiry_is_eligible(p_inquiry_id uuid, p_channel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.luxor_inquiries i
    where i.id = p_inquiry_id
      and i.flow = 'contact_form'
      and coalesce(i.is_test, false) = false
      and lower(coalesce(i.metadata->>'is_test_record', 'false')) <> 'true'
      and i.status not in ('tour_requested', 'tour_confirmed', 'booked', 'closed_lost')
      and i.preferred_tour_date is null
      and (i.follow_up_disposition is null or i.follow_up_disposition = 'no_response')
      and not exists (
        select 1 from public.luxor_bookings b
        where b.inquiry_id = i.id and b.status <> 'cancelled'
      )
      and case p_channel
        when 'follow_up_eligible' then true
        when 'email' then i.email is not null and i.marketing_opt_in = true
          and not exists (
            select 1 from public.luxor_marketing_suppressions s
            where lower(s.email) = lower(i.email)
          )
        when 'text' then i.phone is not null and exists (
          select 1 from public.luxor_sms_consents c
          where regexp_replace(c.phone_number, '[^0-9]', '', 'g') = regexp_replace(i.phone, '[^0-9]', '', 'g')
            and c.status = 'opted_in' and c.consent_scopes @> array['marketing']::text[]
        )
        when 'marketing_email_consent' then i.email is not null and i.marketing_opt_in = true
          and not exists (
            select 1 from public.luxor_marketing_suppressions s
            where lower(s.email) = lower(i.email)
          )
        when 'marketing_sms_consent' then i.phone is not null and exists (
          select 1 from public.luxor_sms_consents c
          where regexp_replace(c.phone_number, '[^0-9]', '', 'g') = regexp_replace(i.phone, '[^0-9]', '', 'g')
            and c.status = 'opted_in' and c.consent_scopes @> array['marketing']::text[]
        )
        else false
      end
  );
$$;

create or replace function public.luxor_custom_workflow_get_due_message_steps(p_limit integer default 20)
returns table(step_run_id uuid, workflow_id uuid, enrollment_id uuid, inquiry_id uuid,
  workflow_version_id uuid, step_order integer, channel text, step_definition jsonb, inquiry_context jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return; end if;
  p_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  return query
  select sr.id, e.workflow_id, e.id, e.inquiry_id, e.workflow_version_id, sr.step_order,
    sr.channel, v.definition->'steps'->sr.step_order,
    jsonb_build_object(
      'id', i.id, 'email', i.email, 'phone', i.phone, 'full_name', i.full_name,
      'event_type', i.event_type, 'guest_count', i.guest_count, 'target_date', i.target_date,
      'preferred_tour_date', i.preferred_tour_date, 'status', i.status,
      'marketing_opt_in', i.marketing_opt_in, 'is_test', i.is_test
    )
  from public.luxor_custom_workflow_step_runs sr
  join public.luxor_custom_workflow_enrollments e on e.id = sr.enrollment_id
    and e.workflow_version_id = sr.workflow_version_id
  join public.luxor_custom_workflows w on w.id = e.workflow_id and w.status = 'active'
  join public.luxor_custom_workflow_versions v on v.id = e.workflow_version_id and v.workflow_id = e.workflow_id
  join public.luxor_inquiries i on i.id = e.inquiry_id
  where sr.channel in ('email', 'text') and sr.status = 'scheduled'
    and sr.scheduled_for <= now() and e.status = 'active'
    and e.current_step_id = sr.step_id and e.next_run_at <= now()
    and public.luxor_custom_workflow_definition_is_runnable(v.definition)
  order by sr.scheduled_for, sr.created_at, sr.id
  limit p_limit;
end;
$$;

create or replace function public.luxor_custom_workflow_stop_ineligible_message_steps(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare item record; stopped_count integer:=0;
begin
  p_limit:=greatest(1,least(coalesce(p_limit,50),200));
  for item in
    select sr.id,sr.channel
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.channel in ('email','text') and sr.status in ('scheduled','queued')
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id
      and w.status='active' and not public.luxor_custom_workflow_inquiry_is_eligible(e.inquiry_id,sr.channel)
    order by sr.scheduled_for,sr.created_at for update of sr,e skip locked limit p_limit
  loop
    perform public.luxor_custom_workflow_stop_step(item.id,'Consent or inquiry eligibility was withdrawn before provider dispatch.');
    stopped_count:=stopped_count+1;
  end loop;
  return stopped_count;
end;
$$;

create or replace function public.luxor_custom_workflow_stop_step(p_step_run_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare run public.luxor_custom_workflow_step_runs%rowtype; workflow_id uuid;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return false; end if;
  select e.workflow_id into workflow_id from public.luxor_custom_workflow_enrollments e
    where e.id=run.enrollment_id for update;
  if run.status in ('sent','completed','skipped','cancelled') then return false; end if;
  update public.luxor_custom_workflow_step_runs
    set status='skipped',completed_at=coalesce(completed_at,now()),last_error=left(coalesce(p_reason,'Workflow stopped.'),1000),updated_at=now()
    where id=run.id;
  update public.luxor_custom_workflow_enrollments
    set status='stopped',stopped_at=coalesce(stopped_at,now()),next_run_at=null,
      stop_reason=left(coalesce(p_reason,'workflow_stopped'),240),last_error=left(coalesce(p_reason,'Workflow stopped.'),1000),updated_at=now()
    where id=run.enrollment_id and status in ('active','paused','held');
  update public.luxor_email_jobs set status='cancelled',last_error=left(coalesce(p_reason,'Workflow stopped.'),1000),updated_at=now()
    where custom_workflow_step_run_id=run.id and status in ('queued','sending');
  update public.luxor_text_jobs set status='cancelled',last_error=left(coalesce(p_reason,'Workflow stopped.'),1000),updated_at=now()
    where custom_workflow_step_run_id=run.id and status in ('queued','sending');
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow_id,run.enrollment_id,run.id,'message_skipped',jsonb_build_object('reason',left(coalesce(p_reason,'Workflow stopped.'),500)));
  return true;
end;
$$;

create or replace function public.luxor_custom_workflow_enqueue_email_step(
  p_step_run_id uuid, p_recipient_email text, p_subject text, p_body text,
  p_preview_text text, p_unsubscribe_token_hash text
) returns table(job_id uuid, disposition text, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_email_jobs%rowtype;
  created_job public.luxor_email_jobs%rowtype;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return query select null::uuid,'skipped'::text,'step_not_found'::text; return; end if;
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select null::uuid,'skipped'::text,'custom_workflow_execution_disabled'::text; return;
  end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  select definition into version_definition from public.luxor_custom_workflow_versions
    where id=enrollment.workflow_version_id and workflow_id=enrollment.workflow_id;
  step := version_definition->'steps'->run.step_order;
  select * into inquiry from public.luxor_inquiries where id=enrollment.inquiry_id for update;
  select * into existing_job from public.luxor_email_jobs where custom_workflow_step_run_id=run.id;
  if found then return query select existing_job.id,'existing'::text,null::text; return; end if;
  if run.channel <> 'email' or run.status <> 'scheduled' or run.scheduled_for > now() or run.step_id is distinct from step->>'id'
    or enrollment.status <> 'active' or enrollment.current_step_id is distinct from run.step_id
    or enrollment.next_run_at > now() or workflow.status <> 'active'
    or step->>'type' <> 'email' or step->>'mode' <> 'marketing'
    or not public.luxor_custom_workflow_definition_is_runnable(version_definition) then
    return query select null::uuid,'skipped'::text,'workflow_or_step_is_not_dispatchable'::text; return;
  end if;
  if not public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'email')
    or lower(coalesce(p_recipient_email,'')) <> lower(coalesce(inquiry.email,'')) then
    perform public.luxor_custom_workflow_stop_step(run.id,'Marketing email consent, eligibility, or recipient changed before queueing.');
    return query select null::uuid,'stopped'::text,'recipient_no_longer_eligible'::text; return;
  end if;
  if p_subject is null or length(btrim(p_subject)) not between 1 and 500 or p_subject ~ E'[\r\n]'
    or p_body is null or length(btrim(p_body))=0 or length(p_body)>100000
    or p_preview_text is null or length(p_preview_text)>500
    or coalesce(p_unsubscribe_token_hash,'') !~ '^[0-9a-f]{64}$' then
    return query select null::uuid,'held'::text,'rendered_email_invalid'::text; return;
  end if;
  insert into public.luxor_email_jobs(
    inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',inquiry.email,p_subject,p_body,run.scheduled_for,
    jsonb_build_object('automated',true,'custom_workflow',true,'compliance_scope','marketing',
      'preview_text',p_preview_text,'step_id',run.step_id),run.id
  ) on conflict (custom_workflow_step_run_id) where custom_workflow_step_run_id is not null
    do nothing returning * into created_job;
  if created_job.id is null then
    select * into existing_job from public.luxor_email_jobs where custom_workflow_step_run_id=run.id;
    return query select existing_job.id,'existing'::text,null::text; return;
  end if;
  insert into public.luxor_custom_workflow_unsubscribe_tokens(token_hash,step_run_id,inquiry_id,email)
    values(p_unsubscribe_token_hash,run.id,inquiry.id,lower(inquiry.email));
  update public.luxor_custom_workflow_step_runs
    set status='queued',snapshot=snapshot||jsonb_build_object('email_job_id',created_job.id),updated_at=now()
    where id=run.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow.id,enrollment.id,run.id,'message_queued',jsonb_build_object('channel','email','job_id',created_job.id));
  return query select created_job.id,'queued'::text,null::text;
end;
$$;

create or replace function public.luxor_custom_workflow_enqueue_text_step(
  p_step_run_id uuid, p_recipient_phone text, p_body text, p_segment_count integer
) returns table(job_id uuid, disposition text, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_text_jobs%rowtype;
  created_job public.luxor_text_jobs%rowtype;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found then return query select null::uuid,'skipped'::text,'step_not_found'::text; return; end if;
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select null::uuid,'skipped'::text,'custom_workflow_execution_disabled'::text; return;
  end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  select definition into version_definition from public.luxor_custom_workflow_versions
    where id=enrollment.workflow_version_id and workflow_id=enrollment.workflow_id;
  step := version_definition->'steps'->run.step_order;
  select * into inquiry from public.luxor_inquiries where id=enrollment.inquiry_id for update;
  select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
  if found then return query select existing_job.id,'existing'::text,null::text; return; end if;
  if run.channel <> 'text' or run.status <> 'scheduled' or run.scheduled_for > now() or run.step_id is distinct from step->>'id'
    or enrollment.status <> 'active' or enrollment.current_step_id is distinct from run.step_id
    or enrollment.next_run_at > now() or workflow.status <> 'active'
    or step->>'type' <> 'text' or step->>'requiredConsentScope' <> 'marketing'
    or not public.luxor_custom_workflow_definition_is_runnable(version_definition) then
    return query select null::uuid,'skipped'::text,'workflow_or_step_is_not_dispatchable'::text; return;
  end if;
  if not public.luxor_custom_workflow_inquiry_is_eligible(inquiry.id,'text')
    or coalesce(p_recipient_phone,'') !~ '^\+[1-9][0-9]{7,14}$'
    or regexp_replace(coalesce(inquiry.phone,''),'[^0-9]','','g') <> regexp_replace(coalesce(p_recipient_phone,''),'[^0-9]','','g') then
    perform public.luxor_custom_workflow_stop_step(run.id,'Marketing SMS consent, eligibility, or recipient changed before queueing.');
    return query select null::uuid,'stopped'::text,'recipient_no_longer_eligible'::text; return;
  end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>480
    or p_body !~* '^Luxor Event Space\M' or p_body !~* '\mSTOP\M'
    or p_segment_count not between 1 and 10 then
    return query select null::uuid,'held'::text,'rendered_text_invalid'::text; return;
  end if;
  insert into public.luxor_text_jobs(
    inquiry_id,job_type,status,recipient_phone,recipient_name,body,segment_count,scheduled_for,
    automation_key,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',p_recipient_phone,inquiry.full_name,p_body,p_segment_count,run.scheduled_for,
    'custom_workflow:'||run.id::text,jsonb_build_object('automated',true,'custom_workflow',true,
      'compliance_scope','marketing','step_id',run.step_id),run.id
  ) on conflict (custom_workflow_step_run_id) where custom_workflow_step_run_id is not null
    do nothing returning * into created_job;
  if created_job.id is null then
    select * into existing_job from public.luxor_text_jobs where custom_workflow_step_run_id=run.id;
    return query select existing_job.id,'existing'::text,null::text; return;
  end if;
  update public.luxor_custom_workflow_step_runs
    set status='queued',snapshot=snapshot||jsonb_build_object('text_job_id',created_job.id),updated_at=now()
    where id=run.id;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow.id,enrollment.id,run.id,'message_queued',jsonb_build_object('channel','text','job_id',created_job.id));
  return query select created_job.id,'queued'::text,null::text;
end;
$$;

-- Private deterministic core used by the real-clock wrapper below and by
-- disposable SQL fixtures. It is not executable by service_role or API roles.
create or replace function public.luxor_custom_workflow_authorize_message_job_at(
  p_job_id uuid, p_channel text, p_pre_send_at timestamptz
)
returns table(allowed boolean, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry_id uuid;
  job_status text;
  linked_run_id uuid;
begin
  if not public.luxor_custom_workflow_runtime_enabled() then
    return query select false,'custom_workflow_execution_disabled'::text;
    return;
  end if;
  if p_channel='email' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status into linked_run_id,inquiry_id,job_status
      from public.luxor_email_jobs as j where j.id=p_job_id and j.job_type='custom_workflow' for update of j;
  elsif p_channel='text' then
    select j.custom_workflow_step_run_id,j.inquiry_id,j.status into linked_run_id,inquiry_id,job_status
      from public.luxor_text_jobs as j where j.id=p_job_id and j.job_type='custom_workflow' for update of j;
  else
    return query select false,'unsupported_channel'::text; return;
  end if;
  if linked_run_id is null then return query select false,'job_not_linked'::text; return; end if;
  select * into run from public.luxor_custom_workflow_step_runs where id=linked_run_id for update;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  select * into workflow from public.luxor_custom_workflows where id=enrollment.workflow_id for update;
  if job_status <> 'sending' or run.status <> 'sending' or run.channel <> p_channel
    or enrollment.current_step_id is distinct from run.step_id then
    return query select false,'claim_or_current_step_changed'::text; return;
  end if;
  if p_channel='text' and not public.luxor_custom_workflow_is_within_sms_send_window(p_pre_send_at) then
    update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'outside_sms_send_window'::text; return;
  end if;
  if run.scheduled_for>now() or enrollment.next_run_at>now() then
    if p_channel='email' then
      update public.luxor_email_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    else
      update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    end if;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'not_due'::text; return;
  end if;
  if workflow.status='paused' or enrollment.status='paused' then
    if p_channel='email' then
      update public.luxor_email_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    else
      update public.luxor_text_jobs set status='queued',attempts=greatest(0,attempts-1),last_error=null,updated_at=now() where id=p_job_id;
    end if;
    update public.luxor_custom_workflow_step_runs set status='queued',last_error=null,updated_at=now() where id=run.id;
    return query select false,'workflow_paused'::text; return;
  end if;
  if enrollment.status <> 'active' or workflow.status <> 'active'
    or not public.luxor_custom_workflow_inquiry_is_eligible(inquiry_id,p_channel) then
    perform public.luxor_custom_workflow_stop_step(run.id,'Eligibility, consent, or workflow status changed before provider dispatch.');
    return query select false,'recipient_or_workflow_no_longer_eligible'::text; return;
  end if;
  return query select true,null::text;
end;
$$;

create or replace function public.luxor_custom_workflow_authorize_message_job(p_job_id uuid, p_channel text)
returns table(allowed boolean, reason text)
language plpgsql security definer set search_path = '' as $$
begin
  return query select * from public.luxor_custom_workflow_authorize_message_job_at(p_job_id,p_channel,now());
end;
$$;

create or replace function public.luxor_custom_workflow_claim_due_email_jobs(p_limit integer default 1)
returns setof public.luxor_email_jobs language plpgsql security definer set search_path = '' as $$
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return; end if;
  p_limit := greatest(1,least(coalesce(p_limit,1),10));
  return query with due as (
    select j.id from public.luxor_email_jobs j
    join public.luxor_custom_workflow_step_runs sr on sr.id=j.custom_workflow_step_run_id
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where j.job_type='custom_workflow' and j.status='queued' and j.scheduled_for<=now()
      and sr.channel='email' and sr.status='queued' and e.status='active'
      and sr.scheduled_for<=now() and e.current_step_id=sr.step_id and e.next_run_at<=now() and w.status='active'
      and public.luxor_custom_workflow_inquiry_is_eligible(e.inquiry_id,'email')
      and not exists(
        select 1 from public.luxor_email_jobs recent
        where recent.job_type not in ('inquiry_notification','transactional_notice','test_notification')
          and recent.status in ('sending','sent')
          and coalesce(recent.sent_at,recent.updated_at)>now()-interval '60 seconds'
      )
    order by j.scheduled_for,j.created_at,j.id for update of j,sr,e skip locked limit p_limit
  ), claimed as (
    update public.luxor_email_jobs j set status='sending',attempts=j.attempts+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ), marked as (
    update public.luxor_custom_workflow_step_runs sr set status='sending',started_at=coalesce(sr.started_at,now()),updated_at=now()
      from claimed c where sr.id=c.custom_workflow_step_run_id returning sr.id
  ) select c.* from claimed c join marked m on m.id=c.custom_workflow_step_run_id
    order by c.scheduled_for,c.created_at,c.id;
end;
$$;

create or replace function public.luxor_custom_workflow_claim_due_text_jobs(p_limit integer default 10,p_segment_budget integer default 100)
returns setof public.luxor_text_jobs language plpgsql security definer set search_path = '' as $$
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return; end if;
  if not public.luxor_custom_workflow_is_within_sms_send_window(now()) then return; end if;
  p_limit := greatest(1,least(coalesce(p_limit,10),50));
  p_segment_budget := greatest(0,least(coalesce(p_segment_budget,0),100000));
  return query with due as (
    select j.id from public.luxor_text_jobs j
    join public.luxor_custom_workflow_step_runs sr on sr.id=j.custom_workflow_step_run_id
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where j.job_type='custom_workflow' and j.status='queued' and j.scheduled_for<=now()
      and j.segment_count<=p_segment_budget and sr.channel='text' and sr.status='queued'
      and sr.scheduled_for<=now() and e.status='active' and e.current_step_id=sr.step_id and e.next_run_at<=now()
      and w.status='active' and public.luxor_custom_workflow_inquiry_is_eligible(e.inquiry_id,'text')
    order by j.scheduled_for,j.created_at,j.id for update of j,sr,e skip locked limit p_limit
  ), claimed as (
    update public.luxor_text_jobs j set status='sending',attempts=coalesce(j.attempts,0)+1,updated_at=now()
      from due where j.id=due.id returning j.*
  ), marked as (
    update public.luxor_custom_workflow_step_runs sr set status='sending',started_at=coalesce(sr.started_at,now()),updated_at=now()
      from claimed c where sr.id=c.custom_workflow_step_run_id returning sr.id
  ) select c.* from claimed c join marked m on m.id=c.custom_workflow_step_run_id
    order by c.scheduled_for,c.created_at,c.id;
end;
$$;

create or replace function public.luxor_custom_workflow_record_message_outcome(
  p_step_run_id uuid,p_job_id uuid,p_channel text,p_outcome text,p_provider_reference text,p_reason text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare run public.luxor_custom_workflow_step_runs%rowtype; enrollment public.luxor_custom_workflow_enrollments%rowtype; workflow_id uuid;
begin
  select * into run from public.luxor_custom_workflow_step_runs where id=p_step_run_id for update;
  if not found or run.channel<>p_channel then return false; end if;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  workflow_id:=enrollment.workflow_id;
  if run.status in ('sent','completed','skipped','cancelled') then return true; end if;
  if p_outcome='accepted' then
    if p_channel='email' then
      update public.luxor_email_jobs set status='sent',sent_at=coalesce(sent_at,now()),last_error=null,updated_at=now()
        where id=p_job_id and custom_workflow_step_run_id=run.id and job_type='custom_workflow';
    elsif p_channel='text' then
      update public.luxor_text_jobs set status='sent',sent_at=coalesce(sent_at,now()),twilio_message_sid=p_provider_reference,
        last_error=null,updated_at=now()
        where id=p_job_id and custom_workflow_step_run_id=run.id and job_type='custom_workflow';
    else return false; end if;
    if not found then return false; end if;
    update public.luxor_custom_workflow_step_runs set status='sent',completed_at=coalesce(completed_at,now()),
      provider_accepted_at=coalesce(provider_accepted_at,now()),provider_reference=coalesce(p_provider_reference,provider_reference),
      last_error=null,updated_at=now() where id=run.id;
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(workflow_id,enrollment.id,run.id,'message_provider_accepted',jsonb_build_object('channel',p_channel,'provider_reference',p_provider_reference));
    perform public.luxor_custom_workflow_schedule_next_step(run.id);
    return true;
  end if;

  update public.luxor_custom_workflow_step_runs set status='held',provider_reference=coalesce(p_provider_reference,provider_reference),
    last_error='provider_outcome_unknown:'||left(coalesce(p_reason,'Provider outcome needs reconciliation.'),800),updated_at=now()
    where id=run.id and status not in ('sent','completed','skipped','cancelled');
  update public.luxor_custom_workflow_enrollments set status='held',next_run_at=null,
    last_error='Provider outcome needs reconciliation; this message will not be automatically resent.',updated_at=now()
    where id=enrollment.id and status='active' and current_step_id=run.step_id;
  if p_channel='email' then
    update public.luxor_email_jobs set status='sending',last_error='Provider outcome needs reconciliation; automatic retry is disabled.',updated_at=now()
      where id=p_job_id and custom_workflow_step_run_id=run.id;
  elsif p_channel='text' then
    update public.luxor_text_jobs set status='sending',twilio_message_sid=coalesce(p_provider_reference,twilio_message_sid),
      last_error='Provider outcome needs reconciliation; automatic retry is disabled.',updated_at=now()
      where id=p_job_id and custom_workflow_step_run_id=run.id;
  end if;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    values(workflow_id,enrollment.id,run.id,'message_held',jsonb_build_object('channel',p_channel,'reason',left(coalesce(p_reason,'unknown_provider_outcome'),500),'provider_reference',p_provider_reference));
  return true;
end;
$$;

create or replace function public.luxor_custom_workflow_reconcile_text_callback(
  p_message_sid text,p_provider_status text,p_error text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.luxor_text_jobs%rowtype; run public.luxor_custom_workflow_step_runs%rowtype; enrollment public.luxor_custom_workflow_enrollments%rowtype;
begin
  select * into job from public.luxor_text_jobs where twilio_message_sid=p_message_sid and custom_workflow_step_run_id is not null limit 1;
  if not found then return false; end if;
  select * into run from public.luxor_custom_workflow_step_runs where id=job.custom_workflow_step_run_id for update;
  select * into enrollment from public.luxor_custom_workflow_enrollments where id=run.enrollment_id for update;
  if run.status='held' and run.last_error like 'provider_outcome_unknown:%'
    and enrollment.status='held' and enrollment.current_step_id=run.step_id then
    if lower(p_provider_status) in ('accepted','queued','sending','sent','delivered','read') then
      update public.luxor_custom_workflow_enrollments set status='active',last_error=null,updated_at=now()
        where id=enrollment.id and exists(select 1 from public.luxor_custom_workflows w where w.id=enrollment.workflow_id and w.status='active')
          and public.luxor_custom_workflow_inquiry_is_eligible(enrollment.inquiry_id,'text');
      if found then
        update public.luxor_custom_workflow_step_runs set status='sent',completed_at=coalesce(completed_at,now()),
          provider_accepted_at=coalesce(provider_accepted_at,now()),last_error=null,updated_at=now() where id=run.id;
        insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
          values(enrollment.workflow_id,enrollment.id,run.id,'provider_callback_reconciled',jsonb_build_object('status',p_provider_status,'message_sid',p_message_sid));
        perform public.luxor_custom_workflow_schedule_next_step(run.id);
      end if;
    else
      update public.luxor_custom_workflow_step_runs set last_error='provider_outcome_unknown:Twilio later reported '||left(coalesce(p_provider_status,'failure'),100)||'. '||left(coalesce(p_error,''),500),updated_at=now() where id=run.id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values(enrollment.workflow_id,enrollment.id,run.id,'provider_callback_failed',jsonb_build_object('status',p_provider_status,'error',left(coalesce(p_error,''),500),'message_sid',p_message_sid));
    end if;
  else
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(enrollment.workflow_id,enrollment.id,run.id,'message_delivery_update',jsonb_build_object('status',p_provider_status,'error',left(coalesce(p_error,''),500),'message_sid',p_message_sid));
  end if;
  return true;
end;
$$;

create or replace function public.luxor_custom_workflow_hold_stale_dispatches(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare item record; held_count integer:=0;
begin
  p_limit:=greatest(1,least(coalesce(p_limit,50),200));
  for item in
    select sr.id,sr.enrollment_id,e.workflow_id
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    where sr.status='sending' and sr.started_at<now()-interval '15 minutes' and e.status='active' and e.current_step_id=sr.step_id
    order by sr.started_at,sr.id for update of sr,e skip locked limit p_limit
  loop
    update public.luxor_custom_workflow_step_runs set status='held',last_error='provider_outcome_unknown:Worker stopped during provider dispatch; automatic resend is disabled.',updated_at=now() where id=item.id;
    update public.luxor_custom_workflow_enrollments set status='held',next_run_at=null,
      last_error='Provider outcome needs reconciliation; this message will not be automatically resent.',updated_at=now() where id=item.enrollment_id;
    insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
      values(item.workflow_id,item.enrollment_id,item.id,'message_stale_dispatch_held','{"automatic_retry":false}'::jsonb);
    held_count:=held_count+1;
  end loop;
  return held_count;
end;
$$;

create or replace function public.luxor_custom_workflow_record_unsubscribe(p_token_hash text)
returns table(email text) language plpgsql security definer set search_path = '' as $$
declare token public.luxor_custom_workflow_unsubscribe_tokens%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then return; end if;
  select * into token from public.luxor_custom_workflow_unsubscribe_tokens where token_hash=p_token_hash for update;
  if not found then return; end if;
  update public.luxor_custom_workflow_unsubscribe_tokens set used_at=coalesce(used_at,now()) where token_hash=p_token_hash;
  insert into public.luxor_marketing_suppressions(email,reason,source,metadata)
    values(lower(token.email),'unsubscribe','custom_workflow',jsonb_build_object('step_run_id',token.step_run_id))
    on conflict(email) do nothing;
  insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
    select e.workflow_id,e.id,sr.id,'marketing_email_unsubscribed',
      jsonb_build_object('source','custom_workflow_email')
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    where sr.id=token.step_run_id;
  return query select lower(token.email);
end;
$$;

create or replace function public.luxor_custom_workflow_reconcile_acknowledgments(p_limit integer default 25)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  step_run record;
  email_status text;
  reconciled integer := 0;
  failure_reason text := 'The existing acknowledgment did not complete; custom follow-up is held for review.';
begin
  if not public.luxor_custom_workflow_runtime_enabled() then return 0; end if;
  p_limit := greatest(1,least(coalesce(p_limit,25),100));
  for step_run in
    select sr.id,sr.enrollment_id,sr.snapshot,e.workflow_id
    from public.luxor_custom_workflow_step_runs sr
    join public.luxor_custom_workflow_enrollments e on e.id=sr.enrollment_id
    join public.luxor_custom_workflows w on w.id=e.workflow_id
    where sr.step_id='inquiry-acknowledgment' and sr.status='queued'
      and sr.snapshot->>'existing_acknowledgment'='true'
      and e.status='active' and e.current_step_id=sr.step_id and w.status='active'
    order by sr.scheduled_for,sr.created_at for update of sr skip locked limit p_limit
  loop
    select status into email_status from public.luxor_email_jobs
      where id=(step_run.snapshot->>'email_job_id')::uuid;
    if email_status='sent' then
      perform public.luxor_custom_workflow_schedule_next_step(step_run.id);
      reconciled := reconciled + 1;
    elsif email_status is null or email_status in ('failed','cancelled') then
      update public.luxor_custom_workflow_step_runs
        set status='held',last_error=failure_reason,updated_at=now()
        where id=step_run.id;
      update public.luxor_custom_workflow_enrollments
        set status='held',next_run_at=null,last_error=failure_reason,updated_at=now()
        where id=step_run.enrollment_id;
      insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,details)
        values (step_run.workflow_id,step_run.enrollment_id,step_run.id,'acknowledgment_held',jsonb_build_object('reason',failure_reason));
      reconciled := reconciled + 1;
    end if;
  end loop;
  return reconciled;
end;
$$;

revoke all on function public.luxor_custom_workflow_inquiry_is_eligible(uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_get_due_message_steps(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_stop_ineligible_message_steps(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_stop_step(uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_enqueue_email_step(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_enqueue_text_step(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_authorize_message_job(uuid,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_authorize_message_job_at(uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.luxor_custom_workflow_claim_due_email_jobs(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_claim_due_text_jobs(integer,integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_record_message_outcome(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_reconcile_text_callback(text,text,text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_hold_stale_dispatches(integer) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_record_unsubscribe(text) from public,anon,authenticated;
revoke all on function public.luxor_custom_workflow_change_lifecycle(uuid,text,text) from public,anon,authenticated;
grant execute on function public.luxor_custom_workflow_inquiry_is_eligible(uuid,text) to service_role;
grant execute on function public.luxor_custom_workflow_get_due_message_steps(integer) to service_role;
grant execute on function public.luxor_custom_workflow_stop_ineligible_message_steps(integer) to service_role;
grant execute on function public.luxor_custom_workflow_stop_step(uuid,text) to service_role;
grant execute on function public.luxor_custom_workflow_enqueue_email_step(uuid,text,text,text,text,text) to service_role;
grant execute on function public.luxor_custom_workflow_enqueue_text_step(uuid,text,text,integer) to service_role;
grant execute on function public.luxor_custom_workflow_authorize_message_job(uuid,text) to service_role;
grant execute on function public.luxor_custom_workflow_claim_due_email_jobs(integer) to service_role;
grant execute on function public.luxor_custom_workflow_claim_due_text_jobs(integer,integer) to service_role;
grant execute on function public.luxor_custom_workflow_record_message_outcome(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.luxor_custom_workflow_reconcile_text_callback(text,text,text) to service_role;
grant execute on function public.luxor_custom_workflow_hold_stale_dispatches(integer) to service_role;
grant execute on function public.luxor_custom_workflow_record_unsubscribe(text) to service_role;
grant execute on function public.luxor_custom_workflow_change_lifecycle(uuid,text,text) to service_role;

notify pgrst, 'reload schema';
