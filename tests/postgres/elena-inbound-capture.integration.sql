\set ON_ERROR_STOP on
-- Fresh disposable PostgreSQL only. Synthetic data and schema roll back.
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.luxor_inquiries (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  full_name text not null, phone text, email text, source text, flow text,
  status text, pipeline_stage text, marketing_opt_in boolean default false,
  internal_notification_requested boolean default false, is_test boolean default false,
  archived_at timestamptz, metadata jsonb not null default '{}'
);
create table public.luxor_test_settings (id integer primary key, enabled boolean,
  identification_email text, identification_phone text);
create table public.luxor_calls (
  id uuid primary key default gen_random_uuid(), twilio_call_sid text unique,
  direction text, status text, to_number text, inquiry_id uuid references public.luxor_inquiries,
  contact_name text, notes text, metadata jsonb not null default '{}', updated_at timestamptz default now()
);
alter table public.luxor_inquiries enable row level security;
alter table public.luxor_calls enable row level security;
alter table public.luxor_test_settings enable row level security;
grant all on public.luxor_calls,public.luxor_inquiries to service_role;
grant select on public.luxor_test_settings to service_role;
create function public.luxor_workflow_normalize_phone(value text) returns text
language sql immutable set search_path='' as $$
  select case when length(digits)=10 then '+1'||digits
    when length(digits)=11 and left(digits,1)='1' then '+'||digits
    when left(btrim(coalesce(value,'')),1)='+' and length(digits) between 8 and 15 then '+'||digits
    else null end from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') digits) normalized;
$$;
revoke all on function public.luxor_workflow_normalize_phone(text) from public,anon,authenticated;
grant execute on function public.luxor_workflow_normalize_phone(text) to service_role;
\ir ../../supabase/migrations/20261111160052_elena_live_inbound_capture.sql
\ir ../../supabase/migrations/20261111160052_elena_live_inbound_capture.sql

