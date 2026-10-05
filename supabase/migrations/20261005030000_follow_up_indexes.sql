create index if not exists luxor_follow_up_enrollments_automation_key_idx
  on public.luxor_follow_up_enrollments (automation_key);
create index if not exists luxor_follow_up_actions_template_id_idx
  on public.luxor_follow_up_actions (template_id);
create index if not exists luxor_follow_up_actions_email_job_id_idx
  on public.luxor_follow_up_actions (email_job_id);
create index if not exists luxor_follow_up_actions_task_id_idx
  on public.luxor_follow_up_actions (task_id);
