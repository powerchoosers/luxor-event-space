/**
 * ISOLATED DESIGN DRAFT — NOT A MIGRATION OR A SERVER IMPLEMENTATION.
 * Finance-authorized server code must validate the signed portal session and
 * member permission, set audit actors itself, and use atomic database writes.
 * Null means unknown/not entered, never zero. No field is a bank feed.
 */
export type MonthlyRevenueAllocation = { month: string; amount: number | null }
export type RevenuePlan = {
  year: number
  /** Optional independent annual goal; not silently divided among months. */
  annualTarget: number | null
  months: MonthlyRevenueAllocation[]
  revision: number
}
export type PlanningGoalMetric = 'event_collections' | 'paid_expenses' | 'booking_count' | 'net_recorded_flows' | 'minimum_reserve' | 'event_margin'
export type PlanningGoal = {
  id: string
  metric: PlanningGoalMetric
  title: string
  periodStart: string
  periodEnd: string
  target: number
  direction: 'at_least' | 'at_most'
  status: 'active' | 'archived'
  revision: number
}
export type ManualOpeningScenario = {
  id: string
  label: string
  source: 'manual'
  /** User-asserted calendar date of the balance; no automated bank connection. */
  asOf: string
  openingAmount: number | null
  minimumReserve: number | null
  status: 'active' | 'archived'
  revision: number
}

/**
 * Proposed request envelope, for a NEW finance-authorized endpoint. The server
 * provides actual actor/time and checks expectedRevision in the transaction.
 * operationId must be unique per actor and stable on retry; reusing a key for
 * different canonical content is a conflict. A successful replay returns the
 * original result. Revision and audit/history writes must be atomic.
 */
export type MutationEnvelope<T> = {
  operationId: string
  expectedRevision: number | null // null means create only, not blind overwrite
  payload: T
}
export type PlanningMutation =
  | { kind: 'revenue_plan'; request: MutationEnvelope<RevenuePlan> }
  | { kind: 'goal'; request: MutationEnvelope<PlanningGoal> }
  | { kind: 'opening_scenario'; request: MutationEnvelope<ManualOpeningScenario> }

export type PlanningRead<T> = {
  value: T | null
  availability: 'known' | 'not_entered' | 'unavailable' | 'needs_review'
  issues: string[]
}
export type MutationResult<T> =
  | { status: 'saved' | 'replayed'; value: T }
  | { status: 'conflict'; currentRevision: number | null }
  | { status: 'invalid' | 'unavailable'; message: string }

/** Server parsing must reject unknown keys and malformed objects before this. */
export function validateEnvelopeDraft<T extends { revision: number }>(request: MutationEnvelope<T>): string[] {
  const issues: string[] = []
  if (!idValid(request.operationId)) issues.push('Invalid operation ID')
  if (request.expectedRevision !== null && !revisionValid(request.expectedRevision)) issues.push('Invalid expected revision')
  if (!request.payload || !revisionValid(request.payload.revision)) issues.push('Invalid payload revision')
  else if (request.expectedRevision === null ? request.payload.revision !== 0 : request.payload.revision !== request.expectedRevision) issues.push('Payload and expected revisions do not match')
  return issues
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900
}
function money(value: unknown, allowNegative = false): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (!allowNegative && value < 0) || Math.abs(value) > 9999999999.99) return false
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6
}
const optionalMoney = (value: unknown, allowNegative = false) => value === null || money(value, allowNegative)
const revisionValid = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0
// The database stores UUIDs in canonical lowercase and checks the payload ID.
const idValid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const labelValid = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max

/** A year may be incompletely allocated; blanks stay null, including zero goals. */
export function validateRevenuePlanDraft(plan: RevenuePlan): string[] {
  const issues: string[] = []
  if (!Number.isInteger(plan.year) || plan.year < 1900 || plan.year > 9999) issues.push('Invalid year')
  if (!revisionValid(plan.revision)) issues.push('Invalid revision')
  if (!optionalMoney(plan.annualTarget)) issues.push('Invalid annual target')
  if (!Array.isArray(plan.months) || plan.months.length !== 12) return [...issues, 'Provide all twelve months; leave unknown values empty']
  const expected = new Set(Array.from({ length: 12 }, (_, i) => `${plan.year}-${String(i + 1).padStart(2, '0')}`))
  const seen = new Set<string>()
  for (const item of plan.months) {
    if (!item || !expected.has(item.month) || seen.has(item.month)) issues.push('Each month must appear exactly once in the selected year')
    else seen.add(item.month)
    if (!item || !optionalMoney(item.amount)) issues.push('Invalid monthly target')
  }
  // A partial allocation is allowed and visibly incomplete; never fill blanks.
  // If all twelve amounts are supplied alongside an annual goal, require them
  // to reconcile before saving to prevent two contradictory targets.
  if (money(plan.annualTarget) && plan.months.every((row) => row && money(row.amount))) {
    const sum = plan.months.reduce((total, row) => total + Math.round((row.amount as number) * 100), 0)
    if (sum !== Math.round(plan.annualTarget * 100)) issues.push('Monthly targets do not add up to the annual target')
  }
  return [...new Set(issues)]
}

