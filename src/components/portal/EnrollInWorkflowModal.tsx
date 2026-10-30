'use client'

import React from 'react'
import { Check, Clock, Mail, MessageSquare, Phone, Search, User, Workflow, X } from 'lucide-react'
import { PortalModal, PortalButton } from '@/components/portal/PortalUI'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import type { CustomWorkflowDefinition, CustomWorkflowStatus } from '@/lib/luxorCustomWorkflowDefinition'

type CustomWorkflowOption = {
  id: string
  name: string
  trigger_type: string
  status: CustomWorkflowStatus
  draft_definition: CustomWorkflowDefinition
}

type AvailableInquiry = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  event_type: string | null
  target_date: string | null
}

export interface EnrollInWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  inquiryIds?: string[]
  leadNames?: string[]
  onSuccess?: () => void
}

export function EnrollInWorkflowModal({
  isOpen,
  onClose,
  inquiryIds = [],
  leadNames = [],
  onSuccess,
}: EnrollInWorkflowModalProps) {
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string>(PREBUILT_WORKFLOWS[0]?.id || '')
  const [customWorkflows, setCustomWorkflows] = React.useState<CustomWorkflowOption[]>([])
  const [availableLeads, setAvailableLeads] = React.useState<AvailableInquiry[]>([])
  const [selectedLeadId, setSelectedLeadId] = React.useState<string>('')
  const [leadSearch, setLeadSearch] = React.useState('')
  const [loadingCustom, setLoadingCustom] = React.useState(false)
  const [enrolling, setEnrolling] = React.useState(false)
  const [resultMessage, setResultMessage] = React.useState<{ text: string; error?: boolean } | null>(null)
  const [filterTab, setFilterTab] = React.useState<'prebuilt' | 'custom'>('prebuilt')

  const hasPresetInquiries = inquiryIds.length > 0

  React.useEffect(() => {
    if (!isOpen) {
      setResultMessage(null)
      setLeadSearch('')
      return
    }

    setLoadingCustom(true)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store' })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as { workflows?: CustomWorkflowOption[] }
        if (Array.isArray(payload.workflows)) {
          setCustomWorkflows(payload.workflows)
        }
      })
      .catch((err) => console.warn('Could not load custom workflows:', err))
      .finally(() => setLoadingCustom(false))

    // If no preset inquiry IDs, fetch recent leads so user can choose one
    if (!hasPresetInquiries) {
      fetch('/api/portal/marketing/leads', { cache: 'no-store' })
        .then(async (res) => {
          const payload = (await res.json().catch(() => ({}))) as { inquiries?: AvailableInquiry[] }
          if (Array.isArray(payload.inquiries)) {
            setAvailableLeads(payload.inquiries)
            if (payload.inquiries[0]?.id) setSelectedLeadId(payload.inquiries[0].id)
          }
        })
        .catch((err) => console.warn('Could not load leads:', err))
    }
  }, [isOpen, hasPresetInquiries])

  const allOptions = React.useMemo(() => {
    if (filterTab === 'prebuilt') {
      return PREBUILT_WORKFLOWS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        triggerBadge: p.triggerBadge,
        stepsSummary: p.stepsSummary,
        isPrebuilt: true,
      }))
    }
    return customWorkflows.map((c) => ({
      id: c.id,
      name: c.name,
      description: `Custom workflow (${c.status})`,
      triggerBadge: c.trigger_type.replace(/_/g, ' '),
      stepsSummary: `${c.draft_definition.steps.length} steps configured`,
      isPrebuilt: false,
    }))
  }, [filterTab, customWorkflows])

  const effectiveInquiryIds = React.useMemo(() => {
    if (hasPresetInquiries) return inquiryIds
    return selectedLeadId ? [selectedLeadId] : []
  }, [hasPresetInquiries, inquiryIds, selectedLeadId])

  const filteredAvailableLeads = React.useMemo(() => {
    if (!leadSearch.trim()) return availableLeads
    const term = leadSearch.toLowerCase()
    return availableLeads.filter(
      (l) =>
        (l.full_name || '').toLowerCase().includes(term) ||
        (l.email || '').toLowerCase().includes(term) ||
        (l.event_type || '').toLowerCase().includes(term),
    )
  }, [availableLeads, leadSearch])

  async function handleEnroll() {
    if (!selectedWorkflowId || effectiveInquiryIds.length === 0) return
    setEnrolling(true)
    setResultMessage(null)

    try {
      const response = await fetch('/api/marketing/custom-workflows/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: selectedWorkflowId,
          inquiryIds: effectiveInquiryIds,
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean
        workflowName?: string
        tasksCreated?: number
        error?: string
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to enroll in workflow.')
      }

      setResultMessage({
        text: `Successfully enrolled in "${data.workflowName}"! ${
          data.tasksCreated ? `${data.tasksCreated} call task(s) created.` : ''
        }`,
      })

      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 1500)
    } catch (err) {
      setResultMessage({
        text: err instanceof Error ? err.message : 'Could not complete enrollment.',
        error: true,
      })
    } finally {
      setEnrolling(false)
    }
  }

  const leadSubtitle = hasPresetInquiries
    ? leadNames.length === 1
      ? leadNames[0]
      : leadNames.length > 1
      ? `${leadNames.length} selected leads (${leadNames.slice(0, 2).join(', ')}${leadNames.length > 2 ? '...' : ''})`
      : `${inquiryIds.length} lead${inquiryIds.length === 1 ? '' : 's'}`
    : 'Choose a lead below'

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Enroll lead in workflow">
      <div className="border-b border-[color:var(--portal-border)] px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]">
              <Workflow size={20} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">
                Enroll in Workflow
              </h2>
              <p className="text-xs text-[color:var(--portal-muted)]">
                Target: <span className="font-semibold text-[color:var(--portal-text)]">{leadSubtitle}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[color:var(--portal-muted)] transition hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab selection */}
        <div className="mt-4 flex gap-2 border-b border-[color:var(--portal-border)]">
          <button
            type="button"
            onClick={() => {
              setFilterTab('prebuilt')
              setSelectedWorkflowId(PREBUILT_WORKFLOWS[0]?.id || '')
            }}
            className={`pb-2.5 text-xs font-bold transition border-b-2 ${
              filterTab === 'prebuilt'
                ? 'border-[#caa24c] text-[#8c6424] dark:text-[#f1d27a]'
                : 'border-transparent text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Pre-built Workflows ({PREBUILT_WORKFLOWS.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterTab('custom')
              if (customWorkflows[0]?.id) setSelectedWorkflowId(customWorkflows[0].id)
            }}
            className={`pb-2.5 text-xs font-bold transition border-b-2 ${
              filterTab === 'custom'
                ? 'border-[#caa24c] text-[#8c6424] dark:text-[#f1d27a]'
                : 'border-transparent text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
          >
            Custom Workflows ({customWorkflows.length})
          </button>
        </div>
      </div>

      <div className="max-h-[62vh] overflow-y-auto portal-scrollbar p-5 sm:p-6 space-y-4">
        {resultMessage ? (
          <div
            className={`rounded-xl p-3.5 text-xs font-medium ${
              resultMessage.error
                ? 'border border-rose-500/25 bg-rose-500/10 text-rose-500'
                : 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {resultMessage.text}
          </div>
        ) : null}

        {/* Lead Picker when opening without preset lead */}
        {!hasPresetInquiries ? (
          <div className="space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block">
              Step 1: Select Lead to Enroll
            </span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
              <input
                type="search"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Search leads by name or event type..."
                className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-9 pr-3 py-1.5 text-xs text-[color:var(--portal-text)] outline-none"
              />
            </div>
            <div className="max-h-28 overflow-y-auto portal-scrollbar divide-y divide-[color:var(--portal-border)] rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
              {filteredAvailableLeads.length === 0 ? (
                <div className="p-3 text-center text-xs text-[color:var(--portal-muted)]">
                  No leads found.
                </div>
              ) : (
                filteredAvailableLeads.map((lead) => {
                  const isLeadSelected = selectedLeadId === lead.id
                  return (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`flex cursor-pointer items-center justify-between p-2 text-xs transition ${
                        isLeadSelected ? 'bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]' : 'hover:bg-[color:var(--portal-soft)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[color:var(--portal-text)] block truncate">
                          {lead.full_name || 'Unnamed Client'}
                        </span>
                        <span className="text-[11px] text-[color:var(--portal-muted)]">
                          {lead.event_type || 'Event'} · {lead.target_date || 'Date TBD'}
                        </span>
                      </div>
                      {isLeadSelected ? <Check size={14} className="text-[#caa24c] shrink-0" /> : null}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : null}

        {/* Workflow selection */}
        <div className="space-y-2">
          {!hasPresetInquiries ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] block">
              Step 2: Choose Workflow
            </span>
          ) : null}

          {allOptions.length === 0 ? (
            <div className="py-8 text-center text-xs text-[color:var(--portal-muted)]">
              {filterTab === 'custom'
                ? 'No custom workflows authored yet. Create one or pick a Pre-built Workflow.'
                : 'No workflows available.'}
            </div>
          ) : (
            allOptions.map((wf) => {
              const isSelected = selectedWorkflowId === wf.id
              return (
                <div
                  key={wf.id}
                  onClick={() => setSelectedWorkflowId(wf.id)}
                  className={`group relative flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-3.5 transition ${
                    isSelected
                      ? 'border-[#caa24c] bg-[#caa24c]/10 shadow-sm ring-1 ring-[#caa24c]/40'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-sm font-semibold text-[color:var(--portal-text)]">
                        {wf.name}
                      </span>
                      <span className="rounded-full bg-[color:var(--portal-soft)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                        {wf.triggerBadge}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-[color:var(--portal-muted)]">
                      {wf.description}
                    </p>
                    <p className="text-[11px] font-medium text-[#8c6424] dark:text-[#f1d27a]">
                      {wf.stepsSummary}
                    </p>
                  </div>

                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                      isSelected
                        ? 'border-[#caa24c] bg-[#caa24c] text-white'
                        : 'border-[color:var(--portal-border)] text-transparent group-hover:border-[#caa24c]/50'
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-[color:var(--portal-border)] px-5 py-4 sm:px-6">
        <PortalButton variant="secondary" onClick={onClose} disabled={enrolling}>
          Cancel
        </PortalButton>
        <PortalButton
          variant="primary"
          onClick={handleEnroll}
          disabled={!selectedWorkflowId || effectiveInquiryIds.length === 0 || enrolling || allOptions.length === 0}
        >
          {enrolling ? 'Enrolling...' : `Enroll in Workflow`}
        </PortalButton>
      </div>
    </PortalModal>
  )
}
