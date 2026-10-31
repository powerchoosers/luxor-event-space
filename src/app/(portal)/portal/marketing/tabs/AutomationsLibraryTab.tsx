'use client'

import React from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronDown, ChevronRight, Clock3, Compass, Mail, Phone, Search, Workflow, Zap, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PREBUILT_WORKFLOWS, type PrebuiltWorkflow } from '@/lib/luxorPrebuiltWorkflows'
import { ElenaWorkflowArchitectModal } from '@/components/portal/ElenaWorkflowArchitectModal'
import { EnrollInWorkflowModal } from '@/components/portal/EnrollInWorkflowModal'
import {
  filterAutomationLibrary,
  type AutomationLibraryEntry,
  type AutomationLibraryTotals,
  type AutomationStatus,
  type AutomationStatusFilter,
} from '@/lib/luxorAutomationsLibrary'
import type { CustomWorkflowDefinition, CustomWorkflowStatus } from '@/lib/luxorCustomWorkflowDefinition'

type LibraryResponse = {
  workflows: AutomationLibraryEntry[]
  systemManaged: AutomationLibraryEntry
  totals: AutomationLibraryTotals
  error?: string
}

type CustomWorkflowSummary = {
  id: string
  name: string
  status: CustomWorkflowStatus
  draft_definition: CustomWorkflowDefinition
  updated_at: string
  draft_revision: number
}

const STATUS_FILTERS: Array<{ id: AutomationStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'paused', label: 'Paused' },
]

