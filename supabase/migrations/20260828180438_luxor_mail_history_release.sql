set local lock_timeout='5s';

-- A release exposes a reviewed archive snapshot. It does not switch providers,
-- certify a live-mailbox cutover, or modify anything at Zoho.
create table public.luxor_mail_history_releases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luxor_mail_import_runs(id),
  pass_id uuid not null unique references public.luxor_mail_source_passes(id),
  reviewed_by text not null check(length(btrim(reviewed_by)) between 1 and 254),
  message_count bigint not null check(message_count>=0),
  retained_count bigint not null check(retained_count>=0 and retained_count<=message_count),
  folders jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index luxor_mail_history_releases_run_idx on public.luxor_mail_history_releases(run_id,created_at desc);
create table public.luxor_mail_history_release_items (
  release_id uuid not null references public.luxor_mail_history_releases(id),
  source_message_id text not null,
  local_message_id uuid not null references public.luxor_mail_messages(id),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  folder jsonb not null,
  source_is_read boolean not null,
  missing_from_source boolean not null,
  primary key(release_id,source_message_id)
);
create index luxor_mail_history_release_message_idx on public.luxor_mail_history_release_items(local_message_id);
alter table public.luxor_mail_history_releases enable row level security;
alter table public.luxor_mail_history_release_items enable row level security;
revoke all on public.luxor_mail_history_releases,public.luxor_mail_history_release_items from public,anon,authenticated,service_role;
grant select,insert on public.luxor_mail_history_releases,public.luxor_mail_history_release_items to service_role;

