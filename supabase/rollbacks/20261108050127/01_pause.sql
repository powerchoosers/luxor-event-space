-- Operator-run only; never apply this file as a normal migration.
-- Stop NEW manual-analysis claims; do not change existing bill records.
begin;
lock table public.luxor_bills in share row exclusive mode;
create function public.luxor_manual_analysis_rollback_barrier() returns trigger
language plpgsql set search_path = public as $$
begin
 if new.source_type = 'manual' and new.extracted_fields->'manual_analysis'->>'status' = 'processing' then
   raise exception 'Manual analysis is paused for rollback.' using errcode='55000';
 end if;
 return new;
end $$;
create trigger luxor_manual_analysis_rollback_barrier before insert or update of extracted_fields,source_type on public.luxor_bills
 for each row execute function public.luxor_manual_analysis_rollback_barrier();
revoke all on function public.luxor_manual_analysis_rollback_barrier() from public,anon,authenticated;
commit;
