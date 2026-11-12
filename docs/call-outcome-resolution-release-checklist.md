# Call-outcome resolution candidate

Status: local implementation, NOT deployed or enabled. This is not an installation authorization.

## Independent-review correction verified locally

Standard contact-form workflows must begin with an acknowledgment email and can continue into prospect follow-up. The initial classifier treated this mixed purpose as unknown, rejecting `later`, `nurture`, and `stop`. It was safely fail-closed but incomplete. The completed-acknowledgment-prefix correction now passes 57 executable cases using the actual default workflow shape. It permits prospect replacement only with verified terminal marker/source/receipt ownership, preserves the independent original receipt even while queued/sending/ambiguous, and rejects missing or conflicting evidence atomically. This resolves the identified gap within the tested synthetic migration baseline, not full production parity. Production impact/counts and full catalog parity remain unverified after read-only permission-review timeouts.

## Validation recorded November 12, 2026

- Final combined targeted Node run: 64 passed, 0 failed. Includes call-resolution client/API/modal, SQL-static contracts, enrollment/restart client/API/UI contracts, existing call-continue/call-intent/outcome-review regressions, and custom-workflow authorization. SQL-static checks are not database execution evidence.
- `git diff --check` passed.
- TypeScript `--noEmit` exited 0 on the candidate before the final retry-retention guard and current-task-preview edits. Earlier typecheck attempts and quiet lint returned a network-policy failure for an unrelated telemetry endpoint, not compiler/linter diagnostics. Final-tree quiet lint, production build, and browser end-to-end checks are still unverified.
- Isolated PostgreSQL 17 runner passed on SQL SHA256 `023BF6F3E34AAD8FE7FD67EDD9A498C22E2BDB72EBCEB6AD33D81EC5F427941E`: 57 standard mixed-workflow cases and normalized SMS nurture/restart consent, plus seven next steps for overdue/upcoming tasks, replay/rollback/ACLs, reminder editing, successor preservation, transactional exclusions, mixed enrollment batch, runtime-gate rejection with receipt replay preserved, and three real-producer two-session races. See `tests/postgres/call-outcome-resolution-README.md`. This uses synthetic baseline tables plus relevant real migrations, not full production-schema parity. The local test server was stopped and its port verified closed. No production changes occurred.

## Observed cause

The production form contains guarded note-only paths for reached outcomes, dated follow-ups, stop, and nurture. The optional atomic paths depend on RPCs absent from production. Saving a note therefore cannot reliably complete the task and perform the next step. Repeated saves can leave repeated notes. An overdue date itself is not the demonstrated cause.

## Candidate scope

- One validated `/api/call-outcomes` request and one database transaction for note, outcome, task, chosen action, and receipt.
- Tab-persistent request identity preserves retries after an uncertain response. No legacy fallback after a potentially committed request.
- Tour, proposal, and thank-you open the existing completion screen; they do not claim a booking or delivery occurred.
- Explicit nurture workflow selection, existing permission/consent checks, and a server-side actor.
- Both `LUXOR_CALL_RESOLUTION_ENABLED` and `NEXT_PUBLIC_LUXOR_CALL_RESOLUTION_ENABLED` remain off.
- SQL in `docs/call-outcome-resolution-draft.sql` is guarded against accidental installation.

## Required release evidence

1. Run the candidate against a fresh isolated PostgreSQL database with representative current schema, grants, and real producer functions. Static contract tests are not enough.
2. Test every next step for overdue and upcoming tasks, repeat request IDs, mismatched IDs, no task, changed ownership, active provider claims, and rollback after downstream failure.
3. Race producer admission against stop, manual replacement, nurture, and explicit restart. Verify no duplicate tasks/messages and no transactional-message cancellation.
4. Verify consent and suppression for each channel used by the selected nurture version, and fail closed on unknown workflow purpose.
5. Run typecheck, quiet lint, production build, and UI flows on a local or preview environment. Record actual results, not assumed passes.

## Production sequence requiring separate approval

After all gates pass, present the exact migration, changes to runtime flags, affected pending work, and rollback plan. Do not install SQL, reconcile existing rows, enable flags, or send customer messages as part of local validation.

With that approval: recheck current main and deployed version; stop relevant workers and account for active claims; install reviewed additive SQL; run read-only schema/permission checks; deploy compatible application with flags off; smoke-test on synthetic approved data; enable only the reviewed flags; verify all seven UI paths and database/timeline results; resume workers and check logs/duplicate counts. Any reconciliation or customer send needs its own approved scope.

Rollback disables both new flags and stops new resolver requests. Do not delete receipts or blindly remove durable follow-up controls: doing so can re-admit canceled work. Preserve committed notes/tasks and inspect active jobs before restoring previous worker behavior.
