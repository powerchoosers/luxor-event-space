create or replace function public.luxor_sync_confirmed_tour_lead_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'tour_confirmed'
     and (old.status is distinct from new.status or old.pipeline_stage is distinct from new.pipeline_stage) then
    update public.luxor_lead_events
    set status = 'tour_confirmed',
        pipeline_stage = 'tour',
        updated_at = now()
    where inquiry_id = new.id
      and status in ('new', 'contacted', 'tour_requested')
      and pipeline_stage in ('inquiry', 'tour');
  end if;
  return new;
end;
$$;

revoke all on function public.luxor_sync_confirmed_tour_lead_events() from public, anon, authenticated;
grant execute on function public.luxor_sync_confirmed_tour_lead_events() to service_role;

drop trigger if exists luxor_inquiries_sync_confirmed_tour_lead_events on public.luxor_inquiries;
create trigger luxor_inquiries_sync_confirmed_tour_lead_events
  after update of status, pipeline_stage on public.luxor_inquiries
  for each row execute function public.luxor_sync_confirmed_tour_lead_events();

-- Repair completed client bookings whose inquiry was confirmed but the linked
-- primary event remained in the legacy request state.
update public.luxor_lead_events event
set status = 'tour_confirmed',
    pipeline_stage = 'tour',
    updated_at = now()
from public.luxor_inquiries inquiry
where event.inquiry_id = inquiry.id
  and inquiry.status = 'tour_confirmed'
  and (
    event.status in ('new', 'contacted', 'tour_requested')
    or (event.status = 'tour_confirmed' and event.pipeline_stage = 'inquiry')
  )
  and event.pipeline_stage in ('inquiry', 'tour');

-- Recover any confirmed calendar booking left behind with a stale inquiry
-- status. The inquiry update trigger above synchronizes its lead event rows.
update public.luxor_inquiries inquiry
set status = 'tour_confirmed',
    pipeline_stage = 'tour',
    updated_at = now()
where inquiry.status in ('new', 'contacted', 'tour_requested')
  and exists (
    select 1
    from public.luxor_calendar_events calendar_event
    where calendar_event.inquiry_id = inquiry.id
      and calendar_event.status = 'confirmed'
  );

notify pgrst, 'reload schema';
