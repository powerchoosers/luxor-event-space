alter table public.luxor_tour_slots
  drop constraint if exists luxor_tour_slots_capacity_one_check,
  drop constraint if exists luxor_tour_slots_tuesday_wednesday_check,
  drop constraint if exists luxor_tour_slots_start_time_check,
  drop constraint if exists luxor_tour_slots_thirty_minutes_check;

alter table public.luxor_tour_slots
  add constraint luxor_tour_slots_capacity_one_check
    check (capacity = 1) not valid,
  add constraint luxor_tour_slots_tuesday_wednesday_check
    check (extract(isodow from slot_date) in (2, 3)) not valid,
  add constraint luxor_tour_slots_start_time_check
    check (start_time in (
      time '11:00', time '11:30', time '12:00', time '12:30', time '13:00', time '13:30',
      time '17:00', time '17:30', time '18:00', time '18:30', time '19:00'
    )) not valid,
  add constraint luxor_tour_slots_thirty_minutes_check
    check (end_time = start_time + interval '30 minutes') not valid;

create or replace function public.reserve_luxor_tour_slot(p_slot_id uuid)
returns setof public.luxor_tour_slots
language sql
security invoker
set search_path = ''
as $$
  update public.luxor_tour_slots
  set
    booked_count = 1,
    status = 'booked',
    updated_at = now()
  where id = p_slot_id
    and status = 'available'
    and booked_count = 0
    and capacity = 1
    and ((slot_date + start_time) at time zone 'America/Chicago') >= now() + interval '24 hours'
  returning *;
$$;

revoke all on function public.reserve_luxor_tour_slot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_luxor_tour_slot(uuid) to service_role;

notify pgrst, 'reload schema';
