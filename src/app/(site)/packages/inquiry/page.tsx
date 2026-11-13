import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PackagesInquiryForm } from '@/components/packages/PackagesInquiryForm'
import { decodePackagesDraftToken, getPackagesInquiryDraft } from '@/lib/luxorPublicPackagesInquiryDraftServer'

export const metadata: Metadata = {
  title: 'Package inquiry | Luxor at Las Palmas Events',
  robots: { index: false, follow: false },
}

type PageProps = { searchParams: Promise<{ token?: string }> }

export default async function PackagesInquiryPage({ searchParams }: PageProps) {
  const params = await searchParams
  const token = params.token?.trim() || ''
  const decoded = token ? decodePackagesDraftToken(token) : null
  if (!decoded) redirect('/packages#build-your-experience')
  const draft = await getPackagesInquiryDraft(decoded.draftId)
  if (!draft) redirect('/packages#build-your-experience')
  return (
    <main className="bg-[#050505] px-5 py-24 text-[#f7efe3] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <PackagesInquiryForm
          locale="en"
          draftToken={token}
          draft={{
            configuratorInput: draft.configurator_input,
            quote: {
              summary_lines: draft.quote_snapshot.summary_lines,
              totals: draft.quote_snapshot.totals,
            },
          }}
        />
      </div>
    </main>
  )
}
