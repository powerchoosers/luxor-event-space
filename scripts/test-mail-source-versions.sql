-- Execute the entire file: all synthetic records are rolled back.
begin;
set local role service_role;
do $$
declare r uuid; p uuid; p2 uuid; i uuid; old_id uuid; new_id uuid; token uuid:=gen_random_uuid(); stamp timestamptz:=now();
  hash_a text:=repeat('a',64); hash_b text:=repeat('b',64); f jsonb:='{"id":"97001","name":"Drafts","type":"Drafts","path":"/Drafts"}';
  original jsonb; c jsonb;
begin
  insert into public.luxor_mail_import_runs(account_id,mailbox,started_by,folders,status,phase)
    values ('97990001','versions@example.invalid','qa@example.invalid',jsonb_build_array(f),'review','reconcile') returning id into r;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,1,'complete',jsonb_build_array(f),now(),'complete',now(),'{}') returning id into p;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,text_body,payload_hash,metadata)
    values ('zoho','97990001:97002','outgoing','versions-qa','qa@example.invalid','{versions@example.invalid}','Original draft','Keep original bytes',hash_a,
      jsonb_build_object('source','zoho-history-import','zohoAccountId','97990001','zohoMessageId','97002','zohoFolder',f,
        'importComplete',true,'historyStaged',true,'originalSha256',hash_a,'archiveVerifiedAt',stamp)) returning id into old_id;
  select to_jsonb(m) into original from public.luxor_mail_messages m where id=old_id;
  insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status,local_message_id,verified_at)
    values (r,'97002',f,'{"id":"97002"}','verified',old_id,stamp) returning id into i;
  insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message,check_status,checked_at,source_sha256,archived_sha256,archived_message_id)
    values (p,'97002',f,'{"id":"97002"}','different',stamp,hash_b,hash_a,old_id);
  if public.luxor_archive_mail_source_changes(r,gen_random_uuid()) then raise exception 'Wrong pass accepted'; end if;
  update public.luxor_mail_source_observations set repeated=true where pass_id=p;
  if public.luxor_archive_mail_source_changes(r,p) then raise exception 'Repeated source accepted'; end if;
  update public.luxor_mail_source_observations set repeated=false where pass_id=p;
  update public.luxor_mail_messages set metadata=metadata||'{"historyStaged":false}' where id=old_id;
  if public.luxor_archive_mail_source_changes(r,p) then raise exception 'Live archive silently replaced'; end if;
  update public.luxor_mail_messages set metadata=original->'metadata' where id=old_id;
  if not public.luxor_archive_mail_source_changes(r,p) then raise exception 'Changed archive rejected'; end if;
  if public.luxor_archive_mail_source_changes(r,p) then raise exception 'Duplicate start accepted'; end if;
  if not exists(select 1 from public.luxor_mail_import_items where id=i and status='pending' and local_message_id is null
    and target_pass_id=p and target_sha256=hash_b) then raise exception 'Version target not checkpointed'; end if;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,payload_hash,metadata)
    values ('zoho','97990001:97002:revision:'||p,'outgoing','versions-qa','qa@example.invalid','{versions@example.invalid}','Changed draft',hash_b,
      jsonb_build_object('source','zoho-history-import','zohoAccountId','97990001','zohoMessageId','97002','zohoFolder',f,
        'sourceRevisionPassId',p,'importComplete',true,'historyStaged',true,'originalSha256',hash_b)) returning id into new_id;
  update public.luxor_mail_import_runs set lease_token=token,lease_until=now()+interval '5 minutes' where id=r;
  if public.luxor_commit_mail_import_item(r,gen_random_uuid(),i,'verifying',new_id,0,now(),null,null) then raise exception 'Stale lease accepted'; end if;
  if public.luxor_commit_mail_import_item(r,token,i,'verifying',old_id,0,now(),null,null) then raise exception 'Original substituted for version'; end if;
  if public.luxor_commit_mail_import_item(r,token,i,'verified',new_id,0,now(),null,stamp) then raise exception 'Unverified version accepted'; end if;
  if not public.luxor_commit_mail_import_item(r,token,i,'verifying',new_id,0,now(),null,null) then raise exception 'Saved version rejected'; end if;
  update public.luxor_mail_import_runs set lease_token=token,lease_until=now()+interval '5 minutes' where id=r;
  perform public.luxor_control_mail_import(r,'pause');
  if public.luxor_commit_mail_import_item(r,token,i,'verified',new_id,0,now(),null,stamp) then raise exception 'Paused version accepted'; end if;
  update public.luxor_mail_import_runs set lease_until=now()-interval '1 second' where id=r;
  if not public.luxor_control_mail_import(r,'resume') then raise exception 'Version resume rejected'; end if;
  update public.luxor_mail_import_runs set lease_token=token,lease_until=now()+interval '5 minutes' where id=r;
  update public.luxor_mail_messages set metadata=metadata||jsonb_build_object('archiveVerifiedAt',stamp) where id=new_id;
  if not public.luxor_commit_mail_import_item(r,token,i,'verified',new_id,0,now(),null,stamp) then raise exception 'Verified version rejected'; end if;
  c:=public.luxor_mail_source_content_counts(p);
  if c->>'different'<>'1' or c->>'versioned'<>'1' then raise exception 'Comparison evidence overwritten: %',c; end if;
  if public.luxor_mail_source_archive(p,'97002')->>'id'<>new_id::text then raise exception 'Next audit did not select verified version'; end if;
  if (select to_jsonb(m) from public.luxor_mail_messages m where id=old_id) is distinct from original then raise exception 'Original history mutated'; end if;
  if not exists(select 1 from public.luxor_mail_source_observations where pass_id=p and archived_message_id=old_id
    and replacement_message_id=new_id and archived_sha256=hash_a and source_sha256=hash_b) then raise exception 'Version chain missing'; end if;

  -- A version that changed again can be retried against a fresh audit, using
  -- the retained verified baseline rather than trusting a partial new row.
  update public.luxor_mail_source_observations set replacement_message_id=null,replacement_verified_at=null where pass_id=p;
  update public.luxor_mail_import_items set status='failed',verified_at=null where id=i;
  if public.luxor_mail_source_archive(p,'97002')->>'id'<>old_id::text then raise exception 'Failed-version baseline unavailable'; end if;
  update public.luxor_mail_import_runs set status='review',phase='reconcile',lease_token=null,lease_until=null where id=r;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,2,'complete',jsonb_build_array(f),now(),'complete',now(),'{}') returning id into p2;
  insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message,check_status,checked_at,source_sha256,archived_sha256,archived_message_id)
    values (p2,'97002',f,'{"id":"97002"}','different',stamp,repeat('c',64),hash_a,old_id);
  if public.luxor_archive_mail_source_changes(r,p) then raise exception 'Obsolete version audit restarted'; end if;
  if not public.luxor_archive_mail_source_changes(r,p2) then raise exception 'Fresh audit cannot recover failed version'; end if;
  if not exists(select 1 from public.luxor_mail_import_items where id=i and status='pending' and target_pass_id=p2
    and target_sha256=repeat('c',64) and local_message_id is null) then raise exception 'Fresh version target missing'; end if;
end;
$$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.luxor_archive_mail_source_changes(uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.luxor_archive_mail_source_changes(uuid,uuid)','execute') then raise exception 'Version action exposed'; end if;
end; $$;
select 'PASS immutable source versions, exact hashes, staged-only replacement, lease/pause guards, verified-only advancement and fresh-audit recovery' as result;
rollback;
