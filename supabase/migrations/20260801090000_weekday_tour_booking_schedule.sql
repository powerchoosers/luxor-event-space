alter table public.luxor_tour_slots
  drop constraint if exists luxor_tour_slots_tuesday_wednesday_check;

alter table public.luxor_tour_slots
  add constraint luxor_tour_slots_weekday_check
    check (extract(isodow from slot_date) between 1 and 5) not valid;

notify pgrst, 'reload schema';
