import type { Metadata } from 'next'
import { PackagesInquiryConfirmation } from '@/components/packages/PackagesInquiryConfirmation'

export const metadata: Metadata = {
  title: 'Consulta recibida | Luxor at Las Palmas Events',
  robots: { index: false, follow: false },
}

type PageProps = { searchParams: Promise<{ inquiryId?: string }> }

export default async function PackagesConfirmationPageEs({ searchParams }: PageProps) {
  const params = await searchParams
  return <PackagesInquiryConfirmation locale="es" inquiryId={params.inquiryId} />
}
