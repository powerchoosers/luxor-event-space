-- Add times array to luxor_tour_availability for discrete time slots per day
alter table public.luxor_tour_availability
  add column if not exists times text[] not null default '{}';

-- Populate existing open days with standard times if empty
update public.luxor_tour_availability
set times = array['16:00:00', '17:00:00', '18:00:00']
where is_open = true and (times is null or cardinality(times) = 0);

-- Table for storing high-level tour schedule settings
create table if not exists public.luxor_tour_schedule_settings (
  id text primary key default 'default',
  mode text not null default 'weekly' check (mode in ('weekly', 'flexible')),
  weeks_ahead integer not null default 6 check (weeks_ahead in (1, 2, 3, 4, 5, 6, 8, 12)),
  reminder_enabled boolean not null default false,
  reminder_day smallint not null default 1 check (reminder_day between 0 and 6),
  reminder_time text not null default '09:00',
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Insert default settings row if missing
insert into public.luxor_tour_schedule_settings (id, mode, weeks_ahead, reminder_enabled, reminder_day, reminder_time)
values ('default', 'weekly', 6, false, 1, '09:00')
on conflict (id) do nothing;

-- Enable RLS and permissions
alter table public.luxor_tour_schedule_settings enable row level security;
drop policy if exists "Service role can manage Luxor tour schedule settings" on public.luxor_tour_schedule_settings;
create policy "Service role can manage Luxor tour schedule settings"
  on public.luxor_tour_schedule_settings for all to service_role using (true) with check (true);
grant all on table public.luxor_tour_schedule_settings to service_role;

notify pgrst, 'reload schema';
