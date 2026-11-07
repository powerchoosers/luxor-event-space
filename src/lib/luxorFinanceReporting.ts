import { isLuxorTestAvailabilityBooking } from './luxorAvailability'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment, LuxorPaymentRefundView } from './luxorInquiryTypes'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from './luxorTestLeadPolicy'
import { chicagoCalendarDate, installmentDisplayState, installmentPaidAmount, invoiceEventObligation, isLuxorBookingReceivableEligible, refundableSecurityAmount } from './luxorPaymentDashboardModel'

export type LuxorFinanceExpense = {
  booking_id: string | null
  metadata?: Record<string, unknown> | null
  status?: string | null
}

export type LuxorInvoiceFinancialSummary = {
  acceptedInvoices: LuxorInvoice[]
  acceptedInvoiceRows: Array<{ invoice: LuxorInvoice; eventObligation: number; received: number; outstanding: number; overdue: number }>
  eventPaymentRows: Array<{ id: string; category: string | null; amount: number; paid_at: string | null; received_date: string | null }>
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

type LuxorPaymentDateFields = Pick<LuxorPayment, 'received_date' | 'paid_at'>

/** Return the payment's saved Luxor calendar date, preferring an audited received_date. */
export function getLuxorPaymentCalendarDateKey(payment: LuxorPaymentDateFields): string {
  const value = payment.received_date || payment.paid_at || ''
  if (!value) return ''

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : ''
  }

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Format a date key without shifting it across time zones. */
export function formatLuxorPaymentCalendarDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return 'N/A'
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'N/A'
  return date.toLocaleDateString(undefined, { timeZone: 'UTC' })
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
 * Derive cash and receivables from explicit payment rows and signed, confirmed
 * event obligations. Invoice status and invoice.total never prove cash.
 * Child invoices describe collection installments under the accepted master;
 * they do not create additional obligations.
 */
export function getLuxorInvoiceFinancialSummary(invoices: LuxorInvoice[], payments: LuxorPayment[], testInquiryIds: ReadonlySet<string> = new Set(), testBookingIds: ReadonlySet<string> = new Set(), installments: LuxorPaymentInstallment[] = [], now = new Date(), excludedTestInvoiceIds: ReadonlySet<string> = new Set(), refunds: LuxorPaymentRefundView[] = [], bookings: LuxorBooking[] = []): LuxorInvoiceFinancialSummary {
  const testInquiries = new Set([...testInquiryIds].map((id) => id.toLowerCase()))
  const testBookings = new Set([...testBookingIds].map((id) => id.toLowerCase()))
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]))
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
  const eligibleReceivableInvoices = acceptedInvoices.filter((invoice) => {
    const booking = invoice.booking_id ? bookingById.get(invoice.booking_id) : undefined
    return Boolean(invoice.booking_id && bookingMasterIds.get(invoice.booking_id) === invoice.id && isLuxorBookingReceivableEligible(booking))
  })
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
  const eventPaymentRows: LuxorInvoiceFinancialSummary['eventPaymentRows'] = []
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
    const paymentKind = String(payment.metadata?.payment_kind || '').toLowerCase()
    const savedAllocations = Array.isArray(payment.metadata?.installment_allocations) ? payment.metadata.installment_allocations : []
    const savedAllocationTotal = savedAllocations.reduce((sum: number, row: unknown) => {
      if (!row || typeof row !== 'object') return sum
      const value = Number((row as Record<string, unknown>).amount)
      return Number.isFinite(value) && value > 0 ? sum + value : sum
    }, 0)
    const category = (paymentKind === 'deposit' && (!invoice?.invoice_kind || invoice.invoice_kind === 'deposit')) || (!paymentKind && invoice?.invoice_kind === 'deposit') ? 'Booking Deposits'
      : paymentKind === 'full' ? 'Full Payments'
      : savedAllocations.length && Math.abs(money(savedAllocationTotal) - eventPortion) < 0.005 ? 'Installment Payments'
      : paymentKind === 'additional_services' ? 'Additional Services'
      : paymentKind === 'other_revenue' ? 'Other Revenue' : null
    eventPaymentRows.push({ id: payment.id, category, amount: money(eventPortion), paid_at: payment.paid_at, received_date: payment.received_date || null })
    if (depositPortion) securityDepositsHeld = money(securityDepositsHeld + depositPortion)
    eventReceiptsByMaster.set(master.id, money((eventReceiptsByMaster.get(master.id) || 0) + eventPortion))
  }

  const acceptedAmounts = eligibleReceivableInvoices.map((invoice) => {
    const eventObligation = invoiceEventObligation(invoice)
    const received = eventReceiptsByMaster.get(invoice.id) || 0
    return { invoice, eventObligation, received, outstanding: money(Math.max(0, eventObligation - received)) }
  })
  const outstandingEventReceivable = money(acceptedAmounts.reduce((sum, row) => sum + Math.max(0, row.eventObligation - row.received), 0))
  const overdueByMaster = new Map<string, number>()
  const receivableBookingMasterIds = new Map<string, string>(eligibleReceivableInvoices.flatMap((invoice) => invoice.booking_id ? [[invoice.booking_id, invoice.id] as [string, string]] : []))
  const seenInstallments = new Set<string>()
  for (const installment of installments) {
    if (seenInstallments.has(installment.id)) continue
    seenInstallments.add(installment.id)
    if (installment.status === 'void' || installment.metadata?.payment_bucket === 'security_deposit') continue
    const masterId = receivableBookingMasterIds.get(installment.booking_id)
    if (!masterId || (installment.invoice_id && installment.invoice_id !== masterId)) continue
    const state = installmentDisplayState(installment, payments, now)
    const remainder = state.isOverdue ? money(state.amountDue - state.credited) : 0
    if (remainder > 0) overdueByMaster.set(masterId, money((overdueByMaster.get(masterId) || 0) + remainder))
  }
  const overdueEventReceivable = money(acceptedAmounts.reduce((sum, row) => sum + Math.min(row.outstanding, overdueByMaster.get(row.invoice.id) || 0), 0))
  const acceptedInvoiceRows = acceptedAmounts.map((row) => ({
    ...row,
    overdue: money(Math.min(row.outstanding, overdueByMaster.get(row.invoice.id) || 0)),
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
    if (!Number.isFinite(amount) || amount <= 0) { refundReconciliationRequired = true; continue }
    refundRecordAmount = money(refundRecordAmount + amount)
    knownPaidCashTotal = money(knownPaidCashTotal - amount)
    const refundKind = String(refund.refund_kind)
    if (refundKind === 'security_deposit') securityDepositsHeld = money(Math.max(0, securityDepositsHeld - amount))
    else if (refundKind === 'event_revenue') {
      eventPaymentsReceived = money(eventPaymentsReceived - amount)
      eventPaymentRows.push({ id: refund.id, category: null, amount: -money(amount), paid_at: refund.completed_at, received_date: null })
    } else refundReconciliationRequired = true
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

/** Only paid costs count against cash receipts; incurred, planned, and cancelled rows are excluded. */
export function getLuxorPaidFinanceExpenses<TExpense extends LuxorFinanceExpense>(expenses: TExpense[]) {
  return expenses.filter((expense) => expense.status === 'paid')
}

/**
 * A paid status establishes an all-time ledger total, but incurred_on is not
 * evidence of when money was paid. Do not use this result for a date range.
 * Call with the already test-filtered business expense rows.
 */
export function getLuxorPaidExpenseBreakdown(expenses: Array<LuxorFinanceExpense & { id: string; amount: number; category: string | null; incurred_on?: string | null; updated_at?: string | null; created_at?: string | null }>) {
  const paid = getLuxorPaidFinanceExpenses(expenses)
  const ids = new Set<string>()
  const categories = new Map<string, number>()
  const byMonth: Record<string, number> = {}
  const monthCategoryMap = new Map<string, Map<string, number>>()
  for (const expense of paid) {
    const id = expense.id?.trim()
    const amount = Number(expense.amount)
    if (!id || ids.has(id) || expense.amount == null || String(expense.amount).trim() === '' || !Number.isFinite(amount) || amount < 0) {
      return {
        available: false as const,
        reason: 'Paid expense records need reconciliation.',
        total: null,
        categories: [],
        byMonth: {} as Record<string, number>,
        categoriesByMonth: {} as Record<string, Array<{ category: string; amount: number }>>,
      }
    }
    ids.add(id)
    const category = expense.category?.trim() || 'Uncategorized'
    categories.set(category, money((categories.get(category) || 0) + amount))
    const dateKey = getLuxorPaymentCalendarDateKey({
      received_date: expense.incurred_on || null,
      paid_at: expense.updated_at || expense.created_at || null,
    })
    const month = dateKey.slice(0, 7)
    if (month) {
      byMonth[month] = money((byMonth[month] || 0) + amount)
      const catMap = monthCategoryMap.get(month) || new Map<string, number>()
      catMap.set(category, money((catMap.get(category) || 0) + amount))
      monthCategoryMap.set(month, catMap)
    }
  }
  const rows = [...categories].map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))
  const categoriesByMonth: Record<string, Array<{ category: string; amount: number }>> = {}
  for (const [month, catMap] of monthCategoryMap.entries()) {
    categoriesByMonth[month] = [...catMap].map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))
  }
  return {
    available: true as const,
    reason: null,
    total: money(rows.reduce((sum, row) => sum + row.amount, 0)),
    categories: rows,
    byMonth,
    categoriesByMonth,
  }
}

