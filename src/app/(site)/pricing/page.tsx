import type { Metadata } from 'next'
import PricingPageContent from './PricingPageContent'

export const metadata: Metadata = {
  title: 'Luxor | Pricing',
  description: 'Three Luxor packages: Foundation, Signature, and Showpiece.',
}

export default function PricingPage() {
  return <PricingPageContent />
}
