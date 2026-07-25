create table if not exists public.luxor_public_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null check (char_length(event_name) between 2 and 80),
  session_id text,
  page_path text,
  source text,
  inquiry_id uuid references public.luxor_inquiries(id) on delete set null,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.luxor_public_events is
  'First-party public-site conversion and abuse-prevention events. Written only by server routes using the service role.';

create index if not exists luxor_public_events_created_at_idx
  on public.luxor_public_events (created_at desc);

create index if not exists luxor_public_events_name_created_idx
  on public.luxor_public_events (event_name, created_at desc);

create index if not exists luxor_public_events_ip_created_idx
  on public.luxor_public_events (ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists luxor_public_events_session_created_idx
  on public.luxor_public_events (session_id, created_at desc)
  where session_id is not null;

alter table public.luxor_public_events enable row level security;

revoke all on table public.luxor_public_events from anon, authenticated;
grant select, insert, update, delete on table public.luxor_public_events to service_role;

drop policy if exists "Service role can manage Luxor public events" on public.luxor_public_events;
create policy "Service role can manage Luxor public events"
  on public.luxor_public_events
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.reserve_luxor_tour_slot(p_slot_id uuid)
returns setof public.luxor_tour_slots
language sql
security invoker
set search_path = ''
as $$
  update public.luxor_tour_slots
  set
    booked_count = booked_count + 1,
    status = case when booked_count + 1 >= capacity then 'booked' else 'available' end,
    updated_at = now()
  where id = p_slot_id
    and status = 'available'
    and booked_count < capacity
  returning *;
$$;

create or replace function public.release_luxor_tour_slot(p_slot_id uuid)
returns setof public.luxor_tour_slots
language sql
security invoker
set search_path = ''
as $$
  update public.luxor_tour_slots
  set
    booked_count = greatest(0, booked_count - 1),
    status = case when status = 'booked' then 'available' else status end,
    updated_at = now()
  where id = p_slot_id
    and booked_count > 0
  returning *;
$$;

revoke all on function public.reserve_luxor_tour_slot(uuid) from public, anon, authenticated;
revoke all on function public.release_luxor_tour_slot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_luxor_tour_slot(uuid) to service_role;
grant execute on function public.release_luxor_tour_slot(uuid) to service_role;

notify pgrst, 'reload schema';
