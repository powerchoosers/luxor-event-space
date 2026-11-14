import type { Metadata } from 'next'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getMilestonesFamilyCelebrationsCategoryContent } from '@/content/events/milestones-family-celebrations'

export const metadata: Metadata = {
  title: 'Salón para quinceañeras y cumpleaños en San Antonio | Luxor',
  description:
    'Celebra quinceañeras, cumpleaños, baby showers, graduaciones y hitos familiares en Luxor at Las Palmas en San Antonio.',
  alternates: {
    canonical: '/es/events/milestones-family-celebrations',
    languages: {
      en: '/events/milestones-family-celebrations',
      es: '/es/events/milestones-family-celebrations',
    },
  },
}

export default function SpanishMilestonesFamilyCelebrationsCategoryPage() {
  return <EventCategoryPage {...getMilestonesFamilyCelebrationsCategoryContent('es')} />
}