begin;
-- These keys are emitted by the application in UTC ISO form. Invalid or
-- invalid or missing processing leases are blocked and reported for review.
create function public.luxor_manual_analysis_time_key(p_fields jsonb,p_key text)
returns text language plpgsql immutable parallel safe set search_path = public as $$
declare v text := p_fields->'manual_analysis'->>p_key; y integer; m integer; day_num integer; max_day integer;
begin
 if v is null or v !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then return ''; end if;
 y := substring(v,1,4)::integer; m := substring(v,6,2)::integer; day_num := substring(v,9,2)::integer;
 if m < 1 or m > 12 or substring(v,12,2)::integer > 23 or substring(v,15,2)::integer > 59 or substring(v,18,2)::integer > 59 then return ''; end if;
 max_day := case when m in (4,6,9,11) then 30 when m=2 then case when y%400=0 or (y%4=0 and y%100<>0) then 29 else 28 end else 31 end;
 if day_num < 1 or day_num > max_day then return ''; end if;
 return v;
end $$;
create function public.luxor_manual_analysis_queued_key(p_fields jsonb)
returns text language sql immutable parallel safe set search_path = public as $$
 select greatest(public.luxor_manual_analysis_time_key(p_fields,'next_attempt_at'), public.luxor_manual_analysis_time_key(p_fields,'queued_at'));
