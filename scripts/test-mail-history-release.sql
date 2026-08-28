-- Run the entire transaction. No fixture records or queued mail survive.
begin;
set local role service_role;
do $$
declare r uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; old_id uuid; current_id uuid; missing_id uuid; item_id uuid;
  hash_a text:=repeat('a',64); hash_b text:=repeat('b',64); stamp timestamptz:=now();
  f jsonb:='{"id":"98001","name":"Inbox","type":"Inbox","path":"/Inbox"}';
  empty_f jsonb:='{"id":"98002","name":"Empty","type":"Inbox","path":"/Clients/Empty"}';
  msg jsonb:='{"id":"98003","folderId":"98001","threadId":"98005","isRead":true}';
  review jsonb; receipt jsonb; old_body jsonb; rejected boolean;
begin
  insert into public.luxor_mail_import_runs(account_id,mailbox,started_by,folders,status,phase)
    values ('98990001','release@example.invalid','qa@example.invalid',jsonb_build_array(f,empty_f),'review','reconcile') returning id into r;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,1,'complete',jsonb_build_array(f,empty_f),stamp,'complete',stamp,'{"matchesPrevious":true}') returning id into p1;
  if public.luxor_mail_history_release_review(r)->>'ready'='true' then raise exception 'Single inventory accepted'; end if;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,2,'complete',jsonb_build_array(f,empty_f),stamp,'complete',stamp,'{"matchesPrevious":true}') returning id into p2;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,text_body,payload_hash,metadata)
    values ('zoho','98990001:98003','incoming','release-qa','qa@example.invalid','{release@example.invalid}','Previous version','Original bytes',hash_a,
      jsonb_build_object('source','zoho-history-import','zohoAccountId','98990001','zohoMessageId','98003','zohoFolder',f,
        'importComplete',true,'historyStaged',true,'originalSha256',hash_a,'archiveVerifiedAt',stamp)) returning id into old_id;
  select jsonb_build_object('body',text_body,'hash',payload_hash,'provider_id',provider_id) into old_body from public.luxor_mail_messages where id=old_id;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,text_body,payload_hash,metadata)
    values ('zoho','98990001:98003:revision:'||p2,'incoming','release-qa','qa@example.invalid','{release@example.invalid}','Current version','New bytes',hash_b,
      jsonb_build_object('source','zoho-history-import','zohoAccountId','98990001','zohoMessageId','98003','zohoFolder',f,
        'sourceRevisionPassId',p2,'importComplete',true,'historyStaged',true,'originalSha256',hash_b,'archiveVerifiedAt',stamp)) returning id into current_id;
  insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status,local_message_id,verified_at,target_pass_id,target_sha256)
    values (r,'98003',f,msg,'verified',current_id,stamp,p2,hash_b) returning id into item_id;
  insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message,check_status,checked_at,source_sha256,archived_sha256,archived_message_id,replacement_message_id,replacement_verified_at)
    values (p2,'98003',f,msg,'different',stamp,hash_b,hash_a,old_id,current_id,stamp);
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,payload_hash,metadata)
    values ('zoho','98990001:98004','incoming','release-qa','qa@example.invalid','{release@example.invalid}','Retained message',hash_a,
      jsonb_build_object('source','zoho-history-import','zohoAccountId','98990001','zohoMessageId','98004','zohoFolder',f,
        'importComplete',true,'historyStaged',true,'originalSha256',hash_a,'archiveVerifiedAt',stamp)) returning id into missing_id;
  insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status,local_message_id,verified_at)
    values (r,'98004',f,msg||'{"id":"98004","isRead":false}','verified',missing_id,stamp);
  review:=public.luxor_mail_history_release_review(r);
  if review->>'ready'<>'true' or review->>'messageCount'<>'2' or review->>'retainedCount'<>'1' then raise exception 'Bad release review: %',review; end if;
  update public.luxor_mail_messages set metadata=metadata||'{"zohoAccountId":"wrong"}' where id=current_id;
  if public.luxor_mail_history_release_review(r)->>'ready'='true' then raise exception 'Corrupt identity accepted'; end if;
  update public.luxor_mail_messages set metadata=metadata||'{"zohoAccountId":"98990001"}' where id=current_id;
  update public.luxor_mail_source_observations set repeated=true where pass_id=p2;
  if public.luxor_mail_history_release_review(r)->>'ready'='true' then raise exception 'Repeated source accepted'; end if;
  update public.luxor_mail_source_observations set repeated=false where pass_id=p2;
  update public.luxor_mail_import_runs set lease_token=gen_random_uuid(),lease_until=now()+interval '1 minute' where id=r;
  if public.luxor_mail_history_release_review(r)->>'ready'='true' then raise exception 'Busy import accepted'; end if;
  update public.luxor_mail_import_runs set lease_token=null,lease_until=null where id=r;
  rejected:=false;
  begin perform public.luxor_release_mail_history(r,p2,'owner@example.invalid',false);
    exception when others then rejected:=true; end;
  if not rejected or exists(select 1 from public.luxor_mail_history_releases where run_id=r) then raise exception 'Retention approval bypassed'; end if;
  rejected:=false;
  begin perform public.luxor_release_mail_history(r,p1,'owner@example.invalid',true);
    exception when others then rejected:=true; end;
  if not rejected then raise exception 'Stale pass released'; end if;
  receipt:=public.luxor_release_mail_history(r,p2,'owner@example.invalid',true);
  if not exists(select 1 from public.luxor_mail_messages where id=current_id and read_at is not null
    and thread_key='mail-zoho-98990001-98005' and metadata->>'historyStaged'='false' and metadata->>'historySuperseded'='false') then raise exception 'Canonical release failed'; end if;
  if not exists(select 1 from public.luxor_mail_messages where id=old_id and metadata->>'historySuperseded'='true'
    and metadata->>'historyStaged'='false' and metadata->>'historySupersededBy'=current_id::text) then raise exception 'Old version not hidden'; end if;
  if not exists(select 1 from public.luxor_mail_messages where id=missing_id and read_at is null
    and metadata->>'historyMissingFromSource'='true') then raise exception 'Missing history not retained'; end if;
  if (select jsonb_build_object('body',text_body,'hash',payload_hash,'provider_id',provider_id) from public.luxor_mail_messages where id=old_id) is distinct from old_body then raise exception 'Original content modified'; end if;
  if not exists(select 1 from public.luxor_mail_released_folders() where account_id='98990001' and folders @> jsonb_build_array(empty_f)) then raise exception 'Empty folder lost'; end if;
  update public.luxor_mail_messages set read_at=null where id=current_id;
  if public.luxor_release_mail_history(r,p2,'owner@example.invalid',true) is distinct from receipt then raise exception 'Replay receipt changed'; end if;
  if (select read_at from public.luxor_mail_messages where id=current_id) is not null then raise exception 'Replay reset local unread choice'; end if;
  if (select count(*) from public.luxor_mail_history_releases where run_id=r)<>1
    or (select count(*) from public.luxor_mail_history_release_items where release_id=(receipt->>'id')::uuid)<>2 then raise exception 'Duplicate release'; end if;
  -- A later source move/read change must preserve the owner's local unread choice.
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,3,'complete',jsonb_build_array(f,empty_f),stamp,'complete',stamp,'{"matchesPrevious":true}') returning id into p3;
  insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message,check_status,checked_at,source_sha256,archived_sha256,archived_message_id)
    values (p3,'98003',empty_f,msg||'{"folderId":"98002","threadId":"98006"}','matching',stamp,hash_b,hash_b,current_id);
  perform public.luxor_release_mail_history(r,p3,'owner@example.invalid',true);
  if not exists(select 1 from public.luxor_mail_messages where id=current_id and read_at is null
    and metadata->'zohoFolder'=empty_f and thread_key='mail-zoho-98990001-98006') then raise exception 'Folder move or read preservation failed'; end if;
  -- A released baseline can be versioned by a later explicit content audit.
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,content_status,content_completed_at,report)
    values (r,4,'complete',jsonb_build_array(f,empty_f),stamp,'complete',stamp,'{}') returning id into p4;
  insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message,check_status,checked_at,source_sha256,archived_sha256,archived_message_id)
    values (p4,'98003',empty_f,msg||'{"folderId":"98002"}','different',stamp,repeat('c',64),hash_b,current_id);
  if not public.luxor_archive_mail_source_changes(r,p4) then raise exception 'Reviewed baseline cannot advance'; end if;
  if not exists(select 1 from public.luxor_mail_import_items where id=item_id and status='pending' and target_pass_id=p4) then raise exception 'Delta target missing'; end if;
end;
$$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.luxor_release_mail_history(uuid,uuid,text,boolean)','execute')
    or has_function_privilege('authenticated','public.luxor_mail_released_folders()','execute')
    or has_table_privilege('authenticated','public.luxor_mail_history_releases','select')
    or has_table_privilege('service_role','public.luxor_mail_history_release_items','delete') then raise exception 'Private release access weakened'; end if;
  if exists(select 1 from pg_class where relname in ('luxor_mail_history_releases','luxor_mail_history_release_items') and not relrowsecurity)
    or exists(select 1 from pg_proc where proname in ('luxor_release_mail_history','luxor_mail_history_release_review','luxor_mail_released_folders') and prosecdef) then raise exception 'RLS/invoker violation'; end if;
end; $$;
select 'PASS reviewed release, retained history, immutable originals, exact retry, read-state preservation, empty folders and delta archive' as result;
rollback;
