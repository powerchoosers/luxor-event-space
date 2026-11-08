import type { LuxorExpenseRecord } from './luxorExpenseTypes'
import type { LuxorBooking } from './luxorInquiryTypes'
import type { LuxorInvoiceFinancialSummary } from './luxorFinanceReporting'
import { getLuxorPaidExpenseValue, getLuxorPaidExpenseBreakdown, getLuxorPaymentCalendarDateKey } from './luxorFinanceReporting'
import { hasUnverifiedExpenseCash } from './luxorProfitabilityExpenseEvidence'

type AcceptedRow = LuxorInvoiceFinancialSummary['acceptedInvoiceRows'][number]
type ReceiptRow = LuxorInvoiceFinancialSummary['eventPaymentRows'][number]

/** Inputs must be complete, test-filtered and verified by the finance loader.
 * A false verification flag means unavailable, never an empty ledger. */
export type EventProfitabilityInput = {
  bookings: LuxorBooking[]
  expenses: LuxorExpenseRecord[]
  acceptedInvoiceRows: AcceptedRow[]
  eventPaymentRows: ReceiptRow[]
  obligationsVerified: boolean
  collectionsVerified: boolean
  expensesVerified: boolean
  refundReviewBookingIds?: ReadonlySet<string>
}

export type EventProfitability = {
  booking: LuxorBooking
  invoiceId: string | null
  obligation: number | null
  collections: number | null
  knownDirectCosts: number | null
  paidDirectCosts: number | null
  unpaidCommitments: number | null
  projectedContribution: number | null
  cashContribution: number | null
  outstanding: number | null
  margin: number | null
  unknownExpenseCount: number
  expenses: LuxorExpenseRecord[]
  expenseRecords: LuxorExpenseRecord[]
  issues: string[]
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export type EventCashMonth = { month: string; received: number; spent: number; profit: number }

/** Dated cash movements only. A missing date or any mismatch with the verified
 * all-time amounts makes the whole event's trend unavailable. */
export function getEventCashMonths(event: EventProfitability, receipts: ReceiptRow[]): EventCashMonth[] | null {
  if (event.collections === null || event.paidDirectCosts === null) return null
  const rows = receipts.filter((row) => row.booking_id === event.booking.id)
  const ids = new Set<string>()
  const received: Record<string, number> = {}
  for (const row of rows) {
    const date = getLuxorPaymentCalendarDateKey(row)
    if (!row.id || ids.has(row.id) || !date || !Number.isFinite(row.amount)) return null
    ids.add(row.id)
    const month = date.slice(0, 7)
    received[month] = money((received[month] || 0) + row.amount)
  }
  if (Math.abs(money(Object.values(received).reduce((sum, value) => sum + value, 0)) - event.collections) > 0.005) return null
  const expenseActivity = getLuxorPaidExpenseBreakdown(event.expenses)
  if (!expenseActivity.available || Math.abs(expenseActivity.total - event.paidDirectCosts) > 0.005
    || Math.abs(money(Object.values(expenseActivity.byMonth).reduce((sum, value) => sum + value, 0)) - event.paidDirectCosts) > 0.005) return null
  return [...new Set([...Object.keys(received), ...Object.keys(expenseActivity.byMonth)])].sort().map((month) => {
    const income = received[month] || 0
    const spent = expenseActivity.byMonth[month] || 0
    return { month, received: income, spent, profit: money(income - spent) }
  })
}

/** Expense amounts represent the commitment; their payment rows settle it and
 * are never added as another cost. Business overhead is deliberately excluded. */
export function getEventProfitability(input: EventProfitabilityInput): EventProfitability[] {
  return input.bookings.map((booking) => {
    const issues: string[] = []
    const masters = input.acceptedInvoiceRows.filter((row) => row.invoice.booking_id === booking.id)
    const master = masters.length === 1 ? masters[0] : null
    const validObligation = master && Number.isFinite(master.eventObligation) && master.eventObligation >= 0
    const active = booking.status === 'confirmed' || booking.status === 'completed'
    const obligation = active && input.obligationsVerified && validObligation ? money(master.eventObligation) : null
    if (active && obligation === null) issues.push(masters.length > 1 ? 'More than one accepted invoice needs review.' : 'A verified accepted event obligation is not available.')

    const receipts = input.eventPaymentRows.filter((row) => row.booking_id === booking.id)
    const collections = active && input.collectionsVerified && !input.refundReviewBookingIds?.has(booking.id) && receipts.every((row) => Number.isFinite(row.amount))
      ? money(receipts.reduce((sum, row) => sum + row.amount, 0)) : null
    if (active && collections === null) issues.push('Event collections need reconciliation.')
    if (!active) issues.push(booking.status === 'cancelled' ? 'Historical activity is shown below. Contract balance and profit require cancellation review.' : 'This booking is not confirmed; its contract and cash figures are not included in active totals.')

    const linked = input.expenses.filter((expense) => expense.booking_id === booking.id)
    const expenses = linked.filter((expense) => expense.expense_type === 'event' && expense.status !== 'cancelled')
    const unresolved = linked.some((expense) => !expense.expense_type || (expense.status === 'cancelled' && (getLuxorPaidExpenseValue(expense) ?? 1) !== 0))
    const ids = new Set(expenses.map((expense) => expense.id))
    const billIds = expenses.map((expense) => expense.source_bill_id).filter((id): id is string => Boolean(id))
    const duplicate = ids.size !== expenses.length || expenses.some((expense) => !expense.id) || new Set(billIds).size !== billIds.length
    const unknown = expenses.filter((expense) => expense.amount_known === false || expense.metadata?.amount_state === 'variable' || expense.metadata?.amount_state === 'unknown' || !Number.isFinite(Number(expense.amount)) || Number(expense.amount) < 0)
    const paid = expenses.map(getLuxorPaidExpenseValue)
    // The shared loader includes legacy metadata in paid_amount. Neither that
    // metadata nor a paid status without transactions proves cash movement.
    // Keep the source records visible, but withhold totals pending review.
    const unverifiedLegacy = expenses.some(hasUnverifiedExpenseCash)
    const invalidPaid = paid.some((value) => value === null || value < 0) || unverifiedLegacy
    const costsAvailable = input.expensesVerified && !duplicate && !unresolved
    const knownDirectCosts = costsAvailable ? money(expenses.filter((expense) => !unknown.includes(expense)).reduce((sum, expense) => sum + Number(expense.amount), 0)) : null
    const paidDirectCosts = costsAvailable && !invalidPaid ? money(paid.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null
    const unpaidCommitments = costsAvailable && unknown.length === 0 && paidDirectCosts !== null && expenses.every((expense, index) => (paid[index] ?? 0) <= Number(expense.amount) + 0.005)
      ? money(expenses.reduce((sum, expense, index) => sum + Number(expense.amount) - (paid[index] ?? 0), 0)) : null
    if (!costsAvailable) issues.push('Event expense records could not be verified.')
    if (unknown.length) issues.push(`${unknown.length} linked expense${unknown.length === 1 ? ' has' : 's have'} an unknown amount.`)
    if (unverifiedLegacy) issues.push('Expense payment amounts lack verified payment records. Review the source before relying on cash totals.')
    else if (costsAvailable && (invalidPaid || unpaidCommitments === null && unknown.length === 0)) issues.push('Expense payments need review.')
    const cashContribution = collections !== null && paidDirectCosts !== null ? money(collections - paidDirectCosts) : null
    // A completed event refund does not prove how the contract was amended.
    const hasEventRefund = receipts.some((receipt) => receipt.amount < 0)
    const outstanding = obligation !== null && collections !== null && !hasEventRefund && collections <= obligation + 0.005 ? money(Math.max(0, obligation - collections)) : null
    if (active && hasEventRefund) issues.push('Review the contract after the event refund before relying on its remaining balance or estimate.')
    return {
      booking, invoiceId: obligation === null ? null : master?.invoice.id || null,
      obligation, collections, knownDirectCosts, paidDirectCosts, unpaidCommitments,
      projectedContribution: obligation !== null && knownDirectCosts !== null && unknown.length === 0 && !hasEventRefund ? money(obligation - knownDirectCosts) : null,
      cashContribution, outstanding, margin: cashContribution !== null && collections !== null && collections > 0 ? cashContribution / collections * 100 : null,
      unknownExpenseCount: unknown.length, expenses, expenseRecords: linked.filter((expense) => expense.expense_type === 'event'), issues,
    }
  })
}
