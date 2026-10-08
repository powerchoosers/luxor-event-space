\set ON_ERROR_STOP on
\ir core-baseline.sql

\ir ../../supabase/migrations/20261005010000_brochure_lead_follow_ups.sql
\ir ../../supabase/migrations/20261005020000_brochure_follow_up_unsubscribe.sql
\ir ../../supabase/migrations/20261005030000_follow_up_indexes.sql
\ir ../../supabase/migrations/20261005040000_brochure_follow_up_stop_action_states.sql
\ir ../../supabase/migrations/20261005050000_atomic_brochure_follow_up_finalization.sql
\ir ../../supabase/migrations/20261005060000_restrict_follow_up_finalizer_helper.sql
\ir ../../supabase/migrations/20261008010000_follow_up_note_task_link.sql
\ir ../../supabase/migrations/20261008020000_atomic_follow_up_overdue_recovery.sql

\ir follow-ups-fixtures.sql

create temporary table migration_snapshot as
select 'automation' as object_type, automation_key as object_key,
       concat_ws('|', enabled, send_approved, timing_configured, coalesce(timezone, '')) as object_state
from public.luxor_follow_up_automations
union all
select 'template', id::text, concat_ws('|', step_key, active, delay_days) from public.luxor_follow_up_templates
union all
select 'enrollment', id::text, concat_ws('|', inquiry_id, status, marketing_consent_at_enrollment) from public.luxor_follow_up_enrollments
union all
select 'action', id::text, concat_ws('|', enrollment_id, step_key, status, email_job_id) from public.luxor_follow_up_actions
union all
select 'email_job', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_email_jobs
union all
select 'task', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_tasks;

create temporary table function_acl_snapshot as
select p.oid::regprocedure::text as signature, p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('luxor_stop_brochure_follow_up', 'luxor_recover_brochure_follow_up_overdue');

-- Reapply the relevant migration sequence over populated synthetic rows.
\ir ../../supabase/migrations/20261005010000_brochure_lead_follow_ups.sql
\ir ../../supabase/migrations/20261005020000_brochure_follow_up_unsubscribe.sql
\ir ../../supabase/migrations/20261005030000_follow_up_indexes.sql
\ir ../../supabase/migrations/20261005040000_brochure_follow_up_stop_action_states.sql
\ir ../../supabase/migrations/20261005050000_atomic_brochure_follow_up_finalization.sql
\ir ../../supabase/migrations/20261005060000_restrict_follow_up_finalizer_helper.sql
\ir ../../supabase/migrations/20261008010000_follow_up_note_task_link.sql
\ir ../../supabase/migrations/20261008020000_atomic_follow_up_overdue_recovery.sql

do $$
begin
  if exists (
    (select object_type, object_key, object_state from migration_snapshot)
    except
    (select 'automation', automation_key, concat_ws('|', enabled, send_approved, timing_configured, coalesce(timezone, '')) from public.luxor_follow_up_automations
     union all select 'template', id::text, concat_ws('|', step_key, active, delay_days) from public.luxor_follow_up_templates
     union all select 'enrollment', id::text, concat_ws('|', inquiry_id, status, marketing_consent_at_enrollment) from public.luxor_follow_up_enrollments
     union all select 'action', id::text, concat_ws('|', enrollment_id, step_key, status, email_job_id) from public.luxor_follow_up_actions
     union all select 'email_job', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_email_jobs
     union all select 'task', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_tasks)
  ) or exists (
    (select 'automation', automation_key, concat_ws('|', enabled, send_approved, timing_configured, coalesce(timezone, '')) from public.luxor_follow_up_automations
     union all select 'template', id::text, concat_ws('|', step_key, active, delay_days) from public.luxor_follow_up_templates
     union all select 'enrollment', id::text, concat_ws('|', inquiry_id, status, marketing_consent_at_enrollment) from public.luxor_follow_up_enrollments
     union all select 'action', id::text, concat_ws('|', enrollment_id, step_key, status, email_job_id) from public.luxor_follow_up_actions
     union all select 'email_job', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_email_jobs
     union all select 'task', id::text, concat_ws('|', inquiry_id, status, automation_enrollment_id, automation_step_key) from public.luxor_tasks)
    except
    (select object_type, object_key, object_state from migration_snapshot)
  ) then raise exception 'Idempotent migration reapply changed seeded rows or send settings'; end if;
  if exists (
    (select signature, proacl from function_acl_snapshot)
    except
    (select p.oid::regprocedure::text, p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('luxor_stop_brochure_follow_up', 'luxor_recover_brochure_follow_up_overdue'))
  ) or exists (
    (select p.oid::regprocedure::text, p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('luxor_stop_brochure_follow_up', 'luxor_recover_brochure_follow_up_overdue'))
    except
    (select signature, proacl from function_acl_snapshot)
  ) then raise exception 'Idempotent migration reapply changed function ACLs'; end if;
end
$$;
select 'ordered migration reapply, existing rows, settings, and function ACLs: PASS';

\ir follow-ups-recovery-assertions.sql
\ir follow-ups-stop-states.sql
