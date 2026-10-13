# Weekday custom rental readiness

## Current checkpoint

Lewis approved Monday–Thursday rentals at $400 per actual rental hour. Arianna's authenticated replies in the original `Weekday` email thread resolve the operating rules: three-hour minimum, whole-hour start/end increments, access through the 3:00–5:00 PM reset, one event per date, portal proposals only, and security calculated from guest arrival through event end using the existing rate and officer-count rules with the existing four-hour minimum. Any selectable time remains inside the current 6:00 AM–1:00 AM venue access window.

The proposal builder, server calculator, frozen booking context and proposal/email/PDF/agreement summaries support an explicit `custom` rental period. Integer minutes determine one hourly rental charge; fixed-period extensions do not also apply. New version-2 snapshots capture the resolved schedule and security basis. Version-1 snapshots remain readable with their original terms, but cannot be accepted as new custom bookings. Friday–Sunday pricing, cleaning, existing security rates and officer tiers, tax, deposit and promotion calculations retain their existing paths. Existing proposal and booking snapshots are not rewritten. New version-2 policies and snapshots require a zero-minute additional cleanup buffer. The existing 6:00 AM–1:00 AM access window supplies the natural overnight gap; no extra cleanup interval is added to cross-date conflict checks.

New custom calculation, save, send and acceptance remain held behind both server flags and the database booking guard. The code does not change flags or the saved catalog policy. Public time selection is not implemented. The agreement's whole-date exclusivity wording is unchanged.

## Business decisions

The minimum, increment, reset window, per-date capacity, zero additional buffer and proposal surface are fixed in the new-policy validator. Security uses `max(4 hours, guest-arrival-to-event-end duration)` multiplied by the existing security hourly rate and the existing guest-count officer tier. This rules out a guest-entered override for new policy snapshots.

## Database deployment dependency

`supabase/migrations/20261013044133_luxor_weekday_custom_rental_booking_guard.sql` was generated with Supabase CLI 2.120.0. It is a review-only migration and has not been applied. Before activation:

1. Obtain the final readiness review and confirm the exact approved catalog policy values.
2. Review the already generated numbered migration against the SQL artifact and target schema. Confirm the connected target contains the intended Luxor tables, expected column types, constraints, RLS and service-role grants; review relevant advisors. The migration creates/replaces three protected functions and grants their execution to `service_role`; it does not alter table grants or RLS policies.
3. Verify scheduling writers use READ COMMITTED. Run real PostgreSQL multi-session checks for competing custom and legacy booking inserts, cancellation/rescheduling, duplicate acceptance, and acceptance retry versus same-day payment finalization. Local PGlite uses a serialized connection and cannot prove these races.
4. Apply the reviewed migration only under the parent-approved deployment plan. Verify the service-only atomic acceptance RPC, trigger, rollback, retry and conflict behavior. Preserve RLS and existing financial finalizers.
5. Deploy reviewed application code with activation disabled. Save the complete approved catalog policy. Enable `LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY` and `LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED` only after database and release checks pass; redeploy if required by environment handling.
6. Recheck new weekday draft pricing, delivery, acceptance and conflict behavior in a safe fixture/test environment before approving customer use. Existing weekend and historical flows must pass again.

The atomic RPC claims the booking and first proposal acceptance together on the server application path. The trigger protects schedule consistency and conflicts, but it is not an authorization boundary against a caller that already has `service_role` authority; such a caller retains its existing direct table-write authority. A venue-wide transaction lock serializes active scheduling changes; existing legacy bookings reserve their entire date. Missing RPC/schema or conflicting frozen terms returns an explicit held/review error rather than a fallback booking.

## Owner click path after activation

1. Open a lead and create a new proposal in the current venue catalog.
2. Choose a Monday–Thursday event date; the builder switches to custom start/end controls under the approved policy.
3. Choose the rental start and end times. Security is calculated automatically from guest arrival through event end, at the existing rate and officer tier, with a four-hour minimum.
4. Review the exact duration, $400 hourly rental line, existing fees, promotions, tax and amount due to book; save the draft.
5. Preview the proposal and paperwork, then use the existing send and agreement workflow. Availability is claimed atomically at acceptance.

Until activation, the existing rental controls remain available and new custom drafts cannot be sent or accepted. No activation flag, catalog setting, production database, customer record, credential, or legal term was changed during this continuation.

## Local verification — October 13, 2026

Pre-publication baseline HEAD and `origin/main` reference: `c0efb8b15cf32ef5ca4c767a950746de66511594`. The initial local checkpoint performed no commit or deployment. The subsequent owner-authorized publication checkpoint includes these disabled source changes and review artifacts only; no production database application, catalog write or activation is included. The release commit is the commit containing this document.

