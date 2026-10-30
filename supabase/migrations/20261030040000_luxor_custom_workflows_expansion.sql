-- Expansion for custom marketing workflows:
-- 1. Expanded trigger types (contact_form_inquiry_created, sms_opt_in, tour_upcoming, tour_scheduled, tour_attended, tour_no_show, manual)
-- 2. Call task step type in addition to email, text, wait, condition, end
-- 3. AI message generation mode and prompts for emails & texts

alter table public.luxor_custom_workflows
  drop constraint if exists luxor_custom_workflows_trigger_type_check;

alter table public.luxor_custom_workflows
  add constraint luxor_custom_workflows_trigger_type_check
  check (trigger_type = any (array[
    'contact_form_inquiry_created'::text,
    'sms_opt_in'::text,
    'tour_upcoming'::text,
    'tour_scheduled'::text,
    'tour_attended'::text,
    'tour_no_show'::text,
    'manual'::text
  ]));

alter table public.luxor_custom_workflow_source_events
  drop constraint if exists luxor_custom_workflow_source_events_trigger_type_check;

alter table public.luxor_custom_workflow_source_events
  add constraint luxor_custom_workflow_source_events_trigger_type_check
  check (trigger_type = any (array[
    'contact_form_inquiry_created'::text,
    'sms_opt_in'::text,
    'tour_upcoming'::text,
    'tour_scheduled'::text,
    'tour_attended'::text,
    'tour_no_show'::text,
    'manual'::text
  ]));

alter table public.luxor_custom_workflow_step_runs
  drop constraint if exists luxor_custom_workflow_step_runs_channel_check;

alter table public.luxor_custom_workflow_step_runs
  add constraint luxor_custom_workflow_step_runs_channel_check
  check (channel = any (array['email'::text, 'text'::text, 'call_task'::text, 'wait'::text, 'condition'::text, 'end'::text]));

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
  trigger_val text;
begin
  if jsonb_typeof(p_definition) is distinct from 'object'
    or p_definition->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_definition->'steps') is distinct from 'array' then
    return false;
  end if;

  trigger_val := coalesce(p_definition->>'trigger', '');
  if trigger_val not in (
    'contact_form_inquiry_created',
    'sms_opt_in',
    'tour_upcoming',
    'tour_scheduled',
    'tour_attended',
    'tour_no_show',
    'manual'
  ) then
    return false;
  end if;

  for key in select jsonb_object_keys(p_definition) loop
    if key not in ('schemaVersion', 'trigger', 'steps', 'metadata') then return false; end if;
  end loop;

  steps := p_definition->'steps';
  step_count := jsonb_array_length(steps);
  if step_count < 2 or step_count > 25 then return false; end if;

  for step in select value from jsonb_array_elements(steps) with ordinality as entries(value, ordinal) order by ordinal loop
    if jsonb_typeof(step) is distinct from 'object'
      or jsonb_typeof(step->'id') is distinct from 'string'
      or jsonb_typeof(step->'type') is distinct from 'string'
      or jsonb_typeof(step->'name') is distinct from 'string' then return false; end if;

    step_type := step->>'type';
    for key in select jsonb_object_keys(step) loop
      if step_type = 'email' and key not in ('id', 'type', 'mode', 'name', 'subject', 'previewText', 'body', 'ctaText', 'ctaUrl', 'generationMode', 'aiPrompt', 'templateId') then return false; end if;
      if step_type = 'text' and key not in ('id', 'type', 'name', 'body', 'requiredConsentScope', 'generationMode', 'aiPrompt') then return false; end if;
      if step_type = 'call_task' and key not in ('id', 'type', 'name', 'scriptNotes', 'dueWithinHours', 'priority', 'assignee') then return false; end if;
      if step_type = 'wait' and key not in ('id', 'type', 'name', 'amount', 'unit') then return false; end if;
      if step_type = 'condition' and key not in ('id', 'type', 'name', 'condition', 'whenFalse') then return false; end if;
      if step_type = 'end' and key not in ('id', 'type', 'name') then return false; end if;
    end loop;

    step_id := step->>'id';
    if step_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
      or length(btrim(step->>'name')) not between 1 and 120
      or step_id = any(ids) then return false; end if;
    ids := array_append(ids, step_id);

    if step_type = 'email' then
      if step->>'mode' is not null and step->>'mode' not in ('existing_inquiry_acknowledgment', 'marketing') then
        return false;
      end if;
      if jsonb_typeof(step->'subject') is distinct from 'string'
        or jsonb_typeof(step->'previewText') is distinct from 'string'
        or jsonb_typeof(step->'body') is distinct from 'string'
        or jsonb_typeof(step->'ctaText') is distinct from 'string'
        or jsonb_typeof(step->'ctaUrl') is distinct from 'string' then
        return false;
      end if;
    elsif step_type = 'text' then
      if step->>'requiredConsentScope' is distinct from 'marketing'
        or jsonb_typeof(step->'body') is distinct from 'string' then return false; end if;
    elsif step_type = 'call_task' then
      if (step->'scriptNotes' is not null and jsonb_typeof(step->'scriptNotes') is distinct from 'string')
        or (step->'priority' is not null and step->>'priority' not in ('low', 'medium', 'high', 'urgent')) then
        return false;
      end if;
    elsif step_type = 'wait' then
      if step->>'unit' not in ('minutes', 'hours', 'days') or step->'amount' is null then return false; end if;
      if step->'amount' <> 'null'::jsonb
        and (jsonb_typeof(step->'amount') <> 'number' or (step->>'amount')::numeric not between 0 and 365
          or trunc((step->>'amount')::numeric) <> (step->>'amount')::numeric) then return false; end if;
    elsif step_type = 'condition' then
      if step->>'condition' is null
        or step->>'condition' not in ('follow_up_eligible', 'marketing_email_consent', 'marketing_sms_consent', 'tour_scheduled', 'tour_attended', 'unresponsive')
        or step->>'whenFalse' is distinct from 'stop' then return false; end if;
    elsif step_type = 'end' then
      end_count := end_count + 1;
      if step_count <> array_length(ids, 1) then return false; end if;
    else
      return false;
    end if;
  end loop;

  return end_count = 1;
