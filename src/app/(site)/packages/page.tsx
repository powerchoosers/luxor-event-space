import type { Metadata } from 'next'
import { PackagesPageContent } from '@/components/packages/PackagesPageContent'
import { buildPublicPackageCards } from '@/lib/luxorPublicPackages'
import { loadPublicPackagesPricingSnapshot } from '@/lib/luxorPublicPackageStartingPricesServer'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Event Packages | Luxor at Las Palmas Events',
  description: 'Explore Essentials, Signature, and Luxor event packages at Luxor at Las Palmas Events in San Antonio.',
  alternates: { canonical: '/packages', languages: { en: '/packages', es: '/es/packages' } },
}

export default async function PackagesPage() {
  const pricing = await loadPublicPackagesPricingSnapshot()
  const cards = buildPublicPackageCards('en', pricing)
  return <PackagesPageContent locale="en" cards={cards} />
}
