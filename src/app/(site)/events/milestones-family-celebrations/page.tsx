import type { Metadata } from 'next'
import { buildLuxorBilingualAlternates } from '@/lib/luxorPublicHreflang'
import { EventCategoryPage } from '@/components/events/EventCategoryPage'
import { getMilestonesFamilyCelebrationsCategoryContent } from '@/content/events/milestones-family-celebrations'

export const metadata: Metadata = {
  title: 'Quinceañera & Birthday Party Venue San Antonio | Luxor',
  description:
    'Celebrate quinceañeras, birthdays, baby showers, graduations, and family milestones at Luxor at Las Palmas in San Antonio.',
  alternates: buildLuxorBilingualAlternates(
    '/events/milestones-family-celebrations',
    '/events/milestones-family-celebrations',
    '/es/events/milestones-family-celebrations',
  ),
}

export default function MilestonesFamilyCelebrationsCategoryPage() {
  return <EventCategoryPage {...getMilestonesFamilyCelebrationsCategoryContent('en')} />
}