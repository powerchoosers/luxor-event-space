# Phase 5: Bills & Vendor Management — completion report (draft)

**For:** Arianna Patterson  
**From:** Luxor implementation (Lewis)  
**Date:** November 8, 2026  
**Status:** **Feature-complete in source with end-to-end UAT on prod data; release not done.** Payment, reminders, vendor profile, archive/restore API, and vendor PDF upload/download are verified at `localhost:3000` (Nov 8 evening). **Before ship:** merge `origin/main` (+7), scoped commit, push, Vercel verification, Arianna light-mode pass on production.

This report maps Arianna’s November 7, 2026 Financial Center brief (Gmail `1a1b90d31abc60a7`) to what is implemented, how it integrates, and what remains honestly limited.

---

## 1. Bills dashboard

**Delivered**

- `/portal/finances/bills` — KPI strip (outstanding, due this month, overdue, paid this month, next 30 days) uses **known** linked balances only; bills that need reconciliation are excluded from dollar totals and called out in copy.
- Payment trend chart uses recorded expense payments; incomplete histories are excluded with an explicit count.
- Bill reminders section reads saved preferences from `luxor_bill_reminder_preferences` and lists bills only when `getBillBalance` certifies a positive remaining balance (no invented amounts).

**Limits**

- With no bill→expense links or incomplete payment history, KPIs show **Known $0.00** and reconciliation warnings — by design, not a bug.

---

## 2. Bills management

**Delivered**

- Bills table with search, status filter, sort, vendor links, and links into Operations bill review.
- Manual bill entry with unknown amounts, durable **request id** fingerprint (`luxor_manual_bill_request_id` on production) to avoid duplicate manual bills after a lost response.
- Archive/restore for bills and vendors in Operations (`luxor_bills.archived_at`, `luxor_vendors.archived_at`); archived rows stay visible with labels. Operations vendor loads now include `archived_at` so the archive panel can toggle **Restore** after reload.
- Payments are recorded in **Expense Management**, not as optimistic UI-only actions on the ledger.

**Limits**

- Partial pay and full pay follow the expense payment flow; bills marked paid without verified expense payment lines do not count toward “paid this month” KPIs.
- Scheduling = **payment plans** (planned amounts/dates), not automatic money movement.

---

## 3. Bill detail & payment history

**Delivered**

- Operations bill review shows balance reason, payment planning, reminder preferences, and links to linked expense payment history when `source_bill_id` is set.
- Individual payment lines show date, amount, method, reference when present on the expense.

**Limits**

- Plans do not create payments; closing a plan after review does not post cash.

---

## 4. Vendor directory

**Delivered**

- Vendor list on Bills page with search; **Manage vendors** links to Operations.
- Vendor profile at `/portal/finances/bills/vendors/[id]` with company details, bills, intake history, and documents.

**Limits**

- There is no separate `/portal/finances/bills/vendors` index URL (directory lives on the main Bills page).

---

## 5. Vendor financial profile

**Delivered**

- Extended profile fields (contact, website, mailing address, finance category, internal notes) after Phase 5 schema.
- **Original bill amount** labeling; vendor-wide totals withheld when balances cannot be certified.
- Per-bill payment activity listed from linked expenses when the link is 1:1.

**Limits**

- Billed/paid/outstanding **vendor totals** stay unavailable until lifetime payment history can be attested (handoff Priority 1).

---

## 6. Recurring obligations

**Delivered**

- Recurring section on Bills page reads **Phase 3** `luxor_expense_templates` only — no second recurrence engine.
- Copy states obligations ≠ payments; links to Expense Management recurring templates.

---

## 7. Payment tracking consistency

**Delivered**

- Shared `luxorBillBalances` / `luxorExpenseAmount` / finance reporting helpers: unknown and variable amounts, invalid payment dates, and paid-without-lines do not certify balances.
- Financial Overview and Bills share the same withholding rules where wired in this branch.

**Limits**

- Full cross-module parity depends on shipping this branch without regressing unrelated finance files mixed in the working tree.

---

## 8. Configurable reminders

**Delivered**

- Per-bill toggles: 7 days, 3 days, due date, overdue — saved to `luxor_bill_reminder_preferences`.
- **In-portal list only** on Bills; no email/SMS/push duplicate automation.

**Limits**

- A bill appears in the reminder list only when preferences are enabled **and** the linked balance is verified for that due date window.

---

## 9. Private documents

**Delivered**

- `luxor_vendor_documents` + portal upload/list/download routes; PDF/JPG/PNG with size/type guards; no tax-ID fields in vendor forms.
- Upload UI on vendor profile when schema is present.

**Limits**

- Upload form, type guard, and claim/replay API are implemented. **Nov 8 UAT:** Golden Rose `phase5-uat.pdf` upload + download verified via portal session (after storage missing-object fix). Arianna may still run one UI upload in light mode for sign-off.

---

## 10. Integration & duplicate prevention

**Delivered**