create function pg_temp.expect(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
select pg_temp.expect(not has_function_privilege('anon','public.luxor_capture_elena_inbound_contact(text,text,uuid)','execute'),'anonymous RPC denied');
select pg_temp.expect(not has_function_privilege('authenticated','public.luxor_capture_elena_inbound_contact(text,text,uuid)','execute'),'authenticated direct RPC denied');
select pg_temp.expect(has_function_privilege('service_role','public.luxor_capture_elena_inbound_contact(text,text,uuid)','execute'),'service RPC allowed');

create function pg_temp.seed_call(p_sid text,p_scope text,p_phone text,p_nonce uuid) returns void language sql as $$
insert into public.luxor_calls(twilio_call_sid,direction,status,to_number,metadata)
values(p_sid,'inbound','in-progress','+15559990000',jsonb_build_object(
  'scope',p_scope,'ingress_mode','programmable_sip','rehearsal_only',false,
  'accepted',true,'openai_session_id','live_synthetic',
  'capture_pending',jsonb_build_object('nonce',p_nonce,'full_name','Synthetic Caller',
    'phone',p_phone,'email','caller@example.invalid','purpose','transfer',
    'expires_at',now()+interval '3 minutes')));
$$;
select pg_temp.seed_call('CA11111111111111111111111111111111','elena_live_inbound','+15550000001','11111111-1111-4111-8111-111111111111');
set local role service_role;
select public.luxor_capture_elena_inbound_contact('CA11111111111111111111111111111111','live_synthetic','11111111-1111-4111-8111-111111111111');
select public.luxor_capture_elena_inbound_contact('CA11111111111111111111111111111111','live_synthetic','11111111-1111-4111-8111-111111111111');
reset role;
select pg_temp.expect((select count(*)=1 from public.luxor_inquiries),'replay creates one lead');
select pg_temp.expect((select not marketing_opt_in and not internal_notification_requested from public.luxor_inquiries),'capture grants no marketing and queues no notifications');
select pg_temp.expect((select metadata->'inbound_capture'->>'confirmed'='true' and metadata->'capture_pending' is null and contact_name='Synthetic Caller' and inquiry_id is not null from public.luxor_calls where twilio_call_sid='CA11111111111111111111111111111111'),'confirmed capture durable with call lead link');

select pg_temp.seed_call('CA22222222222222222222222222222222','elena_live_inbound','(555) 000-0001','22222222-2222-4222-8222-222222222222');
update public.luxor_calls set metadata=jsonb_set(metadata,'{capture_pending,full_name}','"Another Family Member"') where twilio_call_sid='CA22222222222222222222222222222222';
set local role service_role;
select public.luxor_capture_elena_inbound_contact('CA22222222222222222222222222222222','live_synthetic','22222222-2222-4222-8222-222222222222');
reset role;
select pg_temp.expect((select count(*)=1 and min(full_name)='Synthetic Caller' from public.luxor_inquiries),'canonical duplicate links without changing prior identity');
select pg_temp.expect((select contact_name='Another Family Member' from public.luxor_calls where twilio_call_sid='CA22222222222222222222222222222222'),'caller identity retained on own call');

insert into public.luxor_inquiries(full_name,phone) values('Historical duplicate','5550000001');
select pg_temp.seed_call('CA33333333333333333333333333333333','elena_live_inbound','+15550000001','33333333-3333-4333-8333-333333333333');
set local role service_role;
select public.luxor_capture_elena_inbound_contact('CA33333333333333333333333333333333','live_synthetic','33333333-3333-4333-8333-333333333333');
reset role;
select pg_temp.expect((select count(*)=2 from public.luxor_inquiries),'ambiguous existing leads never create a third');
select pg_temp.expect((select inquiry_id is null and metadata->'inbound_capture'->>'matching_review_needed'='true' and notes like '%Synthetic Caller%' from public.luxor_calls where twilio_call_sid='CA33333333333333333333333333333333'),'ambiguous confirmed callback retained for manual matching');

select pg_temp.seed_call('CA44444444444444444444444444444444','elena_phone_test','+15550000004','44444444-4444-4444-8444-444444444444');
do $$ begin
  begin perform public.luxor_capture_elena_inbound_contact('CA44444444444444444444444444444444','live_synthetic','44444444-4444-4444-8444-444444444444'); raise exception 'rehearsal was allowed'; exception when insufficient_privilege then null; end;
  begin perform public.luxor_capture_elena_inbound_contact('CA11111111111111111111111111111111','live_other','11111111-1111-4111-8111-111111111111'); raise exception 'wrong session was allowed'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.seed_call('CA55555555555555555555555555555555','elena_live_inbound','+15550000005','55555555-5555-4555-8555-555555555555');
update public.luxor_calls set metadata=jsonb_set(metadata,'{capture_pending,expires_at}',to_jsonb((now()-interval '1 minute')::text)) where twilio_call_sid='CA55555555555555555555555555555555';
do $$ begin
  begin perform public.luxor_capture_elena_inbound_contact('CA55555555555555555555555555555555','live_synthetic','55555555-5555-4555-8555-555555555555'); raise exception 'expired readback was allowed'; exception when invalid_parameter_value then null; end;
end $$;
insert into public.luxor_test_settings values(1,true,'protected@example.invalid','5550000006');
select pg_temp.seed_call('CA66666666666666666666666666666666','elena_live_inbound','+15550000006','66666666-6666-4666-8666-666666666666');
do $$ begin
  begin perform public.luxor_capture_elena_inbound_contact('CA66666666666666666666666666666666','live_synthetic','66666666-6666-4666-8666-666666666666'); raise exception 'protected test phone was allowed'; exception when invalid_parameter_value then null; end;
end $$;
update public.luxor_test_settings set identification_phone='15550000006' where id=1;
do $$ begin
  begin perform public.luxor_capture_elena_inbound_contact('CA66666666666666666666666666666666','live_synthetic','66666666-6666-4666-8666-666666666666'); raise exception 'eleven-digit protected test phone was allowed'; exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.expect((select count(*)=2 from public.luxor_inquiries),'rejected actions never create leads');

-- A downstream insert failure rolls back capture and can safely retry.
select pg_temp.seed_call('CA77777777777777777777777777777777','elena_live_inbound','+15550000007','77777777-7777-4777-8777-777777777777');
create function pg_temp.fail_insert() returns trigger language plpgsql as $$ begin raise exception 'synthetic insert failure'; end $$;
create trigger synthetic_fail before insert on public.luxor_inquiries for each row execute function pg_temp.fail_insert();
do $$ begin
  begin perform public.luxor_capture_elena_inbound_contact('CA77777777777777777777777777777777','live_synthetic','77777777-7777-4777-8777-777777777777'); exception when raise_exception then null; end;
end $$;
select pg_temp.expect((select metadata->'capture_pending' is not null and metadata->'inbound_capture' is null and inquiry_id is null from public.luxor_calls where twilio_call_sid='CA77777777777777777777777777777777'),'failed transaction leaves no false saved capture');
drop trigger synthetic_fail on public.luxor_inquiries;
set local role service_role;
select public.luxor_capture_elena_inbound_contact('CA77777777777777777777777777777777','live_synthetic','77777777-7777-4777-8777-777777777777');
reset role;
select pg_temp.expect((select count(*)=3 from public.luxor_inquiries),'retry commits once');
rollback;
