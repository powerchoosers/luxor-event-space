import 'server-only'

import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { buildPublicPackagesPricingSnapshot, type PublicPackagesPricingSnapshot } from '@/lib/luxorPublicPackageStartingPrices'

export async function loadPublicPackagesPricingSnapshot(): Promise<PublicPackagesPricingSnapshot> {
  const pricing = await getDefaultLuxorProposalPricing()
  return buildPublicPackagesPricingSnapshot(pricing.config, pricing.version)
}
