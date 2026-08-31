import type { Metadata } from 'next'
import PricingPageContent from './PricingPageContent'

export const metadata: Metadata = {
  title: 'Venue Rental Rates | Luxor at Las Palmas Events',
  description: 'See Luxor at Las Palmas venue rental rates, what is included, and availability for your San Antonio celebration.',
}

export default function PricingPage() {
  return <PricingPageContent />
}
