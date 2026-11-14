import type { Metadata } from 'next'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getSocialProfessionalEventsCategoryContent } from '@/content/events/social-professional-events'

export const metadata: Metadata = {
  title: 'Corporate & Private Event Venue San Antonio | Luxor',
  description:
    'Host corporate events, holiday parties, networking events, galas, and private celebrations at Luxor at Las Palmas in San Antonio.',
  alternates: {
    canonical: '/events/social-professional-events',
    languages: {
      en: '/events/social-professional-events',
      es: '/es/events/social-professional-events',
    },
  },
}

export default function SocialProfessionalEventsCategoryPage() {
  return <EventCategoryPage {...getSocialProfessionalEventsCategoryContent('en')} />
}