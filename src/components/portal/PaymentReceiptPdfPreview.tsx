'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const pdfOptions = { withCredentials: true }

export default function PaymentReceiptPdfPreview({ url, receiptNumber }: { url: string; receiptNumber: string }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const file = useMemo(() => url, [url])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    const measure = () => setPageWidth(Math.max(1, Math.floor(element.clientWidth - 24)))
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  return (
    <div ref={viewportRef} className="h-[42vh] min-h-[320px] overflow-auto bg-[#e9e4dc] p-3 sm:h-[56vh]" aria-label={`Rendered PDF receipt ${receiptNumber}`}>
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
          The receipt PDF could not be rendered in this preview. Use Download to open the same receipt file.
        </p>
      ) : null}
      {!error && pageWidth > 0 ? (
        <Document
          file={file}
          options={pdfOptions}
          loading={<p className="grid min-h-[280px] place-items-center text-sm text-[#78685a]">Rendering receipt PDF…</p>}
          onLoadSuccess={({ numPages }) => { setPageCount(numPages); setError(null) }}
          onSourceError={(cause) => setError(cause instanceof Error ? cause.message : 'The receipt file could not be loaded.')}
          onLoadError={(cause) => setError(cause instanceof Error ? cause.message : 'The receipt PDF could not be rendered.')}
          className="flex flex-col items-center gap-3"
        >
          {Array.from({ length: pageCount }, (_, index) => (
            <Page
              key={`${receiptNumber}-${index + 1}`}
              pageNumber={index + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="max-w-full bg-white shadow-md"
            />
          ))}
        </Document>
      ) : null}
    </div>
  )
}
