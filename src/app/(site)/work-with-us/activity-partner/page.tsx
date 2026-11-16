import type { Metadata } from 'next'
import { WorkWithUsComingSoon } from '@/components/WorkWithUsComingSoon'

export const metadata: Metadata = {
  title: 'Activity Partner Application | Luxor at Las Palmas Events',
  robots: { index: false, follow: true },
}

export default function ActivityPartnerComingSoonPage() {
  return <WorkWithUsComingSoon slug="activity-partner" />
}