import { isExactPlanningCent } from './luxorFinancialPlanningBounds'

/**
 * ISOLATED DRAFT: date-bucketed cash planning; no storage or production I/O.
 * The adapter must supply complete, independently verified, deduplicated
 * *future* flows. It must not infer a flow from a status, proposal or balance.
 */
export type ForecastHorizon = '30d' | '60d' | '90d' | '6m' | '12m'
export type ForecastGrouping = 'weekly' | 'monthly'
export type ForecastFlow = {
  source: 'installment' | 'expense' | 'bill' | 'refund'
  id: string
  kind: 'inflow' | 'outflow'
  date: string | null
  amount: number | null
  href: string
}
export type ForecastInput = {
  today: string
  horizon: ForecastHorizon
  grouping: ForecastGrouping
  openingBalance: number | null
  minimumReserve: number | null
  /** True only when the adapter verified coverage, links, allocations, and future occurrences. */
  sourceComplete: boolean
  /** Direction-specific source coverage; false is unavailable, never zero. */
  inflowAvailable: boolean
  outflowAvailable: boolean
  flows: ForecastFlow[]
}

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const result = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(result.getTime()) && result.toISOString().slice(0, 10) === value ? result : null
}
const key = (date: Date) => date.toISOString().slice(0, 10)
function addDays(date: Date, days: number) { return new Date(date.getTime() + days * 86400000) }
function addMonthsClamped(date: Date, months: number) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const first = new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)))
}
function cents(value: number | null, signed = false): number | null {
  if (!isExactPlanningCent(value) || (!signed && value < 0)) return null
  const scaled = value * 100
  const rounded = Math.round(scaled)
  return Number.isSafeInteger(rounded) ? rounded : null
}
function periodEnd(start: Date, exclusiveEnd: Date, grouping: ForecastGrouping) {
  const next = grouping === 'weekly' ? addDays(start, 7) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  return next < exclusiveEnd ? next : exclusiveEnd
}

export function buildForecastDraft(input: ForecastInput) {
  const start = parseDay(input.today)
  if (!start || !['30d', '60d', '90d', '6m', '12m'].includes(input.horizon) || !['weekly', 'monthly'].includes(input.grouping)) throw new Error('Invalid forecast period')
  const exclusiveEnd = input.horizon === '30d' ? addDays(start, 30)
    : input.horizon === '60d' ? addDays(start, 60)
      : input.horizon === '90d' ? addDays(start, 90)
        : addMonthsClamped(start, input.horizon === '6m' ? 6 : 12)
  const issues: string[] = []
  let inflowAvailable = input.inflowAvailable === true
  let outflowAvailable = input.outflowAvailable === true
  let reliable = input.sourceComplete && inflowAvailable && outflowAvailable
  if (!input.sourceComplete) issues.push('Source coverage or future obligations need review.')
  if (!inflowAvailable) issues.push('Scheduled collections are unavailable.')
  if (!outflowAvailable) issues.push('Unpaid amounts due are unavailable.')
  const seen = new Set<string>()
  const usable: Array<ForecastFlow & { day: Date; amountCents: number }> = []
  for (const flow of input.flows) {
    const identity = `${flow.source}:${flow.id}`
    const day = parseDay(flow.date)
    const amountCents = cents(flow.amount)
    if (!flow.id || !['installment', 'expense', 'bill', 'refund'].includes(flow.source) || !['inflow', 'outflow'].includes(flow.kind) || seen.has(identity) || !day || amountCents === null || !flow.href.startsWith('/portal/')) {
      reliable = false
      if (flow.kind === 'inflow') inflowAvailable = false
      else if (flow.kind === 'outflow') outflowAvailable = false
      else { inflowAvailable = false; outflowAvailable = false }
      issues.push('A forecast source has an unknown, duplicate or invalid detail.')
      continue
    }
    seen.add(identity)
    // Already-overdue items need an explicit owner-selected date, not an invented one.
    if (day < start) { reliable = false; if (flow.kind === 'inflow') inflowAvailable = false; else outflowAvailable = false; issues.push('An overdue item has no projected payment date.'); continue }
    if (day < exclusiveEnd) usable.push({ ...flow, day, amountCents })
  }
  const opening = cents(input.openingBalance, true)
  if (opening === null) issues.push('Enter an opening amount as of today.')
  const reserve = input.minimumReserve === null ? null : cents(input.minimumReserve)
  if (input.minimumReserve !== null && reserve === null) issues.push('The minimum reserve is invalid.')
  let balance: number | null = reliable && opening !== null ? opening : null
  const periods: Array<{ start: string; end: string; knownInflow: number | null; knownOutflow: number | null; endingBalance: number | null; belowZero: boolean | null; belowReserve: boolean | null; flows: ForecastFlow[] }> = []
  for (let from = start; from < exclusiveEnd;) {
    const to = periodEnd(from, exclusiveEnd, input.grouping)
    const rows = usable.filter((row) => row.day >= from && row.day < to)
    const inflow = rows.filter((row) => row.kind === 'inflow').reduce((sum, row) => sum + row.amountCents, 0)
    const outflow = rows.filter((row) => row.kind === 'outflow').reduce((sum, row) => sum + row.amountCents, 0)
    if (!Number.isSafeInteger(inflow)) inflowAvailable = false
    if (!Number.isSafeInteger(outflow)) outflowAvailable = false
    if (!Number.isSafeInteger(inflow) || !Number.isSafeInteger(outflow) || (balance !== null && !Number.isSafeInteger(balance + inflow - outflow))) { reliable = false; issues.push('The forecast amount exceeds the supported range.'); balance = null }
    if (balance !== null) balance += inflow - outflow
    periods.push({ start: key(from), end: key(addDays(to, -1)), knownInflow: Number.isSafeInteger(inflow) ? inflow / 100 : null, knownOutflow: Number.isSafeInteger(outflow) ? outflow / 100 : null, endingBalance: balance === null ? null : balance / 100, belowZero: balance === null ? null : balance < 0, belowReserve: balance === null || reserve === null ? null : balance < reserve, flows: rows.map(({ day: _day, amountCents: _cents, ...row }) => row) })
    from = to
  }
  // Overflow discovered in a later bucket invalidates all ending balances.
  for (const row of periods) {
    if (!inflowAvailable) row.knownInflow = null
    if (!outflowAvailable) row.knownOutflow = null
    if (!reliable) { row.endingBalance = null; row.belowZero = null; row.belowReserve = null }
  }
  return { start: key(start), end: key(addDays(exclusiveEnd, -1)), grouping: input.grouping, flowsComplete: reliable, reliable: reliable && opening !== null && (input.minimumReserve === null || reserve !== null), issues: [...new Set(issues)], periods }
}

/**
 * A goal is a planning input, separate from the record supplying the actual.
 * The adapter supplies the observed value only for a verified matching period
 * and metric. No values are inferred from a goal or a scheduled payment.
 */
export function getGoalProgressDraft(input: {
  target: number
  actual: number | null
  direction: 'at_least' | 'at_most'
  sourceComplete: boolean
}) {
  const target = cents(input.target, true)
  if (target === null || !['at_least', 'at_most'].includes(input.direction)) throw new Error('Invalid goal')
  const actual = input.sourceComplete ? cents(input.actual, true) : null
  if (actual === null) return { actual: null, difference: null, percent: null, met: null }
  return {
    actual: actual / 100,
    difference: (actual - target) / 100,
    // A zero target has no meaningful percentage; preserve its actual value.
    percent: target === 0 ? null : Math.round(actual / target * 1000) / 10,
    met: input.direction === 'at_least' ? actual >= target : actual <= target,
  }
}
