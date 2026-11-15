import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getSocialProfessionalEventsCategoryContent } from '@/content/events/social-professional-events'

export const metadata: Metadata = {
  title: 'Salón corporativo y eventos privados en San Antonio | Luxor',
  description:
    'Organiza eventos corporativos, fiestas navideñas, networking, galas y celebraciones privadas en Luxor at Las Palmas en San Antonio.',
  alternates: buildLuxorBilingualAlternates(
    '/es/events/social-professional-events',
    '/events/social-professional-events',
    '/es/events/social-professional-events',
  ),
}

export default function SpanishSocialProfessionalEventsCategoryPage() {
  return <EventCategoryPage {...getSocialProfessionalEventsCategoryContent('es')} />
}