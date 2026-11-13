# Funnel Dashboard request intake — November 12, 2026

Source: Arianna's “Leads Funnel Dashboard updates” email and attached reference. This is a separate request from the call-outcome repair. No dashboard application changes have been made during intake.

## Required scope

Preserve Luxor branding, navigation, tabs, six-card KPI positioning, and the left Sales Funnel card. Add a compact Weekly/Monthly/Quarterly selector, date navigation, and Edit Goals modal. Default current Sunday–Saturday week in America/Chicago. Keep only metric names and numbers in the KPI strip. Replace the right dashboard tours card with gold daily lead bars and dashed configured daily-goal line; preserve tour management in existing Tours/Calendar. Monthly/quarterly charts retain daily granularity without crowding.

Goals must persist in the database across devices: daily/weekly/monthly/quarterly/annual targets for inquiries, tours scheduled/completed, proposals, booked events, optional revenue. Derive calendar-length totals from daily goals, including leap February; support explicit monthly/quarterly overrides. Example figures are not actual statistics. Funnel percentages represent actual/goal, display >100% honestly, cap only the bar width.

## Confirmed current implementation

- `src/app/(portal)/portal/leads/page.tsx`, `LeadsDashboard`, approximately lines1118–1400, owns this dashboard. This differs from the call-outcome detail route `leads/[id]/page.tsx`.
- Current counts use lead status snapshots, not selected-period events: new=status new; proposals=status proposal_sent; deposits=status booked. Tours also use current inquiry status/attendance. These are not valid substitutes for the requested historical metrics.
- `luxorTourMetrics.ts` has reusable Chicago date-key helpers, pagination and tour filtering, but its current presets are rolling/month-to-date, not the requested full calendar week/month/quarter windows.
- `luxorAnalyticsServer.ts` contains broader reporting and should be reviewed for reusable loaders, not treated as proof its existing definitions match this request.
- Source includes `luxor_tour_visits`, payment `paid_at` and installment metadata, proposal families/send attempts and durable delivery receipts. `luxorProposalDeliveryReceipt.ts` distinguishes real delivered proposal/breakdown receipts. Do not count all invoice status=sent or drafts as successful proposal delivery.
- No funnel-goal implementation was found in the bounded source/migration search. Inspect persistence conventions before adding a narrowly scoped, permissioned goals table/API.

## Data contract required before UI changes

Use original inquiry creation timestamps for leads/chart. Use actual tour booking creation and completion/outcome timestamps, actual proposal-send events, and successful deposit-payment records with deduplication. Exclude tests/deleted records, failed payments, drafts and unsent proposals. Do not equate booked status with a deposit transaction. Confirm whether deposits KPI counts successful transactions or distinct bookings with a first qualifying deposit and label consistently.

Keep period activity counts separate from created-lead cohort conversion. Define the cohort cutoff explicitly (for example, leads created in period that booked by period end) rather than dividing unrelated bookings this period by new leads this period. Inspect historical timestamp completeness; do not invent event dates from updated_at or silently substitute zero for unavailable data.

## Suggested bounded implementation

Extract a dashboard-only component/model, use a dedicated period analytics response shared by KPI/chart/funnel, and a separately permissioned persistent goals API with optimistic revision control. Preserve unrelated lead tabs and behavior. Existing call-outcome changes must not be staged, reverted, or deployed as part of this request accidentally.

Test Sunday boundaries, Chicago DST, leap years, quarter/year navigation, calendar-length goal calculation/overrides, zero/missing goals, >100% progress, deduplication, failures/exclusions, cross-period bookings versus cohorts, saved goals across reloads, and chart/KPI consistency against actual records.

Production schema/record verification is still needed. Existing call-outcome catalog calls timed out; no new production writes or catalog workaround was attempted for this intake.
