-- Shared funnel goals: scoped transactional migration authorized for dashboard release.
begin;
create function public.luxor_funnel_goals_valid(p_goals jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare metric text; row jsonb; cadence text; field text; item record; n numeric;
 metrics text[]:=array['newInquiries','toursScheduled','toursCompleted','proposalsSent','bookedEvents','revenue'];
begin
 if jsonb_typeof(p_goals) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_goals))<>6 then return false; end if;
 foreach metric in array metrics loop
  row:=p_goals->metric;
  if jsonb_typeof(row) is distinct from 'object' or (select count(*) from jsonb_object_keys(row))<>7 then return false; end if;
  foreach cadence in array array['daily','weekly','monthly','quarterly','annual'] loop
   if not row ? cadence then return false; end if;
   if row->cadence='null'::jsonb then continue; end if;
   if jsonb_typeof(row->cadence) is distinct from 'number' then return false; end if;
   n:=(row->>cadence)::numeric;
   if n<0 or n>1000000000000 or (metric<>'revenue' and trunc(n)<>n) or (metric='revenue' and round(n,2)<>n) then return false; end if;
  end loop;
  foreach field in array array['monthlyOverrides','quarterlyOverrides'] loop
   if jsonb_typeof(row->field) is distinct from 'object' or (select count(*) from jsonb_object_keys(row->field))>240 then return false; end if;
   for item in select key,value from jsonb_each(row->field) loop
    if (field='monthlyOverrides' and item.key !~ '^(19|[2-9][0-9])[0-9]{2}-(0[1-9]|1[0-2])$')
      or (field='quarterlyOverrides' and item.key !~ '^(19|[2-9][0-9])[0-9]{2}-Q[1-4]$')
      or jsonb_typeof(item.value) is distinct from 'number' then return false; end if;
    n:=item.value::text::numeric;
    if n<0 or n>1000000000000 or (metric<>'revenue' and trunc(n)<>n) or (metric='revenue' and round(n,2)<>n) then return false; end if;
   end loop;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.luxor_funnel_goals_valid(jsonb) from public,anon,authenticated;
create table public.luxor_funnel_goals(
 singleton boolean primary key default true check(singleton),goals jsonb not null check(public.luxor_funnel_goals_valid(goals)),
 revision bigint not null default 0 check(revision between 0 and 9007199254740991),updated_at timestamptz,updated_by text
);
create table public.luxor_funnel_goal_receipts(request_id uuid primary key,payload jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table public.luxor_funnel_goals enable row level security;
alter table public.luxor_funnel_goal_receipts enable row level security;
revoke all on public.luxor_funnel_goals,public.luxor_funnel_goal_receipts from public,anon,authenticated,service_role;
grant select on public.luxor_funnel_goals to service_role;
create function public.luxor_save_funnel_goals(p_request_id uuid,p_expected_revision bigint,p_goals jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_goals public.luxor_funnel_goals%rowtype; receipt public.luxor_funnel_goal_receipts%rowtype; input jsonb; result jsonb; blank jsonb; changed_at timestamptz;
begin
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991 or p_actor is null or not public.luxor_funnel_goals_valid(p_goals) then raise exception 'Invalid goals' using errcode='22023'; end if;
 perform 1 from public.luxor_portal_members where lower(email)=lower(btrim(p_actor)) and status='active' and (role='owner' or (permissions ? 'settings' and permissions ? 'leads')) for share;
 if not found then raise exception 'Settings and lead permissions required' using errcode='42501'; end if;
 input:=jsonb_build_object('goals',p_goals,'expectedRevision',p_expected_revision,'actor',lower(btrim(p_actor)));
 select jsonb_object_agg(metric,jsonb_build_object('daily',null,'weekly',null,'monthly',null,'quarterly',null,'annual',null,'monthlyOverrides','{}'::jsonb,'quarterlyOverrides','{}'::jsonb)) into blank from unnest(array['newInquiries','toursScheduled','toursCompleted','proposalsSent','bookedEvents','revenue']) metric;
 insert into public.luxor_funnel_goals(singleton,goals) values(true,blank) on conflict(singleton) do nothing;
 select * into current_goals from public.luxor_funnel_goals where singleton=true for update;
 select * into receipt from public.luxor_funnel_goal_receipts where request_id=p_request_id;
 if found then
  if receipt.payload<>input then return jsonb_build_object('available',false,'requestId',p_request_id,'code','request_id_reused','committed',false); end if;
  return receipt.result;
 end if;
 if current_goals.revision<>p_expected_revision then return jsonb_build_object('available',false,'requestId',p_request_id,'code','revision_conflict','committed',false); end if;
 changed_at:=clock_timestamp();
 update public.luxor_funnel_goals set goals=p_goals,revision=revision+1,updated_at=changed_at,updated_by=lower(btrim(p_actor)) where singleton=true;
 result:=jsonb_build_object('available',true,'requestId',p_request_id,'goals',p_goals,'revision',p_expected_revision+1,'updatedAt',changed_at);
 insert into public.luxor_funnel_goal_receipts(request_id,payload,result) values(p_request_id,input,result);
 return result;
end $$;
revoke all on function public.luxor_save_funnel_goals(uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.luxor_save_funnel_goals(uuid,bigint,jsonb,text) to service_role;
commit;
-- No direct mutation grant for application roles. p_actor is supplied only by
-- the verified server session; it is not standalone authentication.
