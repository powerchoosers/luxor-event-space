# Inquiry follow-up — suggested commit scope (main)

Use this when you want a **workflow-only** commit separate from finance/ops edits. Paths are relative to repo root. Review `git status` before staging; some portal files may mix concerns.

## Core workflow port (this effort)

- `docs/inquiry-follow-up-release-handoff.md`
- `docs/inquiry-follow-up-commit-scope.md` (this file)
- `package.json` (adds `test:workflow-portal` only — verify diff)
- `src/lib/luxorFollowUpHelpers.ts`
- `src/lib/luxorInquiryTypes.ts` (task adoption fields)
- `src/lib/luxorActivityDates.ts`
- `src/lib/luxorCallStopIntent.ts`
- `src/lib/luxorLegacyAdoptionServer.ts`
- `src/lib/luxorNextFollowUpDisplay.ts`
- `src/lib/luxorOrderedBrochurePlan.ts`
- `src/lib/luxorWorkflowEmailActivity.ts`
- `src/lib/luxorWorkflowProgression.ts`
- `src/lib/luxorWorkflowTentativePreview.ts`
- `src/lib/luxorFinancialPlanningForecast.ts` (one-line null guard for typecheck — touch only if you keep workflow commit buildable)
- `src/components/portal/LogCallOutcomeModal.tsx`
- `src/components/portal/LeadScheduledWorkflowEmail.tsx`
- `src/components/portal/LeadTaskActivity.tsx`
- `src/app/(portal)/portal/leads/[id]/page.tsx`
- `src/app/api/workflow-call-continue/`
- `src/app/api/workflow-call-intent/`
- `src/app/api/workflow-current-email/`
- `src/app/api/workflow-next-preview/`
- `src/app/api/workflow-review/`
- `tests/ordered-workflow-task-display.test.cjs`
- `tests/workflow-*.test.cjs`

## SQL drafts + PG17 gates (stay in Codex checkout until merge plan)

`C:\Users\lewis\Documents\Codex\2026-11-07\task\luxor-workflow-main-integrated\`

- `docs/reconciliation/*` (install-blocked drafts)
- `tests/postgres/*`, `tests/scoped-*.test.cjs`
- `supabase/migrations` there only if you intentionally merge migration drafts

Do **not** copy `docs/reconciliation/*.sql` into production without explicit install authorization.

## After staging workflow files

```bash
npm run typecheck
npm run test:workflow-portal
```

Codex checkout (optional same day):

```bash
npm run test:scoped-workflow
npm run test:postgres-races
```
