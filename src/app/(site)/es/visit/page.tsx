import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Agendar una visita | Luxor at Las Palmas Events',
  description: 'Elige una hora para conocer Luxor at Las Palmas Events en persona y conversar sobre tu celebración.',
  alternates: { canonical: '/es/visit', languages: { en: '/visit', es: '/es/visit' } },
}

export default function SpanishVisitPage() {
  return <TourPageContent locale="es" />
}
