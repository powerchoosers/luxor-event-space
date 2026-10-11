import type { LuxorInvoice, LuxorProposalContext } from './luxorInquiryTypes'
import { luxorCalendarDate, proposalExpirationInstant } from './luxorProposalTerms'

export const SAME_DAY_BOOKING_NAME = 'Same-Day Booking — LUXOR Pays Your Sales Tax'
export const SAME_DAY_BOOKING_CODE = 'LUXOR-SAME-DAY-TAX'
export const SAME_DAY_BOOKING_TERMS = 'LUXOR pays the separately stated applicable sales tax only when both the signed agreement and required initial booking payment are completed before midnight America/Chicago on the original proposal creation date. Opening, accepting, or starting checkout does not secure this benefit. Late payment requires revised pricing and a fresh agreement.'
export const SAME_DAY_CARD_CUTOFF_TERMS = 'New discounted card links are available until 11:30 p.m. America/Chicago. An existing link may remain usable until midnight. Payments that succeed after midnight require owner review; the date is not automatically reserved.'

export type LuxorSameDayBookingSnapshot = {
  id: string
  name: string
  code: string
  original_created_at: string
  expires_at: string
  coverage_amount: number
  status: 'active' | 'expired'
  terms: string
}

export function originalProposalCreatedAt(invoice?: LuxorInvoice | null, now = new Date()) {
  const value = invoice?.original_proposal_created_at || invoice?.proposal_context?.original_proposal_created_at || invoice?.created_at
  const instant = typeof value === 'string' ? new Date(value) : now
  if (!Number.isFinite(instant.getTime())) throw new Error('The original proposal creation date could not be verified.')
  return typeof value === 'string' ? value : instant.toISOString()
}

/** Exclusive next midnight in Chicago; a creation day can be 23 or 25 hours. */
export function sameDayBookingDeadline(createdAt: string) {
  const created = new Date(createdAt)
  if (!Number.isFinite(created.getTime())) throw new Error('Invalid original proposal creation date.')
  return new Date(new Date(proposalExpirationInstant(luxorCalendarDate(created))).getTime() + 1000).toISOString()
}

export function sameDayBookingSnapshot(id: string, createdAt: string, now = new Date()): LuxorSameDayBookingSnapshot {
  const expiresAt = sameDayBookingDeadline(createdAt)
  return { id, name: SAME_DAY_BOOKING_NAME, code: SAME_DAY_BOOKING_CODE, original_created_at: createdAt,
    expires_at: expiresAt, coverage_amount: 0, status: now.getTime() < new Date(expiresAt).getTime() ? 'active' : 'expired', terms: SAME_DAY_BOOKING_TERMS }
}

export function sameDayBookingPromotion(invoice?: Pick<LuxorInvoice, 'proposal_context'> | null) {
  return invoice?.proposal_context?.same_day_booking || null
}

export function sameDayBookingExpired(invoice: LuxorInvoice, now = new Date()) {
  const promotion = sameDayBookingPromotion(invoice)
  if (!promotion || promotion.coverage_amount <= 0 || invoice.same_day_booking_status === 'eligible') return false
  return promotion.status === 'expired' || !Number.isFinite(new Date(promotion.expires_at).getTime()) || now.getTime() >= new Date(promotion.expires_at).getTime()
}

export function sameDayBookingRequiresRevision(invoice: LuxorInvoice, now = new Date()) {
  return Boolean(sameDayBookingPromotion(invoice)?.coverage_amount && invoice.same_day_booking_status !== 'eligible' &&
    (invoice.same_day_booking_status === 'review' || invoice.same_day_booking_status === 'revision_required' || sameDayBookingExpired(invoice, now)))
}

