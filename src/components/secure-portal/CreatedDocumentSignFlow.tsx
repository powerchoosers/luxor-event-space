'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, LoaderCircle, LockKeyhole, PenLine, Type } from '@/lib/icons/phosphor-compat'
import { LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT } from '@/lib/luxorSignaturePlacement'

const ContractPdfViewer = dynamic(() => import('@/app/secure-portal/sign/[token]/ContractPdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[420px] items-center justify-center text-[#b9afa3]">
      <LoaderCircle className="mr-2 animate-spin" size={18} /> Preparing document…
    </div>
  ),
})

const HIDDEN_SIGNATURE_PLACEMENT = {
  ...LUXOR_LEGACY_CONTRACT_SIGNATURE_PLACEMENT,
  pageIndex: 9_999,
}

type SignField = {
  id: string
  field_type: string
  label: string
  required: boolean
  page_index: number
}

export type CreatedDocumentSignPayload = {
  flow: 'created_document'
  status: string
  document_title: string
  role_label: string
  signer_name: string
  fields: SignField[]
  agreement_execution_ready?: boolean
}

type SignatureMode = 'type' | 'draw'

function createTypedSignature(name: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 220
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#2d251e'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  let size = 104
  const signatureFont = getComputedStyle(document.documentElement).getPropertyValue('--font-signature').trim() || '"Brush Script MT", "Segoe Script", cursive'
  context.font = `${size}px ${signatureFont}`
  while (context.measureText(name).width > 900 && size > 42) {
    size -= 2
    context.font = `${size}px ${signatureFont}`
  }
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 5)
  return canvas.toDataURL('image/png')
}

export function CreatedDocumentSignFlow({ token, initial }: { token: string; initial: CreatedDocumentSignPayload }) {
  const [payload, setPayload] = useState(initial)
  const [signedName, setSignedName] = useState(initial.signer_name || '')
  const [mode, setMode] = useState<SignatureMode>('type')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(0)
  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const complete = payload.status === 'signed' && payload.agreement_execution_ready === true
  const pdfUrl = `/api/public/signatures/download?token=${encodeURIComponent(token)}&kind=${complete ? 'executed' : 'contract'}`
  const visibleFields = useMemo(
    () => payload.fields.slice().sort((a, b) => a.page_index - b.page_index || a.label.localeCompare(b.label)),
    [payload.fields],
  )
  const activeField = visibleFields[activeFieldIndex] || null

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const measure = () => setPageWidth(Math.max(280, Math.min(820, viewer.clientWidth - 32)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (complete || mode !== 'type') return
    const name = signedName.trim()
    setSignatureDataUrl(name ? createTypedSignature(name) : null)
  }, [complete, mode, signedName])

  useEffect(() => {
    if (!activeField) return
    setPageNumber(activeField.page_index + 1)
  }, [activeField])

  const setFieldValue = (field: SignField, value: string | boolean) => {
    setFieldValues((current) => ({ ...current, [field.id]: value }))
  }

  const fillActiveField = () => {
    if (!activeField) return
    if (activeField.field_type === 'checkbox') {
      setFieldValue(activeField, true)
      return
    }
    if (activeField.field_type === 'date') {
      setFieldValue(activeField, new Date().toLocaleDateString('en-US'))
      return
    }
    if (activeField.field_type === 'name' || activeField.field_type === 'signature' || activeField.field_type === 'initials') {
      setFieldValue(activeField, signedName.trim())
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!signatureDataUrl) {
      setError('Please adopt your signature first.')
      return
    }
    const filled = { ...fieldValues }
    for (const field of payload.fields) {
      if (field.field_type === 'signature' || field.field_type === 'initials' || field.field_type === 'name') {
        if (!filled[field.id]) filled[field.id] = signedName.trim()
      }
      if (field.field_type === 'date' && !filled[field.id]) {
        filled[field.id] = new Date().toLocaleDateString('en-US')
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/public/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signedName, accepted, signatureDataUrl, fieldValues: filled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to finish signing.')
      setPayload(data)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to finish signing.')
    } finally {
      setSubmitting(false)
    }
  }

  const decline = async () => {
    const reason = window.prompt('Please share a short reason for declining.') || ''
    if (!reason.trim()) return
    const response = await fetch('/api/public/signatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, decline: true, reason }),
    })
    const data = await response.json()
    if (response.ok) setPayload(data)
    else setError(data.error || 'Unable to record decline.')
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col px-3 py-3 sm:px-5 lg:h-full lg:min-h-0 lg:overflow-hidden lg:py-3">
      <SignFlowHeader payload={payload} complete={complete} pdfUrl={pdfUrl} />
      <SignFlowBody
        viewerRef={viewerRef}
        pdfUrl={pdfUrl}
        pageNumber={pageNumber}
        pageWidth={pageWidth}
        signatureDataUrl={signatureDataUrl}
        complete={complete}
        numPages={numPages}
        setNumPages={setNumPages}
        setPageNumber={setPageNumber}
        setError={setError}
        payload={payload}
        activeField={activeField}
        activeFieldIndex={activeFieldIndex}
        visibleCount={visibleFields.length}
        fieldValues={fieldValues}
        setFieldValue={setFieldValue}
        fillActiveField={fillActiveField}
        mode={mode}
        setMode={setMode}
        signedName={signedName}
        setSignedName={setSignedName}
        accepted={accepted}
        setAccepted={setAccepted}
        error={error}
        submitting={submitting}
        onSubmit={submit}
        onPrev={() => setActiveFieldIndex((index) => Math.max(0, index - 1))}
        onNext={() => setActiveFieldIndex((index) => Math.min(visibleFields.length - 1, index + 1))}
        onDecline={() => void decline()}
        pdfUrlComplete={pdfUrl}
      />
    </div>
  )
}

