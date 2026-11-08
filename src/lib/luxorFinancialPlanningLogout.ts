import { inspectPlanningLogoutDraft } from './luxorFinancialPlanningRecovery'
import { inspectRevenuePlanLogout } from './luxorFinancialRevenuePlanClient'

/** Use a freshly server-verified principal scope; unavailable is never clear.
 * Install at portal-shell lifetime, inspect both logout forms and after each
 * resolution, and retain pending session storage until a confirmed receipt.
 * This reports only the supplied tab storage; clear is not a cross-tab guarantee. */
export function inspectFinancialPlanningLogout(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, scope: string) {
  const planning = inspectPlanningLogoutDraft(storage, scope)
  const revenue = inspectRevenuePlanLogout(storage, scope)
  if (planning.status === 'pending') return planning
  if (revenue.status === 'pending') return revenue
  if (planning.status === 'unavailable' || revenue.status === 'unavailable') return { status: 'unavailable' as const }
  return { status: 'clear' as const }
}
