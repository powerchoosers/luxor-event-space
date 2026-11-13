# Funnel goals disposable PostgreSQL checks

Run from Windows with PostgreSQL17 binaries installed:

```powershell
powershell -NoProfile -File tests/postgres/funnel-goals-run.ps1
```

Optional `-Bin` selects the installed PostgreSQL bin directory. `-Port` must be an unused high local port (default55441). The runner creates a unique directory beneath the OS Temp directory, initializes a fresh local database, binds only127.0.0.1, and stops it in cleanup. It never uses production configuration, Supabase credentials, customer records or external network destinations. Logs and database state stay outside the repository. Keep those local outputs uncommitted.

The SQL bootstrap and assertions are byte-preserved from the actual executed fixture. Race/default-grant scripts preserve that tested logic with only portable path/bin/port parameters. The runner adapts the installation phase to the promoted, checked-in migration instead of removing the draft guard. The adapted scripts were PowerShell syntax-checked, not rerun after promotion because executable migration statements were verified identical.

## Verified source identity

- Tested guarded draft SHA256: `2bf4007cc5341532d6385b67afcea6c1c97fb9fc9f7715ca185a3182e909e567`.
- Promoted migration SHA256: `29b06c63b58f3818edc9a8983b2cb49a058cb4403e3c2353c8df2df9af4e0e02`.
- Executable SQL is byte-identical after CRLF normalization and removal of comments plus the one explicit draft installation guard. Transaction boundaries are retained. No substantive SQL change was found.

## Executed evidence, November13 2026

PostgreSQL17.11 passed:
- Draft installation guard aborts within its transaction, leaving no goals objects.
- Actual migration installation; complete goal validation, extra-key/fraction count/fraction-cent rejection and0.29 acceptance.
- Active owner/editor writes; leads-only staff and suspended owner rejected.
- Initial save, later edit, original immutable replay after later edit, stale revision conflict and request-ID/payload collision.
- Goal/receipt rollback atomicity.
- RLS enabled; anonymous/authenticated no access; actual service_role read+RPC allowed, direct update denied, receipt read/write denied.
- Two-session competing initial writes with observed database lock wait: one revision/receipt, second writer conflicts.
- Two-session identical request replay with observed database lock wait: one revision/receipt, both receive success.
- Repeated assertions with production-like broad default table/function grants, proving explicit revokes close those defaults.

Read-only production parity found the required Luxor tables and portal-member field types; new funnel goals objects were absent. No production migration was applied by this harness or reviewer. This is synthetic local database proof, not authenticated browser/two-device or production runtime acceptance. Final production object ownership, ACL/RLS and API behavior must still be checked after authorized migration.