function SignFlowHeader({ payload, complete, pdfUrl }: { payload: CreatedDocumentSignPayload; complete: boolean; pdfUrl: string }) {
  return (
    <div className="mb-3 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[#c9a76e]">
          <FileText size={13} /> {complete ? 'Signed copy ready' : payload.status === 'declined' ? 'Declined' : 'Ready for your review'}
        </div>
        <h1 className="truncate font-serif text-[22px] font-medium leading-none text-[#f7f1e8] sm:text-2xl">{payload.document_title}</h1>
        <p className="mt-1 text-[11px] text-[#9f9589]">{payload.role_label}</p>
      </div>
      <a href={pdfUrl} download className="inline-flex h-9 w-fit shrink-0 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.025] px-3 text-[11px] font-semibold text-[#d9cec0]">
        <Download size={14} /> Download PDF
      </a>
    </div>
  )
}

function SignFlowBody(props: {
  viewerRef: React.RefObject<HTMLDivElement | null>
  pdfUrl: string
  pageNumber: number
  pageWidth: number
  signatureDataUrl: string | null
  complete: boolean
  numPages: number
  setNumPages: (value: number) => void
  setPageNumber: React.Dispatch<React.SetStateAction<number>>
  setError: (value: string | null) => void
  payload: CreatedDocumentSignPayload
  activeField: SignField | null
  activeFieldIndex: number
  visibleCount: number
  fieldValues: Record<string, unknown>
  setFieldValue: (field: SignField, value: string | boolean) => void
  fillActiveField: () => void
  mode: SignatureMode
  setMode: (value: SignatureMode) => void
  signedName: string
  setSignedName: (value: string) => void
  accepted: boolean
  setAccepted: (value: boolean) => void
  error: string | null
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
  onPrev: () => void
  onNext: () => void
  onDecline: () => void
  pdfUrlComplete: string
}) {
  const {
    viewerRef, pdfUrl, pageNumber, pageWidth, signatureDataUrl, complete, numPages, setNumPages, setPageNumber, setError,
    payload, activeField, activeFieldIndex, visibleCount, fieldValues, setFieldValue, fillActiveField,
    mode, setMode, signedName, setSignedName, accepted, setAccepted, error, submitting, onSubmit, onPrev, onNext, onDecline, pdfUrlComplete,
  } = props

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-[#211d18] shadow-[0_24px_70px_rgba(0,0,0,0.34)] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
      <section className="flex min-w-0 flex-col border-b border-white/10 lg:min-h-0 lg:border-b-0 lg:border-r">
        <div ref={viewerRef} className="h-[68svh] min-h-[500px] overflow-auto bg-[#302b25] p-3 sm:p-5 lg:h-auto lg:min-h-0 lg:flex-1">
          <ContractPdfViewer
            pdfUrl={pdfUrl}
            pageNumber={pageNumber}
            pageWidth={pageWidth}
            signaturePlacement={HIDDEN_SIGNATURE_PLACEMENT}
            signatureDataUrl={signatureDataUrl}
            complete={complete}
            onLoad={(count) => { setNumPages(count); setPageNumber((page) => Math.min(page, count)) }}
            onError={() => setError('The PDF could not be displayed. You can still download it above.')}
          />
        </div>
        <PageControls pageNumber={pageNumber} numPages={numPages} setPageNumber={setPageNumber} />
      </section>
      <aside className="flex min-h-0 flex-col bg-[#f4efe7] text-[#2d251e]">
        {complete ? (
          <CompletePane pdfUrl={pdfUrlComplete} />
        ) : payload.status === 'declined' ? (
          <div className="p-6 text-sm text-[#6f665b]">You declined this document. Luxor may send an updated link if needed.</div>
        ) : (
          <SignPane
            activeField={activeField}
            activeFieldIndex={activeFieldIndex}
            visibleCount={visibleCount}
            fieldValues={fieldValues}
            setFieldValue={setFieldValue}
            fillActiveField={fillActiveField}
            mode={mode}
            setMode={setMode}
            signedName={signedName}
            setSignedName={setSignedName}
            accepted={accepted}
            setAccepted={setAccepted}
            error={error}
            submitting={submitting}
            onSubmit={onSubmit}
            onPrev={onPrev}
            onNext={onNext}
            onDecline={onDecline}
          />
        )}
      </aside>
    </div>
  )
}

