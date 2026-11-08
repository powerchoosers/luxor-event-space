import type { LuxorExpenseRecord } from './luxorExpenseTypes'
import type { LuxorBooking } from './luxorInquiryTypes'
import type { LuxorInvoiceFinancialSummary } from './luxorFinanceReporting'
import { getLuxorPaidExpenseValue } from './luxorFinanceReporting'

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
  unknownExpenseCount: number
  expenses: LuxorExpenseRecord[]
  issues: string[]
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Expense amounts represent the commitment; their payment rows settle it and
 * are never added as another cost. Business overhead is deliberately excluded. */
export function getEventProfitability(input: EventProfitabilityInput): EventProfitability[] {
  return input.bookings.map((booking) => {
    const issues: string[] = []
    const masters = input.acceptedInvoiceRows.filter((row) => row.invoice.booking_id === booking.id)
    const master = masters.length === 1 ? masters[0] : null
    const validObligation = master && Number.isFinite(master.eventObligation) && master.eventObligation >= 0
    const obligation = input.obligationsVerified && validObligation ? money(master.eventObligation) : null
    if (obligation === null) issues.push(masters.length > 1 ? 'More than one accepted invoice needs review.' : 'A verified accepted event obligation is not available.')

    const receipts = input.eventPaymentRows.filter((row) => row.booking_id === booking.id)
    const collections = input.collectionsVerified && receipts.every((row) => Number.isFinite(row.amount))
      ? money(receipts.reduce((sum, row) => sum + row.amount, 0)) : null
    if (collections === null) issues.push('Event collections need reconciliation.')

    const linked = input.expenses.filter((expense) => expense.booking_id === booking.id)
    const expenses = linked.filter((expense) => expense.expense_type === 'event' && expense.status !== 'cancelled')
    const unresolved = linked.some((expense) => !expense.expense_type || (expense.status === 'cancelled' && (getLuxorPaidExpenseValue(expense) ?? 1) !== 0))
    const ids = new Set(expenses.map((expense) => expense.id))
    const billIds = expenses.map((expense) => expense.source_bill_id).filter((id): id is string => Boolean(id))
    const duplicate = ids.size !== expenses.length || expenses.some((expense) => !expense.id) || new Set(billIds).size !== billIds.length
    const unknown = expenses.filter((expense) => expense.amount_known === false || (Number(expense.amount) === 0 && expense.metadata?.amount_state === 'variable') || !Number.isFinite(Number(expense.amount)) || Number(expense.amount) < 0)
    const paid = expenses.map(getLuxorPaidExpenseValue)
    // A legacy paid status without payment history does not prove the cash
    // amount. The shared loader may infer the full cost for older views.
    const invalidPaid = paid.some((value, index) => value === null || value < 0
      || (expenses[index].status === 'paid' && !expenses[index].payments?.length
        && expenses[index].metadata?.legacy_paid_amount == null))
    const costsAvailable = input.expensesVerified && !duplicate && !unresolved
    const knownDirectCosts = costsAvailable ? money(expenses.filter((expense) => !unknown.includes(expense)).reduce((sum, expense) => sum + Number(expense.amount), 0)) : null
    const paidDirectCosts = costsAvailable && !invalidPaid ? money(paid.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null
    const unpaidCommitments = costsAvailable && unknown.length === 0 && paidDirectCosts !== null && expenses.every((expense, index) => (paid[index] ?? 0) <= Number(expense.amount) + 0.005)
      ? money(expenses.reduce((sum, expense, index) => sum + Number(expense.amount) - (paid[index] ?? 0), 0)) : null
    if (!costsAvailable) issues.push('Event expense records could not be verified.')
    if (unknown.length) issues.push(`${unknown.length} linked expense${unknown.length === 1 ? ' has' : 's have'} an unknown amount.`)
    if (costsAvailable && (invalidPaid || unpaidCommitments === null && unknown.length === 0)) issues.push('Expense payments need review.')
    return {
      booking, invoiceId: obligation === null ? null : master?.invoice.id || null,
      obligation, collections, knownDirectCosts, paidDirectCosts, unpaidCommitments,
      projectedContribution: obligation !== null && knownDirectCosts !== null && unknown.length === 0 ? money(obligation - knownDirectCosts) : null,
      cashContribution: collections !== null && paidDirectCosts !== null ? money(collections - paidDirectCosts) : null,
      unknownExpenseCount: unknown.length, expenses, issues,
    }
  })
}
