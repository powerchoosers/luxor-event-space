\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.luxor_phone_numbers (phone_number text primary key, is_public boolean not null default true);
insert into public.luxor_phone_numbers(phone_number) values ('+15559990000');
create table public.luxor_test_settings (id integer primary key, enabled boolean, identification_email text, identification_phone text);
create table public.luxor_inquiries (
  id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
  full_name text not null, phone text, email text, source text, flow text,
  status text, pipeline_stage text, marketing_opt_in boolean default false,
  internal_notification_requested boolean default false, is_test boolean default false,
  archived_at timestamptz, metadata jsonb not null default '{}',
  event_type text, target_date text, guest_count integer
);
create table public.luxor_calls (
  id uuid primary key default gen_random_uuid(), twilio_call_sid text unique,
  direction text, status text, to_number text, caller_number text, inquiry_id uuid references public.luxor_inquiries,
  contact_name text, notes text, metadata jsonb not null default '{}', updated_at timestamptz default now()
);
create table public.luxor_email_jobs (id uuid primary key default gen_random_uuid());
alter table public.luxor_inquiries enable row level security;
alter table public.luxor_calls enable row level security;
grant all on public.luxor_calls, public.luxor_inquiries to service_role;
create function public.luxor_workflow_normalize_phone(value text) returns text
language sql immutable set search_path='' as $$
  select case when length(digits)=10 then '+1'||digits
    when length(digits)=11 and left(digits,1)='1' then '+'||digits
    when left(btrim(coalesce(value,'')),1)='+' and length(digits) between 8 and 15 then '+'||digits
    else null end from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') digits) normalized;
$$;
grant execute on function public.luxor_workflow_normalize_phone(text) to service_role;
\ir ../../supabase/migrations/20261114200000_elena_inbound_post_call_reconcile.sql
insert into public.luxor_calls(twilio_call_sid,direction,status,to_number,caller_number,metadata,summary_status,summary_text)
values('CA99999999999999999999999999999999','inbound','completed','+15559990000','+15550001234',
  jsonb_build_object('scope','elena_live_inbound','ingress_mode','programmable_sip','rehearsal_only',false,'accepted',true),
  'completed',
  'Maria Lopez quinceañera 2027-05-22 150 guests maria@example.com package email promised');
set local role service_role;
select public.luxor_reconcile_elena_inbound_after_call('CA99999999999999999999999999999999',
  jsonb_build_object('full_name','Maria Lopez','phone','+15550001234','email','maria@example.com',
    'event_type','Quinceañera','target_date','2027-05-22','guest_count',150,'package_email_promised',true));
reset role;
select case when count(*)=1 and min(full_name)='Maria Lopez' and min(event_type)='Quinceañera' and min(email)='maria@example.com'
  then 'ok' else 'fail' end as inquiry_created from public.luxor_inquiries;
select case when inquiry_id is not null and metadata->'post_call_reconcile'->>'saved_at' is not null
  then 'ok' else 'fail' end as call_linked from public.luxor_calls where twilio_call_sid='CA99999999999999999999999999999999';
rollback;