function PageControls({ pageNumber, numPages, setPageNumber }: { pageNumber: number; numPages: number; setPageNumber: React.Dispatch<React.SetStateAction<number>> }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-center border-t border-white/10 bg-[#1b1814] px-3">
      <div className="flex items-center rounded-lg border border-white/10 bg-[#12100d] p-0.5">
        <button type="button" aria-label="Previous page" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} className="flex h-7 w-7 items-center justify-center rounded-md text-[#d9cec0] disabled:opacity-25"><ChevronLeft size={15} /></button>
        <span className="min-w-[66px] px-2 text-center text-[10px] font-bold tabular-nums text-[#c5baad]">{pageNumber} of {numPages || '—'}</span>
        <button type="button" aria-label="Next page" onClick={() => setPageNumber((page) => Math.min(numPages || page, page + 1))} disabled={!numPages || pageNumber >= numPages} className="flex h-7 w-7 items-center justify-center rounded-md text-[#d9cec0] disabled:opacity-25"><ChevronRight size={15} /></button>
      </div>
    </div>
  )
}

function CompletePane({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-8">
      <CheckCircle2 size={28} className="text-[#2f7547]" />
      <h2 className="mt-4 font-serif text-3xl font-medium">You&apos;re all set.</h2>
      <p className="mt-3 text-sm leading-6 text-[#6f665b]">Your signed copy is ready to download.</p>
      <a href={pdfUrl} download className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2d251e] text-sm font-semibold text-white">
        <Download size={16} /> Download signed copy
      </a>
    </div>
  )
}

