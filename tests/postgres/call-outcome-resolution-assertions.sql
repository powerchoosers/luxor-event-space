\set ON_ERROR_STOP on
-- Disposable database assertions only; no provider or production calls.
update public.luxor_custom_workflow_runtime_controls set execution_enabled=true,authoring_enabled=true where singleton;
DO $$
declare step text; overdue boolean; lid uuid; tid uuid; rid uuid; wid uuid:=gen_random_uuid(); vid uuid:=gen_random_uuid(); r jsonb; replay jsonb; rejected boolean; n integer;
d jsonb:='{"schemaVersion":1,"trigger":"manual","steps":[{"id":"email","type":"email","mode":"marketing","name":"Synthetic nurture","subject":"Synthetic","previewText":"Synthetic","body":"Synthetic test only","ctaText":"","ctaUrl":""},{"id":"end","type":"end","name":"End"}]}';
begin
 if not public.luxor_custom_workflow_definition_is_runnable(d) then raise exception 'Invalid fixture definition'; end if;
 insert into public.luxor_custom_workflows(id,name,trigger_type,status,draft_definition,created_by,updated_by) values(wid,'Synthetic nurture','manual','active',d,'tester@example.invalid','tester@example.invalid');
 insert into public.luxor_custom_workflow_versions(id,workflow_id,version_number,definition,created_by) values(vid,wid,1,d,'tester@example.invalid');
 update public.luxor_custom_workflows set current_version_id=vid where id=wid;
 foreach step in array array['none','tour','proposal','later','thank_you','nurture','stop'] loop
 foreach overdue in array array[true,false] loop
  lid:=gen_random_uuid();tid:=gen_random_uuid();rid:=gen_random_uuid();
  insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','synthetic@example.invalid',true);
  insert into public.luxor_tasks(id,inquiry_id,title,due_at) values(tid,lid,'Synthetic call',now()+case when overdue then interval '-1 day' else interval '1 day' end);
  r:=public.luxor_resolve_call_outcome(rid,lid,tid,'interested',step,'Synthetic call',case when step='later' then now()+interval '2 days' end,case when step='later' then 'phone' end,case when step='nurture' then wid end,'tester@example.invalid');
  if r->>'status'<>'completed' or (select status from public.luxor_tasks where id=tid)<>'completed' then raise exception 'Not completed % %',step,overdue;end if;
  replay:=public.luxor_resolve_call_outcome(rid,lid,tid,'interested',step,'Synthetic call',case when step='later' then now()+interval '2 days' end,case when step='later' then 'phone' end,case when step='nurture' then wid end,'tester@example.invalid');
  if replay<>r or (select count(*) from public.luxor_notes where inquiry_id=lid)<>1 then raise exception 'Replay duplicated %',step;end if;
  if step='later' then
   if (select due_at from public.luxor_tasks where id=(r->>'nextTaskId')::uuid)<>now()+interval '2 days' then raise exception 'Wrong reminder';end if;
   update public.luxor_tasks set due_at=now()+interval '3 days' where id=(r->>'nextTaskId')::uuid;
  end if;
  if step='nurture' and not exists(select 1 from public.luxor_custom_workflow_enrollments where id=(r->>'nurtureEnrollmentId')::uuid and status='active') then raise exception 'No nurture';end if;
  rejected:=false;begin perform public.luxor_resolve_call_outcome(rid,lid,tid,'interested',step,'DIFFERENT',case when step='later' then now()+interval '2 days' end,case when step='later' then 'phone' end,case when step='nurture' then wid end,'tester@example.invalid');exception when sqlstate '22023' then rejected:=true;end;
  if not rejected then raise exception 'Changed replay allowed';end if;
  raise notice 'PASS step=% overdue=% exact replay and changed replay',step,overdue;
 end loop;end loop;
 lid:=gen_random_uuid();tid:=gen_random_uuid();
 insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values(lid,'contact_form','rollback@example.invalid',true);
 insert into public.luxor_tasks(id,inquiry_id,title) values(tid,lid,'Rollback task');
 rejected:=false;begin perform public.luxor_resolve_call_outcome(gen_random_uuid(),lid,tid,'interested','later','past',now()-interval '1 day','phone',null,'tester@example.invalid');exception when sqlstate '22023' then rejected:=true;end;
 if not rejected or (select status from public.luxor_tasks where id=tid)<>'pending' or exists(select 1 from public.luxor_notes where inquiry_id=lid) then raise exception 'Past-date rollback failed';end if;
 if has_function_privilege('anon','public.luxor_resolve_call_outcome(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,text)','EXECUTE') or has_function_privilege('authenticated','public.luxor_resolve_call_outcome(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,text)','EXECUTE') then raise exception 'Untrusted execution';end if;
 raise notice 'PASS past-date rollback and role ACL';
end $$;
