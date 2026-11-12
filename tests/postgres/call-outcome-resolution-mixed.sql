\set ON_ERROR_STOP on
-- Run through mixed-build.cjs: actual createNewContactFollowUpDefinition is injected.
update public.luxor_custom_workflows set status='paused' where status='active' and trigger_type='contact_form_inquiry_created';
DO $test$
declare d jsonb:=$definition$__STANDARD_DEFINITION_JSON__$definition$;
 wid uuid:=gen_random_uuid();vid uuid:=gen_random_uuid();lid uuid;eid uuid;sid uuid;ackid uuid;runid uuid;tid uuid;rid uuid;case_name text;action text;rejected boolean;r jsonb;replayed jsonb;chosen_nurture uuid;ack_status text;marker_status text;receipt_before jsonb;marker_before jsonb;
begin
 insert into public.luxor_custom_workflows(id,name,trigger_type,status,draft_definition,created_by,updated_by) values(wid,'Actual standard fixture',d->>'trigger','active',d,'tester@example.invalid','tester@example.invalid');
 insert into public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by) values(vid,wid,1,d,'tester@example.invalid');
 update public.luxor_custom_workflows set current_version_id=vid where id=wid;
 select id into chosen_nurture from public.luxor_custom_workflows where trigger_type='manual' and status='active' limit 1;
 foreach case_name in array array['sent','independent_queued','independent_sending','independent_unknown','manual_skip','forged_manual_skip','marker_pending','queued','sending','unknown','missing_marker','missing_job','wrong_source','forged_auto_type','forged_auto_key','wrong_lead','wrong_recipient','owned_ack','future_transaction'] loop
 if case_name='future_transaction' then
  vid:=gen_random_uuid();
  insert into public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by) values(vid,wid,2,jsonb_set(d,'{steps}',((d->'steps')-5)||jsonb_build_array((d->'steps'->0)||jsonb_build_object('id','later-ack'),d->'steps'->5)),'tester@example.invalid');
 end if;
 foreach action in array array['later','nurture','stop'] loop
  lid:=gen_random_uuid();eid:=gen_random_uuid();sid:=gen_random_uuid();ackid:=gen_random_uuid();runid:=gen_random_uuid();tid:=gen_random_uuid();rid:=gen_random_uuid();
  insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','mixed@example.invalid',true);
  ack_status:=case when case_name in ('queued','sending') then case_name when case_name='independent_queued' then 'queued' when case_name='independent_sending' then 'sending' when case_name='independent_unknown' then 'failed' else 'sent' end;
  marker_status:=case when case_name in ('queued','marker_pending') then 'queued' when case_name='sending' then 'sending' else 'completed' end;
  if case_name not in ('missing_job','manual_skip','forged_manual_skip') then
   insert into public.luxor_email_jobs(id,inquiry_id,job_type,status,recipient_email,subject,body,sent_at,metadata) values(ackid,case when case_name='wrong_lead' then null else lid end,'marketing_campaign',ack_status,'mixed@example.invalid','Original receipt','Synthetic',case when ack_status='sent' then now() end,jsonb_build_object('source',case when case_name='wrong_source' then 'unrelated' else 'inquiry_acknowledgment' end));
  end if;
  insert into public.luxor_custom_workflow_source_events(id,event_key,trigger_type,inquiry_id,payload,status,processed_at) values(sid,case when case_name='manual_skip' then 'manual:'||wid::text||':'||vid::text||':'||lid::text when case_name='forged_manual_skip' or case_name='forged_auto_key' then sid::text else 'contact_form_inquiry_created:'||lid::text end,case when case_name in ('manual_skip','forged_manual_skip','forged_auto_type') then 'manual' else d->>'trigger' end,lid,case when case_name in ('manual_skip','forged_manual_skip') then jsonb_build_object('workflow_id',wid,'version_id',vid,'actor_email','tester@example.invalid') else jsonb_build_object('flow','contact_form') end,'consumed',now()) on conflict(event_key) do update set trigger_type=excluded.trigger_type,payload=excluded.payload,status=excluded.status,processed_at=excluded.processed_at returning id into sid;
  insert into public.luxor_custom_workflow_enrollments(id,workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at) values(eid,wid,vid,sid,lid,'active','operator-call-task',now());
  if case_name<>'missing_marker' then
   insert into public.luxor_custom_workflow_step_runs(id,enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,completed_at,last_error,snapshot) values(runid,eid,vid,'inquiry-acknowledgment',0,'email',marker_status,eid::text||':ack',now(),case when marker_status='completed' then now() end,case when case_name='unknown' then 'provider_outcome_unknown:synthetic' end,case when case_name in ('manual_skip','forged_manual_skip') then jsonb_build_object('manual_acknowledgment_marker_skipped',true) else jsonb_build_object('existing_acknowledgment',true,'email_job_id',ackid,'email_job_status',ack_status) end);
  end if;
  if case_name='owned_ack' then update public.luxor_email_jobs set custom_workflow_step_run_id=runid where id=ackid;end if;
  if case_name='wrong_recipient' then update public.luxor_email_jobs set recipient_email='other@example.invalid' where id=ackid;end if;
  if case_name='independent_unknown' then update public.luxor_email_jobs set last_error='provider_outcome_unknown:synthetic' where id=ackid;end if;
  select to_jsonb(j) into receipt_before from public.luxor_email_jobs j where id=ackid;
  select to_jsonb(sr) into marker_before from public.luxor_custom_workflow_step_runs sr where id=runid;
  insert into public.luxor_tasks(id,inquiry_id,title) values(tid,lid,'Actual standard call');
  insert into public.luxor_custom_workflow_step_runs(enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,completed_at,snapshot) values(eid,vid,'operator-call-task',2,'call_task','completed',eid::text||':call',now(),now(),(d->'steps'->2)||jsonb_build_object('task_id',tid));
  insert into public.luxor_custom_workflow_step_runs(enrollment_id,workflow_version_id,step_id,step_order,channel,status,idempotency_key,scheduled_for,snapshot) values(eid,vid,'eligibility-check',3,'condition','scheduled',eid::text||':next',now(),d->'steps'->3);
  rejected:=false;
  begin r:=public.luxor_resolve_call_outcome(rid,lid,tid,'interested',action,'Standard fixture',case when action='later' then now()+interval '1 day' end,case when action='later' then 'phone' end,case when action='nurture' then chosen_nurture end,'tester@example.invalid');exception when sqlstate '40001' then rejected:=true;end;
  if case_name in ('sent','independent_queued','independent_sending','independent_unknown','manual_skip') then
   if rejected or (select status from public.luxor_custom_workflow_enrollments where id=eid)<>'stopped' or (select status from public.luxor_tasks where id=tid)<>'completed' then raise exception 'Standard completed receipt failed %',action;end if;
   if (select status from public.luxor_custom_workflow_step_runs where id=runid)<>'completed' then raise exception 'Original acknowledgment marker changed';end if;
   replayed:=public.luxor_resolve_call_outcome(rid,lid,tid,'interested',action,'Standard fixture',case when action='later' then now()+interval '1 day' end,case when action='later' then 'phone' end,case when action='nurture' then chosen_nurture end,'tester@example.invalid');
   if r<>replayed or (select count(*) from public.luxor_notes where inquiry_id=lid)<>1 then raise exception 'Standard replay duplicated outcome %',action;end if;
  else
   if not rejected or (select status from public.luxor_custom_workflow_enrollments where id=eid)<>'active' or (select status from public.luxor_tasks where id=tid)<>'pending' or exists(select 1 from public.luxor_notes where inquiry_id=lid) or exists(select 1 from public.luxor_call_resolution_receipts where request_id=rid) then raise exception 'Unsafe receipt not refused atomically % %',case_name,action;end if;
  end if;
  if case_name not in ('missing_job','manual_skip','forged_manual_skip') and (select status from public.luxor_email_jobs where id=ackid)<>ack_status then raise exception 'Original receipt was changed';end if;
  if receipt_before is distinct from (select to_jsonb(j) from public.luxor_email_jobs j where id=ackid) or marker_before is distinct from (select to_jsonb(sr) from public.luxor_custom_workflow_step_runs sr where id=runid) then raise exception 'Original receipt/marker history changed';end if;
  raise notice 'PASS standard receipt=% action=%',case_name,action;
 end loop;end loop;
end $test$;