export type LuxorFinanceAllocationRow = { payment_id: string; installment_id: string; amount: number }

export type LuxorFinanceOverviewInput = {
  invoices: LuxorInvoice[]
  bookings: LuxorBooking[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  refunds: LuxorPaymentRefundView[]
  testInquiryIds: ReadonlySet<string>
  testBookingIds: ReadonlySet<string>
  testInvoiceIds: ReadonlySet<string>
  allocations: LuxorFinanceAllocationRow[] | null
  now?: Date
}

export type LuxorFinanceScheduleRow = {
  installment: LuxorPaymentInstallment
  bookingId: string
  invoiceId: string
  amountDue: number
  credited: number
  remaining: number
  dueDate: string | null
  status: string
  isPaid: boolean
  isPartial: boolean
  isOverdue: boolean
  overdueDays: number
  scheduleReconciled: boolean
  reviewReason?: string | null
}

/**
 * Check inputs before using the existing finance helpers for an overview.
 * The allocation table and payment metadata are two representations of the
 * same allocations: compare them, never add them together. An unavailable
 * table is different from an empty table. Issues block dependent forecasts;
 * this function does not change the ledger or assign unallocated payments.
 */
export function inspectLuxorFinanceOverviewSources(input: {
  invoices: LuxorInvoice[]
  payments: LuxorPayment[]
  installments: LuxorPaymentInstallment[]
  allocations: LuxorFinanceAllocationRow[] | null
}) {
  const issues: string[] = []
  function unique<T extends { id: string }>(rows: T[], label: string): T[] {
    const byId = new Map<string, T>()
    for (const row of rows) {
      if (!row.id || byId.has(row.id)) {
        issues.push(`Duplicate or missing ${label} identity`)
        continue
      }
      byId.set(row.id, row)
    }
    return [...byId.values()]
  }
  const invoices = unique(input.invoices, 'invoice')
  const payments = unique(input.payments, 'payment')
  const installments = unique(input.installments, 'installment')
  const providerReferences = new Set<string>()
  for (const payment of payments) {
    if (!payment.processor || !payment.processor_reference) continue
    const key = JSON.stringify([payment.processor, payment.processor_reference])
    if (providerReferences.has(key)) issues.push('Duplicate payment provider reference')
    providerReferences.add(key)
  }
  if (installments.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0)) issues.push('Invalid payment schedule amount')
  const superseded = new Set(invoices.filter((invoice) => invoice.proposal_accepted_at && invoice.status !== 'draft' && invoice.status !== 'cancelled' && invoice.offer_status !== 'withdrawn').map((invoice) => invoice.supersedes_invoice_id).filter(Boolean))
  const mastersByBooking = new Map<string, number>()
  const currentMasters: LuxorInvoice[] = []
  for (const invoice of invoices) {
    if (!invoice.booking_id || invoice.parent_invoice_id || (invoice.invoice_kind ?? 'event') !== 'event' || !invoice.proposal_accepted_at || invoice.status === 'draft' || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn' || superseded.has(invoice.id)) continue
    mastersByBooking.set(invoice.booking_id, (mastersByBooking.get(invoice.booking_id) || 0) + 1)
    currentMasters.push(invoice)
  }
  if ([...mastersByBooking.values()].some((count) => count > 1)) issues.push('Multiple accepted master invoices for a booking')
  for (const master of currentMasters) {
    if (!master.booking_id || mastersByBooking.get(master.booking_id) !== 1) continue
    const obligation = invoiceEventObligation(master)
    if (!Number.isFinite(obligation) || obligation < 0) issues.push('Invalid accepted contract amount')
    const scheduled = installments.filter((row) => row.booking_id === master.booking_id && row.invoice_id === master.id && row.status !== 'void' && row.metadata?.payment_bucket !== 'security_deposit')
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
    if (money(scheduled) > money(obligation)) issues.push('Payment schedule exceeds its event obligation')
  }

  const metadata = new Map<string, number>()
  const installmentIds = new Set(installments.map((row) => row.id))
  for (const payment of payments) {
    if (payment.status !== 'paid') continue
    const rows = payment.metadata?.installment_allocations
    if (!Array.isArray(rows)) continue
    let totalAllocated = 0
    for (const value of rows) {
      if (!value || typeof value !== 'object') { issues.push('Invalid payment allocation metadata'); continue }
      const row = value as Record<string, unknown>
      const amount = Number(row.amount)
      if (typeof row.installment_id !== 'string' || !installmentIds.has(row.installment_id) || !Number.isFinite(amount) || amount <= 0) { issues.push('Invalid payment allocation metadata'); continue }
      totalAllocated += amount
      const key = JSON.stringify([payment.id, row.installment_id])
      const installment = installments.find((item) => item.id === row.installment_id)
      if (payment.booking_id && installment && payment.booking_id !== installment.booking_id) issues.push('Payment allocation points to a different booking')
      if (metadata.has(key)) issues.push('Duplicate payment allocation metadata')
      metadata.set(key, money((metadata.get(key) || 0) + amount))
    }
    if (money(totalAllocated) > Number(payment.amount) + 0.005) issues.push('Allocations exceed a payment')
  }
  if (input.allocations === null) issues.push('Allocation table unavailable')
  else {
    const table = new Map<string, number>()
    const paymentIds = new Set(payments.filter((row) => row.status === 'paid').map((row) => row.id))
    for (const row of input.allocations) {
      const amount = Number(row.amount)
      if (!paymentIds.has(row.payment_id) || !installmentIds.has(row.installment_id) || !Number.isFinite(amount) || amount <= 0) { issues.push('Invalid allocation table row'); continue }
      const key = JSON.stringify([row.payment_id, row.installment_id])
      if (table.has(key)) issues.push('Duplicate allocation table row')
      table.set(key, money((table.get(key) || 0) + amount))
    }
    // Allocation verification must come from persisted metadata and allocation rows.
    // A same-booking/same-amount receipt does not prove which installment it paid.
    if ([...new Set([...metadata.keys(), ...table.keys()])].some((key) => (metadata.get(key) || 0) !== (table.get(key) || 0))) issues.push('Payment allocation sources disagree')
  }
  if (installments.some((row) => row.status === 'paid' && money([...metadata].filter(([key]) => JSON.parse(key)[1] === row.id).reduce((sum, [, amount]) => sum + amount, 0)) + 0.005 < Number(row.amount))) issues.push('Paid installment lacks a complete recorded payment allocation')
  for (const row of installments) {
    if (row.status === 'void') continue
    const saved = money([...metadata].filter(([key]) => JSON.parse(key)[1] === row.id).reduce((sum, [, amount]) => sum + amount, 0))
    if (saved > Number(row.amount) + 0.005) issues.push('Allocations exceed an installment')
    if (installmentPaidAmount(row, payments) > saved + 0.005) issues.push('A legacy installment credit needs reconciliation')
  }
  return { invoices, payments, installments, issues: [...new Set(issues)] }
}

/** Build overview figures from the existing ledger summary only after source checks. */
export function getLuxorFinanceOverview(input: LuxorFinanceOverviewInput) {
  const now = input.now || new Date()
  const excluded = (id: string | null | undefined, ids: ReadonlySet<string>) => Boolean(id && ids.has(id.toLowerCase()))
  const bookings = input.bookings.filter((row) => !excluded(row.id, input.testBookingIds))
  const invoices = input.invoices.filter((row) => !excluded(row.id, input.testInvoiceIds) && !excluded(row.booking_id, input.testBookingIds) && !excluded(row.inquiry_id, input.testInquiryIds))
  const payments = input.payments.filter((row) => row.metadata?.is_test_record !== true && !excluded(row.booking_id, input.testBookingIds) && !excluded(row.inquiry_id, input.testInquiryIds) && !excluded(row.invoice_id, input.testInvoiceIds))
  const installments = input.installments.filter((row) => !excluded(row.booking_id, input.testBookingIds) && !excluded(row.inquiry_id, input.testInquiryIds) && !excluded(row.invoice_id, input.testInvoiceIds))
  const businessPaymentIds = new Set(payments.map((row) => row.id))
  const testPaymentIds = new Set(input.payments.filter((row) => !businessPaymentIds.has(row.id) && (row.metadata?.is_test_record === true || excluded(row.booking_id, input.testBookingIds) || excluded(row.inquiry_id, input.testInquiryIds) || excluded(row.invoice_id, input.testInvoiceIds))).map((row) => row.id))
  const businessInstallmentIds = new Set(installments.map((row) => row.id))
  const testInstallmentIds = new Set(input.installments.filter((row) => !businessInstallmentIds.has(row.id) && (excluded(row.booking_id, input.testBookingIds) || excluded(row.inquiry_id, input.testInquiryIds) || excluded(row.invoice_id, input.testInvoiceIds))).map((row) => row.id))
  const source = inspectLuxorFinanceOverviewSources({ invoices, payments, installments, allocations: input.allocations && input.allocations.filter((row) => !(testPaymentIds.has(row.payment_id) && !businessInstallmentIds.has(row.installment_id)) && !(testInstallmentIds.has(row.installment_id) && !businessPaymentIds.has(row.payment_id))) })
  const invoiceById = new Map(source.invoices.map((row) => [row.id, row]))
  const bookingById = new Map(bookings.map((row) => [row.id, row]))
  const conflictingPaymentLinks = source.payments.some((payment) => {
    let invoice = payment.invoice_id ? invoiceById.get(payment.invoice_id) : undefined
    const linkedBookings = new Set<string>(payment.booking_id ? [payment.booking_id] : [])
    const visited = new Set<string>()
    while (invoice && !visited.has(invoice.id)) {
      visited.add(invoice.id)
      if (invoice.booking_id) linkedBookings.add(invoice.booking_id)
      invoice = invoice.parent_invoice_id ? invoiceById.get(invoice.parent_invoice_id) : undefined
    }
    return linkedBookings.size > 1
  })
  const seenRefundIds = new Set<string>()
  let duplicateRefund = false
  const refunds = input.refunds.filter((refund) => {
    if (refund.metadata?.is_test_record === true || excluded(refund.booking_id, input.testBookingIds) || excluded(refund.inquiry_id, input.testInquiryIds) || excluded(refund.invoice_id, input.testInvoiceIds)) return false
    if (!refund.id || seenRefundIds.has(refund.id)) { duplicateRefund = true; return false }
    seenRefundIds.add(refund.id)
    return true
  })
  const summary = getLuxorInvoiceFinancialSummary(source.invoices, source.payments, input.testInquiryIds, input.testBookingIds, source.installments, now, input.testInvoiceIds, refunds, bookings)
  const actualIssues = source.issues.filter((issue) => issue.includes('identity') || issue.includes('Multiple accepted master') || issue.includes('Duplicate payment provider reference') || issue.includes('Invalid accepted contract amount'))
  if (conflictingPaymentLinks) actualIssues.push('Payment and invoice booking links conflict')
  if (source.payments.some((row) => row.status === 'paid' && row.invoice_id && !invoiceById.has(row.invoice_id))) actualIssues.push('A payment references an unavailable invoice')
  if (duplicateRefund) actualIssues.push('Duplicate or missing refund identity')
  if (source.payments.some((row) => row.status === 'paid' && (!Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0))) actualIssues.push('A paid transaction has an invalid amount')
  if (source.payments.some((row) => {
    if (row.status !== 'paid') return false
    const invoice = row.invoice_id ? invoiceById.get(row.invoice_id) : undefined
    const booking = bookingById.get(row.booking_id || invoice?.booking_id || '')
    return !booking || booking.contract_status !== 'signed' || !booking.contract_signed_at || invoice?.status === 'draft'
  })) actualIssues.push('A payment needs a verified signed booking and agreement')
  if (summary.unallocatedPayments > 0) actualIssues.push('Some payments need classification')
  if (source.payments.some((row) => row.status === 'refunded')) actualIssues.push('A legacy refund needs reconciliation')
  for (const refund of refunds) {
    const refundKind = String(refund.refund_kind)
    if (refund.status !== 'succeeded' || refundKind === 'security_deposit') continue
    const invoice = refund.invoice_id ? invoiceById.get(refund.invoice_id) : undefined
    const accepted = new Set(summary.acceptedInvoices.map((item) => item.id))
    let current = invoice
    const visited = new Set<string>()
    while (current && !accepted.has(current.id) && current.parent_invoice_id && !visited.has(current.id)) { visited.add(current.id); current = invoiceById.get(current.parent_invoice_id) }
    const booking = refund.booking_id ? bookingById.get(refund.booking_id) : undefined
    const isEventRevenueRefund = refundKind === 'event_revenue'
    if (!isEventRevenueRefund || !getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: refund.completed_at }) || !invoice || invoice.booking_id !== refund.booking_id || !current || !accepted.has(current.id) || !booking || booking.contract_status !== 'signed' || !booking.contract_signed_at || !Number.isFinite(Number(refund.amount)) || Number(refund.amount) <= 0) actualIssues.push('An event refund needs classification or a completion date')
  }
  if (summary.eventPaymentRows.some((row) => !getLuxorPaymentCalendarDateKey(row))) actualIssues.push('Some payment dates are missing')
  const actualByMonth: Record<string, number> = {}
  const categoryByMonth: Record<string, Record<string, number>> = {}
  for (const row of summary.eventPaymentRows) {
    const month = getLuxorPaymentCalendarDateKey(row).slice(0, 7)
    if (month) {
      actualByMonth[month] = money((actualByMonth[month] || 0) + row.amount)
      if (row.amount > 0) {
        const category = row.category || 'Unclassified'
        categoryByMonth[month] ||= {}
        categoryByMonth[month][category] = money((categoryByMonth[month][category] || 0) + row.amount)
      }
    }
  }

  const forecastIssues = [...source.issues, ...actualIssues]
  const allocationExceptions: Array<{ paymentId: string; inquiryId: string | null; status: 'pending' | 'review' | 'unapplied' | 'inconsistent'; reason: string | null; unappliedAmount: number | null; amountNeedsReview: boolean }> = []
  for (const payment of source.payments) {
    if (payment.status !== 'paid') continue
    const status = payment.metadata?.installment_allocation_status
    if (status == null || status === '') continue // Older receipts have no allocator marker.
    const allocationRows = Array.isArray(payment.metadata?.installment_allocations) ? payment.metadata.installment_allocations : []
    const saved = money(allocationRows.reduce((sum: number, value: unknown) => {
      if (!value || typeof value !== 'object') return sum
      const amount = Number((value as Record<string, unknown>).amount)
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0)
    }, 0))
    const parseUnapplied = (value: unknown) => {
      if (value == null || value === '' || (typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null
      const amount = Number(value)
      return Number.isFinite(amount) && amount >= 0 && amount <= Number(payment.amount) ? money(amount) : null
    }
    const rawUnapplied = payment.metadata?.installment_unapplied_amount
    const validUnapplied = parseUnapplied(rawUnapplied)
    const rawReview = payment.metadata?.installment_allocation_review_unapplied_amount
    const validReview = parseUnapplied(rawReview)
    const consistentAllocated = status === 'allocated' && validUnapplied === 0 && Math.abs(saved - Number(payment.amount)) < 0.005
    if (consistentAllocated) continue
    const exceptionStatus = status === 'pending' || status === 'review' || status === 'unapplied' ? status : 'inconsistent'
    const canonicalPresent = rawUnapplied != null && rawUnapplied !== ''
    const reviewAmountSafe = validReview !== null && (!canonicalPresent || (validUnapplied !== null && Math.abs(validReview - validUnapplied) < 0.005))
    const exceptionAmount = exceptionStatus === 'review' ? (reviewAmountSafe ? validReview : null) : exceptionStatus === 'unapplied' ? validUnapplied : null
    const amountNeedsReview = exceptionStatus === 'review' && !reviewAmountSafe || exceptionStatus === 'unapplied' && validUnapplied === null
    allocationExceptions.push({ paymentId: payment.id, inquiryId: payment.inquiry_id || null, status: exceptionStatus, reason: typeof payment.metadata?.installment_allocation_review_reason === 'string' ? payment.metadata.installment_allocation_review_reason : null, unappliedAmount: exceptionAmount, amountNeedsReview })
  }
  if (allocationExceptions.length) forecastIssues.push('Payment allocations need review')
  if (refunds.some((refund) => refund.status === 'pending' || refund.status === 'uncertain' || (refund.status === 'succeeded' && String(refund.refund_kind) !== 'security_deposit'))) forecastIssues.push('Refund effects on the remaining contract need review')
  const expectedByMonth: Record<string, number> = {}
  const scheduleRows: LuxorFinanceScheduleRow[] = []
  let overdue = 0
  for (const row of summary.acceptedInvoiceRows) {
    const relevant = source.installments.filter((item) => item.booking_id === row.invoice.booking_id && item.invoice_id === row.invoice.id && item.status !== 'void' && item.metadata?.payment_bucket !== 'security_deposit')
    const states = relevant.map((item) => ({ item, state: installmentDisplayState(item, source.payments, now) }))
    const scheduled = money(states.reduce((sum, item) => sum + item.state.amountDue, 0))
    const credited = money(states.reduce((sum, item) => sum + item.state.credited, 0))
    const scheduleReconciled = Math.abs(scheduled - row.eventObligation) <= 0.005
      && Math.abs(credited - row.received) <= 0.005
      && row.received <= row.eventObligation + 0.005
    const scheduleDiscrepancyReason = Math.abs(scheduled - row.eventObligation) > 0.005
      ? `Scheduled installments ($${scheduled.toFixed(2)}) do not match the signed contract obligation ($${row.eventObligation.toFixed(2)}).`
      : Math.abs(credited - row.received) > 0.005
        ? `Credited schedule amount ($${credited.toFixed(2)}) does not match recorded booking payments ($${row.received.toFixed(2)}).`
        : row.received > row.eventObligation + 0.005
          ? `Recorded payments ($${row.received.toFixed(2)}) exceed the contract obligation ($${row.eventObligation.toFixed(2)}).`
          : null
    if (!scheduleReconciled) forecastIssues.push('A payment schedule needs reconciliation')
    // Forecast only from saved installment credits. Never allocate a receipt
    // a second time in this read model or infer an allocation for older rows.
    states.sort((a, b) => (a.item.due_at || '9999').localeCompare(b.item.due_at || '9999') || a.item.installment_order - b.item.installment_order || a.item.id.localeCompare(b.item.id))
    for (const { item, state } of states) {
      const remaining = money(state.amountDue - state.credited)
      const date = getLuxorPaymentCalendarDateKey({ received_date: item.due_at, paid_at: null })
      scheduleRows.push({
        installment: item,
        bookingId: row.invoice.booking_id || item.booking_id,
        invoiceId: row.invoice.id,
        amountDue: state.amountDue,
        credited: state.credited,
        remaining,
        dueDate: date || null,
        status: state.status,
        isPaid: state.isPaid,
        isPartial: state.isPartial,
        isOverdue: state.isOverdue,
        overdueDays: state.overdueDays,
        scheduleReconciled,
        reviewReason: !date ? 'Installment is missing a valid due date.' : scheduleDiscrepancyReason,
      })
      if (!remaining) continue
      if (!date) { forecastIssues.push('A payment schedule is missing a valid due date'); continue }
      if (date < chicagoCalendarDate(now)) overdue = money(overdue + remaining)
      else {
        const month = date.slice(0, 7)
        expectedByMonth[month] = money((expectedByMonth[month] || 0) + remaining)
      }
    }
  }
  const securityDepositsHeld = actualIssues.length || refunds.some((row) => row.status === 'pending' || row.status === 'uncertain' || (row.status === 'succeeded' && row.refund_kind === 'security_deposit')) ? null : summary.securityDepositsHeld
  return {
    actualByMonth: actualIssues.length ? null : actualByMonth,
    categoryByMonth: actualIssues.length || source.issues.some((issue) => /allocation/i.test(issue)) || summary.eventPaymentRows.some((row) => row.amount < 0) ? null : categoryByMonth,
    expectedByMonth: forecastIssues.length ? null : expectedByMonth,
    overdue: forecastIssues.length ? null : overdue,
    issues: [...new Set([...actualIssues, ...forecastIssues])],
    allocationExceptions,
    securityDepositsHeld,
    unallocatedPayments: summary.unallocatedPayments,
    reportingRows: {
      bookings,
      invoices: source.invoices,
      payments: source.payments,
      installments: source.installments,
      refunds,
      acceptedInvoiceRows: summary.acceptedInvoiceRows,
      eventPaymentRows: summary.eventPaymentRows,
      unallocatedPaymentRows: summary.unallocatedPaymentRows,
      scheduleRows,
    },
  }
}

