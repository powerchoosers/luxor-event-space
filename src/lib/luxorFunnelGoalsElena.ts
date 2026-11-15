import {
  FUNNEL_GOAL_CADENCES,
  FUNNEL_GOAL_METRICS,
  emptyFunnelGoals,
  parseFunnelGoals,
  type FunnelGoalMetric,
  type FunnelGoals,
  type FunnelMetricGoals,
} from '@/lib/luxorFunnelGoals'

export const FUNNEL_GOAL_LABELS: Record<FunnelGoalMetric, string> = {
  newInquiries: 'New inquiries',
  toursScheduled: 'Tours scheduled',
  toursCompleted: 'Tours completed',
  proposalsSent: 'Proposals sent',
  bookedEvents: 'Booked events',
  revenue: 'Revenue',
}

const FUNNEL_STAGE_METRICS: FunnelGoalMetric[] = [
  'newInquiries',
  'toursScheduled',
  'toursCompleted',
  'proposalsSent',
  'bookedEvents',
]

const METRIC_ALIASES: Record<string, FunnelGoalMetric> = {
  newinquiries: 'newInquiries',
  'new inquiries': 'newInquiries',
  toursscheduled: 'toursScheduled',
  'tours scheduled': 'toursScheduled',
  tourscompleted: 'toursCompleted',
  'tours completed': 'toursCompleted',
  proposalssent: 'proposalsSent',
  'proposals sent': 'proposalsSent',
  bookedevents: 'bookedEvents',
  'booked events': 'bookedEvents',
  bookings: 'bookedEvents',
  revenue: 'revenue',
}

export type FunnelGoalAssignmentCadence =
  | (typeof FUNNEL_GOAL_CADENCES)[number]
  | 'monthlyOverride'
  | 'quarterlyOverride'

export type FunnelGoalAssignment = {
  metric: FunnelGoalMetric
  cadence: FunnelGoalAssignmentCadence
  periodKey?: string
  value: number
}

export type FunnelGoalChangePath = `${FunnelGoalMetric}.${string}`

export type FunnelGoalsBrief = {
  bookingsPerMonth?: number
  averageRevenuePerBooking?: number
  tourToBookingRate?: number
  proposalToBookingRate?: number
  tourCompletedToProposalRate?: number
  toursScheduledToCompletedRate?: number
  inquiryToTourScheduledRate?: number
}

export type ElenaFunnelGoalsCardPayload = {
  summary: string
  calculations: string
  goals: FunnelGoals
  revision: number
  changedPaths: FunnelGoalChangePath[]
  assumptions: string[]
  conflicts: string[]
  canSave: boolean
  /** Set client-side after a confirmed save. */
  savedAt?: string
}

function normalizeMetric(value: unknown): FunnelGoalMetric | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/_/g, ' ')
  if ((FUNNEL_GOAL_METRICS as readonly string[]).includes(value)) return value as FunnelGoalMetric
  return METRIC_ALIASES[key.replace(/\s+/g, ' ')] ?? METRIC_ALIASES[key.replace(/\s+/g, '')] ?? null
}

function normalizeCadence(value: unknown): FunnelGoalAssignmentCadence | null {
  if (typeof value !== 'string') return null
  const cadence = value.trim().toLowerCase()
  if (cadence === 'monthlyoverride' || cadence === 'month_override') return 'monthlyOverride'
  if (cadence === 'quarterlyoverride' || cadence === 'quarter_override') return 'quarterlyOverride'
  if ((FUNNEL_GOAL_CADENCES as readonly string[]).includes(cadence)) {
    return cadence as (typeof FUNNEL_GOAL_CADENCES)[number]
  }
  return null
}

function roundCount(value: number) {
  return Math.max(0, Math.round(value))
}

function roundRevenue(value: number) {
  return Math.max(0, Math.round(value * 100) / 100)
}

export function rateValid(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1
}

function formatRate(value: number) {
  const pct = Math.round(value * 1000) / 10
  return `${pct}%`
}

