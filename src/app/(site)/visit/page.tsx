import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Schedule a Visit | Luxor at Las Palmas Events',
  description: 'Schedule a private walkthrough of Luxor at Las Palmas Events in San Antonio and talk through your celebration plans.',
  alternates: { canonical: '/visit', languages: { en: '/visit', es: '/es/visit' } },
}

export default function VisitPage() {
  return <TourPageContent locale="en" />
}