$$;
create index luxor_manual_analysis_queued_due_idx on public.luxor_bills
 (public.luxor_manual_analysis_queued_key(extracted_fields),updated_at,id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status'='queued';
create index luxor_manual_analysis_lease_due_idx on public.luxor_bills
 (public.luxor_manual_analysis_time_key(extracted_fields,'lease_until'),updated_at,id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status'='processing'
   and public.luxor_manual_analysis_time_key(extracted_fields,'lease_until') <> '';
-- Diagnostic indexes let health detect malformed timestamps and implausible
-- future queue times without reading the full pending queue on every run.
create function public.luxor_manual_analysis_malformed(p_fields jsonb)
returns boolean language sql immutable parallel safe set search_path = public as $$
 select exists (
  select 1 from unnest(case when p_fields->'manual_analysis'->>'status'='queued'
    then array['queued_at','next_attempt_at'] else array['started_at','lease_until'] end) k
  where p_fields->'manual_analysis'->>k is not null and public.luxor_manual_analysis_time_key(p_fields,k)=''
 ) or (p_fields->'manual_analysis'->>'status'='processing'
   and public.luxor_manual_analysis_time_key(p_fields,'lease_until')='');
$$;
create index luxor_manual_analysis_malformed_idx on public.luxor_bills(id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status' in ('queued','processing')
   and public.luxor_manual_analysis_malformed(extracted_fields);
create index luxor_manual_analysis_future_queue_idx on public.luxor_bills
 (public.luxor_manual_analysis_time_key(extracted_fields,'queued_at'),id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status'='queued';
create index luxor_manual_analysis_future_retry_idx on public.luxor_bills
 (public.luxor_manual_analysis_time_key(extracted_fields,'next_attempt_at'),id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status'='queued';
create index luxor_manual_analysis_future_lease_idx on public.luxor_bills
 (public.luxor_manual_analysis_time_key(extracted_fields,'lease_until'),id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status'='processing';
create function public.luxor_manual_analysis_queue_health() returns jsonb
language sql stable security definer set search_path = public as $$
 select jsonb_build_object('malformed', exists (
   select 1 from public.luxor_bills b where b.source_type='manual' and b.status <> 'paid'
    and b.extracted_fields->'manual_analysis'->>'status' in ('queued','processing')
    and public.luxor_manual_analysis_malformed(b.extracted_fields)),
  'future_queued', exists (
   select 1 from public.luxor_bills b where b.source_type='manual' and b.status <> 'paid'
    and b.extracted_fields->'manual_analysis'->>'status'='queued'
    and public.luxor_manual_analysis_time_key(b.extracted_fields,'queued_at') >
      to_char((now()+interval '5 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  'future_retry', exists (
   select 1 from public.luxor_bills b where b.source_type='manual' and b.status <> 'paid'
    and b.extracted_fields->'manual_analysis'->>'status'='queued'
    and public.luxor_manual_analysis_time_key(b.extracted_fields,'next_attempt_at') >
      to_char((now()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  'future_lease', exists (
   select 1 from public.luxor_bills b where b.source_type='manual' and b.status <> 'paid'
    and b.extracted_fields->'manual_analysis'->>'status'='processing'
    and public.luxor_manual_analysis_time_key(b.extracted_fields,'lease_until') >
      to_char((now()+interval '5 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
$$;
revoke all on function public.luxor_manual_analysis_queue_health() from public,anon,authenticated;
grant execute on function public.luxor_manual_analysis_queue_health() to service_role;
revoke all on function public.luxor_manual_analysis_malformed(jsonb) from public,anon,authenticated;
grant execute on function public.luxor_manual_analysis_malformed(jsonb) to service_role;

-- A durable scan position advances even if a later per-row deferral fails.
-- It never claims a bill; the application's separate compare-and-set still does.
create table public.luxor_manual_analysis_scan_cursor (
 singleton boolean primary key default true check(singleton), after_id uuid
);
insert into public.luxor_manual_analysis_scan_cursor(singleton,after_id) values (true,null);
alter table public.luxor_manual_analysis_scan_cursor enable row level security;
revoke all on public.luxor_manual_analysis_scan_cursor from public,anon,authenticated,service_role;
create index luxor_manual_analysis_pending_id_idx on public.luxor_bills(id)
 where source_type='manual' and status <> 'paid' and extracted_fields->'manual_analysis'->>'status' in ('queued','processing');

-- Scan at most 25 pending IDs, in ID order, per call. Concurrent calls serialize
-- only the short cursor update, not provider work. The cursor wraps at the end.
create function public.luxor_due_manual_bill_analyses(p_limit integer default 5)
returns table(id uuid,updated_at timestamptz) language plpgsql volatile security definer set search_path = public as $$
declare
 cursor_id uuid; last_id uuid; item record; scanned integer := 0; returned integer := 0;
 n integer := greatest(0,least(coalesce(p_limit,5),25));
 now_key text := to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 analysis_status text; lease_key text; eligible boolean;
begin
 if n=0 then return; end if;
 select c.after_id into cursor_id from public.luxor_manual_analysis_scan_cursor c where c.singleton for update;
 -- At the end, wrap without requiring an empty worker invocation.
 if cursor_id is not null and not exists (
   select 1 from public.luxor_bills b where b.source_type='manual' and b.status <> 'paid'
     and b.extracted_fields->'manual_analysis'->>'status' in ('queued','processing') and b.id > cursor_id
 ) then cursor_id := null; end if;
 for item in select b.id,b.updated_at,b.extracted_fields from public.luxor_bills b
   where b.source_type='manual' and b.status <> 'paid'
     and b.extracted_fields->'manual_analysis'->>'status' in ('queued','processing')
     and b.id >= coalesce(cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and (cursor_id is null or b.id > cursor_id)
   order by b.id limit 25
 loop
   scanned := scanned + 1; last_id := item.id;
   analysis_status := item.extracted_fields->'manual_analysis'->>'status';
   lease_key := public.luxor_manual_analysis_time_key(item.extracted_fields,'lease_until');
   eligible := case when analysis_status='queued' then not public.luxor_manual_analysis_malformed(item.extracted_fields) and public.luxor_manual_analysis_queued_key(item.extracted_fields) <= now_key
     else lease_key <> '' and lease_key <= now_key end;
   if eligible then id := item.id; updated_at := item.updated_at; returned := returned + 1; return next; end if;
   if returned >= n then exit; end if;
 end loop;
 if scanned > 0 then update public.luxor_manual_analysis_scan_cursor c set after_id=last_id where c.singleton; end if;
 return;
end $$;
-- Quarantine a row only if its version is unchanged since selection. A newer
-- owner edit or another worker's claim wins. Failures back off and then become
-- visible terminal failures; a user-initiated retry resets the recovery state.
create function public.luxor_record_manual_analysis_recovery_error(p_bill_id uuid,p_expected_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare b public.luxor_bills%rowtype; a jsonb; failures integer; at_time timestamptz := clock_timestamp(); key_now text; key_next text;
begin
 select * into b from public.luxor_bills where id=p_bill_id and updated_at=p_expected_updated_at
   and source_type='manual' and status <> 'paid'
   and extracted_fields->'manual_analysis'->>'status' in ('queued','processing') for update;
 if not found then return false; end if;
 a := b.extracted_fields->'manual_analysis';
 key_now := to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 if a->>'status'='queued' and (public.luxor_manual_analysis_malformed(b.extracted_fields) or public.luxor_manual_analysis_queued_key(b.extracted_fields) > key_now) then return false; end if;
 if a->>'status'='processing' and (
   public.luxor_manual_analysis_time_key(b.extracted_fields,'lease_until') = ''
   or public.luxor_manual_analysis_time_key(b.extracted_fields,'lease_until') > key_now
 ) then return false; end if;
 failures := case when jsonb_typeof(a->'recovery_errors')='number' and coalesce(a->>'recovery_errors','') ~ '^[0-9]{1,2}$'
   then least((a->>'recovery_errors')::integer,3) else 0 end + 1;
 key_now := to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 key_next := to_char((at_time + case when failures=1 then interval '1 minute' else interval '2 minutes' end) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 if failures >= 3 then
   a := (a - 'claim_token' - 'lease_until' - 'next_attempt_at') || jsonb_build_object('status','failed','recovery_errors',failures,'message','Analysis recovery could not finish. Retry when ready.','completed_at',key_now);
 else
   a := (a - 'claim_token' - 'lease_until') || jsonb_build_object('status','queued','recovery_errors',failures,'queued_at',key_now,'next_attempt_at',key_next);
 end if;
 update public.luxor_bills set extracted_fields=jsonb_set(coalesce(b.extracted_fields,'{}'::jsonb),'{manual_analysis}',a,true),
   updated_at=greatest(at_time,b.updated_at + interval '1 microsecond') where id=b.id;
 return true;
end $$;
revoke all on function public.luxor_record_manual_analysis_recovery_error(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.luxor_record_manual_analysis_recovery_error(uuid,timestamptz) to service_role;

revoke all on function public.luxor_due_manual_bill_analyses(integer) from public,anon,authenticated;
grant execute on function public.luxor_due_manual_bill_analyses(integer) to service_role;
revoke all on function public.luxor_manual_analysis_time_key(jsonb,text) from public,anon,authenticated;
grant execute on function public.luxor_manual_analysis_time_key(jsonb,text) to service_role;
revoke all on function public.luxor_manual_analysis_queued_key(jsonb) from public,anon,authenticated;
grant execute on function public.luxor_manual_analysis_queued_key(jsonb) to service_role;
-- Cutover gate: after this transaction commits, the deployed legacy writer
-- cannot enter a new lease-less processing state. Existing in-flight legacy
-- rows are left untouched so the original writer can finish; unknown leases
-- are never assumed expired and require separate investigated recovery.
create function public.luxor_gate_manual_analysis_lease() returns trigger
language plpgsql set search_path = public as $$
begin
 if new.source_type='manual' and new.extracted_fields->'manual_analysis'->>'status'='processing'
    and public.luxor_manual_analysis_time_key(new.extracted_fields,'lease_until')='' then
   -- Skip a truly unchanged row instead of returning it: callers cannot treat
   -- this no-op as a successful claim, and no stale values are written.
   if tg_op='UPDATE' then
     if to_jsonb(new) = to_jsonb(old) then return null; end if;
   end if;
   raise exception 'Manual analysis requires a valid processing lease.' using errcode='55000';
 end if;
 return new;
end $$;
create trigger luxor_manual_analysis_lease_gate before insert or update of extracted_fields,source_type on public.luxor_bills
 for each row execute function public.luxor_gate_manual_analysis_lease();
revoke all on function public.luxor_gate_manual_analysis_lease() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
