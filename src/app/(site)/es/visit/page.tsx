import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Agendar una visita | Luxor at Las Palmas Events',
  description: 'Elige una hora para conocer Luxor at Las Palmas Events en persona y conversar sobre tu celebración.',
  alternates: { canonical: '/es/visit', languages: { en: '/visit', es: '/es/visit' } },
}

type PageProps = { searchParams: Promise<{ inquiryId?: string; source?: string }> }

export default async function SpanishVisitPage({ searchParams }: PageProps) {
  const params = await searchParams
  const inquiryId = params.inquiryId?.trim() || null
  const source = params.source?.trim() || null
  return <TourPageContent locale="es" packagesInquiryId={inquiryId} packagesInquirySource={source} />
}
