import { validatePlanningResolutionRequest } from './luxorFinancialPlanningResolution'
import { validateRevenueSnapshot, validateRevenueWrite, type RevenuePlanSnapshot, type RevenuePlanWrite } from '@/lib/luxorFinancialRevenuePlan'
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const endpoint = '/api/portal/financial-planning/revenue-plan'

/** Principal-scoped retry record; the host must retain it until confirmed. */
export function createRevenuePlanRetryStore(storage: StorageLike, scope: string) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(scope)) throw new Error('Invalid principal scope')
  const key = `luxor-revenue-plan-pending-v1:${scope}`
  function load(): RevenuePlanWrite | null {
    const raw = storage.getItem(key)
    if (raw === null) return null
    if (raw.length > 16000) throw new Error('Saved request needs review')
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error('Saved request needs review') }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !validatePlanningResolutionRequest({ ...value, kind: 'revenue_plan' }) || (value as { principalScope?: unknown }).principalScope !== scope) throw new Error('Saved request needs review')
    return value as RevenuePlanWrite
  }
  function stage(value: RevenuePlanWrite) {
    if (!validateRevenueWrite(value) || value.principalScope !== scope) throw new Error('Invalid revenue plan')
    const existing = load()
    if (existing && (existing.operationId !== value.operationId || JSON.stringify(existing) !== JSON.stringify(value))) throw new Error('Resolve the existing save first')
    storage.setItem(key, JSON.stringify(value))
  }
  function clear(operationId: string) {
    const existing = load()
    if (!existing || existing.operationId !== operationId) throw new Error('Pending request changed')
    storage.removeItem(key)
  }
  return { load, stage, clear }
}
export function inspectRevenuePlanLogout(storage: StorageLike, scope: string): { status: 'clear' } | { status: 'pending'; operationId: string } | { status: 'unavailable' } {
  try { const request = createRevenuePlanRetryStore(storage, scope).load(); return request ? { status: 'pending', operationId: request.operationId } : { status: 'clear' } }
  catch { return { status: 'unavailable' } }
}
export async function loadRevenuePlan(year: number, scope: string, fetcher: typeof fetch = fetch): Promise<{ snapshot: RevenuePlanSnapshot; writeAvailable: boolean }> {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Invalid year')
  const response = await fetcher(`${endpoint}?year=${year}`, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Revenue plan is unavailable')
  const result = await response.json() as { principalScope?: unknown; snapshot?: unknown; writeAvailable?: unknown }
  if (result.principalScope !== scope || typeof result.writeAvailable !== 'boolean' || !validateRevenueSnapshot(result.snapshot) || result.snapshot.plan.year !== year) throw new Error('Revenue plan could not be verified')
  return { snapshot: result.snapshot, writeAvailable: result.writeAvailable }
}
export async function saveRevenuePlan(store: ReturnType<typeof createRevenuePlanRetryStore>, request: RevenuePlanWrite, fetcher: typeof fetch = fetch): Promise<'saved' | 'replayed' | 'conflict' | 'rejected' | 'unavailable'> {
  const prior = store.load()
  store.stage(request)
  const response = await fetcher(endpoint, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
  const result: unknown = await response.json().catch(() => null)
  if (!result || typeof result !== 'object') throw new Error('Save status is unknown')
  const value = result as { status?: unknown; code?: unknown }
  let status: 'saved' | 'replayed' | 'conflict' | 'rejected' | 'unavailable'
  if ((response.status === 400 || response.status === 413) && value.code === 'rejected_before_write') status = 'rejected'
  else if (response.status === 501 && value.code === 'rejected_before_write') status = 'unavailable'
  else if (response.status === 409 && value.status === 'conflict') status = 'conflict'
  else if (response.ok && (value.status === 'saved' || value.status === 'replayed')) status = value.status
  else throw new Error('Save status is unknown or the signed-in member changed')
  // A later rejection or conflict cannot establish whether an earlier request
  // with a lost response committed; keep the original operation for review.
  if (prior && (status === 'rejected' || status === 'conflict' || status === 'unavailable')) throw new Error('Earlier save status still needs confirmation')
  store.clear(request.operationId)
  return status
}
