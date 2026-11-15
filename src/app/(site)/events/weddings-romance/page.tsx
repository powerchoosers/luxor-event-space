import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getWeddingsRomanceCategoryContent } from '@/content/events/weddings-romance'

export const metadata: Metadata = {
  title: 'Wedding & Event Venue in San Antonio | Luxor',
  description:
    'Celebrate weddings, engagements, bridal showers, and anniversaries at Luxor at Las Palmas, a versatile event venue in San Antonio, Texas.',
  alternates: buildLuxorBilingualAlternates('/events/weddings-romance', '/events/weddings-romance', '/es/events/weddings-romance'),
}

export default function WeddingsRomanceCategoryPage() {
  return <EventCategoryPage {...getWeddingsRomanceCategoryContent('en')} />
}