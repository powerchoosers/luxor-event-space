import type { LuxorFinanceOverviewInput } from './luxorFinanceReporting'
import { getLuxorFinanceOverview, getLuxorPaymentCalendarDateKey } from './luxorFinanceReporting'
import type { LuxorPayment, LuxorPaymentRefundView } from './luxorInquiryTypes'
import { chicagoCalendarDate, installmentDisplayState, isLuxorBookingReceivableEligible } from './luxorPaymentDashboardModel'

export type LuxorRevenuePeriodPreset = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time' | 'custom'
export type LuxorRevenueRecordStatus = 'paid' | 'partially_paid' | 'upcoming' | 'due_today' | 'overdue' | 'needs_review'
export type LuxorRevenueHistoryStatus = 'successful' | 'pending' | 'failed' | 'cancelled' | 'refunded' | 'needs_review'
export type LuxorRevenuePaymentType = 'booking_deposit' | 'installment_payment' | 'final_payment' | 'full_payment' | 'additional_service_payment' | 'other'
export type LuxorRevenueTreatment = 'event_collection' | 'refundable_security_deposit' | 'unapplied' | 'not_collected' | 'refund'

export type LuxorRevenueCollectionsOptions = {
  preset?: LuxorRevenuePeriodPreset
  startDate?: string | null
  endDate?: string | null
  now?: Date
}

export type LuxorRevenuePeriod = {
  preset: LuxorRevenuePeriodPreset
  startDate: string | null
  endDate: string | null
  timezone: 'America/Chicago'
  boundaries: 'inclusive_calendar_dates'
  valid: boolean
}

export type LuxorRevenueScheduleRow = {
  installmentId: string
  bookingId: string
  invoiceId: string
  clientName: string
  eventType: string | null
  eventDate: string | null
  /** Accepted event-services amount; refundable security deposits are separate. */
  bookingTotal: number | null
  label: string
  order: number
  dueDate: string | null
  amountDue: number | null
  credited: number | null
  remaining: number | null
  status: LuxorRevenueRecordStatus
  paymentMethod: string | null
  reference: string | null
  reviewRequired: boolean
}

export type LuxorRevenueReceivableRow = {
  bookingId: string
  invoiceId: string
  inquiryId: string | null
  clientName: string
  eventType: string | null
  eventDate: string | null
  /** Accepted event-services amount; refundable security deposits are separate. */
  bookingTotal: number | null
  paid: number | null
  remainingBalance: number | null
  nextPaymentDue: string | null
  nextPaymentAmount: number | null
  completionPercentage: number | null
  status: LuxorRevenueRecordStatus
  schedule: LuxorRevenueScheduleRow[]
}

export type LuxorRevenueHistoryRow = {
  id: string
  transactionId: string
  transactionReference: string
  processorReference: string | null
  processor: string | null
  processorPaymentIntentId: string | null
  processorRefundId: string | null
  livemode: boolean | null
  sourcePaymentId: string | null
  bookingId: string | null
  invoiceId: string | null
  clientName: string
  eventType: string | null
  date: string | null
  dateSource: 'received_date' | 'paid_at' | 'created_at' | 'completed_at' | 'requested_at' | 'unavailable'
  amount: number | null
  signedAmount: number | null
  currency: string
  paymentMethod: string | null
  paymentType: LuxorRevenuePaymentType
  status: LuxorRevenueHistoryStatus
  treatment: LuxorRevenueTreatment
  revenueEffect: number | null
  allocationStatus: 'pending' | 'review' | 'unapplied' | 'inconsistent' | null
  unappliedAmount: number | null
  allocationReviewReason: string | null
  isManual: boolean
  notes: string | null
}

export type LuxorRevenueHistoryFilters = {
  startDate?: string | null
  endDate?: string | null
  client?: string
  paymentMethod?: string
  paymentType?: LuxorRevenuePaymentType | ''
  status?: LuxorRevenueHistoryStatus | ''
  search?: string
}

export type LuxorRevenueReceivableFilters = {
  status?: LuxorRevenueRecordStatus | ''
  client?: string
  eventStartDate?: string | null
  eventEndDate?: string | null
  dueStartDate?: string | null
  dueEndDate?: string | null
  minimumOutstanding?: number | null
  maximumOutstanding?: number | null
  search?: string
}

