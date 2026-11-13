import type { Metadata } from 'next'
import { TourPageContent } from '@/components/TourPageContent'

export const metadata: Metadata = {
  title: 'Schedule a Visit | Luxor at Las Palmas Events',
  description: 'Schedule a private walkthrough of Luxor at Las Palmas Events in San Antonio and talk through your celebration plans.',
  alternates: { canonical: '/visit', languages: { en: '/visit', es: '/es/visit' } },
}

type PageProps = { searchParams: Promise<{ inquiryId?: string; source?: string }> }

export default async function VisitPage({ searchParams }: PageProps) {
  const params = await searchParams
  const inquiryId = params.inquiryId?.trim() || null
  const source = params.source?.trim() || null
  return <TourPageContent locale="en" packagesInquiryId={inquiryId} packagesInquirySource={source} />
}
