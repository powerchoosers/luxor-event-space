export type RevenueProfitEvent = {
  booking: { status: string }
  collections: number | null
  paidDirectCosts: number | null
  cashContribution: number | null
  unknownExpenseCount: number
}

export function summarizeRevenueProfit(events: RevenueProfitEvent[], issues: string[]) {
  const active = events.filter((event) => event.booking.status === 'confirmed' || event.booking.status === 'completed')
  const valid = issues.length === 0 && active.every((event) =>
    typeof event.collections === 'number' && Number.isFinite(event.collections)
    && typeof event.paidDirectCosts === 'number' && Number.isFinite(event.paidDirectCosts)
    && typeof event.cashContribution === 'number' && Number.isFinite(event.cashContribution)
    && Math.abs(event.cashContribution - (event.collections - event.paidDirectCosts)) < 0.011,
  )
  if (!valid) return { count: active.length, verified: false, collected: null, paidCosts: null, cashProfit: null, margin: null, unknownCosts: active.some((event) => event.unknownExpenseCount > 0) }
  const collected = active.reduce((sum, event) => sum + event.collections!, 0)
  const paidCosts = active.reduce((sum, event) => sum + event.paidDirectCosts!, 0)
  const cashProfit = active.reduce((sum, event) => sum + event.cashContribution!, 0)
  return { count: active.length, verified: true, collected, paidCosts, cashProfit, margin: collected > 0 ? cashProfit / collected * 100 : null, unknownCosts: active.some((event) => event.unknownExpenseCount > 0) }
}
