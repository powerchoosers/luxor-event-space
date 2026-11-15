import type { LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'

export function formatLuxorLeadWaitingLabel(createdAt: string | null | undefined, now = Date.now()) {
  if (!createdAt) return null
  const elapsedMs = now - Date.parse(createdAt)
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null
  const hours = Math.floor(elapsedMs / 3_600_000)
  if (hours < 1) return 'waiting <1h'
  if (hours < 48) return `waiting ${hours}h`
  const days = Math.floor(hours / 24)
  return `waiting ${days}d`
}

function depositInvoicePaidTotal(invoice: LuxorInvoice, payments: LuxorPayment[]) {
  return payments
    .filter((payment) => payment.status === 'paid' && payment.invoice_id === invoice.id)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
}

/** Signed agreements awaiting the initial booking payment on the deposit invoice. */
export function bookingAwaitingInitialPayment(
  bookingId: string,
  depositByBookingId: Map<string, LuxorInvoice>,
  payments: LuxorPayment[],
) {
  const depositInvoice = depositByBookingId.get(bookingId)
  if (!depositInvoice) return true
  const paidTotal = depositInvoicePaidTotal(depositInvoice, payments)
  return paidTotal + 0.005 < Number(depositInvoice.total || 0)
}