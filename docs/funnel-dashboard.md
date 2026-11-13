# Funnel Dashboard

Dashboard scope: `src/app/(portal)/portal/leads/page.tsx`, the standalone `LeadsFunnelDashboard`, funnel APIs and model helpers. Existing navigation, Tours, Calendar, other lead tabs and Recent Lead Submissions are preserved.

## Periods and metrics
- Full Sunday–Saturday weeks, calendar months and quarters in America/Chicago, including DST boundaries. New inquiries and daily bars use original creation timestamps.
- Shared eligibility excludes test and deleted records, but preserves legitimate archived/closed-lost historical leads.
- Tours scheduled use original new-visit receipts; completions use actual visit occurrence dates. Proposal sends require successful email history and deduplicate by proposal family.
- Confirmed bookings use durable reservation confirmation history, not tentative `booked_at`. Conversion uses leads created within the selected period and confirmed before its end.
- Deposits count qualifying successful event-deposit transactions, excluding refundable security deposits. Revenue uses audited `received_date` when present, otherwise Chicago `paid_at`; refunded gross receipts and net revenue are not interchangeable.
- Missing historical dates or durable events display unavailable, not fabricated zero. Data issues are shown with the dashboard. Source count/identity validation detects incomplete pagination but does not create an atomic multi-table database snapshot.

## Shared goals
The migration `20261113010000_luxor_funnel_goals.sql` creates only new goals and idempotency-receipt storage. RLS is enabled, ordinary client roles have no access, and the server service role can read goals and execute the permission-checked save function, not directly write the tables. Saves derive the actor from the verified session, enforce settings and leads access, compare revisions, and preserve exact-request retries. Blank targets mean unset; explicit zero is retained. Month/quarter overrides and calendar-length derived targets are supported.

## Checks
- `node --test tests/funnel-*.test.cjs`
- `tests/postgres/funnel-goals-run.ps1`, `funnel-goals-races.ps1`, `funnel-goals-defaults.ps1` on a disposable local PostgreSQL instance only; see their README.
- Repository typecheck, full uncached lint and production build are required before release.
- Rendered QA must cover light/dark, phone/tablet/desktop, period changes, chart scrolling, modal keyboard/focus, shared persistence and conflict/retry states. Unit/static rendering results do not replace browser verification.
- Verify the exact production commit and deployed schema before reporting the dashboard live.
