'use client'

import { isExactPlanningCent } from '@/lib/luxorFinancialPlanningBounds'
import { FinancialPlanningDailyForecast } from '@/components/portal/FinancialPlanningDailyForecast'
import { planningRevenueTarget, type PlanningBudgetSnapshot } from '@/lib/luxorFinancialPlanningBudgetBridge'
import type { StoredPlanningItem } from '@/lib/luxorFinancialPlanningApi'

const currency = (value: number | null) => value === null ? 'Needs review' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
export function FinancialPlanningBudgetContext({ snapshot, today, items, principalScope, sourceRevision, onOpenBudget }: {
  snapshot: PlanningBudgetSnapshot | null
  today: string
  items: StoredPlanningItem[]
  principalScope: string
  sourceRevision?: number
  onOpenBudget?: () => void
}) {
  const target = planningRevenueTarget(snapshot, today)
  const date = new Date(`${today}T00:00:00.000Z`)
  const validToday = /^\d{4}-\d{2}-\d{2}$/.test(today) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === today && Number(today.slice(0, 4)) >= 1900
  // Monthly source totals can include future-dated entries. Do not label those
  // as collections received so far until the source supplies an as-of total.
  const actual = snapshot?.report && snapshot.report.today === today && /^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.report.month) && validToday && snapshot.report.month < today.slice(0, 7) && isExactPlanningCent(snapshot.report.incomeActual) && Number.isSafeInteger(Math.round(snapshot.report.incomeActual * 100)) ? snapshot.report.incomeActual : null
  return <div className="space-y-4">
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-[color:var(--portal-text)] sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Collection target</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{snapshot?.report?.month || 'Selected month'} · Event payments received, net of confirmed event refunds.</p>
      {snapshot?.report?.month === today.slice(0, 7) ? <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Current-month collections need an as-of-today source.</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums"><span>Target: <strong>{target.status === 'known' ? currency(target.value) : target.status === 'not_entered' ? 'Not set' : 'Unavailable'}</strong></span><span>Collected: <strong>{currency(actual)}</strong></span></div>
      {onOpenBudget ? <button type="button" onClick={onOpenBudget} className="mt-3 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">Open budget targets</button> : null}
    </section>
    <FinancialPlanningDailyForecast today={today} items={items} principalScope={principalScope} sourceRevision={sourceRevision} />
  </div>
}
