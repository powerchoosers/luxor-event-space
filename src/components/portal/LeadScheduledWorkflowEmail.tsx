'use client'

import { useEffect, useState } from 'react'
import { Mail } from '@/lib/icons/phosphor-compat'
import { workflowEmailActivity, type WorkflowEmailActivityInput } from '@/lib/luxorWorkflowEmailActivity'
import { formatTimelineDate } from '@/lib/luxorActivityDates'
import { PortalButton, PortalModal } from '@/components/portal/PortalUI'

/** The caller supplies only the current contact slot, not later workflow steps. */
export function LeadScheduledWorkflowEmail({ action }: { action: WorkflowEmailActivityInput }) {
  const item = workflowEmailActivity(action)
  if (!item) return null
  const date = item.scheduledFor ? new Date(item.scheduledFor) : null
  const scheduled = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(date)
    : null
  return <div className="flex items-start gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
    <Mail size={16} className="mt-0.5 shrink-0 text-[color:var(--portal-muted)]" />
    <div className="min-w-0">
      <p className="text-xs font-semibold text-[color:var(--portal-muted)]">{item.label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[color:var(--portal-text)]">{item.subject}</p>
      {scheduled && <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">{item.tentative ? 'Estimated no earlier than ' : item.label === 'Email pending scheduling' ? 'Planned for ' : ''}{scheduled} Central · Automated{item.label === 'Email pending scheduling' ? ' · Awaiting queue' : ''}{item.tentative ? ' · Timing depends on workflow readiness' : ''}</p>}
    </div>
  </div>
}

export function LeadCurrentWorkflowEmail({ inquiryId, refreshKey }: { inquiryId: string; refreshKey: number }) {
  const [state, setState] = useState<{ action: WorkflowEmailActivityInput | null; error: boolean }>({ action: null, error: false })
  const [review, setReview] = useState<string | null>(null)
  const [resolution, setResolution] = useState<{ slotId?: string; enrollmentId?: string; workflowKind?: string; canStop: boolean; detail: string } | null>(null)
  const [audit, setAudit] = useState<Array<{ actor_email: string; action_kind: string; action_status: string; reason: string; created_at: string }>>([])
  const [confirmStop, setConfirmStop] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let emailRequest = 0
    let reviewRequest = 0
    async function load() {
      const request = ++emailRequest
      try {
        const response = await fetch(`/api/workflow-current-email?inquiryId=${encodeURIComponent(inquiryId)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unavailable')
        const data = await response.json() as { action: WorkflowEmailActivityInput | null }
        if (!controller.signal.aborted && request === emailRequest) setState({ action: data.action, error: false })
      } catch {
        if (!controller.signal.aborted && request === emailRequest) setState({ action: null, error: true })
      }
    }
    async function loadReview() {
      const request = ++reviewRequest
      try {
        const response = await fetch(`/api/workflow-review?inquiryId=${encodeURIComponent(inquiryId)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unavailable')
        const data = await response.json() as { review: string | null; resolution?: { slotId?: string; enrollmentId?: string; workflowKind?: string; canStop: boolean; detail: string } | null; audit?: typeof audit }
        if (!controller.signal.aborted && request === reviewRequest) { setReview(data.review); setResolution(data.resolution ?? null); setAudit(data.audit ?? []) }
      } catch {
        if (!controller.signal.aborted && request === reviewRequest) { setReview('Workflow review status could not be loaded.'); setResolution(null) }
      }
    }
    const refresh = () => { void load(); void loadReview() }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [inquiryId, refreshKey, localRefresh])
  async function stopAfterReview() {
    if (!resolution?.canStop || saving) return
    setSaving(true); setResolutionError(null)
    try {
      const response = await fetch('/api/workflow-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryId, slotId: resolution.slotId, enrollmentId: resolution.enrollmentId, workflowKind: resolution.workflowKind, acknowledged: true }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Workflow resolution could not be saved.')
      setConfirmStop(false); setLocalRefresh((key) => key + 1)
    } catch (error) {
      setResolutionError(error instanceof Error ? error.message : 'Workflow resolution could not be saved.')
    } finally { setSaving(false) }
  }
  return <>
    {review && <div role="status" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-[color:var(--portal-text)]">
      <p>{review}</p>{resolution && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{resolution.detail}</p>}
      {resolution?.canStop && <PortalButton className="mt-3" size="sm" onClick={() => { setResolutionError(null); setConfirmStop(true) }}>Review stop options</PortalButton>}
    </div>}
    {state.error ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Scheduled workflow email could not be loaded.</p> : state.action ? <LeadScheduledWorkflowEmail action={state.action} /> : null}
    {audit.length > 0 && <details className="text-xs text-[color:var(--portal-muted)]"><summary className="cursor-pointer font-semibold">Workflow review history</summary><ul className="mt-2 space-y-1">{audit.map((entry, index) => <li key={`${entry.created_at}-${index}`}>Stopped after review by {entry.actor_email} · {formatTimelineDate(entry.created_at, true)} · {entry.action_kind === 'none' ? 'no active action' : `${entry.action_kind} ${entry.action_status.replaceAll('_',' ')}`} · {entry.reason.replaceAll('_',' ')}</li>)}</ul></details>}
    <PortalModal isOpen={confirmStop} onClose={() => { if (!saving) setConfirmStop(false) }} title="Stop this workflow?" description="This stops the workflow after your review. It does not retry or send a message, and it keeps the existing action and delivery history." footer={<><PortalButton disabled={saving} onClick={() => setConfirmStop(false)}>Keep reviewing</PortalButton><PortalButton variant="danger" disabled={saving} onClick={() => void stopAfterReview()}>{saving ? 'Stopping…' : 'Stop workflow'}</PortalButton></>}>
      <p className="text-sm text-[color:var(--portal-text)]">{resolution?.detail}</p>
      <p className="mt-3 text-sm text-[color:var(--portal-muted)]">If a send outcome is uncertain, check the provider before contacting this lead or starting another workflow.</p>
      <p className="mt-2 text-sm text-[color:var(--portal-muted)]">The current action will be checked again before the workflow stops.</p>
      {resolutionError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{resolutionError}</p>}
    </PortalModal>
  </>
}
