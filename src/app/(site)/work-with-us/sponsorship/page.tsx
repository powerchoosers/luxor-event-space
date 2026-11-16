import type { Metadata } from 'next'
import { WorkWithUsComingSoon } from '@/components/WorkWithUsComingSoon'

export const metadata: Metadata = {
  title: 'Sponsorship Inquiry | Luxor at Las Palmas Events',
  robots: { index: false, follow: true },
}

export default function SponsorshipComingSoonPage() {
  return <WorkWithUsComingSoon slug="sponsorship" />
}