exception when others then
  return false;
end;
$$;

create or replace function public.luxor_custom_workflow_definition_is_runnable(p_definition jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare step jsonb;
begin
  if not public.luxor_custom_workflow_definition_is_structural(p_definition) then return false; end if;
  for step in select value from jsonb_array_elements(p_definition->'steps') loop
    if step->>'type' = 'wait'
      and (step->'amount' is null or step->'amount' = 'null'::jsonb) then return false; end if;
    if step->>'type' = 'email' and coalesce(step->>'mode', 'marketing') = 'marketing'
      and coalesce(step->>'generationMode', 'manual') = 'manual'
      and (length(btrim(coalesce(step->>'subject',''))) = 0
        or length(btrim(coalesce(step->>'body',''))) = 0) then return false; end if;
    if step->>'type' = 'email' and coalesce(step->>'generationMode', 'manual') = 'ai'
      and length(btrim(coalesce(step->>'aiPrompt',''))) = 0 then return false; end if;
    if step->>'type' = 'text'
      and coalesce(step->>'generationMode', 'manual') = 'manual'
      and (length(btrim(coalesce(step->>'body',''))) = 0
        or length(step->>'body') > 480) then return false; end if;
    if step->>'type' = 'text' and coalesce(step->>'generationMode', 'manual') = 'ai'
      and length(btrim(coalesce(step->>'aiPrompt',''))) = 0 then return false; end if;
    if step->>'type' = 'call_task'
      and length(btrim(coalesce(step->>'name', ''))) = 0 then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.luxor_custom_workflow_create_draft(
  p_name text, p_definition jsonb, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare
  created public.luxor_custom_workflows%rowtype;
  v_trigger text;
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

  v_trigger := coalesce(nullif(btrim(p_definition->>'trigger'), ''), 'contact_form_inquiry_created');

  insert into public.luxor_custom_workflows(name, trigger_type, status, draft_definition, draft_revision, created_by, updated_by)
  values (btrim(p_name), v_trigger, 'draft', p_definition, 1, lower(btrim(p_actor_email)), lower(btrim(p_actor_email)))
  returning * into created;

  insert into public.luxor_custom_workflow_activity(workflow_id, event_type, actor_email, details)
  values (created.id, 'draft_created', lower(btrim(p_actor_email)), jsonb_build_object('revision', created.draft_revision, 'trigger', v_trigger));

  return next created;
end;
$$;

create or replace function public.luxor_custom_workflow_save_draft(
  p_workflow_id uuid, p_expected_revision integer, p_name text, p_definition jsonb, p_actor_email text
) returns setof public.luxor_custom_workflows
language plpgsql security definer set search_path = '' as $$
declare
  saved public.luxor_custom_workflows%rowtype;
  v_trigger text;
begin
  if not public.luxor_custom_workflow_authoring_enabled() then
    raise exception 'Custom workflow authoring is disabled.' using errcode = '55000';
  end if;
  if p_expected_revision < 1 or char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
    or char_length(btrim(coalesce(p_actor_email, ''))) not between 3 and 254
    or not public.luxor_custom_workflow_definition_is_structural(p_definition) then
    raise exception 'Draft is invalid. Reload before saving.' using errcode = '22023';
  end if;

  v_trigger := coalesce(nullif(btrim(p_definition->>'trigger'), ''), 'contact_form_inquiry_created');

  update public.luxor_custom_workflows
  set name = btrim(p_name),
      trigger_type = v_trigger,
      draft_definition = p_definition,
      draft_revision = draft_revision + 1,
      updated_by = lower(btrim(p_actor_email)),
      updated_at = now()
  where id = p_workflow_id and status = 'draft' and draft_revision = p_expected_revision
  returning * into saved;

  if not found then raise exception 'Draft revision changed or is no longer editable.' using errcode = '40001'; end if;

  insert into public.luxor_custom_workflow_activity(workflow_id, event_type, actor_email, details)
  values (saved.id, 'draft_saved', lower(btrim(p_actor_email)), jsonb_build_object('revision', saved.draft_revision, 'trigger', v_trigger));

  return next saved;
end;
$$;
