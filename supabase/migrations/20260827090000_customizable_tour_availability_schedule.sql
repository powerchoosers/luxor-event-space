create table if not exists public.luxor_tour_availability (
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null default false,
  start_time time not null default time '16:00',
  end_time time not null default time '19:00',
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint luxor_tour_availability_time_order check (end_time > start_time)
);

insert into public.luxor_tour_availability (weekday, is_open, start_time, end_time)
values
  (0, false, time '16:00', time '19:00'),
  (1, false, time '16:00', time '19:00'),
  (2, true, time '16:00', time '19:00'),
  (3, true, time '16:00', time '19:00'),
  (4, false, time '16:00', time '19:00'),
  (5, false, time '16:00', time '19:00'),
  (6, false, time '16:00', time '19:00')
on conflict (weekday) do nothing;

alter table public.luxor_tour_availability enable row level security;
drop policy if exists "Service role can manage Luxor tour availability" on public.luxor_tour_availability;
create policy "Service role can manage Luxor tour availability"
  on public.luxor_tour_availability for all to service_role using (true) with check (true);
grant all on table public.luxor_tour_availability to service_role;

notify pgrst, 'reload schema';
