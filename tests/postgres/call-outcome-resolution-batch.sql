\set ON_ERROR_STOP on
DO $$
declare l1 uuid:='10000000-0000-4000-8000-000000000001';l2 uuid:='20000000-0000-4000-8000-000000000002';l3 uuid:='30000000-0000-4000-8000-000000000003';wid uuid;rid uuid:=gen_random_uuid();r jsonb;again jsonb;rejected boolean;
begin
 select id into wid from public.luxor_custom_workflows where trigger_type='manual' and status='active' limit 1;
 insert into public.luxor_inquiries(id,flow,email,marketing_opt_in,status) values(l1,'contact_form','batch1@example.invalid',true,'new'),(l2,'contact_form','batch2@example.invalid',true,'new'),(l3,'contact_form','batch3@example.invalid',true,'closed_lost');
 perform public.luxor_resolve_call_outcome(gen_random_uuid(),l1,null,'interested','stop','stop before restart',null,null,null,'tester@example.invalid');
 rejected:=false;begin perform public.luxor_enroll_workflow_with_resolution(rid,wid,array[l1,l2,l3],'tester@example.invalid');exception when sqlstate '40001' then rejected:=true;end;
 if not rejected or exists(select 1 from public.luxor_custom_workflow_enrollments where inquiry_id=any(array[l1,l2,l3])) or (select mode from public.luxor_prospect_resolution_controls where inquiry_id=l1)<>'stopped' then raise exception 'Mixed batch failed to rollback atomically';end if;
 rejected:=false;begin perform public.luxor_enroll_workflow_with_resolution(rid,wid,array[l1,l2],'tester@example.invalid',false);exception when sqlstate '55000' then rejected:=true;end;
 if not rejected or exists(select 1 from public.luxor_custom_workflow_enrollments where inquiry_id=any(array[l1,l2])) or exists(select 1 from public.luxor_call_resolution_receipts where request_id=rid) or (select mode from public.luxor_prospect_resolution_controls where inquiry_id=l1)<>'stopped' then raise exception 'Disabled new batch wrote state';end if;
 raise notice 'PASS p_allow_new=false rejects new batch without enrollment, receipt or fence changes';
 r:=public.luxor_enroll_workflow_with_resolution(rid,wid,array[l1,l2],'tester@example.invalid');
 again:=public.luxor_enroll_workflow_with_resolution(rid,wid,array[l2,l1],'tester@example.invalid',false);
 if r<>again or (r->>'enrolled_count')::int<>2 or (select count(*) from public.luxor_custom_workflow_enrollments where inquiry_id=any(array[l1,l2]))<>2 then raise exception 'Mixed batch replay duplicated';end if;
 raise notice 'PASS mixed fenced/unfenced batch, partial rollback and canonical replay with p_allow_new=false';
end $$;
