'use client'

import { pdfjs } from 'react-pdf'

let configured = false

/** Configure pdf.js worker once for client-side react-pdf viewers (stable on Vercel production). */
export function ensureLuxorPdfJsWorker() {
  if (configured || typeof window === 'undefined') return
  configured = true
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs'
}