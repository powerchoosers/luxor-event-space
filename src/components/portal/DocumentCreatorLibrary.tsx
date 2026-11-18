'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PortalButton,
  PortalCardSkeleton,
  PortalDatePicker,
  PortalFilterBar,
  PortalSelect,
  PortalStatusBadge,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  type PortalStatusTone,
} from '@/components/portal/PortalUI'
import {
  displayStatusForDocument,
  LUXOR_CREATED_DOCUMENT_STATUSES,
  LUXOR_CREATED_DOCUMENT_STATUS_LABELS,
  LUXOR_CREATED_DOCUMENT_TYPES,
  LUXOR_CREATED_DOCUMENT_TYPE_LABELS,
  type LuxorCreatedDocumentLibrarySection,
  type LuxorCreatedDocumentStatus,
  type LuxorCreatedDocumentSummary,
} from '@/lib/luxorDocumentCreatorTypes'
import { ChevronRight, Copy, FileText, Plus } from '@/lib/icons/phosphor-compat'

const sections: Array<{ id: LuxorCreatedDocumentLibrarySection; label: string; description: string }> = [
  { id: 'my_documents', label: 'My Documents', description: 'Draft agreements you are working on.' },
  { id: 'templates', label: 'Templates', description: 'Reusable starting points for new drafts.' },
  { id: 'archived', label: 'Archived', description: 'Documents removed from active lists.' },
]

const typeFilterOptions = [
  { value: 'all', label: 'All types' },
  ...LUXOR_CREATED_DOCUMENT_TYPES.map((value) => ({ value, label: LUXOR_CREATED_DOCUMENT_TYPE_LABELS[value] })),
]

const statusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  ...LUXOR_CREATED_DOCUMENT_STATUSES.map((value) => ({ value, label: LUXOR_CREATED_DOCUMENT_STATUS_LABELS[value] })),
]

function statusTone(status: LuxorCreatedDocumentStatus): PortalStatusTone {
  if (status === 'archived') return 'neutral'
  if (status === 'template') return 'warning'
  if (status === 'draft') return 'neutral'
  return 'neutral'
}

export function DocumentCreatorLibrary() {
  const router = useRouter()
  const [section, setSection] = useState<LuxorCreatedDocumentLibrarySection>('my_documents')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [documents, setDocuments] = useState<LuxorCreatedDocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ section })
      if (search.trim()) params.set('search', search.trim())
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all' && section !== 'archived') params.set('status', statusFilter)
      if (dateFrom) params.set('from', new Date(`${dateFrom}T00:00:00.000Z`).toISOString())
      if (dateTo) params.set('to', new Date(`${dateTo}T23:59:59.999Z`).toISOString())
      const response = await fetch(`/api/operations/documents?${params.toString()}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Documents could not be loaded.')
      setDocuments(body.documents || [])
      setUnavailable(body.unavailable === true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Documents could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, search, section, statusFilter, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

  const sectionMeta = useMemo(() => sections.find((item) => item.id === section) ?? sections[0], [section])

  const runArchive = async (document: LuxorCreatedDocumentSummary, action: 'archive' | 'restore') => {
    setBusyId(document.id)
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(document.id)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt: document.updated_at, action }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Archive state could not be changed.')
      await load()
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Archive state could not be changed.')
    } finally {
      setBusyId(null)
    }
  }

  const runDuplicate = async (document: LuxorCreatedDocumentSummary) => {
    setBusyId(document.id)
    try {
      const response = await fetch(`/api/operations/documents/${encodeURIComponent(document.id)}/duplicate`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Document could not be duplicated.')
      router.push(`/portal/operations/documents/${body.document.id}`)
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : 'Document could not be duplicated.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">Document creator</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--portal-text)]">{sectionMeta.label}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">{sectionMeta.description}</p>
        </div>
        <PortalButton variant="primary" type="button" onClick={() => router.push('/portal/operations/documents/new')}>
          <Plus size={14} />
          New document
        </PortalButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((item) => (
          <PortalButton
            key={item.id}
            type="button"
            variant={section === item.id ? 'primary' : 'secondary'}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </PortalButton>
        ))}
      </div>

      <PortalFilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by title">
        <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PortalSelect value={typeFilter} onChange={setTypeFilter} options={typeFilterOptions} aria-label="Document type filter" />
          <PortalSelect value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} aria-label="Status filter" />
          <PortalDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Updated from" />
          <PortalDatePicker value={dateTo} onChange={setDateTo} placeholder="Updated to" />
        </div>
      </PortalFilterBar>

      {error ? <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
      {unavailable ? (
        <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 text-sm text-[color:var(--portal-muted)]">
          The document creator database table is not applied yet. Lewis can review and run the checked-in migration before this library stores records.
        </div>
      ) : null}

      <PortalTableCard className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <PortalCardSkeleton count={5} />
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <FileText size={28} className="text-[color:var(--portal-faint)]" />
            <p className="text-sm font-semibold text-[color:var(--portal-text)]">No documents in this view</p>
            <p className="max-w-md text-xs text-[color:var(--portal-muted)]">Create a draft or save a template to see it here.</p>
          </div>
        ) : (
          <PortalStickyTable>
            <PortalStickyThead>
              <tr>
                <th className="text-left">Title</th>
                <th className="text-left">Type</th>
                <th className="text-left">Status</th>
                <th className="text-left">Updated</th>
                <th className="text-right">Actions</th>
              </tr>
            </PortalStickyThead>
            <tbody>
              {documents.map((document) => {
                const status = displayStatusForDocument(document)
                return (
                  <tr key={document.id}>
                    <td className="font-medium text-[color:var(--portal-text)]">{document.title}</td>
                    <td>{LUXOR_CREATED_DOCUMENT_TYPE_LABELS[document.document_type]}</td>
                    <td>
                      <PortalStatusBadge status={LUXOR_CREATED_DOCUMENT_STATUS_LABELS[status]} tone={statusTone(status)} />
                    </td>
                    <td className="tabular-nums text-[color:var(--portal-muted)]">
                      {new Date(document.updated_at).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <PortalButton type="button" variant="secondary" onClick={() => router.push(`/portal/operations/documents/${document.id}`)}>
                          Open <ChevronRight size={12} />
                        </PortalButton>
                        {section === 'templates' ? (
                          <PortalButton type="button" variant="secondary" disabled={busyId === document.id} onClick={() => void runDuplicate(document)}>
                            <Copy size={12} />
                            Duplicate
                          </PortalButton>
                        ) : null}
                        {section !== 'archived' ? (
                          <PortalButton type="button" variant="secondary" disabled={busyId === document.id} onClick={() => void runArchive(document, 'archive')}>
                            Archive
                          </PortalButton>
                        ) : (
                          <PortalButton type="button" variant="secondary" disabled={busyId === document.id} onClick={() => void runArchive(document, 'restore')}>
                            Unarchive
                          </PortalButton>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </PortalStickyTable>
        )}
      </PortalTableCard>
    </div>
  )
}