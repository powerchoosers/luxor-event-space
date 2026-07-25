'use client'

import { LoaderCircle } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import { LUXOR_CONTRACT_PAGE_SIZE, type LuxorContractSignaturePlacement } from '@/lib/luxorSignaturePlacement'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export default function ContractPdfViewer({
  pdfUrl,
  pageNumber,
  pageWidth,
  signaturePlacement,
  signatureDataUrl,
  complete,
  onLoad,
  onError,
}: {
  pdfUrl: string
  pageNumber: number
  pageWidth: number
  signaturePlacement: LuxorContractSignaturePlacement
  signatureDataUrl: string | null
  complete: boolean
  onLoad: (pageCount: number) => void
  onError: () => void
}) {
  const scale = pageWidth / LUXOR_CONTRACT_PAGE_SIZE.width
  const placement = signaturePlacement.client
  const overlayStyle = {
    left: placement.x * scale,
    top: (LUXOR_CONTRACT_PAGE_SIZE.height - placement.y - placement.height) * scale,
    width: placement.width * scale,
    height: placement.height * scale,
  }

  return (
    <Document
      key={pdfUrl}
      file={pdfUrl}
      onLoadSuccess={({ numPages }) => onLoad(numPages)}
      onLoadError={onError}
      loading={
        <div className="flex min-h-[560px] items-center justify-center text-[#b9afa3]">
          <LoaderCircle className="mr-2 animate-spin" size={18} /> Loading agreement…
        </div>
      }
      className="flex justify-center"
    >
      {pageWidth > 0 && (
        <div className="relative overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            loading={<div style={{ width: pageWidth, height: pageWidth * 1.294 }} className="bg-[#f7f0e4]" />}
          />
          {!complete && pageNumber === signaturePlacement.pageIndex + 1 && (
            <div
              className={`absolute z-10 flex items-center justify-center overflow-hidden rounded-sm transition ${signatureDataUrl ? 'bg-transparent' : 'border border-dashed border-[#b88a44] bg-[#fff9ed]/75'}`}
              style={overlayStyle}
            >
              {signatureDataUrl ? (
                <img src={signatureDataUrl} alt="Your signature preview" className="h-full w-full object-contain" />
              ) : (
                <span className="px-2 text-center text-[9px] font-semibold uppercase tracking-wider text-[#8b642e]">Your signature</span>
              )}
            </div>
          )}
        </div>
      )}
    </Document>
  )
}
