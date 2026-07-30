create table if not exists public.luxor_worker_health (
  worker_name text primary key,
  last_authorized_at timestamptz not null default now(),
  last_processed_at timestamptz,
  last_status text not null default 'healthy'
    check (last_status in ('healthy', 'idle', 'error')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.luxor_worker_health enable row level security;
revoke all on table public.luxor_worker_health from public, anon, authenticated;
grant select, insert, update, delete on table public.luxor_worker_health to service_role;

drop policy if exists "Service role can manage Luxor worker health" on public.luxor_worker_health;
create policy "Service role can manage Luxor worker health"
  on public.luxor_worker_health
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.luxor_worker_health is
  'Heartbeat and outcome records for authenticated Luxor background workers.';
