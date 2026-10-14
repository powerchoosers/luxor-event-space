type PaymentReminderInvoice = {
  invoice_kind?: unknown
  due_date?: string | null
  final_payment_due_date?: string | null
}

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
