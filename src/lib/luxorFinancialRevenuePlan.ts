import { validateEnvelopeDraft, validateRevenuePlanDraft, type MonthlyRevenueAllocation, type RevenuePlan } from '@/lib/luxorFinancialPlanningTypes'

export type RevenuePlanSnapshot = { exists: boolean; plan: RevenuePlan; baseline: MonthlyRevenueAllocation[] }
export type RevenuePlanWrite = { principalScope: string; operationId: string; expectedRevision: number | null; plan: RevenuePlan; baseline: MonthlyRevenueAllocation[] }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
const monthArray = (value: unknown): value is MonthlyRevenueAllocation[] => Array.isArray(value) && value.length === 12 && value.every((row) => record(row) && exact(row, ['month', 'amount']))

export function validateRevenueSnapshot(value: unknown): value is RevenuePlanSnapshot {
  if (!record(value) || !exact(value, ['exists', 'plan', 'baseline']) || typeof value.exists !== 'boolean' || !record(value.plan) || !exact(value.plan, ['year', 'annualTarget', 'months', 'revision']) || !monthArray(value.plan.months) || !monthArray(value.baseline)) return false
  const plan = value.plan as RevenuePlan
  const baseline = value.baseline
  // Legacy month edits can make a saved annual target inconsistent; retain the
  // snapshot for review, while the write validator still requires reconciliation.
  if (validateRevenuePlanDraft(plan).some((issue) => issue !== 'Monthly targets do not add up to the annual target') || validateRevenuePlanDraft({ ...plan, annualTarget: null, months: baseline }).length) return false
  if (plan.months.some((row, index) => row.month !== `${plan.year}-${String(index + 1).padStart(2, '0')}` || row.month !== baseline[index].month || row.amount !== baseline[index].amount)) return false
  return value.exists || (plan.revision === 0 && plan.annualTarget === null)
}

export function validateRevenueWrite(value: unknown): value is RevenuePlanWrite {
  if (!record(value) || !exact(value, ['principalScope', 'operationId', 'expectedRevision', 'plan', 'baseline']) || typeof value.principalScope !== 'string' || !record(value.plan) || !exact(value.plan, ['year', 'annualTarget', 'months', 'revision']) || !monthArray(value.plan.months) || !monthArray(value.baseline)) return false
  const plan = value.plan as RevenuePlan
  const baseline = value.baseline
  if (value.expectedRevision !== null && (typeof value.expectedRevision !== 'number' || value.expectedRevision > 2147483646)) return false
  if (validateEnvelopeDraft({ operationId: value.operationId as string, expectedRevision: value.expectedRevision as number | null, payload: plan }).length || validateRevenuePlanDraft(plan).length || validateRevenuePlanDraft({ ...plan, annualTarget: null, months: baseline }).length) return false
  return plan.months.every((row, index) => row.month === `${plan.year}-${String(index + 1).padStart(2, '0')}` && row.month === baseline[index].month && !(baseline[index].amount !== null && row.amount === null))
}

/** Match RPC confirmation exactly; JSON object key order is immaterial. */
export function revenueConfirmationMatches(request: RevenuePlanWrite, result: unknown): boolean {
  if (!record(result) || (result.status !== 'saved' && result.status !== 'replayed')) return false
  const snapshot = { exists: result.exists, plan: result.plan, baseline: result.baseline }
  if (!validateRevenueSnapshot(snapshot)) return false
  const expectedRevision = request.expectedRevision === null ? 0 : request.expectedRevision + 1
  return snapshot.exists && snapshot.plan.year === request.plan.year && snapshot.plan.revision === expectedRevision && snapshot.plan.annualTarget === request.plan.annualTarget && snapshot.plan.months.every((row, i) => row.month === request.plan.months[i].month && row.amount === request.plan.months[i].amount)
}
