import type { LuxorExpenseRecord } from './luxorExpenseTypes'

/** Legacy metadata and an unsupported paid status are not payment records. */
export function hasUnverifiedExpenseCash(expense: LuxorExpenseRecord) {
  const legacy = expense.metadata?.legacy_paid_amount
  if (legacy != null) {
    if ((typeof legacy !== 'number' && typeof legacy !== 'string') || (typeof legacy === 'string' && !legacy.trim())) return true
    const amount = Number(legacy)
    if (!Number.isFinite(amount) || amount !== 0) return true
  }
  return !Array.isArray(expense.payments) || (expense.status === 'paid' && expense.payments.length === 0)
}