export type LuxorRevenueCollectionsModel = {
  period: LuxorRevenuePeriod
  asOfDate: string
  currency: 'USD'
  metricScopes: {
    totalCollected: 'selected_period_net_event_cash'
    expectedRevenue: 'selected_period_saved_obligations_due_today_or_later'
    outstandingBalance: 'lifetime_active_contractual_event_balance'
    overduePayments: 'as_of_date_all_past_due_saved_event_obligations'
    upcomingCollections: 'today_through_30_calendar_days'
  }
  availability: {
    period: boolean
    collected: boolean
    expected: boolean
    outstanding: boolean
    overdue: boolean
    upcoming: boolean
  }
  kpis: {
    /** Net eligible event receipts, after any verified event refunds, within the selected period. */
    totalCollected: number | null
    /** Positive eligible event receipts before refunds within the selected period. */
    grossCollected: number | null
    /** Verified eligible event refunds completed within the selected period. */
    eventRefunds: number | null
    /** Remaining saved event obligations due today or later within the selected period. */
    expectedRevenue: number | null
    /** Lifetime remaining balance across eligible signed, confirmed bookings. */
    outstandingBalance: number | null
    /** All eligible scheduled event amounts past due as of the Chicago business date. */
    overduePayments: number | null
    /** Eligible scheduled event amounts due from today through 30 calendar days from today. */
    upcomingCollections: number | null
  }
  receivables: LuxorRevenueReceivableRow[]
  paymentSchedules: LuxorRevenueScheduleRow[]
  selectedPeriodSeries: Array<{
    key: string
    label: string
    granularity: 'month' | 'year'
    collected: number | null
    expected: number | null
    projected: number | null
  }>
  rolling12Months: Array<{
    month: string
    collected: number | null
    expected: number | null
    projected: number | null
  }>
  paymentHistory: LuxorRevenueHistoryRow[]
  /** Refundable security deposits are tracked separately from event revenue. */
  securityDeposits: {
    held: number | null
    history: LuxorRevenueHistoryRow[]
    savedSchedule: LuxorRevenueScheduleRow[]
  }
  allocationExceptions: ReturnType<typeof getLuxorFinanceOverview>['allocationExceptions']
  issues: string[]
}

type RevenueRefundInput = Omit<LuxorPaymentRefundView, 'refund_kind'> & {
  refund_kind: string
  source_payment_id?: string | null
  processor?: string | null
  processor_payment_intent_id?: string | null
  processor_refund_id?: string | null
  livemode?: boolean | null
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const validDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function monthKey(dateKey: string) {
  return dateKey.slice(0, 7)
}

function dateKeyAtMonthOffset(today: string, offset: number, day: number) {
  const [year, month] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, day, 12))
  return date.toISOString().slice(0, 10)
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return date.toISOString().slice(0, 10)
}

function yearMonthBounds(key: string, granularity: 'month' | 'year') {
  if (granularity === 'year') return { start: `${key}-01-01`, end: `${key}-12-31` }
  const [year, month] = key.split('-').map(Number)
  return {
    start: `${key}-01`,
    end: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10),
  }
}

/** Resolve all reporting presets against the Luxor business date, inclusive. */
export function resolveLuxorRevenuePeriod(options: LuxorRevenueCollectionsOptions = {}, now = options.now || new Date()): LuxorRevenuePeriod {
  const preset = options.preset || 'this_month'
  const today = chicagoCalendarDate(now)
  const [year, month] = today.split('-').map(Number)
  const monthStart = dateKeyAtMonthOffset(today, 0, 1)
  const monthEnd = dateKeyAtMonthOffset(today, 1, 0)
  if (preset === 'all_time') return { preset, startDate: null, endDate: null, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: true }
  if (preset === 'this_month') return { preset, startDate: monthStart, endDate: monthEnd, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: true }
  if (preset === 'last_month') return { preset, startDate: dateKeyAtMonthOffset(today, -1, 1), endDate: dateKeyAtMonthOffset(today, 0, 0), timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: true }
  if (preset === 'this_quarter') {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
    const start = new Date(Date.UTC(year, quarterStartMonth - 1, 1, 12)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(year, quarterStartMonth + 2, 0, 12)).toISOString().slice(0, 10)
    return { preset, startDate: start, endDate: end, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: true }
  }
  if (preset === 'this_year') return { preset, startDate: `${year}-01-01`, endDate: `${year}-12-31`, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: true }
  if (preset === 'custom') {
    const startDate = options.startDate || null
    const endDate = options.endDate || null
    const valid = validDateKey(startDate) && validDateKey(endDate) && startDate <= endDate
    return { preset, startDate, endDate, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid }
  }
  return { preset: 'custom', startDate: null, endDate: null, timezone: 'America/Chicago', boundaries: 'inclusive_calendar_dates', valid: false }
}

function inDateRange(date: string | null, startDate: string | null, endDate: string | null) {
  return Boolean(date && validDateKey(date) && (!startDate || date >= startDate) && (!endDate || date <= endDate))
}

function validFilterRange(startDate?: string | null, endDate?: string | null) {
  return (!startDate || validDateKey(startDate))
    && (!endDate || validDateKey(endDate))
    && (!startDate || !endDate || startDate <= endDate)
}

