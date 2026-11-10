# Workflow project handoff

Prepared November 9, 2026. This is a handoff for continuing work, not a completion report. Recheck the current worktree, database, application, and test results before relying on any status below.

## Shipped — QA phase (November 9, 2026)

**Implementation and deploy:** `origin/main` **`07ac774a`** — 30 system-managed workflows, shared builder, settings APIs on **www**, Supabase copy migrations applied. Automated gates (`workflow-pre-push` / release-gates, lookup, queue tests) were green before push.

**What is left:** Owner **acceptance QA** on production (below). No further feature build is required unless UAT finds a defect. Do not treat the project as closed until Arianna (or Lewis) signs the checklist.

**Quick smoke (anyone):** `npm run workflow-www-api-smoke` (routes live). Signed-in: Marketing → Automations → **30** system links open.

## Lewis's intended outcome

Bring system-managed messages into the same workflow builder as custom workflows. Lewis wants applicable system workflows to be fully editable, with real triggers, recipients, timing, consent requirements, status, and steps; a way to restore defaults; and a clear explanation of whether edits affect existing queued messages or future ones. Make capabilities available to manually and AI-created workflows and Elena chat wherever applicable. Show contacts, their current stage, and meaningful workflow analytics.

Inventory **all** system-generated texts and emails, including paths outside the current workflow engine. When Lewis asks Elena in chat or voice which workflow a message belongs to, identify the right workflow from its wording and provide a safe, clickable editor link. Do not guess when attribution is ambiguous. Keep the goal open until the inventory and actual execution paths have been verified.

The motivating example is the inquiry confirmation in `src/lib/luxorTextCampaignsServer.ts`, `queueInquiryTextJobs`, job type `inquiry_confirmation`: “Luxor Event Space: Hi Alessandra, we received your Wedding Reception inquiry and will follow up with availability and next steps. Reply STOP to opt out.” The user wants its trigger, recipients, editable wording, and default restoration in Workflows.

## First steps and guardrails

1. Read the repository `AGENTS.md`, the `luxor-design` skill, and [workflow-message-inventory.md](./workflow-message-inventory.md). Inspect the actual code and `git status -sb` before changing anything. The worktree contains extensive uncommitted workflow work **and unrelated finance work**; preserve all of it. Do not reset, clean, overwrite, or assume every change belongs to this project.
2. The repository is on `main`; Lewis has **not** requested a commit, push, or deployment. Do not create a branch, commit, push, or deploy unless he explicitly asks. Production and local source are different states.
3. Existing checked-in/untracked migrations must be reconciled with the actual target before any database change. Repo policy authorizes needed Luxor schema work after confirming the target has Luxor tables; do not assume these migrations are installed. Verify migration ordering and dependencies, RLS, grants, and applicable advisors. Never weaken RLS or expose secrets. Do not send real email, SMS, calls, charges, or refunds for testing without explicit authorization.
4. Preserve existing deduplication, opt-in and STOP handling, scheduling, cancellation, eligibility and send-time checks, retry/claim semantics, privacy, secure links, document attachments, financial facts, and immutable snapshots. Surface the true behavior of each path, including any exceptions and missing historical attribution.
5. Use Mobbin for targeted inspiration if available, the Luxor design skill, shared portal tokens and controls, and the repo's in-app browser requirement. Check light and dark modes and desktop, 834px iPad portrait, and 390px mobile; exercise controls, focus, scrolling, loading/error states, and overflow. The in-app browser previously timed out attaching to the local page; do not claim visual QA until actually observed. Follow `AGENTS.md` if that remains blocked.

## What exists locally