function validateAssignmentValue(metric: FunnelGoalMetric, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('Goal values must be finite and nonnegative.')
  if (metric === 'revenue') {
    if (Number(value.toFixed(2)) !== value) throw new Error('Revenue goals must use dollars with up to two decimals.')
    return roundRevenue(value)
  }
  if (!Number.isInteger(value)) throw new Error('Count goals must be whole numbers.')
  return roundCount(value)
}

export function parseFunnelGoalAssignments(input: unknown): FunnelGoalAssignment[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 120) {
    throw new Error('Provide at least one goal value to update.')
  }
  const assignments: FunnelGoalAssignment[] = []
  for (const row of input) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Each goal value must be an object.')
    const record = row as Record<string, unknown>
    const metric = normalizeMetric(record.metric)
    const cadence = normalizeCadence(record.cadence)
    if (!metric || !cadence) throw new Error('Each goal value needs a recognized metric and cadence.')
    if (typeof record.value !== 'number') throw new Error('Each goal value must include a number.')
    const value = validateAssignmentValue(metric, record.value)
    let periodKey: string | undefined
    if (cadence === 'monthlyOverride' || cadence === 'quarterlyOverride') {
      if (typeof record.periodKey !== 'string') throw new Error('Overrides need a periodKey.')
      periodKey = record.periodKey.trim()
      if (cadence === 'monthlyOverride' && !/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(periodKey)) {
        throw new Error('Month overrides use YYYY-MM.')
      }
      if (cadence === 'quarterlyOverride' && !/^(19|[2-9]\d)\d{2}-Q[1-4]$/.test(periodKey)) {
        throw new Error('Quarter overrides use YYYY-Q1 through YYYY-Q4.')
      }
    } else if (record.periodKey !== undefined) {
      throw new Error('periodKey is only valid for month or quarter overrides.')
    }
    assignments.push({ metric, cadence, periodKey, value })
  }
  return assignments
}

export function inferRatesFromBaseGoals(base: FunnelGoals): Partial<FunnelGoalsBrief> {
  const rates: Partial<FunnelGoalsBrief> = {}
  const ni = base.newInquiries.monthly
  const ts = base.toursScheduled.monthly
  const tc = base.toursCompleted.monthly
  const ps = base.proposalsSent.monthly
  const be = base.bookedEvents.monthly
  if (ni && ni > 0 && ts != null) rates.inquiryToTourScheduledRate = ts / ni
  if (ts && ts > 0 && tc != null) rates.toursScheduledToCompletedRate = tc / ts
  if (tc && tc > 0 && ps != null) rates.tourCompletedToProposalRate = ps / tc
  if (ps && ps > 0 && be != null) rates.proposalToBookingRate = be / ps
  if (tc && tc > 0 && be != null) rates.tourToBookingRate = be / tc
  return rates
}

type RatePickResult = { rate: number; assumedLabel: string | null }

function pickRate(
  brief: FunnelGoalsBrief,
  briefKey: keyof FunnelGoalsBrief,
  inferred: Partial<FunnelGoalsBrief>,
  label: string,
  missing: string[],
  assumptions: string[],
): RatePickResult | null {
  const explicit = brief[briefKey]
  if (rateValid(explicit)) return { rate: explicit, assumedLabel: null }
  const fromSaved = inferred[briefKey]
  if (rateValid(fromSaved)) {
    assumptions.push(`${label}: ${formatRate(fromSaved)} (from saved monthly goals)`)
    return { rate: fromSaved, assumedLabel: label }
  }
  missing.push(label)
  return null
}

