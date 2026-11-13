import type { Metadata } from 'next'
import { PackagesInquiryConfirmation } from '@/components/packages/PackagesInquiryConfirmation'

export const metadata: Metadata = {
  title: 'Inquiry received | Luxor at Las Palmas Events',
  robots: { index: false, follow: false },
}

type PageProps = { searchParams: Promise<{ inquiryId?: string }> }

export default async function PackagesConfirmationPage({ searchParams }: PageProps) {
  const params = await searchParams
  return <PackagesInquiryConfirmation locale="en" inquiryId={params.inquiryId} />
}