- Bill center API count-checks paginated loads (bills, vendors, intakes, templates, reminders).
- Manual bill idempotency via request fingerprint + DB unique constraint (production).
- Payment plans use client request UUID replay; active plan duplicate index on bill/date/amount.
- Vendor name guard migration reduces duplicate vendor creation.

**Limits**

- **Nov 8 UAT (prod DB, `localhost:3000`):**
  - **Balance bill** `3ca1fff2-…5742` → expense `556fa4f8-…fa88` → **$150** payment **2026-11-08**; Operations and expense detail **$150 paid / $0 remaining**; Financial Bills **Paid this month** = **Known $150.00** with payment line on the list row.
  - **Vendor link (paid):** not an overlay bug — `luxor_link_bill_company` rejects `status = paid`. API returns the Postgres message via `/api/operations/bills/[id]/company`; Operations bill review hides link controls and explains company must be linked **before** payment.
  - **Reminder bill** `6e3bcadc-…902fd` (Golden Rose, **$75**, due **2026-11-15**, unpaid, `vendor_id` set) → expense `959faaa9-…` via **Review & log** (payment method **Check**, bill confirm checkbox). Reminder prefs **7 days before** saved (`seven_days: true` in `luxor_bill_reminder_preferences`). **Bill reminders** lists *Golden Rose Florist · Due in 7 days · $75.00 remaining*.
  - Golden Rose vendor row: **1** non-archived linked bill in DB (`6e3bcadc-…`).
  - **Vendor profile UI** (`/portal/finances/bills/vendors/b921f2b2-…`): shows **1 linked bills**, bill row *Phase 5 reminder UAT*, link to expense; lifetime vendor totals withheld (honest).
  - **PostgREST timestamps:** `luxorTimestamp.ts` used on archive, bill edit, review, company link, and reminder/planning routes so legacy `updated_at` values like `2026-07-29 02:27:20.733+00` are accepted (not only archive).
  - **Archive API** (`POST /api/operations/archive`) verified **archive + restore** on HoneyBook bill `56cfcd20-…`. Session-authenticated round-trip returned HTTP 200 both ways; DB `archived_at` cleared after restore.
  - **Vendor documents:** Golden Rose upload `phase5-uat.pdf` (`66749149-…`) HTTP 201; download GET returns `application/pdf`, 44 bytes. **Nov 8 fix:** treat Supabase storage missing-object **400** as absent (`vendorStorageObjectMissing`) so first upload no longer 503s.
  - **Local dev:** added `luxorCallStopIntent.ts` and `luxorNextFollowUpDisplay.ts` so `LogCallOutcomeModal` compiles (excluded from Phase 5 commit list).

---

## 11. Design

**Delivered**

- Portal light/dark tokens, responsive Bills and vendor profile layouts, calm copy explaining uncertainty.

---

## 12. Testing

**Delivered**

- `npm run test:phase5-bills` — **10/10 pass** (balances, idempotency fingerprint, schema probe, unknown amounts, reminder list gating, PostgREST timestamps, vendor storage missing-object).
- `npm run phase5:migration-readiness` — operator checklist.

**Pending**

- Full `npm run typecheck` on entire repo (mixed Phase 6/7/Elena changes in same tree).
- Browser UAT script in migration-readiness doc after deploy.

---

## Schema & deployment

| Item | State |
| --- | --- |
| Phase 5 migration batch (archive, profiles/plans, name guard, claim completion, document audit) | Applied to production Nov 8, 2026 |
| Optional `luxor_bill_history_guards` | **Not** applied (app-layer honesty only unless Lewis opts in) |
| Application code on Vercel | **Not on `origin/main`** (Nov 8: GitHub 404 for `src/app/api/portal/bill-center` and `src/lib/luxorTimestamp.ts` at `ref=main`). Local tree has full Phase 5; push required before production serves new routes. |

---

## What Arianna should expect after deploy

1. Bills & vendors hub with honest KPIs and in-app reminders (no external notices).
2. Vendor profiles with documents and extended contact fields.
3. Operations archive + payment planning + reminder prefs on each bill.
4. Recurring obligations still managed under Expense Management templates.
5. Clear messaging when balances cannot be verified — link bills to expenses and complete payment history before trusting totals.

---

## Recommended UAT (light mode)

1. `/portal/finances/bills` — confirm reconciliation banners and recurring list.
2. Operations → review a bill → link vendor → link/create expense → record payment lines → save reminder prefs → confirm bill appears under **Bill reminders** when due window matches.
3. Create/cancel a payment plan on that bill.
4. Archive and restore a test vendor; upload/open a vendor PDF.
5. Edit vendor profile including primary contact; confirm it displays without reload.

---

## Open blockers (honest)

1. **Settlement attestation** for legacy expenses — vendor totals and some KPIs stay withheld until individually evidenced (Nov 8 handoff Priority 1).
2. **Git/deploy** — integrate with `origin/main` (+7 commits), commit Phase 5 scope, push, verify Vercel.
3. **Repayment write paths** remain disabled by design; do not enable without separate security review.

This document is the draft required by the Phase 5 brief. Update the **Status** line and deployment table after production ship and UAT sign-off.
