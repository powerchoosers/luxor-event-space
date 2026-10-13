# Weekday custom rental readiness

## Current checkpoint

Lewis approved Monday–Thursday rentals at $400 per actual rental hour and authorized these edits. He subsequently authorized committing and pushing the safely disabled groundwork to `main` so work can continue in the saved cloud environment after Arianna replies. This permits application-code publication only. Feature activation, production configuration and database application remain held while the scheduling questions sent to Arianna are pending. No production flags or catalog records were changed.

The proposal builder, server calculator, frozen booking context and proposal/email/PDF/agreement summaries support an explicit `custom` rental period. Integer minutes determine the single hourly rental charge; fixed-period extensions do not also apply. Friday–Sunday pricing and existing cleaning, security-rate, tax, deposit and promotion calculations retain their existing paths. Historical proposals and bookings retain their captured terms.

New custom calculation, save, send and acceptance require both server flags and a complete captured owner policy. Missing policy or booking protection fails closed. Only `one_per_date` and `portal_only` can be admitted by this checkpoint. Public time selection is not implemented. The agreement's whole-date exclusivity wording is unchanged.

## Business decisions pending

1. Minimum rental duration; the request gives a two-hour example while existing public copy references three hours.
2. Permitted selection increments, including whether half-hour times are allowed.
3. Whether the 3:00–5:00 PM reset window remains unavailable.
4. One event per date versus multiple events, and the cleanup buffer. Multiple events require a separate Lewis decision and approved reservation terms before conflicting booking behavior can open.
5. Security-hour calculation: actual rental duration with the existing configured minimum, or explicit owner-entered hours.
6. Selection surface: portal proposals only, or a public customer picker as well.

No default answer to these questions has been activated. The pure calculator and draft SQL can model alternate policy values for synthetic review; server admission deliberately holds unsupported policies.

## Database deployment dependency

`weekday-custom-rental-booking-guard.sql` is an unapplied review artifact. Supabase CLI was unavailable in this environment, so it is not a numbered migration. Before activating:

1. Resolve the business policy and obtain independent implementation review.
2. Use Supabase CLI to generate an additive migration from the reviewed SQL. Confirm the connected target contains the intended Luxor tables, expected column types, constraints, RLS and service-role grants; review relevant advisors.
3. Verify scheduling writers use READ COMMITTED. Run real PostgreSQL multi-session checks for competing custom and legacy booking inserts, cancellation/rescheduling, duplicate acceptance, and acceptance retry versus same-day payment finalization. Local PGlite uses a serialized connection and cannot prove these races.
4. Apply the reviewed migration only under the parent-approved deployment plan. Verify the service-only atomic acceptance RPC, trigger, rollback, retry and conflict behavior. Preserve RLS and existing financial finalizers.
5. Deploy reviewed application code with activation disabled. Save the complete approved catalog policy. Enable `LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY` and `LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED` only after database and release checks pass; redeploy if required by environment handling.
6. Recheck new weekday draft pricing, delivery, acceptance and conflict behavior in a safe fixture/test environment before approving customer use. Existing weekend and historical flows must pass again.

The atomic RPC claims the booking and first proposal acceptance together. Direct REST insertion cannot bypass this custom path. A venue-wide transaction lock serializes active scheduling changes; existing legacy bookings reserve their entire date. Missing RPC/schema or conflicting frozen terms returns an explicit held/review error rather than a fallback booking.

## Owner click path after activation

1. Open a lead and create a new proposal in the current venue catalog.
2. Choose a Monday–Thursday event date; the builder switches to custom start/end controls under the approved policy.
3. Choose the rental start and end times, and enter security hours if the approved policy requires them.
4. Review the exact duration, $400 hourly rental line, existing fees, promotions, tax and amount due to book; save the draft.
5. Preview the proposal and paperwork, then use the existing send and agreement workflow. Availability is claimed atomically at acceptance.

Until activation, the existing rental controls remain available and new custom drafts cannot be sent or accepted.

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

Reviewed SQL artifact SHA256: `1E61D9739C3FDE4870348154311E3C101DBD888C02793E9683192BE2F64E83A5`. This evidence does not remove the business, production schema/RLS or real concurrency prerequisites above.

The disabled-publication review confirmed both weekday flags are absent from the connected Vercel project and absent or disabled locally. The exact staged source snapshot, excluding the unrelated working-tree edit, was used for the publication validation. No environment values or catalog settings were changed.

## Cloud continuation

1. Use the saved cloud environment for `powerchoosers/luxor-event-space`, fetch the latest `origin/main`, and read `AGENTS.md` and this document before editing. The unrelated local leads-page edit was deliberately excluded from the groundwork commit.
2. The parent owns Arianna communications. Her verified original weekday request and the six-question clarification are in Gmail thread `1a1326d99a43bfdd`, subject `Weekday`, sender `luxoratlaspalmas@gmail.com`. Read any reply through the authorized Gmail connector; do not send duplicate questions. The examples used in synthetic fixtures are not approved scheduling defaults.
3. Confirm both weekday flags remain absent or disabled and the catalog has no enabled weekday policy. Code presence alone must not activate hourly booking. Standard pricing, legacy booking timing, same-day promotion behavior and current contract exclusivity continue through their existing paths.
4. Incorporate the approved answers locally. A public picker needs implementation and review; multiple events require separate Lewis approval and revised reservation terms. Complete the database and concurrency prerequisites above before proposing activation.
5. Re-run scoped regression fixtures, `npm run typecheck`, `npm run lint -- --quiet`, relevant existing tests and a production build before any further release. Disposable verification belongs outside the repository; do not commit test-only routes or fixtures, secrets, environment files or QA artifacts.