- `src/app/(portal)/portal/marketing/tabs/AutomationsLibraryTab.tsx` and `src/lib/luxorSystemWorkflowCatalog.ts` list system workflows alongside the workflow library. The catalog currently has 30 entries; the brochure sequence still uses `system-brochure` and `brochure_lead` outside that count. `src/app/(portal)/portal/marketing/custom-workflows/[workflowId]/page.tsx` uses the shared builder shell for numerous system workflows, with individual editors and restore controls. Inspect functionality and limitations rather than treating a catalog entry as proof of full editability.
- Local copy/settings/queue work covers inquiry confirmation text, inquiry and newsletter receipts, tour emails and texts, event messages, payment and invoice reminders, phone replies, brochure delivery, offer and agreement reminders, layout and planner invitations, Zelle instructions, paid-invoice notices, staff-requested payment receipts, and both executed-agreement client and owner copies. The inventory records each origin and known gaps. Several editors deliberately leave generated financial, security, attachment, or scheduling facts protected; assess the original request for full editing and capability parity rather than assuming the current limited fields fulfill it.
- The staff-requested payment receipt uses a fingerprinted review; local changes include copy in that fingerprint and preserve the PDF and retry matching. The client and owner executed-agreement notices have separate local copy settings and preserve PDF, audit attachment, and secure payment facts.
- `SystemWorkflowContacts`, `WorkflowContacts`, `BrochureWorkflowContacts`, and their marketing API routes contain local contact/history work. System histories generally represent jobs or direct attempts, not custom-workflow enrollments; many exclude jobs without a linked inquiry. Check paging, counts, access, stage semantics, legacy/unlinked records, and actual PostgREST JSON filters. Do not present job counts as enrollment analytics.
- `luxorMessageWorkflowLookupServer.ts`, `luxorWorkflowLink.ts`, `luxorWorkflowMatchPermissions.ts`, Elena chat and voice-session routes contain local attribution and permission filtering. Shared job types need origin metadata; unknown and older unmarked jobs may remain unresolved. Verify actual chat **and voice** journeys, privacy, authorization and clickable links, including ambiguous results.
- Local custom-workflow work includes a tour-attended orchestration path, worker and capability gating; the AI architect lists the tour-attended trigger. Inspect migrations, runtime, UI, chat and tests to determine actual parity and remaining missing capabilities. Do not infer broad parity from one trigger.
- Numerous focused Node tests and disposable Postgres harnesses were added. The latest `npm run typecheck` completed successfully for the agreement-client builder snapshot; focused tests and lint passed for the recently edited receipt, agreement-client, attribution, history, and permission paths. Those checks do not prove database installation, production behavior, real delivery, responsive UI, or full scope. Run checks again after further edits. An earlier paid-invoice migration was tested in a synthetic rollback transaction; that is not production installation.

## Remaining work

1. **Reconcile the complete inventory with real execution.** Trace all job producers, workers, direct provider sends, transactional notices, calendar jobs, staff alerts, security/verification mail, manual sends, and AI-generated copy. Local builder work now covers calendar cancellation/updates, agreement package delivery, manual invoice reminders, proposal breakdown, planner verification, agreement owner audit, and the other copy-backed system workflows in the inventory; production Supabase has the workflow copy migrations applied (see item 6 below). Trace further rather than assuming this is exhaustive. Distinguish messages by origin, not just shared job type.
2. **Implement remaining workflow experiences and execution integration.** Provide accurate triggers, timing, recipients, status, consent, editable appropriate content and restore defaults, while keeping required transaction/security details authoritative. Ensure edits reach the actual producer/worker, including direct sends and previews. State the effect on existing queued and retried messages accurately for each path. Keep owner-only messages and audit attachments owner-scoped.
3. **Close the system/custom/AI/chat capability gap.** A first capability matrix lives in [workflow-message-inventory.md](./workflow-message-inventory.md) (local code snapshot). Finish any remaining trigger/step gaps, keep `tour_attended` behavior honest when the DB capability RPC is missing, and verify creation and editing through manual UI, AI architect, and chat/voice as requested.
4. **Finish contacts, stages and analytics.** Confirm correct aggregation, pagination, permissions, stage labels and status for actual workflows, including failed/cancelled jobs, direct sends and historical/unlinked cases. Identify honest limitations where stage data does not exist. Verify against real or safe representative records.
5. **Complete message-to-workflow attribution.** Verify text and email matching through both chat and voice, including safe links, access filtering, ambiguous wording, missing metadata, direct messages, privacy-sensitive messages and older records. Never expose private code contents or fabricate an origin.
6. **Verify migrations and execution paths.** Production Supabase (authorized November 9, 2026) now includes all **35** workflow copy migrations after `luxor_recurring_cost_request_keys`; remote head name `luxor_agreement_package_copy_settings` (`20261110000452`). Settings APIs should report `installed: true` once the app build with workflow routes is what you are browsing (production `www` may still serve an older deploy until push/release). Listing helper: `scripts/list-pending-workflow-migrations.ps1`. Safely exercise edit/save/restore, default fallback, snapshot behavior, scheduled and direct delivery paths, cancellation and rescheduling, STOP/consent, deduplication, retries, attachment/link correctness, finance eligibility and permission fences.
7. **Run visual and code QA.** Verify the real user journeys in desktop, iPad and mobile, both themes, accessible focus and controls. Run appropriate focused tests, `npm run test:custom-workflows`, `npm run typecheck`, and `npm run lint -- --quiet`; read `tests/README.md` before adding a harness. Run a build if required by repository policy or before any explicitly authorized deployment. Investigate failures and preserve unrelated work.
8. **Audit before claiming completion.** For every part of Lewis's original request, identify direct current evidence, distinguish implemented from tested and deployed, and leave the goal active if any required capability, message path, safety invariant, or verification remains missing.

