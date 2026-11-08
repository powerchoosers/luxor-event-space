'use client'

import React from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ExternalLink, LoaderCircle, Search, Workflow, X } from '@/lib/icons/phosphor-compat'
import { PortalModal, PortalButton } from '@/components/portal/PortalUI'
import { PREBUILT_WORKFLOWS } from '@/lib/luxorPrebuiltWorkflows'
import type { CustomWorkflowDefinition, CustomWorkflowStatus } from '@/lib/luxorCustomWorkflowDefinition'

type CustomWorkflowOption = { id: string; name: string; trigger_type: string; status: CustomWorkflowStatus; draft_definition: CustomWorkflowDefinition }
type AvailableInquiry = { id: string; full_name: string | null; email: string | null; phone: string | null; event_type: string | null; target_date: string | null }
type EnrollmentResult = { text: string; error?: boolean; workflow?: { id: string; name: string } }

export interface EnrollInWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  inquiryIds?: string[]
  leadNames?: string[]
  onSuccess?: () => void
  initialWorkflowId?: string | null
}

export function EnrollInWorkflowModal({ isOpen, onClose, inquiryIds = [], leadNames = [], onSuccess, initialWorkflowId }: EnrollInWorkflowModalProps) {
  const tabIndicatorId = React.useId()
  const reduceMotion = useReducedMotion()
  const [filterTab, setFilterTab] = React.useState<'custom' | 'starter'>('custom')
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState('')
  const [customWorkflows, setCustomWorkflows] = React.useState<CustomWorkflowOption[]>([])
  const [availableLeads, setAvailableLeads] = React.useState<AvailableInquiry[]>([])
  const [selectedLeadId, setSelectedLeadId] = React.useState('')
  const [leadSearch, setLeadSearch] = React.useState('')
  const [loadingCustom, setLoadingCustom] = React.useState(true)
  const [loadingLeads, setLoadingLeads] = React.useState(false)
  const [executionAvailable, setExecutionAvailable] = React.useState(false)
  const [workflowError, setWorkflowError] = React.useState<string | null>(null)
  const [leadError, setLeadError] = React.useState<string | null>(null)
  const [retry, setRetry] = React.useState(0)
  const [enrolling, setEnrolling] = React.useState(false)
  const [resultMessage, setResultMessage] = React.useState<EnrollmentResult | null>(null)
  const hasPresetInquiries = inquiryIds.length > 0
  const completed = Boolean(resultMessage && !resultMessage.error)

  React.useEffect(() => {
    if (!isOpen || !initialWorkflowId) return
    setFilterTab(PREBUILT_WORKFLOWS.some((workflow) => workflow.id === initialWorkflowId) ? 'starter' : 'custom')
    setSelectedWorkflowId(initialWorkflowId)
  }, [isOpen, initialWorkflowId])

  React.useEffect(() => {
    if (!isOpen) {
      setResultMessage(null)
      setLeadSearch('')
      setSelectedLeadId('')
      return
    }
    const controller = new AbortController()
    setLoadingCustom(true)
    setWorkflowError(null)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { workflows?: CustomWorkflowOption[]; executionEnabled?: boolean; enabled?: boolean; error?: string }
      if (!response.ok || !Array.isArray(payload.workflows)) throw new Error(payload.error || 'Active workflows could not load.')
      setCustomWorkflows(payload.workflows.filter((workflow) => workflow.status === 'active'))
      setExecutionAvailable(payload.executionEnabled === true && payload.enabled === true)
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) { setCustomWorkflows([]); setWorkflowError(requestError instanceof Error ? requestError.message : 'Active workflows could not load.') }
    }).finally(() => { if (!controller.signal.aborted) setLoadingCustom(false) })
    if (!hasPresetInquiries) {
      setLoadingLeads(true)
      setLeadError(null)
      fetch('/api/portal/marketing/leads', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
        const payload = await response.json() as { inquiries?: AvailableInquiry[]; error?: string }
        if (!response.ok || !Array.isArray(payload.inquiries)) throw new Error(payload.error || 'Leads could not load.')
        setAvailableLeads(payload.inquiries)
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setLeadError(requestError instanceof Error ? requestError.message : 'Leads could not load.') }).finally(() => { if (!controller.signal.aborted) setLoadingLeads(false) })
    }
    return () => controller.abort()
  }, [isOpen, hasPresetInquiries, retry])

  React.useEffect(() => {
    if (!isOpen) return
    const options = filterTab === 'custom' ? customWorkflows : PREBUILT_WORKFLOWS
    setSelectedWorkflowId((current) => options.some((workflow) => workflow.id === current) ? current : options.some((workflow) => workflow.id === initialWorkflowId) ? initialWorkflowId || '' : options[0]?.id || '')
  }, [isOpen, filterTab, customWorkflows, initialWorkflowId])

  const allOptions = filterTab === 'custom'
    ? customWorkflows.map((workflow) => ({ id: workflow.id, name: workflow.name, description: 'Runs the active saved version, including its delays, eligibility checks, and messages.', stepsSummary: `${workflow.draft_definition.steps.length} steps · ${workflow.trigger_type.replaceAll('_', ' ')}` }))
    : PREBUILT_WORKFLOWS.map((workflow) => ({ id: workflow.id, name: workflow.name, description: workflow.description, stepsSummary: workflow.stepsSummary }))
  const effectiveInquiryIds = hasPresetInquiries ? [...new Set(inquiryIds)] : selectedLeadId ? [selectedLeadId] : []
  const filteredLeads = availableLeads.filter((lead) => !leadSearch.trim() || `${lead.full_name || ''} ${lead.email || ''} ${lead.event_type || ''}`.toLowerCase().includes(leadSearch.trim().toLowerCase()))

  async function handleEnroll() {
    if (!selectedWorkflowId || !allOptions.some((workflow) => workflow.id === selectedWorkflowId) || enrolling || completed || (filterTab === 'custom' && (!executionAvailable || !effectiveInquiryIds.length))) return
    setEnrolling(true)
    setResultMessage(null)
    try {
      const response = await fetch('/api/marketing/custom-workflows/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflowId: selectedWorkflowId, inquiryIds: filterTab === 'starter' ? [] : effectiveInquiryIds }) })
      const payload = await response.json() as { success?: boolean; draftCreated?: boolean; workflow?: { id: string; name: string }; workflowName?: string; enrolledCount?: number; alreadyEnrolledCount?: number; skippedCount?: number; message?: string; error?: string }
      if (!response.ok || !payload.success) throw new Error(payload.error || 'This action could not be completed.')
      if (payload.draftCreated && payload.workflow) {
        setResultMessage({ text: payload.message || 'Draft created. Review and activate it before enrolling leads. No messages were scheduled or sent.', workflow: payload.workflow })
      } else {
        const enrolled = payload.enrolledCount || 0
        const existing = payload.alreadyEnrolledCount || 0
        const skipped = payload.skippedCount || 0
        setResultMessage({ text: `${enrolled} lead${enrolled === 1 ? '' : 's'} enrolled in “${payload.workflowName || 'the workflow'}”.${existing ? ` ${existing} already enrolled.` : ''}${skipped ? ` ${skipped} ineligible or unavailable and skipped.` : ''} Messages follow the saved schedule and consent rules.` })
      }
      onSuccess?.()
    } catch (requestError) {
      setResultMessage({ text: requestError instanceof Error ? requestError.message : 'This action could not be completed.', error: true })
    } finally { setEnrolling(false) }
  }

  const targetLabel = leadNames.length ? leadNames.join(', ') : `${effectiveInquiryIds.length} selected lead${effectiveInquiryIds.length === 1 ? '' : 's'}`
  return <PortalModal isOpen={isOpen} onClose={enrolling ? () => undefined : onClose} maxWidth="max-w-2xl" ariaLabel="Enroll in a workflow">
    <div className="border-b border-[color:var(--portal-border)] px-5 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><Workflow size={20} className="shrink-0 text-[#a8792f]" /><div><h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Enroll in a workflow</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Choose an active workflow, or prepare a starter as a draft.</p></div></div>
        <button type="button" onClick={onClose} disabled={enrolling} aria-label="Close workflow enrollment" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-40"><X size={15} /></button>
      </div>
      <nav aria-label="Workflow types" className="portal-scrollbar mt-4 min-w-0 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1 rounded-xl border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-soft)] p-1">
          {([{ id: 'custom', label: 'Active workflows', count: customWorkflows.length }, { id: 'starter', label: 'Workflow starters' }] as const).map((tab) => {
            const isActive = filterTab === tab.id
            return <button key={tab.id} type="button" aria-pressed={isActive} onClick={() => { setFilterTab(tab.id); setResultMessage(null) }} disabled={enrolling || completed} className={`relative isolate inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? 'text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>
              {isActive ? <motion.span layoutId={`workflow-picker-tab-${tabIndicatorId}`} className="absolute inset-0 -z-10 rounded-lg border border-[color:var(--portal-border)]/50 bg-[color:var(--portal-card)] shadow-2xs" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
              {tab.label}
              {'count' in tab ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${isActive ? 'bg-[#caa24c]/15 text-[#9a6d26] dark:text-[#f1d27a]' : 'bg-black/5 text-[color:var(--portal-muted)] dark:bg-white/10'}`}>{tab.count}</span> : null}
            </button>
          })}
        </div>
      </nav>
    </div>
    <div className="portal-scrollbar max-h-[62dvh] space-y-4 overflow-y-auto p-5 sm:p-6">
      {resultMessage ? <div role={resultMessage.error ? 'alert' : 'status'} className={`rounded-xl border p-3.5 text-xs leading-5 ${resultMessage.error ? 'border-rose-500/25 text-rose-600 dark:text-rose-400' : 'border-[color:var(--portal-border)] text-[color:var(--portal-text)]'}`}><p>{resultMessage.text}</p>{resultMessage.workflow ? <Link href={`/portal/marketing/custom-workflows/${encodeURIComponent(resultMessage.workflow.id)}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 font-semibold text-[#8c6424] dark:text-[#f1d27a]">Review {resultMessage.workflow.name}<ExternalLink size={13} /></Link> : null}</div> : null}
      {filterTab === 'custom' ? <>
        <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Enrollment starts the saved workflow for eligible leads. Email and text steps require their current consent; replies and booking activity can stop follow-ups.</p>
        {hasPresetInquiries ? <p className="break-words text-xs leading-5 text-[color:var(--portal-text)]"><span className="font-semibold">Selected recipients:</span> {targetLabel}</p> : <div className="space-y-2">
          <label htmlFor="workflow-enrollment-lead-search" className="block text-xs font-semibold text-[color:var(--portal-text)]">Select a lead</label>
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" /><input id="workflow-enrollment-lead-search" type="search" value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search by name, email, or event" disabled={enrolling || completed} className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] pl-9 pr-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#a8792f]" /></div>
          {loadingLeads ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading leads…</p> : leadError ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{leadError} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Retry</button></p> : <div className="portal-scrollbar max-h-40 divide-y divide-[color:var(--portal-border)] overflow-y-auto rounded-xl border border-[color:var(--portal-border)]">{filteredLeads.length ? filteredLeads.map((lead) => <button key={lead.id} type="button" onClick={() => setSelectedLeadId(lead.id)} aria-pressed={selectedLeadId === lead.id} disabled={enrolling || completed} className={`flex min-h-12 w-full items-center justify-between gap-3 p-3 text-left ${selectedLeadId === lead.id ? 'bg-[color:var(--portal-soft)]' : 'hover:bg-[color:var(--portal-soft)]'}`}><span className="min-w-0"><span className="block break-words text-xs font-semibold text-[color:var(--portal-text)]">{lead.full_name || 'Unnamed client'}</span><span className="block break-words text-xs leading-5 text-[color:var(--portal-muted)]">{lead.email || lead.phone || 'No contact details'} · {lead.event_type || 'Event'}</span></span>{selectedLeadId === lead.id ? <Check size={15} className="shrink-0 text-[#a8792f]" /> : null}</button>) : <p className="p-3 text-xs text-[color:var(--portal-muted)]">No leads match this search.</p>}</div>}
        </div>}
      </> : <p className="text-xs leading-5 text-[color:var(--portal-muted)]">A starter creates an inactive draft. Review the templates, sender, timing, and consent checks, then activate it before enrolling leads. Creating a draft schedules no messages.</p>}
      {filterTab === 'custom' && loadingCustom ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading active workflows…</p> : filterTab === 'custom' && workflowError ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{workflowError} <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">Retry</button></p> : <div className="space-y-2" aria-label="Available workflows">{allOptions.length ? allOptions.map((workflow) => <button key={workflow.id} type="button" onClick={() => setSelectedWorkflowId(workflow.id)} aria-pressed={selectedWorkflowId === workflow.id} disabled={enrolling || completed} className={`flex min-h-12 w-full items-start justify-between gap-3 rounded-xl border p-3.5 text-left ${selectedWorkflowId === workflow.id ? 'border-[#a8792f] bg-[color:var(--portal-soft)]' : 'border-[color:var(--portal-border)] hover:bg-[color:var(--portal-soft)]'}`}><span className="min-w-0 space-y-1"><span className="block break-words font-serif text-sm font-semibold text-[color:var(--portal-text)]">{workflow.name}</span><span className="block text-xs leading-5 text-[color:var(--portal-muted)]">{workflow.description}</span><span className="block text-xs leading-5 text-[color:var(--portal-muted)]">{workflow.stepsSummary}</span></span>{selectedWorkflowId === workflow.id ? <Check size={16} className="mt-0.5 shrink-0 text-[#a8792f]" /> : null}</button>) : <p className="py-4 text-xs leading-5 text-[color:var(--portal-muted)]">No active workflows are available. Choose a starter or <Link href="/portal/marketing/custom-workflows/new" className="font-semibold text-[#8c6424] underline dark:text-[#f1d27a]">create a workflow</Link>, then review and activate it.</p>}</div>}
      {filterTab === 'custom' && !loadingCustom && !workflowError && !executionAvailable ? <p role="alert" className="text-xs leading-5 text-[color:var(--portal-muted)]">Workflow execution is disabled by the current Luxor controls. Enrollment is unavailable.</p> : null}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[color:var(--portal-border)] px-5 py-4 sm:px-6"><PortalButton variant="secondary" onClick={onClose} disabled={enrolling}>{completed ? 'Done' : 'Cancel'}</PortalButton>{!completed ? <PortalButton variant="primary" onClick={() => void handleEnroll()} disabled={enrolling || !selectedWorkflowId || !allOptions.some((workflow) => workflow.id === selectedWorkflowId) || (filterTab === 'custom' && (!executionAvailable || !effectiveInquiryIds.length || loadingCustom))}>{enrolling ? <LoaderCircle size={14} className="animate-spin" /> : null}{enrolling ? (filterTab === 'starter' ? 'Creating draft…' : 'Enrolling…') : filterTab === 'starter' ? 'Create draft to review' : `Enroll ${effectiveInquiryIds.length || ''} selected lead${effectiveInquiryIds.length === 1 ? '' : 's'}`}</PortalButton> : null}</div>
  </PortalModal>
}
