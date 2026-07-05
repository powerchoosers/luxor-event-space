create table if not exists public.luxor_tour_slots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slot_date date not null,
  start_time time not null,
  end_time time,
  status text not null default 'available' check (status in ('available', 'held', 'booked', 'unavailable')),
  capacity integer not null default 1 check (capacity > 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  title text,
  notes text,
  constraint luxor_tour_slots_booked_count_lte_capacity_check check (booked_count <= capacity),
  constraint luxor_tour_slots_unique_time unique (slot_date, start_time)
);

comment on table public.luxor_tour_slots is
  'Published private-tour openings for Luxor Event Space. Public booking surfaces should only show available future rows.';

create index if not exists luxor_tour_slots_upcoming_idx
  on public.luxor_tour_slots (slot_date, start_time)
  where status = 'available';

grant select, insert, update, delete on table public.luxor_tour_slots to service_role;

alter table public.luxor_tour_slots enable row level security;

drop policy if exists "Service role can manage Luxor tour slots" on public.luxor_tour_slots;
create policy "Service role can manage Luxor tour slots"
  on public.luxor_tour_slots
  for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
