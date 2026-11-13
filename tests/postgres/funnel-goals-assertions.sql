do $$
declare g jsonb; changed jsonb; first_result jsonb; replay_result jsonb; conflict jsonb; bad jsonb;
begin
 select jsonb_object_agg(metric,jsonb_build_object('daily',null,'weekly',null,'monthly',null,'quarterly',null,'annual',null,'monthlyOverrides','{}'::jsonb,'quarterlyOverrides','{}'::jsonb)) into g from unnest(array['newInquiries','toursScheduled','toursCompleted','proposalsSent','bookedEvents','revenue']) metric;
 if not public.luxor_funnel_goals_valid(g) then raise exception 'valid default rejected'; end if;
 if public.luxor_funnel_goals_valid(g || '{"extra":null}'::jsonb) then raise exception 'extra key accepted'; end if;
 if public.luxor_funnel_goals_valid(jsonb_set(g,'{newInquiries,daily}','1.5')) then raise exception 'fraction count accepted'; end if;
 if public.luxor_funnel_goals_valid(jsonb_set(g,'{revenue,daily}','0.291')) then raise exception 'fraction cents accepted'; end if;
 if not public.luxor_funnel_goals_valid(jsonb_set(g,'{revenue,daily}','0.29')) then raise exception 'ordinary cents rejected'; end if;
 begin perform public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000099',0,g,'staff@example.invalid');raise exception 'staff authorization bypass';exception when insufficient_privilege then null;end;
 begin perform public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000098',0,g,'suspended@example.invalid');raise exception 'suspended authorization bypass';exception when insufficient_privilege then null;end;
 first_result:=public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000001',0,g,'owner@example.invalid');
 if (first_result->>'revision')::bigint<>1 or not(first_result->>'available')::boolean then raise exception 'first save not revision1';end if;
 changed:=jsonb_set(g,'{newInquiries,daily}','5');
 perform public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000002',1,changed,'editor@example.invalid');
 replay_result:=public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000001',0,g,'owner@example.invalid');
 if replay_result<>first_result then raise exception 'old replay changed result';end if;
 conflict:=public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000003',0,g,'owner@example.invalid');
 if conflict->>'code'<>'revision_conflict' then raise exception 'stale revision accepted';end if;
 bad:=public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000001',0,changed,'owner@example.invalid');
 if bad->>'code'<>'request_id_reused' then raise exception 'ID collision accepted';end if;
 if (select revision from public.luxor_funnel_goals)<>2 or (select count(*) from public.luxor_funnel_goal_receipts)<>2 then raise exception 'replay/conflict changed state';end if;
 begin
   perform public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000004',2,g,'owner@example.invalid');
   raise exception 'force rollback' using errcode='P1111';
 exception when sqlstate 'P1111' then null;end;
 if (select revision from public.luxor_funnel_goals)<>2 or exists(select from public.luxor_funnel_goal_receipts where request_id='00000000-0000-4000-8000-000000000004') then raise exception 'rollback left mutation';end if;
 if has_table_privilege('anon','public.luxor_funnel_goals','select') or has_table_privilege('authenticated','public.luxor_funnel_goals','select') then raise exception 'unprivileged table access';end if;
 if has_table_privilege('service_role','public.luxor_funnel_goals','insert,update,delete') or has_table_privilege('service_role','public.luxor_funnel_goal_receipts','select,insert,update,delete') then raise exception 'service direct privilege leak';end if;
 if has_function_privilege('anon','public.luxor_save_funnel_goals(uuid,bigint,jsonb,text)','execute') or has_function_privilege('authenticated','public.luxor_save_funnel_goals(uuid,bigint,jsonb,text)','execute') then raise exception 'unprivileged RPC';end if;
 if not has_function_privilege('service_role','public.luxor_save_funnel_goals(uuid,bigint,jsonb,text)','execute') then raise exception 'service RPC missing';end if;
 if exists(select from pg_class where oid in ('public.luxor_funnel_goals'::regclass,'public.luxor_funnel_goal_receipts'::regclass) and not relrowsecurity) then raise exception 'RLS disabled';end if;
end $$;
set role service_role;
select revision from public.luxor_funnel_goals;
do $$ declare result jsonb;g jsonb;begin
 select goals into g from public.luxor_funnel_goals;
 result:=public.luxor_save_funnel_goals('00000000-0000-4000-8000-000000000005',2,g,'owner@example.invalid');
 if (result->>'revision')::bigint<>3 then raise exception 'service execution failed';end if;
 begin update public.luxor_funnel_goals set revision=4;raise exception 'service direct update bypass';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'GOALS SQL ASSERTIONS PASS' as result;
