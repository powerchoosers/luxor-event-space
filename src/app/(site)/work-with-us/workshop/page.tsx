import type { Metadata } from 'next'
import { WorkWithUsComingSoon } from '@/components/WorkWithUsComingSoon'

export const metadata: Metadata = {
  title: 'Workshop Request | Luxor at Las Palmas Events',
  robots: { index: false, follow: true },
}

export default function WorkshopComingSoonPage() {
  return <WorkWithUsComingSoon slug="workshop" />
}