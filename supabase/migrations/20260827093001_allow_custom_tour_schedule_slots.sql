alter table public.luxor_tour_slots
  drop constraint if exists luxor_tour_slots_start_time_check,
  drop constraint if exists luxor_tour_slots_weekday_check;

notify pgrst, 'reload schema';
