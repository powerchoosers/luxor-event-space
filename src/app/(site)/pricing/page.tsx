import type { Metadata } from 'next'
import PricingPageContent from './PricingPageContent'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { buildPublicFeeDisclosure, buildPublicPricingDays } from '@/lib/luxorPricingCatalog'

export const metadata: Metadata = {
  title: 'Venue Rental Rates | Luxor at Las Palmas Events',
  description: 'See Luxor at Las Palmas venue rental rates, what is included, and availability for your San Antonio celebration.',
}

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const pricing = await getDefaultLuxorProposalPricing()
  return <PricingPageContent pricingDays={buildPublicPricingDays(pricing.config)} feeDisclosure={buildPublicFeeDisclosure(pricing.config)} />
}
