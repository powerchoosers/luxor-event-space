'use client'

import dynamic from 'next/dynamic'
import { PortalSkeleton } from '@/components/portal/PortalUI'

export type PortalPdfViewerProps = {
  url: string
  title: string
}

// pdf.js is sizeable and only useful once someone opens a document. Keeping the
// renderer in its own client chunk keeps the normal owner portal quick to open.
const PortalPdfViewerRenderer = dynamic<PortalPdfViewerProps>(
  () => import('./PortalPdfViewerRenderer').then((module) => module.PortalPdfViewerRenderer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center p-8 space-y-4" role="status" aria-label="Preparing document viewer">
        <PortalSkeleton className="h-[480px] w-full max-w-xl rounded-2xl" />
        <PortalSkeleton className="h-4 w-40 rounded" />
      </div>
    ),
  },
)

export function PortalPdfViewer(props: PortalPdfViewerProps) {
  return <PortalPdfViewerRenderer {...props} />
}
