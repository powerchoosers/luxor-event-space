import 'server-only'

import type { LuxorInvoice } from './luxorInquiryTypes'
import { calculateLuxorProposal, type LuxorProposalCalculation, type LuxorProposalSelection } from './luxorProposalPricing'
import {
  assertLuxorWeekdayRentalSelection,
  getLuxorProposalPricingForInvoice,
  hasFrozenLegacyCustomTimeProposal,
  resolveLuxorOriginalProposalCreatedAt,
  resolveLuxorProposalPromotion,
  resolveLuxorSameDayBooking,
} from './luxorProposalPricingServer'
import { normalizeLuxorProposalPackageTierId } from './luxorProposalPackages'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Recalculate the comparison from the saved proposal's own selection and frozen catalog. */
export async function calculateLuxorProposalBreakdownForInvoice(invoice: LuxorInvoice): Promise<{
  selection: LuxorProposalSelection
  calculation: LuxorProposalCalculation
}> {
  const context = invoice.proposal_context
  const savedPricing = isRecord(context?.pricing_snapshot) ? context.pricing_snapshot : null
  if (!context || !savedPricing || !isRecord(savedPricing.pricing_config)) {
    throw new Error('This saved proposal has no frozen pricing catalog. Create a new proposal before sending its breakdown.')
  }
  if (Number(context.proposal_pricing_policy_version || 0) < 4) {
    throw new Error('Package breakdown emails require the current four-package proposal format. Create a new proposal to continue.')
  }

  const savedSelection = isRecord(context.pricing_selection) ? context.pricing_selection : {}
  const packageTierId = normalizeLuxorProposalPackageTierId(
    savedSelection.packageTierId ?? savedSelection.package_tier_id ?? savedSelection.luxorPackageId ?? savedSelection.luxor_package_id,
  )
  if (!packageTierId) throw new Error('The selected package is missing from this saved proposal. Refresh it before sending a breakdown.')
  const selection: LuxorProposalSelection = {
    ...savedSelection,
    packageId: 'luxor_venue_proposal',
    packageTierId,
    package_tier_id: packageTierId,
    proposalPricingPolicyVersion: 4,
    proposal_pricing_policy_version: 4,
    eventDate: String(context.event_date || savedSelection.eventDate || ''),
    guestCount: Number(context.expected_guest_count ?? savedSelection.guestCount ?? 0),
    eventType: String(context.event_type || invoice.event_type || savedSelection.eventType || ''),
    rentalPeriod: String(context.rental_period || savedSelection.rentalPeriod || ''),
    rentalStartTime: String(context.rental_start_time || context.start_time || savedSelection.rentalStartTime || savedSelection.rental_start_time || ''),
    rentalEndTime: String(context.rental_end_time || context.end_time || savedSelection.rentalEndTime || savedSelection.rental_end_time || ''),
    guestArrivalTime: String(context.guest_arrival_time || context.guestArrivalTime || savedSelection.guestArrivalTime || savedSelection.guest_arrival_time || ''),
    eventEndTime: String(context.event_end_time || context.eventEndTime || savedSelection.eventEndTime || savedSelection.event_end_time || ''),
    taxRate: Number(invoice.tax_rate || 0),
    paymentPlan: context.payment_plan || savedSelection.paymentPlan || savedSelection.payment_plan || null,
    ...(context.promotion?.id ? { promotionId: context.promotion.id } : {}),
    ...(context.same_day_booking?.id ? { taxCoveragePromotionId: context.same_day_booking.id } : {}),
  }
  const pricing = await getLuxorProposalPricingForInvoice(invoice)
  assertLuxorWeekdayRentalSelection(selection, pricing.config, true, hasFrozenLegacyCustomTimeProposal(invoice))
  const originalCreatedAt = await resolveLuxorOriginalProposalCreatedAt(invoice)
  const [promotion, sameDayBooking] = await Promise.all([
    resolveLuxorProposalPromotion(selection, invoice),
    resolveLuxorSameDayBooking(selection, invoice, originalCreatedAt),
  ])
  const calculation = calculateLuxorProposal(selection, pricing.config, { promotion, sameDayBooking })
  if (!calculation.valid || Math.abs(Number(calculation.total) - Number(invoice.total)) >= 0.005) {
    throw new Error('The saved proposal no longer matches its frozen price calculation. Create a revised proposal before sending a breakdown.')
  }
  return { selection, calculation }
}
