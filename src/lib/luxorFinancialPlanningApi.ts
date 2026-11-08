import { hasSupportedPlanningBounds } from './luxorFinancialPlanningBounds'
import { validateEnvelopeDraft, validateGoalDraft, validateOpeningScenarioDraft, type PlanningGoal, type ManualOpeningScenario } from './luxorFinancialPlanningTypes'
import { readPlanningJson } from './luxorFinancialPlanningRequest'

/**
 * ISOLATED DRAFT API: host must inject server-authorized identity and an atomic
 * transaction-backed store. It is not a Next route until installed by the
 * coordinator; do not wire it to production before a reviewed migration.
 */
export type StoredPlanningItem = { kind: 'goal'; payload: PlanningGoal } | { kind: 'opening_scenario'; payload: ManualOpeningScenario }
export type PlanningReviewItem = { id: string; kind: 'goal' | 'opening_scenario' | null }
export type PlanningList = { items: StoredPlanningItem[]; needsReview: PlanningReviewItem[] }
type WriteResult = { status: 'saved' | 'replayed'; item: StoredPlanningItem } | { status: 'conflict'; currentRevision: number | null }
export type PlanningApiDeps = {
  /** Resolves a verified portal session and finance access server-side. */
  authorize: () => Promise<{ email: string; principalScope: string } | null>
  /** Reads complete active and archived items; must fail rather than truncate. */
  list: () => Promise<PlanningList>
  /** Atomic CAS, actor-scoped idempotency, item update and audit insertion. */
  write: (input: { actor: string; operationId: string; expectedRevision: number | null; schemaVersion: 1; expectedPayload: PlanningGoal | ManualOpeningScenario | null; item: StoredPlanningItem }) => Promise<WriteResult>
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const rejected = (error: string, status = 400, fields?: string[]) => json({ error, code: 'rejected_before_write', ...(fields ? { fields } : {}) }, status)
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const hasExactKeys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
const GOAL_KEYS = ['id', 'metric', 'title', 'periodStart', 'periodEnd', 'target', 'direction', 'status', 'revision']
const SCENARIO_KEYS = ['id', 'label', 'source', 'asOf', 'openingAmount', 'minimumReserve', 'status', 'revision']

export async function handlePlanningDraft(request: Request, deps: PlanningApiDeps): Promise<Response> {
  let actor: { email: string; principalScope: string } | null
  try { actor = await deps.authorize() } catch { return json({ error: 'Finance access could not be verified.' }, 503) }
  if (!actor || !actor.email.trim() || !/^[a-zA-Z0-9_-]{8,128}$/.test(actor.principalScope)) return json({ error: 'Finance access required.' }, 403)
  if (request.method === 'GET') {
    try { return json({ ...(await deps.list()), principalScope: actor.principalScope }) }
    catch { return json({ error: 'Planning records are unavailable.' }, 503) }
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: 'Same-origin JSON request required.' }, 403)
  const parsed = await readPlanningJson(request)
  if (!parsed.ok) return rejected(parsed.reason === 'too_large' ? 'Request is too large.' : 'Invalid request.', parsed.reason === 'too_large' ? 413 : 400)
  const input = parsed.value
  if (!isRecord(input) || !hasExactKeys(input, ['kind', 'operationId', 'expectedRevision', 'schemaVersion', 'expectedPayload', 'payload', 'principalScope']) || !isRecord(input.payload)) return rejected('Invalid request.')
  // Scope binds a pending retry to the verified current member; it is not a credential.
  if (input.principalScope !== actor.principalScope) return json({ error: 'The signed-in member changed.', code: 'principal_changed' }, 403)
  if (input.kind === 'revenue_plan') return rejected('Revenue plan writes require the coordinated monthly-target adapter.', 501)
  if (input.kind !== 'goal' && input.kind !== 'opening_scenario') return rejected('Invalid planning item.')
  if (input.schemaVersion !== 1 || !hasExactKeys(input.payload, input.kind === 'goal' ? GOAL_KEYS : SCENARIO_KEYS) || !hasSupportedPlanningBounds(input.kind, input.payload)) return rejected('Invalid planning fields.')
  const baseline = input.expectedPayload
  if (input.expectedRevision === null ? baseline !== null : !isRecord(baseline) || !hasExactKeys(baseline, input.kind === 'goal' ? GOAL_KEYS : SCENARIO_KEYS) || baseline.id !== input.payload.id || baseline.revision !== input.expectedRevision || !hasSupportedPlanningBounds(input.kind, baseline)) return rejected('Invalid prior planning state.')
  const item = { kind: input.kind, payload: input.payload } as StoredPlanningItem
  try {
    const envelopeErrors = validateEnvelopeDraft({ operationId: input.operationId as string, expectedRevision: input.expectedRevision as number | null, payload: item.payload })
    const payloadErrors = item.kind === 'goal' ? validateGoalDraft(item.payload) : validateOpeningScenarioDraft(item.payload)
    const baselineErrors = baseline === null ? [] : input.kind === 'goal' ? validateGoalDraft(baseline as PlanningGoal) : validateOpeningScenarioDraft(baseline as ManualOpeningScenario)
    if (envelopeErrors.length || payloadErrors.length || baselineErrors.length) return rejected('Invalid planning details.', 400, [...envelopeErrors, ...payloadErrors, ...baselineErrors])
    // Stable member ID keeps idempotency scoped to the same principal even if
    // their email changes; audit resolution stays server-side.
    const result = await deps.write({ actor: actor.principalScope, operationId: input.operationId as string, expectedRevision: input.expectedRevision as number | null, schemaVersion: 1, expectedPayload: baseline as PlanningGoal | ManualOpeningScenario | null, item })
    return json(result, result.status === 'conflict' ? 409 : 200)
  } catch {
    // Do not leak database details or pretend an uncertain write failed.
    return json({ error: 'Save status is unknown. Retry with the same request ID.', retrySameOperation: true }, 503)
  }
}
