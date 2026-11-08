import Link from 'next/link'
import { isExactPlanningCent } from '@/lib/luxorFinancialPlanningBounds'
import { planningRevenueTarget, type PlanningBudgetSnapshot } from '@/lib/luxorFinancialPlanningBudgetBridge'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

/** Read-only Finance section. The host supplies a validated, current snapshot.
 * This component does not fetch, access storage, or expose any write or retry action. */
export function FinancialPlanningReadOnly({ snapshot, today }: { snapshot: PlanningBudgetSnapshot | null; today: string }) {
  const target = planningRevenueTarget(snapshot, today)
  const report = snapshot?.report
  const date = new Date(`${today}T00:00:00.000Z`)
  const validToday = /^\d{4}-\d{2}-\d{2}$/.test(today) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === today && Number(today.slice(0, 4)) >= 1900
  const month = report && typeof report.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(report.month) && validToday && report.today === today ? report.month : null
  // The existing month total may include future-dated transactions.
  const actual = month && month < today.slice(0, 7) && isExactPlanningCent(report?.incomeActual) && Number.isSafeInteger(Math.round(report.incomeActual * 100)) ? report.incomeActual : null
  const differenceCents = target.status === 'known' && actual !== null ? Math.round(actual * 100) - Math.round(target.value * 100) : null
  const difference = differenceCents !== null && Number.isSafeInteger(differenceCents) ? differenceCents / 100 : null
  return <section aria-label="Collection plan" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-[color:var(--portal-text)] sm:p-5">
    <h2 className="text-base font-bold sm:text-lg">Collection plan</h2>
    <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{month || 'Selected month'} · Event payments received, net of confirmed event refunds.</p>
    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
      <span>Target: <strong>{target.status === 'known' ? money(target.value) : target.status === 'not_entered' ? 'Not set' : 'Unavailable'}</strong></span>
      <span>Collected: <strong>{actual === null ? 'Unavailable' : money(actual)}</strong></span>
      <span>Difference: <strong>{difference === null ? 'Unavailable' : money(difference)}</strong></span>
    </div>
    {month && month >= today.slice(0, 7) ? <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Current and future totals need an as-of-today source.</p> : null}
    <Link href="/portal/finances/history" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">View payment records</Link>
  </section>
}
