import { validatePlanningResolutionRequest } from './luxorFinancialPlanningResolution'
import { validateEnvelopeDraft, validateGoalDraft, validateOpeningScenarioDraft, type ManualOpeningScenario, type PlanningGoal } from './luxorFinancialPlanningTypes'

/**
 * Isolated client-side retry design. The host supplies tab-scoped Storage and
 * an opaque, stable, signed-in principal scope. The pending request can contain
 * private planning values and is stored only in that tab's session storage;
 * pending requests must not be cleared before a confirmed outcome. This storage
 * is limited to the current tab and may be lost when the tab is closed.
 */
export type PendingPlanningRequest = {
  operationId: string
  expectedRevision: number | null
  /** Absent only on older pending requests, which may be resolved but not resent. */
  schemaVersion?: 1
  expectedPayload?: PlanningGoal | ManualOpeningScenario | null
  kind: 'goal' | 'opening_scenario'
  payload: PlanningGoal | ManualOpeningScenario
}
export type PlanningSaveResult = { status: 'saved' | 'replayed' } | { status: 'conflict' | 'rejected' }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Archiving is a revisioned update, not deletion of historical records. */
export function buildPlanningStatusRequestDraft(item: { kind: PendingPlanningRequest['kind']; payload: PendingPlanningRequest['payload'] }, status: 'active' | 'archived', operationId: string): PendingPlanningRequest {
  const request = { operationId, expectedRevision: item.payload.revision, schemaVersion: 1 as const, expectedPayload: { ...item.payload }, kind: item.kind, payload: { ...item.payload, status } }
  if (!validRequest(request)) throw new Error('Invalid planning status update.')
  return request
}

function validRequest(input: unknown): input is PendingPlanningRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const record = input as PendingPlanningRequest
  if (!record.payload || typeof record.payload !== 'object' || (record.kind !== 'goal' && record.kind !== 'opening_scenario')) return false
  try {
    const errors = validateEnvelopeDraft({ operationId: record.operationId, expectedRevision: record.expectedRevision, payload: record.payload })
    const itemErrors = record.kind === 'goal' ? validateGoalDraft(record.payload as PlanningGoal) : validateOpeningScenarioDraft(record.payload as ManualOpeningScenario)
    const keys = record.kind === 'goal' ? ['id', 'metric', 'title', 'periodStart', 'periodEnd', 'target', 'direction', 'status', 'revision'] : ['id', 'label', 'source', 'asOf', 'openingAmount', 'minimumReserve', 'status', 'revision']
    const exact = (value: unknown): value is PlanningGoal | ManualOpeningScenario => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)))
    if (record.schemaVersion !== 1 || !exact(record.payload)) return false
    if (record.expectedRevision === null) return record.expectedPayload === null && errors.length === 0 && itemErrors.length === 0
    const baseline = record.expectedPayload
    if (!exact(baseline) || baseline.id !== record.payload.id || baseline.revision !== record.expectedRevision) return false
    const baselineErrors = record.kind === 'goal' ? validateGoalDraft(baseline as PlanningGoal) : validateOpeningScenarioDraft(baseline as ManualOpeningScenario)
    return errors.length === 0 && itemErrors.length === 0 && baselineErrors.length === 0
  } catch { return false }
}

export function createPlanningRetryStoreDraft(storage: StorageLike, principalScope: string) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(principalScope)) throw new Error('A stable opaque principal scope is required.')
  const key = `luxor-planning-pending-v1:${principalScope}`
  function load(): PendingPlanningRequest | null {
    const raw = storage.getItem(key)
    if (raw === null) return null
    if (raw.length > 16000) throw new Error('Saved planning request needs review.')
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error('Saved planning request needs review.') }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !validatePlanningResolutionRequest({ ...value, principalScope })) throw new Error('Saved planning request needs review.')
    return value as PendingPlanningRequest
  }
  function stage(request: PendingPlanningRequest) {
    if (!validRequest(request)) throw new Error('Invalid planning request.')
    const previous = load()
    if (previous && (previous.operationId !== request.operationId || JSON.stringify(previous) !== JSON.stringify(request))) throw new Error('Resolve the existing save before making another change.')
    storage.setItem(key, JSON.stringify(request))
  }
  function clear(operationId: string) {
    const previous = load()
    if (!previous || previous.operationId !== operationId) throw new Error('Pending request changed; refresh before proceeding.')
    storage.removeItem(key)
  }
  return { load, stage, clear }
}

/** Stage before transmission; failed storage prevents the request from being sent. */
export async function savePlanningWithRecoveryDraft(
  store: ReturnType<typeof createPlanningRetryStoreDraft>,
  request: PendingPlanningRequest,
  send: (value: PendingPlanningRequest) => Promise<PlanningSaveResult>,
) {
  const prior = store.load()
  store.stage(request)
  const result = await send(request) // On uncertain failure the original request remains staged.
  if (!['saved', 'replayed', 'conflict', 'rejected'].includes(result.status)) throw new Error('Save status is unknown.')
  if (prior && (result.status === 'rejected' || result.status === 'conflict')) throw new Error('Earlier save status still needs confirmation.')
  store.clear(request.operationId) // A failed clear leaves the request to retry safely.
  return result
}

/** Logout integration may inspect without clearing an unconfirmed write. */
export function inspectPlanningLogoutDraft(storage: StorageLike, principalScope: string): { status: 'clear' } | { status: 'pending'; operationId: string } | { status: 'unavailable' } {
  try {
    const pending = createPlanningRetryStoreDraft(storage, principalScope).load()
    return pending ? { status: 'pending', operationId: pending.operationId } : { status: 'clear' }
  } catch { return { status: 'unavailable' } }
}
