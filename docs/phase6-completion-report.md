# Phase 6: Budgeting and reports — completion report (simple scope)

**For:** Arianna Patterson  
**From:** Luxor implementation (Lewis)  
**Date:** November 8, 2026  
**Status:** Source and production schema ready for light-mode UAT.

This maps Arianna’s **Phase 6: Budgeting & Financial Reports** brief (New Finances Center thread, Nov 7–8, 2026) to what shipped in the **simple** scope: one **Monthly plan** page, honest numbers, no separate planning product.

---

## What Arianna gets

1. **`/portal/finances/budgets` — Monthly plan** — Set a monthly **collection target** and **spending targets** by existing expense category; compare to **recorded** collections and paid expenses.
2. **Month summary** — Four KPIs, plain status sentence, **month cash margin (operational)** = collected minus paid expenses (not tax net income).
3. **Full year** — Collapsed by default; tap months to jump and edit seasonal targets.
4. **Next 90 days** — Known scheduled collections and unpaid expenses; optional opening amount (not saved; not a bank balance).
5. **CSV export** — Pick a range (single month through 24 months) and download plan vs actuals.
6. **Deeper exports** — Links to Event profitability and Accountant exports (unchanged).

---

## Production schema

| Item | State |
| --- | --- |
| `luxor_monthly_budgets` | Already on production |
| `luxor_monthly_revenue_targets` | Applied Nov 8, 2026 (`luxor_revenue_budget_targets` migration) |

---

## Honestly deferred (not bugs)

- Six-report PDF library, quarterly budget entities, preset revenue/expense taxonomy  
- Saved bank opening balance, weekly cash views, goals module, FinancialPlanning panel  
- Phase 7 accounting dashboard, GL, and reconciliation  

---

## Recommended UAT (light mode)

1. Open **Financial Center → Monthly plan**.
2. Set **collection target** for the current month; refresh — target persists.
3. Set one **category spending target**; confirm **Paid** reflects expense payment lines.
4. **Download CSV** — try “Last 12 months” or a custom range (max 24 months).
5. Expand **Show full year**; pick another month; confirm seasonal targets can differ.
6. On the current month, enter an optional opening amount under **Known scheduled flows**; confirm it is **not** saved after refresh.

---

## Automated checks

```bash
npm run test:phase6-budget-summary
npm run typecheck
npm run lint -- --quiet
npm run build
```
