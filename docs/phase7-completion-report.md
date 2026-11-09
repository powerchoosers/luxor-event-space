# Phase 7: Accounting & reconciliation — completion report (simple scope)

**For:** Arianna Patterson  
**From:** Luxor implementation (Lewis)  
**Date:** November 8, 2026  
**Status:** Ready for light-mode UAT after deploy.

This maps Arianna’s **Phase 7: Accounting & Financial Reconciliation** email (New Finances Center thread, Nov 7, 2026) to what shipped in the **simple** scope—same pattern as Phases 5 and 6.

---

## What Arianna gets

1. **`/portal/finances/books` — Books & records** — One hub for reconciliation visibility, accountant exports, AR/AP aging snapshots, reference chart of accounts, and read-only bank statement preview.
2. **Books health** — Plain status sentence, review count, and up to eight deep links into existing finance pages (payments, receivables, bills, expenses).
3. **KPIs (when computable)** — Outstanding client balances, known vendor balances from verified bill↔expense links, and review item count.
4. **Aging** — Client and vendor buckets (current, 1–30, 31–60, 61–90, 90+) using **known** balances only.
5. **Accountant CSV center** — Date range or all dates for expense records, expense payments, client payments, and client refunds (`/portal/finances/accountant` redirects here).
6. **Statement preview** — CSV parse and match review UI remains **preview-only**; saving setup, imports, and recorded match choices stay disabled until secure identity is verified.

---

## Production schema

| Item | State |
| --- | --- |
| New accounting / GL / journal tables | **Not applied** (by design) |
| Proposal SQL (`luxor_accounting_setup_*`, `luxor_statement_*`) | Remains proposal-only |

---

## Honestly deferred (not bugs)

- Full chart-of-accounts editing, general ledger, double-entry journals, automatic journal posting  
- Completed bank reconciliation, financial statement PDFs (P&amp;L, balance sheet, cash flow)  
- Custom account mappings saved in the database, accounting audit log  
- Enabling statement import save and match-review persistence (blocked on identity design in `docs/luxor-match-review-identity-design.md`)

---

## Recommended UAT (light mode)

1. Open **Financial Center → Books & records**.
2. Confirm the status sentence and review list match what you know about open payments or bills.
3. Expand **For your accountant** — download client payments and expense CSVs for a date range.
4. Open **Client money aging** and **Vendor money aging** — confirm amounts match receivables and bills you trust.
5. Expand **Compare a bank statement (preview)** — upload a sample CSV; confirm save/match stay disabled with clear copy.
6. Visit `/portal/finances/accountant` — confirm it lands on Books exports.

---

## Automated checks

```bash
npm run test:books-health
npm run test:phase6-budget-summary
npm run test:phase5-bills
npm run typecheck
npm run lint -- --quiet
npm run build
```