export function deriveMonthlyFunnelFromBrief(
  brief: FunnelGoalsBrief,
  base: FunnelGoals,
): {
  monthly: Partial<Record<FunnelGoalMetric, number>>
  assumptions: string[]
  missing: string[]
} {
  const assumptions: string[] = []
  const missing: string[] = []
  const inferred = inferRatesFromBaseGoals(base)
  const monthly: Partial<Record<FunnelGoalMetric, number>> = {}

  if (brief.bookingsPerMonth == null || !Number.isFinite(brief.bookingsPerMonth) || brief.bookingsPerMonth < 0) {
    throw new Error('bookingsPerMonth is required to work backward through the funnel.')
  }
  const bookings = roundCount(brief.bookingsPerMonth)
  monthly.bookedEvents = bookings

  if (brief.averageRevenuePerBooking != null) {
    if (!Number.isFinite(brief.averageRevenuePerBooking) || brief.averageRevenuePerBooking < 0) {
      throw new Error('averageRevenuePerBooking must be nonnegative.')
    }
    monthly.revenue = roundRevenue(bookings * brief.averageRevenuePerBooking)
  }

  const tourToBooking = pickRate(
    brief,
    'tourToBookingRate',
    inferred,
    'Tour close rate (booked events per completed tour)',
    missing,
    assumptions,
  )
  if (!tourToBooking) return { monthly, assumptions, missing }
  monthly.toursCompleted = roundCount(bookings / tourToBooking.rate)

  if (rateValid(brief.proposalToBookingRate)) {
    monthly.proposalsSent = roundCount(bookings / brief.proposalToBookingRate)
  } else if (rateValid(brief.tourCompletedToProposalRate)) {
    monthly.proposalsSent = roundCount(monthly.toursCompleted * brief.tourCompletedToProposalRate)
  } else {
    const proposalToBooking = pickRate(
      brief,
      'proposalToBookingRate',
      inferred,
      'Proposal close rate (booked events per proposal sent)',
      missing,
      assumptions,
    )
  const tourToProposal = rateValid(inferred.tourCompletedToProposalRate)
    ? inferred.tourCompletedToProposalRate
    : null
    if (proposalToBooking) {
      monthly.proposalsSent = roundCount(bookings / proposalToBooking.rate)
    } else if (tourToProposal) {
      assumptions.push(`Proposals per completed tour: ${formatRate(tourToProposal)} (from saved monthly goals)`)
      monthly.proposalsSent = roundCount(monthly.toursCompleted * tourToProposal)
    } else {
      missing.push('Proposal close rate (booked events per proposal) or proposals per completed tour')
    }
  }
  if (missing.length || monthly.proposalsSent == null) return { monthly, assumptions, missing }

  const showRate = pickRate(
    brief,
    'toursScheduledToCompletedRate',
    inferred,
    'Tour show rate (completed tours per scheduled tour)',
    missing,
    assumptions,
  )
  if (!showRate) return { monthly, assumptions, missing }
  monthly.toursScheduled = roundCount(monthly.toursCompleted / showRate.rate)

  const inquiryRate = pickRate(
    brief,
    'inquiryToTourScheduledRate',
    inferred,
    'Inquiry-to-tour rate (tours scheduled per new inquiry)',
    missing,
    assumptions,
  )
  if (!inquiryRate) return { monthly, assumptions, missing }
  monthly.newInquiries = roundCount(monthly.toursScheduled / inquiryRate.rate)

  return { monthly, assumptions, missing }
}

export function assertFunnelStageOrder(monthly: Partial<Record<FunnelGoalMetric, number>>) {
  let previousMetric: FunnelGoalMetric | null = null
  let previousValue: number | null = null
  for (const metric of FUNNEL_STAGE_METRICS) {
    const value = monthly[metric]
    if (value == null) continue
    if (previousValue != null && value > previousValue) {
      throw new Error(
        `Funnel order is invalid: ${FUNNEL_GOAL_LABELS[metric]} (${value}) cannot exceed ${FUNNEL_GOAL_LABELS[previousMetric!]} (${previousValue}).`,
      )
    }
    previousMetric = metric
    previousValue = value
  }
}

