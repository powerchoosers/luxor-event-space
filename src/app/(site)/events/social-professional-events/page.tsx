import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getSocialProfessionalEventsCategoryContent } from '@/content/events/social-professional-events'

export const metadata: Metadata = {
  title: 'Corporate & Private Event Venue San Antonio | Luxor',
  description:
    'Host corporate events, holiday parties, networking events, galas, and private celebrations at Luxor at Las Palmas in San Antonio.',
  alternates: buildLuxorBilingualAlternates(
    '/events/social-professional-events',
    '/events/social-professional-events',
    '/es/events/social-professional-events',
  ),
}

export default function SocialProfessionalEventsCategoryPage() {
  return <EventCategoryPage {...getSocialProfessionalEventsCategoryContent('en')} />
}