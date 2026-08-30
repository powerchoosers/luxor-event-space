import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Solicita un recorrido | Luxor at Las Palmas Events',
  description: 'Elige una hora para conocer Luxor at Las Palmas Events y conversar sobre tu celebración.',
  alternates: { canonical: '/es/tour', languages: { en: '/tour', es: '/es/tour' } },
}

export default function SpanishTourPage() {
  return <TourPageContent locale="es" />
}
