import type { Metadata } from 'next'
import { WorkWithUsComingSoon } from '@/components/WorkWithUsComingSoon'

export const metadata: Metadata = {
  title: 'Preferred Vendor Application | Luxor at Las Palmas Events',
  robots: { index: false, follow: true },
}

export default function PreferredVendorComingSoonPage() {
  return <WorkWithUsComingSoon slug="preferred-vendor" />
}