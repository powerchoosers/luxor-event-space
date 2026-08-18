import { NextResponse } from 'next/server'
import { calculateLuxorProposal } from '@/lib/luxorProposalPricing'
import type { LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'

const REFERENCE_SELECTION = {
  eventDate: '2027-01-04',
  guestCount: 100,
  rentalPeriod: 'evening' as const,
  taxRate: 0,
  paymentPlan: null,
  addOns: [],
}

const PACKAGE_LABELS: Record<string, string> = {
  rental_only: 'Rental Only',
  bronze_essentials: 'Bronze Package',
  silver_premier: 'Silver Package',
  gold_all_inclusive: 'Gold Package',
}

function isIncludedFeature(item: LuxorInvoiceLineItem) {
  return item.required === true || item.included === true || item.isChecklistItem === true
}

function featureKey(item: LuxorInvoiceLineItem) {
  return String(item.id || item.catalogId || item.description).trim().toLowerCase()
}

export async function GET() {
  try {
    const pricing = await getDefaultLuxorProposalPricing()
    const calculation = calculateLuxorProposal({ packageId: 'rental_only', ...REFERENCE_SELECTION }, pricing.config)
    const packages = calculation.packages.map((packageCalculation) => ({
      id: packageCalculation.id,
      name: PACKAGE_LABELS[packageCalculation.id] || packageCalculation.name,
      price: packageCalculation.finalEventPrice,
      error: packageCalculation.errors[0] || null,
      items: packageCalculation.lineItems
        .filter(isIncludedFeature)
        .map((item) => ({
          key: featureKey(item),
          label: item.description,
          category: item.category || 'Included services',
        })),
    }))

    const featureMap = new Map<string, { key: string; label: string; category: string }>()
    for (const packageCalculation of packages) {
      for (const item of packageCalculation.items) {
        if (!featureMap.has(item.key)) featureMap.set(item.key, item)
      }
    }

    return NextResponse.json({
      version: pricing.version,
      guestCount: REFERENCE_SELECTION.guestCount,
      reference: {
        date: REFERENCE_SELECTION.eventDate,
        label: 'Monday–Thursday evening reference pricing',
      },
      packages,
      features: [...featureMap.values()],
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Package pricing is temporarily unavailable.' }, { status: 503 })
  }
}
