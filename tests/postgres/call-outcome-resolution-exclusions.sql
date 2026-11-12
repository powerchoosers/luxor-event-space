\set ON_ERROR_STOP on
update public.luxor_custom_workflows set status='paused' where status='active';
DO $$
declare lid uuid:=gen_random_uuid();wid uuid;vid uuid;eid uuid;ack_eid uuid;sourceid uuid;rid uuid:=gen_random_uuid();jobid uuid:=gen_random_uuid();r jsonb;rejected boolean;d jsonb;kind text;
begin
 insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','exclusions@example.invalid',true);
 foreach kind in array array['prospect','transactional'] loop
  wid:=gen_random_uuid();vid:=gen_random_uuid();sourceid:=gen_random_uuid();eid:=gen_random_uuid();
  d:=case when kind='prospect' then '{"schemaVersion":1,"trigger":"manual","steps":[{"id":"email","type":"email","mode":"marketing","name":"Follow up","subject":"Synthetic","body":"Synthetic","previewText":"","ctaText":"","ctaUrl":""},{"id":"end","type":"end","name":"End"}]}'::jsonb else '{"schemaVersion":1,"trigger":"contact_form_inquiry_created","steps":[{"id":"inquiry-acknowledgment","type":"email","mode":"existing_inquiry_acknowledgment","name":"Receipt","subject":"","previewText":"","body":"","ctaText":"","ctaUrl":""},{"id":"end","type":"end","name":"End"}]}'::jsonb end;
  insert into public.luxor_custom_workflows(id,name,trigger_type,status,draft_definition,created_by,updated_by) values(wid,'Fixture '||kind,d->>'trigger','active',d,'tester@example.invalid','tester@example.invalid');
  insert into public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by) values(vid,wid,1,d,'tester@example.invalid');
  update public.luxor_custom_workflows set current_version_id=vid where id=wid;
  if public.luxor_resolution_version_purpose(vid)<>kind then raise exception 'Fixture classified wrong %',kind;end if;
  insert into public.luxor_custom_workflow_source_events(id,event_key,trigger_type,inquiry_id,payload,status,processed_at) values(sourceid,sourceid::text,d->>'trigger',lid,'{}','consumed',now());
  insert into public.luxor_custom_workflow_enrollments(id,workflow_id,workflow_version_id,source_event_id,inquiry_id,status,current_step_id,next_run_at) values(eid,wid,vid,sourceid,lid,'active',d->'steps'->0->>'id',now());
  if kind='transactional' then ack_eid:=eid;end if;
 end loop;
 insert into public.luxor_email_jobs(id,inquiry_id,job_type,status,recipient_email,subject,body) values(jobid,lid,'transactional_notice','queued','exclusions@example.invalid','Synthetic','Synthetic');
 r:=public.luxor_resolve_call_outcome(rid,lid,null,'interested','stop','stop fixture',null,null,null,'tester@example.invalid');
 if (select status from public.luxor_custom_workflow_enrollments where id=ack_eid)<>'active' or (select status from public.luxor_email_jobs where id=jobid)<>'queued' then raise exception 'Transactional work changed';end if;
 if exists(select 1 from public.luxor_custom_workflow_enrollments e where e.inquiry_id=lid and public.luxor_resolution_version_purpose(e.workflow_version_id)='prospect' and status<>'stopped') then raise exception 'Prospect remains active';end if;
 rejected:=false;begin insert into public.luxor_tasks(inquiry_id,title,description) values(lid,'Disallowed','[follow-up:phone] stale producer');exception when sqlstate '40001' then rejected:=true;end;
 if not rejected then raise exception 'Admission fence bypassed';end if;
 insert into public.luxor_tasks(inquiry_id,title,description) values(lid,'Ordinary task','Unrelated operational task');
 raise notice 'PASS prospect stop, transactional enrollment/job exclusion and durable task admission';
end $$;
