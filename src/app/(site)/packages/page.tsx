import type { Metadata } from 'next'
import { PackagesPageContent } from '@/components/packages/PackagesPageContent'

export const metadata: Metadata = {
  title: 'Event Packages | Luxor at Las Palmas Events',
  description: 'Explore Essentials, Signature, and Luxor event packages at Luxor at Las Palmas Events in San Antonio.',
  alternates: { canonical: '/packages', languages: { en: '/packages', es: '/es/packages' } },
}

export default function PackagesPage() {
  return <PackagesPageContent locale="en" />
}
