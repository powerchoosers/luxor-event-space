import 'server-only'

import {
  type LuxorProposalPricingConfig,
  type LuxorProposalResolvedPromotion,
  type LuxorProposalSelection,
} from './luxorProposalPricing'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorInvoice, LuxorPromotion } from './luxorInquiryTypes'
import { luxorCalendarDate } from './luxorProposalTerms'
import { originalProposalCreatedAt, sameDayBookingSnapshot, SAME_DAY_BOOKING_CODE } from './luxorSameDayBooking'
import { getWeekdayCustomRentalPolicy, getWeekdayCustomRentalSnapshot, isWeekdayCustomRentalDate, isWeekdayCustomRentalContext } from './luxorWeekdayRental'
import { weekdayRentalPolicyMatchesSnapshot } from './luxorWeekdayRentalPolicyMatchesSnapshot'
import { proposalBookingTiming } from './luxorProposalBookingTiming'
import { assertLuxorWeekdayRentalAdmission, LuxorWeekdayRentalError } from './luxorWeekdayRentalServer'

export type LuxorProposalPricingRecord = {
  id: string
  created_at: string
  updated_at: string
  version: number
  is_default: boolean
  config: LuxorProposalPricingConfig
}

export class LuxorPromotionSelectionError extends Error {
  constructor(message = 'The selected promotion is no longer active. Refresh promotions and choose an active saved promotion.') {
    super(message)
    this.name = 'LuxorPromotionSelectionError'
  }
}