export function validateGoalDraft(goal: PlanningGoal): string[] {
  const issues: string[] = []
  if (!idValid(goal.id) || !revisionValid(goal.revision)) issues.push('Invalid goal identity or revision')
  if (!labelValid(goal.title, 120)) issues.push('Enter a goal name')
  if (!['event_collections', 'paid_expenses', 'booking_count', 'net_recorded_flows', 'minimum_reserve', 'event_margin'].includes(goal.metric)) issues.push('Invalid goal metric')
  if (!isDate(goal.periodStart) || !isDate(goal.periodEnd) || goal.periodStart > goal.periodEnd) issues.push('Invalid goal period')
  if (!money(goal.target, goal.metric === 'net_recorded_flows')) issues.push('Invalid goal target')
  if (goal.metric === 'booking_count' && !Number.isInteger(goal.target)) issues.push('Booking targets must be whole numbers')
  if (goal.metric === 'event_margin' && (goal.target < 0 || goal.target > 100)) issues.push('Margin targets must be between 0 and 100 percent')
  if (!['at_least', 'at_most'].includes(goal.direction) || !['active', 'archived'].includes(goal.status)) issues.push('Invalid goal state')
  return issues
}

export function validateOpeningScenarioDraft(scenario: ManualOpeningScenario): string[] {
  const issues: string[] = []
  if (!idValid(scenario.id) || !revisionValid(scenario.revision)) issues.push('Invalid scenario identity or revision')
  if (!labelValid(scenario.label, 120)) issues.push('Enter a scenario name')
  if (scenario.source !== 'manual' || !isDate(scenario.asOf)) issues.push('A manual opening date is required')
  if (!optionalMoney(scenario.openingAmount, true)) issues.push('Invalid opening amount')
  if (!optionalMoney(scenario.minimumReserve)) issues.push('Invalid reserve')
  if (!['active', 'archived'].includes(scenario.status)) issues.push('Invalid scenario state')
  return issues
}

/** Historical opening amounts are not automatically carried forward to today. */
export function openingForTodayDraft(scenario: ManualOpeningScenario, today: string): PlanningRead<number> {
  if (validateOpeningScenarioDraft(scenario).length || !isDate(today) || scenario.status !== 'active') return { value: null, availability: 'needs_review', issues: ['Review the manual opening scenario.'] }
  if (scenario.openingAmount === null) return { value: null, availability: 'not_entered', issues: ['Enter an opening amount.'] }
  if (scenario.asOf !== today) return { value: null, availability: 'needs_review', issues: ['The manual opening amount is not dated today. Update it or reconcile intervening movements.'] }
  return { value: scenario.openingAmount, availability: 'known', issues: [] }
}

/**
 * Compare collected event receipts with targets only for the same months.
 * A null actual is unavailable, not $0. The adapter is responsible for
 * excluding deposits, unallocated receipts and unreconciled refunds.
 */
export function compareRevenuePlanDraft(input: {
  plan: RevenuePlan
  today: string
  actuals: Array<{ month: string; collected: number | null }>
}): {
  elapsedMonths: number
  currentMonthIsPartial: boolean
  unallocatedMonths: string[]
  targetForElapsedMonths: number | null
  collectedForElapsedMonths: number | null
  differenceForElapsedMonths: number | null
  issues: string[]
} {
  const issues = validateRevenuePlanDraft(input.plan)
  if (!isDate(input.today)) issues.push('Invalid report date')
  if (issues.length) return { elapsedMonths: 0, currentMonthIsPartial: false, unallocatedMonths: [], targetForElapsedMonths: null, collectedForElapsedMonths: null, differenceForElapsedMonths: null, issues }
  const nowYear = Number(input.today.slice(0, 4))
  const elapsedMonths = input.plan.year < nowYear ? 12 : input.plan.year > nowYear ? 0 : Number(input.today.slice(5, 7))
  const relevant = input.plan.months.filter((row) => Number(row.month.slice(5, 7)) <= elapsedMonths)
  const unallocatedMonths = relevant.filter((row) => row.amount === null).map((row) => row.month)
  const actualByMonth = new Map<string, number | null>()
  for (const row of input.actuals) {
    if (!row || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || !row.month.startsWith(`${input.plan.year}-`) || actualByMonth.has(row.month) || (row.collected !== null && !money(row.collected, true))) {
      issues.push('Collected amounts could not be verified')
      continue
    }
    actualByMonth.set(row.month, row.collected)
  }
  const targetsKnown = elapsedMonths > 0 && !unallocatedMonths.length
  const actualsKnown = elapsedMonths > 0 && !issues.length && relevant.every((row) => actualByMonth.has(row.month) && actualByMonth.get(row.month) !== null)
  const targetCents = targetsKnown ? relevant.reduce((sum, row) => sum + Math.round((row.amount as number) * 100), 0) : null
  const actualCents = actualsKnown ? relevant.reduce((sum, row) => sum + Math.round((actualByMonth.get(row.month) as number) * 100), 0) : null
  const targetForElapsedMonths = targetCents === null ? null : targetCents / 100
  const collectedForElapsedMonths = actualCents === null ? null : actualCents / 100
  if (unallocatedMonths.length) issues.push('Some elapsed months have no target')
  if (elapsedMonths && !actualsKnown) issues.push('Some elapsed months have unverified collections')
  return {
    elapsedMonths,
    currentMonthIsPartial: input.plan.year === nowYear,
    unallocatedMonths,
    targetForElapsedMonths,
    collectedForElapsedMonths,
    differenceForElapsedMonths: targetCents === null || actualCents === null ? null : (actualCents - targetCents) / 100,
    issues: [...new Set(issues)],
  }
}
