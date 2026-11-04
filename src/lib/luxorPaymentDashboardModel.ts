import type { LuxorEmailJob, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment } from './luxorInquiryTypes'
import type { LuxorBooking } from './luxorInquiryTypes'

const roundMoney = (amount: number) => Math.round(amount * 100) / 100

/** Preserve the /api/bookings event-page payload contract when enriching rows with payment totals. */
export function attachLuxorBookingPaymentTotals<TBooking extends LuxorBooking>(bookings: TBooking[], payments: LuxorPayment[]) {
  return bookings.map((booking) => {
    const bookingPayments = payments.filter((payment) => payment.booking_id === booking.id)
    const paidTotal = bookingPayments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return {
      ...booking,
      payments: bookingPayments,
      paid_total: paidTotal,
      balance_due: Math.max(Number(booking.contract_total || 0) - paidTotal, 0),
    }
  })
}

export function eventCreditForPayment(payment: LuxorPayment, invoice?: LuxorInvoice) {
  if (payment.status !== 'paid') return 0
  const kind = String(payment.metadata?.payment_kind || '').toLowerCase()
  if (kind === 'security_deposit' || invoice?.invoice_kind === 'security_deposit') return 0
  const amount = Number(payment.amount) || 0
  if (kind === 'deposit' || invoice?.invoice_kind === 'deposit') {
    const explicitEventCredit = Number(payment.metadata?.initial_booking_payment)
    if (Number.isFinite(explicitEventCredit) && explicitEventCredit >= 0) return roundMoney(explicitEventCredit)
    const separateSecurityAmount = Number(payment.metadata?.refundable_security_deposit)
    if (Number.isFinite(separateSecurityAmount) && separateSecurityAmount > 0) return roundMoney(Math.max(0, amount - separateSecurityAmount))
  }
  return roundMoney(amount)
}

export function paymentDisplayReceivedDate(payment: Pick<LuxorPayment, 'received_date' | 'paid_at' | 'created_at'>, override?: string | null) {
  return override || payment.received_date || payment.paid_at || payment.created_at
}

export function isBookingPaymentMilestone(installment: LuxorPaymentInstallment) {
  return installment.installment_order === 1 && installment.label.trim().toLowerCase() === 'booking payment'
}

export function isFinalPaymentMilestone(installment: LuxorPaymentInstallment) {
  return installment.label.trim().toLowerCase() === 'final payment'
}