export function getLuxorCategoryShares(values: Array<{ category: string; amount: number }>) {
  const total = money(values.reduce((sum, row) => sum + row.amount, 0))
  return { total, rows: values.map((row) => ({ ...row, percent: total > 0 ? row.amount / total * 100 : 0 })) }
}

export function getLuxorOverviewPeriod(overview: ReturnType<typeof getLuxorFinanceOverview>, month: string) {
  const actual = overview.actualByMonth ? overview.actualByMonth[month] || 0 : null
  const expected = overview.expectedByMonth ? overview.expectedByMonth[month] || 0 : null
  const projected = actual === null || expected === null ? null : money(actual + expected)
  const percent = projected !== null && actual !== null && actual >= 0
    ? projected > 0 ? Math.round(actual / projected * 100) : 0
    : null
  return { actual, expected, projected, percent }
}

export function getLuxorOverviewChart(overview: ReturnType<typeof getLuxorFinanceOverview>, year: number, grouping: 'monthly' | 'quarterly' | 'annual') {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const size = grouping === 'annual' ? 12 : grouping === 'quarterly' ? 3 : 1
  return Array.from({ length: 12 / size }, (_, i) => {
    const keys = months.slice(i * size, (i + 1) * size)
    return {
      label: grouping === 'annual' ? String(year) : grouping === 'quarterly' ? `Q${i + 1}` : new Date(Date.UTC(year, i, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      actual: overview.actualByMonth ? money(keys.reduce((sum, key) => sum + (overview.actualByMonth?.[key] || 0), 0)) : null,
      expected: overview.expectedByMonth ? money(keys.reduce((sum, key) => sum + (overview.expectedByMonth?.[key] || 0), 0)) : null,
    }
  })
}
