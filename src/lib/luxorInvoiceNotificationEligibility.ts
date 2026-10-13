const PAYMENT_INVOICE_KINDS = new Set(['deposit', 'final_balance', 'security_deposit'])

type InvoicePaymentNoticeFacts = {
  invoice_kind?: unknown
  status?: unknown
  paid_at?: unknown
  payment_requested_at?: unknown
  payment_requested_amount?: unknown
}

/** Only an issued payment invoice with a remaining request can create a due notice. */
export function getLuxorOutstandingPaymentRequestAmount(invoice: InvoicePaymentNoticeFacts, paidAmount = 0): number | null {
  const kind = String(invoice.invoice_kind || '')
  const status = String(invoice.status || '')
  const requestedAmount = Number(invoice.payment_requested_amount)

  if (!(PAYMENT_INVOICE_KINDS.has(kind)
    && status !== 'draft'
    && status !== 'cancelled'
    && status !== 'paid'
    && !invoice.paid_at
    && Boolean(invoice.payment_requested_at)
    && Number.isFinite(requestedAmount)
    && requestedAmount > 0)) return null

  const outstandingAmount = Math.round((requestedAmount - Math.max(0, Number(paidAmount) || 0)) * 100) / 100
  return outstandingAmount > 0 ? outstandingAmount : null
}
