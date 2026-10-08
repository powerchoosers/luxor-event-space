# Follow-up PostgreSQL integration harness

Run the disposable synthetic database test with:

```sh
tests/postgres/run-follow-ups-postgres.sh
```

The script starts `postgres:17-alpine` with trust auth inside a short-lived
container that is not published on a host port, executes the ordered SQL in
`follow-ups.integration.sql`, and removes the container on exit. The core
schema/grants are a minimal synthetic baseline. In a read-only production
catalog query, `anon` and `authenticated` had broad direct grants on
`luxor_inquiries` and `SELECT` on core task/email/note tables;
`service_role` had full core-table privileges, follow-up tables were
service-role only, and the core RLS policies were service-role only. The local
baseline mirrors those grants, RLS policies, and the
`service_role` BYPASSRLS attribute; the follow-up table and function grants are
then applied by the real ordered migrations.

Migrations are applied twice, after synthetic rows exist, in this order:

1. `20261005010000_brochure_lead_follow_ups.sql`
2. `20261005020000_brochure_follow_up_unsubscribe.sql`
3. `20261005030000_follow_up_indexes.sql`
4. `20261005040000_brochure_follow_up_stop_action_states.sql`
5. `20261005050000_atomic_brochure_follow_up_finalization.sql`
6. `20261005060000_restrict_follow_up_finalizer_helper.sql`
7. `20261008010000_follow_up_note_task_link.sql`
8. `20261008020000_atomic_follow_up_overdue_recovery.sql`

The harness checks migration idempotence and row/setting/ACL preservation;
eligibility and queued-job validation; `email_5` skip rejection; paired
reschedule and rollback/retry; the disabled send gate; note survival after task
deletion; the stop trigger for unsubscribe, decline, and booking across the
four live action states (`scheduled`, `email_queued`, `task_created`,
`processing`) while preserving completed/failed and other terminal history;
and anon/auth denial on protected reads and the service-role-only invoker RPC. All inserted
records use synthetic UUIDs and `example.invalid` recipients. The harness does
not connect to Supabase or send mail.
