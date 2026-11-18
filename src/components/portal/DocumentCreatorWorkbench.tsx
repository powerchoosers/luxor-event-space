'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { DocumentCreatorEditor } from '@/components/portal/DocumentCreatorEditor'
import { DocumentCreatorPdfPreview } from '@/components/portal/DocumentCreatorPdfPreview'
import type { LuxorCreatedDocumentRow } from '@/lib/luxorDocumentCreatorTypes'
import { ArrowLeft, FileText } from '@/lib/icons/phosphor-compat'

type Props = {
  initial?: LuxorCreatedDocumentRow | null
}

export function DocumentCreatorWorkbench({ initial }: Props) {
  const router = useRouter()
  const [record, setRecord] = useState<LuxorCreatedDocumentRow | null>(initial ?? null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const refreshPreview = useCallback(async (document: LuxorCreatedDocumentRow) => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(document.id)}/pdf?refresh=1`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'PDF preview is unavailable.')
      setSignedUrl(body.signedUrl)
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'PDF preview is unavailable.')
      setSignedUrl(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    if (record) void refreshPreview(record)
  }, [record?.id, record?.version, refreshPreview])

  return (
    <PortalPageFrame className="h-full min-h-0 gap-4 overflow-hidden">
      <PortalPageHeader
        icon={<FileText size={18} />}
        title={record?.title || 'New document'}
        actions={(
          <PortalButton type="button" variant="secondary" onClick={() => router.push('/portal/operations?tab=documents')}>
            <ArrowLeft size={14} />
            Back to library
          </PortalButton>
        )}
      />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DocumentCreatorEditor
          initial={record}
          previewBusy={previewLoading}
          onSaved={(document) => {
            setRecord(document)
            if (!initial && typeof window !== 'undefined') {
              window.history.replaceState(null, '', `/portal/operations/documents/${document.id}`)
            }
          }}
          onPreviewRequest={(document) => void refreshPreview(document)}
        />
        <PreviewPanel
          signedUrl={signedUrl}
          title={record?.title || 'Document'}
          loading={previewLoading}
          error={previewError}
        />
      </div>
    </PortalPageFrame>
  )
}

function PreviewPanel(props: { signedUrl: string | null; title: string; loading: boolean; error: string | null }) {
  return (
    <section className="flex min-h-[320px] flex-col gap-2 overflow-hidden">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--portal-text)]">PDF preview</h2>
        <p className="text-xs text-[color:var(--portal-muted)]">Luxor header, footer, and page numbers from the server renderer.</p>
      </div>
      <DocumentCreatorPdfPreview {...props} />
    </section>
  )
}