## Release checklist (after explicit authorization only)

1. `git status -sb` — stage **workflow** paths only; leave unrelated finance edits unstaged unless Lewis includes them. Helpers: `scripts/list-workflow-release-paths.ps1` (top section = staged paths; bottom = excluded finance), `npm run verify:workflow-release-coverage` (routes + no finance leaks), then `scripts/stage-workflow-release.ps1` (dry-run `git add` lines) and `-Execute` only after Lewis authorizes. Finance/path exclude rules live in `scripts/workflow-release-scoping.ps1` (single source).
2. `npm run typecheck` and `npm run lint -- --quiet`.
3. Run `npm run workflow-pre-push` (coverage + typecheck + lint + release-gates) or run those steps individually. Run `npm run build` before push. **Local gates (November 9, 2026):** typecheck, lint, build, and release-gates all green; build includes all `system-messages` API routes. `workflow-adopted-preview-admission.test.cjs` stays skipped until `docs/reconciliation/adopted-preview-admission-draft.sql` ships (optional `@electric-sql/pglite`).
4. Commit on `main`, `git push origin main`, confirm Vercel production serves the new commit. Suggested message: `Ship system-managed workflow library, settings APIs, and shared builder for catalog automations` (workflow-only; omit finance paths unless Lewis includes them).
5. `npm run workflow-post-push` (API smoke + next-step reminder). On **www** (production): Marketing → Automations → **System-managed workflows**; open inquiry confirmation, agreement package, calendar messages; confirm `installed: true`, **Load original message** + save (or **Restore default** with `revision` on template routes), save. **Post-release (November 9, 2026):** `origin/main` **`07ac774a`** — `npm run workflow-www-api-smoke` reports **30/30** routes return **401** (not 404). **Signed-in www QA (same day):** inquiry/agreement-package/calendar-messages APIs return `installed: true` and `canEdit: true`; PATCH save on inquiry-confirmation returned **200** (reverted to default body immediately); Elena chat `find_message_workflow` resolved inquiry copy to `system-inquiry-confirmation` with internal workflow link; voice and contacts-with-live-rows still open.
6. QA light then dark; desktop, ~834px iPad, ~390px mobile; Elena chat/voice `find_message_workflow` on a known sent message. `scripts/workflow-www-qa-urls.ps1` prints all 30 builder URLs for spot checks after deploy. `scripts/workflow-www-api-smoke.ps1` reports whether production APIs still return **404** (pre-deploy) vs **401/403** (routes live). Signed-in `installed` sweep: `scripts/workflow-www-settings-queries.ps1` (includes `receipt-email?key=` and `phone-text?kind=`).

## Completion audit snapshot (November 9, 2026)

| Requirement | Evidence | Status |
| --- | --- | --- |
| 30 system workflows in shared builder | **www** Automations lists **30** system-managed links (`07ac774a`); local QA retained | **Done on www** (library) |
| Restore defaults | Settings `PATCH` + route tests (`restoreDefault` / `copy === null`) | **Tested**; www **Load original message** + queued-vs-future copy present; UI restore = default body + save with `revision` (bare `restoreDefault` without `revision` returns 400 by design) |
| Contacts / history | `SystemWorkflowContacts`, contacts route tests (49) | **www verified** — inquiry **18** jobs; agreement package **2**; calendar **3** (manual invoice **0** on page 1) |
| Elena attribution + safe links | Lookup, permissions, chat/voice delegation tests (90+ batch) | **www chat verified**; voice **route** live (auth POST → **502** OpenAI handshake); spoken `find_message_workflow` journey unverified |
| Inventory + non-builder paths | `workflow-message-inventory.md` + `workflow-inventory-paths` test | **Paths + lookup rules** — `message-workflow-lookup.test.cjs` (31) covers non-builder `inquiry_notification` and origin splits; live send traces still incomplete |
| Queue vs future copy | Builder save feedback strings; inventory matrix | **Implemented**; `system-text-queue` + `inquiry-system-message` tests green; prod queue mutations not exercised |
| Supabase copy schema | Remote head `luxor_agreement_package_copy_settings`; **35** workflow migrations in scoped commit (`luxor_system_message_templates` through `luxor_agreement_package_copy_settings`) | **DB applied**; shipped in `07ac774a` on `origin/main` |
| Deployed app | `origin/main` `07ac774a`, APIs **401** on all 30 routes | **Shipped**; signed-in sweep **28/29** settings GETs return `canEdit: true` (`receipt-email` needs `?key=`); voice + non-builder runtime traces open |
| Workflow-only staging | n/a (pushed) | **Done** |
| Responsive / dark QA | 390px mobile + 834px + portal dark (`luxor-portal-theme`) on `system-inquiry-confirmation`; automations list at 834px | **www verified** — 390px calendar + **390px dark** inquiry (`data-portal-theme=dark` via Settings → Branding); 834px + desktop dark; theme back to **light** after QA |
| Capability parity (AI / tour_attended) | Architect readiness + tour orchestration tests | **Partial** — www `GET /api/marketing/custom-workflows` lists `tour_attended` in `connectedTriggers`; prod RPCs present; enrollment UI not smoke-tested |

