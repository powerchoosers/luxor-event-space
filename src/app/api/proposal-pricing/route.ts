import { getInvoice } from '@/lib/luxorInvoicesServer'
import { luxorCalendarDate, proposalValidThrough } from '@/lib/luxorProposalTerms'
import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { supabaseRest } from '@/lib/supabaseRestServer'
import type { LuxorInvoice } from '@/lib/luxorInquiryTypes'
import {
  getDefaultLuxorProposalPricing,
  getLuxorProposalPricingForInvoice,
  hasFrozenLegacyCustomTimeProposal,
  LuxorPromotionSelectionError,
  resolveLuxorProposalPromotion,
  resolveLuxorSameDayBooking,
  resolveLuxorOriginalProposalCreatedAt,
  updateDefaultLuxorProposalPricing,
  getLuxorWeekdayRentalClientPolicy,
  assertLuxorWeekdayRentalSelection,
} from '@/lib/luxorProposalPricingServer'
import {
  calculateLuxorProposal,
  type LuxorProposalPricingConfig,
  type LuxorProposalSelection,
} from '@/lib/luxorProposalPricing'
import { catalogNumber, catalogValue } from '@/lib/luxorPricingCatalog'
import { OFFICIAL_DECOR_SERVICES } from '@/lib/luxorDecorCatalog'
import { validateWeekdayCustomRentalPolicy } from '@/lib/luxorWeekdayRental'
import { LuxorWeekdayRentalError } from '@/lib/luxorWeekdayRentalServer'
import { getLuxorCustomTimeRentalPolicyV4, validateLuxorCustomTimeRentalV4Config } from '@/lib/luxorCustomTimeRentalV4'

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export async function GET() {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const customTimeV4Ready = process.env.LUXOR_CUSTOM_TIME_V4_READY === 'true'
      && process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY === 'true'
    return NextResponse.json({ ...await getDefaultLuxorProposalPricing(), custom_time_v4_ready: customTimeV4Ready })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing configuration required — administrator review.' }, { status: 500 })
  }
}

