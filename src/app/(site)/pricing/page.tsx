import type { Metadata } from 'next'
import PricingPageContent from './PricingPageContent'

export const metadata: Metadata = {
  title: 'Luxor Event Space Packages & Rates | San Antonio',
  description: 'See transparent Luxor venue rental rates, compare celebration packages, and request an exact quote for weddings, quinceañeras, showers, and private events in San Antonio.',
}

export default function PricingPage() {
  return <PricingPageContent />
}