| Check | Result |
| --- | --- |
| Pricing fixtures | 352 assertions passed, including 189 complete legacy/fixed-output parity checks |
| Independent server fixtures | 234 assertions passed for gates, malformed terms, exact quantities, historical terms, retries and minute precision |
| Final send-route regression | 91 assertions passed; editable sent/paid status alone cannot bypass readiness, and rejected sends perform zero provider/database work |
| Disabled-publication compatibility | 52 assertions passed; legacy booking and agreement-queue timing payloads exactly match the baseline, while custom terms retain strict validation |
| SQL review fixtures | 88 PGlite assertions passed; serialized local verification only |
| Actual proposal-builder fixture | 261 assertions passed at 390, 768 and 1440 px, light/dark; no console errors, external/failed requests or horizontal clipping |
| Rendering | Initial 29 assertions plus 16 final label regressions passed; real invoice and agreement PDFs generated from synthetic data |
| Existing follow-up regression command | `npm run test:follow-ups`: 14/14 passed |
| Required application checks | `npm run typecheck`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` passed after final source changes |

Chrome was unavailable in the session, so browser QA used an existing standalone Playwright runtime. The actual builder component was bundled into a disposable fixture with synthetic auth/pricing/database responses; assets were fulfilled in memory. This was not authenticated production portal verification. Disposable scripts, bundles, PDFs, screenshots and the Chromium debug log were removed.

Independent final review found no remaining source blocker for the held local checkpoint. It confirmed unchanged legal exclusivity, preserved weekend/historical paths and correction of the status-only publication bypass. The unrelated `src/app/(portal)/portal/leads/page.tsx` edit remains untouched; its SHA256 is `2DDE7868A8F99628E16A5B4D74485970FC245C91F451D607396C8CDB83E04C34`.

Reviewed SQL artifact SHA256 before the follow-up corrections: `1E61D9739C3FDE4870348154311E3C101DBD888C02793E9683192BE2F64E83A5`. This evidence does not remove the business, production schema/RLS or real concurrency prerequisites above.

The disabled-publication review confirmed both weekday flags are absent from the connected Vercel project and absent or disabled locally. The exact staged source snapshot, excluding the unrelated working-tree edit, was used for the publication validation. No environment values or catalog settings were changed.

## Cloud continuation after Arianna’s answers — October 13, 2026

The checkout was verified on `main` at the parent-authorized starting commit `b56476a048dc3982d114841b8b31854d07f803e8`. Arianna’s six answers were available in the supplied handoff; no Gmail polling or customer messaging was performed. Implementation changes and the generated migration are pushed to `main` and remain disabled/unapplied. The unrelated `src/app/(portal)/portal/leads/page.tsx` work remains untouched.

| Check | Result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| Lint | `npm run lint -- --quiet` passed |
| Existing follow-up tests | `npm run test:follow-ups`: 14/14 passed |
| Production build | `npm run build` passed; 146 pages generated |
| Actual proposal-builder browser fixture | Passed with synthetic pricing/promotions; guidance rendered, time menus provided whole-hour choices through 1:00 AM next day, 390px viewport had no horizontal overflow. Fixture was removed. |
| Isolated PostgreSQL 17 | Migration applied to a disposable synthetic schema; policy validation, acceptance retries, competing inserts, cancellation/reschedule and finalizer lock races passed across independent sessions. `anon` and `authenticated` cannot execute protected functions. This does not verify the production schema/RLS. |
| SQL consistency | Review artifact matches generated migration body; `git diff --check` passed |

The migration has not been applied. No credentials, customer records, legal wording, catalog values, flags or production data were changed. Browser and PostgreSQL checks use temporary synthetic fixtures; no test route or test artifact is included in the repository.

## Read-only production review — October 13, 2026

The Supabase connector verified active project `ofjvbzdwijjnajgjotmx` (PostgreSQL 17.6.1.141). Read-only catalog inspection found default pricing catalog version 12 with no `luxor_costs.weekday_custom_rental` policy. The three target tables exist with the expected migration columns and types: `luxor_bookings.invoice_id` is UUID and unique, booking date/time fields are `date`/`time without time zone`, invoice proposal context is `jsonb`, and inquiry status is `text`. RLS is enabled on all three target tables (not forced); their current policies grant table operations to `service_role`. The new weekday functions and trigger are absent, as expected before migration. Independent review confirmed the database default is READ COMMITTED with no role/database override, and the existing same-day finalizer uses a compatible invoice-first lock order. No database write was made.

The migration's schedule guard remains an integrity/conflict check, not an authorization boundary against a caller that already has `service_role` table-write authority. The acceptance RPC is used by the server application path; a privileged service-role caller can still write directly under its existing table authority.

## Follow-up fixes after independent review

Version-2 policy validation now requires `cleanup_buffer_minutes = 0`, while historical version-1 snapshots retain their frozen values. SQL snapshot validation now rejects missing, JSON-null, string, and unsupported numeric versions before the trigger or acceptance RPC can treat a snapshot as valid. The version-2 zero-buffer and version-fail-closed regression cases ran in disposable TypeScript and PostgreSQL 17 fixtures; the concurrent booking, acceptance retry, cancellation, reschedule, and finalizer-lock checks were rerun in that synthetic database. Cross-date regression checks preserve the historical overlap rejection and allow adjacent version-2 late/early rentals across the natural 1:00–6:00 AM gap. `npm run typecheck`, `npm run lint -- --quiet`, `npm run test:follow-ups` (14/14), `npm run build` (146 pages), and `git diff --check` passed after the changes. Typecheck was rerun after clearing stale `.next/dev` route types from the removed browser fixture. These checks do not replace the production metadata review above or a controlled migration rollout.

Updated SQL review artifact SHA256: `bffebdccd028f51c1b1f24e40745f50ddc267c69027cdbc94c5455d599b7015c`.

## Cloud continuation

1. Preserve the unrelated `src/app/(portal)/portal/leads/page.tsx` edit from the previously published branch; it was deliberately excluded from the groundwork commit and remains untouched.
2. Keep activation, catalog writes and migration application held until the final readiness review. Validate the migration against production schema/RLS, then proceed only under the approved deployment plan.
3. Do not commit temporary test routes, fixtures, secrets, environment files or QA artifacts.
