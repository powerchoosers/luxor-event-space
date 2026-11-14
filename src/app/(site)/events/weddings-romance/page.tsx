import type { Metadata } from 'next'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getWeddingsRomanceCategoryContent } from '@/content/events/weddings-romance'

export const metadata: Metadata = {
  title: 'Wedding & Event Venue in San Antonio | Luxor',
  description:
    'Celebrate weddings, engagements, bridal showers, and anniversaries at Luxor at Las Palmas, a versatile event venue in San Antonio, Texas.',
  alternates: {
    canonical: '/events/weddings-romance',
    languages: { en: '/events/weddings-romance', es: '/es/events/weddings-romance' },
  },
}

export default function WeddingsRomanceCategoryPage() {
  return <EventCategoryPage {...getWeddingsRomanceCategoryContent('en')} />
}