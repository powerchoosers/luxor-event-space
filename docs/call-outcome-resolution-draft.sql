-- SOURCE-ONLY CANDIDATE. NOT A MIGRATION. Never install without review and rollout approval.
-- Dependencies: current Luxor schema through aa22a5b; not the ordered/adoption drafts.
-- Required before release: full-schema PG role/concurrency tests and producer inventory.
-- Classification uses immutable version step semantics, not editable workflow names.
-- Mixed contact versions require proven completed acknowledgment prefix; unsupported definitions fail closed.
-- Dedicated restart below requires explicit workflow selection and marketing operator.
-- Remaining release gates: real-schema executable tests, two-session races, reviewed
-- deployment/migration packaging and review of the flagged enrollment integration.
do $$ begin raise exception 'CALL RESOLUTION DRAFT: INSTALLATION NOT AUTHORIZED'; end $$;

create table public.luxor_call_resolution_receipts (
 request_id uuid primary key, inquiry_id uuid not null references public.luxor_inquiries(id),
 task_id uuid unique, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.luxor_call_resolution_receipts enable row level security;
revoke all on public.luxor_call_resolution_receipts from public,anon,authenticated,service_role;
grant select on public.luxor_call_resolution_receipts to service_role;

-- A durable admission fence, not consent. It never restores withdrawn consent.
create table public.luxor_prospect_resolution_controls (
 inquiry_id uuid primary key references public.luxor_inquiries(id),
 mode text not null check(mode in ('stopped','manual','nurture')),
 allowed_workflow_id uuid, allowed_workflow_version_id uuid, allowed_task_id uuid, request_id uuid not null,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.luxor_prospect_resolution_controls enable row level security;
revoke all on public.luxor_prospect_resolution_controls from public,anon,authenticated,service_role;
grant select on public.luxor_prospect_resolution_controls to service_role;

-- Current validator evidence: email defaults to marketing, text requires marketing
-- consent; acknowledgment email is transactional. Do not infer manual-call purpose.
create function public.luxor_resolution_version_purpose(p_version_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare d jsonb; step jsonb; prospect boolean:=false; transactional boolean:=false; step_index integer:=-1;
begin
 select definition into d from public.luxor_custom_workflow_versions where id=p_version_id;
 if d is null or not public.luxor_custom_workflow_definition_is_structural(d)
   or d->>'trigger' not in ('contact_form_inquiry_created','manual') then return 'unknown'; end if;
 for step in select value from jsonb_array_elements(d->'steps') loop
  step_index:=step_index+1;
  if step->>'type'='email' then
   if step->>'mode'='existing_inquiry_acknowledgment' then
    if step_index<>0 or step->>'id'<>'inquiry-acknowledgment' then return 'unknown'; end if;
    transactional:=true;
   elsif coalesce(step->>'mode','marketing')='marketing' then prospect:=true;
   else return 'unknown'; end if;
  elsif step->>'type'='text' then
   if step->>'requiredConsentScope'='marketing' then prospect:=true; else return 'unknown'; end if;
  elsif step->>'type'='call_task' then
   -- Only contact-form calls have explicit prospect semantics in current schema.
   if d->>'trigger'='contact_form_inquiry_created' then prospect:=true; else return 'unknown'; end if;
  elsif step->>'type' not in ('wait','condition','end') then return 'unknown'; end if;
 end loop;
 if prospect and transactional then return 'mixed'; end if;
 if prospect and not transactional then return 'prospect'; end if;
 if transactional and not prospect then return 'transactional'; end if;
 return 'unknown';
end $$;
create function public.luxor_resolution_enrollment_purpose(p_enrollment_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select public.luxor_resolution_version_purpose(workflow_version_id)
 from public.luxor_custom_workflow_enrollments where id=p_enrollment_id),'unknown')
$$;
create function public.luxor_resolution_run_purpose(p_run_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare r public.luxor_custom_workflow_step_runs%rowtype; d jsonb; step jsonb; purpose text;
begin
 select * into r from public.luxor_custom_workflow_step_runs where id=p_run_id;
 if not found then return 'unknown'; end if;
 select v.definition into d from public.luxor_custom_workflow_versions v
  join public.luxor_custom_workflow_enrollments e on e.workflow_version_id=v.id and e.workflow_id=v.workflow_id
  where e.id=r.enrollment_id and r.workflow_version_id=v.id;
 step:=d->'steps'->r.step_order;
 if step is null or step->>'id' is distinct from r.step_id then return 'unknown'; end if;
 purpose:=public.luxor_resolution_version_purpose(r.workflow_version_id);
 if purpose in ('prospect','mixed') then
  if step->>'type'='email' and step->>'mode'='existing_inquiry_acknowledgment' then return 'transactional'; end if;
  return 'prospect';
 end if;
 return purpose;
end $$;

-- A completed marker alone is not receipt evidence. This helper locks and proves
-- the exact immutable prefix plus its original transactional job, or the existing
-- explicit-manual-source skip convention. It never sends/reconciles/cancels receipt.
create function public.luxor_resolution_assert_ack_prefix(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.luxor_custom_workflow_enrollments%rowtype;
 r public.luxor_custom_workflow_step_runs%rowtype; j public.luxor_email_jobs%rowtype;
 source public.luxor_custom_workflow_source_events%rowtype; recipient text;
begin
 select * into e from public.luxor_custom_workflow_enrollments where id=p_enrollment_id for update nowait;
 if not found or public.luxor_resolution_version_purpose(e.workflow_version_id)<>'mixed' then
  raise exception 'Mixed workflow identity needs review' using errcode='40001'; end if;
 select email into recipient from public.luxor_inquiries where id=e.inquiry_id;
 if (select count(*) from public.luxor_custom_workflow_step_runs where enrollment_id=e.id
  and step_id='inquiry-acknowledgment')<>1 then
  raise exception 'Acknowledgment prefix is missing or ambiguous; no changes saved' using errcode='40001'; end if;
 select * into r from public.luxor_custom_workflow_step_runs where enrollment_id=e.id
  and step_id='inquiry-acknowledgment' for update nowait;
 if r.workflow_version_id<>e.workflow_version_id or r.step_order<>0 or r.channel<>'email'
   or r.status<>'completed' or r.completed_at is null or r.last_error is not null then
  raise exception 'Acknowledgment prefix has not completed safely; no changes saved' using errcode='40001'; end if;
 select * into source from public.luxor_custom_workflow_source_events where id=e.source_event_id for update nowait;
 if not found or source.inquiry_id is distinct from e.inquiry_id or source.status<>'consumed' or source.processed_at is null then
  raise exception 'Acknowledgment source event needs review; no changes saved' using errcode='40001'; end if;
 if r.snapshot->>'manual_acknowledgment_marker_skipped'='true' then
  if source.trigger_type<>'manual' or source.inquiry_id<>e.inquiry_id
   or source.event_key<>'manual:'||e.workflow_id::text||':'||e.workflow_version_id::text||':'||e.inquiry_id::text
   or source.payload->>'workflow_id' is distinct from e.workflow_id::text
   or source.payload->>'version_id' is distinct from e.workflow_version_id::text then
   raise exception 'Manual acknowledgment skip could not be verified; no changes saved' using errcode='40001'; end if;
 else
  if source.trigger_type<>'contact_form_inquiry_created'
   or source.event_key<>'contact_form_inquiry_created:'||e.inquiry_id::text
   or source.payload->>'flow' is distinct from 'contact_form' then
   raise exception 'Original acknowledgment source event needs review; no changes saved' using errcode='40001'; end if;
  if r.snapshot->>'existing_acknowledgment' is distinct from 'true'
   or coalesce(r.snapshot->>'email_job_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   raise exception 'Original acknowledgment linkage needs review; no changes saved' using errcode='40001'; end if;
  select * into j from public.luxor_email_jobs where id=(r.snapshot->>'email_job_id')::uuid for update nowait;
  if not found or j.inquiry_id is distinct from e.inquiry_id or j.job_type<>'marketing_campaign'
   or j.metadata->>'source' is distinct from 'inquiry_acknowledgment'
   or j.automation_enrollment_id is not null or j.custom_workflow_step_run_id is not null
   or recipient is null or lower(btrim(j.recipient_email)) is distinct from lower(btrim(recipient)) then
   raise exception 'Original acknowledgment is unconfirmed or recipient changed; no changes saved' using errcode='40001'; end if;
 end if;
 -- Original receipt delivery is independent of the enrollment. Its status/error
 -- is not changed or claimed stopped, even if queued/sending/provider-ambiguous.
 -- A custom-owned acknowledgment would require different dispatch semantics.
 perform 1 from public.luxor_email_jobs where custom_workflow_step_run_id=r.id order by id for update nowait;
 perform 1 from public.luxor_text_jobs where custom_workflow_step_run_id=r.id order by id for update nowait;
 if exists(select 1 from public.luxor_email_jobs where custom_workflow_step_run_id=r.id)
   or exists(select 1 from public.luxor_text_jobs where custom_workflow_step_run_id=r.id) then
  raise exception 'Owned acknowledgment message needs review; no changes saved' using errcode='40001'; end if;
end $$;
revoke all on function public.luxor_resolution_assert_ack_prefix(uuid) from public,anon,authenticated,service_role;
revoke all on function public.luxor_resolution_version_purpose(uuid),public.luxor_resolution_enrollment_purpose(uuid),public.luxor_resolution_run_purpose(uuid) from public,anon,authenticated,service_role;

-- Every prospect INSERT/reopening must share the inquiry lock. No table/global lock.
-- NOWAIT is deliberate: existing workers may hold enrollment/job locks first.
-- A contention error rolls their entire statement back; it must never trigger sends.
create function public.luxor_call_resolution_admit_writer() returns trigger
language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); oldj jsonb; iid uuid; wid uuid; vid uuid; eid uuid;
 purpose text; ctl public.luxor_prospect_resolution_controls%rowtype; relevant boolean:=false;
begin
 if tg_op='UPDATE' then oldj:=to_jsonb(old); end if;
 if tg_table_name='luxor_tasks' then
  relevant:=j->>'status'='pending' and (j->>'automation_enrollment_id' is not null or j->>'description' ilike '[follow-up:%');
 elsif tg_table_name='luxor_email_jobs' then
  relevant:=j->>'status' in ('queued','sending') and (j->>'automation_enrollment_id' is not null or j->>'job_type'='custom_workflow');
 elsif tg_table_name='luxor_text_jobs' then
  relevant:=j->>'status' in ('queued','sending') and j->>'job_type'='custom_workflow';
 elsif tg_table_name='luxor_follow_up_actions' then
  relevant:=j->>'status' in ('scheduled','processing','email_queued','task_created');
 elsif tg_table_name='luxor_custom_workflow_step_runs' then
  relevant:=j->>'status' in ('scheduled','queued','sending');
 else relevant:=j->>'status' in ('active','paused','held'); end if;
 if not relevant then return new; end if;
 iid:=nullif(j->>'inquiry_id','')::uuid;
 if tg_table_name='luxor_follow_up_actions' then
  select inquiry_id into iid from public.luxor_follow_up_enrollments where id=(j->>'enrollment_id')::uuid;
 end if;
 if tg_table_name='luxor_custom_workflow_step_runs' then eid:=(j->>'enrollment_id')::uuid;
 elsif j->>'custom_workflow_step_run_id' is not null then
  select enrollment_id into eid from public.luxor_custom_workflow_step_runs where id=(j->>'custom_workflow_step_run_id')::uuid;
 end if;
 if eid is not null then
  select inquiry_id,workflow_id,workflow_version_id into iid,wid,vid from public.luxor_custom_workflow_enrollments where id=eid;
 elsif tg_table_name='luxor_custom_workflow_enrollments' then
  wid:=(j->>'workflow_id')::uuid; vid:=(j->>'workflow_version_id')::uuid;
 end if;
 if wid is not null then
  if tg_table_name='luxor_custom_workflow_enrollments' then
   purpose:=public.luxor_resolution_version_purpose((j->>'workflow_version_id')::uuid);
  else purpose:=public.luxor_resolution_enrollment_purpose(eid); end if;
  if purpose='transactional' then return new; end if;
 end if;
 if iid is null then raise exception 'Prospect writer has no verified lead' using errcode='40001'; end if;
 perform 1 from public.luxor_inquiries where id=iid for update nowait;
 select * into ctl from public.luxor_prospect_resolution_controls where inquiry_id=iid;
 if found then
  if wid is not null and purpose not in ('prospect','mixed') then
   raise exception 'Custom workflow purpose needs review; no changes saved' using errcode='40001'; end if;
  -- Only the explicitly selected nurture workflow can progress under its fence.
  if ctl.mode='nurture' and wid=ctl.allowed_workflow_id and vid=ctl.allowed_workflow_version_id then return new; end if;
  -- Exact durable task identity allows ordinary pending-reminder edits, not
  -- unrelated inserts, ownership changes, or reopening completed reminders.
  if tg_table_name='luxor_tasks' and ctl.mode='manual'
    and (j->>'id')::uuid=ctl.allowed_task_id
    and j->>'automation_enrollment_id' is null
    and (tg_op='INSERT' or (oldj->>'status'='pending'
      and oldj->>'inquiry_id'=j->>'inquiry_id'
      and oldj->>'automation_enrollment_id' is null)) then return new; end if;
  raise exception 'Follow-up is stopped or replaced; review the saved call resolution before restarting' using errcode='40001';
 end if;
 return new;
end $$;
revoke all on function public.luxor_call_resolution_admit_writer() from public,anon,authenticated,service_role;
create trigger luxor_resolution_admission before insert or update on public.luxor_follow_up_enrollments for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_follow_up_actions for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_custom_workflow_enrollments for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_custom_workflow_step_runs for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_tasks for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_email_jobs for each row execute function public.luxor_call_resolution_admit_writer();
create trigger luxor_resolution_admission before insert or update on public.luxor_text_jobs for each row execute function public.luxor_call_resolution_admit_writer();

create function public.luxor_resolve_call_outcome(
 p_request_id uuid,p_inquiry_id uuid,p_task_id uuid,p_outcome text,p_next_step text,p_note text,
 p_due_at timestamptz,p_channel text,p_nurture_workflow_id uuid,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare lead public.luxor_inquiries%rowtype; task public.luxor_tasks%rowtype;
 prior public.luxor_call_resolution_receipts%rowtype; input jsonb; result jsonb;
 note_id uuid; next_task_id uuid; nurture_id uuid; custom_owner uuid; system_owner uuid;
 definition jsonb; enrolled record; replace_followups boolean; v_outcome text;
begin
 if p_request_id is null or p_inquiry_id is null or p_note is null or length(p_note)>500
  or p_outcome is null or p_outcome not in ('no_answer','voicemail_left','interested','wants_tour','needs_time','not_interested')
  or p_next_step is null or p_next_step not in ('none','tour','proposal','later','thank_you','nurture','stop')
  or p_actor is null then raise exception 'Invalid call resolution' using errcode='22023'; end if;
 if p_outcome='not_interested' and p_next_step not in ('none','stop') then
  raise exception 'A declined lead cannot receive a new follow-up' using errcode='22023'; end if;
 if p_next_step='later' and (p_due_at is null or not isfinite(p_due_at) or p_channel is null or p_channel not in ('phone','email')) then
  raise exception 'Choose a valid follow-up time and channel' using errcode='22023'; end if;
 if p_next_step<>'later' and (p_due_at is not null or p_channel is not null) then raise exception 'Unexpected scheduling inputs' using errcode='22023'; end if;
 if (p_next_step='nurture') is distinct from (p_nurture_workflow_id is not null) then raise exception 'Choose the explicit nurture workflow' using errcode='22023'; end if;
 perform 1 from public.luxor_portal_members where lower(email)=lower(btrim(p_actor)) and status='active' for share nowait;
 if not found then raise exception 'Active staff required' using errcode='42501'; end if;
 input:=jsonb_build_object('inquiryId',p_inquiry_id,'taskId',p_task_id,'outcome',p_outcome,'nextStep',p_next_step,
  'note',p_note,'dueAt',p_due_at,'channel',p_channel,'nurtureWorkflowId',p_nurture_workflow_id,'actor',lower(btrim(p_actor)));
 select * into lead from public.luxor_inquiries where id=p_inquiry_id for update nowait;
 if not found then raise exception 'Lead unavailable' using errcode='22023'; end if;
 select * into prior from public.luxor_call_resolution_receipts where request_id=p_request_id;
 if found then
  if prior.payload<>input then raise exception 'Request ID reused with different input' using errcode='22023'; end if;
  return prior.result;
 end if;
 if p_next_step='later' and p_due_at<=clock_timestamp() then
  raise exception 'Choose a future follow-up time' using errcode='22023'; end if;
 if lead.archived_at is not null then raise exception 'Archived lead requires review' using errcode='40001'; end if;
 if p_task_id is not null then
  select * into task from public.luxor_tasks where id=p_task_id and inquiry_id=p_inquiry_id for update nowait;
  if not found or task.status<>'pending' or task.completed_at is not null then raise exception 'Task changed; refresh before retrying' using errcode='40001'; end if;
  system_owner:=task.automation_enrollment_id;
  if (select count(*) from public.luxor_custom_workflow_step_runs r join public.luxor_custom_workflow_enrollments e on e.id=r.enrollment_id
     where r.snapshot->>'task_id'=p_task_id::text and e.inquiry_id=p_inquiry_id)>1 then raise exception 'Ambiguous task ownership' using errcode='40001'; end if;
  select r.enrollment_id into custom_owner from public.luxor_custom_workflow_step_runs r join public.luxor_custom_workflow_enrollments e on e.id=r.enrollment_id
   where r.snapshot->>'task_id'=p_task_id::text and e.inquiry_id=p_inquiry_id;
  if custom_owner is not null and system_owner is not null then raise exception 'Conflicting task ownership' using errcode='40001'; end if;
  if system_owner is not null and not exists(select 1 from public.luxor_follow_up_actions where enrollment_id=system_owner and task_id=p_task_id and step_key=task.automation_step_key)
   then raise exception 'Task action linkage changed' using errcode='40001'; end if;
 end if;
 replace_followups:=p_next_step in ('later','nurture','stop') or p_outcome='not_interested';
 -- Unknown/mixed custom work cannot be silently cancelled or omitted from success.
 if replace_followups and (
  exists(select 1 from public.luxor_custom_workflow_enrollments e where e.inquiry_id=p_inquiry_id
    and public.luxor_resolution_version_purpose(e.workflow_version_id)='unknown'
    and (e.status in ('active','paused','held') or exists(select 1 from public.luxor_custom_workflow_step_runs r
      where r.enrollment_id=e.id and (r.status in ('scheduled','queued','sending','failed','held') or r.last_error like 'provider_outcome_unknown:%'))))
  or exists(select 1 from public.luxor_email_jobs where inquiry_id=p_inquiry_id and job_type='custom_workflow'
    and status in ('queued','sending','failed') and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='unknown')
  or exists(select 1 from public.luxor_text_jobs where inquiry_id=p_inquiry_id and job_type='custom_workflow'
    and status in ('queued','sending','failed') and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='unknown')
 ) then raise exception 'Custom workflow purpose needs review; no changes saved' using errcode='40001'; end if;
 -- Claim all affected rows NOWAIT before any write or helper that could wait.
 perform 1 from public.luxor_follow_up_enrollments where inquiry_id=p_inquiry_id order by id for update nowait;
 perform 1 from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed') order by id for update nowait;
 perform 1 from public.luxor_custom_workflows where id in(select workflow_id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed'))
  or id=p_nurture_workflow_id order by id for update nowait;
 perform 1 from public.luxor_custom_workflow_step_runs where enrollment_id in(select id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed')) order by id for update nowait;
 perform 1 from public.luxor_follow_up_actions where enrollment_id in(select id from public.luxor_follow_up_enrollments where inquiry_id=p_inquiry_id) order by id for update nowait;
 perform 1 from public.luxor_tasks where inquiry_id=p_inquiry_id order by id for update nowait;
 perform 1 from public.luxor_email_jobs where inquiry_id=p_inquiry_id and (automation_enrollment_id is not null or (job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect')) order by id for update nowait;
 perform 1 from public.luxor_text_jobs where inquiry_id=p_inquiry_id and job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect' order by id for update nowait;
 replace_followups:=p_next_step in ('later','nurture','stop') or p_outcome='not_interested';
 if replace_followups then
  perform public.luxor_resolution_assert_ack_prefix(id) from public.luxor_custom_workflow_enrollments
   where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id)='mixed'
   and (status in ('active','paused','held') or exists(select 1 from public.luxor_custom_workflow_step_runs r
    where r.enrollment_id=luxor_custom_workflow_enrollments.id and r.status in ('scheduled','queued','sending','failed','held')))
   order by id;
 end if;
 if replace_followups and (
  exists(select 1 from public.luxor_email_jobs where inquiry_id=p_inquiry_id and (automation_enrollment_id is not null or (job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect')) and status='sending')
  or exists(select 1 from public.luxor_text_jobs where inquiry_id=p_inquiry_id and job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect' and status='sending')
  or exists(select 1 from public.luxor_custom_workflow_step_runs where enrollment_id in(select id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed')) and (status='sending' or last_error like 'provider_outcome_unknown:%'))
 ) then raise exception 'A message is in flight or its outcome is unknown; review before stopping' using errcode='40001'; end if;
 if p_next_step in ('later','nurture') and (lead.status='closed_lost' or exists(select 1 from public.luxor_bookings where inquiry_id=p_inquiry_id and contract_status='signed' and status in ('confirmed','completed'))) then
  raise exception 'Lead no longer eligible for prospect follow-up' using errcode='40001'; end if;
 if p_next_step='nurture' then
  select v.definition into definition from public.luxor_custom_workflows w join public.luxor_custom_workflow_versions v on v.id=w.current_version_id and v.workflow_id=w.id
   where w.id=p_nurture_workflow_id and w.status='active';
  if definition is null or public.luxor_resolution_version_purpose((select current_version_id from public.luxor_custom_workflows where id=p_nurture_workflow_id))<>'prospect' or definition->>'trigger'<>'manual' or not public.luxor_custom_workflow_definition_is_runnable(definition)
   then raise exception 'Selected nurture workflow or consent needs review' using errcode='40001'; end if;
 -- Check every channel actually present; never turn a call result into consent.
 if exists(select 1 from jsonb_array_elements(definition->'steps') s where s->>'type'='email')
   and (lead.email is null or lead.marketing_opt_in is distinct from true or exists(select 1 from public.luxor_marketing_suppressions where lower(email)=lower(lead.email))) then
  raise exception 'Email consent required' using errcode='40001'; end if;
 if exists(select 1 from jsonb_array_elements(definition->'steps') s where s->>'type'='text')
   and (lead.phone is null or not exists(select 1 from public.luxor_sms_consents c
    where c.phone_number=public.luxor_workflow_normalize_phone(lead.phone)
     and c.status='opted_in' and c.consent_scopes @> array['marketing']::text[])) then
  raise exception 'SMS marketing consent required' using errcode='40001'; end if;
 end if;
 if replace_followups then
  -- Stop before completing the task; never invoke a successor accidentally.
  update public.luxor_follow_up_enrollments set status='stopped',ended_reason='manual_stop',updated_at=now() where inquiry_id=p_inquiry_id and status in ('active','paused');
  update public.luxor_custom_workflow_enrollments set status='stopped',stopped_at=now(),next_run_at=null,stop_reason='staff_stop',updated_at=now() where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed') and status in ('active','paused','held');
  update public.luxor_custom_workflow_step_runs set status='cancelled',updated_at=now() where public.luxor_resolution_run_purpose(id)='prospect' and enrollment_id in(select id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed')) and status in ('scheduled','queued','failed','held');
  update public.luxor_email_jobs set status='cancelled',last_error='Replaced by staff call resolution',updated_at=now() where inquiry_id=p_inquiry_id and (automation_enrollment_id is not null or (job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect')) and status in ('queued','failed');
  update public.luxor_text_jobs set status='cancelled',last_error='Replaced by staff call resolution',updated_at=now() where inquiry_id=p_inquiry_id and job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)='prospect' and status in ('queued','failed');
  update public.luxor_follow_up_actions set status='cancelled',updated_at=now() where enrollment_id in(select id from public.luxor_follow_up_enrollments where inquiry_id=p_inquiry_id) and status in ('scheduled','email_queued','task_created','processing');
  update public.luxor_tasks set status='cancelled' where inquiry_id=p_inquiry_id and status='pending' and id is distinct from p_task_id and
   (automation_enrollment_id is not null or description ilike '[follow-up:%' or id in(select (snapshot->>'task_id')::uuid from public.luxor_custom_workflow_step_runs where enrollment_id in(select id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed')) and snapshot->>'task_id' is not null));
  if p_next_step='later' then next_task_id:=gen_random_uuid(); end if;
  insert into public.luxor_prospect_resolution_controls(inquiry_id,mode,allowed_workflow_id,allowed_workflow_version_id,allowed_task_id,request_id)
   values(p_inquiry_id,case p_next_step when 'later' then 'manual' when 'nurture' then 'nurture' else 'stopped' end,p_nurture_workflow_id,(select current_version_id from public.luxor_custom_workflows where id=p_nurture_workflow_id),next_task_id,p_request_id)
   on conflict(inquiry_id) do update set mode=excluded.mode,allowed_workflow_id=excluded.allowed_workflow_id,allowed_workflow_version_id=excluded.allowed_workflow_version_id,allowed_task_id=excluded.allowed_task_id,request_id=excluded.request_id,updated_at=now();
 end if;
 v_outcome:=case when p_outcome in ('no_answer','voicemail_left') then p_outcome else 'reached' end;
 if p_outcome='not_interested' then
  update public.luxor_inquiries set follow_up_disposition='not_interested',follow_up_disposition_reason='Manual call outcome',follow_up_disposition_updated_at=now() where id=p_inquiry_id;
 elsif system_owner is not null and v_outcome='reached' and not replace_followups then
  update public.luxor_follow_up_enrollments set response_received_at=coalesce(response_received_at,now()),updated_at=now() where id=system_owner;
 end if;
 if p_task_id is not null then
  update public.luxor_tasks set status='completed',completed_at=now(),call_outcome=v_outcome,post_tour_reopen_cancelled=false,post_tour_user_modified=true where id=p_task_id;
  if system_owner is not null then update public.luxor_follow_up_actions set status='completed',completed_at=now(),outcome=v_outcome,updated_at=now() where task_id=p_task_id and enrollment_id=system_owner; end if;
 end if;
 if p_next_step='later' then
  insert into public.luxor_tasks(id,inquiry_id,title,description,due_at,due_date,priority,status,assigned_to,task_type)
   values(next_task_id,p_inquiry_id,'Follow up after call','[follow-up:'||p_channel||'] Scheduled after call',p_due_at,(p_due_at at time zone 'America/Chicago')::date,'medium','pending',lower(btrim(p_actor)),case p_channel when 'phone' then 'call' else 'email' end) returning id into next_task_id;
 elsif p_next_step='nurture' then
  select * into enrolled from public.luxor_custom_workflow_manual_enroll(p_nurture_workflow_id,array[p_inquiry_id],lower(btrim(p_actor)));
  if enrolled.enrolled_count<>1 then raise exception 'Nurture enrollment was not created; review existing history' using errcode='40001'; end if;
  select id into strict nurture_id from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(workflow_version_id) in ('prospect','mixed') and workflow_id=p_nurture_workflow_id and status='active';
  update public.luxor_inquiries set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{followUpStage}','"nurture"'::jsonb,true) where id=p_inquiry_id;
 end if;
 insert into public.luxor_notes(inquiry_id,content,note_type,author,task_id) values(p_inquiry_id,'Manual call outcome: '||replace(p_outcome,'_',' ')||'. '||p_note,'status_change',lower(btrim(p_actor)),p_task_id) returning id into note_id;
 result:=jsonb_build_object('status','completed','requestId',p_request_id,'inquiryId',p_inquiry_id,'taskId',p_task_id,'noteId',note_id,'nextStep',p_next_step,'nextTaskId',next_task_id,
  'handoff',case when p_next_step in ('tour','proposal','thank_you') then p_next_step else null end,
  'workflowStatus',case when p_next_step='later' then 'manual_follow_up' when p_next_step='nurture' then 'nurture_enrolled' when replace_followups then 'stopped' else 'unchanged' end,'nurtureEnrollmentId',nurture_id);
 insert into public.luxor_call_resolution_receipts(request_id,inquiry_id,task_id,payload,result) values(p_request_id,p_inquiry_id,p_task_id,input,result);
 return result;
exception when lock_not_available then raise exception 'Workflow busy; no changes saved. Refresh and retry.' using errcode='40001';
end $$;
revoke all on function public.luxor_resolve_call_outcome(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_resolve_call_outcome(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,text) to service_role;


-- EXPLICIT staff action only. Never invoke this for nextStep=none or from cron.
-- Preserves the current one-run-per-lead/version invariant: staff must choose a
-- never-enrolled version. A new event/run cannot reuse old provider idempotency keys.
-- Integration: the existing explicit manual-enroll route must offer this operation
-- only for fenced leads with confirmed workflow selection; never auto-clear fences.
-- Flagged enrollment route/UI integration uses the atomic batch wrapper below.
create function public.luxor_restart_prospect_workflow(
 p_request_id uuid,p_inquiry_id uuid,p_workflow_id uuid,p_actor text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare lead public.luxor_inquiries%rowtype; ctl public.luxor_prospect_resolution_controls%rowtype;
 workflow public.luxor_custom_workflows%rowtype; prior public.luxor_call_resolution_receipts%rowtype;
 definition jsonb; first_step jsonb; input jsonb; result jsonb; source_id uuid;
 enrollment_id uuid; run_id uuid; start_at timestamptz:=now();
begin
 if p_request_id is null or p_inquiry_id is null or p_workflow_id is null or p_actor is null then
  raise exception 'Explicit restart request and workflow required' using errcode='22023'; end if;
 perform 1 from public.luxor_portal_members where lower(email)=lower(btrim(p_actor)) and status='active'
  and (role='owner' or permissions ? 'marketing') for share nowait;
 if not found then raise exception 'Marketing operator access is required' using errcode='42501'; end if;
 select * into lead from public.luxor_inquiries where id=p_inquiry_id for update nowait;
 if not found then raise exception 'Lead unavailable' using errcode='22023'; end if;
 input:=jsonb_build_object('operation','explicit_prospect_restart','inquiryId',p_inquiry_id,
  'workflowId',p_workflow_id,'actor',lower(btrim(p_actor)));
 select * into prior from public.luxor_call_resolution_receipts where request_id=p_request_id;
 if found then
  if prior.payload<>input then raise exception 'Request ID reused with different input' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into ctl from public.luxor_prospect_resolution_controls where inquiry_id=p_inquiry_id for update nowait;
 if not found or ctl.mode not in ('stopped','manual') then
  raise exception 'No stopped or manual follow-up to restart; review current workflow' using errcode='40001'; end if;
 if not public.luxor_custom_workflow_runtime_enabled() or not public.luxor_custom_workflow_authoring_enabled() then
  raise exception 'Workflow execution is disabled' using errcode='55000'; end if;
 if lead.archived_at is not null or coalesce(lead.is_test,false)
   or lower(coalesce(lead.metadata->>'is_test_record','false'))='true'
   or lead.status='closed_lost' or coalesce(lead.follow_up_disposition,'no_response')<>'no_response'
   or exists(select 1 from public.luxor_bookings where inquiry_id=p_inquiry_id and contract_status='signed' and status in ('confirmed','completed')) then
  raise exception 'Lead is not eligible; restart does not restore consent or override a decline' using errcode='40001'; end if;
 select * into workflow from public.luxor_custom_workflows where id=p_workflow_id for update nowait;
 if not found or workflow.status<>'active' then raise exception 'Select an active manual workflow' using errcode='40001'; end if;
 select v.definition into definition from public.luxor_custom_workflow_versions v where v.id=workflow.current_version_id and v.workflow_id=workflow.id;
 if definition is null or definition->>'trigger'<>'manual'
   or public.luxor_resolution_version_purpose(workflow.current_version_id)<>'prospect'
   or not public.luxor_custom_workflow_definition_is_runnable(definition) then
  raise exception 'Select a verified prospect manual workflow' using errcode='40001'; end if;
 if exists(select 1 from public.luxor_custom_workflow_enrollments e where e.workflow_id=workflow.id
  and e.workflow_version_id=workflow.current_version_id and e.inquiry_id=p_inquiry_id) then
  raise exception 'This version already ran for this lead; select a new approved version' using errcode='40001'; end if;
 -- Check every channel actually present; never turn a call result into consent.
 if exists(select 1 from jsonb_array_elements(definition->'steps') s where s->>'type'='email')
   and (lead.email is null or lead.marketing_opt_in is distinct from true or exists(select 1 from public.luxor_marketing_suppressions where lower(email)=lower(lead.email))) then
  raise exception 'Email consent required' using errcode='40001'; end if;
 if exists(select 1 from jsonb_array_elements(definition->'steps') s where s->>'type'='text')
   and (lead.phone is null or not exists(select 1 from public.luxor_sms_consents c
    where c.phone_number=public.luxor_workflow_normalize_phone(lead.phone)
     and c.status='opted_in' and c.consent_scopes @> array['marketing']::text[])) then
  raise exception 'SMS marketing consent required' using errcode='40001'; end if;
 -- Fence admission already prevents new prospect work, but fail closed on old or
 -- ambiguous surviving work rather than issuing a second enrollment.
 if exists(select 1 from public.luxor_follow_up_enrollments where inquiry_id=p_inquiry_id and status in ('active','paused'))
  or exists(select 1 from public.luxor_custom_workflow_enrollments where inquiry_id=p_inquiry_id and status in ('active','paused','held') and public.luxor_resolution_version_purpose(workflow_version_id)<>'transactional')
  or exists(select 1 from public.luxor_custom_workflow_step_runs r join public.luxor_custom_workflow_enrollments e on e.id=r.enrollment_id where e.inquiry_id=p_inquiry_id and public.luxor_resolution_version_purpose(e.workflow_version_id)<>'transactional' and (r.status in ('scheduled','queued','sending','failed','held') or r.last_error like 'provider_outcome_unknown:%'))
  or exists(select 1 from public.luxor_email_jobs where inquiry_id=p_inquiry_id and status in ('queued','sending','failed') and (automation_enrollment_id is not null or (job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)<>'transactional')))
  or exists(select 1 from public.luxor_text_jobs where inquiry_id=p_inquiry_id and status in ('queued','sending','failed') and job_type='custom_workflow' and public.luxor_resolution_run_purpose(custom_workflow_step_run_id)<>'transactional') then
  raise exception 'Existing follow-up needs review before restart' using errcode='40001'; end if;
 if ctl.allowed_task_id is not null then
  perform 1 from public.luxor_tasks where id=ctl.allowed_task_id and inquiry_id=p_inquiry_id for update nowait;
  update public.luxor_tasks set status='cancelled' where id=ctl.allowed_task_id and inquiry_id=p_inquiry_id and status='pending';
 end if;
 update public.luxor_prospect_resolution_controls set mode='nurture',allowed_workflow_id=p_workflow_id,allowed_workflow_version_id=workflow.current_version_id,
  allowed_task_id=null,request_id=p_request_id,updated_at=now() where inquiry_id=p_inquiry_id;
 insert into public.luxor_custom_workflow_source_events(event_key,trigger_type,inquiry_id,payload,status,processed_at)
 values('staff_restart:'||p_request_id::text,'manual',p_inquiry_id,jsonb_build_object('workflow_id',workflow.id,'version_id',workflow.current_version_id,'actor_email',lower(btrim(p_actor))),'consumed',now()) returning id into source_id;
 first_step:=definition->'steps'->0;
 if first_step->>'type'='wait' then start_at:=now()+case first_step->>'unit'
  when 'minutes' then make_interval(mins=>(first_step->>'amount')::integer)
  when 'hours' then make_interval(hours=>(first_step->>'amount')::integer)
  when 'days' then make_interval(days=>(first_step->>'amount')::integer) end; end if;
 insert into public.luxor_custom_workflow_enrollments(workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at)
 values(workflow.id,workflow.current_version_id,source_id,p_inquiry_id,'active',first_step->>'id',start_at) returning id into enrollment_id;
 insert into public.luxor_custom_workflow_step_runs(enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,snapshot)
 values(enrollment_id,workflow.current_version_id,first_step->>'id',0,first_step->>'type','scheduled',enrollment_id::text||':'||(first_step->>'id'),start_at,first_step) returning id into run_id;
 insert into public.luxor_custom_workflow_activity(workflow_id,enrollment_id,step_run_id,event_type,actor_email,details)
 values(workflow.id,enrollment_id,run_id,'manual_enrollment_created',lower(btrim(p_actor)),jsonb_build_object('restart_request_id',p_request_id,'previous_resolution_request_id',ctl.request_id));
 result:=jsonb_build_object('status','completed','operation','explicit_prospect_restart','requestId',p_request_id,'inquiryId',p_inquiry_id,'enrollmentId',enrollment_id);
 insert into public.luxor_call_resolution_receipts(request_id,inquiry_id,payload,result) values(p_request_id,p_inquiry_id,input,result);
 return result;
exception when lock_not_available then raise exception 'Workflow busy; no changes saved. Refresh and retry.' using errcode='40001';
end $$;
revoke all on function public.luxor_restart_prospect_workflow(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_restart_prospect_workflow(uuid,uuid,uuid,text) to service_role;

-- Atomic integration seam for the existing explicit Enroll in Workflow action.
-- Route must pass one stable request UUID across retries of the same batch.
create function public.luxor_enroll_workflow_with_resolution(
 p_request_id uuid,p_workflow_id uuid,p_inquiry_ids uuid[],p_actor_email text,p_allow_new boolean default true
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]; iid uuid; input jsonb; result jsonb; prior public.luxor_call_resolution_receipts%rowtype;
 one_result record; restart_result jsonb; enrolled_count integer:=0; already_count integer:=0;
begin
 if p_request_id is null or p_workflow_id is null or p_actor_email is null
   or coalesce(cardinality(p_inquiry_ids),0) not between 1 and 100
   or array_position(p_inquiry_ids,null) is not null then
  raise exception 'Select between 1 and 100 valid leads and a request ID' using errcode='22023'; end if;
 select array_agg(x order by x) into ids from (select distinct unnest(p_inquiry_ids) x) deduplicated;
 perform 1 from public.luxor_portal_members where lower(email)=lower(btrim(p_actor_email)) and status='active'
  and (role='owner' or permissions ? 'marketing') for share nowait;
 if not found then raise exception 'Marketing operator access is required' using errcode='42501'; end if;
 -- Same ordered inquiry admission as resolution; never hold workflow then wait on lead.
 perform 1 from public.luxor_inquiries where id=any(ids) order by id for update nowait;
 if (select count(*) from public.luxor_inquiries where id=any(ids))<>cardinality(ids) then
  raise exception 'A selected lead is unavailable' using errcode='22023'; end if;
 input:=jsonb_build_object('operation','explicit_workflow_enroll_batch','workflowId',p_workflow_id,
  'inquiryIds',to_jsonb(ids),'actor',lower(btrim(p_actor_email)));
 select * into prior from public.luxor_call_resolution_receipts where request_id=p_request_id;
 if found then
  if prior.payload<>input then raise exception 'Request ID reused with different input' using errcode='22023'; end if;
  return prior.result;
 end if;
 if p_allow_new is distinct from true then raise exception 'Workflow execution is disabled; no new enrollments saved' using errcode='55000'; end if;
 perform 1 from public.luxor_custom_workflows where id=p_workflow_id for update nowait;
 if not found then raise exception 'Select a saved workflow' using errcode='22023'; end if;
 foreach iid in array ids loop
  if exists(select 1 from public.luxor_prospect_resolution_controls where inquiry_id=iid) then
   restart_result:=public.luxor_restart_prospect_workflow(
    md5('luxor-explicit-restart:'||p_request_id::text||':'||iid::text)::uuid,iid,p_workflow_id,p_actor_email);
   if restart_result->>'status' is distinct from 'completed' then
    raise exception 'Restart could not be verified' using errcode='40001'; end if;
   enrolled_count:=enrolled_count+1;
  else
   select * into one_result from public.luxor_custom_workflow_manual_enroll(p_workflow_id,array[iid],p_actor_email);
   if one_result is null or one_result.skipped_count<>0
     or one_result.enrolled_count+one_result.already_enrolled_count<>1 then
    raise exception 'A selected lead is ineligible; no workflow enrollments saved' using errcode='40001'; end if;
   enrolled_count:=enrolled_count+one_result.enrolled_count;
   already_count:=already_count+one_result.already_enrolled_count;
  end if;
 end loop;
 result:=jsonb_build_object('status','completed','requestId',p_request_id,'enrolled_count',enrolled_count,
  'already_enrolled_count',already_count,'skipped_count',0);
 insert into public.luxor_call_resolution_receipts(request_id,inquiry_id,payload,result)
 values(p_request_id,ids[1],input,result);
 return result;
exception when lock_not_available then raise exception 'Workflow busy; no changes saved. Refresh and retry.' using errcode='40001';
end $$;
revoke all on function public.luxor_enroll_workflow_with_resolution(uuid,uuid,uuid[],text,boolean) from public,anon,authenticated;
grant execute on function public.luxor_enroll_workflow_with_resolution(uuid,uuid,uuid[],text,boolean) to service_role;
