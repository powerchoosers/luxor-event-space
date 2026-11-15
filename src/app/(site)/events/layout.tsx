import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'

export const metadata: Metadata = {
  title: 'Events & Celebrations in San Antonio | Luxor at Las Palmas',
  description:
    'Discover a beautiful San Antonio event venue for weddings, quinceañeras, baby showers, corporate events, and more. Explore celebrations at Luxor.',
  alternates: buildLuxorBilingualAlternates('/events', '/events', '/es/events'),
}

export default function EventsLayout({ children }: { children: ReactNode }) {
  return children
}
