# Follow-up PostgreSQL integration harness

## Custom workflow attended-tour event capture

Run `psql -v ON_ERROR_STOP=1 -f tests/postgres/custom-workflow-tour-outbox.integration.sql`
against a fresh disposable database. The fixture uses synthetic records inside
a rolled-back transaction and applies the actual tour outbox migration. It
checks revision and active-version capture, replay, disabled runtime, paused
workflows, transactional rollback, enrollment timing, correction before and
after enrollment, consent and table grants. The fixture uses minimal workflow
tables and a stub definition validator. Separate Node tests check worker handling
of a missing or failed consumer. Real queue dispatch and concurrent transactions
are not verified by this fixture, and the application does not yet allow the
tour trigger to be activated.

The main `custom-workflows.integration.sql` also applies the actual workflow
and tour migrations to its synthetic schema. It exercises attended-tour event
capture, enrollment, SMS queueing, and the actual pre-send guard after a visit
correction or opt-out, under both clean and Supabase-style default grants. It
also verifies email queueing and the unsubscribe token, suppression at the
pre-send guard, and rejection of queued email or text after the contact changes
their destination. No provider call is made, and this does not prove atomicity
with an external send.

## Paid bill provider links

Use a fresh disposable PostgreSQL database with the `anon`, `authenticated`, and
`service_role` roles present. Apply `paid-bill-provider.fixture.sql`, then the
`luxor_recurring_provider_links` and `luxor_paid_bill_provider_link` migrations,
then `paid-bill-provider.integration.sql`, with `psql -v ON_ERROR_STOP=1`.
The final file runs synthetic data inside a rolled-back transaction. It checks
service-role access, audit permissions, preservation of bill facts and payment
rows, and rejection of stale, archived, and conflicting-provider links. The
fixture is a minimal schema, not a full production copy.

The same disposable fixture can exercise recurring-cost request identity by
applying the `luxor_recurring_cost_request_keys` migration and then
`recurring-cost-request-key.integration.sql`. It checks duplicate request keys,
immutable fingerprints, and incomplete request pairs inside a rolled-back
transaction.

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

## Custom-workflow integration harness

Run the Phase 4 workflow migration and ACL tests with:

```sh
tests/postgres/run-custom-workflows-postgres.sh
```

The script starts a disposable PostgreSQL 16 container without publishing a host port. It runs the synthetic custom-workflow migration harness twice, each inside a transaction that rolls back: once with clean ACL defaults and once with Supabase-style table and function defaults. The checks include migration reapply, private-table and service-role ACLs, untrusted RPC denial, fail-closed controls, event/step uniqueness, immutable version pinning, legacy queue preservation, consent and Chicago SMS-window checks, acknowledgment reuse, and pause/resume/archive behavior. Fixtures use synthetic `.invalid` recipients; no hosted database or provider is contacted.

The harness also applies the workflow phone-normalization migration after the baseline and checks canonical consent matching, a ten-digit inquiry phone at queue time, opt-out rejection, and helper-function permissions. The fixture is not a full copy of the production migration history.

## Manual installment correction

Use a fresh disposable PostgreSQL database, never a production database. Run the
fixture, migration, and synthetic transaction in order with `psql -v ON_ERROR_STOP=1`:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/postgres/manual-payment-correction.fixture.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261109035941_luxor_manual_installment_correction.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/postgres/manual-payment-correction.integration.sql
```

The fixture is a minimal model, not a full copy of the deployed schema or its
triggers. Its synthetic test transaction rolls back after checking correction,
receipt-email fencing, permissions, and rejection cases.
