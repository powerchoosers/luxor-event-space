'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { CheckCircle2, Download, FileText, LoaderCircle, LockKeyhole, PenLine, Type } from '@/lib/icons/phosphor-compat'
import {
  fieldValuesComplete,
  resolveEffectiveSignerFieldValues,
  type LuxorCreatedDocumentFieldType,
} from '@/lib/luxorCreatedDocumentFieldTypes'
import { luxorChicagoDateString, signerNeedsAdoptedSignature } from '@/lib/luxorCreatedDocumentFieldLayout'
import { createTypedSignature, DrawSignature } from '@/components/secure-portal/SecurePortalSignatureAdopt'
import { scrollToSignField } from '@/components/created-document/CreatedDocumentFieldPdfCanvas'

const CreatedDocumentFieldPdfCanvas = dynamic(
  () => import('@/components/created-document/CreatedDocumentFieldPdfCanvas').then((mod) => mod.CreatedDocumentFieldPdfCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center text-[#b9afa3]">
        <LoaderCircle className="mr-2 animate-spin" size={18} /> Preparing document…
      </div>
    ),
  },
)

type SignField = {
  id: string
  field_type: string
  label: string
  required: boolean
  page_index: number
  x: number
  y: number
  w: number
  h: number
}

export type CreatedDocumentSignPayload = {
  flow: 'created_document'
  status: string
  document_title: string
  role_label: string
  signer_name: string
  signer_email?: string
  fields: SignField[]
  field_values?: Record<string, unknown>
  adopted_signature_data_url?: string
  agreement_execution_ready?: boolean
}

type SignatureMode = 'type' | 'draw'

