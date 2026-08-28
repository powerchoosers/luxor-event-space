-- All mail and import records here are synthetic and rolled back together.
begin;
set local role service_role;
do $$
declare
  r uuid; s uuid; old_pass uuid; t uuid := gen_random_uuid(); m uuid; a jsonb; c jsonb; n integer;
  hash_a text := repeat('a',64); hash_b text := repeat('b',64);
  folders jsonb := '[{"id":"91001","name":"Inbox","path":"/Inbox","type":"Inbox"}]';
begin
  insert into public.luxor_mail_import_runs(account_id,mailbox,started_by,folders,status,phase)
    values ('99001234567890003','content-qa@example.invalid','qa@example.invalid',folders,'review','reconcile') returning id into r;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,report)
    values (r,1,'complete',folders,now(),'{}') returning id into old_pass;
  insert into public.luxor_mail_source_passes(run_id,generation,status,folders,completed_at,report)
    values (r,2,'complete',folders,now(),'{}') returning id into s;
  for n in 1..4 loop
    insert into public.luxor_mail_source_observations(pass_id,source_message_id,folder,message)
      values (s,(92000+n)::text,folders->0,jsonb_build_object('id',(92000+n)::text));
    if n<4 then
      insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,payload_hash,metadata)
        values ('zoho','99001234567890003:'||(92000+n)::text,'incoming','qa-content','sender@example.invalid','{content-qa@example.invalid}',
          'Rollback-only content fixture',hash_a,jsonb_build_object('source','zoho-history-import','importComplete',true,'historyStaged',true,
            'zohoAccountId','99001234567890003','zohoMessageId',(92000+n)::text,'originalSha256',hash_a,'archiveVerifiedAt',now())) returning id into m;
      insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status,local_message_id,verified_at)
        values (r,(92000+n)::text,folders->0,jsonb_build_object('id',(92000+n)::text),'verified',m,now());
    else
      insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status)
        values (r,(92000+n)::text,folders->0,jsonb_build_object('id',(92000+n)::text),'failed');
    end if;
  end loop;
  if public.luxor_start_mail_source_content(r,old_pass) then raise exception 'Obsolete inventory audited'; end if;
  if public.luxor_start_mail_source_content(r,gen_random_uuid()) then raise exception 'Wrong pass audited'; end if;
  if not public.luxor_start_mail_source_content(r,s) then raise exception 'Content audit rejected'; end if;
  if public.luxor_start_mail_source_content(r,s) then raise exception 'Duplicate audit start accepted'; end if;
  c := public.luxor_next_mail_source_content(s);
  if c->>'sourceMessageId'<>'92001' or c->'archive'->>'sha256'<>hash_a then raise exception 'Incorrect first audit item'; end if;
  a := c->'archive';
  -- Another account's message, or an archive with invalidated verification,
  -- must not be accepted merely because the ledger points to its local UUID.
  update public.luxor_mail_messages set provider_id='wrong-source-qa' where id=(a->>'id')::uuid;
  if public.luxor_mail_source_archive(s,'92001')->>'sha256' is not null then raise exception 'Cross-account archive accepted'; end if;
  update public.luxor_mail_messages set provider_id='99001234567890003:92001',metadata=metadata||'{"archiveVerifiedAt":null}'::jsonb where id=(a->>'id')::uuid;
  if public.luxor_mail_source_archive(s,'92001')->>'sha256' is not null then raise exception 'Unverified archive accepted'; end if;
  update public.luxor_mail_messages set metadata=metadata||jsonb_build_object('archiveVerifiedAt',now()) where id=(a->>'id')::uuid;
  if public.luxor_commit_mail_source_content(r,null,s,'92001',a,hash_a,false) then raise exception 'Unclaimed audit result accepted'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if public.luxor_commit_mail_source_content(r,gen_random_uuid(),s,'92001',a,hash_a,false) then raise exception 'Wrong token accepted'; end if;
  if public.luxor_commit_mail_source_content(r,t,s,'92001',jsonb_set(a,'{sha256}',to_jsonb(hash_b)),hash_a,false) then raise exception 'Stale archive accepted'; end if;
  if public.luxor_finish_mail_source_content(r,t,s) then raise exception 'Pending checks ignored'; end if;
  begin
    perform public.luxor_commit_mail_source_content(r,t,s,'92001',a,null,false);
    raise exception 'Missing source checksum accepted';
  exception when raise_exception then
    if sqlerrm='Missing source checksum accepted' then raise; end if;
  end;
  if not public.luxor_control_mail_import(r,'pause') then raise exception 'Audit pause rejected'; end if;
  if public.luxor_commit_mail_source_content(r,t,s,'92001',a,hash_a,false) then raise exception 'Paused audit advanced'; end if;
  if public.luxor_control_mail_import(r,'resume') then raise exception 'Resume overlapped live audit'; end if;
  update public.luxor_mail_import_runs set lease_until=now()-interval '1 second' where id=r;
  if public.luxor_control_mail_import(r,'retry_failed') then raise exception 'Archive retry interrupted content audit'; end if;
  if not public.luxor_control_mail_import(r,'resume') then raise exception 'Audit resume rejected'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()-interval '1 second' where id=r;
  if public.luxor_commit_mail_source_content(r,t,s,'92001',a,hash_a,false) then raise exception 'Expired audit lease accepted'; end if;
  update public.luxor_mail_import_runs set lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_commit_mail_source_content(r,t,s,'92001',a,hash_a,false) then raise exception 'Matching result rejected'; end if;
  if public.luxor_commit_mail_source_content(r,t,s,'92001',a,hash_b,false) then raise exception 'Replayed result overwrote match'; end if;
  a := public.luxor_mail_source_archive(s,'92002');
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_commit_mail_source_content(r,t,s,'92002',a,hash_b,false) then raise exception 'Different content result rejected'; end if;
  a := public.luxor_mail_source_archive(s,'92003');
  for n in 1..5 loop
    update public.luxor_mail_source_observations set check_next_attempt_at=now() where pass_id=s and source_message_id='92003';
    update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
    if not public.luxor_commit_mail_source_content(r,t,s,'92003',a,null,true) then raise exception 'Source read failure not recorded'; end if;
    if n<5 and not exists(select 1 from public.luxor_mail_source_observations where pass_id=s and source_message_id='92003' and check_status='pending' and check_next_attempt_at>now() and checked_at is null) then
      raise exception 'Retry checkpoint/backoff missing'; end if;
  end loop;
  a := public.luxor_mail_source_archive(s,'92004');
  if a->>'sha256' is not null then raise exception 'Failed import treated as complete archive'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_commit_mail_source_content(r,t,s,'92004',a,null,false) then raise exception 'Unarchived result rejected'; end if;
  c := public.luxor_mail_source_content_counts(s);
  if c->>'total'<>'4' or c->>'pending'<>'0' or c->>'matching'<>'1' or c->>'different'<>'1' or c->>'unarchived'<>'1' or c->>'unavailable'<>'1' then
    raise exception 'Incorrect audit counts: %',c; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_finish_mail_source_content(r,t,s) then raise exception 'Content finalization rejected'; end if;
  if public.luxor_finish_mail_source_content(r,t,s) then raise exception 'Finalization replay accepted'; end if;
  if not exists(select 1 from public.luxor_mail_source_passes where id=s and content_status='complete' and content_completed_at is not null) then
    raise exception 'Content completion not persisted'; end if;
  if public.luxor_start_mail_source_content(r,s) then raise exception 'Completed audit overwritten instead of fresh pass'; end if;
  if not exists(select 1 from public.luxor_mail_import_runs where id=r and status='review' and phase='reconcile') then raise exception 'Audit skipped final review'; end if;
  if (select count(*) from public.luxor_mail_messages where provider_id like '99001234567890003:%' and payload_hash=hash_a and metadata->>'historyStaged'='true')<>3 then
    raise exception 'Audit changed or released archive content'; end if;
  if not public.luxor_control_mail_import(r,'retry_failed') then raise exception 'Failed archive cannot be retried after audit'; end if;
end;
$$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.luxor_mail_source_archive(uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','public.luxor_commit_mail_source_content(uuid,uuid,uuid,text,jsonb,text,boolean)','EXECUTE') then
    raise exception 'Private content audit exposed'; end if;
end;
$$;
select 'PASS source checksums, exact archive identity, verified-only matching, stale archive/lease guards, pause/resume, retry isolation, result categories and no archive mutation' as result;
rollback;
