import { NextRequest, NextResponse } from 'next/server'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { assertPublicPackageStartingPriceConfig } from '@/lib/luxorPublicPackageStartingPrices'
import { isLuxorRentalPeriodOpen } from '@/lib/luxorAvailability'
import { isPublicEventDateSelectable } from '@/lib/publicEventDate'
import { LUXOR_PUBLIC_PACKAGE_TIER_IDS } from '@/lib/luxorProposalPackages'
import {
  calculatePublicPackagesQuote,
  listPublicPackageEnhancementOptions,
  getPublicPackageGuestCountBounds,
  listPublicPackageRentalPeriodOptions,
  type PublicPackagesConfiguratorInput,
  type PublicPackagesRentalPeriod,
} from '@/lib/luxorPublicPackagesConfigurator'
import { annotateTestBookings, listLuxorBookings } from '@/lib/luxorBookingsServer'
import { annotateLuxorReviewAvailability } from '@/lib/luxorAvailabilityReviewServer'
import { buildLuxorAvailabilityCalendar } from '@/lib/luxorAvailability'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export async function GET(request: NextRequest) {
  try {
    const locale = request.nextUrl.searchParams.get('locale') === 'es' ? 'es' : 'en'
    const pricing = await getDefaultLuxorProposalPricing()
    const configError = assertPublicPackageStartingPriceConfig(pricing.config)
    if (configError) return NextResponse.json({ error: configError }, { status: 503 })
    return NextResponse.json({
      pricingConfigVersion: pricing.version,
      guestCount: getPublicPackageGuestCountBounds(pricing.config),
      rentalPeriods: listPublicPackageRentalPeriodOptions(locale),
      packageTiers: LUXOR_PUBLIC_PACKAGE_TIER_IDS,
      policyVersion: 4,
    }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Package pricing is temporarily unavailable.' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = object(await request.json().catch(() => null))
    const locale = body?.locale === 'es' ? 'es' : 'en'
    const input = parseConfiguratorInput(body)
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 })

    const pricing = await getDefaultLuxorProposalPricing()
    const configError = assertPublicPackageStartingPriceConfig(pricing.config)
    if (configError) return NextResponse.json({ error: configError }, { status: 503 })

    const availability = buildLuxorAvailabilityCalendar(
      await annotateLuxorReviewAvailability(await annotateTestBookings(await listLuxorBookings(1000, true))),
    )
    const periodOpen = isLuxorRentalPeriodOpen(
      availability,
      input.value.eventDate,
      input.value.rentalPeriod,
    )
    const quote = calculatePublicPackagesQuote(input.value, pricing.config, pricing.version)
    const enhancements = listPublicPackageEnhancementOptions(pricing.config, input.value.packageTierId)
    return NextResponse.json({
      locale,
      quote: {
        summaryLines: quote.summaryLines,
        totals: quote.totals,
        paymentSchedulePreview: quote.paymentSchedulePreview,
        errors: [...quote.errors, ...(periodOpen ? [] : ['This rental period is not available on the selected date.'])],
        enhancementOptions: enhancements,
      },
      pricingConfigVersion: pricing.version,
      availabilityForDate: periodOpen ? 'open' : 'blocked',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to calculate this package price.' }, { status: 500 })
  }
}

function parseConfiguratorInput(body: Record<string, unknown> | null):
  { value: PublicPackagesConfiguratorInput } | { error: string } {
  if (!body) return { error: 'Request body is required.' }
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim() : ''
  const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : ''
  const guestCount = Number(body.guestCount)
  const rentalPeriod = typeof body.rentalPeriod === 'string' ? body.rentalPeriod.trim() : ''
  const packageTierId = typeof body.packageTierId === 'string' ? body.packageTierId.trim().toLowerCase() : ''
  const browserTimeZone = typeof body.browserTimeZone === 'string' ? body.browserTimeZone : undefined

  if (!isPublicEventDateSelectable(eventDate, browserTimeZone)) {
    return { error: 'Choose a valid event date from today through 36 months from today.' }
  }
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > LUXOR_MAX_GUESTS) {
    return { error: 'Choose a guest count between 1 and 180.' }
  }
  if (!['morning', 'evening', 'full_day'].includes(rentalPeriod)) {
    return { error: 'Choose a rental period.' }
  }
  if (!LUXOR_PUBLIC_PACKAGE_TIER_IDS.includes(packageTierId as typeof LUXOR_PUBLIC_PACKAGE_TIER_IDS[number])) {
    return { error: 'Choose Essentials, Signature, or Luxor.' }
  }

  const decorAddOnQuantities: Record<string, number> = {}
  const rawQuantities = object(body.decorAddOnQuantities) || object(body.decor_add_on_quantities)
  if (rawQuantities) {
    for (const [key, value] of Object.entries(rawQuantities)) {
      if (typeof key !== 'string' || !key.trim()) continue
      const quantity = Number(value)
      if (Number.isInteger(quantity) && quantity > 0) decorAddOnQuantities[key] = quantity
    }
  }

  return {
    value: {
      eventDate,
      eventType: eventType || null,
      guestCount,
      rentalPeriod: rentalPeriod as PublicPackagesRentalPeriod,
      packageTierId: packageTierId as PublicPackagesConfiguratorInput['packageTierId'],
      decorAddOnQuantities,
      browserTimeZone,
    },
  }
}
