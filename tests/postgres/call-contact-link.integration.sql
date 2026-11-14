-- Apply on a disposable DB after:
--   1. tests/postgres/call-contact-link.fixture.sql
--   2. supabase/migrations/20261109211054_luxor_workflow_normalize_sms_recipients.sql (normalize helper)
--   3. supabase/migrations/20261114193000_luxor_call_contact_phone_links.sql
\set ON_ERROR_STOP on

begin;

insert into public.luxor_inquiries (id, full_name, phone)
values ('11111111-1111-4111-8111-111111111101', 'Monica', '+12103760811');

insert into public.luxor_calls (
  id, twilio_call_sid, direction, from_number, to_number, caller_number, callee_number, contact_name
) values (
  '22222222-2222-4222-8222-222222222201',
  'CAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'inbound',
  '+12103760811',
  '+15550001111',
  '+12103760811',
  '+15550001111',
  'Unknown caller'
);

do $check$
begin
  if not exists (
    select 1 from public.luxor_calls
    where id = '22222222-2222-4222-8222-222222222201'
      and inquiry_id = '11111111-1111-4111-8111-111111111101'
      and contact_name = 'Monica'
  ) then
    raise exception 'inbound call did not auto-link to Monica';
  end if;
end
$check$;

insert into public.luxor_inquiries (id, full_name, phone)
values ('11111111-1111-4111-8111-111111111102', 'Monica Duplicate', '+12103760811');

insert into public.luxor_calls (
  id, twilio_call_sid, direction, from_number, to_number, caller_number, callee_number
) values (
  '22222222-2222-4222-8222-222222222203',
  'CAdddddddddddddddddddddddddddddddd',
  'inbound',
  '+12103760811',
  '+15550001111',
  '+12103760811',
  '+15550001111'
);

do $check$
begin
  if exists (
    select 1 from public.luxor_calls
    where id = '22222222-2222-4222-8222-222222222203'
      and (inquiry_id is not null or vendor_id is not null)
  ) then
    raise exception 'ambiguous phone should remain unlinked';
  end if;
end
$check$;

rollback;