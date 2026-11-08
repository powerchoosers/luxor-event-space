-- Operator-run only AFTER verifying all deployed web and cron instances use the
-- intended older writer, all newer instances are drained, and no claim is in flight.
-- Database checks cannot establish which application versions are running.
begin;
lock table public.luxor_bills in share row exclusive mode;
do $$
begin
 if not exists (select 1 from pg_trigger t where t.tgrelid='public.luxor_bills'::regclass
   and t.tgname='luxor_manual_analysis_rollback_barrier' and not t.tgisinternal and t.tgenabled in ('O','A')) then
   raise exception 'Rollback pause barrier is not enabled.';
 end if;
 if to_regprocedure('public.luxor_due_manual_bill_analyses(integer)') is not null
    or to_regprocedure('public.luxor_record_manual_analysis_recovery_error(uuid,timestamp with time zone)') is not null then
   raise exception 'The new queue has not been removed.';
 end if;
 if exists (select 1 from public.luxor_bills b where b.source_type='manual'
   and b.extracted_fields->'manual_analysis'->>'status'='processing') then
   raise exception 'Manual analysis is still processing or requires investigation.';
 end if;
end $$;
drop trigger luxor_manual_analysis_rollback_barrier on public.luxor_bills;
drop function public.luxor_manual_analysis_rollback_barrier();
notify pgrst, 'reload schema';
commit;