export function CreatedDocumentSignFlow({ token, initial }: { token: string; initial: CreatedDocumentSignPayload }) {
  const [payload, setPayload] = useState(initial)
  const [signedName, setSignedName] = useState(initial.signer_name || '')
  const [mode, setMode] = useState<SignatureMode>('type')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(initial.adopted_signature_data_url || null)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageWidth, setPageWidth] = useState(0)
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(initial.field_values || {})
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const fieldRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const finishRef = useRef<HTMLButtonElement | null>(null)
  const [allRequiredComplete, setAllRequiredComplete] = useState(false)

  const complete = payload.status === 'signed' && payload.agreement_execution_ready === true
  const pdfUrl = `/api/public/signatures/download?token=${encodeURIComponent(token)}&kind=${complete ? 'executed' : 'contract'}`
  const needsSignature = useMemo(
    () => signerNeedsAdoptedSignature(payload.fields.map((field) => field.field_type)),
    [payload.fields],
  )
  const visibleFields = useMemo(
    () => payload.fields.slice().sort((a, b) => a.page_index - b.page_index || a.label.localeCompare(b.label)),
    [payload.fields],
  )
  const activeFieldIndex = useMemo(
    () => (activeFieldId ? visibleFields.findIndex((field) => field.id === activeFieldId) : 0),
    [activeFieldId, visibleFields],
  )
  const activeField = activeFieldId ? visibleFields.find((field) => field.id === activeFieldId) || null : visibleFields[0] || null

  useEffect(() => {
    if (visibleFields.length && !activeFieldId) setActiveFieldId(visibleFields[0]?.id || null)
  }, [activeFieldId, visibleFields])

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
    if (complete || !needsSignature || mode !== 'type') return
    const name = signedName.trim()
    setSignatureDataUrl(name ? createTypedSignature(name) : null)
  }, [complete, mode, needsSignature, signedName])

  const signatureAdopted = Boolean(signatureDataUrl)

  const effectiveFieldValues = useMemo(
    () => resolveEffectiveSignerFieldValues(
      payload.fields.map((field) => ({
        id: field.id,
        field_type: field.field_type as LuxorCreatedDocumentFieldType,
      })),
      fieldValues,
      {
        signerName: signedName,
        signerEmail: initial.signer_email || '',
        signatureAdopted,
        defaultDate: luxorChicagoDateString(),
      },
    ),
    [fieldValues, initial.signer_email, payload.fields, signatureAdopted, signedName],
  )

  const markSignatureFieldsAdopted = useCallback(() => {
    if (!signatureDataUrl) return
    const marker = signedName.trim() || 'Signed'
    setFieldValues((current) => {
      const next = { ...current }
      for (const field of payload.fields) {
        if (field.field_type === 'signature' || field.field_type === 'initials') {
          next[field.id] = marker
        }
      }
      return next
    })
  }, [payload.fields, signatureDataUrl, signedName])

  useEffect(() => {
    markSignatureFieldsAdopted()
  }, [markSignatureFieldsAdopted])

  useEffect(() => {
    if (payload.status === 'signed') return
    setFieldValues((current) => resolveEffectiveSignerFieldValues(
      payload.fields.map((field) => ({
        id: field.id,
        field_type: field.field_type as LuxorCreatedDocumentFieldType,
      })),
      current,
      {
        signerName: signedName,
        signerEmail: initial.signer_email || '',
        signatureAdopted: Boolean(signatureDataUrl),
        defaultDate: luxorChicagoDateString(),
      },
    ))
    // Seed empty name/email/date once on load; saved field_values from initial state take precedence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chooseMode = (nextMode: SignatureMode) => {
    setMode(nextMode)
    setSignatureDataUrl(nextMode === 'type' && signedName.trim() ? createTypedSignature(signedName.trim()) : null)
  }

  const setFieldValue = useCallback((fieldId: string, value: string | boolean) => {
    setFieldValues((current) => ({ ...current, [fieldId]: value }))
  }, [])

  const registerFieldRef = useCallback((fieldId: string, node: HTMLDivElement | null) => {
    fieldRefs.current.set(fieldId, node)
  }, [])

  const focusField = useCallback((fieldId: string) => {
    setActiveFieldId(fieldId)
    scrollToSignField(fieldRefs.current.get(fieldId) ?? null)
  }, [])

  const applySignatureToField = useCallback(() => {
    if (!signatureDataUrl) {
      setError('Adopt your signature first, then tap the field again.')
      return
    }
    markSignatureFieldsAdopted()
  }, [markSignatureFieldsAdopted, signatureDataUrl])

  const fillActiveField = () => {
    if (!activeField) return
    focusField(activeField.id)
    if (activeField.field_type === 'checkbox') {
      setFieldValue(activeField.id, true)
      return
    }
    if (activeField.field_type === 'date') {
      setFieldValue(activeField.id, luxorChicagoDateString())
      return
    }
    if (activeField.field_type === 'signature' || activeField.field_type === 'initials') {
      applySignatureToField()
      return
    }
    if (activeField.field_type === 'name') {
      setFieldValue(activeField.id, signedName.trim())
      return
    }
    if (activeField.field_type === 'email') {
      setFieldValue(activeField.id, (initial.signer_email || '').trim())
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!accepted) {
      setError('Please accept the signing acknowledgement.')
      return
    }
    if (needsSignature && !signatureDataUrl) {
      setError('Please adopt your signature first.')
      return
    }
    const completion = fieldValuesComplete(
      payload.fields.map((field) => ({
        id: field.id,
        required: field.required,
        field_type: field.field_type as LuxorCreatedDocumentFieldType,
      })),
      effectiveFieldValues,
    )
    if (!completion.ok) {
      const nextField = visibleFields.find((field) => completion.missing.includes(field.id))
      if (nextField) focusField(nextField.id)
      setError('Please complete all required fields.')
      return
    }
    const submitSignedName = needsSignature ? signedName.trim() : (signedName.trim() || payload.signer_name || 'Signer')
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/public/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signedName: submitSignedName,
          accepted,
          signatureDataUrl: signatureDataUrl || '',
          fieldValues: effectiveFieldValues,
        }),
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
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-[#211d18] shadow-[0_24px_70px_rgba(0,0,0,0.34)] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-w-0 flex-col border-b border-white/10 lg:min-h-0 lg:border-b-0 lg:border-r">
          <div ref={viewerRef} className="h-[68svh] min-h-[500px] overflow-auto bg-[#302b25] p-3 sm:p-5 lg:h-auto lg:min-h-0 lg:flex-1">
            <CreatedDocumentFieldPdfCanvas
              pdfUrl={pdfUrl}
              fields={payload.fields}
              pageWidth={pageWidth}
              mode="sign"
              onError={() => setError('The PDF could not be displayed. You can still download it above.')}
              sign={{
                activeFieldId,
                fieldValues,
                onActiveField: focusField,
                onFieldValue: setFieldValue,
                onSignatureFieldTap: applySignatureToField,
                signerName: signedName,
                signerEmail: initial.signer_email || '',
                signatureDataUrl,
                valuesFrozen: payload.status === 'signed',
                registerFieldRef,
              }}
            />
          </div>
        </section>
        <aside className="flex max-h-[60svh] min-h-0 flex-col bg-[#f4efe7] text-[#2d251e] lg:max-h-none">
          {complete ? (
            <CompletePane pdfUrl={pdfUrl} />
          ) : payload.status === 'declined' ? (
            <div className="p-6 text-sm text-[#6f665b]">You declined this document. Luxor may send an updated link if needed.</div>
          ) : (
            <SignPane
              activeField={activeField}
              activeFieldIndex={activeFieldIndex}
              visibleCount={visibleFields.length}
              fieldValues={fieldValues}
              fillActiveField={fillActiveField}
              needsSignature={needsSignature}
              mode={mode}
              chooseMode={chooseMode}
              signedName={signedName}
              setSignedName={setSignedName}
              signatureDataUrl={signatureDataUrl}
              setSignatureDataUrl={setSignatureDataUrl}
              accepted={accepted}
              setAccepted={setAccepted}
              error={error}
              submitting={submitting}
              onSubmit={submit}
              onPrev={() => {
                const prev = visibleFields[Math.max(0, activeFieldIndex - 1)]
                if (prev) focusField(prev.id)
              }}
              onNext={() => {
                const completion = fieldValuesComplete(
                  payload.fields.map((field) => ({
                    id: field.id,
                    required: field.required,
                    field_type: field.field_type as LuxorCreatedDocumentFieldType,
                  })),
                  effectiveFieldValues,
                )
                const nextMissing = visibleFields.find((field) => completion.missing.includes(field.id))
                if (nextMissing) {
                  setAllRequiredComplete(false)
                  focusField(nextMissing.id)
                  return
                }
                setAllRequiredComplete(true)
                finishRef.current?.focus()
              }}
              effectiveFieldValues={effectiveFieldValues}
              allRequiredComplete={allRequiredComplete}
              finishRef={finishRef}
              onDecline={() => void decline()}
            />
          )}
        </aside>
      </div>
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
  effectiveFieldValues: Record<string, unknown>
  fillActiveField: () => void
  needsSignature: boolean
  mode: SignatureMode
  chooseMode: (value: SignatureMode) => void
  signedName: string
  setSignedName: (value: string) => void
  signatureDataUrl: string | null
  setSignatureDataUrl: (value: string | null) => void
  accepted: boolean
  setAccepted: (value: boolean) => void
  error: string | null
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
  onPrev: () => void
  onNext: () => void
  onDecline: () => void
  allRequiredComplete: boolean
  finishRef: React.RefObject<HTMLButtonElement | null>
}) {
  const {
    activeField, activeFieldIndex, visibleCount, fillActiveField, needsSignature,
    mode, chooseMode, signedName, setSignedName, signatureDataUrl, setSignatureDataUrl,
    accepted, setAccepted, error, submitting, onSubmit, onPrev, onNext, onDecline,
    allRequiredComplete, finishRef,
  } = props

  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col lg:min-h-0">
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b7740]"><LockKeyhole size={13} className="inline" /> Field {activeFieldIndex + 1} of {visibleCount}</p>
        <h2 className="mt-3 font-serif text-3xl font-medium leading-tight">{activeField?.label || 'Review fields'}</h2>
        <p className="mt-2 text-xs text-[#6f665b]">Tap a highlighted field on the PDF, or use the buttons below.</p>
        {activeField ? (
          <button type="button" onClick={fillActiveField} className="mt-3 min-h-11 rounded-xl border border-[#d7c59f] bg-white px-4 text-sm font-semibold">
            Fill this field
          </button>
        ) : null}
        {allRequiredComplete ? (
          <p className="mt-2 text-xs font-semibold text-[#2f7547]">All required fields complete. Review and tap Finish when you are ready.</p>
        ) : null}
        {activeField?.required && !fieldHasValue(activeField, props.effectiveFieldValues) ? (
          <p className="mt-2 text-xs text-[#a8792f]">This required field still needs a value.</p>
        ) : null}
        {needsSignature ? (
          <>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b7740]">Adopt signature once</p>
            <label className="mt-2 block text-xs font-semibold text-[#554b41]" htmlFor="created-doc-legal-name">Full legal name</label>
            <input
              id="created-doc-legal-name"
              className="mt-2 h-11 w-full rounded-xl border border-[#d8d0c4] bg-[#fffdfa] px-3.5 text-sm text-[#2d251e] outline-none transition placeholder:text-[#aaa095] focus:border-[#b88a44] focus:ring-2 focus:ring-[#b88a44]/15"
              value={signedName}
              onChange={(event) => setSignedName(event.target.value)}
              autoComplete="name"
              placeholder="Legal name"
            />
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[#e8e1d7] p-1">
              <button type="button" onClick={() => chooseMode('type')} className={`flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${mode === 'type' ? 'bg-[#fffdfa] text-[#2d251e] shadow-sm' : 'text-[#776d61] hover:text-[#2d251e]'}`}>
                <Type size={14} /> Type
              </button>
              <button type="button" onClick={() => chooseMode('draw')} className={`flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${mode === 'draw' ? 'bg-[#fffdfa] text-[#2d251e] shadow-sm' : 'text-[#776d61] hover:text-[#2d251e]'}`}>
                <PenLine size={14} /> Draw
              </button>
            </div>
            <div className="mt-3">
              {mode === 'type' ? (
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-[#d8d0c4] bg-[#fffdfa] px-5">
                  {signedName.trim() ? (
                    <span className="max-w-full truncate text-4xl text-[#2d251e]" style={{ fontFamily: 'var(--font-signature)' }}>{signedName}</span>
                  ) : (
                    <span className="text-sm text-[#a39a8d]">Type your name above</span>
                  )}
                </div>
              ) : (
                <DrawSignature value={signatureDataUrl} onChange={setSignatureDataUrl} />
              )}
            </div>
          </>
        ) : null}
        <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#5f554a]">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
          I agree to sign electronically and understand this is legally binding.
        </label>
        {error ? <p role="alert" className="mt-3 text-xs text-[#a04b39]">{error}</p> : null}
      </div>
      <div className="shrink-0 space-y-2 border-t border-[#ded5c8] bg-[#eee8df] p-4">
        <button ref={finishRef} type="submit" disabled={submitting} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#c89d4b] text-sm font-semibold text-[#20170d] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c89d4b]/50">Finish</button>
        <SignFlowFooter onPrev={onPrev} onNext={onNext} onDecline={onDecline} />
      </div>
    </form>
  )
}

function fieldHasValue(field: SignField, values: Record<string, unknown>) {
  const value = values[field.id]
  if (field.field_type === 'checkbox') return value === true
  return typeof value === 'string' && value.trim().length > 0
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