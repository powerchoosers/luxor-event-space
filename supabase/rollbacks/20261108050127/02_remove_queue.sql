-- Operator-run only, after pausing. This intentionally leaves the pause barrier active.
-- A processing row, even with an expired or malformed lease, blocks rollback.
begin;
lock table public.luxor_bills in share row exclusive mode;
do $$
begin
 if not exists (select 1 from pg_trigger t where t.tgrelid='public.luxor_bills'::regclass
   and t.tgname='luxor_manual_analysis_rollback_barrier' and not t.tgisinternal and t.tgenabled in ('O','A')) then
   raise exception 'Rollback pause barrier is not enabled.';
 end if;
 if exists (select 1 from public.luxor_bills b where b.source_type='manual'
   and b.extracted_fields->'manual_analysis'->>'status'='processing') then
   raise exception 'Manual analyses are still processing or require investigation; rollback remains paused.';
 end if;
end $$;
drop trigger luxor_manual_analysis_lease_gate on public.luxor_bills;
drop function public.luxor_gate_manual_analysis_lease();
drop function public.luxor_due_manual_bill_analyses(integer);
drop function public.luxor_record_manual_analysis_recovery_error(uuid,timestamptz);
drop function public.luxor_manual_analysis_queue_health();
drop index public.luxor_manual_analysis_pending_id_idx;
drop index public.luxor_manual_analysis_queued_due_idx;
drop index public.luxor_manual_analysis_lease_due_idx;
drop index public.luxor_manual_analysis_malformed_idx;
drop index public.luxor_manual_analysis_future_queue_idx;
drop index public.luxor_manual_analysis_future_retry_idx;
drop index public.luxor_manual_analysis_future_lease_idx;
drop function public.luxor_manual_analysis_malformed(jsonb);
drop function public.luxor_manual_analysis_queued_key(jsonb);
drop function public.luxor_manual_analysis_time_key(jsonb,text);
-- Retain the RLS-protected cursor table and its row rather than deleting state.
notify pgrst, 'reload schema';
commit;
