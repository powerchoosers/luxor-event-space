import { NextRequest, NextResponse } from 'next/server'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { assertPublicPackageStartingPriceConfig } from '@/lib/luxorPublicPackageStartingPrices'
import {
  calculatePublicPackagesQuote,
  type PublicPackagesConfiguratorInput,
  type PublicPackagesRentalPeriod,
} from '@/lib/luxorPublicPackagesConfigurator'
import {
  decodePackagesDraftToken,
  encodePackagesDraftToken,
  getPackagesInquiryDraft,
  savePackagesInquiryDraft,
  setPackagesDraftCookie,
} from '@/lib/luxorPublicPackagesInquiryDraftServer'
import { LUXOR_PUBLIC_PACKAGE_TIER_IDS } from '@/lib/luxorProposalPackages'
import { isPublicEventDateSelectable } from '@/lib/publicEventDate'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function parseInput(body: Record<string, unknown> | null): PublicPackagesConfiguratorInput | null {
  if (!body) return null
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim() : ''
  const guestCount = Number(body.guestCount)
  const rentalPeriod = typeof body.rentalPeriod === 'string' ? body.rentalPeriod.trim() : ''
  const packageTierId = typeof body.packageTierId === 'string' ? body.packageTierId.trim().toLowerCase() : ''
  if (!isPublicEventDateSelectable(eventDate, body.browserTimeZone)) return null
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > LUXOR_MAX_GUESTS) return null
  if (!['morning', 'evening', 'full_day'].includes(rentalPeriod)) return null
  if (!LUXOR_PUBLIC_PACKAGE_TIER_IDS.includes(packageTierId as typeof LUXOR_PUBLIC_PACKAGE_TIER_IDS[number])) return null
  const decorAddOnQuantities: Record<string, number> = {}
  const rawQuantities = object(body.decorAddOnQuantities)
  if (rawQuantities) {
    for (const [key, value] of Object.entries(rawQuantities)) {
      const quantity = Number(value)
      if (Number.isInteger(quantity) && quantity > 0) decorAddOnQuantities[key] = quantity
    }
  }
  return {
    eventDate,
    eventType: typeof body.eventType === 'string' ? body.eventType.trim() : null,
    guestCount,
    rentalPeriod: rentalPeriod as PublicPackagesRentalPeriod,
    packageTierId: packageTierId as PublicPackagesConfiguratorInput['packageTierId'],
    decorAddOnQuantities,
    browserTimeZone: typeof body.browserTimeZone === 'string' ? body.browserTimeZone : undefined,
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim()
      || request.cookies.get('luxor_packages_inquiry_draft')?.value
      || ''
    const decoded = token ? decodePackagesDraftToken(token) : null
    if (!decoded) return NextResponse.json({ error: 'No saved event configuration was found.' }, { status: 404 })
    const draft = await getPackagesInquiryDraft(decoded.draftId)
    if (!draft) return NextResponse.json({ error: 'Your event configuration expired.' }, { status: 404 })
    return NextResponse.json({
      token,
      draft: {
        id: draft.id,
        locale: draft.locale,
        configuratorInput: draft.configurator_input,
        quote: draft.quote_snapshot,
        pricingConfigVersion: draft.pricing_config_version,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load saved event configuration.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = object(await request.json().catch(() => null))
    const input = parseInput(body)
    if (!input) return NextResponse.json({ error: 'Complete your event details before continuing to inquiry.' }, { status: 400 })
    const locale = body?.locale === 'es' ? 'es' : 'en'
    const pricing = await getDefaultLuxorProposalPricing()
    const configError = assertPublicPackageStartingPriceConfig(pricing.config)
    if (configError) return NextResponse.json({ error: configError }, { status: 503 })
    const quote = calculatePublicPackagesQuote(input, pricing.config, pricing.version)
    if (quote.errors.length || quote.totals.totalEstimate === null) {
      return NextResponse.json({ error: quote.errors[0] || 'Pricing is unavailable for this event.' }, { status: 409 })
    }
    const draft = await savePackagesInquiryDraft({
      locale,
      configuratorInput: input,
      quote,
      pricingConfigVersion: pricing.version,
    })
    const token = encodePackagesDraftToken(draft.id)
    await setPackagesDraftCookie(token)
    return NextResponse.json({
      token,
      draftId: draft.id,
      quote: {
        summaryLines: quote.summaryLines,
        totals: quote.totals,
        paymentSchedulePreview: quote.paymentSchedulePreview,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save event configuration.' }, { status: 500 })
  }
}