Project **closes** when the acceptance checklist below is checked off (or defects are filed and fixed).

## QA acceptance checklist (www, light mode first)

Use [https://www.luxoratlaspalmas.com/portal/marketing?tab=automations](https://www.luxoratlaspalmas.com/portal/marketing?tab=automations). Helpers: `scripts/workflow-www-qa-urls.ps1` (all builder links), `scripts/workflow-www-settings-queries.ps1` (optional DevTools `installed` sweep).

### Required (sign-off)

- [ ] **Library** — System-managed workflows shows **30** entries; each link opens a builder (no 404).
- [ ] **Inquiry confirmation text** — Trigger copy, contacts/history, message field; **Load original message** → small edit → **Save changes** → load original again → save; read queued-vs-future note.
- [ ] **Event Agreement package** — Multi-step lane; **Customize copy**; save one field if comfortable (or confirm read-only protected fields are labeled).
- [ ] **Calendar cancellation and updates** — Two steps; save feedback; contacts if any rows exist.
- [ ] **Missed-call reply** — STOP/consent trigger text; do not toggle automation off/on unless intentional.
- [ ] **Elena chat** — Paste a phrase from a recent inquiry confirmation text → workflow card → link stays on `luxoratlaspalmas.com` and opens the right builder.
- [ ] **Themes** — Light pass on desktop; **Settings → Branding → Light/Dark** (or account **Appearance** on desktop); quick phone-width check on one builder.

### Optional (nice to have before “fully verified”)

- [ ] **Elena voice** — Ask which workflow sent a known text; confirm on-screen workflow card (if voice fails to start, note OpenAI/voice config — not a workflow-builder bug).
- [ ] **Spot tour** — Open 5 more system workflows from the list (your highest-volume messages); confirm triggers and contacts panels load.
- [ ] **Custom workflow** — Create Workflow → confirm **Tour was completed** (`tour_attended`) appears as a trigger (connected on production).
- [ ] **Elena negative** — Ask about an internal staff alert subject; Elena should **not** invent a customer workflow link.

### Out of scope for UAT (engineers only unless Lewis authorizes)

- Live SMS/email sends, queue cancellation drills, STOP keyword tests on real numbers.
- Editing production copy you do not intend to keep (use load-original + save to revert).

## Useful entry points

- Builder and library: `src/app/(portal)/portal/marketing/custom-workflows/[workflowId]/page.tsx`, `src/app/(portal)/portal/marketing/tabs/AutomationsLibraryTab.tsx`, `src/lib/luxorSystemWorkflowCatalog.ts`.
- Runtime and messaging: `src/lib/luxorCustomWorkflowRuntimeServer.ts`, `src/lib/luxorCustomWorkflowsServer.ts`, `src/lib/luxorTextCampaignsServer.ts`, `src/lib/luxorEmailJobsServer.ts`, `src/lib/luxorPhoneRoutingServer.ts`, and the individual creation paths in the inventory.
- Chat and voice: `src/app/api/portal/elena-chat/route.ts`, `src/app/api/portal/elena-chat/voice-session/route.ts`, `src/lib/luxorMessageWorkflowLookupServer.ts`, `src/lib/luxorWorkflowChatProgress.ts`.
- Settings and migrations: `src/app/api/marketing/system-messages/`, `src/lib/*Copy*`, and `supabase/migrations/`. Inspect exact dependencies and current installed state.
- Tests: `tests/*workflow*`, `tests/*email*`, `tests/*reminder*`, and `tests/postgres/`; choose tests based on the paths actually changed.
