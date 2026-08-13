'use client'

import dynamic from 'next/dynamic'
import { LoaderCircle } from 'lucide-react'

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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[color:var(--portal-soft)] px-6 text-center text-sm text-[color:var(--portal-muted)]">
        <LoaderCircle className="mr-2 animate-spin text-[#a8792f] dark:text-[#f1d27a]" size={18} />
        Preparing document viewer…
      </div>
    ),
  },
)

export function PortalPdfViewer(props: PortalPdfViewerProps) {
  return <PortalPdfViewerRenderer {...props} />
}
