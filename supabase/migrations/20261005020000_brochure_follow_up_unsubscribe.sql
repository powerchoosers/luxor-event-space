alter table public.luxor_follow_up_enrollments
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists luxor_follow_up_unsubscribe_token_unique
  on public.luxor_follow_up_enrollments (unsubscribe_token);

revoke all on public.luxor_follow_up_enrollments from public, anon, authenticated;
grant select, insert, update, delete on public.luxor_follow_up_enrollments to service_role;

notify pgrst, 'reload schema';
