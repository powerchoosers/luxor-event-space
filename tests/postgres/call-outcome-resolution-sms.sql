\set ON_ERROR_STOP on
update public.luxor_custom_workflows set status='paused' where status='active' and trigger_type='manual';
DO $test$
declare wid uuid:=gen_random_uuid();vid uuid:=gen_random_uuid();lid uuid;rid uuid;action text;r jsonb;
d jsonb:='{"schemaVersion":1,"trigger":"manual","steps":[{"id":"text","type":"text","name":"Synthetic text","body":"Luxor Event Space: Synthetic local test. Reply STOP to opt out.","requiredConsentScope":"marketing","generationMode":"manual"},{"id":"end","type":"end","name":"End"}]}';
begin
 if not public.luxor_custom_workflow_definition_is_runnable(d) then raise exception 'Invalid SMS fixture';end if;
 insert into public.luxor_custom_workflows(id,name,trigger_type,status,draft_definition,created_by,updated_by) values(wid,'SMS consent fixture','manual','active',d,'tester@example.invalid','tester@example.invalid');
 insert into public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by) values(vid,wid,1,d,'tester@example.invalid');
 update public.luxor_custom_workflows set current_version_id=vid where id=wid;
 insert into public.luxor_sms_consents(phone_number,status,consent_scopes) values('+12105550100','opted_in',array['marketing']);
 foreach action in array array['nurture','restart'] loop
  lid:=gen_random_uuid();rid:=gen_random_uuid();
  insert into public.luxor_inquiries(id,flow,phone,marketing_opt_in) values(lid,'contact_form','2105550100',false);
  if action='nurture' then
   r:=public.luxor_resolve_call_outcome(rid,lid,null,'interested','nurture','SMS-only consent',null,null,wid,'tester@example.invalid');
  else
   perform public.luxor_resolve_call_outcome(gen_random_uuid(),lid,null,'interested','stop','Stop first',null,null,null,'tester@example.invalid');
   r:=public.luxor_enroll_workflow_with_resolution(rid,wid,array[lid],'tester@example.invalid',true);
  end if;
  if r->>'status'<>'completed' or (select count(*) from public.luxor_custom_workflow_enrollments where inquiry_id=lid and status='active')<>1 then raise exception 'Normalized SMS consent blocked %',action;end if;
  if exists(select 1 from public.luxor_text_jobs where inquiry_id=lid) then raise exception 'Fixture unexpectedly queued provider job';end if;
  raise notice 'PASS normalized 10-digit lead / +1 marketing SMS consent for %',action;
 end loop;
end $test$;
