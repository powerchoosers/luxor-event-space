'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useReducedMotion } from 'framer-motion'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { DocumentCreatorEditor, type DocumentCreatorEditorHandle } from '@/components/portal/DocumentCreatorEditor'
import { DocumentCreatorPaperPreview } from '@/components/portal/DocumentCreatorPaperPreview'
import { DocumentCreatorPdfPreview } from '@/components/portal/DocumentCreatorPdfPreview'
import { DocumentCreatorStepper, type DocumentCreatorStep } from '@/components/portal/DocumentCreatorStepper'
import { DocumentCreatorFieldsStep } from '@/components/portal/DocumentCreatorFieldsStep'
import { canEditCreatedDocumentFields } from '@/lib/luxorCreatedDocumentFieldTypes'
import type { LuxorCreatedDocumentRow, LuxorCreatedDocumentType } from '@/lib/luxorDocumentCreatorTypes'
import { stashCreatedDocumentHandoff } from '@/lib/luxorDocumentCreatorHandoff'
import { ArrowLeft, ChevronDown, FileText } from '@/lib/icons/phosphor-compat'

type Props = {
  initial?: LuxorCreatedDocumentRow | null
  initialStep?: DocumentCreatorStep
  onStepChange?: (step: DocumentCreatorStep) => void
}

type FormPreview = {
  title: string
  documentType: LuxorCreatedDocumentType
  bodyHtml: string
}