export function AutomationsLibraryTab() {
  const [data, setData] = React.useState<LibraryResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [retryVersion, setRetryVersion] = React.useState(0)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<AutomationStatusFilter>('all')
  const [openEntryId, setOpenEntryId] = React.useState<string | null>(null)
  const [customWorkflows, setCustomWorkflows] = React.useState<CustomWorkflowSummary[]>([])
  const [customAuthoringEnabled, setCustomAuthoringEnabled] = React.useState(false)
  const [customExecutionEnabled, setCustomExecutionEnabled] = React.useState(false)
  const [customActivationEnabled, setCustomActivationEnabled] = React.useState(false)
  const [customLoadError, setCustomLoadError] = React.useState<string | null>(null)
  const [customRetryVersion, setCustomRetryVersion] = React.useState(0)
  const [isArchitectOpen, setIsArchitectOpen] = React.useState(false)
  const [enrollingWorkflowId, setEnrollingWorkflowId] = React.useState<string | null>(null)
  const [savingAutomationId, setSavingAutomationId] = React.useState<string | null>(null)
  const [automationControlError, setAutomationControlError] = React.useState<string | null>(null)
  const router = useRouter()

  const setAutomationEnabled = React.useCallback(async (entry: AutomationLibraryEntry) => {
    if (savingAutomationId) return
    setSavingAutomationId(entry.id)
    setAutomationControlError(null)
    try {
      const response = await fetch('/api/marketing/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationKey: entry.kind === 'system' ? 'tour_notifications' : entry.id, enabled: !entry.enabled }),
      })
      const payload = await response.json().catch(() => ({})) as { enabled?: boolean; error?: string; status?: AutomationStatus }
      if (!response.ok) throw new Error(payload.error || 'Automation setting could not be saved.')
      setData((current) => {
        if (!current) return current
        const update = (item: AutomationLibraryEntry) => item.id === entry.id
          ? { ...item, enabled: payload.enabled === true, ...(payload.status ? { status: payload.status } : {}) }
          : item
        return { ...current, workflows: current.workflows.map(update), systemManaged: update(current.systemManaged) }
      })
    } catch (error) {
      setAutomationControlError(error instanceof Error ? error.message : 'Automation setting could not be saved.')
    } finally {
      setSavingAutomationId(null)
    }
  }, [savingAutomationId])

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/marketing/automations', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as LibraryResponse
        if (!response.ok) throw new Error(payload.error || 'The automation library could not load.')
        if (!Array.isArray(payload.workflows) || !payload.systemManaged || !payload.totals) {
          throw new Error('The automation library returned incomplete data. Try again.')
        }
        setData(payload)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : 'The automation library could not load. Try again.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [retryVersion])

  React.useEffect(() => {
    const controller = new AbortController()
    setCustomLoadError(null)
    fetch('/api/marketing/custom-workflows', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { enabled?: boolean; executionEnabled?: boolean; activationEnabled?: boolean; workflows?: CustomWorkflowSummary[]; error?: string }
        if (!response.ok) throw new Error(payload.error || 'Custom workflows could not load.')
        setCustomAuthoringEnabled(payload.enabled === true)
        setCustomExecutionEnabled(payload.executionEnabled === true)
        setCustomActivationEnabled(payload.activationEnabled === true)
        setCustomWorkflows(Array.isArray(payload.workflows) ? payload.workflows : [])
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return
        setCustomLoadError(loadError instanceof Error ? loadError.message : 'Custom workflows could not load.')
      })
    return () => controller.abort()
  }, [customRetryVersion])

  const entries = React.useMemo(() => data ? [...data.workflows, data.systemManaged] : [], [data])
  const visibleEntries = React.useMemo(
    () => filterAutomationLibrary(entries, search, status),
    [entries, search, status],
  )

  if (loading && !data) return <AutomationLibrarySkeleton />

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto portal-scrollbar pb-8">
      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[color:var(--portal-text)]">Automation data could not load.</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
            className="min-h-11 shrink-0 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-bold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading && data ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Refreshing saved workflow data…</p> : null}
      {automationControlError ? <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/5 px-3 py-2 text-xs text-[color:var(--portal-muted)]">{automationControlError}</p> : null}
      {data && [...data.workflows, data.systemManaged].some((entry) => entry.canToggle === false) ? <p role="note" className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-muted)]">Switches are read-only in this local preview. Use the deployed portal to change live automation.</p> : null}

      {/* Pre-built Workflows / Templates Library */}
      <section aria-labelledby="prebuilt-workflows-heading" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">
                Ready-to-Use Sequences
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                5 Default Templates
              </span>
            </div>
            <h2 id="prebuilt-workflows-heading" className="mt-1 font-serif text-lg font-semibold text-[color:var(--portal-text)]">
              Pre-built Workflows
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)] max-w-2xl">
              These are templates, not running workflows. Use one for selected leads or customize it to create a saved workflow with its own on/off control.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          {PREBUILT_WORKFLOWS.map((pb) => (
            <div
              key={pb.id}
              className="flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 transition hover:border-[#caa24c]/40 hover:bg-[color:var(--portal-soft)]"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-[color:var(--portal-border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-text)]">
                    {pb.triggerBadge}
                  </span>
                  <span className="text-[10px] font-semibold text-[color:var(--portal-muted)] flex items-center gap-1">
                    Template
                  </span>
                </div>
                <h3 className="font-serif text-sm font-semibold text-[color:var(--portal-text)]">
                  {pb.name}
                </h3>
                <p className="text-xs leading-5 text-[color:var(--portal-muted)]">
                  {pb.description}
                </p>
                <div className="pt-1 text-[11px] font-medium text-[#8c6424] dark:text-[#f1d27a]">
                  {pb.stepsSummary}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--portal-border)] pt-3">
                <button
                  type="button"
                  onClick={() => setEnrollingWorkflowId(pb.id)}
                  className="rounded-lg bg-[#caa24c] px-3 py-1.5 text-xs font-bold text-[#17130b] transition hover:bg-[#d6b45f]"
                >
                  Use Default (Enroll)
                </button>
                <Link
                  href={`/portal/marketing/custom-workflows/new?from=${encodeURIComponent(pb.id)}`}
                  className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-xs font-bold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/60"
                >
                  Customize & Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Elena Workflow Architect Modal */}
      <ElenaWorkflowArchitectModal
        isOpen={isArchitectOpen}
        onClose={() => setIsArchitectOpen(false)}
        onApplyWorkflow={({ name, definition }) => {
          sessionStorage.setItem('luxor_architect_draft', JSON.stringify({ name, definition }));
          router.push('/portal/marketing/custom-workflows/new');
        }}
      />

      {/* Enroll In Workflow Modal */}
      <EnrollInWorkflowModal
        isOpen={Boolean(enrollingWorkflowId)}
        onClose={() => setEnrollingWorkflowId(null)}
        inquiryIds={[]}
      />

      <section aria-labelledby="custom-workflows-heading" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="custom-workflows-heading" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Custom workflows</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--portal-muted)]">Versioned workflows stay separate from the brochure sequence and calendar-managed tour notices. {customExecutionEnabled ? 'Runtime dispatch is enabled for workflows an authorized operator activates.' : 'Custom message dispatch is off; no custom workflow messages will be sent.'} {customExecutionEnabled && !customActivationEnabled ? 'Activation is currently disabled.' : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsArchitectOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[#caa24c]/60 bg-[#caa24c]/10 px-4 text-xs font-bold text-[#8c6424] dark:text-[#f1d27a] transition hover:bg-[#caa24c]/20"
            >
              <Compass size={14} /> Elena Architect
            </button>
            {customAuthoringEnabled ? (
              <Link href="/portal/marketing/custom-workflows/new" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] transition hover:bg-[#d6b45f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Create workflow</Link>
            ) : (
              <button type="button" disabled title="Draft creation and editing are disabled by the workflow controls." className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-bold text-[color:var(--portal-muted)] opacity-70">Create workflow</button>
            )}
          </div>
        </div>
        {!customAuthoringEnabled ? <p className="mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">Draft creation and editing are disabled by the workflow controls. Existing saved workflows remain available to inspect.</p> : null}
        {customLoadError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3"><p className="text-xs text-[color:var(--portal-muted)]">{customLoadError}</p><button type="button" onClick={() => setCustomRetryVersion((value) => value + 1)} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)]">Retry</button></div> : null}
        {customWorkflows.length ? <div className="mt-4 divide-y divide-[color:var(--portal-border)] border-t border-[color:var(--portal-border)]">{customWorkflows.map((workflow) => <Link key={workflow.id} href={`/portal/marketing/custom-workflows/${encodeURIComponent(workflow.id)}`} className="flex min-h-14 flex-col gap-1 py-3 transition hover:text-[#a8792f] sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0"><span className="block break-words text-sm font-semibold text-[color:var(--portal-text)]">{workflow.name}</span><span className="mt-1 block text-[11px] text-[color:var(--portal-muted)]">{workflow.draft_definition.steps.length} configured steps · Contact form inquiry</span></span><span className="shrink-0 text-xs font-semibold text-[color:var(--portal-muted)]">{workflowStatusLabel(workflow.status)} · Updated {formatDate(workflow.updated_at)}</span></Link>)}</div> : customAuthoringEnabled ? <p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-xs text-[color:var(--portal-muted)]">No custom workflows saved yet.</p> : null}
      </section>

      <section aria-label="Saved automation totals" className="grid grid-cols-2 border-y border-[color:var(--portal-border)] lg:grid-cols-4">
        <SummaryMetric label="Total" value={data?.totals.total ?? null} detail="Saved workflow definitions" />
        <SummaryMetric label="Active" value={data?.totals.active ?? null} detail="Verified sending enabled" />
        <SummaryMetric label="Draft" value={data?.totals.draft ?? null} detail="Saved setup incomplete" />
        <SummaryMetric label="Paused" value={data?.totals.paused ?? null} detail="Saved setup disabled" />
      </section>
      {data && [data.totals.active, data.totals.draft, data.totals.paused].some((value) => value === null) ? (
        <p className="-mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">
          Status totals are withheld because at least one saved workflow has an unverified runtime state. System-managed tour notices are listed separately and are not included in these totals.
        </p>
      ) : (
        <p className="-mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">
          Totals include saved workflow definitions only. System-managed tour notices are listed separately.
        </p>
      )}
      <p className="-mt-4 text-[11px] leading-5 text-[color:var(--portal-muted)]">
        Use the switches to control saved automations. Templates stay inactive until you use or customize them; brochure email copy can be edited from its detail page.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-md">
          <span className="sr-only">Search automations by name</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search automations"
            className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-10 pr-4 text-sm text-[color:var(--portal-text)] outline-none transition placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/70 focus:ring-2 focus:ring-[#caa24c]/20"
          />
        </label>
        <div role="group" aria-label="Filter automations by status" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1 portal-scrollbar">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={status === filter.id}
              onClick={() => setStatus(filter.id)}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${status === filter.id ? 'bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? null : data.workflows.length === 0 && !search && status === 'all' ? (
        <>
          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <Workflow size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a8792f]" />
              <div>
                <h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">No saved automations yet.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--portal-muted)]">Only saved workflow definitions appear in these totals. The tour notices below are managed by the existing calendar system.</p>
              </div>
            </div>
          </section>
          <AutomationEntryCard
            entry={data.systemManaged}
            expanded={openEntryId === data.systemManaged.id}
            onToggle={() => setOpenEntryId((current) => current === data.systemManaged.id ? null : data.systemManaged.id)}
            onSetEnabled={() => void setAutomationEnabled(data.systemManaged)}
            saving={savingAutomationId === data.systemManaged.id}
          />
        </>
      ) : visibleEntries.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-8 text-center">
          <h2 className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">No automations match those filters.</h2>
          <p className="mt-2 text-sm text-[color:var(--portal-muted)]">Try a different name or status.</p>
        </section>
      ) : (
        <section aria-label="Automation library" className="space-y-3">
          {visibleEntries.map((entry) => (
            <AutomationEntryCard
              key={entry.id}
              entry={entry}
              expanded={openEntryId === entry.id}
              onToggle={() => setOpenEntryId((current) => current === entry.id ? null : entry.id)}
              onSetEnabled={() => void setAutomationEnabled(entry)}
              saving={savingAutomationId === entry.id}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function SummaryMetric({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return (
    <div className="min-h-24 border-r border-[color:var(--portal-border)] p-3 last:border-r-0 sm:p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">{label}</p>
      <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-[color:var(--portal-text)]">{value === null ? '—' : value.toLocaleString()}</p>
      <p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">{detail}</p>
    </div>
  )
}

function AutomationEntryCard({ entry, expanded, onToggle, onSetEnabled, saving }: { entry: AutomationLibraryEntry; expanded: boolean; onToggle: () => void; onSetEnabled: () => void; saving: boolean }) {
  const detailsId = `automation-summary-${entry.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const icon = entry.kind === 'system'
    ? <CalendarClock size={18} aria-hidden="true" />
    : <Workflow size={18} aria-hidden="true" />

  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(13rem,.8fr)_minmax(12rem,.75fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#caa24c]/10 text-[#8c6424] dark:text-[#f1d27a]">{icon}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words font-serif text-base font-semibold text-[color:var(--portal-text)] sm:text-lg">{entry.name}</h2>
              <StatusBadge status={entry.status} />
            </div>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{entry.description}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-1 lg:gap-y-1">
          <Metadata label="Trigger" value={entry.trigger} />
          <Metadata label="Channel" value={entry.channelSummary} />
          <Metadata label="Steps" value={entry.stepsCount === null ? 'Unavailable' : `${entry.stepsCount} configured`} />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {entry.kind === 'system' ? <Metadata label="Enrollments" value="Not applicable" /> : (
            <Metadata label="Active enrollments" value={metricLabel(entry.activeEnrollmentCount)} />
          )}
          <Metadata label={entry.sentMessageLabel} value={metricLabel(entry.sentMessageCount)} />
          {entry.updatedAt ? <Metadata label="Updated" value={formatDate(entry.updatedAt) || 'Unavailable'} /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{entry.enabled ? 'On' : 'Off'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={entry.enabled}
              aria-label={`${entry.name} automation`}
              disabled={saving || entry.canToggle === false || (entry.canEnable === false && !entry.enabled)}
              onClick={onSetEnabled}
              title={entry.canEnable === false && !entry.enabled ? entry.controlReason || 'This automation is not ready to enable.' : undefined}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-not-allowed disabled:opacity-50 ${entry.enabled ? 'bg-[#a8792f]' : 'bg-[color:var(--portal-border)]'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <Link
            href={`/portal/marketing/automations/${entry.kind === 'system' ? 'tour-notifications' : encodeURIComponent(entry.id)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] transition hover:bg-[#d6b45f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            View details
          </Link>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={onToggle}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-bold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/60 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          >
            {expanded ? 'Close summary' : 'Open summary'}
            {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={detailsId} className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-4 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.7fr)]">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a8792f]">Read-only workflow summary</h3>
              {entry.steps.length ? (
                <ol className="mt-4 space-y-3">
                  {entry.steps.map((step, index) => (
                    <li key={step.key} className="flex min-w-0 gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[10px] font-bold tabular-nums text-[color:var(--portal-muted)]">{index + 1}</span>
                      <div className="min-w-0 flex-1 border-b border-[color:var(--portal-border)] pb-3 last:border-b-0">
                        <p className="break-words text-sm font-semibold text-[color:var(--portal-text)]">{step.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--portal-muted)]">
                          <span>{formatStepTiming(entry, step.key, step.delayDays)}</span>
                          <span className="inline-flex items-center gap-1"><ChannelIcon channel={step.channel} />{formatChannel(step.channel)}</span>
                          {step.active === false ? <span>Inactive in saved configuration</span> : null}
                          {step.usesExistingDelivery ? <span>Uses existing brochure delivery</span> : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No saved step definitions are available.</p>
              )}
            </div>
            <aside className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
              <p className="text-xs font-bold text-[color:var(--portal-text)]">{entry.kind === 'system' ? 'System-managed behavior' : 'Current controls'}</p>
              <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{entry.summaryNote}</p>
              {entry.statusNote ? <p className="mt-3 border-t border-[color:var(--portal-border)] pt-3 text-xs leading-5 text-[color:var(--portal-muted)]">{entry.statusNote}</p> : null}
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  )
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-black uppercase tracking-[0.13em] text-[color:var(--portal-muted)]">{label}</span>
      <span className="mt-0.5 block break-words text-[11px] font-semibold leading-4 text-[color:var(--portal-text)]">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: AutomationStatus }) {
  const styles: Record<AutomationStatus, string> = {
    active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    draft: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
    paused: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    unknown: 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]',
    'system-managed': 'bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]',
  }
  const label = status === 'system-managed' ? 'System-managed' : status[0].toUpperCase() + status.slice(1)
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.1em] ${styles[status]}`}>{label}</span>
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'email') return <Mail size={12} aria-hidden="true" />
  if (channel === 'phone') return <Phone size={12} aria-hidden="true" />
  return <Clock3 size={12} aria-hidden="true" />
}

function formatChannel(channel: string) {
  if (channel === 'email') return 'Email'
  if (channel === 'phone') return 'Phone task'
  if (channel === 'sms') return 'SMS'
  return 'Channel unavailable'
}

function formatStepTiming(entry: AutomationLibraryEntry, key: string, delayDays: number | null) {
  if (delayDays !== null) return delayDays === 0 ? 'At enrollment' : `${delayDays} day${delayDays === 1 ? '' : 's'} after enrollment`
  if (entry.kind === 'system' && key === 'confirmation') return 'When tour is scheduled'
  if (entry.kind === 'system' && key === 'reminder_24') return '24 hours before tour'
  if (entry.kind === 'system' && key === 'reminder_2') return '2 hours before tour'
  return 'Timing unavailable'
}

function metricLabel(value: number | null) {
  return value === null ? 'Unavailable' : value.toLocaleString()
}

function workflowStatusLabel(status: CustomWorkflowStatus) {
  if (status === 'active') return 'Runtime status unavailable'
  return status[0].toUpperCase() + status.slice(1)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function AutomationLibrarySkeleton() {
  return (
    <div role="status" aria-label="Loading automations" className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-8">
      <div className="grid grid-cols-2 border-y border-[color:var(--portal-border)] lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="min-h-24 border-r border-[color:var(--portal-border)] p-4 last:border-r-0"><div className="h-2.5 w-16 rounded luxor-skeleton" /><div className="mt-3 h-7 w-10 rounded luxor-skeleton" /><div className="mt-2 h-2.5 w-28 rounded luxor-skeleton" /></div>)}
      </div>
      <div className="h-11 rounded-xl luxor-skeleton" />
      {[1, 2].map((item) => <div key={item} className="h-32 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><div className="h-4 w-52 rounded luxor-skeleton" /><div className="mt-4 h-3 w-72 max-w-full rounded luxor-skeleton" /></div>)}
    </div>
  )
}
