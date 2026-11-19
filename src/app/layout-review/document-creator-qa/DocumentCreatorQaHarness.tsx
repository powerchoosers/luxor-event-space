'use client'

import { useEffect, useMemo, useState } from 'react'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { CreatedDocumentSignFlow, type CreatedDocumentSignPayload } from '@/components/secure-portal/CreatedDocumentSignFlow'
import { DocumentCreatorFieldsStep } from '@/components/portal/DocumentCreatorFieldsStep'
import { ToastProvider } from '@/components/portal/ToastProvider'

const SAMPLE_FIELDS = [
  { id: 'f-signature', field_type: 'signature', label: 'Signature', required: true, page_index: 0, x: 0.1, y: 0.72, w: 0.42, h: 0.08 },
  { id: 'f-name', field_type: 'name', label: 'Printed name', required: true, page_index: 0, x: 0.1, y: 0.62, w: 0.34, h: 0.05 },
  { id: 'f-date', field_type: 'date', label: 'Date', required: true, page_index: 0, x: 0.52, y: 0.62, w: 0.22, h: 0.05 },
  { id: 'f-email', field_type: 'email', label: 'Email', required: true, page_index: 0, x: 0.1, y: 0.54, w: 0.34, h: 0.05 },
]

const SAMPLE_SIGNERS = [{
  id: 's1',
  document_id: 'qa-doc',
  role_key: 'signer_1',
  role_label: 'Signer 1',
  name: 'Arianna Patterson',
  email: 'a.patterson@luxoratlaspalmas.com',
  sign_order: 1,
  status: 'viewed' as const,
  token_hash: null,
  token_expires_at: null,
  signed_at: null,
  declined_at: null,
  decline_reason: null,
  viewed_at: null,
  last_ip: null,
  last_user_agent: null,
  signed_pdf_path: null,
}]

export function DocumentCreatorQaHarness() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [viewport, setViewport] = useState<'390' | '1440'>('1440')
  const [portalTheme, setPortalTheme] = useState<'light' | 'dark'>('light')
  const [view, setView] = useState<'signer' | 'fields'>('signer')

  useEffect(() => {
    let active = true
    ;(async () => {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([612, 792])
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      page.drawText('Luxor Document Creator QA Sample', { x: 72, y: 700, size: 18, font })
      page.drawText('Fields should align to this rendered PDF page.', { x: 72, y: 670, size: 12, font })
      const bytes = await pdf.save()
      const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' })
      if (active) setPdfUrl(URL.createObjectURL(blob))
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('/api/operations/documents/qa-doc/fields')) {
        return new Response(JSON.stringify({ fields: SAMPLE_FIELDS, signers: SAMPLE_SIGNERS }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/api/public/signatures/download')) {
        if (pdfUrl) {
          const response = await originalFetch(pdfUrl)
          return new Response(await response.arrayBuffer(), {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          })
        }
      }
      if (url.includes('/api/public/signatures') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'QA harness: signing is mocked in screenshots.' }), { status: 400 })
      }
      return originalFetch(input, init)
    }
    return () => { window.fetch = originalFetch }
  }, [pdfUrl])

  useEffect(() => {
    document.body.dataset.portalTheme = portalTheme
    return () => { delete document.body.dataset.portalTheme }
  }, [portalTheme])

  const signPayload = useMemo<CreatedDocumentSignPayload>(() => ({
    flow: 'created_document',
    status: 'viewed',
    document_title: 'Venue Use Agreement (QA)',
    role_label: 'Signer 1',
    signer_name: 'Arianna Patterson',
    signer_email: 'a.patterson@luxoratlaspalmas.com',
    fields: SAMPLE_FIELDS,
  }), [])

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6" data-qa-view={view} data-qa-viewport={viewport} data-qa-portal-theme={portalTheme}>
      <QaToolbar view={view} setView={setView} viewport={viewport} setViewport={setViewport} portalTheme={portalTheme} setPortalTheme={setPortalTheme} />
      <ToastProvider>
        <QaShell viewport={viewport} portalTheme={portalTheme}>
          {view === 'signer' ? (
            <CreatedDocumentSignFlow token="qa-token" initial={signPayload} />
          ) : (
            <DocumentCreatorFieldsStep documentId="qa-doc" pdfUrl={pdfUrl} canEdit />
          )}
        </QaShell>
      </ToastProvider>
    </div>
  )
}

function QaToolbar({
  view, setView, viewport, setViewport, portalTheme, setPortalTheme,
}: {
  view: 'signer' | 'fields'
  setView: (value: 'signer' | 'fields') => void
  viewport: '390' | '1440'
  setViewport: (value: '390' | '1440') => void
  portalTheme: 'light' | 'dark'
  setPortalTheme: (value: 'light' | 'dark') => void
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs" onClick={() => setView('signer')}>Signer page</button>
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs" onClick={() => setView('fields')}>Fields step</button>
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs" onClick={() => setViewport('390')}>390px</button>
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs" onClick={() => setViewport('1440')}>1440px</button>
      <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs" onClick={() => setPortalTheme(portalTheme === 'light' ? 'dark' : 'light')}>
        Portal {portalTheme === 'light' ? 'dark' : 'light'}
      </button>
    </div>
  )
}

function QaShell({ viewport, portalTheme, children }: { viewport: '390' | '1440'; portalTheme: 'light' | 'dark'; children: React.ReactNode }) {
  const width = viewport === '390' ? 390 : 1440
  return (
    <div style={{ width, maxWidth: '100%' }} className={portalTheme === 'dark' ? 'rounded-xl bg-[#12100d] p-3' : 'rounded-xl bg-[#f5f2ec] p-3'}>
      {children}
    </div>
  )
}