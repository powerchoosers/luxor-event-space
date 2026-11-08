import { validateGoalDraft, validateOpeningScenarioDraft } from './luxorFinancialPlanningTypes'
import type { PlanningReviewItem, StoredPlanningItem } from './luxorFinancialPlanningApi'
import type { PendingPlanningRequest, PlanningSaveResult } from './luxorFinancialPlanningRecovery'

/** Isolated same-origin client; the server verifies the member on every call. */
export function createPlanningClientDraft(endpoint: string, fetcher: typeof fetch = fetch) {
  if (!/^\/api\/portal\/[a-z0-9/_-]+$/.test(endpoint)) throw new Error('A same-origin portal API path is required.')
  async function list(): Promise<{ principalScope: string; items: StoredPlanningItem[]; needsReview: PlanningReviewItem[] }> {
    const response = await fetcher(endpoint, { method: 'GET', cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) throw new Error('Planning records are unavailable.')
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object') throw new Error('Planning records could not be verified.')
    const value = result as { principalScope?: unknown; items?: unknown; needsReview?: unknown }
    if (typeof value.principalScope !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value.principalScope) || !Array.isArray(value.items) || !Array.isArray(value.needsReview) || value.items.length + value.needsReview.length > 10000) throw new Error('Planning records could not be verified.')
    const seen = new Set<string>()
    for (const raw of value.items) {
      if (!raw || typeof raw !== 'object') throw new Error('Planning records could not be verified.')
      const item = raw as StoredPlanningItem
      if (!item.payload || (item.kind !== 'goal' && item.kind !== 'opening_scenario') || seen.has(item.payload.id)) throw new Error('Planning records could not be verified.')
      const keys = item.kind === 'goal' ? ['id', 'metric', 'title', 'periodStart', 'periodEnd', 'target', 'direction', 'status', 'revision'] : ['id', 'label', 'source', 'asOf', 'openingAmount', 'minimumReserve', 'status', 'revision']
      if (Array.isArray(item.payload) || Object.keys(item.payload).length !== keys.length || !keys.every((key) => Object.prototype.hasOwnProperty.call(item.payload, key))) throw new Error('Planning records could not be verified.')
      const issues = item.kind === 'goal' ? validateGoalDraft(item.payload) : validateOpeningScenarioDraft(item.payload)
      if (issues.length) throw new Error('Planning records could not be verified.')
      seen.add(item.payload.id)
    }
    for (const raw of value.needsReview) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Planning records could not be verified.')
      const item = raw as Record<string, unknown>
      if (Object.keys(item).length !== 2 || typeof item.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.id) || seen.has(item.id) || (item.kind !== null && item.kind !== 'goal' && item.kind !== 'opening_scenario')) throw new Error('Planning records could not be verified.')
      seen.add(item.id)
    }
    return { principalScope: value.principalScope, items: value.items as StoredPlanningItem[], needsReview: value.needsReview as PlanningReviewItem[] }
  }
  async function save(principalScope: string, request: PendingPlanningRequest): Promise<PlanningSaveResult> {
    const response = await fetcher(endpoint, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, principalScope }) })
    const result: unknown = await response.json().catch(() => null)
    if (!result || typeof result !== 'object') throw new Error('Save status is unknown.')
    const { status, code } = result as { status?: unknown; code?: unknown }
    // Clear only a response explicitly attesting that the write never started.
    if ([400, 413, 501].includes(response.status) && code === 'rejected_before_write') return { status: 'rejected' }
    if (response.status === 409 && status === 'conflict') return { status: 'conflict' }
    if (response.ok && (status === 'saved' || status === 'replayed')) return { status }
    throw new Error('Save status is unknown or the signed-in member changed.')
  }
  return { list, save }
}
