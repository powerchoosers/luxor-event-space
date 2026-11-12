# Call-resolution isolated PostgreSQL checks

Run from PowerShell on Windows with PostgreSQL 17 and Node installed:

```powershell
powershell -NoProfile -File tests/postgres/call-outcome-resolution-run.ps1
```

The runner refuses an occupied port, creates a unique temporary cluster/database, binds only `127.0.0.1:55439`, uses local trust authentication, and stops its cluster in `finally`. It changes no Windows service/firewall setting and never connects to production or a prior database. It preserves the disposable directory for inspection. The SQL installation guard is removed only from the temporary test copy, never from the repository candidate.

## What this proves

The baseline combines the repository's **synthetic** core/custom-workflow schemas with actual relevant brochure, workflow, deduplication, recipient-fence, and manual-task migrations. It is **not the full production schema**. No provider is invoked and no email/text is sent.

- All seven next steps, each with an overdue and upcoming call task.
- Exact receipt replay, changed payload rejection, no duplicate note, past-date rollback, execute ACLs.
- Persisted manual reminder rescheduling.
- Standard mixed-workflow fixture generated from the actual application default; completed prefix proof, receipt/marker history preservation, safe independent receipt states, forged/missing/owned/future transaction rejection, and exact replay.
- Ten-digit lead phone matching canonical +1 marketing SMS consent for nurture and explicit restart.
- Prospect stopping with acknowledgment-only enrollment/transactional notice preservation and stale prospect task rejection.
- Existing brochure successor preserved and existing custom step-run count unchanged for no-next-step.
- Mixed fenced/unfenced explicit enrollment, all-or-nothing rollback when a later member is ineligible, canonical reordered replay. The disabled `p_allow_new=false` gate rejects a new batch without state changes while allowing exact receipt replay.
- Separate PostgreSQL sessions exercising the real manual-enrollment producer: resolver-first, producer-first, and durable committed-stop admission.

The producer may wait on its source-event foreign-key lookup before reaching the admission trigger. Therefore resolver-first tests assert rejection after the stop commits, not an immediate NOWAIT error. Deliberately expected SQL errors appear in concurrency output before PASS lines.

Not covered: complete production-schema parity, production roles/catalog drift, every brochure/custom sender/claim race, live deployment verification, or real UI/browser behavior. Those remain release checks.

## Source versus generated evidence

Commit candidates are `call-outcome-resolution-baseline.sql`, `-assertions.sql`, `-exclusions.sql`, `-successors.sql`, `-batch.sql`, `-existing-triggers.sql`, `-mixed.sql`, `-mixed-build.cjs`, `-sms.sql`, `-concurrency.cjs`, `-run.ps1`, and this README. Files matching `call-outcome-resolution-*.log`, `*.log.stderr`, and `call-outcome-resolution-instance.txt` are generated local evidence and should not be committed. The instance text contains the path from the initial exploratory run, not a reusable server address. Preserve logs locally when diagnosing a failure. Temporary cluster directories and their copied SQL are outside the repository.
