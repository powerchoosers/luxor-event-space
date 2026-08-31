set local lock_timeout = '5s';

-- Defense in depth for stale deployments and retries: an auto-scheduled tour
-- is acknowledged by its calendar invitation, never by the generic inquiry
-- receipt as well.
create or replace function public.luxor_skip_duplicate_auto_tour_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.job_type = 'marketing_campaign'
    and new.metadata->>'source' = 'inquiry_acknowledgment'
    and new.inquiry_id is not null
    and exists (
      select 1 from public.luxor_inquiries inquiry
      where inquiry.id = new.inquiry_id
        and inquiry.metadata->>'autoScheduleTour' = 'true'
    ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.luxor_skip_duplicate_auto_tour_receipt() from public,anon,authenticated;
grant execute on function public.luxor_skip_duplicate_auto_tour_receipt() to service_role;

drop trigger if exists luxor_skip_duplicate_auto_tour_receipt on public.luxor_email_jobs;
create trigger luxor_skip_duplicate_auto_tour_receipt
before insert on public.luxor_email_jobs
for each row execute function public.luxor_skip_duplicate_auto_tour_receipt();
