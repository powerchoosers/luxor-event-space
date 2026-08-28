-- Compare current Zoho MIME with a previously read-back-verified archive.
-- Results are evidence at a point in time, not an automatic cutover approval.
alter table public.luxor_mail_source_passes
  add column content_status text not null default 'not_started' check (content_status in ('not_started','checking','complete')),
  add column content_started_at timestamptz,
  add column content_completed_at timestamptz;
alter table public.luxor_mail_source_observations
  add column check_status text not null default 'pending' check (check_status in ('pending','matching','different','unarchived','unavailable')),
  add column check_failures integer not null default 0 check (check_failures between 0 and 5),
  add column check_next_attempt_at timestamptz not null default now(),
  add column checked_at timestamptz,
  add column source_sha256 text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  add column archived_sha256 text check (archived_sha256 ~ '^[0-9a-f]{64}$'),
  add column archived_message_id uuid references public.luxor_mail_messages(id),
  add constraint luxor_mail_source_check_result check (
    (check_status='pending' and checked_at is null)
    or (check_status in ('unarchived','unavailable') and checked_at is not null)
    or (check_status='matching' and checked_at is not null and archived_message_id is not null
      and source_sha256 is not null and archived_sha256 is not null and source_sha256=archived_sha256)
    or (check_status='different' and checked_at is not null and archived_message_id is not null
      and source_sha256 is not null and archived_sha256 is not null and source_sha256<>archived_sha256)
  );
create index luxor_mail_source_check_work_idx on public.luxor_mail_source_observations(pass_id,check_status,check_next_attempt_at,source_message_id);
create index luxor_mail_source_archive_idx on public.luxor_mail_source_observations(archived_message_id);

-- An arbitrary linked local message is not sufficient. Pin the archive to the
-- exact configured Zoho account/message and require both verification ledgers.
create function public.luxor_mail_source_archive(p_pass_id uuid,p_message_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('id',m.id,'sha256',m.metadata->>'originalSha256')
    from public.luxor_mail_source_passes p join public.luxor_mail_import_runs r on r.id=p.run_id
    join public.luxor_mail_import_items i on i.run_id=r.id and i.source_message_id=p_message_id
    join public.luxor_mail_messages m on m.id=i.local_message_id
    where p.id=p_pass_id and i.status='verified' and i.verified_at is not null
      and m.provider='zoho' and m.provider_id=r.account_id||':'||p_message_id and m.status<>'importing'
      and m.metadata->>'importComplete'='true' and m.metadata->>'source'='zoho-history-import'
      and m.metadata->>'zohoAccountId'=r.account_id and m.metadata->>'zohoMessageId'=p_message_id
      and m.metadata->>'archiveVerifiedAt' is not null and m.metadata->>'originalSha256' ~ '^[0-9a-f]{64}$'
      and m.payload_hash=m.metadata->>'originalSha256'
  ),'{"id":null,"sha256":null}'::jsonb);
$$;

