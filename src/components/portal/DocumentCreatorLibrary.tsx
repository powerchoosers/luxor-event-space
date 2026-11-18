'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  PortalAnimatedTabs,
  PortalButton,
  PortalCardSkeleton,
  PortalCheckbox,
  PortalDatePicker,
  PortalEmptyState,
  PortalFilterBar,
  PortalMobileTabPicker,
  PortalMobileTabTrigger,
  PortalSelect,
  PortalStatusBadge,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
} from '@/components/portal/PortalUI'
import {
  displayStatusForDocument,
  LUXOR_CREATED_DOCUMENT_STATUSES,
  LUXOR_CREATED_DOCUMENT_STATUS_LABELS,
  LUXOR_CREATED_DOCUMENT_TYPES,
  LUXOR_CREATED_DOCUMENT_TYPE_LABELS,
  type LuxorCreatedDocumentLibrarySection,
  type LuxorCreatedDocumentSummary,
} from '@/lib/luxorDocumentCreatorTypes'
import { createdDocumentStatusPresentation } from '@/lib/luxorDocumentCreatorStatus'
import { ChevronRight, Copy, FileText } from '@/lib/icons/phosphor-compat'

const libraryTabs: Array<{ id: Exclude<LuxorCreatedDocumentLibrarySection, 'archived'>; label: string; description: string; icon: ReactNode; group: string }> = [
  { id: 'my_documents', label: 'Documents', description: 'Drafts and in-progress agreements.', icon: <FileText size={15} />, group: 'Library' },
  { id: 'templates', label: 'Templates', description: 'Reusable starting points for new drafts.', icon: <FileText size={15} />, group: 'Library' },
]

const typeFilterOptions = [
  { value: 'all', label: 'All types' },
  ...LUXOR_CREATED_DOCUMENT_TYPES.map((value) => ({ value, label: LUXOR_CREATED_DOCUMENT_TYPE_LABELS[value] })),
]

const statusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  ...LUXOR_CREATED_DOCUMENT_STATUSES.filter((value) => value !== 'archived').map((value) => ({
    value,
    label: value === 'signed' ? 'Fully signed' : LUXOR_CREATED_DOCUMENT_STATUS_LABELS[value],
  })),
]

function formatLastChange(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function DocumentCreatorLibrary() {
  const router = useRouter()
  const [primaryTab, setPrimaryTab] = useState<Exclude<LuxorCreatedDocumentLibrarySection, 'archived'>>('my_documents')
  const [showArchived, setShowArchived] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
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

  const section: LuxorCreatedDocumentLibrarySection = showArchived ? 'archived' : primaryTab

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ section })
      if (search.trim()) params.set('search', search.trim())
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all' && !showArchived) params.set('status', statusFilter)
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
  }, [dateFrom, dateTo, search, section, showArchived, statusFilter, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

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
      <PortalMobileTabPicker
        tabs={libraryTabs}
        activeTab={primaryTab}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onTabChange={(tab) => {
          if (tab === 'my_documents' || tab === 'templates') setPrimaryTab(tab)
        }}
        title="Document library"
        subtitle="Documents or templates."
        triggerLabel="Library view"
      />
      <PortalMobileTabTrigger
        tabs={libraryTabs}
        activeTab={primaryTab}
        onClick={() => setPickerOpen(true)}
        triggerLabel="Library view"
      />

      <div className="hidden min-[1280px]:flex">
        <PortalAnimatedTabs
          variant="slider"
          ariaLabel="Document library"
          tabs={libraryTabs}
          activeTab={primaryTab}
          onTabChange={(tab) => {
            if (tab === 'my_documents' || tab === 'templates') {
              setPrimaryTab(tab)
              setShowArchived(false)
            }
          }}
        />
      </div>

      <PortalFilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by title">
        <div className="grid w-full gap-3 min-[1280px]:grid-cols-2 xl:grid-cols-4">
          <PortalSelect value={typeFilter} onChange={setTypeFilter} options={typeFilterOptions} aria-label="Document type filter" />
          <PortalSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusFilterOptions}
            aria-label="Status filter"
            disabled={showArchived}
          />
          <PortalDatePicker value={dateFrom} onChange={setDateFrom} placeholder="Updated from" />
          <PortalDatePicker value={dateTo} onChange={setDateTo} placeholder="Updated to" />
        </div>
        <div className="mt-3 border-t border-[color:var(--portal-border)] pt-3">
          <PortalCheckbox
            checked={showArchived}
            onChange={setShowArchived}
            label="Show archived"
            sublabel="Archived documents from every type"
          />
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
          <PortalEmptyState
            icon={<FileText size={24} />}
            title={showArchived ? 'No archived documents' : primaryTab === 'templates' ? 'No templates yet' : 'No documents yet'}
            description={
              showArchived
                ? 'Archived agreements appear here when you archive them from Documents or Templates.'
                : 'Create a new document from Operations, or save a draft as a template for next time.'
            }
            action={
              !showArchived ? (
                <PortalButton type="button" variant="primary" className="min-h-11" onClick={() => router.push('/portal/operations/documents/new')}>
                  New document
                </PortalButton>
              ) : null
            }
          />
        ) : (
          <PortalStickyTable>
            <PortalStickyThead>
              <tr>
                <th className="text-left">Title</th>
                <th className="text-left">Type</th>
                <th className="text-left">Status</th>
                <th className="text-left">Recipients</th>
                <th className="text-left">Last change</th>
                <th className="text-right">Actions</th>
              </tr>
            </PortalStickyThead>
            <tbody>
              {documents.map((document) => {
                const status = displayStatusForDocument(document)
                const presentation = createdDocumentStatusPresentation(status)
                return (
                  <tr key={document.id}>
                    <td className="max-w-[16rem] font-medium text-[color:var(--portal-text)]">
                      <button
                        type="button"
                        className="text-left hover:text-[#8c6424] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                        onClick={() => router.push(`/portal/operations/documents/${document.id}`)}
                      >
                        {document.title}
                      </button>
                    </td>
                    <td className="text-[color:var(--portal-muted)]">{LUXOR_CREATED_DOCUMENT_TYPE_LABELS[document.document_type]}</td>
                    <td>
                      <PortalStatusBadge status={presentation.label} tone={presentation.tone} />
                    </td>
                    <td className="tabular-nums text-[color:var(--portal-faint)]">—</td>
                    <td className="tabular-nums text-[color:var(--portal-muted)]">{formatLastChange(document.updated_at)}</td>
                    <td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <PortalButton
                          type="button"
                          variant="secondary"
                          className="min-h-11"
                          onClick={() => router.push(`/portal/operations/documents/${document.id}`)}
                        >
                          Open <ChevronRight size={12} />
                        </PortalButton>
                        {primaryTab === 'templates' && !showArchived ? (
                          <PortalButton
                            type="button"
                            variant="secondary"
                            className="min-h-11"
                            disabled={busyId === document.id}
                            onClick={() => void runDuplicate(document)}
                          >
                            <Copy size={12} />
                            Duplicate
                          </PortalButton>
                        ) : null}
                        {!showArchived ? (
                          <PortalButton
                            type="button"
                            variant="ghost"
                            className="min-h-11"
                            disabled={busyId === document.id}
                            onClick={() => void runArchive(document, 'archive')}
                          >
                            Archive
                          </PortalButton>
                        ) : (
                          <PortalButton
                            type="button"
                            variant="secondary"
                            className="min-h-11"
                            disabled={busyId === document.id}
                            onClick={() => void runArchive(document, 'restore')}
                          >
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