export function installmentReminderMilestone(dueDate: string, todayInChicago: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(todayInChicago)) return null
  const date = new Date(`${dueDate}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) return null
  date.setUTCDate(date.getUTCDate() - 7)
  if (date.toISOString().slice(0, 10) === todayInChicago) return 'installment_7_days_before' as const
  date.setUTCDate(date.getUTCDate() + 8)
  if (date.toISOString().slice(0, 10) === todayInChicago) return 'installment_1_day_overdue' as const
  return null
}

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function chicagoCalendarDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isCalendarDateBeforeChicagoToday(value: string | null | undefined, now = new Date()) {
  const date = calendarDateInChicago(value)
  const today = chicagoCalendarDate(now)
  return validCalendarDate(date) && date < today
}

export function isCalendarDateDueInChicago(value: string | null | undefined, now = new Date()) {
  const date = calendarDateInChicago(value)
  const today = chicagoCalendarDate(now)
  return validCalendarDate(date) && date <= today
}

export function calendarDateInChicago(value: string | null | undefined) {
  if (typeof value !== 'string') return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validCalendarDate(value) ? value : ''
  const timestamp = new Date(value)
  return Number.isFinite(timestamp.getTime()) ? chicagoCalendarDate(timestamp) : ''
}

export function daysOverdueInChicago(value: string | null | undefined, now = new Date()) {
  const date = calendarDateInChicago(value)
  const today = chicagoCalendarDate(now)
  if (!validCalendarDate(date) || date >= today) return 0
  return Math.floor((Date.parse(`${today}T12:00:00.000Z`) - Date.parse(`${date}T12:00:00.000Z`)) / 86_400_000)
}

export function isLuxorReminderDaytime(now: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).format(now) === '10'
}

/** True once today's one-hour reminder send window (10:00–11:00 Chicago) has ended. */
export function hasLuxorReminderSendWindowPassed(scheduledFor: string | Date, now: Date) {
  const scheduledAt = scheduledFor instanceof Date ? scheduledFor.getTime() : Date.parse(scheduledFor)
  return Number.isFinite(scheduledAt) && now.getTime() >= scheduledAt + 60 * 60 * 1000
}

export function installmentReminderWindowIsCurrent(dueDate: string, todayInChicago: string, milestone: string, now: Date) {
  return isLuxorReminderDaytime(now) && installmentReminderMilestone(dueDate, todayInChicago) === milestone
}

export function installmentReminderAutomationKey(bookingId: string, installmentId: string, dueDate: string, milestone: string) {
  return `installment:${bookingId}:${installmentId}:${dueDate}:${milestone}`
}

export function installmentPaidAmount(installment: LuxorPaymentInstallment, payments: LuxorPayment[]) {
  const allocated = payments.reduce((sum, payment) => {
    if (payment.status !== 'paid') return sum
    const rows = payment.metadata?.installment_allocations
    if (!Array.isArray(rows)) return sum
    return sum + rows.reduce((rowSum, row) => {
      if (!row || typeof row !== 'object') return rowSum
      const allocation = row as Record<string, unknown>
      const amount = Number(allocation.amount)
      return allocation.installment_id === installment.id && Number.isFinite(amount) && amount > 0 ? rowSum + amount : rowSum
    }, 0)
  }, 0)
  const amountDue = Math.max(0, Number(installment.amount) || 0)
  if (installment.status === 'paid') return amountDue
  const frozenLegacyBaseline = Number(installment.metadata?.installment_allocation_legacy_baseline)
  const recordedLegacyPaid = installment.status === 'partial' ? Math.max(0, Number(installment.metadata?.paid_amount) || 0) : 0
  const legacyBaseline = Number.isFinite(frozenLegacyBaseline) && frozenLegacyBaseline >= 0
    ? frozenLegacyBaseline
    : Math.max(0, recordedLegacyPaid - allocated)
  return Math.min(amountDue, Math.max(0, allocated + legacyBaseline))
}

export function installmentScheduleOutstanding(installments: LuxorPaymentInstallment[], payments: LuxorPayment[]) {
  return roundMoney(installments.filter((item) => item.status !== 'void').reduce((sum, item) =>
    sum + Math.max(0, Number(item.amount || 0) - installmentPaidAmount(item, payments)), 0))
}

export function installmentDisplayState(installment: LuxorPaymentInstallment, payments: LuxorPayment[], now = new Date()) {
  const amountDue = Math.max(0, Number(installment.amount) || 0)
  const credited = Math.min(amountDue, installmentPaidAmount(installment, payments))
  const isPaid = amountDue > 0 && (credited >= amountDue || installment.status === 'paid')
  const isPartial = installment.status === 'partial' || credited > 0 && !isPaid
  const overdueDays = !isPaid ? daysOverdueInChicago(installment.due_at, now) : 0
  return {
    amountDue, credited, isPaid, isPartial, overdueDays,
    isOverdue: overdueDays > 0 && amountDue - credited > 0.005,
    status: isPaid ? 'Paid' : overdueDays > 0 && amountDue - credited > 0.005 ? 'Overdue' : isPartial ? 'Partially paid' : 'Pending',
  }
}

export function installmentsForInvoiceStatus(invoice: LuxorInvoice, installments: LuxorPaymentInstallment[]) {
  // Legacy accepted master invoices may not carry the newer explicit kind.
  // Child payment invoices have their own kind and must not re-use the master schedule.
  if (!invoice.invoice_kind || invoice.invoice_kind === 'event') {
    return installments.filter((item) => item.status !== 'void' && item.invoice_id === invoice.id)
  }
  return []
}

export function hasOverdueInstallment(installments: LuxorPaymentInstallment[], payments: LuxorPayment[], now = new Date()) {
  return installments.some((item) => installmentDisplayState(item, payments, now).isOverdue)
}

export function paymentInvoiceFinalizationError(input: {
  invoice: LuxorInvoice
  mode: string
  outstanding: number
  installments: LuxorPaymentInstallment[]
  payments: LuxorPayment[]
}) {
  const { invoice, mode, outstanding, installments, payments } = input
  if (invoice.status === 'draft' && mode !== 'finalize_and_send') return 'Draft payment invoices require the explicit Finalize & Send action.'
  if (invoice.status !== 'draft' && mode === 'finalize_and_send') return 'Finalize & Send is only available for a draft payment invoice.'
  if (invoice.status === 'draft' && invoice.invoice_kind === 'final_balance' && installments.length > 0
    && Math.abs(installmentScheduleOutstanding(installments, payments) - outstanding) > 0.01) {
    return 'This draft does not match the outstanding amount on the saved payment schedule. Review the invoice before finalizing it.'
  }
  return null
}

export function paidOnInvoice(invoice: LuxorInvoice, invoices: LuxorInvoice[], payments: LuxorPayment[]) {
  const relatedIds = invoice.invoice_kind === 'event'
    ? new Set([invoice.id, ...invoices.filter((child) => child.parent_invoice_id === invoice.id && child.invoice_kind !== 'security_deposit').map((child) => child.id)])
    : new Set([invoice.id])
  const invoiceById = new Map(invoices.map((item) => [item.id, item]))
  return roundMoney(payments.filter((payment) => payment.status === 'paid' && payment.invoice_id && relatedIds.has(payment.invoice_id))
    .reduce((sum, payment) => sum + (invoice.invoice_kind === 'event' ? eventCreditForPayment(payment, invoiceById.get(payment.invoice_id || '')) : Number(payment.amount) || 0), 0))
}

export function refundableSecurityAmount(invoice: LuxorInvoice) {
  return roundMoney((Array.isArray(invoice.line_items) ? invoice.line_items : []).reduce((sum, item) => {
    const isSecurity = item.paymentBucket === 'security_deposit'
      || item.category === 'Security Deposit'
      || /refundable\s+security\s+deposit/i.test(item.description || '')
    return isSecurity ? sum + Number(item.total || 0) : sum
  }, 0))
}

/** The accepted event-service obligation, excluding a refundable deposit. */
export function invoiceEventObligation(invoice: LuxorInvoice) {
  const context = invoice.proposal_context as Record<string, unknown> | null | undefined
  const scopedLuxorAmount = Number(context?.luxor_services_total)
  if (context?.payment_collection_scope === 'luxor_services_only' && Number.isFinite(scopedLuxorAmount)) {
    return roundMoney(Math.max(0, scopedLuxorAmount))
  }
  return roundMoney(Math.max(0, Number(invoice.total || 0) - refundableSecurityAmount(invoice)))
}

export type InvoiceCollectionStatus = 'Open' | 'Partially paid' | 'Paid' | 'Overdue' | 'Needs reconciliation'

/** A receivable needs a confirmed (or completed) event and a saved signed contract. */
export function isLuxorBookingReceivableEligible(booking: Pick<LuxorBooking, 'status' | 'contract_status' | 'contract_signed_at'> | { status: string | null; contract_status: string | null; contract_signed_at: string | null } | null | undefined) {
  return Boolean(booking
    && (booking.status === 'confirmed' || booking.status === 'completed')
    && booking.contract_status === 'signed'
    && booking.contract_signed_at)
}

/**
 * Derive a collection label without changing the invoice's persisted lifecycle status.
 * Only an accepted, current event proposal tied to a signed confirmed booking (or
 * a child invoice linked to one) creates a receivable. Saved installment remainders
 * control overdue state when available.
 */
export function getInvoiceCollectionDisplayState(
  invoice: LuxorInvoice,
  invoices: LuxorInvoice[],
  payments: LuxorPayment[],
  installments: LuxorPaymentInstallment[],
  now = new Date(),
  financialSummary?: { acceptedInvoiceRows?: Array<{ invoice: Pick<LuxorInvoice, 'id'>; eventObligation: number; received: number; overdue: number }> },
  booking?: LuxorBooking | null,
) {
  const empty = { paidAmount: 0, totalDue: 0, balanceDue: 0, collectionStatus: null as InvoiceCollectionStatus | null }
  if (invoice.status === 'draft' || invoice.status === 'cancelled' || invoice.offer_status === 'withdrawn') return empty

  const byId = new Map(invoices.map((item) => [item.id, item]))
  let root = invoice
  const visited = new Set<string>()
  while (root.parent_invoice_id) {
    if (visited.has(root.id)) return empty
    visited.add(root.id)
    const parent = byId.get(root.parent_invoice_id)
    if (!parent) return empty
    root = parent
  }
  if (visited.has(root.id)) return empty

  const isInvoiceEventMaster = !invoice.parent_invoice_id && (!invoice.invoice_kind || invoice.invoice_kind === 'event')
  const rootIsEventMaster = !root.parent_invoice_id && (!root.invoice_kind || root.invoice_kind === 'event')
  const historicalPaidAmount = paidOnInvoice(invoice, invoices, payments)
  if (!rootIsEventMaster || !root.proposal_accepted_at || root.status === 'draft' || root.status === 'cancelled' || root.offer_status === 'withdrawn' || !isLuxorBookingReceivableEligible(booking)) return empty

  // Historical accepted proposal versions remain visible in the table but no longer
  // represent the current receivable once a later accepted version supersedes them.
  const superseded = invoices.some((candidate) => candidate.supersedes_invoice_id === root.id
    && Boolean(candidate.proposal_accepted_at)
    && candidate.status !== 'draft' && candidate.status !== 'cancelled'
    && candidate.offer_status !== 'withdrawn')
  if (superseded) return { ...empty, paidAmount: historicalPaidAmount }

  const masterRow = isInvoiceEventMaster
    ? financialSummary?.acceptedInvoiceRows?.find((row) => row.invoice.id === invoice.id)
    : undefined
  if (isInvoiceEventMaster && financialSummary?.acceptedInvoiceRows && !masterRow) return { ...empty, paidAmount: historicalPaidAmount }
  const paidAmount = masterRow?.received ?? historicalPaidAmount
  const total = isInvoiceEventMaster ? masterRow?.eventObligation ?? invoiceEventObligation(invoice) : Math.max(0, Number(invoice.total || 0))
  const balanceDue = Math.max(0, Math.round((total - paidAmount + Number.EPSILON) * 100) / 100)
  if (total <= 0) return empty

  const schedule = isInvoiceEventMaster ? installmentsForInvoiceStatus(invoice, installments) : []
  const overdueBySchedule = masterRow ? masterRow.overdue > 0 : schedule.length > 0 && hasOverdueInstallment(schedule, payments, now)
  const overdueByInvoice = Boolean(invoice.payment_requested_at && isCalendarDateBeforeChicagoToday(invoice.due_date, now))
  const isOverdue = balanceDue > 0.005 && (masterRow ? overdueBySchedule : schedule.length > 0 ? overdueBySchedule : overdueByInvoice)
  const collectionStatus: InvoiceCollectionStatus = balanceDue <= 0.005
    ? paidAmount > 0 ? 'Paid' : 'Open'
    : isOverdue ? 'Overdue'
      : paidAmount > 0 ? 'Partially paid'
        : invoice.status === 'paid' ? 'Needs reconciliation' : 'Open'

  return { paidAmount, totalDue: total, balanceDue, collectionStatus }
}

export function paymentReminderJobsForEvent(jobs: LuxorEmailJob[], bookingId: string | null | undefined, invoiceIds: Set<string>) {
  const kinds = new Set(['unpaid_invoice_reminder', 'sixty_day_payment_reminder', 'final_payment_request', 'final_payment_reminder', 'installment_payment_reminder', 'proposal_payment_reminder'])
  return jobs.filter((job) => kinds.has(job.job_type)
    && ((Boolean(bookingId) && job.booking_id === bookingId) || (typeof job.metadata?.invoice_id === 'string' && invoiceIds.has(job.metadata.invoice_id))))
}
