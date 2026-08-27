'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

// Loaded only in the browser: PDF.js needs DOMMatrix, which is unavailable during SSR.
export default function EmailPdfPreview({ url }: { url: string }) {
  const [pages, setPages] = useState(0)
  return (
    <div className="h-full overflow-y-auto bg-[color:var(--portal-bg)] p-5">
      <Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)}
        loading={<div className="flex min-h-48 items-center justify-center text-xs text-[color:var(--portal-muted)]">Loading PDF…</div>}
        error={<div className="flex min-h-48 items-center justify-center text-xs text-rose-600">This PDF could not be rendered.</div>}
        className="flex flex-col items-center gap-3">
        {Array.from({ length: pages }, (_, index) => (
          <Page key={index + 1} pageNumber={index + 1} width={Math.min(window.innerWidth * 0.7, 900)}
            renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg" />
        ))}
      </Document>
    </div>
  )
}