export function rescaleMetricFromMonthlyChange(
  baseRow: FunnelMetricGoals,
  metric: FunnelGoalMetric,
  newMonthly: number,
): { assignments: FunnelGoalAssignment[]; conflicts: string[] } {
  const oldMonthly = baseRow.monthly
  const conflicts: string[] = []
  const assignments: FunnelGoalAssignment[] = [{ metric, cadence: 'monthly', value: newMonthly }]
  if (oldMonthly === null || oldMonthly === 0) {
    for (const cadence of FUNNEL_GOAL_CADENCES) {
      if (cadence === 'monthly') continue
      if (baseRow[cadence] !== null) {
        conflicts.push(
          `${FUNNEL_GOAL_LABELS[metric]} · ${cadence} stays at ${baseRow[cadence]} while monthly is set to ${newMonthly}.`,
        )
      }
    }
    return { assignments, conflicts }
  }
  const ratio = newMonthly / oldMonthly
  for (const cadence of FUNNEL_GOAL_CADENCES) {
    if (cadence === 'monthly') continue
    const old = baseRow[cadence]
    if (old === null) continue
    assignments.push({
      metric,
      cadence,
      value: metric === 'revenue' ? roundRevenue(old * ratio) : roundCount(old * ratio),
    })
  }
  for (const [key, old] of Object.entries(baseRow.monthlyOverrides)) {
    assignments.push({
      metric,
      cadence: 'monthlyOverride',
      periodKey: key,
      value: metric === 'revenue' ? roundRevenue(old * ratio) : roundCount(old * ratio),
    })
  }
  for (const [key, old] of Object.entries(baseRow.quarterlyOverrides)) {
    assignments.push({
      metric,
      cadence: 'quarterlyOverride',
      periodKey: key,
      value: metric === 'revenue' ? roundRevenue(old * ratio) : roundCount(old * ratio),
    })
  }
  return { assignments, conflicts }
}

export function buildFunnelGoalsUpdatePlan(
  base: FunnelGoals,
  input: { brief?: FunnelGoalsBrief; goalValues?: unknown },
): {
  assignments: FunnelGoalAssignment[]
  assumptions: string[]
  conflicts: string[]
} {
  const explicit = input.goalValues ? parseFunnelGoalAssignments(input.goalValues) : []
  const monthlyTargets: Partial<Record<FunnelGoalMetric, number>> = {}
  let assumptions: string[] = []
  const conflicts: string[] = []

  if (input.brief) {
    const derived = deriveMonthlyFunnelFromBrief(input.brief, base)
    if (derived.missing.length) {
      throw new Error(
        `Need funnel rates before preparing the card: ${derived.missing.join('; ')}. Ask the owner or use rates from saved goals when they exist.`,
      )
    }
    assumptions = derived.assumptions
    Object.assign(monthlyTargets, derived.monthly)
  }

  for (const assignment of explicit) {
    if (assignment.cadence === 'monthly') {
      monthlyTargets[assignment.metric] = assignment.value
    }
  }

  if (Object.keys(monthlyTargets).length) {
    assertFunnelStageOrder(monthlyTargets)
  }

  const assignments: FunnelGoalAssignment[] = []
  for (const metric of FUNNEL_GOAL_METRICS) {
    const nextMonthly = monthlyTargets[metric]
    if (nextMonthly == null) continue
    const current = base[metric].monthly
    if (current === nextMonthly && !input.brief) continue
    const scaled = rescaleMetricFromMonthlyChange(base[metric], metric, nextMonthly)
    assignments.push(...scaled.assignments)
    conflicts.push(...scaled.conflicts)
  }

  for (const assignment of explicit) {
    if (assignment.cadence !== 'monthly') assignments.push(assignment)
  }

  if (!assignments.length) throw new Error('No goal changes were produced. Provide bookings or goalValues.')
  return { assignments, assumptions, conflicts }
}


function assignmentPath(assignment: FunnelGoalAssignment): FunnelGoalChangePath {
  if (assignment.cadence === 'monthlyOverride') return `${assignment.metric}.monthlyOverrides.${assignment.periodKey}`
  if (assignment.cadence === 'quarterlyOverride') return `${assignment.metric}.quarterlyOverrides.${assignment.periodKey}`
  return `${assignment.metric}.${assignment.cadence}`
}