function SignPane(props: {
  activeField: SignField | null
  activeFieldIndex: number
  visibleCount: number
  fieldValues: Record<string, unknown>
  setFieldValue: (field: SignField, value: string | boolean) => void
  fillActiveField: () => void
  mode: SignatureMode
  setMode: (value: SignatureMode) => void
  signedName: string
  setSignedName: (value: string) => void
  accepted: boolean
  setAccepted: (value: boolean) => void
  error: string | null
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
  onPrev: () => void
  onNext: () => void
  onDecline: () => void
}) {
  const {
    activeField, activeFieldIndex, visibleCount, fieldValues, setFieldValue, fillActiveField,
    mode, setMode, signedName, setSignedName, accepted, setAccepted, error, submitting, onSubmit, onPrev, onNext, onDecline,
  } = props
  return (
    <form onSubmit={onSubmit} className="flex min-h-[650px] flex-1 flex-col lg:min-h-0">
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b7740]"><LockKeyhole size={13} className="inline" /> Field {activeFieldIndex + 1} of {visibleCount}</p>
        <h2 className="mt-3 font-serif text-3xl font-medium leading-tight">{activeField?.label || 'Review fields'}</h2>
        {activeField?.field_type === 'text' || activeField?.field_type === 'email' ? (
          <input className="mt-4 w-full min-h-11 rounded-xl border border-[#d8d0c4] bg-white px-3 text-sm" value={String(fieldValues[activeField.id] || '')} onChange={(event) => setFieldValue(activeField, event.target.value)} />
        ) : null}
        {activeField?.field_type === 'checkbox' ? (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={fieldValues[activeField.id] === true} onChange={(event) => setFieldValue(activeField, event.target.checked)} />
            {activeField.label}
          </label>
        ) : null}
        {activeField ? (
          <button type="button" onClick={fillActiveField} className="mt-3 min-h-11 rounded-xl border border-[#d7c59f] bg-white px-4 text-sm font-semibold">
            Fill this field
          </button>
        ) : null}
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b7740]">Adopt signature once</p>
        <SignModeButtons mode={mode} setMode={setMode} />
        <input className="mt-3 w-full min-h-11 rounded-lg border border-[#d8d0c4] bg-white px-3 text-sm" value={signedName} onChange={(event) => setSignedName(event.target.value)} placeholder="Legal name" />
        <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#5f554a]">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
          I agree to sign electronically and understand this is legally binding.
        </label>
        {error ? <p role="alert" className="mt-3 text-xs text-[#a04b39]">{error}</p> : null}
      </div>
      <div className="shrink-0 border-t border-[#ded5c8] bg-[#eee8df] p-4 space-y-2">
        <button type="submit" disabled={submitting} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#c89d4b] text-sm font-semibold text-[#20170d] disabled:opacity-60">Finish</button>
        <SignFlowFooter onPrev={onPrev} onNext={onNext} onDecline={onDecline} />
      </div>
    </form>
  )
}

function SignModeButtons({ mode, setMode }: { mode: SignatureMode; setMode: (value: SignatureMode) => void }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setMode('type')} className={`min-h-10 rounded-lg border text-xs font-semibold ${mode === 'type' ? 'border-[#b98a3e] bg-[#f5ead2]' : 'border-[#ded5c8] bg-white'}`}><Type size={14} className="inline" /> Type</button>
      <button type="button" onClick={() => setMode('draw')} className={`min-h-10 rounded-lg border text-xs font-semibold ${mode === 'draw' ? 'border-[#b98a3e] bg-[#f5ead2]' : 'border-[#ded5c8] bg-white'}`}><PenLine size={14} className="inline" /> Draw</button>
    </div>
  )
}

function SignFlowFooter({ onPrev, onNext, onDecline }: { onPrev: () => void; onNext: () => void; onDecline: () => void }) {
  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={onPrev} className="min-h-10 flex-1 rounded-lg border border-[#d7c59f] text-xs font-semibold">Previous field</button>
        <button type="button" onClick={onNext} className="min-h-10 flex-1 rounded-lg border border-[#d7c59f] text-xs font-semibold">Next field</button>
      </div>
      <button type="button" onClick={onDecline} className="w-full text-xs font-semibold text-[#8a4b3f] underline">Decline to sign</button>
    </>
  )
}