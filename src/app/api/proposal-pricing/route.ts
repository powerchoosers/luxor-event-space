import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember } from '@/lib/luxorPortalAccess'
import {
  getDefaultLuxorProposalPricing,
  LuxorPromotionSelectionError,
  resolveLuxorProposalPromotion,
  updateDefaultLuxorProposalPricing,
} from '@/lib/luxorProposalPricingServer'
import {
  calculateLuxorProposal,
  type LuxorProposalPricingConfig,
  type LuxorProposalSelection,
} from '@/lib/luxorProposalPricing'
import { catalogNumber, catalogValue } from '@/lib/luxorPricingCatalog'

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export async function GET() {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    return NextResponse.json(await getDefaultLuxorProposalPricing())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing configuration required — administrator review.' }, { status: 500 })
  }
}

/**
 * Server-authoritative calculation endpoint for the owner proposal builder.
 * It never accepts client-supplied totals or unit prices: just the selected
 * package, event details, allowed add-ons, and a saved promotion id. It
 * resolves saved promotion terms itself rather than trusting discount values
 * from the browser.
 */
export async function POST(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const selection = object(body)?.selection
    if (!object(selection)) return NextResponse.json({ error: 'Proposal selection is required.' }, { status: 400 })
    const pricing = await getDefaultLuxorProposalPricing()
    const promotion = await resolveLuxorProposalPromotion(selection as LuxorProposalSelection)
    const calculation = calculateLuxorProposal(selection as LuxorProposalSelection, pricing.config, { promotion })
    return NextResponse.json({ pricing_config_version: pricing.version, calculation })
  } catch (error) {
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

    // Validate every rental day/period plus every package and fee tier. This
    // prevents a save that looks healthy for one quote but breaks another.
    const paymentPlan = { mode: 'deposit_and_balance', booking_payment_percent: 25, final_payment_due_days_before_event: 30 }
    const validationSelections: LuxorProposalSelection[] = [
      ...[
        ['2027-01-04', 'monday_thursday'],
        ['2027-01-08', 'friday'],
        ['2027-01-09', 'saturday'],
        ['2027-01-10', 'sunday'],
      ].flatMap(([eventDate]) => ['morning', 'evening', 'full_day'].map((rentalPeriod) => ({
        packageId: 'rental_only', eventDate, guestCount: 50, rentalPeriod, addOns: [], taxRate: 0, paymentPlan,
      }))),
      ...[50, 100, 175].flatMap((guestCount) => ['bronze_essentials', 'silver_premier', 'gold_all_inclusive'].map((packageId) => ({
        packageId, eventDate: '2027-01-08', guestCount, rentalPeriod: 'full_day', addOns: [], taxRate: 0, paymentPlan,
      }))),
    ]
    const structuralErrors: string[] = []
    for (const period of ['morning', 'evening', 'full_day']) {
      for (const boundary of ['start', 'end']) {
        if (!/^\d{2}:\d{2}$/.test(String(catalogValue(config, 'rental_access', period, boundary) || ''))) structuralErrors.push(`Set a valid ${period.replace('_', ' ')} ${boundary} time.`)
      }
    }
    for (const day of ['monday_thursday', 'friday', 'saturday', 'sunday']) {
      for (const period of ['morning', 'evening', 'full_day']) {
        const amount = catalogNumber(config, 'rental_rates', day, period)
        if (amount === undefined || amount <= 0) structuralErrors.push(`Set a rental rate for ${day.replace('_', ' ')} ${period.replace('_', ' ')}.`)
      }
    }
    if (catalogValue(config, 'rental_rate_rules', 'monday_thursday', 'morning', 'pricing_type') === 'hourly') {
      const hourlyRate = catalogNumber(config, 'rental_rate_rules', 'monday_thursday', 'morning', 'hourly_rate')
      const minimumHours = catalogNumber(config, 'rental_rate_rules', 'monday_thursday', 'morning', 'minimum_hours')
      if (hourlyRate === undefined || hourlyRate <= 0) structuralErrors.push('Set the Monday–Thursday daytime hourly rate.')
      if (minimumHours === undefined || minimumHours <= 0) structuralErrors.push('Set the Monday–Thursday daytime minimum hours.')
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
    return NextResponse.json(await updateDefaultLuxorProposalPricing({
      id,
      version: Number(current.version || 1) + 1,
      config: config as LuxorProposalPricingConfig,
    }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update pricing configuration.' }, { status: 500 })
  }
}