create function public.luxor_start_mail_source_content(p_run_id uuid,p_pass_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or r.status<>'review' or r.phase<>'reconcile' or r.lease_until>clock_timestamp() then return false; end if;
  if exists(select 1 from public.luxor_mail_import_items where run_id=r.id and status in ('pending','verifying')) then return false; end if;
  update public.luxor_mail_source_passes set content_status='checking',content_started_at=clock_timestamp()
  where id=p_pass_id and run_id=r.id and status='complete' and content_status='not_started'
    and generation=(select max(generation) from public.luxor_mail_source_passes where run_id=r.id);
  if not found then return false; end if;
  update public.luxor_mail_import_runs set status='active',lease_token=null,lease_until=null,failures=0,
    last_error=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create function public.luxor_next_mail_source_content(p_pass_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('sourceMessageId',o.source_message_id,'archive',public.luxor_mail_source_archive(o.pass_id,o.source_message_id))
  from public.luxor_mail_source_observations o join public.luxor_mail_source_passes p on p.id=o.pass_id
  join public.luxor_mail_import_runs r on r.id=p.run_id
  where p.id=p_pass_id and p.status='complete' and p.content_status='checking' and r.status='active' and r.phase='reconcile'
    and o.check_status='pending' and o.check_next_attempt_at<=now()
  order by o.check_next_attempt_at,o.source_message_id limit 1;
$$;

create function public.luxor_commit_mail_source_content(p_run_id uuid,p_token uuid,p_pass_id uuid,p_message_id text,
  p_expected_archive jsonb,p_source_sha256 text,p_read_failed boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; o public.luxor_mail_source_observations; a jsonb; result text;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or p_token is null or r.status<>'active' or r.phase<>'reconcile' or r.lease_until is null
    or r.lease_until<=clock_timestamp() or r.lease_token is distinct from p_token then return false; end if;
  if not exists(select 1 from public.luxor_mail_source_passes where id=p_pass_id and run_id=r.id and status='complete' and content_status='checking') then return false; end if;
  select * into o from public.luxor_mail_source_observations where pass_id=p_pass_id and source_message_id=p_message_id and check_status='pending' for update;
  if not found or o.check_next_attempt_at>clock_timestamp() then return false; end if;
  a := public.luxor_mail_source_archive(p_pass_id,p_message_id);
  if a is distinct from p_expected_archive then return false; end if;
  if p_read_failed is null or (p_source_sha256 is not null and p_source_sha256 !~ '^[0-9a-f]{64}$')
    or (p_read_failed and p_source_sha256 is not null)
    or (not p_read_failed and a->>'sha256' is not null and p_source_sha256 is null) then raise exception 'Invalid source content result'; end if;
  result := case when p_read_failed then case when o.check_failures+1>=5 then 'unavailable' else 'pending' end
    when a->>'sha256' is null then 'unarchived'
    when a->>'sha256'=p_source_sha256 then 'matching' else 'different' end;
  update public.luxor_mail_source_observations set check_status=result,
    check_failures=case when p_read_failed then o.check_failures+1 else 0 end,
    check_next_attempt_at=case when result='pending' then clock_timestamp()+interval '1 minute'*least(30,power(2,o.check_failures)) else clock_timestamp() end,
    checked_at=case when result='pending' then null else clock_timestamp() end,
    source_sha256=p_source_sha256,archived_sha256=a->>'sha256',archived_message_id=(a->>'id')::uuid
  where pass_id=p_pass_id and source_message_id=p_message_id;
  update public.luxor_mail_import_runs set lease_token=null,lease_until=null,failures=0,last_error=null,
    next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create function public.luxor_mail_source_content_counts(p_pass_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total',count(*),'pending',count(*) filter(where check_status='pending'),
    'matching',count(*) filter(where check_status='matching'),'different',count(*) filter(where check_status='different'),
    'unarchived',count(*) filter(where check_status='unarchived'),'unavailable',count(*) filter(where check_status='unavailable'),
    'nextAttemptAt',min(check_next_attempt_at) filter(where check_status='pending'))
  from public.luxor_mail_source_observations where pass_id=p_pass_id;
$$;

create function public.luxor_finish_mail_source_content(p_run_id uuid,p_token uuid,p_pass_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found or p_token is null or r.status<>'active' or r.phase<>'reconcile' or r.lease_until is null
    or r.lease_until<=clock_timestamp() or r.lease_token is distinct from p_token then return false; end if;
  if exists(select 1 from public.luxor_mail_source_observations where pass_id=p_pass_id and check_status='pending') then return false; end if;
  update public.luxor_mail_source_passes set content_status='complete',content_completed_at=clock_timestamp()
    where id=p_pass_id and run_id=r.id and status='complete' and content_status='checking';
  if not found then return false; end if;
  update public.luxor_mail_import_runs set status='review',lease_token=null,lease_until=null,failures=0,last_error=null,
    next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;

create or replace function public.luxor_control_mail_import(p_run_id uuid,p_action text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.luxor_mail_import_runs; source_active boolean;
begin
  select * into r from public.luxor_mail_import_runs where id=p_run_id for update;
  if not found then return false; end if;
  if p_action='pause' then
    if r.status<>'active' then return false; end if;
    update public.luxor_mail_import_runs set status='paused',updated_at=clock_timestamp() where id=r.id;
    return true;
  end if;
  if p_action not in ('resume','retry_failed') or p_action is null or r.status='active' or r.lease_until>clock_timestamp() then return false; end if;
  select exists(select 1 from public.luxor_mail_source_passes where run_id=r.id and (status<>'complete' or content_status='checking')) into source_active;
  if p_action='resume' and r.phase='reconcile' and not source_active then return false; end if;
  if p_action='retry_failed' then
    if source_active then return false; end if;
    update public.luxor_mail_import_items set status='pending',failures=0,last_error=null,
      next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where run_id=r.id and status='failed';
    if not found then return false; end if;
  end if;
  update public.luxor_mail_import_runs set status='active',phase=case when p_action='retry_failed' then 'archive' else phase end,
    lease_token=null,lease_until=null,failures=0,last_error=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
  return true;
end;
$$;
revoke all on function public.luxor_mail_source_archive(uuid,text), public.luxor_start_mail_source_content(uuid,uuid),
  public.luxor_next_mail_source_content(uuid), public.luxor_commit_mail_source_content(uuid,uuid,uuid,text,jsonb,text,boolean),
  public.luxor_mail_source_content_counts(uuid), public.luxor_finish_mail_source_content(uuid,uuid,uuid),
  public.luxor_control_mail_import(uuid,text) from public,anon,authenticated;
grant execute on function public.luxor_mail_source_archive(uuid,text), public.luxor_start_mail_source_content(uuid,uuid),
  public.luxor_next_mail_source_content(uuid), public.luxor_commit_mail_source_content(uuid,uuid,uuid,text,jsonb,text,boolean),
  public.luxor_mail_source_content_counts(uuid), public.luxor_finish_mail_source_content(uuid,uuid,uuid),
  public.luxor_control_mail_import(uuid,text) to service_role;