function paymentDate(payment: LuxorPayment) {
  const key = getLuxorPaymentCalendarDateKey({ received_date: payment.received_date, paid_at: payment.paid_at })
  return { key: key || null, source: key ? payment.received_date ? 'received_date' as const : 'paid_at' as const : 'unavailable' as const }
}

function paymentType(payment: LuxorPayment, invoiceKind?: string | null): LuxorRevenuePaymentType {
  const value = String(payment.metadata?.payment_kind || invoiceKind || '').toLowerCase()
  if (value === 'deposit' || value === 'booking_deposit') return 'booking_deposit'
  if (value === 'installment' || value === 'installment_payment') return 'installment_payment'
  if (value === 'final' || value === 'final_balance' || value === 'final_payment') return 'final_payment'
  if (value === 'full' || value === 'full_payment') return 'full_payment'
  if (value === 'additional_services' || value === 'additional_service_payment') return 'additional_service_payment'
  return 'other'
}

function historyStatus(status: string): LuxorRevenueHistoryStatus {
  if (status === 'paid') return 'successful'
  if (status === 'pending') return 'pending'
  if (status === 'failed') return 'failed'
  if (status === 'void') return 'cancelled'
  if (status === 'refunded') return 'refunded'
  return 'needs_review'
}

function scheduleStatus(input: { paid: boolean; partial: boolean; overdue: boolean; dueDate: string | null; today: string; verified: boolean }): LuxorRevenueRecordStatus {
  if (!input.verified) return 'needs_review'
  if (input.paid) return 'paid'
  if (!input.dueDate) return 'needs_review'
  if (input.overdue || input.dueDate < input.today) return 'overdue'
  if (input.dueDate === input.today) return 'due_today'
  if (input.partial) return 'partially_paid'
  return 'upcoming'
}

function savedScheduleRows(input: ReturnType<typeof getLuxorFinanceOverview>, today: string): LuxorRevenueScheduleRow[] {
  const bookingById = new Map(input.reportingRows.bookings.map((booking) => [booking.id, booking]))
  const invoiceById = new Map(input.reportingRows.invoices.map((invoice) => [invoice.id, invoice]))
  const receivableByBooking = new Map(input.reportingRows.acceptedInvoiceRows.map((row) => [row.invoice.booking_id || '', row]))
  const financialStateVerified = input.actualByMonth !== null && input.expectedByMonth !== null
  return input.reportingRows.scheduleRows.map((row) => {
    const booking = bookingById.get(row.bookingId)
    const invoice = invoiceById.get(row.invoiceId)
    const verified = financialStateVerified && row.scheduleReconciled
    return {
      installmentId: row.installment.id,
      bookingId: row.bookingId,
      invoiceId: row.invoiceId,
      clientName: booking?.client_name || invoice?.client_name || 'Client unavailable',
      eventType: booking?.event_type || invoice?.event_type || null,
      eventDate: booking?.event_date ? getLuxorPaymentCalendarDateKey({ received_date: booking.event_date, paid_at: null }) || null : null,
      bookingTotal: receivableByBooking.get(row.bookingId)?.eventObligation ?? null,
      label: row.installment.label,
      order: row.installment.installment_order,
      dueDate: row.dueDate,
      amountDue: verified ? row.amountDue : null,
      credited: verified ? row.credited : null,
      remaining: verified ? row.remaining : null,
      status: scheduleStatus({ paid: row.isPaid, partial: row.isPartial, overdue: row.isOverdue, dueDate: row.dueDate, today, verified }),
      paymentMethod: row.installment.payment_method,
      reference: row.installment.reference,
      reviewRequired: !verified,
    }
  })
}

