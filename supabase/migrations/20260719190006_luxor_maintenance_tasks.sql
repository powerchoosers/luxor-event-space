create table if not exists public.luxor_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled'))
);

comment on table public.luxor_maintenance_tasks is
  'Venue maintenance work that is not attached to a sales inquiry.';

create index if not exists luxor_maintenance_tasks_status_due_idx
  on public.luxor_maintenance_tasks (status, due_date, created_at desc);

alter table public.luxor_maintenance_tasks enable row level security;
revoke all on table public.luxor_maintenance_tasks from anon, authenticated;
grant select, insert, update, delete on table public.luxor_maintenance_tasks to service_role;

drop policy if exists "Service role can manage Luxor maintenance tasks" on public.luxor_maintenance_tasks;
create policy "Service role can manage Luxor maintenance tasks"
  on public.luxor_maintenance_tasks
  for all
  to service_role
  using (true)
  with check (true);