export function DocumentCreatorWorkbench({ initial, initialStep = 'create', onStepChange }: Props) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const editorRef = useRef<DocumentCreatorEditorHandle>(null)
  const [record, setRecord] = useState<LuxorCreatedDocumentRow | null>(initial ?? null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<DocumentCreatorStep>(initialStep)
  const [formOpen, setFormOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const pdfPreviewChain = useRef<Promise<void>>(Promise.resolve())
  const recordRef = useRef<LuxorCreatedDocumentRow | null>(record)
  recordRef.current = record
  const [form, setForm] = useState<FormPreview>({
    title: initial?.title || '',
    documentType: initial?.document_type || 'venue_use_agreement',
    bodyHtml: initial?.body_html || '',
  })

  const refreshPreview = useCallback((document: LuxorCreatedDocumentRow) => {
    const task = (async () => {
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        const response = await fetch(`/api/operations/documents/${encodeURIComponent(document.id)}/pdf?refresh=1`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'PDF preview is unavailable.')
        setSignedUrl(body.signedUrl)
        if (body.document) {
          recordRef.current = body.document
          setRecord(body.document)
        }
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : 'PDF preview is unavailable.')
        setSignedUrl(null)
      } finally {
        setPreviewLoading(false)
      }
    })()
    pdfPreviewChain.current = task
    return task
  }, [])

  useEffect(() => {
    if (record?.id) void refreshPreview(record)
  }, [record?.id, record?.version, refreshPreview])

  const onSaved = (document: LuxorCreatedDocumentRow) => {
    setRecord(document)
    setForm((current) => ({
      title: document.title || current.title,
      documentType: document.document_type,
      bodyHtml: document.body_html || current.bodyHtml,
    }))
    if (!initial) {
      stashCreatedDocumentHandoff(document)
      router.replace(`/portal/operations/documents/${document.id}`, { scroll: false })
    }
  }

  const runSave = async (mode: 'draft' | 'template') => {
    setSaving(true)
    try {
      const result = mode === 'draft' ? await editorRef.current?.saveDraft() : await editorRef.current?.saveTemplate()
      if (result) onSaved(result)
    } finally {
      setSaving(false)
    }
  }

  const accordionTransition = reduceMotion ? 'none' : 'grid-template-rows 420ms cubic-bezier(0.4, 0, 0.2, 1)'
  const fieldsEnabled = Boolean(record?.id)
  const canEditFields = record ? canEditCreatedDocumentFields(record.status, record.archived_at) : true

  const goToStep = (step: DocumentCreatorStep) => {
    if (step === 'fields' && !fieldsEnabled) return
    if (step === 'send') return
    setActiveStep(step)
    onStepChange?.(step)
  }

  return (
    <PortalPageFrame className="h-full min-h-0 gap-4 overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] min-[1280px]:pb-0">
      <div className="flex min-w-0 flex-col gap-3 min-[1280px]:flex-row min-[1280px]:items-end min-[1280px]:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <PortalPageHeader
            icon={<FileText size={18} />}
            title={form.title || record?.title || 'New document'}
            hideBackButton
            mobileActionsInline
            actions={(
              <PortalButton type="button" variant="secondary" className="min-h-11" onClick={() => router.push('/portal/operations?tab=documents')}>
                <ArrowLeft size={14} />
                Back
              </PortalButton>
            )}
          />
          <DocumentCreatorStepper activeStep={activeStep} fieldsEnabled={fieldsEnabled} onStepChange={goToStep} />
        </div>
        <div className="hidden min-[1280px]:flex shrink-0 flex-wrap gap-2">
          <PortalButton type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={() => void runSave('template')}>
            Save as template
          </PortalButton>
          <PortalButton type="button" variant="primary" className="min-h-11" disabled={saving} onClick={() => void runSave('draft')}>
            Save draft
          </PortalButton>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden portal-scrollbar min-[1280px]:overflow-hidden">
        {activeStep === 'fields' && record?.id ? (
          <DocumentCreatorFieldsStep documentId={record.id} canEdit={canEditFields} />
        ) : (
        <div className="flex min-h-0 min-w-0 flex-col gap-4 min-[1280px]:grid min-[1280px]:h-full min-[1280px]:min-w-0 min-[1280px]:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,280px)] min-[1280px]:gap-6 min-[1280px]:overflow-hidden">
          <section className="min-h-0 min-w-0 shrink-0 overflow-x-hidden px-4 sm:px-0 min-[1280px]:overflow-y-auto min-[1280px]:px-0 min-[1280px]:portal-scrollbar">
            <button
              type="button"
              className="mb-2 flex min-h-11 w-full items-center justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-left text-sm font-semibold text-[color:var(--portal-text)] min-[1280px]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              aria-expanded={formOpen}
              aria-controls="document-creator-form-panel"
              onClick={() => setFormOpen((value) => !value)}
            >
              Document details
              <ChevronDown size={16} className={`text-[color:var(--portal-muted)] ${reduceMotion ? '' : 'transition-transform'} motion-reduce:transition-none ${formOpen ? 'rotate-180' : ''}`} />
            </button>
            <div
              id="document-creator-form-panel"
              className="grid min-w-0 overflow-hidden min-[1280px]:!grid-rows-[1fr]"
              style={{ gridTemplateRows: formOpen ? '1fr' : '0fr', transition: accordionTransition }}
              inert={!formOpen ? true : undefined}
              aria-hidden={!formOpen}
            >
              <div className="min-h-0 min-w-0 overflow-hidden min-[1280px]:overflow-visible">
                <DocumentCreatorEditor
                  ref={editorRef}
                  bootstrap={initial ?? undefined}
                  revision={record}
                  onSaved={onSaved}
                  onFormChange={setForm}
                  waitForPdfIdle={async () => {
                    await pdfPreviewChain.current
                    return recordRef.current
                  }}
                />
              </div>
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden px-4 sm:px-0 min-[1280px]:overflow-y-auto min-[1280px]:px-0 min-[1280px]:portal-scrollbar">
            <p className="text-xs font-medium text-[color:var(--portal-muted)] min-[1280px]:sr-only">Live paper preview</p>
            <div className="min-w-0 w-full max-w-full overflow-x-hidden">
              <DocumentCreatorPaperPreview
                title={form.title}
                documentType={form.documentType}
                bodyHtml={form.bodyHtml}
                className="mx-auto w-full max-w-full min-[1280px]:max-w-[min(100%,508px)]"
              />
            </div>
          </section>

          <section className="hidden min-h-0 min-w-0 flex-col gap-2 overflow-hidden px-4 sm:px-0 min-[1280px]:flex min-[1280px]:px-0">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">PDF preview</h2>
              <p className="text-xs text-[color:var(--portal-muted)]">Server-rendered file with tabular page numbers.</p>
            </div>
            <DocumentCreatorPdfPreview
              signedUrl={signedUrl}
              title={form.title || 'Document'}
              loading={previewLoading}
              error={previewError}
            />
          </section>
        </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-frame)] p-3 min-[1280px]:hidden">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <PortalButton type="button" variant="primary" className="min-h-11 w-full" disabled={saving} onClick={() => void runSave('draft')}>
            Save draft
          </PortalButton>
          <PortalButton type="button" variant="secondary" className="min-h-11 w-full" disabled={saving} onClick={() => void runSave('template')}>
            Save as template
          </PortalButton>
        </div>
      </div>
    </PortalPageFrame>
  )
}