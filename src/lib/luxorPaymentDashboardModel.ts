import type { LuxorEmailJob, LuxorInvoice, LuxorPayment, LuxorPaymentInstallment } from './luxorInquiryTypes'

const roundMoney = (amount: number) => Math.round(amount * 100) / 100

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

export function isBookingPaymentMilestone(installment: LuxorPaymentInstallment) {
  return installment.installment_order === 1 && installment.label.trim().toLowerCase() === 'booking payment'
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
  const legacyPaid = installment.status === 'paid' ? amountDue : 0
  const legacyPartial = installment.status === 'partial' ? Math.max(0, Number(installment.metadata?.paid_amount) || 0) : 0
  return Math.min(amountDue, Math.max(allocated, legacyPaid, legacyPartial))
}

export function paidOnInvoice(invoice: LuxorInvoice, invoices: LuxorInvoice[], payments: LuxorPayment[]) {
  const relatedIds = invoice.invoice_kind === 'event'
    ? new Set([invoice.id, ...invoices.filter((child) => child.parent_invoice_id === invoice.id && child.invoice_kind !== 'security_deposit').map((child) => child.id)])
    : new Set([invoice.id])
  const invoiceById = new Map(invoices.map((item) => [item.id, item]))
  return roundMoney(payments.filter((payment) => payment.status === 'paid' && payment.invoice_id && relatedIds.has(payment.invoice_id))
    .reduce((sum, payment) => sum + (invoice.invoice_kind === 'event' ? eventCreditForPayment(payment, invoiceById.get(payment.invoice_id || '')) : Number(payment.amount) || 0), 0))
}

export function paymentReminderJobsForEvent(jobs: LuxorEmailJob[], bookingId: string | null | undefined, invoiceIds: Set<string>) {
  const kinds = new Set(['unpaid_invoice_reminder', 'sixty_day_payment_reminder', 'final_payment_reminder', 'proposal_payment_reminder'])
  return jobs.filter((job) => kinds.has(job.job_type)
    && ((Boolean(bookingId) && job.booking_id === bookingId) || (typeof job.metadata?.invoice_id === 'string' && invoiceIds.has(job.metadata.invoice_id))))
}
