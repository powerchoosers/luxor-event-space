'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export function PortalPdfViewer({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const updateWidth = () => setPageWidth(Math.max(280, Math.min(820, element.clientWidth - 24)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div key={url} ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-[#d8d2c8] p-3 sm:p-6">
      <Document
        key={url}
        file={url}
        onLoadSuccess={({ numPages }) => setPageCount(numPages)}
        loading={<div className="flex min-h-[500px] items-center justify-center text-sm text-[color:var(--portal-muted)]"><LoaderCircle className="mr-2 animate-spin" size={18} /> Loading {title.toLowerCase()}…</div>}
        error={<div className="flex min-h-[500px] items-center justify-center text-sm text-rose-600">This PDF could not be opened.</div>}
        className="flex flex-col items-center gap-4"
      >
        {pageWidth > 0 && Array.from({ length: pageCount }, (_, index) => (
          <Page key={`${url}-${index + 1}`} pageNumber={index + 1} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-[0_12px_30px_rgba(0,0,0,0.2)]" />
        ))}
      </Document>
      {pageCount > 1 ? <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#6d655b]">{pageCount} pages</p> : null}
    </div>
  )
}
