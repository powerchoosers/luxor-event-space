import { isLuxorTestAvailabilityBooking } from './luxorAvailability'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from './luxorInquiryTypes'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorTestLeadPolicy'
import { installmentDisplayState, invoiceEventObligation, refundableSecurityAmount } from './luxorPaymentDashboardModel'

export type LuxorFinanceExpense = {
  booking_id: string | null
  metadata?: Record<string, unknown> | null
  status?: string | null
}

export type LuxorInvoiceFinancialSummary = {
  acceptedInvoices: LuxorInvoice[]
  acceptedInvoiceRows: Array<{ invoice: LuxorInvoice; eventObligation: number; received: number; outstanding: number; overdue: number }>
  eventPaymentRows: Array<{ amount: number; paid_at: string | null }>
  unallocatedPaymentRows: Array<{ amount: number; paid_at: string | null; reason: string }>
  knownPaidCashTotal: number
  refundRecordCount: number
  refundRecordAmount: number
  refundReconciliationRequired: boolean
  eventPaymentsReceived: number
  securityDepositsHeld: number
  unallocatedPayments: number
  outstandingEventReceivable: number
  overdueEventReceivable: number
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function paymentIsSecurityDeposit(payment: LuxorPayment, invoice?: LuxorInvoice) {
  if (invoice?.invoice_kind === 'security_deposit') return true
  const kind = String(payment.metadata?.payment_kind || '').toLowerCase()
  return kind === 'security_deposit' || kind === 'security_deposit_refund'
}

function recordedPaidAmount(payment: LuxorPayment) {
  const amount = Number(payment.amount || 0)
  if (!Number.isFinite(amount)) return 0
  if (payment.status === 'paid') return amount > 0 ? amount : 0
  return 0
}

/** Propagate explicit test lineage to descendants, bounded by the loaded invoice set. */
function luxorTestInvoiceLineage(invoices: LuxorInvoice[], inquiryIds: ReadonlySet<string>, bookingIds: ReadonlySet<string>, initialIds: ReadonlySet<string> = new Set()) {
  const excluded = new Set([...initialIds].map((id) => id.toLowerCase()))
  for (const invoice of invoices) {
    const proposalContext = invoice.proposal_context as Record<string, unknown> | null | undefined
    if ((invoice.inquiry_id && inquiryIds.has(invoice.inquiry_id.toLowerCase()))
      || (invoice.inquiry_id && invoice.inquiry_id.toLowerCase() === LUXOR_PERMANENT_TEST_LEAD_ID.toLowerCase())
      || (invoice.booking_id && bookingIds.has(invoice.booking_id.toLowerCase()))
      || proposalContext?.is_test_record === true) excluded.add(invoice.id.toLowerCase())
  }
  for (let depth = 0; depth < invoices.length; depth += 1) {
    let added = false
    for (const invoice of invoices) {
      if (invoice.parent_invoice_id && excluded.has(invoice.parent_invoice_id.toLowerCase()) && !excluded.has(invoice.id.toLowerCase())) {
        excluded.add(invoice.id.toLowerCase())
        added = true
      }
    }
    if (!added) break
  }
  return excluded
}

/**
 * Derive cash and open event balances from explicit payment rows and accepted
 * proposal obligations. Invoice status and invoice.total never prove cash.
 * Child invoices describe collection installments under the accepted master;
 * they do not create additional obligations.
 */
export function getLuxorInvoiceFinancialSummary(invoices: LuxorInvoice[], payments: LuxorPayment[], testInquiryIds: ReadonlySet<string> = new Set(), testBookingIds: ReadonlySet<string> = new Set(), installments: LuxorPaymentInstallment[] = [], now = new Date(), excludedTestInvoiceIds: ReadonlySet<string> = new Set(), refunds: LuxorPaymentRefundView[] = []): LuxorInvoiceFinancialSummary {
  const testInquiries = new Set([...testInquiryIds].map((id) => id.toLowerCase()))
  const testBookings = new Set([...testBookingIds].map((id) => id.toLowerCase()))
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const testInvoiceIds = luxorTestInvoiceLineage(invoices, testInquiries, testBookings, excludedTestInvoiceIds)
  const supersededAcceptedIds = new Set(invoices.filter((invoice) =>
    (invoice.invoice_kind ?? 'event') === 'event'
      && Boolean(invoice.proposal_accepted_at)
      && invoice.status !== 'draft'
      && invoice.status !== 'cancelled'
      && invoice.offer_status !== 'withdrawn'
      && typeof invoice.supersedes_invoice_id === 'string',
  ).map((invoice) => invoice.supersedes_invoice_id as string))
  const acceptedInvoices = invoices.filter((invoice) =>
    (invoice.invoice_kind ?? 'event') === 'event'
    && !invoice.parent_invoice_id
    && Boolean(invoice.proposal_accepted_at)
    && invoice.status !== 'draft'
    && invoice.status !== 'cancelled'
    && invoice.offer_status !== 'withdrawn'
    && !testInvoiceIds.has(invoice.id.toLowerCase())
    && !supersededAcceptedIds.has(invoice.id),
  )
  const acceptedIds = new Set(acceptedInvoices.map((invoice) => invoice.id))
  const bookingMasterCandidates = new Map<string, Set<string>>()
  for (const invoice of acceptedInvoices) if (invoice.booking_id) {
    bookingMasterCandidates.set(invoice.booking_id, new Set([...(bookingMasterCandidates.get(invoice.booking_id) || []), invoice.id]))
  }
  const bookingMasterIds = new Map([...bookingMasterCandidates].filter(([, ids]) => ids.size === 1).map(([bookingId, ids]) => [bookingId, [...ids][0]]))
  const currentMastersByPredecessor = new Map<string, Set<string>>()
  for (const invoice of acceptedInvoices) {
    let predecessorId = invoice.supersedes_invoice_id || null
    const visited = new Set<string>([invoice.id])
    let validChain = true
    while (predecessorId) {
      if (visited.has(predecessorId)) { validChain = false; break }
      visited.add(predecessorId)
      currentMastersByPredecessor.set(predecessorId, new Set([...(currentMastersByPredecessor.get(predecessorId) || []), invoice.id]))
      predecessorId = byId.get(predecessorId)?.supersedes_invoice_id || null
    }
    if (!validChain) for (const id of visited) currentMastersByPredecessor.delete(id)
  }
  const uniqueCurrentMasterByPredecessor = new Map([...currentMastersByPredecessor].filter(([, masters]) => masters.size === 1).map(([id, masters]) => [id, [...masters][0]]))

  const masterFor = (invoiceId: string | null, bookingId: string | null) => {
    let current = invoiceId ? byId.get(invoiceId) : undefined
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (acceptedIds.has(current.id)) return current
      visited.add(current.id)
      current = current.parent_invoice_id ? byId.get(current.parent_invoice_id) : undefined
    }
    const supersedingMasterIds = new Set([...visited].map((id) => uniqueCurrentMasterByPredecessor.get(id)).filter((id): id is string => Boolean(id)))
    if (supersedingMasterIds.size === 1) {
      const supersedingMasterId = [...supersedingMasterIds][0]
      return byId.get(supersedingMasterId)
    }
    if (supersedingMasterIds.size > 1) return undefined
    const bookingMasterId = bookingId ? bookingMasterIds.get(bookingId) : undefined
    return bookingMasterId ? byId.get(bookingMasterId) : undefined
  }

  const eventReceiptsByMaster = new Map<string, number>()
  let knownPaidCashTotal = 0
  let refundRecordCount = 0
  let refundRecordAmount = 0
  let refundReconciliationRequired = false
  let eventPaymentsReceived = 0
  let securityDepositsHeld = 0
  let unallocatedPayments = 0
  const eventPaymentRows: Array<{ amount: number; paid_at: string | null }> = []
  const unallocatedPaymentRows: Array<{ amount: number; paid_at: string | null; reason: string }> = []
  for (const payment of payments) {
    if (payment.metadata?.is_test_record === true) continue
    if ((payment.inquiry_id && testInquiries.has(payment.inquiry_id.toLowerCase()))
      || (payment.booking_id && testBookings.has(payment.booking_id.toLowerCase()))
      || (payment.invoice_id && testInvoiceIds.has(payment.invoice_id.toLowerCase()))) continue
    if (payment.status === 'refunded') {
      const rawAmount = Number(payment.amount || 0)
      if (Number.isFinite(rawAmount)) {
        refundRecordCount += 1
        refundRecordAmount = money(refundRecordAmount + Math.abs(rawAmount))
        refundReconciliationRequired = true
      }
      continue
    }
    const amount = recordedPaidAmount(payment)
    if (!amount) continue
    knownPaidCashTotal = money(knownPaidCashTotal + amount)
    const invoice = payment.invoice_id ? byId.get(payment.invoice_id) : undefined
    const holdUnallocated = (reason: string) => {
      unallocatedPayments = money(unallocatedPayments + amount)
      unallocatedPaymentRows.push({ amount: money(amount), paid_at: payment.paid_at, reason })
    }
    if (payment.metadata?.deposit_receipt_review === true) {
      holdUnallocated('Payment is flagged for receipt review')
      continue
    }
    if (paymentIsSecurityDeposit(payment, invoice)) {
      securityDepositsHeld = money(securityDepositsHeld + amount)
      continue
    }
    const master = masterFor(payment.invoice_id, payment.booking_id)
    if (!master) {
      holdUnallocated('No accepted event proposal is linked to this payment')
      continue
    }

    // An initial-payment child can collect both event services and the
    // refundable deposit. Split only when the saved child invoice explicitly
    // records that deposit line; a master proposal's disclosure is not a cash
    // allocation.
    const childSecurity = invoice && invoice.invoice_kind !== 'security_deposit' ? refundableSecurityAmount(invoice) : 0
    const explicitSecurityAmount = Number(payment.metadata?.refundable_security_deposit ?? payment.metadata?.security_deposit_amount)
    const explicitEventAmount = Number(payment.metadata?.initial_booking_payment)
    const transactionEventAllocation = Number(payment.metadata?.allocated_event_amount)
    let eventPortion = amount
    if (childSecurity > 0) {
      const savedSplitIsForThisTransaction = Number.isFinite(explicitSecurityAmount)
        && Number.isFinite(explicitEventAmount)
        && Math.abs(Math.abs(amount) - (explicitSecurityAmount + explicitEventAmount)) < 0.005
      if (Number.isFinite(transactionEventAllocation)) {
        eventPortion = Math.sign(amount) * Math.min(Math.abs(amount), Math.max(0, transactionEventAllocation))
      } else if (savedSplitIsForThisTransaction) {
        const sign = amount < 0 ? -1 : 1
        eventPortion = sign * Math.min(Math.abs(amount), Math.max(0, explicitEventAmount))
      } else {
        // A transaction against a mixed invoice has no reliable split unless
        // the transaction itself saved its event/deposit allocation.
        holdUnallocated('Mixed event and security-deposit payment has no saved allocation')
        continue
      }
    }
    const depositPortion = amount - eventPortion
    eventPaymentsReceived = money(eventPaymentsReceived + eventPortion)
    eventPaymentRows.push({ amount: money(eventPortion), paid_at: payment.paid_at })
    if (depositPortion) securityDepositsHeld = money(securityDepositsHeld + depositPortion)
    eventReceiptsByMaster.set(master.id, money((eventReceiptsByMaster.get(master.id) || 0) + eventPortion))
  }

  const acceptedAmounts = acceptedInvoices.map((invoice) => {
    const eventObligation = invoiceEventObligation(invoice)
    const received = eventReceiptsByMaster.get(invoice.id) || 0
    return { invoice, eventObligation, received, outstanding: money(Math.max(0, eventObligation - received)) }
  })
  const outstandingEventReceivable = money(acceptedAmounts.reduce((sum, row) => sum + Math.max(0, row.eventObligation - row.received), 0))
  const overdueByMaster = new Map<string, number>()
  const overdueEventReceivable = money(installments.reduce((sum, installment) => {
    if (installment.status === 'void' || installment.metadata?.payment_bucket === 'security_deposit') return sum
    const masterId = bookingMasterIds.get(installment.booking_id)
    if (!masterId) return sum
    const state = installmentDisplayState(installment, payments, now)
    const remainder = state.isOverdue ? money(state.amountDue - state.credited) : 0
    if (remainder > 0) overdueByMaster.set(masterId, money((overdueByMaster.get(masterId) || 0) + remainder))
    return sum + remainder
  }, 0))
  const acceptedInvoiceRows = acceptedAmounts.map((row) => ({
    ...row,
    overdue: overdueByMaster.get(row.invoice.id) || 0,
  }))

  for (const refund of refunds) {
    if (refund.metadata?.is_test_record === true) continue
    if ((refund.inquiry_id && testInquiries.has(refund.inquiry_id.toLowerCase()))
      || (refund.booking_id && testBookings.has(refund.booking_id.toLowerCase()))
      || (refund.invoice_id && testInvoiceIds.has(refund.invoice_id.toLowerCase()))) continue
    refundRecordCount += 1
    if (refund.status === 'pending' || refund.status === 'uncertain') refundReconciliationRequired = true
    if (refund.status !== 'succeeded') continue
    const amount = Number(refund.amount || 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    refundRecordAmount = money(refundRecordAmount + amount)
    knownPaidCashTotal = money(knownPaidCashTotal - amount)
    if (refund.refund_kind === 'security_deposit') securityDepositsHeld = money(Math.max(0, securityDepositsHeld - amount))
    else {
      eventPaymentsReceived = money(eventPaymentsReceived - amount)
      eventPaymentRows.push({ amount: -money(amount), paid_at: refund.completed_at })
    }
  }

  return {
    acceptedInvoices,
    acceptedInvoiceRows,
    eventPaymentRows,
    unallocatedPaymentRows,
    knownPaidCashTotal,
    refundRecordCount,
    refundRecordAmount,
    refundReconciliationRequired,
    eventPaymentsReceived,
    securityDepositsHeld,
    unallocatedPayments,
    outstandingEventReceivable,
    overdueEventReceivable,
  }
}

/** Exclude only explicitly verified test records from finance dashboard metrics. */
export function getLuxorBusinessFinanceRows<TBooking extends LuxorBooking & { id: string }, TExpense extends LuxorFinanceExpense>(input: {
  invoices: LuxorInvoice[]
  bookings: TBooking[]
  expenses: TExpense[]
  testInquiryIds: ReadonlySet<string>
  testBookingIds: ReadonlySet<string>
}) {
  const inquiryIds = new Set([...input.testInquiryIds].map((id) => id.toLowerCase()))
  const bookingIds = new Set([...input.testBookingIds].map((id) => id.toLowerCase()))
  for (const booking of input.bookings) {
    if (isLuxorTestAvailabilityBooking(booking) || Boolean(booking.inquiry_id && inquiryIds.has(booking.inquiry_id.toLowerCase()))) {
      bookingIds.add(booking.id.toLowerCase())
    }
  }

  const bookings = input.bookings.filter((booking) => !bookingIds.has(booking.id.toLowerCase()))
  const testInvoiceIds = luxorTestInvoiceLineage(input.invoices, inquiryIds, bookingIds)
  const invoices = input.invoices.filter((invoice) => !testInvoiceIds.has(invoice.id.toLowerCase()))
  const expenses = input.expenses.filter((expense) => !(expense.booking_id && bookingIds.has(expense.booking_id.toLowerCase()))
    && expense.metadata?.is_test_record !== true)

  return { invoices, bookings, expenses, testInquiryIds: inquiryIds, testBookingIds: bookingIds, testInvoiceIds }
}

/** Exclude only server-classified or explicitly flagged test inquiries. */
export function getLuxorBusinessInquiries(inquiries: LuxorInquiry[], testInquiryIds: ReadonlySet<string>) {
  const excludedIds = new Set([...testInquiryIds].map((id) => id.toLowerCase()))
  excludedIds.add(LUXOR_PERMANENT_TEST_LEAD_ID.toLowerCase())
  for (const inquiry of inquiries) {
    if (inquiry.is_test === true || inquiry.metadata?.is_test_record === true) excludedIds.add(inquiry.id.toLowerCase())
  }
  return inquiries.filter((inquiry) => !excludedIds.has(inquiry.id.toLowerCase()))
}

/** Incurred and paid costs count as expenses; planned and cancelled rows do not. */
export function getLuxorRecordedFinanceExpenses<TExpense extends LuxorFinanceExpense>(expenses: TExpense[]) {
  return expenses.filter((expense) => expense.status === 'incurred' || expense.status === 'paid')
}
