alter table public.luxor_tasks alter column inquiry_id drop not null;
alter table public.luxor_tasks add column if not exists task_type text;
alter table public.luxor_tasks add constraint luxor_tasks_task_type_check
  check (task_type is null or task_type in ('todo', 'call', 'email', 'meeting', 'other'));

comment on column public.luxor_tasks.task_type is 'Manual task category; null for existing and automated tasks.';
