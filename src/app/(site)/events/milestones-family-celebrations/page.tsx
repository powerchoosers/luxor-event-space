import type { Metadata } from 'next'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getMilestonesFamilyCelebrationsCategoryContent } from '@/content/events/milestones-family-celebrations'

export const metadata: Metadata = {
  title: 'Quinceañera & Birthday Party Venue San Antonio | Luxor',
  description:
    'Celebrate quinceañeras, birthdays, baby showers, graduations, and family milestones at Luxor at Las Palmas in San Antonio.',
  alternates: {
    canonical: '/events/milestones-family-celebrations',
    languages: {
      en: '/events/milestones-family-celebrations',
      es: '/es/events/milestones-family-celebrations',
    },
  },
}

export default function MilestonesFamilyCelebrationsCategoryPage() {
  return <EventCategoryPage {...getMilestonesFamilyCelebrationsCategoryContent('en')} />
}