export function mergeFunnelGoalAssignments(
  base: FunnelGoals,
  assignments: FunnelGoalAssignment[],
): { goals: FunnelGoals; changedPaths: FunnelGoalChangePath[] } {
  const merged = structuredClone(base)
  const changedPaths: FunnelGoalChangePath[] = []
  for (const assignment of assignments) {
    const path = assignmentPath(assignment)
    changedPaths.push(path)
    const row = merged[assignment.metric]
    if (assignment.cadence === 'monthlyOverride') {
      row.monthlyOverrides[assignment.periodKey!] = assignment.value
      continue
    }
    if (assignment.cadence === 'quarterlyOverride') {
      row.quarterlyOverrides[assignment.periodKey!] = assignment.value
      continue
    }
    row[assignment.cadence] = assignment.value
  }
  const parsed = parseFunnelGoals(merged)
  if (!parsed) throw new Error('Merged goals did not pass validation.')
  return { goals: parsed, changedPaths }
}

export type FunnelGoalDisplayCell = {
  metric: FunnelGoalMetric
  cadence: string
  label: string
  value: number
  changed: boolean
}

export function funnelGoalDisplayCells(
  goals: FunnelGoals,
  changedPaths: FunnelGoalChangePath[],
): FunnelGoalDisplayCell[] {
  const changed = new Set(changedPaths)
  const cells: FunnelGoalDisplayCell[] = []
  for (const metric of FUNNEL_GOAL_METRICS) {
    for (const cadence of FUNNEL_GOAL_CADENCES) {
      const value = goals[metric][cadence]
      if (value === null) continue
      const path = `${metric}.${cadence}` as FunnelGoalChangePath
      cells.push({
        metric,
        cadence,
        label: `${FUNNEL_GOAL_LABELS[metric]} · ${cadence}`,
        value,
        changed: changed.has(path),
      })
    }
    for (const [periodKey, value] of Object.entries(goals[metric].monthlyOverrides)) {
      const path = `${metric}.monthlyOverrides.${periodKey}` as FunnelGoalChangePath
      cells.push({
        metric,
        cadence: periodKey,
        label: `${FUNNEL_GOAL_LABELS[metric]} · ${periodKey}`,
        value,
        changed: changed.has(path),
      })
    }
    for (const [periodKey, value] of Object.entries(goals[metric].quarterlyOverrides)) {
      const path = `${metric}.quarterlyOverrides.${periodKey}` as FunnelGoalChangePath
      cells.push({
        metric,
        cadence: periodKey,
        label: `${FUNNEL_GOAL_LABELS[metric]} · ${periodKey}`,
        value,
        changed: changed.has(path),
      })
    }
  }
  return cells
}

export function buildElenaFunnelGoalsCard(input: {
  summary: string
  calculations?: string
  baseGoals: FunnelGoals
  assignments: FunnelGoalAssignment[]
  revision: number
  canSave: boolean
  assumptions?: string[]
  conflicts?: string[]
}): ElenaFunnelGoalsCardPayload {
  const summary = input.summary.trim().slice(0, 1200)
  if (!summary) throw new Error('A short summary is required before preparing the goals card.')
  const calculations = String(input.calculations || '').trim().slice(0, 4000)
  const { goals, changedPaths } = mergeFunnelGoalAssignments(input.baseGoals, input.assignments)
  assertFunnelStageOrder(
    Object.fromEntries(
      FUNNEL_STAGE_METRICS.map((metric) => [metric, goals[metric].monthly]),
    ) as Partial<Record<FunnelGoalMetric, number>>,
  )
  return {
    summary,
    calculations,
    goals,
    revision: input.revision,
    changedPaths,
    assumptions: input.assumptions || [],
    conflicts: input.conflicts || [],
    canSave: input.canSave,
  }
}

export function emptyGoalsBase(): FunnelGoals {
  return emptyFunnelGoals()
}