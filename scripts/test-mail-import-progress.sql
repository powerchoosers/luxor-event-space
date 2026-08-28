-- Run as one transaction. Synthetic records are never visible to workers.
begin;
set local role service_role;
do $$
declare
  r uuid;
  i uuid;
  m uuid;
  token uuid := gen_random_uuid();
  f jsonb := '[{"id":"91001","name":"Inbox","path":"/Inbox","type":"Inbox"}]';
  page jsonb := '[{"id":"92001","folderId":"91001","threadId":"92001","isRead":true,"occurredAt":"2026-08-01T00:00:00Z","source":{}}]';
  c jsonb;
begin
  insert into public.luxor_mail_import_runs(account_id, mailbox, started_by, folders)
  values ('99001234567890001', 'history-qa@example.invalid', 'qa@example.invalid', f) returning id into r;
  if public.luxor_commit_mail_import_page(r, null, page) then raise exception 'Unclaimed page accepted'; end if;
  update public.luxor_mail_import_runs set lease_token = token, lease_until = now() + interval '5 minutes' where id = r;
  if public.luxor_commit_mail_import_page(r, gen_random_uuid(), page) then raise exception 'Wrong token accepted'; end if;
  -- A malformed page must roll back every item and cursor together.
  begin
    perform public.luxor_commit_mail_import_page(r, token,
      page || '[{"id":"92002","folderId":"wrong","threadId":"92002","isRead":true}]'::jsonb);
    raise exception 'Invalid page accepted';
  exception when raise_exception then
    if sqlerrm = 'Invalid page accepted' then raise; end if;
  end;
  if exists (select 1 from public.luxor_mail_import_items where run_id = r) then raise exception 'Partial page leaked'; end if;
  if not public.luxor_commit_mail_import_page(r, token, page) then raise exception 'Valid page rejected'; end if;
  if public.luxor_commit_mail_import_page(r, token, page) then raise exception 'Replayed page advanced cursor'; end if;
  if not exists (select 1 from public.luxor_mail_import_runs where id=r and stream='unread' and page_start=1 and phase='inventory') then
    raise exception 'Read stream did not advance'; end if;
  update public.luxor_mail_import_runs set lease_token = token, lease_until = now() - interval '1 second' where id = r;
  if public.luxor_commit_mail_import_page(r, token, '[]') then raise exception 'Expired lease accepted'; end if;
  update public.luxor_mail_import_runs set lease_until = now() + interval '5 minutes', status='paused' where id = r;
  if public.luxor_commit_mail_import_page(r, token, '[]') then raise exception 'Paused run advanced'; end if;
  update public.luxor_mail_import_runs set status='active' where id = r;
  -- Same message observed in another read-state stream is an explicit conflict,
  -- not a duplicate archive or silent replacement of the source snapshot.
  page := jsonb_set(page, '{0,isRead}', 'false');
  if not public.luxor_commit_mail_import_page(r, token, page) then raise exception 'Unread page rejected'; end if;
  c := public.luxor_mail_import_counts(r);
  if (c->>'total')::int <> 1 or (c->>'sourceConflicts')::int <> 1 then raise exception 'Deduplication or conflict tracking failed'; end if;
  if not exists (select 1 from public.luxor_mail_import_runs where id=r and phase='archive' and folder_index=1) then
    raise exception 'Inventory did not finish'; end if;
  select id into i from public.luxor_mail_import_items where run_id=r;
  insert into public.luxor_mail_messages(provider,provider_id,direction,thread_key,from_address,to_addresses,subject,metadata)
  values ('zoho','history-qa-transaction','incoming','history-qa','guest@example.invalid','{history-qa@example.invalid}',
    'Rollback-only history fixture','{"importComplete":true,"historyStaged":true}') returning id into m;
  update public.luxor_mail_import_runs set lease_token=token, lease_until=now()+interval '5 minutes' where id=r;
  if public.luxor_commit_mail_import_item(r,gen_random_uuid(),i,'verified',m,0,now(),null,now()) then raise exception 'Stale item worker accepted'; end if;
  if not public.luxor_commit_mail_import_item(r,token,i,'verified',m,0,now(),null,now()) then raise exception 'Item progress rejected'; end if;
  if public.luxor_commit_mail_import_item(r,token,i,'pending',m,0,now(),null,null) then raise exception 'Replayed worker regressed progress'; end if;
  if (public.luxor_mail_import_counts(r)->>'verified')::int <> 1 then raise exception 'Verification count incorrect'; end if;
  if public.luxor_compare_import_metadata(m,'{}','{}') then raise exception 'Stale metadata accepted'; end if;
  if not public.luxor_compare_import_metadata(m,'{"importComplete":true,"historyStaged":true}',
    '{"importComplete":true,"historyStaged":true,"archiveVerifiedAt":"2026-08-28T00:00:00Z"}') then raise exception 'Metadata CAS failed'; end if;
  -- Full pages retain the current stream and can advance beyond 1,000 rows.
  update public.luxor_mail_import_runs set phase='inventory', folder_index=0, stream='read', page_start=1001,
    lease_token=token, lease_until=now()+interval '5 minutes' where id=r;
  select jsonb_agg(jsonb_build_object('id',(93000+n)::text,'folderId','91001','threadId',(93000+n)::text,'isRead',true))
    into page from generate_series(1,100) n;
  if not public.luxor_commit_mail_import_page(r,token,page) then raise exception 'Full history page rejected'; end if;
  if not exists (select 1 from public.luxor_mail_import_runs where id=r and phase='inventory' and page_start=1101 and stream='read') then
    raise exception 'Full page cursor was capped or advanced to the next stream'; end if;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon','public.luxor_mail_import_runs','SELECT')
    or has_table_privilege('authenticated','public.luxor_mail_import_items','SELECT')
    or has_function_privilege('anon','public.luxor_commit_mail_import_page(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.luxor_compare_import_metadata(uuid,jsonb,jsonb)','EXECUTE') then
    raise exception 'Private import surface exposed';
  end if;
end;
$$;
select 'PASS atomic pages, exact IDs, deduplication, source conflicts, read/unread streams, stale/expired/paused leases, item fencing, manifest CAS and private access' as result;
rollback;
