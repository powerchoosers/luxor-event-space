import { hasSupportedPlanningBounds } from './luxorFinancialPlanningBounds'
import { validateGoalDraft, validateOpeningScenarioDraft } from './luxorFinancialPlanningTypes'
import type { PlanningApiDeps, StoredPlanningItem } from './luxorFinancialPlanningApi'

/**
 * ISOLATED DRAFT adapter for a reviewed PostgREST RPC. The RPC must perform
 * the entire CAS/idempotency/audit operation in one transaction. A failed
 * response has uncertain outcome; retry only with the same operation ID.
 * The named table and RPC do not yet exist and no migration is included here.
 */
export function createPlanningStoreDraft(deps: {
  authorize: PlanningApiDeps['authorize']
  rest: <T>(path: string, init?: RequestInit) => Promise<T>
}): PlanningApiDeps {
  return {
    authorize: deps.authorize,
    async list() {
      type Row = { id?: unknown; kind?: unknown; revision?: unknown; schemaVersion?: unknown; supportedV1?: unknown; payload?: unknown }
      // One complete, capped snapshot; invalid identities make it untrustworthy.
      const result = await deps.rest<{ rows: Row[]; complete: boolean }>('rpc/luxor_list_financial_planning_items', { method: 'POST', body: '{}' })
      if (!result || result.complete !== true || !Array.isArray(result.rows) || result.rows.length > 10000) throw new Error('Incomplete planning records')
      const ids = new Set<string>()
      const items: StoredPlanningItem[] = []
      const needsReview: { id: string; kind: 'goal' | 'opening_scenario' | null }[] = []
      for (const row of result.rows) {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id) || ids.has(row.id)) throw new Error('Invalid planning identities')
        ids.add(row.id)
        const kind = row.kind === 'goal' || row.kind === 'opening_scenario' ? row.kind : null
        let item: StoredPlanningItem | null = null
        try {
          const payload = row.payload
          if (row.schemaVersion === 1 && row.supportedV1 === true && kind && payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const value = payload as Record<string, unknown>
            const keys = kind === 'goal' ? ['id', 'metric', 'title', 'periodStart', 'periodEnd', 'target', 'direction', 'status', 'revision'] : ['id', 'label', 'source', 'asOf', 'openingAmount', 'minimumReserve', 'status', 'revision']
            const exact = Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
            const boundsSupported = hasSupportedPlanningBounds(kind, value)
            if (exact && boundsSupported && row.id === value.id && row.revision === value.revision) {
              const candidate = { kind, payload } as StoredPlanningItem
              const errors = candidate.kind === 'goal' ? validateGoalDraft(candidate.payload) : validateOpeningScenarioDraft(candidate.payload)
              if (!errors.length) item = candidate
            }
          }
        } catch { /* Quarantine malformed older data; never invent replacement values. */ }
        if (item) items.push(item)
        else needsReview.push({ id: row.id, kind })
      }
      return { items, needsReview }
    },
    async write(input) {
      const result = await deps.rest<unknown>('rpc/luxor_write_financial_planning_item', {
        method: 'POST',
        body: JSON.stringify({ p_actor: input.actor, p_operation_id: input.operationId, p_expected_revision: input.expectedRevision, p_schema_version: input.schemaVersion, p_expected_payload: input.expectedPayload, p_kind: input.item.kind, p_payload: input.item.payload }),
      })
      if (!result || typeof result !== 'object') throw new Error('Unconfirmed planning write')
      const value = result as { status?: unknown; item?: unknown; currentRevision?: unknown }
      if (value.status === 'conflict' && (value.currentRevision === null || (Number.isSafeInteger(value.currentRevision) && Number(value.currentRevision) >= 0))) return { status: 'conflict', currentRevision: value.currentRevision as number | null }
      if ((value.status === 'saved' || value.status === 'replayed') && value.item && typeof value.item === 'object') {
        const item = value.item as StoredPlanningItem
        if (item.kind !== input.item.kind || !item.payload || item.payload.id !== input.item.payload.id) throw new Error('Unconfirmed planning write')
        const valid = item.kind === 'goal' ? validateGoalDraft(item.payload) : validateOpeningScenarioDraft(item.payload)
        if (valid.length) throw new Error('Invalid returned planning item')
        const expectedRevision = input.expectedRevision === null ? 0 : input.expectedRevision + 1
        const expectedPayload = { ...input.item.payload, revision: expectedRevision }
        const expectedKeys = Object.keys(expectedPayload).sort()
        const actualKeys = Object.keys(item.payload).sort()
        if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, index) => key !== actualKeys[index] || (expectedPayload as unknown as Record<string, unknown>)[key] !== (item.payload as unknown as Record<string, unknown>)[key])) throw new Error('Unconfirmed planning write')
        return { status: value.status, item }
      }
      throw new Error('Unconfirmed planning write')
    },
  }
}
