/** Compare JSON structurally without trusting object key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  throw new Error('Invalid JSON value')
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right)
export type PlanningResolutionRequest = {
  principalScope: string
  operationId: string
  expectedRevision: number | null
  kind: 'goal' | 'opening_scenario' | 'revenue_plan'
  payload?: Record<string, unknown>
  schemaVersion?: number
  expectedPayload?: Record<string, unknown> | null
  plan?: Record<string, unknown>
  baseline?: unknown[]
}

/** The body is only used for receipt matching, never to execute a write. */
export function validatePlanningResolutionRequest(value: unknown): value is PlanningResolutionRequest {
  if (!record(value) || (value.kind !== 'goal' && value.kind !== 'opening_scenario' && value.kind !== 'revenue_plan')) return false
  const versioned = value.kind !== 'revenue_plan' && ('schemaVersion' in value || 'expectedPayload' in value)
  const keys = value.kind === 'revenue_plan' ? ['principalScope', 'operationId', 'expectedRevision', 'kind', 'plan', 'baseline'] : ['principalScope', 'operationId', 'expectedRevision', 'kind', 'payload', ...(versioned ? ['schemaVersion', 'expectedPayload'] : [])]
  if (versioned && (!Number.isSafeInteger(value.schemaVersion) || Number(value.schemaVersion) < 1 || (value.expectedPayload !== null && !record(value.expectedPayload)))) return false
  if (!exact(value, keys) || typeof value.principalScope !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.principalScope) || typeof value.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.operationId)) return false
  if (value.expectedRevision !== null && (!Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0 || Number(value.expectedRevision) > 2147483646)) return false
  return value.kind === 'revenue_plan' ? record(value.plan) && Array.isArray(value.baseline) : record(value.payload)
}

export function resolvePlanningReceipt(request: PlanningResolutionRequest, row: unknown): 'saved' | 'conflict' | 'mismatch' {
  if (!record(row) || !record(row.request) || !record(row.result)) return 'mismatch'
  const expected = request.kind === 'revenue_plan'
    ? { kind: request.kind, expectedRevision: request.expectedRevision, plan: request.plan, baseline: request.baseline }
    : { kind: request.kind, expectedRevision: request.expectedRevision, payload: request.payload, ...('schemaVersion' in request ? { schemaVersion: request.schemaVersion, expectedPayload: request.expectedPayload } : {}) }
  try {
    if (!same(row.request, expected)) return 'mismatch'
    if (row.result.status === 'conflict') return 'conflict'
    if (row.result.status !== 'saved') return 'mismatch'
    const nextRevision = request.expectedRevision === null ? 0 : request.expectedRevision + 1
    if (request.kind === 'revenue_plan') {
      if (!request.plan || !Array.isArray(request.plan.months) || row.result.exists !== true || !record(row.result.plan)) return 'mismatch'
      const expectedPlan = { ...request.plan, revision: nextRevision }
      return same(row.result.plan, expectedPlan) && same(row.result.baseline, request.plan.months) ? 'saved' : 'mismatch'
    }
    if (!request.payload || !record(row.result.item) || row.result.item.kind !== request.kind) return 'mismatch'
    return same(row.result.item.payload, { ...request.payload, revision: nextRevision }) ? 'saved' : 'mismatch'
  } catch { return 'mismatch' }
}
