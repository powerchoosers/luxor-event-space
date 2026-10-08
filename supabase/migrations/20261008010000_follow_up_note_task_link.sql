-- Keep a durable association between a manual call outcome and its task.
-- Deleting a task leaves the historic note intact.
alter table public.luxor_notes
  add column if not exists task_id uuid references public.luxor_tasks(id) on delete set null;

create index if not exists luxor_notes_task_id_idx
  on public.luxor_notes (task_id)
  where task_id is not null;

notify pgrst, 'reload schema';
