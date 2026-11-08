# Inquiry follow-up workflow — handoff (2026-11-08)

Standing doc for Lewis before commit/push. **No production SQL install, reconciliation apply, or customer sends** unless you explicitly authorize those steps.

## Two trees

| Location | Role |
| --- | --- |
| `luxor-event-space` (`main` working tree) | Portal UX, workflow API routes, types, unit tests — **use `npm run dev` on port 3000** |
| `Codex/.../luxor-workflow-main-integrated` | Scoped SQL drafts, PG17 race harness, reconciliation notes — **not merged into `main` yet** |

Removed duplicate **`.env.local`** from the Codex checkout (use only the repo root copy).

## Selective commit

`docs/inquiry-follow-up-commit-scope.md` lists workflow-only paths so you can stage them apart from finance/ops/Elena work. Local `main` was **7 commits behind `origin/main`** at last fetch — pull or rebase before push, and keep workflow vs finance commits separate if you want a clean history.

## Verified locally (run before you commit)

**Main repo**

```bash
npm run typecheck
npm run test:workflow-portal
```

**Codex workflow checkout** (Postgres password required)

```bash
npm run test:scoped-workflow
npm run test:postgres-local
npm run test:postgres-races
```

## Portal on 3000

- One visible brochure call step per enrollment (`partitionLeadTasksForDisplay`)
- `LeadCurrentWorkflowEmail`, `LeadTaskActivity`, workflow preview routes
- Optional `.env.local` flags for atomic call paths (server + public):

  - `LUXOR_ORDERED_WORKFLOWS_ENABLED=true`
  - `LUXOR_ATOMIC_CALL_CONTINUE_ENABLED=true`
  - `LUXOR_ATOMIC_CALL_INTENT_ENABLED=true`
  - `NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED=true`
  - `NEXT_PUBLIC_LUXOR_ATOMIC_CALL_INTENT_ENABLED=true`

Atomic RPCs stay **disabled in API** until those server flags are true; production DB still has duplicate pending tasks until reconciliation apply.

## Still blocked for production release

1. Apply scoped install bundle (Supabase) — drafts under `Codex/.../docs/reconciliation/`
2. Old-worker retirement proof + full-schema races (disposable 21/21 is exploratory only)
3. Reconciliation **apply** — dry-run: `reconciliation-artifacts/dry-run-refresh-2026-11-08.json` (`writesAllowed: false`)
4. Rebase/merge Codex draft onto fresh `origin/main` without unrelated finance if you want one branch
5. Deploy only after the above + your sign-off

## QA pointer

`reconciliation-artifacts/portal-qa-2026-11-08.md` — Lucia Hernandez lead for Tasks / Activity checks.