function historyRows(
  overview: ReturnType<typeof getLuxorFinanceOverview>,
  refunds: RevenueRefundInput[],
): LuxorRevenueHistoryRow[] {
  const bookingById = new Map(overview.reportingRows.bookings.map((booking) => [booking.id, booking]))
  const invoiceById = new Map(overview.reportingRows.invoices.map((invoice) => [invoice.id, invoice]))
  const allocationByPayment = new Map(overview.reportingRows.eventPaymentRows.map((row) => [row.id, row]))
  const allocationExceptionByPayment = new Map(overview.allocationExceptions.map((exception) => [exception.paymentId, exception]))
  const rows: LuxorRevenueHistoryRow[] = overview.reportingRows.payments.map((payment) => {
    const invoice = payment.invoice_id ? invoiceById.get(payment.invoice_id) : undefined
    const parentInvoice = invoice?.parent_invoice_id ? invoiceById.get(invoice.parent_invoice_id) : undefined
    const bookingId = payment.booking_id || invoice?.booking_id || parentInvoice?.booking_id || null
    const booking = bookingId ? bookingById.get(bookingId) : undefined
    const allocation = allocationByPayment.get(payment.id)
    const allocationException = allocationExceptionByPayment.get(payment.id)
    const isSecurity = invoice?.invoice_kind === 'security_deposit'
      || String(payment.metadata?.payment_kind || '').toLowerCase() === 'security_deposit'
      || String(payment.metadata?.payment_kind || '').toLowerCase() === 'security_deposit_refund'
    const legacyRefundNeedsReview = payment.status === 'refunded'
    const state = historyStatus(payment.status)
    const date = paymentDate(payment)
    const validAmount = Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0
    const treatment: LuxorRevenueTreatment = legacyRefundNeedsReview ? 'unapplied' : state !== 'successful' ? 'not_collected' : isSecurity ? 'refundable_security_deposit' : allocation ? 'event_collection' : 'unapplied'
    const recognized = legacyRefundNeedsReview ? null : state === 'successful' && allocation ? allocation.amount : isSecurity && state === 'successful' ? 0 : state !== 'successful' ? 0 : null
    return {
      id: `payment:${payment.id}`,
      transactionId: payment.id,
      transactionReference: payment.processor_reference || payment.id,
      processorReference: payment.processor_reference,
      processor: payment.processor,
      processorPaymentIntentId: typeof payment.metadata?.payment_intent_id === 'string' ? payment.metadata.payment_intent_id : null,
      processorRefundId: null,
      livemode: typeof payment.metadata?.livemode === 'boolean' ? payment.metadata.livemode : null,
      sourcePaymentId: payment.id,
      bookingId,
      invoiceId: payment.invoice_id,
      clientName: booking?.client_name || invoice?.client_name || 'Client unavailable',
      eventType: booking?.event_type || invoice?.event_type || null,
      date: date.key || (payment.status === 'paid' ? null : getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: payment.created_at }) || null),
      dateSource: date.key ? date.source : payment.status === 'paid' ? 'unavailable' : 'created_at',
      amount: validAmount ? money(Number(payment.amount)) : null,
      signedAmount: validAmount && !legacyRefundNeedsReview ? money(Number(payment.amount)) : null,
      currency: String(payment.metadata?.currency || 'usd').toUpperCase(),
      paymentMethod: String(payment.processor || '').toLowerCase() === 'stripe' ? 'Stripe' : payment.payment_method,
      paymentType: paymentType(payment, invoice?.invoice_kind),
      status: validAmount ? state : 'needs_review',
      treatment,
      revenueEffect: recognized,
      allocationStatus: allocationException?.status || null,
      unappliedAmount: allocationException?.unappliedAmount ?? null,
      allocationReviewReason: allocationException?.reason || null,
      isManual: String(payment.processor || '').toLowerCase() === 'manual' || payment.metadata?.manual_entry === true,
      notes: payment.notes,
    }
  })

  for (const refund of refunds) {
    const source = refund.source_payment_id ? overview.reportingRows.payments.find((payment) => payment.id === refund.source_payment_id) : undefined
    const invoice = refund.invoice_id ? invoiceById.get(refund.invoice_id) : undefined
    const bookingId = refund.booking_id || source?.booking_id || invoice?.booking_id || null
    const booking = bookingId ? bookingById.get(bookingId) : undefined
    const refundDate = getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: refund.completed_at || refund.requested_at })
    const succeeded = refund.status === 'succeeded'
    const amount = Number(refund.amount)
    const amountValid = Number.isFinite(amount) && amount > 0
    const refundKind = String(refund.refund_kind)
    const securityDeposit = refundKind === 'security_deposit'
    const eventRevenueRefund = refundKind === 'event_revenue'
    const refundClassificationReview = !securityDeposit && !eventRevenueRefund
    rows.push({
      id: `refund:${refund.id}`,
      transactionId: refund.id,
      transactionReference: refund.processor_refund_id || refund.id,
      processorReference: null,
      processor: refund.processor || null,
      processorPaymentIntentId: refund.processor_payment_intent_id || null,
      processorRefundId: refund.processor_refund_id || null,
      livemode: typeof refund.livemode === 'boolean' ? refund.livemode : null,
      sourcePaymentId: refund.source_payment_id || null,
      bookingId,
      invoiceId: refund.invoice_id,
      clientName: booking?.client_name || invoice?.client_name || 'Client unavailable',
      eventType: booking?.event_type || invoice?.event_type || null,
      date: refundDate || null,
      dateSource: refund.completed_at && refundDate ? 'completed_at' : refund.requested_at && refundDate ? 'requested_at' : 'unavailable',
      amount: amountValid ? money(amount) : null,
      signedAmount: amountValid && succeeded && !refundClassificationReview ? -money(amount) : null,
      currency: String(refund.currency || 'usd').toUpperCase(),
      paymentMethod: refund.processor === 'stripe' ? 'Stripe' : refund.processor || null,
      paymentType: source ? paymentType(source, invoice?.invoice_kind) : 'other',
      status: refundClassificationReview || !amountValid ? 'needs_review' : succeeded ? 'successful' : refund.status === 'pending' || refund.status === 'uncertain' ? 'pending' : 'failed',
      treatment: securityDeposit ? 'refundable_security_deposit' : eventRevenueRefund ? 'refund' : 'unapplied',
      revenueEffect: succeeded && eventRevenueRefund && amountValid ? -money(amount) : succeeded && securityDeposit ? 0 : null,
      allocationStatus: null,
      unappliedAmount: null,
      allocationReviewReason: null,
      isManual: false,
      notes: null,
    })
  }
  return rows.sort((left, right) => (right.date || '').localeCompare(left.date || '') || left.id.localeCompare(right.id))
}

