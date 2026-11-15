import type { LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'
import { LUXOR_TOUR_TIMEZONE } from './luxorTourMetrics'

/** Prefer a colon or hyphen instead of em dashes in briefing copy and subjects. */
export function sanitizeLuxorSalesBriefingCopy(text: string) {
  return text.replace(/\s*—\s*/g, ': ').replace(/—/g, '-')
}

export function formatLuxorSalesBriefingChicagoTitle(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function stripTrailingPeriodForSubject(text: string) {
  if (text.endsWith('.') && !text.endsWith('..')) {
    return text.slice(0, -1).trimEnd()
  }
  return text
}

export function buildLuxorSalesBriefingSubject(input: {
  briefingDateKey: string
  marcusBriefingReady?: boolean
  headline?: string | null
}) {
  const rawHeadline = input.marcusBriefingReady ? input.headline?.trim() : ''
  if (rawHeadline) {
    const headline = stripTrailingPeriodForSubject(sanitizeLuxorSalesBriefingCopy(rawHeadline))
    return `Luxor sales briefing: ${headline}`
  }
  return `Luxor sales briefing: ${formatLuxorSalesBriefingChicagoTitle(input.briefingDateKey)}`
}

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