-- Accept the approved Luxor message-name variants while retaining every queue guard.
-- CREATE OR REPLACE preserves the existing function owner and ACL. The SECURITY DEFINER
-- attribute and empty search_path remain identical to the existing definition.
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
    or btrim(p_body) !~* '^(Luxor Event Space|Luxor Events|Luxor at Las Palmas Events|Luxor at Las Palmas)\M' or p_body !~* '\mSTOP\M'
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
