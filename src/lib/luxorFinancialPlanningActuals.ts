import { isExactPlanningCent } from './luxorFinancialPlanningBounds'
import type { PlanningGoal } from './luxorFinancialPlanningTypes'
import type { StoredPlanningItem } from './luxorFinancialPlanningApi'

export type GoalActualDraft = { metric: PlanningGoal['metric']; periodStart: string; periodEnd: string; value: number | null; sourceComplete: boolean; href: string | null }
type VerifiedMonthlyCash = { month: string; today: string; incomeActual: number | null; expenseActual: number | null }

/**
 * Adapt only exact calendar-month periods from the existing verified budget
 * report. Null stays unknown, future periods remain unavailable, and these are
 * recorded cash movements rather than accounting profit or bank balances.
 */
export function planningActualsFromBudgetMonth(items: StoredPlanningItem[], report: VerifiedMonthlyCash): Record<string, GoalActualDraft> {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(report.month)
  if (!match || Number(match[1]) < 1900 || !/^\d{4}-\d{2}-\d{2}$/.test(report.today)) return {}
  const currentDay = new Date(`${report.today}T00:00:00.000Z`)
  if (!Number.isFinite(currentDay.getTime()) || currentDay.toISOString().slice(0, 10) !== report.today) return {}
  const end = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).toISOString().slice(0, 10)
  const start = `${report.month}-01`
  const valid = (value: number | null) => isExactPlanningCent(value) && Number.isSafeInteger(Math.round(value * 100))
  const results: Record<string, GoalActualDraft> = {}
  for (const item of items) {
    if (item.kind !== 'goal' || item.payload.periodStart !== start || item.payload.periodEnd !== end) continue
    let value: number | null = null
    let href: string | null = null
    // The monthly report can include future-dated entries. Use it only after
    // the period ends until its source supplies a verified through-today total.
    if (end < report.today) {
      if (item.payload.metric === 'event_collections' && valid(report.incomeActual)) { value = report.incomeActual; href = '/portal/finances/history' }
      else if (item.payload.metric === 'paid_expenses' && valid(report.expenseActual)) { value = report.expenseActual; href = '/portal/finances/expenses' }
      else if (item.payload.metric === 'net_recorded_flows' && valid(report.incomeActual) && valid(report.expenseActual)) { value = (Math.round((report.incomeActual as number) * 100) - Math.round((report.expenseActual as number) * 100)) / 100; href = '/portal/finances' }
    }
    results[item.payload.id] = { metric: item.payload.metric, periodStart: start, periodEnd: end, value, sourceComplete: value !== null, href }
  }
  return results
}
