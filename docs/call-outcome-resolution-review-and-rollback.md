# Call-outcome resolution: migration review package

Status: review-only. No SQL in this package has been installed. Both runtime flags remain off.

## Exact proposed migration

Review [call-outcome-resolution-draft.sql](call-outcome-resolution-draft.sql) as the exact proposed SQL body. It remains guarded by an unconditional exception at the top. Keep that guard in the source file; only the isolated PostgreSQL runner may remove it from a disposable temporary copy. Do not copy an unguarded version into `supabase/migrations` until the remaining gates are approved and a release migration is prepared.

Candidate SHA-256: `023BF6F3E34AAD8FE7FD67EDD9A498C22E2BDB72EBCEB6AD33D81EC5F427941E`.

The candidate adds two durable tables, private classification/admission helpers, and three service-role RPCs:

- `luxor_resolve_call_outcome(uuid, uuid, uuid, text, text, text, timestamptz, text, uuid, text)`
- `luxor_restart_prospect_workflow(uuid, uuid, uuid, text)`
- `luxor_enroll_workflow_with_resolution(uuid, uuid, uuid[], text, boolean)`

The database snapshot reported PostgreSQL 17.6, all 17 manifest tables, required columns and six helper signatures. It also confirms the signed-booking task guard and the invoice/receipt triggers are present. The trigger-function snapshot was reviewed. The new isolated coverage is `tests/postgres/call-outcome-existing-triggers.sql`, executed by `tests/postgres/call-outcome-resolution-run.ps1` only inside its disposable local PostgreSQL cluster.

## Trigger interaction findings

- Updating `luxor_inquiries.follow_up_disposition` to `not_interested` fires `luxor_stop_brochure_follow_up`. It stops active/paused brochure enrollments, cancels their pending actions, queued enrollment email jobs, and pending enrollment tasks. The candidate's disposition represents that same terminal decision. The independent acknowledgment/transactional receipt row has no brochure enrollment reference, so this trigger does not select it.
- The task guard changes a pending follow-up task to `cancelled` when the lead has a signed confirmed/completed booking. The resolver must preserve the task update transactionally and allow that guard to win; the isolated baseline does not yet load every production per-visit and booking trigger, so this is not full integration proof.
- The invoice JSON guard validates invoice references on email-job insert or status/metadata update, including cancellation. The receipt guard validates only queued/sending `transactional_notice` payment receipts and requires the referenced payment to remain `paid`. The resolver's prospect filters should leave transactional receipts and invoice work untouched. The isolated suite checks guard behavior and receipt history preservation; it does not replace a full production-trigger execution test.
- Inquiry notification enqueue runs on inquiry insert, not on the resolver's update. Per-visit synchronization and other trigger chains remain outside the supplied trigger-function snapshot and require a complete production-schema fixture before parity can be declared.

## Install transaction proposal

When release gates pass, package the candidate as one reviewed transaction with `SET LOCAL lock_timeout = '5s'` and `SET LOCAL statement_timeout = '60s'`. The transaction must include preflight assertions for all helper signatures and candidate-name collisions, install the exact candidate statements, and postflight assertions for table columns/RLS/ACLs, function signatures/owners/`SECURITY DEFINER`/empty search path/execute ACLs, and seven admission triggers. Abort on any mismatch. Deploy the compatible application with both flags off before changing either flag. The source draft is not install-ready by itself.

Do not install or enable anything until the remaining checks below pass and the exact transaction is separately reviewed and approved.

## Prepared rollback SQL

First disable both application flags and stop new resolver requests. If a database-side hard stop is needed, the following prepared SQL revokes only the three public RPC grants. It deliberately preserves receipts, resolution controls, notes, tasks, and trigger fences. Applying this SQL is a production change and requires the release/rollback approval; it has not been run.

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
revoke execute on function public.luxor_resolve_call_outcome(uuid,uuid,uuid,text,text,text,timestamptz,text,uuid,text) from service_role;
revoke execute on function public.luxor_restart_prospect_workflow(uuid,uuid,uuid,text) from service_role;
revoke execute on function public.luxor_enroll_workflow_with_resolution(uuid,uuid,uuid[],text,boolean) from service_role;
commit;
```

Then redeploy the previous application with both flags off. Do not drop the new tables, delete receipts, or remove admission triggers: doing so could permit a stopped follow-up to be admitted again. Re-enabling requires an explicit forward migration that restores the exact grants after verifying the preserved durable state.

## Remaining release blockers

- Run the new trigger-compatibility SQL in the isolated PostgreSQL runner. The current sandbox denied its prior loopback PostgreSQL connection; do not bypass that policy denial.
- Run a fresh-schema integration fixture that includes current per-visit, post-tour, booking/payment, notification, and all queue triggers. The saved production snapshot lists relevant trigger definitions and bodies but is not itself executable schema parity evidence.
- Finish portal browser flows for all seven call outcomes, retries, light mode and dark mode.
- Finish a production build in an environment permitted to resolve `fonts.googleapis.com`; the previous local build exited on DNS `ENOTFOUND` for that host. Do not work around the network restriction.
- Obtain separately approved release authorization before installing SQL, changing flags, or deploying.
