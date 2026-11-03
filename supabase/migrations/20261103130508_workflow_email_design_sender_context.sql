-- Workflow-specific email documents and sender identities. No enrollment or delivery is performed.

CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_definition_is_structural(p_definition jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    if key not in ('schemaVersion', 'trigger', 'steps', 'metadata', 'emailSettings') then return false; end if;
  end loop;


  if p_definition ? 'emailSettings' then
    if jsonb_typeof(p_definition->'emailSettings') is distinct from 'object'
      or p_definition->'emailSettings'->>'senderMode' not in ('operator', 'elena')
      or p_definition->'emailSettings'->>'senderMode' is null
      or coalesce(p_definition->'emailSettings'->>'senderEmail','') !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$'
      or length(p_definition->'emailSettings'->>'senderEmail') > 254 then return false; end if;
    for key in select jsonb_object_keys(p_definition->'emailSettings') loop
      if key not in ('senderMode','senderEmail','senderActorEmail') then return false; end if;
    end loop;
    if p_definition->'emailSettings'->>'senderMode' = 'operator'
      and (jsonb_typeof(p_definition->'emailSettings'->'senderActorEmail') is distinct from 'string'
        or coalesce(p_definition->'emailSettings'->>'senderActorEmail','') !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$') then return false; end if;
  end if;

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
      if step_type = 'email' and key not in ('id', 'type', 'mode', 'name', 'subject', 'previewText', 'body', 'ctaText', 'ctaUrl', 'generationMode', 'aiPrompt', 'templateId', 'emailStyle', 'emailDocument') then return false; end if;
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

      if step ? 'emailStyle' and (jsonb_typeof(step->'emailStyle') is distinct from 'string'
        or step->>'emailStyle' not in ('personal','template')) then return false; end if;
      if step ? 'generationMode' and (jsonb_typeof(step->'generationMode') is distinct from 'string'
        or step->>'generationMode' not in ('manual','ai')) then return false; end if;
      if step ? 'aiPrompt' and (jsonb_typeof(step->'aiPrompt') is distinct from 'string'
        or length(step->>'aiPrompt') > 6000) then return false; end if;
      if step ? 'emailDocument' then
        if jsonb_typeof(step->'emailDocument') is distinct from 'object'
          or step->'emailDocument'->>'schemaVersion' is distinct from '2'
          or jsonb_typeof(step->'emailDocument'->'subject') is distinct from 'string'
          or jsonb_typeof(step->'emailDocument'->'preheader') is distinct from 'string'
          or jsonb_typeof(step->'emailDocument'->'theme') is distinct from 'object'
          or jsonb_typeof(step->'emailDocument'->'blocks') is distinct from 'array'
          or jsonb_array_length(step->'emailDocument'->'blocks') not between 1 and 30
          or octet_length((step->'emailDocument')::text) > 130000 then return false; end if;
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
$function$;


CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_definition_is_runnable(p_definition jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare step jsonb;
begin
  if not public.luxor_custom_workflow_definition_is_structural(p_definition) then return false; end if;
  for step in select value from jsonb_array_elements(p_definition->'steps') loop
    if step->>'type' = 'wait'
      and (step->'amount' is null or step->'amount' = 'null'::jsonb) then return false; end if;
    if step->>'type' = 'email' and coalesce(step->>'mode', 'marketing') = 'marketing'
      and coalesce(step->>'generationMode', 'manual') = 'manual'
      and (length(btrim(coalesce(step->>'subject',''))) = 0
        or (coalesce(step->>'emailStyle','personal') <> 'template' and length(btrim(coalesce(step->>'body',''))) = 0)) then return false; end if;
    if step->>'type' = 'email' and step->>'emailStyle' = 'template'
      and step->'emailDocument' is null then return false; end if;
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
$function$;


CREATE OR REPLACE FUNCTION public.luxor_custom_workflow_enqueue_email_step(p_step_run_id uuid, p_recipient_email text, p_subject text, p_body text, p_preview_text text, p_unsubscribe_token_hash text)
 RETURNS TABLE(job_id uuid, disposition text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  run public.luxor_custom_workflow_step_runs%rowtype;
  enrollment public.luxor_custom_workflow_enrollments%rowtype;
  workflow public.luxor_custom_workflows%rowtype;
  inquiry public.luxor_inquiries%rowtype;
  version_definition jsonb;
  step jsonb;
  existing_job public.luxor_email_jobs%rowtype;
  created_job public.luxor_email_jobs%rowtype;
  sender_from text;
  sender_name text;
  sender_actor text;
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

  -- Sender identity comes from the immutable version. The server pins the
  -- operator from the authenticated session and enforces the mailbox allowlist.
  -- The provider validates that allowlist again at dispatch.
  if version_definition ? 'emailSettings' then
    sender_from := lower(btrim(version_definition->'emailSettings'->>'senderEmail'));
    if version_definition->'emailSettings'->>'senderMode' = 'elena' then
      sender_name := 'Elena';
    else
      sender_actor := lower(btrim(version_definition->'emailSettings'->>'senderActorEmail'));
      select nullif(btrim(display_name),'') into sender_name
        from public.luxor_user_preferences where lower(email) = sender_actor limit 1;
      sender_name := coalesce(sender_name, initcap(regexp_replace(split_part(sender_actor,'@',1),'[._+-]+',' ','g')));
    end if;
  else
    sender_from := 'booking@luxoratlaspalmas.com';
    sender_name := 'Luxor Event Space';
  end if;

  insert into public.luxor_email_jobs(
    inquiry_id,job_type,status,recipient_email,subject,body,scheduled_for,metadata,custom_workflow_step_run_id
  ) values (
    inquiry.id,'custom_workflow','queued',inquiry.email,p_subject,p_body,run.scheduled_for,
    jsonb_build_object('automated',true,'custom_workflow',true,'compliance_scope','marketing',
      'preview_text',p_preview_text,'step_id',run.step_id,
      'sender_from',sender_from,'sender_name',sender_name,
      'generation_mode',coalesce(step->>'generationMode','manual'),
      'email_style',coalesce(step->>'emailStyle','personal')),run.id
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
$function$;


revoke all on function public.luxor_custom_workflow_definition_is_structural(jsonb) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_definition_is_runnable(jsonb) from public, anon, authenticated;
revoke all on function public.luxor_custom_workflow_enqueue_email_step(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.luxor_custom_workflow_definition_is_structural(jsonb) to service_role;
grant execute on function public.luxor_custom_workflow_definition_is_runnable(jsonb) to service_role;
grant execute on function public.luxor_custom_workflow_enqueue_email_step(uuid,text,text,text,text,text) to service_role;
