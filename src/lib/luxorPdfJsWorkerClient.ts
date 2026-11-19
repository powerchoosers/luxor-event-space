'use client'

import { pdfjs } from 'react-pdf'

let configured = false

/** Configure pdf.js worker once for client-side react-pdf viewers (matches ContractPdfViewer). */
export function ensureLuxorPdfJsWorker() {
  if (configured || typeof window === 'undefined') return
  configured = true
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}