/** Resolve pre-feature revisions without rewriting any historic record. */
export async function resolveLuxorOriginalProposalCreatedAt(existing?: LuxorInvoice | null) {
  let invoice = existing
  const seen = new Set<string>()
  for (let depth = 0; depth < 100; depth++) {
    if (!invoice || invoice.original_proposal_created_at || invoice.proposal_context?.original_proposal_created_at || !invoice.supersedes_invoice_id) return originalProposalCreatedAt(invoice)
    if (seen.has(invoice.id)) break
    seen.add(invoice.id)
    const [prior]: LuxorInvoice[] = await supabaseRest<LuxorInvoice[]>(`luxor_invoices?select=*&id=eq.${encodeURIComponent(invoice.supersedes_invoice_id)}&limit=1`)
    if (!prior || prior.invoice_kind !== 'event' || (prior.inquiry_id || null) !== (existing?.inquiry_id || null)) break
    invoice = prior
  }
  throw new LuxorPromotionSelectionError('The original proposal creation date could not be verified from its revision history. Resolve that history before applying same-day terms.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeConfig(value: unknown): LuxorProposalPricingConfig {
  // Final proposals must always use the owner-managed database catalog. Do
  // not silently fall back to code-held rates when the saved record is
  // malformed; that could quote a client from an out-of-date price sheet.
  if (!isRecord(value)) {
    throw new Error('The active pricing catalog is invalid. Update it before creating a final proposal.')
  }
  return value as LuxorProposalPricingConfig
}

export async function getDefaultLuxorProposalPricing(): Promise<LuxorProposalPricingRecord> {
  const rows = await supabaseRest<Array<Omit<LuxorProposalPricingRecord, 'config'> & { config: unknown }>>(
    'luxor_proposal_pricing?select=*&is_default=eq.true&limit=1',
  )
  const row = rows[0]
  if (!row) {
    throw new Error('No active pricing rules are available. A final price cannot be calculated until the Luxor pricing catalog is restored.')
  }
  return { ...row, config: normalizeConfig(row.config) }
}

export async function updateDefaultLuxorProposalPricing(input: {
  id: string
  version: number
  config: LuxorProposalPricingConfig
}) {
  const [updated] = await supabaseRest<LuxorProposalPricingRecord[]>(
    `luxor_proposal_pricing?select=*&id=eq.${encodeURIComponent(input.id)}&is_default=eq.true`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        config: input.config,
        version: Math.max(1, Math.floor(Number(input.version) || 1)),
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!updated) throw new Error('The default pricing configuration could not be updated.')
  return { ...updated, config: normalizeConfig(updated.config) }
}

function promotionIdFromSelection(selection: LuxorProposalSelection) {
  const value = selection.promotionId ?? selection.promotion_id
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Promotions are resolved on the server from their UUID. The client may send
 * only an id; it can never choose the percentage, dollar amount, or active
 * state that actually affects a proposal.
 */
export async function resolveLuxorProposalPromotion(selection: LuxorProposalSelection, existing?: LuxorInvoice | null): Promise<LuxorProposalResolvedPromotion | null> {
  const id = promotionIdFromSelection(selection)
  if (!id) return null
  const saved = existing?.proposal_context?.promotion
  if (saved?.id === id) return saved
  const rows = await supabaseRest<LuxorPromotion[]>(
    `luxor_promotions?select=*&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`,
  )
  const promotion = rows[0]
  if (!promotion || !promotion.active || !['percent', 'fixed', 'complimentary'].includes(promotion.discount_type) || (promotion.expires_on && promotion.expires_on < luxorCalendarDate())) {
    throw new LuxorPromotionSelectionError()
  }
  const value = Number(promotion.value)
  if (!Number.isFinite(value) || value <= 0 || (promotion.discount_type === 'percent' && value > 100)) {
    throw new LuxorPromotionSelectionError('The selected promotion has invalid saved terms. Update it before using it on a proposal.')
  }
  return {
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    discount_type: promotion.discount_type as LuxorProposalResolvedPromotion['discount_type'],
    value: Math.round(value * 100) / 100,
    expires_on: promotion.expires_on ?? null,
    complimentary_item: promotion.complimentary_item,
    complimentary_scope: promotion.complimentary_scope,
    complimentary_item_id: promotion.complimentary_item_id,
  }
}

/** Uses the saved catalog entry; clients cannot set tax coverage, origin, or expiry. */
export async function resolveLuxorSameDayBooking(selection: LuxorProposalSelection, existing?: LuxorInvoice | null, createdAt?: string) {
  const value = selection.taxCoveragePromotionId ?? selection.tax_coverage_promotion_id
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) return null
  if (process.env.LUXOR_SAME_DAY_BOOKING_ENABLED !== 'true') throw new LuxorPromotionSelectionError('Same-day booking is awaiting reviewed deployment and activation.')
  const origin = createdAt || await resolveLuxorOriginalProposalCreatedAt(existing)
  if (id === promotionIdFromSelection(selection)) throw new LuxorPromotionSelectionError('A promotion cannot be selected twice.')
  const saved = existing?.proposal_context?.same_day_booking
  if (saved?.id === id) return sameDayBookingSnapshot(id, origin)
  const [promotion] = await supabaseRest<LuxorPromotion[]>(`luxor_promotions?select=*&id=eq.${encodeURIComponent(id)}&active=eq.true&limit=1`)
  if (!promotion || promotion.discount_type !== 'tax_coverage' || promotion.code !== SAME_DAY_BOOKING_CODE ||
    (promotion.expires_on && promotion.expires_on < luxorCalendarDate())) throw new LuxorPromotionSelectionError()
  // An additive migration provides the authoritative payment guard. This
  // catalog entry is shipped inactive until reviewed deployment is complete.
  return sameDayBookingSnapshot(id, origin)
}

/** Never replace a saved draft's catalog with subsequently edited Settings. */
export async function getLuxorProposalPricingForInvoice(existing?: LuxorInvoice | null): Promise<LuxorProposalPricingRecord> {
  const snapshot = existing?.proposal_context?.pricing_snapshot
  const config = isRecord(snapshot) && isRecord(snapshot.pricing_config) ? snapshot.pricing_config : null
  if (config && existing) return { id: '', created_at: existing.created_at, updated_at: existing.updated_at, version: Number(existing.proposal_context?.pricing_config_version || 1), is_default: false, config }
  return getDefaultLuxorProposalPricing()
}

/** Expose a complete catalog policy only after the reviewed scheduling guard is ready. */
export function getLuxorWeekdayRentalClientPolicy(config: LuxorProposalPricingConfig) {
  if (process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED !== 'true' || process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY !== 'true') return null
  const policy = getWeekdayCustomRentalPolicy(config)
  if (policy?.pricing_version === 3 && process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_V3_BOOKING_GUARD_READY !== 'true') return null
  return policy?.booking_policy === 'one_per_date' && policy.selection_surface === 'portal_only' ? policy : null
}

/** Clients select times; saved owner rules and deployment readiness select the pricing mode. */
export function assertLuxorWeekdayRentalSelection(selection: LuxorProposalSelection, config: LuxorProposalPricingConfig, requireCustomOnWeekdays = false) {
  const requested = typeof selection.rentalPeriod === 'string' && selection.rentalPeriod.toLowerCase().replace(/[^a-z]/g, '') === 'custom'
  const policy = getLuxorWeekdayRentalClientPolicy(config)
  const savedPolicy = getWeekdayCustomRentalPolicy(config)
  if (requested) {
    assertLuxorWeekdayRentalAdmission()
    if (selection.rentalPeriod !== 'custom') throw new LuxorWeekdayRentalError('Select a valid custom rental period.')
    if (savedPolicy?.booking_policy === 'multiple_per_date') throw new LuxorWeekdayRentalError('Multiple weekday events require a separate approved scheduling and reservation decision.')
    if (savedPolicy?.selection_surface === 'public_and_portal') throw new LuxorWeekdayRentalError('Public weekday time selection must be implemented and reviewed before this policy can open.')
    if (!policy || config.pricing_mode !== 'venue_plus_preferred_vendor_estimates') throw new LuxorWeekdayRentalError('Custom weekday rentals require a complete approved policy in the current venue catalog.')
    for (const [camel, snake] of [[selection.guestArrivalTime, selection.guest_arrival_time], [selection.eventEndTime, selection.event_end_time]]) {
      if (typeof camel === 'string' && typeof snake === 'string' && camel.trim() !== snake.trim()) throw new LuxorWeekdayRentalError('The rental times changed. Refresh the proposal and select the times again.')
    }
  } else if (requireCustomOnWeekdays && config.pricing_mode === 'venue_plus_preferred_vendor_estimates' && isWeekdayCustomRentalDate(selection.eventDate) &&
    process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_ENABLED === 'true' && process.env.LUXOR_WEEKDAY_CUSTOM_RENTAL_BOOKING_GUARD_READY === 'true') {
    const costs = isRecord(config.luxor_costs) ? config.luxor_costs : config
    if (isRecord(costs.weekday_custom_rental) && costs.weekday_custom_rental.enabled === true) {
      throw new LuxorWeekdayRentalError(policy ? 'Select custom weekday rental times before saving this proposal.' : 'The weekday rental policy is not ready for publication. Existing saved proposals keep their original terms.')
    }
  }
}

/** Publishing a new custom draft must not bypass readiness through the delivery route. */
export function assertLuxorWeekdayRentalPublication(invoice: LuxorInvoice) {
  const context = invoice.proposal_context
  // Owner-editable status labels alone do not prove a proposal was published.
  if (invoice.invoice_kind !== 'event' || !context || !isWeekdayCustomRentalContext(context) || invoice.proposal_sent_at || invoice.proposal_accepted_at) return
  const snapshot = getWeekdayCustomRentalSnapshot(context.weekday_custom_rental)
  const pricingSnapshot = isRecord(context.pricing_snapshot) ? context.pricing_snapshot : null
  const config = pricingSnapshot && isRecord(pricingSnapshot.pricing_config) ? pricingSnapshot.pricing_config : null
  if (!snapshot || !config) throw new LuxorWeekdayRentalError('The saved custom rental pricing snapshot is invalid. Create a revised proposal.')
  const times = proposalBookingTiming(context)
  assertLuxorWeekdayRentalSelection({ rentalPeriod: 'custom', eventDate: context.event_date, guestArrivalTime: times.startTime, eventEndTime: times.endTime }, config, true)
  const policy = getWeekdayCustomRentalPolicy(config)
  if (!policy || !weekdayRentalPolicyMatchesSnapshot(policy, snapshot)) {
    throw new LuxorWeekdayRentalError('The saved custom rental rules do not match its pricing snapshot. Create a revised proposal.')
  }
}
