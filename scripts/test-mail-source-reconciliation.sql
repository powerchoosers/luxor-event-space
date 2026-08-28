-- Synthetic source only. Run this entire transaction, including rollback.
begin;
set local role service_role;
do $$
declare
  r uuid; s uuid; t uuid := gen_random_uuid(); p jsonb; c jsonb; cursor_row record; n integer;
  folders jsonb := '[{"id":"91001","name":"Inbox","path":"/Inbox","type":"Inbox"},{"id":"91002","name":"Clients","path":"/Clients","type":"Inbox"}]';
  one jsonb := '{"id":"92001","folderId":"91001","threadId":"92001","isRead":true,"source":{"subject":"Original"}}';
  moved jsonb := '{"id":"92002","folderId":"91002","threadId":"92002","isRead":true,"source":{"subject":"Moved"}}';
  added jsonb := '{"id":"92004","folderId":"91001","threadId":"92004","isRead":false,"source":{"subject":"Arrived later"}}';
begin
  insert into public.luxor_mail_import_runs(account_id,mailbox,started_by,folders,status,phase)
    values ('99001234567890002','source-qa@example.invalid','qa@example.invalid',folders,'review','reconcile') returning id into r;
  insert into public.luxor_mail_import_items(run_id,source_message_id,folder,message,status)
    values (r,'92001',folders->0,one,'failed'),
      (r,'92002',folders->0,jsonb_set(moved,'{folderId}','"91001"'),'failed'),
      (r,'92003',folders->0,'{"id":"92003"}','failed');
  if public.luxor_start_mail_source_pass(r,null,folders) then raise exception 'Null generation accepted'; end if;
  begin
    perform public.luxor_start_mail_source_pass(r,0,folders || jsonb_build_array(folders->0));
    raise exception 'Duplicate folders accepted';
  exception when raise_exception then
    if sqlerrm='Duplicate folders accepted' then raise; end if;
  end;
  if exists(select 1 from public.luxor_mail_source_passes where run_id=r) then raise exception 'Invalid start leaked'; end if;
  if not public.luxor_start_mail_source_pass(r,0,folders) then raise exception 'Start rejected'; end if;
  if public.luxor_start_mail_source_pass(r,0,folders) then raise exception 'Duplicate start accepted'; end if;
  select id into s from public.luxor_mail_source_passes where run_id=r and generation=1;
  if public.luxor_commit_mail_source_page(r,null,s,jsonb_build_array(one)) then raise exception 'Null lease accepted'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if public.luxor_finish_mail_source_pass(r,t,s,folders) then raise exception 'Incomplete scan finalized'; end if;
  if public.luxor_commit_mail_source_page(r,gen_random_uuid(),s,'[]') then raise exception 'Wrong lease accepted'; end if;
  if public.luxor_commit_mail_source_page(r,t,gen_random_uuid(),'[]') then raise exception 'Wrong pass accepted'; end if;
  begin
    perform public.luxor_commit_mail_source_page(r,t,s,jsonb_build_array(one,'{"id":"broken"}'::jsonb));
    raise exception 'Invalid page accepted';
  exception when raise_exception then
    if sqlerrm='Invalid page accepted' then raise; end if;
  end;
  if exists(select 1 from public.luxor_mail_source_observations where pass_id=s) then raise exception 'Partial page leaked'; end if;
  if not public.luxor_control_mail_import(r,'pause') then raise exception 'Pause rejected'; end if;
  if public.luxor_commit_mail_source_page(r,t,s,'[]') then raise exception 'Paused worker advanced'; end if;
  if public.luxor_control_mail_import(r,'resume') then raise exception 'Resume overlapped live lease'; end if;
  if public.luxor_control_mail_import(r,'retry_failed') then raise exception 'Retry overlapped live lease'; end if;
  update public.luxor_mail_import_runs set lease_until=now()-interval '1 second' where id=r;
  if not public.luxor_control_mail_import(r,'resume') then raise exception 'Source resume rejected'; end if;
  if public.luxor_control_mail_import(r,'retry_failed') then raise exception 'Retry reset active source pass'; end if;
  for n in 1..4 loop
    select folder_index,stream into cursor_row from public.luxor_mail_source_passes where id=s;
    p := case when cursor_row.folder_index=0 and cursor_row.stream='read' then jsonb_build_array(one)
      when cursor_row.folder_index=0 then jsonb_build_array(added)
      when cursor_row.stream='read' then jsonb_build_array(moved) else '[]'::jsonb end;
    update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
    if not public.luxor_commit_mail_source_page(r,t,s,p) then raise exception 'Source page rejected'; end if;
    if public.luxor_commit_mail_source_page(r,t,s,p) then raise exception 'Replayed page accepted'; end if;
  end loop;
  if not exists(select 1 from public.luxor_mail_import_items where run_id=r and source_message_id='92002' and message->>'folderId'='91001') then
    raise exception 'Source move overwrote archive evidence'; end if;
  if not exists(select 1 from public.luxor_mail_import_items where run_id=r and source_message_id='92004' and status='pending') then
    raise exception 'New arrival was not queued'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()-interval '1 second' where id=r;
  if public.luxor_finish_mail_source_pass(r,t,s,folders) then raise exception 'Expired finalizer accepted'; end if;
  update public.luxor_mail_import_runs set lease_until=now()+interval '5 minutes' where id=r;
  -- Source folder API ordering must not cause a false mismatch.
  if not public.luxor_finish_mail_source_pass(r,t,s,jsonb_build_array(folders->1,folders->0)) then raise exception 'Finalization rejected'; end if;
  if public.luxor_finish_mail_source_pass(r,t,s,folders) then raise exception 'Finalization replay accepted'; end if;
  select report into c from public.luxor_mail_source_passes where id=s;
  if c->>'observed'<>'3' or c->>'added'<>'1' or c->>'missing'<>'1' or c->>'moved'<>'1' or c->>'changed'<>'1'
    or c->>'matchesPrevious'<>'false' or c->>'foldersChangedDuringScan'<>'false' then raise exception 'Incorrect initial comparison: %',c; end if;
  if not exists(select 1 from public.luxor_mail_import_runs where id=r and status='active' and phase='archive') then
    raise exception 'New arrivals did not return to archive work'; end if;
  -- This fixture doesn't fetch mail. Isolate pending work as failed for later passes.
  update public.luxor_mail_import_items set status='failed' where run_id=r;
  update public.luxor_mail_import_runs set status='review',phase='reconcile' where id=r;
  if public.luxor_start_mail_source_pass(r,0,folders) then raise exception 'Stale generation accepted'; end if;
  if not public.luxor_start_mail_source_pass(r,1,folders) then raise exception 'Second start rejected'; end if;
  select id into s from public.luxor_mail_source_passes where run_id=r and generation=2;
  for n in 1..4 loop
    select folder_index,stream into cursor_row from public.luxor_mail_source_passes where id=s;
    p := case when cursor_row.folder_index=0 and cursor_row.stream='read' then jsonb_build_array(one)
      when cursor_row.folder_index=0 then jsonb_build_array(added)
      when cursor_row.stream='read' then jsonb_build_array(moved) else '[]'::jsonb end;
    update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
    if not public.luxor_commit_mail_source_page(r,t,s,p) then raise exception 'Second pass page rejected'; end if;
  end loop;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_finish_mail_source_pass(r,t,s,folders) then raise exception 'Second finalization rejected'; end if;
  select report into c from public.luxor_mail_source_passes where id=s;
  if c->>'matchesPrevious'<>'true' or c->>'comparedWith'<>'previous_pass' then raise exception 'Identical observations did not match'; end if;
  if public.luxor_control_mail_import(r,'resume') then raise exception 'Completed comparison resumed without new pass'; end if;
  -- A third scan crosses an offset page with the same ID twice, then observes a
  -- folder rename. Neither can be labeled stable, even with identical first data.
  if not public.luxor_start_mail_source_pass(r,2,folders) then raise exception 'Third start rejected'; end if;
  select id into s from public.luxor_mail_source_passes where run_id=r and generation=3;
  select jsonb_agg(jsonb_build_object('id',(92000+i)::text,'folderId','91001','threadId',(92000+i)::text,'isRead',true,'source','{}'::jsonb))
    into p from generate_series(1,100) i;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_commit_mail_source_page(r,t,s,p) then raise exception 'Full page rejected'; end if;
  if not exists(select 1 from public.luxor_mail_source_passes where id=s and page_start=101 and stream='read') then raise exception 'Full page cursor wrong'; end if;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_commit_mail_source_page(r,t,s,jsonb_build_array(p->0)) then raise exception 'Repeat page rejected'; end if;
  for n in 1..3 loop
    update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
    if not public.luxor_commit_mail_source_page(r,t,s,'[]') then raise exception 'Empty page rejected'; end if;
  end loop;
  update public.luxor_mail_import_runs set lease_token=t,lease_until=now()+interval '5 minutes' where id=r;
  if not public.luxor_finish_mail_source_pass(r,t,s,jsonb_set(folders,'{1,name}','"Renamed"')) then raise exception 'Changed folder finalization rejected'; end if;
  select report into c from public.luxor_mail_source_passes where id=s;
  if c->>'repeated'<>'1' or c->>'foldersChangedDuringScan'<>'true' or c->>'matchesPrevious'<>'false' then
    raise exception 'Unstable source marked stable: %',c; end if;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon','public.luxor_mail_source_passes','SELECT')
    or has_table_privilege('authenticated','public.luxor_mail_source_observations','SELECT')
    or has_function_privilege('anon','public.luxor_start_mail_source_pass(uuid,integer,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.luxor_control_mail_import(uuid,text)','EXECUTE') then
    raise exception 'Private source comparison exposed'; end if;
end;
$$;
select 'PASS source generations, exact IDs, changes, arrivals, missing/moved records, folder drift, duplicates, leases, atomic controls and private privileges' as result;
rollback;
