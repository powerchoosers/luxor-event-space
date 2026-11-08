import { isExactPlanningCent } from './luxorFinancialPlanningBounds'
import { getLuxorForecastScenario } from '@/lib/luxorBudgetReporting'
import { openingForTodayDraft, type ManualOpeningScenario } from '@/lib/luxorFinancialPlanningTypes'

/** Structural contract for the existing budget-report response; null is unknown. */
export type PlanningBudgetSnapshot = {
  report: { month: string; today: string; incomeActual: number | null; expenseActual: number | null }
  yearRows: Array<{ month: string; revenueTarget: number | null; revenueActual: number | null; expenseTarget: number | null; expenseActual: number | null }>
  forecastRows: Array<{ month: string; collections: number | null; expenses: number | null }>
  revenueTargetsAvailable: boolean
}
/** Reuse only the host's current authenticated report; malformed or stale is unknown. */
export function planningBudgetSnapshotFromResult(result: unknown, currentKey: string, expectedMonth: string, expectedToday: string): PlanningBudgetSnapshot | null {
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  const monthValid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900
  const monetary = (value: unknown) => value === null || (isExactPlanningCent(value) && Number.isSafeInteger(Math.round(value * 100)))
  if (!monthValid(expectedMonth) || !dateValid(expectedToday) || !record(result) || result.key !== currentKey || result.error !== null || !record(result.report)) return null
  const report = result.report
  if (report.month !== expectedMonth || report.today !== expectedToday || !monetary(report.incomeActual) || !monetary(report.expenseActual)) return null
  if (!Array.isArray(result.yearRows) || !Array.isArray(result.forecastRows) || typeof result.revenueTargetsAvailable !== 'boolean') return null
  const validRows = (rows: unknown[], keys: string[]) => {
    const seen = new Set<string>()
    return rows.every((row) => {
      if (!record(row) || !monthValid(row.month) || seen.has(row.month) || !keys.every((key) => Object.prototype.hasOwnProperty.call(row, key) && monetary(row[key]))) return false
      seen.add(row.month)
      return true
    })
  }
  if (!validRows(result.yearRows, ['revenueTarget', 'revenueActual', 'expenseTarget', 'expenseActual']) || !validRows(result.forecastRows, ['collections', 'expenses'])) return null
  return { report: report as PlanningBudgetSnapshot['report'], yearRows: result.yearRows as PlanningBudgetSnapshot['yearRows'], forecastRows: result.forecastRows as PlanningBudgetSnapshot['forecastRows'], revenueTargetsAvailable: result.revenueTargetsAvailable }
}
const dateValid = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date && Number(date.slice(0, 4)) >= 1900
}
const amountValid = (value: unknown) => value === null || (isExactPlanningCent(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)))
function shiftMonth(month: string, offset: number) {
  const [year, part] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, part - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Only surface saved targets when the report specifically says they loaded. */
export function planningRevenueTarget(snapshot: PlanningBudgetSnapshot | null, today: string) {
  if (!snapshot || !snapshot.report || !dateValid(today) || snapshot.report.today !== today || !/^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.report.month) || snapshot.revenueTargetsAvailable !== true || !Array.isArray(snapshot.yearRows)) return { status: 'unavailable' as const, value: null }
  const matches = snapshot.yearRows.filter((row) => row && row.month === snapshot.report.month)
  if (matches.length !== 1 || !amountValid(matches[0].revenueTarget)) return { status: 'unavailable' as const, value: null }
  const value = matches[0].revenueTarget
  return value === null ? { status: 'not_entered' as const, value: null } : { status: 'known' as const, value }
}

/** Reuse the existing monthly read model; do not fabricate exact day windows. */
export function planningSavedScenario(snapshot: PlanningBudgetSnapshot | null, today: string, scenario: ManualOpeningScenario | null, months: 3 | 6 | 12) {
  if (!snapshot || !snapshot.report || !dateValid(today) || ![3, 6, 12].includes(months) || snapshot.report.today !== today || !Array.isArray(snapshot.forecastRows) || snapshot.forecastRows.length !== 12) return { status: 'unavailable' as const, rows: [] }
  const currentMonth = today.slice(0, 7)
  if (snapshot.forecastRows.some((row, index) => !row || row.month !== shiftMonth(currentMonth, index) || !amountValid(row.collections) || !amountValid(row.expenses))) return { status: 'unavailable' as const, rows: [] }
  if (!scenario) return { status: 'not_entered' as const, rows: [] }
  const opening = openingForTodayDraft(scenario, today)
  if (opening.availability !== 'known' || opening.value === null) return { status: opening.availability, rows: [] }
  let invalidBalance = false
  const rows = getLuxorForecastScenario(opening.value, snapshot.forecastRows.slice(0, months), scenario.minimumReserve).map((row) => {
    if (row.ending === null || !Number.isFinite(row.ending) || !Number.isSafeInteger(Math.round(row.ending * 100))) invalidBalance = true
    return invalidBalance ? { ...row, ending: null, belowZero: false, belowReserve: false } : row
  })
  return { status: rows.some((row) => row.ending === null) ? 'needs_review' as const : 'known' as const, rows }
}
