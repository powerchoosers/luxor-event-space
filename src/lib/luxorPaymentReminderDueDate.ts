type PaymentReminderInvoice = {
  id?: string
  booking_id?: string | null
  parent_invoice_id?: string | null
  invoice_kind?: unknown
  due_date?: string | null
  final_payment_due_date?: string | null
}

type PaymentReminderBooking = {
  contract_status?: string | null
  final_payment_due_date?: string | null
} | null

const PAYMENT_INVOICE_KINDS = new Set(['deposit', 'final_balance', 'security_deposit'])

function isRealCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Only saved payment-invoice due dates qualify; an event proposal's valid-through date is not payment due. */
export function getLuxorPaymentReminderDueDate(invoice: PaymentReminderInvoice): string | null {
  const kind = String(invoice.invoice_kind || '')
  if (!PAYMENT_INVOICE_KINDS.has(kind)) return null
  const value = kind === 'final_balance'
    ? invoice.final_payment_due_date
    : invoice.due_date
  return isRealCalendarDate(value) ? value : null
}

/** Resolve only the booking explicitly attached to this payment invoice. */
export function getLuxorPaymentReminderBookingLookup(invoice: PaymentReminderInvoice):
  | { bookingId: string }
  | { invoiceId: string }
  | null {
  const bookingId = typeof invoice.booking_id === 'string' ? invoice.booking_id.trim() : ''
  if (bookingId) return { bookingId }
  const invoiceId = typeof invoice.parent_invoice_id === 'string' && invoice.parent_invoice_id.trim()
    ? invoice.parent_invoice_id.trim()
    : typeof invoice.id === 'string' ? invoice.id.trim() : ''
  return invoiceId ? { invoiceId } : null
}

/** Apply the due-date and signed-agreement guards before a queued invoice SMS sends. */
export function getLuxorInvoiceReminderTextSkipReason(input: {
  invoice: { status: string } & PaymentReminderInvoice | null
  booking: PaymentReminderBooking
  queuedDueDate?: string | null
}): string | null {
  const { invoice, booking } = input
  if (!invoice || ['paid', 'void', 'cancelled'].includes(invoice.status)) {
    return 'Invoice is already paid, cancelled, or unavailable.'
  }
  if (booking?.contract_status !== 'signed') {
    return 'The Event Agreement is not signed; the scheduled payment text was skipped.'
  }
  const dueDate = getLuxorPaymentReminderDueDate({
    ...invoice,
    final_payment_due_date: booking.final_payment_due_date,
  })
  if (!dueDate) return 'Invoice payment due date is invalid or unavailable; the scheduled reminder was skipped.'
  if (input.queuedDueDate !== dueDate) return 'Invoice due date changed; the old reminder was skipped.'
  return null
}
