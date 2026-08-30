import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Schedule a Private Tour | Luxor at Las Palmas Events',
  description: 'Choose a time to see Luxor at Las Palmas Events in person and talk through your celebration plans.',
  alternates: { canonical: '/tour', languages: { en: '/tour', es: '/es/tour' } },
}

export default function TourPage() {
  return <TourPageContent locale="en" />
}