/** Build the Phase 2 read model exclusively from Phase 1's validated source rows and ledger math. */
export function getLuxorRevenueCollectionsModel(
  input: LuxorFinanceOverviewInput,
  options: LuxorRevenueCollectionsOptions = {},
): LuxorRevenueCollectionsModel {
  const now = options.now || input.now || new Date()
  const today = chicagoCalendarDate(now)
  const period = resolveLuxorRevenuePeriod(options, now)
  const overview = getLuxorFinanceOverview({ ...input, now })
  const financialHistory = historyRows(overview, overview.reportingRows.refunds as RevenueRefundInput[])
  const paymentSchedules = savedScheduleRows(overview, today)
  const actualSourcesAvailable = overview.actualByMonth !== null && overview.reportingRows.eventPaymentRows.every((row) => Number.isFinite(row.amount))
  const actualAvailable = period.valid && actualSourcesAvailable
  const forecastSourcesAvailable = overview.expectedByMonth !== null && overview.overdue !== null
  const forecastAvailable = period.valid && forecastSourcesAvailable
  const baseOutstandingAvailable = overview.actualByMonth !== null && overview.reportingRows.acceptedInvoiceRows.every((row) => Number.isFinite(row.eventObligation)
    && row.eventObligation >= 0
    && Number.isFinite(row.received)
    && row.received >= 0
    && row.received <= row.eventObligation + 0.005
    && Number.isFinite(row.outstanding))
  const activeReceivableBookingIds = new Set(overview.reportingRows.acceptedInvoiceRows.map((row) => row.invoice.booking_id).filter((id): id is string => Boolean(id)))
  const paymentById = new Map(overview.reportingRows.payments.map((payment) => [payment.id, payment]))
  const invoiceById = new Map(overview.reportingRows.invoices.map((invoice) => [invoice.id, invoice]))
  const refundReviewBookingIds = new Set<string>()
  let unlinkedRefundReview = false
  for (const refund of overview.reportingRows.refunds as RevenueRefundInput[]) {
    const kind = String(refund.refund_kind)
    const obligationSensitive = kind === 'event_revenue' || kind === 'unclassified'
    if (!obligationSensitive || !['succeeded', 'pending', 'uncertain'].includes(refund.status)) continue
    const sourcePayment = refund.source_payment_id ? paymentById.get(refund.source_payment_id) : undefined
    const invoice = refund.invoice_id ? invoiceById.get(refund.invoice_id) : undefined
    const bookingId = refund.booking_id || sourcePayment?.booking_id || invoice?.booking_id || null
    if (!bookingId) unlinkedRefundReview = true
    else if (activeReceivableBookingIds.has(bookingId)) refundReviewBookingIds.add(bookingId)
  }
  const outstandingAvailable = baseOutstandingAvailable && refundReviewBookingIds.size === 0 && !unlinkedRefundReview
  const rangeStart = period.startDate
  const rangeEnd = period.endDate
  const inPeriodCashRows = overview.reportingRows.eventPaymentRows.filter((row) => inDateRange(getLuxorPaymentCalendarDateKey(row) || null, rangeStart, rangeEnd))
  const grossCollected = actualAvailable ? money(inPeriodCashRows.reduce((sum, row) => sum + Math.max(0, row.amount), 0)) : null
  const eventRefunds = actualAvailable ? money(inPeriodCashRows.reduce((sum, row) => sum + Math.max(0, -row.amount), 0)) : null
  const totalCollected = actualAvailable ? money(inPeriodCashRows.reduce((sum, row) => sum + row.amount, 0)) : null
  const expectedRevenue = forecastAvailable ? money(paymentSchedules.reduce((sum, row) => {
    if (row.remaining === null || !row.dueDate || row.dueDate < today || !inDateRange(row.dueDate, rangeStart, rangeEnd)) return sum
    return sum + row.remaining
  }, 0)) : null
  const outstandingBalance = outstandingAvailable ? money(overview.reportingRows.acceptedInvoiceRows.reduce((sum, row) => sum + row.outstanding, 0)) : null
  const upcomingEnd = shiftDateKey(today, 30)
  const upcomingCollections = forecastSourcesAvailable ? money(paymentSchedules.reduce((sum, row) => {
    if (row.remaining === null || !row.dueDate || row.dueDate < today || row.dueDate > upcomingEnd) return sum
    return sum + row.remaining
  }, 0)) : null

  const bookingById = new Map(overview.reportingRows.bookings.map((booking) => [booking.id, booking]))
  const scheduleByBooking = new Map<string, LuxorRevenueScheduleRow[]>()
  for (const row of paymentSchedules) scheduleByBooking.set(row.bookingId, [...(scheduleByBooking.get(row.bookingId) || []), row])
  const receivables: LuxorRevenueReceivableRow[] = overview.reportingRows.acceptedInvoiceRows.map((row) => {
    const bookingId = row.invoice.booking_id || ''
    const booking = bookingById.get(bookingId)
    const invoice = invoiceById.get(row.invoice.id)
    const schedule = scheduleByBooking.get(bookingId) || []
    const remainingItems = schedule.filter((item) => item.remaining !== null && item.remaining > 0)
      .sort((left, right) => (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31') || left.order - right.order)
    const next = remainingItems[0]
    const refundReview = refundReviewBookingIds.has(bookingId) || unlinkedRefundReview
    const rowBalanceAvailable = baseOutstandingAvailable && !refundReview
    const verified = rowBalanceAvailable && forecastSourcesAvailable && !refundReview && schedule.every((item) => !item.reviewRequired)
    const status: LuxorRevenueRecordStatus = !verified ? 'needs_review'
      : row.outstanding <= 0.005 ? 'paid'
        : schedule.some((item) => item.status === 'overdue' && (item.remaining || 0) > 0) ? 'overdue'
          : schedule.some((item) => item.status === 'due_today' && (item.remaining || 0) > 0) ? 'due_today'
            : row.received > 0 ? 'partially_paid'
              : 'upcoming'
    return {
      bookingId,
      invoiceId: row.invoice.id,
      inquiryId: booking?.inquiry_id || row.invoice.inquiry_id || null,
      clientName: booking?.client_name || row.invoice.client_name || 'Client unavailable',
      eventType: booking?.event_type || row.invoice.event_type || null,
      eventDate: booking?.event_date ? getLuxorPaymentCalendarDateKey({ received_date: booking.event_date, paid_at: null }) || null : null,
      bookingTotal: baseOutstandingAvailable ? row.eventObligation : null,
      paid: rowBalanceAvailable ? row.received : null,
      remainingBalance: rowBalanceAvailable ? row.outstanding : null,
      nextPaymentDue: forecastSourcesAvailable ? next?.dueDate || null : null,
      nextPaymentAmount: forecastSourcesAvailable ? next?.remaining ?? null : null,
      completionPercentage: rowBalanceAvailable && !refundReview && row.eventObligation > 0 ? Math.round(Math.min(100, Math.max(0, row.received / row.eventObligation * 100)) * 100) / 100 : rowBalanceAvailable && !refundReview && row.eventObligation === 0 ? 100 : null,
      status,
      schedule,
    }
  })

  const rolling12Months = Array.from({ length: 12 }, (_, offset) => {
    const start = dateKeyAtMonthOffset(today, offset, 1)
    const end = dateKeyAtMonthOffset(today, offset + 1, 0)
    const month = monthKey(start)
    const collected = actualSourcesAvailable ? money(overview.reportingRows.eventPaymentRows
      .filter((row) => getLuxorPaymentCalendarDateKey(row).slice(0, 7) === month)
      .reduce((sum, row) => sum + row.amount, 0)) : null
    const expected = forecastSourcesAvailable ? money(paymentSchedules.reduce((sum, row) => {
      if (row.remaining === null || !row.dueDate || row.dueDate < today || row.dueDate < start || row.dueDate > end) return sum
      return sum + row.remaining
    }, 0)) : null
    return { month, collected, expected, projected: collected === null || expected === null ? null : money(collected + expected) }
  })

  const actualDates = overview.reportingRows.eventPaymentRows.map((row) => getLuxorPaymentCalendarDateKey(row)).filter(validDateKey)
  const expectedDates = paymentSchedules.map((row) => row.dueDate).filter((date): date is string => Boolean(date && date >= today))
  const periodStart = period.startDate || [...actualDates, ...expectedDates].sort()[0] || null
  const periodEnd = period.endDate || [...actualDates, ...expectedDates].sort().at(-1) || null
  const periodMonths = periodStart && periodEnd
    ? (Number(periodEnd.slice(0, 4)) - Number(periodStart.slice(0, 4))) * 12 + Number(periodEnd.slice(5, 7)) - Number(periodStart.slice(5, 7)) + 1
    : 0
  const periodGranularity: 'month' | 'year' = periodMonths > 24 ? 'year' : 'month'
  const selectedPeriodSeries: LuxorRevenueCollectionsModel['selectedPeriodSeries'] = []
  if (period.valid && periodStart && periodEnd && periodStart <= periodEnd) {
    if (periodGranularity === 'month') {
      for (let offset = 0; offset < periodMonths; offset += 1) {
        const start = dateKeyAtMonthOffset(periodStart, offset, 1)
        const month = monthKey(start)
        const bounds = yearMonthBounds(month, 'month')
        const bucketStart = bounds.start < periodStart ? periodStart : bounds.start
        const bucketEnd = bounds.end > periodEnd ? periodEnd : bounds.end
        const collected = actualSourcesAvailable ? money(overview.reportingRows.eventPaymentRows
          .filter((row) => inDateRange(getLuxorPaymentCalendarDateKey(row) || null, bucketStart, bucketEnd))
          .reduce((sum, row) => sum + row.amount, 0)) : null
        const expected = forecastSourcesAvailable ? money(paymentSchedules.reduce((sum, row) => {
          if (row.remaining === null || !row.dueDate || row.dueDate < today || !inDateRange(row.dueDate, bucketStart, bucketEnd)) return sum
          return sum + row.remaining
        }, 0)) : null
        selectedPeriodSeries.push({ key: month, label: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1, 12)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }), granularity: 'month', collected, expected, projected: collected === null || expected === null ? null : money(collected + expected) })
      }
    } else {
      const firstYear = Number(periodStart.slice(0, 4))
      const lastYear = Number(periodEnd.slice(0, 4))
      for (let year = firstYear; year <= lastYear; year += 1) {
        const bounds = yearMonthBounds(String(year), 'year')
        const bucketStart = bounds.start < periodStart ? periodStart : bounds.start
        const bucketEnd = bounds.end > periodEnd ? periodEnd : bounds.end
        const collected = actualSourcesAvailable ? money(overview.reportingRows.eventPaymentRows
          .filter((row) => inDateRange(getLuxorPaymentCalendarDateKey(row) || null, bucketStart, bucketEnd))
          .reduce((sum, row) => sum + row.amount, 0)) : null
        const expected = forecastSourcesAvailable ? money(paymentSchedules.reduce((sum, row) => {
          if (row.remaining === null || !row.dueDate || row.dueDate < today || !inDateRange(row.dueDate, bucketStart, bucketEnd)) return sum
          return sum + row.remaining
        }, 0)) : null
        selectedPeriodSeries.push({ key: String(year), label: String(year), granularity: 'year', collected, expected, projected: collected === null || expected === null ? null : money(collected + expected) })
      }
    }
  }

  const securityDepositSchedule = overview.reportingRows.installments.filter((installment) => installment.status !== 'void' && installment.metadata?.payment_bucket === 'security_deposit')
    .flatMap((installment) => {
      const booking = bookingById.get(installment.booking_id)
      const invoice = installment.invoice_id ? invoiceById.get(installment.invoice_id) : undefined
      if (!booking || !activeReceivableBookingIds.has(booking.id) || !isLuxorBookingReceivableEligible(booking)) return []
      const state = installmentDisplayState(installment, overview.reportingRows.payments, now)
      const dueDate = getLuxorPaymentCalendarDateKey({ received_date: installment.due_at, paid_at: null }) || null
      const verified = overview.expectedByMonth !== null && Number.isFinite(Number(installment.amount)) && Number(installment.amount) >= 0 && Boolean(dueDate)
      return [{
        installmentId: installment.id,
        bookingId: installment.booking_id,
        invoiceId: installment.invoice_id || '',
        clientName: booking.client_name || invoice?.client_name || 'Client unavailable',
        eventType: booking.event_type || invoice?.event_type || null,
        eventDate: booking.event_date ? getLuxorPaymentCalendarDateKey({ received_date: booking.event_date, paid_at: null }) || null : null,
        bookingTotal: null,
        label: installment.label,
        order: installment.installment_order,
        dueDate,
        amountDue: verified ? state.amountDue : null,
        credited: verified ? state.credited : null,
        remaining: verified ? money(state.amountDue - state.credited) : null,
        status: scheduleStatus({ paid: state.isPaid, partial: state.isPartial, overdue: state.isOverdue, dueDate, today, verified }),
        paymentMethod: installment.payment_method,
        reference: installment.reference,
        reviewRequired: !verified,
      }]
    })
  const securityHistory = financialHistory.filter((row) => row.treatment === 'refundable_security_deposit')
  const issues = [...overview.issues]
  if (!period.valid) issues.push('The custom date range is invalid; select a valid inclusive start and end date.')
  if (refundReviewBookingIds.size || unlinkedRefundReview) issues.push('A contractual balance needs review after an event or unclassified refund.')

  return {
    period,
    asOfDate: today,
    currency: 'USD',
    metricScopes: {
      totalCollected: 'selected_period_net_event_cash',
      expectedRevenue: 'selected_period_saved_obligations_due_today_or_later',
      outstandingBalance: 'lifetime_active_contractual_event_balance',
      overduePayments: 'as_of_date_all_past_due_saved_event_obligations',
      upcomingCollections: 'today_through_30_calendar_days',
    },
    availability: {
      period: period.valid,
      collected: actualAvailable,
      expected: forecastAvailable,
      outstanding: outstandingAvailable,
      overdue: forecastSourcesAvailable,
      upcoming: forecastSourcesAvailable,
    },
    kpis: {
      totalCollected,
      grossCollected,
      eventRefunds,
      expectedRevenue,
      outstandingBalance,
      overduePayments: overview.overdue,
      upcomingCollections,
    },
    receivables,
    paymentSchedules,
    selectedPeriodSeries,
    rolling12Months,
    paymentHistory: financialHistory,
    securityDeposits: { held: overview.securityDepositsHeld, history: securityHistory, savedSchedule: securityDepositSchedule },
    allocationExceptions: overview.allocationExceptions,
    issues: [...new Set(issues)],
  }
}

