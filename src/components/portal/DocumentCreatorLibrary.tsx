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
  PORTAL_TABLE_LIST_CARD_CLASS,
  PORTAL_TABLE_LIST_EDGE_CLASS,
  PORTAL_TABLE_LIST_SCROLL_PAD_CLASS,
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
  const [primaryTab, setPrimaryTab] = useState<'my_documents' | 'templates'>('my_documents')
  const [documentGroup, setDocumentGroup] = useState<'my_documents' | 'out_for_signature' | 'completed'>('my_documents')
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

  const section: LuxorCreatedDocumentLibrarySection = showArchived
    ? 'archived'
    : primaryTab === 'templates'
      ? 'templates'
      : documentGroup
  const hasActiveFilters = Boolean(
    search.trim()
    || typeFilter !== 'all'
    || (!showArchived && statusFilter !== 'all')
    || dateFrom
    || dateTo,
  )

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
    <div className="isolate flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-4 overflow-hidden overflow-x-clip">
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

      {primaryTab === 'my_documents' && !showArchived ? (
        <>
          <div className="relative z-[64] grid grid-cols-3 gap-1 px-4 sm:hidden" role="tablist" aria-label="Document groupings">
            {([
              ['my_documents', 'Drafts'],
              ['out_for_signature', 'Out for signature'],
              ['completed', 'Completed'],
            ] as const).map(([id, label]) => {
              const selected = documentGroup === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setDocumentGroup(id)}
                  className={`relative z-[64] min-h-11 rounded-lg border px-1.5 text-center text-[11px] font-semibold leading-tight ${
                    selected
                      ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)]'
                      : 'border-transparent bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="relative z-[64] hidden min-w-0 max-w-full overflow-x-auto px-4 pb-1 sm:block sm:px-0">
            <PortalAnimatedTabs
              variant="slider"
              ariaLabel="Document groupings"
              tabs={[
                { id: 'my_documents', label: 'Drafts', icon: <FileText size={15} /> },
                { id: 'out_for_signature', label: 'Out for signature', icon: <FileText size={15} /> },
                { id: 'completed', label: 'Completed', icon: <FileText size={15} /> },
              ]}
              activeTab={documentGroup}
              onTabChange={(tab) => {
                if (tab === 'my_documents' || tab === 'out_for_signature' || tab === 'completed') setDocumentGroup(tab)
              }}
            />
          </div>
        </>
      ) : null}

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

      <PortalTableCard
        mobilePageScroll
        mobilePageScrollUntil="lg"
        className={`${PORTAL_TABLE_LIST_CARD_CLASS} ${PORTAL_TABLE_LIST_EDGE_CLASS} max-xl:overflow-x-clip max-xl:[box-shadow:none!important]`}
      >
        {loading ? (
          <PortalCardSkeleton count={5} />
        ) : documents.length === 0 ? (
          hasActiveFilters ? (
            <PortalEmptyState
              icon={<FileText size={24} />}
              title="No documents match your search"
              description="Try a different title or clear filters to see the full library."
              action={(
                <PortalButton
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => {
                    setSearch('')
                    setTypeFilter('all')
                    setStatusFilter('all')
                    setDateFrom('')
                    setDateTo('')
                  }}
                >
                  Clear filters
                </PortalButton>
              )}
            />
          ) : (
            <PortalEmptyState
              icon={<FileText size={24} />}
              title={showArchived ? 'No archived documents' : primaryTab === 'templates' ? 'No templates yet' : documentGroup === 'out_for_signature' ? 'Nothing out for signature' : documentGroup === 'completed' ? 'No completed documents' : 'No documents yet'}
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
          )
        ) : (
          <>
            <div className={`divide-y divide-[color:var(--portal-border)] lg:hidden ${PORTAL_TABLE_LIST_SCROLL_PAD_CLASS}`}>
              {documents.map((document) => {
                const status = displayStatusForDocument(document)
                const presentation = createdDocumentStatusPresentation(status)
                return (
                  <article key={document.id} className="space-y-3 px-4 py-4 sm:px-6">
                    <button
                      type="button"
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                      onClick={() => router.push(`/portal/operations/documents/${document.id}`)}
                    >
                      <p className="text-sm font-semibold text-[color:var(--portal-text)]">{document.title}</p>
                      <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                        {LUXOR_CREATED_DOCUMENT_TYPE_LABELS[document.document_type]} · {formatLastChange(document.updated_at)}
                      </p>
                      {document.recipient_summary ? (
                        <p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{document.recipient_summary}</p>
                      ) : null}
                      <div className="mt-2">
                        <PortalStatusBadge status={presentation.label} tone={presentation.tone} />
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2">
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
                  </article>
                )
              })}
            </div>
            <div className="hidden min-w-0 overflow-x-auto lg:block">
              <PortalStickyTable minWidth="920px">
                <PortalStickyThead>
                  <tr>
                    <th className="px-4 text-left sm:px-6">Title</th>
                    <th className="px-4 text-left sm:px-6">Type</th>
                    <th className="px-4 text-left sm:px-6">Status</th>
                    <th className="px-4 text-left sm:px-6">Recipients</th>
                    <th className="px-4 text-left sm:px-6">Last change</th>
                    <th className="px-4 text-right sm:px-6">Actions</th>
                  </tr>
                </PortalStickyThead>
                <tbody>
                  {documents.map((document) => {
                    const status = displayStatusForDocument(document)
                    const presentation = createdDocumentStatusPresentation(status)
                    return (
                      <tr key={document.id}>
                        <td className="max-w-[16rem] px-4 font-medium text-[color:var(--portal-text)] sm:px-6">
                          <button
                            type="button"
                            className="text-left hover:text-[#8c6424] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                            onClick={() => router.push(`/portal/operations/documents/${document.id}`)}
                          >
                            {document.title}
                          </button>
                        </td>
                        <td className="px-4 text-[color:var(--portal-muted)] sm:px-6">{LUXOR_CREATED_DOCUMENT_TYPE_LABELS[document.document_type]}</td>
                        <td className="px-4 sm:px-6">
                          <PortalStatusBadge status={presentation.label} tone={presentation.tone} />
                        </td>
                        <td className="max-w-[14rem] truncate px-4 text-[color:var(--portal-muted)] sm:px-6">{document.recipient_summary || '—'}</td>
                        <td className="px-4 tabular-nums text-[color:var(--portal-muted)] sm:px-6">{formatLastChange(document.updated_at)}</td>
                        <td className="px-4 sm:px-6">
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
            </div>
          </>
        )}
      </PortalTableCard>
    </div>
  )
}