/**
 * Server-authoritative calculation endpoint for the owner proposal builder.
 * It never accepts client-supplied totals or unit prices: just the selected
 * confirmed Luxor venue facts, optional preferred-vendor estimates, and a saved promotion id. It
 * resolves saved promotion terms itself rather than trusting discount values
 * from the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const selection = object(body)?.selection
    if (!object(selection)) return NextResponse.json({ error: 'Proposal selection is required.' }, { status: 400 })
    const testRunId = typeof body.testRunId === 'string' ? body.testRunId : ''
    let existingTestInvoice: LuxorInvoice | null = null
    if (testRunId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testRunId)) {
        return NextResponse.json({ error: 'A valid test run ID is required.' }, { status: 400 })
      }
      const member = await getLuxorPortalMember(session.email)
      if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) {
        return NextResponse.json({ error: 'Owner or admin access required for test proposals.' }, { status: 403 })
      }
      const [run] = await supabaseRest<Array<{ id: string }>>(
        `luxor_test_runs?select=id&id=eq.${encodeURIComponent(testRunId)}&test_lead_id=eq.00b264d6-a3fb-4ea3-9142-415f76385c39&status=eq.in_progress&limit=1`,
      )
      if (!run) return NextResponse.json({ error: 'Choose an active permanent test lead run.' }, { status: 404 })
      const [artifact] = await supabaseRest<Array<{ status: string; details: Record<string, unknown> }>>(
        `luxor_test_run_artifacts?select=status,details&test_run_id=eq.${encodeURIComponent(testRunId)}&artifact_type=eq.proposal&limit=1`,
      )
      if (artifact && !['simulated', 'drafted'].includes(artifact.status)) {
        return NextResponse.json({ error: 'This test proposal is already published.' }, { status: 409 })
      }
      const invoice = object(artifact?.details?.invoice)
      if (invoice) existingTestInvoice = invoice as unknown as LuxorInvoice
    }
    const invoiceId = testRunId ? '' : typeof body.invoiceId === 'string' ? body.invoiceId : ''
    const revisionId = testRunId ? '' : typeof body.supersedesInvoiceId === 'string' ? body.supersedesInvoiceId : ''
    const existing = testRunId ? existingTestInvoice : invoiceId || revisionId ? await getInvoice(invoiceId || revisionId) : null
    if ((invoiceId || revisionId) && !existing) return NextResponse.json({ error: 'Proposal not found.' }, {status: 404})
    if (revisionId && existing?.invoice_kind !== 'event') return NextResponse.json({ error: 'Only an event proposal can be revised.' }, {status: 409})
    if (invoiceId && existing && (existing.invoice_kind !== 'event' || existing.status !== 'draft' || existing.price_locked_at || existing.proposal_accepted_at || existing.proposal_sent_at)) return NextResponse.json({error: 'This proposal is locked. Create a revision.'}, {status: 409})
    const pricing = await getLuxorProposalPricingForInvoice(existing)
    const historicalLegacyCustomTime = hasFrozenLegacyCustomTimeProposal(existing)
    assertLuxorWeekdayRentalSelection(selection as LuxorProposalSelection, pricing.config, false, historicalLegacyCustomTime)
    const promotion = await resolveLuxorProposalPromotion(selection as LuxorProposalSelection, existing)
    const originalCreatedAt = await resolveLuxorOriginalProposalCreatedAt(existing)
    const sameDayBooking = await resolveLuxorSameDayBooking(selection as LuxorProposalSelection, existing, originalCreatedAt)
    const calculation = calculateLuxorProposal(selection as LuxorProposalSelection, pricing.config, { promotion, sameDayBooking })
    const customTimeV4Ready = process.env.LUXOR_CUSTOM_TIME_V4_READY === 'true'
      && process.env.LUXOR_CUSTOM_TIME_V4_BOOKING_GUARD_READY === 'true'
    const customPolicy = historicalLegacyCustomTime
      ? getLuxorWeekdayRentalClientPolicy(pricing.config, true)
      : customTimeV4Ready ? null : getLuxorWeekdayRentalClientPolicy(pricing.config)
    const customTimeV4Policy = customTimeV4Ready && !historicalLegacyCustomTime
      ? getLuxorCustomTimeRentalPolicyV4(pricing.config, (selection as LuxorProposalSelection).eventDate)
      : null
    const createdOn = luxorCalendarDate(new Date(originalCreatedAt))
    Object.assign(calculation.context, { original_proposal_created_at: originalCreatedAt, proposal_created_on: createdOn, valid_through: proposalValidThrough(createdOn, promotion) })
    const luxorCosts = object(pricing.config.luxor_costs) || pricing.config
    return NextResponse.json({
      pricing_config_version: pricing.version,
      rental_access: object(luxorCosts.rental_access) || {},
      weekday_custom_rental: customPolicy,
      custom_time_rental_v4_policy: customTimeV4Policy,
      calculation,
    })
  } catch (error) {
    if (error instanceof LuxorWeekdayRentalError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof LuxorPromotionSelectionError) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing configuration required — administrator review.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const member = await getLuxorPortalMember(session.email)
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ error: 'Owner or administrator access is required to update pricing.' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const record = object(body)
    const id = String(record?.id || '').trim()
    const version = Number(record?.version)
    const config = object(record?.config)
    if (!id || !Number.isSafeInteger(version) || version < 1 || !config) return NextResponse.json({ error: 'A pricing configuration id, version, and configuration are required.' }, { status: 400 })

    // Validate every rental day/period plus representative vendor-estimate
    // guest counts. This prevents a save that looks healthy for one quote but breaks another.
    const paymentPlan = { mode: 'deposit_and_balance', booking_payment_percent: 25, final_payment_due_days_before_event: 30 }
    const validationSelections: LuxorProposalSelection[] = [
      ...[
        ['2027-01-04', 'monday_thursday'],
        ['2027-01-08', 'friday'],
        ['2027-01-09', 'saturday'],
        ['2027-01-10', 'sunday'],
      ].flatMap(([eventDate]) => ['morning', 'evening', 'full_day'].map((rentalPeriod) => ({
        packageId: 'rental_only', eventDate, guestCount: 50, rentalPeriod, addOns: [], taxRate: 0, paymentPlan,
      })),
      ...[50, 100, 175].map((guestCount) => ({
        packageId: 'rental_only', eventDate: '2027-01-08', guestCount, rentalPeriod: 'full_day', addOns: ['essential_decor', 'buffet_catering', 'dj', 'photo_booth_signature', 'bartender_service'], taxRate: 0, paymentPlan,
      }))),
    ]
    const luxorCosts = object(config.luxor_costs) || config
    const structuralErrors: string[] = []
    structuralErrors.push(...validateWeekdayCustomRentalPolicy(config))
    structuralErrors.push(...validateLuxorCustomTimeRentalV4Config(config))
    const bookingPayment = catalogNumber(luxorCosts, 'booking_payment', 'amount')
    if (bookingPayment === undefined || bookingPayment < 0.5) structuralErrors.push('Set a booking payment of at least $0.50.')
    for (const day of ['monday_thursday', 'friday', 'saturday', 'sunday']) {
      const rate = catalogNumber(luxorCosts, 'additional_time_rates', day)
      if (rate === undefined || rate < 0) structuralErrors.push('Set the additional-hour rate for ' + day.replace('_', ' ') + '.')
    }
    for (const period of ['morning', 'evening', 'full_day']) {
      for (const boundary of ['start', 'end']) {
        if (!/^\d{2}:\d{2}$/.test(String(catalogValue(luxorCosts, 'rental_access', period, boundary) || ''))) structuralErrors.push(`Set a valid ${period.replace('_', ' ')} ${boundary} time.`)
      }
    }
    for (const day of ['monday_thursday', 'friday', 'saturday', 'sunday']) {
      for (const period of ['morning', 'evening', 'full_day']) {
        const amount = catalogNumber(luxorCosts, 'rental_rates', day, period)
        if (amount === undefined || amount <= 0) structuralErrors.push(`Set a rental rate for ${day.replace('_', ' ')} ${period.replace('_', ' ')}.`)
      }
    }
    if (catalogValue(luxorCosts, 'rental_rate_rules', 'monday_thursday', 'morning', 'pricing_type') === 'hourly') {
      const hourlyRate = catalogNumber(luxorCosts, 'rental_rate_rules', 'monday_thursday', 'morning', 'hourly_rate')
      const minimumHours = catalogNumber(luxorCosts, 'rental_rate_rules', 'monday_thursday', 'morning', 'minimum_hours')
      if (hourlyRate === undefined || hourlyRate <= 0) structuralErrors.push('Set the Monday–Thursday daytime hourly rate.')
      if (minimumHours === undefined || minimumHours <= 0) structuralErrors.push('Set the Monday–Thursday daytime minimum hours.')
    }
    const securityHourlyRate = catalogNumber(luxorCosts, 'required_fees', 'security', 'hourly_rate')
    const securityMinHours = catalogNumber(luxorCosts, 'required_fees', 'security', 'minimum_hours')
    if (securityHourlyRate !== undefined && (securityHourlyRate <= 0 || !Number.isFinite(securityHourlyRate))) {
      structuralErrors.push('Set a valid security hourly rate.')
    }
    if (securityMinHours !== undefined && (securityMinHours <= 0 || !Number.isFinite(securityMinHours))) {
      structuralErrors.push('Set valid security minimum hours.')
    }
    const validationErrors = Array.from(new Set([...structuralErrors, ...validationSelections.flatMap((selection) => {
      const calculation = calculateLuxorProposal(selection, config as LuxorProposalPricingConfig)
      return [...calculation.calculationErrors, ...calculation.addOnQuotes.flatMap((quote) => quote.error ? [quote.error] : [])]
    })]))
    if (validationErrors.length) {
      return NextResponse.json({ error: 'One or more pricing lines are missing or invalid.', details: validationErrors }, { status: 400 })
    }
    const current = await getDefaultLuxorProposalPricing()
    if (current.id !== id || current.version !== version) return NextResponse.json({ error: 'The active pricing configuration changed. Refresh and try again.' }, { status: 409 })
    const currentCosts = object(current.config.luxor_costs) || current.config
    if (currentCosts.official_decor || luxorCosts.official_decor) {
      for (const service of OFFICIAL_DECOR_SERVICES) {
        const amount = catalogNumber(luxorCosts, 'official_decor', service.id, 'amount')
        if (amount === undefined || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
          return NextResponse.json({ error: `Set a valid official Luxor price for ${service.name}.` }, { status: 400 })
        }
      }
    }
    return NextResponse.json(await updateDefaultLuxorProposalPricing({
      id,
      version: Number(current.version || 1) + 1,
      config: config as LuxorProposalPricingConfig,
    }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update pricing configuration.' }, { status: 500 })
  }
}