create function public.luxor_mail_history_release_review(p_run_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r public.luxor_mail_import_runs; p public.luxor_mail_source_passes;
  reasons text[]:='{}'; total bigint; retained bigint; receipt public.luxor_mail_history_releases;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id;
  if not found then return null; end if;
  select * into p from public.luxor_mail_source_passes where run_id=r.id order by generation desc limit 1;
  if r.status<>'review' or r.phase<>'reconcile' or r.lease_until>now() then
    reasons:=array_append(reasons,'Finish or pause active import work before release.'); end if;
  if p.id is null or p.generation<2 or p.status<>'complete' or p.content_status<>'complete'
    or p.report->>'matchesPrevious' is distinct from 'true' then
    reasons:=array_append(reasons,'Complete two matching source inventories and their content check.'); end if;
  select count(*),count(*) filter(where o.source_message_id is null) into total,retained
    from public.luxor_mail_import_items i left join public.luxor_mail_source_observations o
      on o.pass_id=p.id and o.source_message_id=i.source_message_id where i.run_id=r.id;
  if exists(select 1 from public.luxor_mail_import_items i left join public.luxor_mail_messages m on m.id=i.local_message_id
    where i.run_id=r.id and (i.status<>'verified' or i.verified_at is null or m.id is null
      or m.provider<>'zoho' or m.status='importing' or m.metadata->>'importComplete' is distinct from 'true'
      or m.metadata->>'source' is distinct from 'zoho-history-import'
      or m.metadata->>'zohoAccountId' is distinct from r.account_id
      or m.metadata->>'zohoMessageId' is distinct from i.source_message_id
      or m.metadata->>'archiveVerifiedAt' is null
      or m.payload_hash is null or m.payload_hash is distinct from m.metadata->>'originalSha256'
      or public.luxor_mail_source_archive(p.id,i.source_message_id) is distinct from jsonb_build_object('id',m.id,'sha256',m.payload_hash))) then
    reasons:=array_append(reasons,'Every inventoried message needs its complete, verified original archive.'); end if;
  if exists(select 1 from public.luxor_mail_source_observations o
    left join public.luxor_mail_import_items i on i.run_id=r.id and i.source_message_id=o.source_message_id
    left join public.luxor_mail_messages m on m.id=i.local_message_id
    where o.pass_id=p.id and (o.repeated or i.id is null or m.id is null
      or o.check_status not in ('matching','different')
      or o.source_sha256 is distinct from m.payload_hash
      or (o.check_status='matching' and o.archived_message_id is distinct from m.id)
      or (o.check_status='different' and (o.replacement_message_id is distinct from m.id or o.replacement_verified_at is null))
      or not (p.folders @> jsonb_build_array(o.folder))
      or o.message->>'folderId' is distinct from o.folder->>'id'
      or jsonb_typeof(o.message->'isRead') is distinct from 'boolean'
      or coalesce(o.message->>'threadId','') !~ '^[0-9]+$')) then
    reasons:=array_append(reasons,'Resolve source repeats, content changes, and folder conflicts before release.'); end if;
  select * into receipt from public.luxor_mail_history_releases where pass_id=p.id;
  return jsonb_build_object('passId',p.id,'generation',p.generation,'snapshotAt',p.completed_at,
    'contentCheckedAt',p.content_completed_at,'messageCount',total,'retainedCount',retained,
    'ready',cardinality(reasons)=0,'blockers',to_jsonb(reasons),'releasedAt',receipt.created_at);
end;
$$;

create function public.luxor_release_mail_history(p_run_id uuid,p_pass_id uuid,p_reviewed_by text,p_retain_missing boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.luxor_mail_import_runs; p public.luxor_mail_source_passes; receipt public.luxor_mail_history_releases;
  review jsonb; item record; message public.luxor_mail_messages; previous_read timestamptz;
  previous_count integer; selected_read timestamptz; chosen_folder jsonb; chosen_message jsonb;
  stamp timestamptz:=clock_timestamp(); missing boolean;
begin
  if coalesce(length(btrim(p_reviewed_by)),0) not between 1 and 254 then raise exception 'Invalid reviewer'; end if;
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found then raise exception 'Import run not found'; end if;
  select * into receipt from public.luxor_mail_history_releases where run_id=r.id and pass_id=p_pass_id;
  if found then return to_jsonb(receipt); end if; -- Never reset read state on retry.
  select * into p from public.luxor_mail_source_passes where id=p_pass_id and run_id=r.id for update;
  if not found then raise exception 'Source snapshot not found'; end if;
  -- Serialize with owner read-state writes and any archive verification changes.
  perform m.id from public.luxor_mail_messages m where m.provider='zoho'
    and m.metadata->>'zohoAccountId'=r.account_id and exists(select 1 from public.luxor_mail_import_items i
      where i.run_id=r.id and i.source_message_id=m.metadata->>'zohoMessageId') order by m.id for update;
  review:=public.luxor_mail_history_release_review(r.id);
  if review->>'ready' is distinct from 'true' or review->>'passId' is distinct from p_pass_id::text then
    raise exception 'History changed or still needs reconciliation'; end if;
  if (review->>'retainedCount')::bigint>0 and p_retain_missing is distinct from true then
    raise exception 'Confirm retaining archived messages no longer found in Zoho'; end if;
  insert into public.luxor_mail_history_releases(run_id,pass_id,reviewed_by,message_count,retained_count,folders)
    values(r.id,p.id,p_reviewed_by,(review->>'messageCount')::bigint,(review->>'retainedCount')::bigint,p.folders)
    returning * into receipt;
  for item in select i.*,o.source_message_id as observed_id,o.folder as current_folder,o.message as current_message
    from public.luxor_mail_import_items i left join public.luxor_mail_source_observations o
      on o.pass_id=p.id and o.source_message_id=i.source_message_id where i.run_id=r.id order by i.id loop
    select * into message from public.luxor_mail_messages where id=item.local_message_id;
    missing:=item.observed_id is null;
    chosen_folder:=case when missing then item.folder else item.current_folder end;
    chosen_message:=case when missing then item.message else item.current_message end;
    select count(*),max(read_at) into previous_count,previous_read from public.luxor_mail_messages m
      where m.provider='zoho' and m.metadata->>'zohoAccountId'=r.account_id
        and m.metadata->>'zohoMessageId'=item.source_message_id
        and m.metadata->>'importComplete'='true' and m.status<>'importing'
        and coalesce(m.metadata->>'historyStaged','false')='false'
        and coalesce(m.metadata->>'historySuperseded','false')='false';
    if previous_count>1 then raise exception 'Multiple visible copies require review before release'; end if;
    selected_read:=case when previous_count=1 then previous_read
      when chosen_message->>'isRead'='true' then stamp else null end;
    -- Keep verified prior versions reachable by their exact IDs without showing
    -- duplicate messages in folder lists or legacy-ID lookups. Never touch MIME.
    update public.luxor_mail_messages m set metadata=m.metadata || jsonb_build_object(
      'historyStaged',false,'historySuperseded',true,'historySupersededBy',message.id)
      where m.provider='zoho' and m.metadata->>'source'='zoho-history-import'
        and m.metadata->>'zohoAccountId'=r.account_id and m.metadata->>'zohoMessageId'=item.source_message_id
        and m.metadata->>'importComplete'='true' and m.metadata->>'archiveVerifiedAt' is not null
        and m.status<>'importing' and m.payload_hash=m.metadata->>'originalSha256';
    update public.luxor_mail_messages set read_at=selected_read,
      thread_key='mail-zoho-'||r.account_id||'-'||(chosen_message->>'threadId'),
      metadata=metadata || jsonb_build_object('historyStaged',false,'historySuperseded',false,'historySupersededBy',null,
        'historyMissingFromSource',missing,'historyReleaseId',receipt.id,'historyReleasedAt',stamp,
        'zohoFolder',chosen_folder,'zohoThreadId',chosen_message->>'threadId','importedReadState',(chosen_message->>'isRead')::boolean)
      where id=message.id;
    insert into public.luxor_mail_history_release_items(release_id,source_message_id,local_message_id,sha256,folder,source_is_read,missing_from_source)
      values(receipt.id,item.source_message_id,message.id,message.payload_hash,chosen_folder,(chosen_message->>'isRead')::boolean,missing);
  end loop;
  return to_jsonb(receipt);
end;
$$;
revoke all on function public.luxor_mail_history_release_review(uuid),public.luxor_release_mail_history(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.luxor_mail_history_release_review(uuid),public.luxor_release_mail_history(uuid,uuid,text,boolean) to service_role;

-- Each account's latest reviewed folder snapshot includes empty folders.
create function public.luxor_mail_released_folders()
returns table(account_id text,folders jsonb) language sql stable security invoker set search_path='' as $$
  select distinct on (r.account_id) r.account_id,h.folders
  from public.luxor_mail_history_releases h join public.luxor_mail_import_runs r on r.id=h.run_id
  order by r.account_id,h.created_at desc,h.id desc;
$$;
revoke all on function public.luxor_mail_released_folders() from public,anon,authenticated;
grant execute on function public.luxor_mail_released_folders() to service_role;

-- A reviewed release is a valid baseline for a later delta archive. A row
-- merely marked visible, without a release receipt, is still rejected.
create or replace function public.luxor_archive_mail_source_changes(p_run_id uuid,p_pass_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; expected bigint; eligible bigint;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or r.status<>'review' or r.phase<>'reconcile' or r.lease_until>clock_timestamp() then return false; end if;
  if not exists(select 1 from public.luxor_mail_source_passes where id=p_pass_id and run_id=r.id
    and status='complete' and content_status='complete'
    and generation=(select max(generation) from public.luxor_mail_source_passes where run_id=r.id)) then return false; end if;
  if exists(select 1 from public.luxor_mail_import_items where run_id=r.id and status in ('pending','verifying')) then return false; end if;
  select count(*) into expected from public.luxor_mail_source_observations
    where pass_id=p_pass_id and check_status='different' and replacement_message_id is null;
  if expected=0 then return false; end if;
  select count(*) into eligible from public.luxor_mail_source_observations o
    join public.luxor_mail_import_items i on i.run_id=r.id and i.source_message_id=o.source_message_id
    join public.luxor_mail_messages m on m.id=o.archived_message_id
    where o.pass_id=p_pass_id and o.check_status='different' and o.replacement_message_id is null
      and not o.repeated and ((i.status='verified' and i.local_message_id=o.archived_message_id)
        or (i.status='failed' and i.target_pass_id is not null and i.target_pass_id<>p_pass_id))
      and (m.metadata->>'historyStaged'='true' or exists(
        select 1 from public.luxor_mail_history_release_items ri
        join public.luxor_mail_history_releases hr on hr.id=ri.release_id
        where hr.run_id=r.id and ri.local_message_id=m.id
          and ri.source_message_id=o.source_message_id and ri.sha256=m.payload_hash))
      and public.luxor_mail_source_archive(p_pass_id,o.source_message_id)=jsonb_build_object('id',o.archived_message_id,'sha256',o.archived_sha256);
  if eligible<>expected then return false; end if;
  update public.luxor_mail_import_items i set target_pass_id=p_pass_id,target_sha256=o.source_sha256,
    status='pending',local_message_id=null,verified_at=null,failures=0,last_error=null,
    next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  from public.luxor_mail_source_observations o
  where i.run_id=r.id and i.source_message_id=o.source_message_id and o.pass_id=p_pass_id
    and o.check_status='different' and o.replacement_message_id is null;
  update public.luxor_mail_import_runs set status='active',phase='archive',lease_token=null,lease_until=null,
    failures=0,last_error=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;
