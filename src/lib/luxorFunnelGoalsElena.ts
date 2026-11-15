import {
  FUNNEL_GOAL_CADENCES,
  FUNNEL_GOAL_METRICS,
  emptyFunnelGoals,
  parseFunnelGoals,
  type FunnelGoalMetric,
  type FunnelGoals,
} from '@/lib/luxorFunnelGoals'

export const FUNNEL_GOAL_LABELS: Record<FunnelGoalMetric, string> = {
  newInquiries: 'New inquiries',
  toursScheduled: 'Tours scheduled',
  toursCompleted: 'Tours completed',
  proposalsSent: 'Proposals sent',
  bookedEvents: 'Booked events',
  revenue: 'Revenue',
}

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

export function assignmentsFromBrief(brief: FunnelGoalsBrief): FunnelGoalAssignment[] {
  const assignments: FunnelGoalAssignment[] = []
  const bookings = brief.bookingsPerMonth
  if (bookings != null) {
    if (!Number.isFinite(bookings) || bookings < 0) throw new Error('bookingsPerMonth must be nonnegative.')
    assignments.push({ metric: 'bookedEvents', cadence: 'monthly', value: roundCount(bookings) })
    if (brief.averageRevenuePerBooking != null) {
      if (!Number.isFinite(brief.averageRevenuePerBooking) || brief.averageRevenuePerBooking < 0) {
        throw new Error('averageRevenuePerBooking must be nonnegative.')
      }
      assignments.push({
        metric: 'revenue',
        cadence: 'monthly',
        value: roundRevenue(bookings * brief.averageRevenuePerBooking),
      })
    }
  }

  let toursCompleted: number | undefined
  if (bookings != null && rateValid(brief.tourToBookingRate)) {
    toursCompleted = roundCount(bookings / brief.tourToBookingRate)
    assignments.push({ metric: 'toursCompleted', cadence: 'monthly', value: toursCompleted })
  }

  let proposalsSent: number | undefined
  if (bookings != null && rateValid(brief.proposalToBookingRate)) {
    proposalsSent = roundCount(bookings / brief.proposalToBookingRate)
    assignments.push({ metric: 'proposalsSent', cadence: 'monthly', value: proposalsSent })
  } else if (toursCompleted != null && rateValid(brief.tourCompletedToProposalRate)) {
    proposalsSent = roundCount(toursCompleted * brief.tourCompletedToProposalRate)
    assignments.push({ metric: 'proposalsSent', cadence: 'monthly', value: proposalsSent })
  }

  let toursScheduled: number | undefined
  if (toursCompleted != null && rateValid(brief.toursScheduledToCompletedRate)) {
    toursScheduled = roundCount(toursCompleted / brief.toursScheduledToCompletedRate)
    assignments.push({ metric: 'toursScheduled', cadence: 'monthly', value: toursScheduled })
  }

  if (toursScheduled != null && rateValid(brief.inquiryToTourScheduledRate)) {
    assignments.push({
      metric: 'newInquiries',
      cadence: 'monthly',
      value: roundCount(toursScheduled / brief.inquiryToTourScheduledRate),
    })
  }

  return assignments
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
}): ElenaFunnelGoalsCardPayload {
  const summary = input.summary.trim().slice(0, 1200)
  if (!summary) throw new Error('A short summary is required before preparing the goals card.')
  const calculations = String(input.calculations || '').trim().slice(0, 4000)
  const { goals, changedPaths } = mergeFunnelGoalAssignments(input.baseGoals, input.assignments)
  return {
    summary,
    calculations,
    goals,
    revision: input.revision,
    changedPaths,
    canSave: input.canSave,
  }
}

export function emptyGoalsBase(): FunnelGoals {
  return emptyFunnelGoals()
}