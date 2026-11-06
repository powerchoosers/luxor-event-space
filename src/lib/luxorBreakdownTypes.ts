import { luxorScheduleMinutes } from './luxorAvailability'
import { formatCatalogTime } from './luxorPricingCatalog'
import type { LuxorProposalSelection } from './luxorProposalPricing'

export type LuxorBreakdown = {
  id: string
  inquiry_id: string
  lead_event_id: string | null
  recipient_email: string
  recipient_name: string
  subject: string
  html: string
  pricing_snapshot: Record<string, unknown>
  selection: LuxorProposalSelection
  created_at: string
  delivery_state: 'prepared' | 'sending' | 'sent' | 'delivery_unconfirmed'
  sent_at: string | null
  delivery_started_at: string | null
  provider_message_id: string | null
  error_message: string | null
}

export type LuxorBreakdownSummary = Omit<LuxorBreakdown, 'html' | 'pricing_snapshot'>

/** Stable across object key order, without changing meaningful array order. */
export function breakdownCanonicalJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    }
    return input
  }
  return JSON.stringify(canonical(value))
}

function breakdownLinePrice(value: unknown) {
  const line = value as Record<string, unknown>
  const number = (...values: unknown[]) => values.map(Number).find(Number.isFinite)
  const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null
  const quantity = number(line.quantity, line.qty) ?? 1
  const unitPrice = number(line.unitPrice, line.unit_price, line.price) ?? 0
  return {
    id: text(line.id),
    description: text(line.description) || text(line.name),
    quantity,
    unitPrice,
    total: number(line.total, line.line_total, line.amount) ?? quantity * unitPrice,
  }
}

/** Compare exactly the price-bearing content displayed in the comparison, not payment terms. */
export function breakdownPricingSignature(calculation: { packages?: readonly unknown[]; addOnQuotes?: readonly unknown[] }): string {
  return breakdownCanonicalJson({
    packages: (calculation.packages || []).map((value) => {
      const item = value as Record<string, unknown>
      return {
        id: item.id,
        finalEventPrice: item.finalEventPrice,
        subtotal: item.subtotal,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        taxRate: item.taxRate,
        refundableSecurityDeposit: item.refundableSecurityDeposit,
        lineItems: (Array.isArray(item.lineItems) ? item.lineItems : []).map(breakdownLinePrice),
      }
    }).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    addOnQuotes: calculation.addOnQuotes,
  })
}

/** One venue timing label for the builder preview and the saved client email. */
export function breakdownVenueAccessLabel(startTime: string, endTime: string): string {
  const range = luxorScheduleMinutes(startTime, endTime)
  if (!range) return 'Set both times'
  const startsNextDay = range.start >= 24 * 60
  const endsNextDay = range.end >= 24 * 60
  const prefix = startsNextDay ? 'Next day · ' : ''
  const suffix = endsNextDay && !startsNextDay ? ' · ends next day' : ''
  return `${prefix}${formatCatalogTime(startTime)} – ${formatCatalogTime(endTime)}${suffix}`
}

/** Keep overnight event-end disclosure identical in preview and delivery. */
export function breakdownEventEndLabel(guestArrivalTime: string, eventEndTime: string): string {
  if (!eventEndTime) return ''
  const range = luxorScheduleMinutes(guestArrivalTime, eventEndTime)
  return `${formatCatalogTime(eventEndTime)}${range && range.end >= 24 * 60 ? ' (next day)' : ''}`
}