/** Apply Chicago calendar-date filters to receivable rows without treating unknown values as zero. */
export function filterLuxorRevenueReceivables(rows: LuxorRevenueReceivableRow[], filters: LuxorRevenueReceivableFilters = {}) {
  if (!validFilterRange(filters.eventStartDate, filters.eventEndDate)
    || !validFilterRange(filters.dueStartDate, filters.dueEndDate)
    || filters.minimumOutstanding != null && !Number.isFinite(filters.minimumOutstanding)
    || filters.maximumOutstanding != null && !Number.isFinite(filters.maximumOutstanding)) return []
  const query = (filters.search || '').trim().toLocaleLowerCase()
  const client = (filters.client || '').trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false
    if (client && !row.clientName.toLocaleLowerCase().includes(client)) return false
    if (filters.eventStartDate || filters.eventEndDate) {
      if (!row.eventDate || !inDateRange(row.eventDate, filters.eventStartDate || null, filters.eventEndDate || null)) return false
    }
    if (filters.dueStartDate || filters.dueEndDate) {
      if (!row.nextPaymentDue || !inDateRange(row.nextPaymentDue, filters.dueStartDate || null, filters.dueEndDate || null)) return false
    }
    if (filters.minimumOutstanding != null || filters.maximumOutstanding != null) {
      if (row.remainingBalance === null) return false
      if (filters.minimumOutstanding != null && row.remainingBalance < filters.minimumOutstanding) return false
      if (filters.maximumOutstanding != null && row.remainingBalance > filters.maximumOutstanding) return false
    }
    if (query && !`${row.clientName} ${row.eventType || ''} ${row.bookingId} ${row.invoiceId}`.toLocaleLowerCase().includes(query)) return false
    return true
  })
}

/** Apply history filters to payment and refund rows; missing transaction dates do not match a date range. */
export function filterLuxorRevenueHistory(rows: LuxorRevenueHistoryRow[], filters: LuxorRevenueHistoryFilters = {}) {
  if (!validFilterRange(filters.startDate, filters.endDate)) return []
  const query = (filters.search || '').trim().toLocaleLowerCase()
  const client = (filters.client || '').trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if ((filters.startDate || filters.endDate) && !inDateRange(row.date, filters.startDate || null, filters.endDate || null)) return false
    if (client && !row.clientName.toLocaleLowerCase().includes(client)) return false
    if (filters.paymentMethod && row.paymentMethod !== filters.paymentMethod) return false
    if (filters.paymentType && row.paymentType !== filters.paymentType) return false
    if (filters.status && row.status !== filters.status) return false
    if (query && !`${row.transactionReference} ${row.clientName} ${row.eventType || ''} ${row.bookingId || ''} ${row.invoiceId || ''} ${row.paymentMethod || ''}`.toLocaleLowerCase().includes(query)) return false
    return true
  })
}

