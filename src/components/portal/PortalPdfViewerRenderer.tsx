'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PortalPdfViewerProps } from './PortalPdfViewer'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOM_STEPS = [0.82, 1, 1.16]

function nearestZoomIndex(value: number) {
  return ZOOM_STEPS.reduce((closestIndex, candidate, index) => (
    Math.abs(candidate - value) < Math.abs(ZOOM_STEPS[closestIndex] - value) ? index : closestIndex
  ), 0)
}

export function PortalPdfViewerRenderer({ url, title }: PortalPdfViewerProps) {
  return <PdfDocumentViewer key={url} url={url} title={title} />
}

function PdfDocumentViewer({ url, title }: PortalPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const [availableWidth, setAvailableWidth] = useState(0)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setAvailableWidth(Math.max(280, element.clientWidth - 32))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = containerRef.current
    if (!root || pageCount < 2) return

    const observer = new IntersectionObserver((entries) => {
      const mostVisible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
      const page = Number((mostVisible?.target as HTMLElement | undefined)?.dataset.pageNumber)
      if (Number.isFinite(page) && page > 0) setCurrentPage(page)
    }, { root, threshold: [0.35, 0.55, 0.75] })

    pageRefs.current.forEach((page) => {
      if (page) observer.observe(page)
    })

    return () => observer.disconnect()
  }, [pageCount, retryKey])

  const zoomIndex = nearestZoomIndex(zoom)
  const pageWidth = availableWidth > 0
    ? Math.round(Math.min(920, Math.max(280, Math.min(760, availableWidth) * zoom)))
    : 0

  const scrollToPage = (pageNumber: number) => {
    const target = pageRefs.current[pageNumber - 1]
    const root = containerRef.current
    if (!target || !root) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetTop = target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    root.scrollTo({ top: Math.max(0, targetTop - 12), behavior: reducedMotion ? 'auto' : 'smooth' })
    setCurrentPage(pageNumber)
  }

  const titleLabel = title.charAt(0).toUpperCase() + title.slice(1)

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={`${titleLabel} document preview`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 sm:px-4">
        <p className="min-w-[105px] text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]" aria-live="polite">
          {pageCount ? `Page ${currentPage} of ${pageCount}` : 'Loading pages'}
        </p>
        <div className="flex items-center gap-1" aria-label="PDF view controls">
          <button
            type="button"
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1 || !pageCount}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] transition hover:border-[#caa24c]/45 hover:text-[#8c6529] disabled:cursor-not-allowed disabled:opacity-35 dark:hover:text-[#f1d27a]"
            aria-label="Previous PDF page"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => scrollToPage(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount || !pageCount}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] transition hover:border-[#caa24c]/45 hover:text-[#8c6529] disabled:cursor-not-allowed disabled:opacity-35 dark:hover:text-[#f1d27a]"
            aria-label="Next PDF page"
          >
            <ChevronRight size={15} />
          </button>
          <span className="mx-1 h-5 w-px bg-[color:var(--portal-border)]" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setZoom(ZOOM_STEPS[Math.max(0, zoomIndex - 1)])}
            disabled={zoomIndex === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] transition hover:border-[#caa24c]/45 hover:text-[#8c6529] disabled:cursor-not-allowed disabled:opacity-35 dark:hover:text-[#f1d27a]"
            aria-label="Zoom out PDF"
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-9 text-center font-mono text-[10px] font-bold text-[color:var(--portal-muted)]">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1)])}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] transition hover:border-[#caa24c]/45 hover:text-[#8c6529] disabled:cursor-not-allowed disabled:opacity-35 dark:hover:text-[#f1d27a]"
            aria-label="Zoom in PDF"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      </div>

      <div ref={containerRef} tabIndex={0} aria-label={`Scrollable ${title.toLowerCase()} pages`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#d8d2c8] p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/55 sm:p-5">
        {loadError ? (
          <div className="mx-auto flex min-h-[440px] max-w-md flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-white/80 p-6 text-center">
            <p className="text-sm font-bold text-rose-700">This PDF could not be opened.</p>
            <p className="mt-2 text-xs leading-5 text-[#6d655b]">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null)
                setRetryKey((current) => current + 1)
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#a8792f]/35 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#8c6529] transition hover:bg-[#fbf8f2]"
            >
              <RotateCcw size={13} /> Try again
            </button>
          </div>
        ) : (
          <Document
            key={`${url}-${retryKey}`}
            file={url}
            onLoadSuccess={({ numPages }) => {
              setPageCount(numPages)
              setCurrentPage(1)
            }}
            onLoadError={(error) => setLoadError(error.message || 'Please refresh the preview and try again.')}
            loading={<div className="flex min-h-[440px] items-center justify-center rounded-xl bg-white/65 text-sm text-[#6d655b]"><LoaderCircle className="mr-2 animate-spin text-[#8c6529]" size={18} /> Loading {title.toLowerCase()}…</div>}
            className="flex min-w-max flex-col items-center gap-5"
          >
            {pageWidth > 0 && Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1
              return (
                <div
                  key={`${url}-${pageNumber}`}
                  ref={(element) => { pageRefs.current[index] = element }}
                  data-page-number={pageNumber}
                  className="scroll-mt-4 rounded-sm bg-white shadow-[0_14px_32px_rgba(31,25,18,0.24)]"
                >
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="overflow-hidden rounded-sm"
                  />
                </div>
              )
            })}
          </Document>
        )}
      </div>
    </section>
  )
}
