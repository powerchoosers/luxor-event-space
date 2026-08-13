import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  getDefaultLuxorProposalPricing,
  updateDefaultLuxorProposalPricing,
} from '@/lib/luxorProposalPricingServer'
import {
  calculateLuxorProposal,
  type LuxorProposalPricingConfig,
  type LuxorProposalSelection,
} from '@/lib/luxorProposalPricing'

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
 * package, event details, allowed add-ons, and an explicit approved discount.
 */
export async function POST(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const selection = object(body)?.selection
    if (!object(selection)) return NextResponse.json({ error: 'Proposal selection is required.' }, { status: 400 })
    const pricing = await getDefaultLuxorProposalPricing()
    const calculation = calculateLuxorProposal(selection as LuxorProposalSelection, pricing.config)
    return NextResponse.json({ pricing_config_version: pricing.version, calculation })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Pricing configuration required — administrator review.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const record = object(body)
    const id = String(record?.id || '').trim()
    const config = object(record?.config)
    if (!id || !config) return NextResponse.json({ error: 'A pricing configuration id and configuration are required.' }, { status: 400 })

    // A dry run prevents an owner from saving a config that cannot calculate a
    // normal package. More detailed scenario validation is returned to the UI.
    const trial = calculateLuxorProposal({
      packageId: 'rental_only',
      eventDate: '2027-01-05',
      guestCount: 50,
      rentalPeriod: 'evening',
      addOns: [],
      // These two choices are deliberately proposal-specific—not defaults
      // hidden in the price catalog. They let this configuration health check
      // validate the rate rules without requiring a tax or payment-plan
      // policy to be baked into every pricing record.
      taxRate: 0,
      paymentPlan: {
        mode: 'deposit_and_balance',
        booking_payment_percent: 25,
        final_payment_due_days_before_event: 30,
      },
    } as LuxorProposalSelection, config as LuxorProposalPricingConfig)
    if (Array.isArray(trial.errors) && trial.errors.length) {
      return NextResponse.json({ error: 'Pricing configuration required — administrator review.', details: trial.errors }, { status: 400 })
    }
    const current = await getDefaultLuxorProposalPricing()
    if (current.id !== id) return NextResponse.json({ error: 'The active pricing configuration changed. Refresh and try again.' }, { status: 409 })
    return NextResponse.json(await updateDefaultLuxorProposalPricing({
      id,
      version: Number(current.version || 1) + 1,
      config: config as LuxorProposalPricingConfig,
    }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update pricing configuration.' }, { status: 500 })
  }
}
