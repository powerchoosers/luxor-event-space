import 'server-only'

import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { LUXOR_PUBLIC_PACKAGE_TIER_IDS } from '@/lib/luxorProposalPackages'
import { buildPublicPackagesPricingSnapshot, type PublicPackagesPricingSnapshot } from '@/lib/luxorPublicPackageStartingPrices'

function unavailablePublicPackagesSnapshot(reason: string): PublicPackagesPricingSnapshot {
  return {
    showCardPrices: false,
    packages: LUXOR_PUBLIC_PACKAGE_TIER_IDS.map((packageId) => ({
      packageId,
      startingPrice: null,
      scenario: null,
      unavailableReason: reason,
    })),
    pricingVersion: null,
    unavailableReason: reason,
  }
}

export async function loadPublicPackagesPricingSnapshot(): Promise<PublicPackagesPricingSnapshot> {
  try {
    const pricing = await getDefaultLuxorProposalPricing()
    return buildPublicPackagesPricingSnapshot(pricing.config, pricing.version)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pricing is temporarily unavailable.'
    const isNetwork =
      error instanceof TypeError ||
      (error instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(error.message))
    const reason = process.env.NODE_ENV === 'development'
      ? (isNetwork
        ? 'Package starting prices need a live database connection. Point local SUPABASE_URL at the Luxor project or run Supabase locally.'
        : message)
      : 'Starting prices are temporarily unavailable.'
    return unavailablePublicPackagesSnapshot(reason)
  }
}
