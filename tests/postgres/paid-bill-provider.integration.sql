begin;
insert into public.luxor_vendors values ('00000000-0000-4000-8000-000000000001', 'Utility', null), ('00000000-0000-4000-8000-000000000002', 'Other', null), ('00000000-0000-4000-8000-000000000003', 'Archived', now());
insert into public.luxor_bills values ('10000000-0000-4000-8000-000000000001', null, null, 'paid', null, '2026-01-01T00:00:00Z', 100, '2026-01-01T00:00:00Z'), ('10000000-0000-4000-8000-000000000002', null, null, 'paid', null, '2026-01-01T00:00:00Z', 100, '2026-01-01T00:00:00Z');
insert into public.luxor_booking_expenses values ('20000000-0000-4000-8000-000000000001', null, '10000000-0000-4000-8000-000000000001');
insert into public.luxor_expense_payments values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 100);
insert into public.luxor_expense_templates(id, vendor_id) values ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
-- Model a legacy link that predates the provider guard.
set local session_replication_role = replica;
insert into public.luxor_booking_expenses values ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
set local session_replication_role = origin;
set local role service_role;
do $$
declare before_bill jsonb; after_bill jsonb; result jsonb;
begin
  if has_function_privilege('anon', 'public.luxor_link_paid_bill_provider(uuid,timestamptz,uuid,text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.luxor_link_paid_bill_provider(uuid,timestamptz,uuid,text)', 'EXECUTE') or not has_function_privilege('service_role', 'public.luxor_link_paid_bill_provider(uuid,timestamptz,uuid,text)', 'EXECUTE') then raise exception 'RPC grants incorrect'; end if;
  if has_table_privilege('service_role', 'public.luxor_paid_bill_provider_events', 'INSERT') then raise exception 'Audit writable by service role'; end if;
  select to_jsonb(b) into before_bill from public.luxor_bills b where id='10000000-0000-4000-8000-000000000001';
  result := public.luxor_link_paid_bill_provider('10000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000001', ' Owner@Example.Invalid ');
  select to_jsonb(b) into after_bill from public.luxor_bills b where id='10000000-0000-4000-8000-000000000001';
  if (before_bill - array['vendor_id','vendor_link_method','updated_at']) is distinct from (after_bill - array['vendor_id','vendor_link_method','updated_at']) then raise exception 'Bill facts changed'; end if;
  if result->'bill'->>'vendor_id' <> '00000000-0000-4000-8000-000000000001' or (select count(*) from public.luxor_expense_payments where amount=100) <> 1 or (select count(*) from public.luxor_paid_bill_provider_events where actor_email='owner@example.invalid') <> 1 then raise exception 'Link, payment, or audit incorrect'; end if;
  begin perform public.luxor_link_paid_bill_provider('10000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000002', 'owner@example.invalid'); raise exception 'Stale update accepted'; exception when sqlstate '55000' then null; end;
  begin perform public.luxor_link_paid_bill_provider('10000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000003', 'owner@example.invalid'); raise exception 'Archived provider accepted'; exception when sqlstate '55000' then null; end;
  begin perform public.luxor_link_paid_bill_provider('10000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000001', 'owner@example.invalid'); raise exception 'Different schedule provider accepted'; exception when sqlstate '55000' then null; end;
  if (select count(*) from public.luxor_paid_bill_provider_events) <> 1 then raise exception 'Rejected link left an audit entry'; end if;
end $$;
rollback;