export function sameDayBookingCompletion(input: { originalCreatedAt: string; signedAt?: string | null; paidAt?: string | null; paidAmount: number; requiredAmount: number; timingVerified: boolean }) {
  const origin = new Date(input.originalCreatedAt).getTime()
  const deadline = new Date(sameDayBookingDeadline(input.originalCreatedAt)).getTime()
  const signed = new Date(input.signedAt || '').getTime()
  const paid = new Date(input.paidAt || '').getTime()
  const cents = (value: number) => Math.round(value * 100)
  if (!Number.isFinite(input.paidAmount) || !Number.isFinite(input.requiredAmount) || !Number.isSafeInteger(cents(input.paidAmount)) || !Number.isSafeInteger(cents(input.requiredAmount))) return 'review' as const
  if (!input.timingVerified || !Number.isFinite(signed) || !Number.isFinite(paid)) return 'review' as const
  if (signed < origin || paid < origin || signed >= deadline || paid >= deadline) return 'review' as const
  if (cents(input.requiredAmount) <= 0 || cents(input.paidAmount) < cents(input.requiredAmount)) return 'pending' as const
  return 'eligible' as const
}

/** Preview current unsigned pricing without altering the published/signed snapshot. */
export function withoutExpiredSameDayCoverage(invoice: LuxorInvoice, now = new Date()): LuxorInvoice {
  if (!sameDayBookingExpired(invoice, now) || invoice.proposal_accepted_at || invoice.booking_id) return invoice
  const coverage = Number(sameDayBookingPromotion(invoice)?.coverage_amount || 0)
  const context = JSON.parse(JSON.stringify(invoice.proposal_context || {})) as LuxorProposalContext
  for (const key of ['final_event_price', 'confirmed_luxor_total', 'venue_services_total', 'luxor_services_total', 'estimated_overall_investment']) {
    if (typeof context[key] === 'number') context[key] = Math.round((Number(context[key]) + coverage) * 100) / 100
  }
  context.same_day_booking = { ...context.same_day_booking!, coverage_amount: 0, status: 'expired' }
  if (context.payment_plan?.mode === 'pay_in_full' && typeof context.amount_due_to_book === 'number') context.amount_due_to_book = Math.round((context.amount_due_to_book + coverage) * 100) / 100
  if (typeof context.same_day_uncovered_amount_due_to_book === 'number') context.amount_due_to_book = context.same_day_uncovered_amount_due_to_book
  const snapshot = context.pricing_snapshot as Record<string, unknown> | undefined
  if (snapshot) {
    snapshot.final_event_price = context.final_event_price
    snapshot.tax_coverage_amount = 0
    snapshot.same_day_booking = context.same_day_booking
    if (typeof snapshot.estimated_overall_investment === 'number') snapshot.estimated_overall_investment = Math.round((snapshot.estimated_overall_investment + coverage) * 100) / 100
    snapshot.line_items = invoice.line_items.filter(item => item.pricingRole !== 'tax_coverage')
    const selected = snapshot.selected_package as Record<string, unknown> | undefined
    if (selected) { selected.final_event_price = context.final_event_price; selected.amount_due_to_book = context.amount_due_to_book; selected.tax_coverage_amount = 0; selected.line_items = snapshot.line_items }
    const confirmed = snapshot.confirmed_luxor as Record<string, unknown> | undefined
    if (confirmed) { confirmed.total = context.final_event_price; confirmed.final_event_price = context.final_event_price; confirmed.amount_due_to_book = context.amount_due_to_book; confirmed.tax_coverage_amount = 0; confirmed.line_items = snapshot.line_items }
    const totals = snapshot.totals as Record<string, unknown> | undefined
    if (totals) { totals.final_event_price = context.final_event_price; totals.confirmed_luxor_total = context.confirmed_luxor_total; totals.estimated_overall_investment = context.estimated_overall_investment; totals.amount_due_to_book = context.amount_due_to_book; totals.tax_coverage_amount = 0 }
  }
  return { ...invoice, total: Math.round((invoice.total + coverage) * 100) / 100,
    line_items: invoice.line_items.filter(item => item.pricingRole !== 'tax_coverage'), proposal_context: context }
}
