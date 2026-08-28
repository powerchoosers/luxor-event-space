-- Source comparisons are immutable evidence. A changed original gets a new
-- private mailbox row; neither its earlier MIME nor its audit is overwritten.
alter table public.luxor_mail_import_items
  add column target_pass_id uuid references public.luxor_mail_source_passes(id),
  add column target_sha256 text,
  add constraint luxor_mail_import_version_target check (
    (target_pass_id is null and target_sha256 is null) or
    (target_pass_id is not null and target_sha256 is not null and target_sha256 ~ '^[0-9a-f]{64}$'));
alter table public.luxor_mail_source_observations
  add column replacement_message_id uuid references public.luxor_mail_messages(id),
  add column replacement_verified_at timestamptz,
  add constraint luxor_mail_source_replacement check (
    (replacement_message_id is null and replacement_verified_at is null) or
    (check_status='different' and replacement_message_id is not null and replacement_verified_at is not null
      and replacement_message_id<>archived_message_id));
create index luxor_mail_import_target_pass_idx on public.luxor_mail_import_items(target_pass_id);
create index luxor_mail_source_replacement_idx on public.luxor_mail_source_observations(replacement_message_id);

create function public.luxor_archive_mail_source_changes(p_run_id uuid,p_pass_id uuid)
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
      and m.metadata->>'historyStaged'='true'
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

create or replace function public.luxor_commit_mail_import_item(p_run_id uuid,p_token uuid,p_item_id uuid,
  p_status text,p_local_id uuid,p_failures integer,p_next_attempt timestamptz,p_error text,p_verified_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; i public.luxor_mail_import_items;
  o public.luxor_mail_source_observations; m public.luxor_mail_messages;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or p_token is null or r.lease_until is null or r.status<>'active' or r.phase<>'archive'
    or r.lease_token is distinct from p_token or r.lease_until<=clock_timestamp() then return false; end if;
  select * into i from public.luxor_mail_import_items where id=p_item_id and run_id=r.id and status in ('pending','verifying') for update;
  if not found then return false; end if;
  if i.target_pass_id is not null then
    select * into o from public.luxor_mail_source_observations where pass_id=i.target_pass_id
      and source_message_id=i.source_message_id and check_status='different' and source_sha256=i.target_sha256
      and replacement_message_id is null for update;
    if not found then return false; end if;
    if p_local_id is not null then
      select * into m from public.luxor_mail_messages where id=p_local_id for update;
      if not found or m.provider<>'zoho' or m.provider_id is distinct from r.account_id||':'||i.source_message_id||':revision:'||i.target_pass_id
        or m.payload_hash is distinct from i.target_sha256 or m.metadata->>'originalSha256' is distinct from i.target_sha256
        or m.metadata->>'source' is distinct from 'zoho-history-import'
        or m.metadata->>'zohoAccountId' is distinct from r.account_id or m.metadata->>'zohoMessageId' is distinct from i.source_message_id
        or m.metadata->>'sourceRevisionPassId' is distinct from i.target_pass_id::text
        or m.metadata->>'historyStaged' is distinct from 'true' or m.metadata->'zohoFolder' is distinct from o.folder
        then return false; end if;
    end if;
    if p_status in ('verifying','verified') and (p_local_id is null or m.metadata->>'importComplete' is distinct from 'true' or m.status='importing') then return false; end if;
    if p_status='verified' then
      if p_verified_at is null or m.metadata->>'archiveVerifiedAt' is null
        or (m.metadata->>'archiveVerifiedAt')::timestamptz<>p_verified_at then return false; end if;
      update public.luxor_mail_source_observations set replacement_message_id=p_local_id,replacement_verified_at=p_verified_at
        where pass_id=i.target_pass_id and source_message_id=i.source_message_id;
    end if;
  end if;
  update public.luxor_mail_import_items set status=p_status,local_message_id=p_local_id,
    failures=p_failures,next_attempt_at=p_next_attempt,last_error=p_error,verified_at=p_verified_at,updated_at=clock_timestamp() where id=i.id;
  update public.luxor_mail_import_runs set lease_token=null,lease_until=null,failures=0,last_error=null,
    next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create or replace function public.luxor_mail_source_archive(p_pass_id uuid,p_message_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((select jsonb_build_object('id',m.id,'sha256',m.metadata->>'originalSha256')
    from public.luxor_mail_source_passes p join public.luxor_mail_import_runs r on r.id=p.run_id
    join public.luxor_mail_import_items i on i.run_id=r.id and i.source_message_id=p_message_id
    left join public.luxor_mail_source_observations previous on previous.pass_id=i.target_pass_id and previous.source_message_id=i.source_message_id
    join public.luxor_mail_messages m on m.id=case when i.status='verified' then i.local_message_id else previous.archived_message_id end
    where p.id=p_pass_id and ((i.status='verified' and i.verified_at is not null)
      or (i.status='failed' and i.target_pass_id is not null and previous.check_status='different' and previous.archived_sha256=m.payload_hash))
      and m.provider='zoho' and m.status<>'importing'
      and (m.provider_id=r.account_id||':'||p_message_id or
        (m.provider_id=r.account_id||':'||p_message_id||':revision:'||(m.metadata->>'sourceRevisionPassId') and
          exists(select 1 from public.luxor_mail_source_observations v join public.luxor_mail_source_passes vp on vp.id=v.pass_id
            where vp.run_id=r.id and v.source_message_id=p_message_id and v.replacement_message_id=m.id
              and v.source_sha256=m.payload_hash and v.replacement_verified_at is not null)))
      and m.metadata->>'importComplete'='true' and m.metadata->>'source'='zoho-history-import'
      and m.metadata->>'zohoAccountId'=r.account_id and m.metadata->>'zohoMessageId'=p_message_id
      and m.metadata->>'archiveVerifiedAt' is not null and m.metadata->>'originalSha256' ~ '^[0-9a-f]{64}$'
      and m.payload_hash=m.metadata->>'originalSha256'),'{"id":null,"sha256":null}'::jsonb);
$$;

create or replace function public.luxor_mail_source_content_counts(p_pass_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total',count(*),'pending',count(*) filter(where check_status='pending'),
    'matching',count(*) filter(where check_status='matching'),'different',count(*) filter(where check_status='different'),
    'versioned',count(*) filter(where replacement_message_id is not null and replacement_verified_at is not null),
    'unarchived',count(*) filter(where check_status='unarchived'),'unavailable',count(*) filter(where check_status='unavailable'),
    'nextAttemptAt',min(check_next_attempt_at) filter(where check_status='pending'))
  from public.luxor_mail_source_observations where pass_id=p_pass_id;
$$;
revoke all on function public.luxor_archive_mail_source_changes(uuid,uuid) from public,anon,authenticated;
grant execute on function public.luxor_archive_mail_source_changes(uuid,uuid) to service_role;
