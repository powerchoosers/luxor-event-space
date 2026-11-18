'use client'

import dynamic from 'next/dynamic'
import { PortalSkeleton } from '@/components/portal/PortalUI'

const PortalPdfViewerRenderer = dynamic(
  () => import('@/components/portal/PortalPdfViewerRenderer').then((module) => module.PortalPdfViewerRenderer),
  {
    ssr: false,
    loading: () => <PortalSkeleton className="h-[min(70vh,720px)] w-full rounded-xl" />,
  },
)

type Props = {
  signedUrl: string | null
  title: string
  loading?: boolean
  error?: string | null
}

export function DocumentCreatorPdfPreview({ signedUrl, title, loading, error }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
        <PortalSkeleton className="h-[min(70vh,720px)] w-full rounded-xl" />
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-muted)]">
        {error}
      </div>
    )
  }
  if (!signedUrl) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center text-sm text-[color:var(--portal-muted)]">
        Generate a preview to see the branded PDF with headers, footers, and page numbers.
      </div>
    )
  }
  return (
    <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <PortalPdfViewerRenderer url={signedUrl} title={title} />
    </div>
  )
}