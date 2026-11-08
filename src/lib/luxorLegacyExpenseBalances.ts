/**
 * A legacy paid marker is a claim, not proof of settlement. Keep this helper
 * independent of portal presentation so every finance consumer can use the
 * same conservative classification once its nullable-balance contract is wired.
 */
export function hasUnresolvedLegacyExpenseBalance(
  expense: { status: string; metadata?: Record<string, unknown> | null },
  paymentCount: number | null,
) {
  if (paymentCount === null || !Number.isSafeInteger(paymentCount) || paymentCount < 0) return true
  return Object.prototype.hasOwnProperty.call(expense.metadata ?? {}, 'legacy_paid_amount')
    || (expense.status === 'paid' && paymentCount === 0)
}
