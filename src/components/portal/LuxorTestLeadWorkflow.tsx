'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Download, FileText, Mail, ReceiptText, RotateCcw, Send, WalletCards } from 'lucide-react'
import { PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'

type Section = 'proposals' | 'documents' | 'contract' | 'payments' | 'planning'
type Artifact = { id: string; test_run_id: string; artifact_type: string; status: string; details: Record<string, unknown> }
type Activity = { id: number; event_type: string; status: string | null; created_at: string; details: Record<string, unknown> }
type TestEmail = { id: number; test_run_id: string; category: string; status: string; created_at: string; actual_recipient: string | null; details: Record<string, unknown> }
type InvoiceSnapshot = {
  id: string
  updated_at?: string
  total: number
  event_type: string | null
  description: string | null
  line_items?: Array<{ description?: string; quantity?: number; unit_price?: number; total?: number }>
  proposal_context?: Record<string, unknown> | null
}
type BookingSnapshot = {
  event_date: string | null
  start_time: string | null
  end_time: string | null
  guest_count: number | null
  event_type: string | null
  package_name: string | null
  contract_total: number
  deposit_required: number
  final_payment_due_date: string | null
}
type WorkflowPayload = {
  runs?: Array<{ id: string; status: string }>
  artifacts?: Artifact[]
  activity?: Activity[]
  emails?: TestEmail[]
}

const panelClass = 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm'
const inputClass = 'mt-1 block min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-sm text-[color:var(--portal-text)]'
const actionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45'
const secondaryClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-2 text-xs font-semibold text-[color:var(--portal-text)] disabled:cursor-not-allowed disabled:opacity-45'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0)
}

function statusLabel(status: string | undefined) {
  return (status || 'not started').replaceAll('_', ' ')
}

export function LuxorTestLeadWorkflow({
  leadName,
  runId,
  section,
  onOpenProposal,
}: {
  leadName: string
  runId: string
  section: Section
  onOpenProposal: () => void
}) {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null)
  const [invoice, setInvoice] = useState<InvoiceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [breakdownPreviewOpen, setBreakdownPreviewOpen] = useState(false)
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [runOfShow, setRunOfShow] = useState('')
  const [vendors, setVendors] = useState('')
  const [operationsNotes, setOperationsNotes] = useState('')
  const [eventDayContact, setEventDayContact] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState('medium')
  const [activityTitle, setActivityTitle] = useState('')
  const [activityBody, setActivityBody] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [workflowResponse, proposalResponse] = await Promise.all([
        fetch('/api/portal/test-lead?page=1', { cache: 'no-store' }),
        fetch(`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(runId)}`, { cache: 'no-store' }),
      ])
      const workflow = workflowResponse.ok ? await workflowResponse.json() as WorkflowPayload : null
      const proposal = proposalResponse.ok ? await proposalResponse.json() as { artifact?: { details?: { invoice?: InvoiceSnapshot } } | null } : null
      if (!workflowResponse.ok) throw new Error('Unable to load this isolated Test Lead run.')
      setPayload(workflow)
      setInvoice(proposal?.artifact?.details?.invoice || null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load this isolated Test Lead run.')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => { void refresh() }, [refresh])

  const run = payload?.runs?.find((item) => item.id === runId)
  const artifacts = useMemo(() => (payload?.artifacts || []).filter((item) => item.test_run_id === runId), [payload?.artifacts, runId])
  const activities = useMemo(() => (payload?.activity || []).filter((item) => {
    const activityRun = (item as Activity & { test_run_id?: string }).test_run_id
    return activityRun === runId
  }).sort((a, b) => a.created_at.localeCompare(b.created_at)), [payload?.activity, runId])
  const artifact = (type: string) => artifacts.find((item) => item.artifact_type === type)
  const proposalArtifact = artifact('proposal')
  const contractArtifact = artifact('contract')
  const invoiceArtifact = artifact('invoice')
  const bookingArtifact = artifact('booking')
  const paymentArtifact = artifact('payment')
  const contractPreview = record(contractArtifact?.details.contract_preview)
  const bookingPreview = record(contractPreview?.booking) as BookingSnapshot | null
  const context = record(invoice?.proposal_context) || {}
  const savedPlanActivity = [...activities].reverse().find((item) => item.event_type === 'event_planning' && record(item.details.eventPlan))
  const savedEventPlan = record(savedPlanActivity?.details.eventPlan)
  const eventComplete = activities.some((item) => item.event_type === 'event_completion')
  const postEventPreview = [...activities].reverse().find((item) => item.event_type === 'post_event_preview')
  const testTasks = activities.filter((item) => item.event_type === 'test_task')
  const completedTaskTitles = new Set(activities.filter((item) => item.event_type === 'test_task_completed').map((item) => String(item.details.title || '')))
  const canCompleteEvent = bookingArtifact?.status === 'confirmed' && paymentArtifact?.status === 'pending' && Boolean(savedPlanActivity)
  const proposalEmails = (payload?.emails || []).filter((email) => email.test_run_id === runId && ['proposal', 'proposal_breakdown'].includes(email.category))
  const proposalRevision = Number(proposalArtifact?.details.proposal_revision) || 0

  useEffect(() => {
    if (!savedPlanActivity) {
      const proposalEventDate = typeof context.event_date === 'string' ? context.event_date : ''
      const proposalGuests = context.expected_guest_count
      setEventDate(proposalEventDate)
      setGuestCount(proposalGuests === undefined || proposalGuests === null ? '' : String(proposalGuests))
      setRunOfShow('')
      setVendors('')
      setOperationsNotes('')
      setEventDayContact('')
      return
    }
    setEventDate(typeof savedEventPlan?.eventDate === 'string' ? savedEventPlan.eventDate : '')
    setGuestCount(savedEventPlan?.expectedGuests === null || savedEventPlan?.expectedGuests === undefined ? '' : String(savedEventPlan.expectedGuests))
    setRunOfShow(typeof savedEventPlan?.runOfShow === 'string' ? savedEventPlan.runOfShow : '')
    setVendors(typeof savedEventPlan?.vendors === 'string' ? savedEventPlan.vendors : '')
    setOperationsNotes(typeof savedEventPlan?.operationsNotes === 'string' ? savedEventPlan.operationsNotes : '')
    setEventDayContact(typeof savedEventPlan?.eventDayContact === 'string' ? savedEventPlan.eventDayContact : '')
  // Rehydrate only from persisted run activity after refresh or run change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, savedPlanActivity?.id, invoice?.id, invoice?.updated_at])

  async function postAction(body: Record<string, unknown>, successText: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, testRunId: runId }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to update the isolated workflow.')
      setNotice(successText)
      await refresh()
      window.dispatchEvent(new CustomEvent('luxor-test-activity-recorded'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update the isolated workflow.')
    } finally {
      setBusy(false)
    }
  }

  async function queueBreakdownEmail() {
    if (!proposalArtifact || proposalRevision < 1) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'breakdown', testRunId: runId, expectedRevision: proposalRevision }),
      })
      const result = await response.json() as { error?: string; replayed?: boolean; recipient?: string }
      if (!response.ok) throw new Error(result.error || 'The test Breakdown email could not be queued.')
      setNotice(result.replayed
        ? `The marked Breakdown email is already queued for ${result.recipient || 'luxoratlaspalmas@gmail.com'}.`
        : `The marked Breakdown email is queued for ${result.recipient || 'luxoratlaspalmas@gmail.com'}.`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The test Breakdown email could not be queued.')
    } finally {
      setBusy(false)
    }
  }

  async function advance(type: string, status: string, details: Record<string, unknown> = {}) {
    await postAction({ action: 'advance', artifactType: type, status, details: { ...details, simulation_only: true } }, `${type.replaceAll('_', ' ')} updated in this test run only.`)
  }

  async function saveEventPlan() {
    const parsedGuests = guestCount.trim() ? Number(guestCount) : null
    if (parsedGuests !== null && (!Number.isInteger(parsedGuests) || parsedGuests < 1 || parsedGuests > 180)) {
      setError('Enter an event guest count from 1 to 180.')
      return
    }
    await postAction({ action: 'record_activity', activityType: 'event_planning', details: {
      title: 'Event plan saved',
      eventPlan: { eventDate, expectedGuests: parsedGuests, runOfShow, vendors, operationsNotes, eventDayContact },
    } }, 'The event plan is saved to this isolated run.')
  }

  async function saveTask() {
    if (!taskTitle.trim()) return
    await postAction({ action: 'record_activity', activityType: 'test_task', details: {
      title: taskTitle.trim(), dueDate: taskDueDate || null, priority: taskPriority,
    } }, 'Task added to isolated Test Lead activity.')
    setTaskTitle('')
    setTaskDueDate('')
    setTaskPriority('medium')
  }

  async function completeTask(title: string) {
    await postAction({ action: 'record_activity', activityType: 'test_task_completed', details: {
      title, completionStatus: 'completed',
    } }, 'Task completion recorded on this test run only.')
  }

  async function recordNote() {
    if (!activityTitle.trim() && !activityBody.trim()) return
    await postAction({ action: 'record_activity', activityType: 'test_note', details: {
      title: activityTitle.trim(), body: activityBody.trim(),
    } }, 'Note saved to isolated Test Lead activity.')
    setActivityTitle('')
    setActivityBody('')
  }

  async function completeEvent() {
    await postAction({ action: 'record_activity', activityType: 'event_completion', details: {
      title: 'Simulated event completed',
      body: 'Event completion recorded in the isolated Test Lead run. No venue event, calendar record, or production booking was created.',
      completionStatus: 'completed',
    } }, 'Simulated event completion saved. No venue event or production record was created.')
  }

  async function preparePostEventPreview() {
    const firstName = leadName.trim().split(/\s+/)[0] || 'there'
    const body = `Hi ${firstName}, thank you for celebrating with Luxor at Las Palmas. We hope your event went beautifully. If you have a moment, we would love to hear how everything went.\n\nThis message is a preview only. It has not been sent.`
    await postAction({ action: 'record_activity', activityType: 'post_event_preview', details: {
      title: 'Post-event follow-up preview (not sent)', body,
    } }, 'Post-event follow-up preview saved. It was not sent or queued.')
  }

  const moneySummary = invoice ? <span>{money(invoice.total)}</span> : <span className="text-[color:var(--portal-muted)]">Save or publish a proposal to add the amount.</span>
  const commonNotice = <>
    {notice ? <p role="status" className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-[color:var(--portal-text)]">{notice}</p> : null}
    {error ? <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-[color:var(--portal-text)]">{error}</p> : null}
    {loading ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-muted)]">Loading isolated run details.</p> : null}
    {!loading && run?.status !== 'in_progress' ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-muted)]">This run is {statusLabel(run?.status)}. Start or resume the active Test Lead run before making changes.</p> : null}
  </>

  if (!runId) return null

  return (
    <section className={`${panelClass} mb-5`} aria-label={`Isolated Test Lead ${section} workflow`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Isolated Test Lead run</p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-[color:var(--portal-text)]">
            {section === 'proposals' || section === 'documents' || section === 'contract' ? <FileText size={16} /> : section === 'payments' ? <WalletCards size={16} /> : <CalendarDays size={16} />}
            {section === 'proposals' ? 'Proposal simulation' : section === 'documents' ? 'Test document review' : section === 'contract' ? 'Contract and booking simulation' : section === 'payments' ? 'Invoice and payment simulation' : 'Event planning and completion'}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--portal-muted)]">
            Run {runId.slice(0, 8)} · simulated values remain with this run and never reserve availability, create production records, move money, or send messages.
          </p>
        </div>
        <button type="button" disabled={busy || loading} onClick={() => void refresh()} className={secondaryClass}><RotateCcw size={13} /> Refresh run</button>
      </div>

      {section === 'proposals' ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Saved proposal</h3>
            <span className="rounded-full border border-[color:var(--portal-border)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[color:var(--portal-text)]">{statusLabel(proposalArtifact?.status)}</span>
          </div>
          {proposalArtifact && invoice ? <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <p><span className="text-[color:var(--portal-muted)]">Event:</span> <span className="text-[color:var(--portal-text)]">{String(invoice.event_type || context.event_type || 'Event')}</span></p>
            <p><span className="text-[color:var(--portal-muted)]">Date:</span> <span className="text-[color:var(--portal-text)]">{String(context.event_date || 'Not set')}</span></p>
            <p><span className="text-[color:var(--portal-muted)]">Guests:</span> <span className="text-[color:var(--portal-text)]">{String(context.expected_guest_count || 'Not set')}</span></p>
            <p><span className="text-[color:var(--portal-muted)]">Proposal total:</span> <span className="font-semibold text-[color:var(--portal-text)]">{moneySummary}</span></p>
            <p className="sm:col-span-2"><span className="text-[color:var(--portal-muted)]">Description:</span> <span className="text-[color:var(--portal-text)]">{invoice.description || 'No description saved.'}</span></p>
          </div> : <p className="mt-2 text-xs text-[color:var(--portal-muted)]">No proposal draft has been saved in this run yet. Complete an attended simulated tour before creating one.</p>}
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-64 lg:justify-end">
          <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={onOpenProposal} className={actionClass}><FileText size={13} /> {proposalArtifact?.status === 'drafted' ? 'Reopen proposal draft' : 'Open proposal builder'}</button>
          {proposalArtifact?.status === 'sent' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('proposal', 'accepted', { acceptance_simulated: true, legal_effect: false })} className={secondaryClass}><CheckCircle2 size={13} /> Accept in simulation</button> : null}
        </div>
        {proposalArtifact && invoice ? <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Proposal review</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Revision {proposalRevision} · the PDF and Breakdown use this saved test snapshot.</p></div>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(runId)}&format=pdf`} target="_blank" rel="noreferrer" className={secondaryClass}><Download size={13} /> Review test PDF</a>
              <button type="button" disabled={busy || run?.status !== 'in_progress' || proposalRevision < 1 || !['drafted', 'sent'].includes(proposalArtifact.status)} onClick={() => void queueBreakdownEmail()} className={actionClass}><Mail size={13} /> Queue Breakdown to test inbox</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-3">
            <p className="text-[11px] text-[color:var(--portal-muted)]">Rendered with the shared Luxor Breakdown email and frozen proposal snapshot. Queueing stores a marked test email for the verified Luxor inbox.</p>
            <button type="button" onClick={() => setBreakdownPreviewOpen((open) => !open)} disabled={busy} className={secondaryClass}>{breakdownPreviewOpen ? 'Hide email preview' : 'Review email preview'}</button>
          </div>
          {breakdownPreviewOpen ? <iframe title="Isolated test Proposal Breakdown email preview" sandbox="" src={`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(runId)}&format=breakdown-preview`} className="mt-3 h-[640px] w-full rounded-lg border border-[color:var(--portal-border)] bg-white" /> : null}
          {proposalEmails.length ? <div className="mt-4 border-t border-[color:var(--portal-border)] pt-3"><h4 className="text-xs font-semibold text-[color:var(--portal-text)]">Proposal email history</h4><ul className="mt-2 space-y-2">{[...proposalEmails].reverse().slice(0, 6).map((email) => <li key={email.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="text-[color:var(--portal-text)]">{email.category === 'proposal_breakdown' ? 'Proposal Breakdown' : 'Final proposal'} · {statusLabel(email.status)}</span><span className="text-[color:var(--portal-muted)]">{email.actual_recipient || 'Verified Luxor test inbox'} · {new Date(email.created_at).toLocaleString()}</span></li>)}</ul></div> : <p className="mt-3 text-[11px] text-[color:var(--portal-muted)]">No proposal email is queued for this run yet.</p>}
        </div> : null}
        <p className="text-[11px] leading-5 text-[color:var(--portal-muted)] lg:col-span-2">The proposal stays in this run’s isolated artifacts. PDF review has a nonbinding test watermark, and no canonical invoice, customer link, booking, signature, payment, availability, or analytics record is created.</p>
      </div> : null}

      {section === 'documents' ? <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Saved test proposal</h3><span className="text-xs text-[color:var(--portal-muted)]">{proposalArtifact ? `Revision ${proposalRevision}` : 'Not saved'}</span></div>
          {proposalArtifact && invoice ? <>
            <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">This watermarked PDF is rendered from the isolated proposal snapshot. It has no customer link and cannot be accepted.</p>
            <a href={`/api/portal/test-lead/proposal?testRunId=${encodeURIComponent(runId)}&format=pdf`} target="_blank" rel="noreferrer" className={`${secondaryClass} mt-3`}><Download size={13} /> Review test proposal PDF</a>
          </> : <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Save a proposal in the Proposals tab to add its isolated PDF here.</p>}
        </div>
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Agreement preview</h3><span className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(contractArtifact?.status)}</span></div>
          {contractPreview && ['prepared', 'sent', 'signed'].includes(contractArtifact?.status || '') ? <>
            <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">The shared agreement renderer watermarks every page. Simulated delivery and signature checkpoints have no legal effect.</p>
            <a href={`/api/portal/test-lead/contract-preview?testRunId=${encodeURIComponent(runId)}`} target="_blank" rel="noreferrer" className={`${secondaryClass} mt-3`}><FileText size={13} /> Review test agreement</a>
          </> : <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Prepare a watermarked preview in Booking &amp; Contract after accepting the isolated proposal.</p>}
        </div>
      </div> : null}

      {section === 'contract' ? <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Contract preview</h3><span className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(contractArtifact?.status)}</span></div>
            <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">The existing Luxor agreement generator uses the saved accepted proposal and payment terms. This file is watermarked on every page as a simulated preview and has no legal effect.</p>
            {proposalArtifact?.status !== 'accepted' ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Publish and accept the proposal in the simulator to prepare a contract preview.</p> : null}
            {proposalArtifact?.status === 'accepted' && !contractPreview ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void postAction({ action: 'prepare_contract_preview' }, 'Watermarked contract preview prepared and saved to the isolated run.')} className={`${actionClass} mt-3`}><FileText size={13} /> Prepare preview</button> : null}
            {contractArtifact?.status === 'prepared' ? <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('contract', 'sent', { delivery_simulated: true, external_delivery: false })} className={secondaryClass}>Advance simulated delivery status</button>
            </div> : null}
            {contractArtifact?.status === 'sent' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('contract', 'signed', { signature_simulated: true, legal_effect: false, signature_request_created: false })} className={`${secondaryClass} mt-3`}>Advance simulated signature checkpoint</button> : null}
            {contractArtifact?.status === 'signed' ? <p role="status" className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">Signature checkpoint simulated. There is no real signature, signature request, signed contract, or legal acceptance.</p> : null}
          </div>
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Simulated booking</h3><span className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(bookingArtifact?.status)}</span></div>
            {bookingPreview ? <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <p><span className="text-[color:var(--portal-muted)]">Date:</span> <span className="text-[color:var(--portal-text)]">{bookingPreview.event_date || 'Not set'}</span></p>
              <p><span className="text-[color:var(--portal-muted)]">Guests:</span> <span className="text-[color:var(--portal-text)]">{bookingPreview.guest_count || 'Not set'}</span></p>
              <p><span className="text-[color:var(--portal-muted)]">Package:</span> <span className="text-[color:var(--portal-text)]">{bookingPreview.package_name || 'Custom event'}</span></p>
              <p><span className="text-[color:var(--portal-muted)]">Proposal total:</span> <span className="text-[color:var(--portal-text)]">{money(bookingPreview.contract_total)}</span></p>
            </div> : <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Booking details appear after the accepted proposal has been used to prepare a contract preview.</p>}
            {contractArtifact?.status === 'signed' && bookingArtifact?.status === 'simulated' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('booking', 'tentative', { inventory_reserved: false, production_booking_created: false })} className={`${actionClass} mt-3`}>Create simulated booking view</button> : null}
            {bookingArtifact?.status === 'tentative' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('booking', 'confirmed', { inventory_reserved: false, production_booking_created: false })} className={`${actionClass} mt-3`}>Confirm in simulation · no slot block</button> : null}
            {bookingArtifact && bookingArtifact.status !== 'simulated' ? <p className="mt-3 text-[11px] text-[color:var(--portal-muted)]">This booking status is isolated to the run. Availability, calendar, booking records, and analytics are unchanged.</p> : null}
          </div>
        </div>
        {contractPreview && ['prepared', 'sent', 'signed'].includes(contractArtifact?.status || '') ? <div className="overflow-hidden rounded-xl border border-amber-500/40 bg-[color:var(--portal-card)]">
          <div className="border-b border-amber-500/30 bg-amber-500/5 px-4 py-3"><p className="text-sm font-bold text-[color:var(--portal-text)]">SIMULATED PREVIEW — NOT FOR SIGNING — NO LEGAL EFFECT</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Do not sign, return, or send this preview. There is no real agreement or signature record.</p></div>
          <iframe title="Watermarked simulated contract preview" src={`/api/portal/test-lead/contract-preview?testRunId=${encodeURIComponent(runId)}`} className="h-[680px] w-full bg-white" />
        </div> : null}
      </div> : null}

      {section === 'payments' ? <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-text)]"><ReceiptText size={15} /> Simulated invoice</h3><span className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(invoiceArtifact?.status)}</span></div>
          {invoice ? <div className="mt-3 space-y-2 text-xs text-[color:var(--portal-text)]"><p>Proposal amount · <strong>{money(invoice.total)}</strong></p><p>Invoice date/status · <span className="capitalize">{statusLabel(invoiceArtifact?.status)}</span></p><p className="text-[color:var(--portal-muted)]">This is an artifact view only. No production invoice or reminder is created.</p></div> : <p className="mt-2 text-xs text-[color:var(--portal-muted)]">A saved proposal supplies the simulated invoice amount.</p>}
          {contractArtifact?.status === 'signed' && invoiceArtifact?.status === 'simulated' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('invoice', 'issued', { total: Number(invoice?.total) || 0, production_invoice_created: false, external_reminder_queued: false })} className={`${actionClass} mt-3`}><ReceiptText size={13} /> Issue in simulation</button> : null}
        </div>
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-text)]"><WalletCards size={15} /> Simulated payment</h3><span className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(paymentArtifact?.status)}</span></div>
          <p className="mt-3 text-xs text-[color:var(--portal-text)]">Simulated reservation payment · <strong>{bookingPreview ? money(bookingPreview.deposit_required) : 'Available after contract preview'}</strong></p>
          <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">No processor request, payment row, charge, refund, or money movement is performed.</p>
          {invoiceArtifact?.status === 'issued' && bookingArtifact?.status === 'confirmed' && paymentArtifact?.status === 'simulated' ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('payment', 'pending', { amount: Number(bookingPreview?.deposit_required) || 0, processor_request_created: false, money_moved: false })} className={`${actionClass} mt-3`}>Start simulated payment state</button> : null}
          {paymentArtifact?.status === 'pending' && eventComplete ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void advance('payment', 'paid', { amount: Number(bookingPreview?.deposit_required) || 0, payment_simulated: true, money_moved: false })} className={`${secondaryClass} mt-3`}>Finish run · simulate settlement</button> : null}
          {paymentArtifact?.status === 'pending' && !eventComplete ? <p className="mt-3 text-[11px] text-[color:var(--portal-muted)]">Complete event planning and record the simulated event before closing this run with a simulated settlement.</p> : null}
          {paymentArtifact?.status === 'paid' ? <p role="status" className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">Settlement status is simulated only; no money moved.</p> : null}
        </div>
      </div> : null}

      {section === 'planning' ? <div className="space-y-4">
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Event plan · saved with this run</h3>
          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Use this simulated run-of-show to exercise the normal event-planning workflow. Nothing is written to a real booking, calendar, vendor, or customer record.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Event date<PortalDatePicker value={eventDate} onChange={setEventDate} placeholder="Choose event date" /></label>
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Expected guests<input type="number" min={1} max={180} value={guestCount} onChange={(event) => setGuestCount(event.target.value)} className={inputClass} /></label>
            <label className="text-xs font-semibold text-[color:var(--portal-muted)] md:col-span-2">Run of show<textarea value={runOfShow} onChange={(event) => setRunOfShow(event.target.value)} rows={5} maxLength={4000} className={inputClass} placeholder="Example: vendor arrival, setup, guest arrival, program, cleanup" /></label>
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Vendors and arrival notes<textarea value={vendors} onChange={(event) => setVendors(event.target.value)} rows={3} maxLength={2000} className={inputClass} /></label>
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Operations notes<textarea value={operationsNotes} onChange={(event) => setOperationsNotes(event.target.value)} rows={3} maxLength={2000} className={inputClass} /></label>
            <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Event-day contact<input value={eventDayContact} onChange={(event) => setEventDayContact(event.target.value)} maxLength={160} className={inputClass} /></label>
            <div className="flex items-end"><button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void saveEventPlan()} className={actionClass}><CalendarDays size={13} /> Save isolated event plan</button></div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Tasks and notes</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">New task<input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} className={inputClass} /></label>
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Priority<PortalSelect value={taskPriority} onChange={setTaskPriority} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} /></label>
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Due date<PortalDatePicker value={taskDueDate} onChange={setTaskDueDate} placeholder="No due date" /></label>
              <div className="flex items-end"><button type="button" disabled={busy || !taskTitle.trim() || run?.status !== 'in_progress'} onClick={() => void saveTask()} className={actionClass}>Add isolated task</button></div>
            </div>
            <div className="mt-3 space-y-2">{testTasks.map((task) => {
              const title = String(task.details.title || 'Untitled task')
              const done = completedTaskTitles.has(title)
              return <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs">
                <span className="flex items-center gap-2 text-[color:var(--portal-text)]"><CheckCircle2 size={14} className={done ? 'text-emerald-600' : 'text-[color:var(--portal-muted)]'} /> {title} <span className="text-[color:var(--portal-muted)]">· {String(task.details.priority || 'medium')}</span></span>
                {!done ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void completeTask(title)} className={secondaryClass}>Complete</button> : <span className="text-emerald-700 dark:text-emerald-300">Completed in simulation</span>}
              </div>
            })}</div>
            <div className="mt-4 grid gap-2">
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Add a note<textarea value={activityBody} onChange={(event) => setActivityBody(event.target.value)} rows={2} maxLength={2000} className={inputClass} /></label>
              <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Note title<input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} maxLength={160} className={inputClass} /></label>
              <button type="button" disabled={busy || (!activityTitle.trim() && !activityBody.trim()) || run?.status !== 'in_progress'} onClick={() => void recordNote()} className={`${secondaryClass} justify-self-start`}>Save isolated note</button>
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
            <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Event completion and follow-up</h3>
            <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Record completion after a plan, confirmed simulated booking, and pending simulated payment are present. The follow-up can then be previewed without creating or sending an email.</p>
            {!eventComplete ? <button type="button" disabled={busy || !canCompleteEvent || run?.status !== 'in_progress'} onClick={() => void completeEvent()} className={`${actionClass} mt-3`}><CheckCircle2 size={13} /> Record simulated event completion</button> : <p role="status" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={14} /> Event completion saved in isolated activity.</p>}
            {!canCompleteEvent && !eventComplete ? <p className="mt-2 text-[11px] text-[color:var(--portal-muted)]">Needed first: save the event plan, confirm the simulated booking, and create the pending simulated payment.</p> : null}
            {eventComplete && !postEventPreview ? <button type="button" disabled={busy || run?.status !== 'in_progress'} onClick={() => void preparePostEventPreview()} className={`${secondaryClass} mt-3`}><Send size={13} /> Prepare follow-up preview · not sent</button> : null}
            {postEventPreview ? <div className="mt-3 rounded-lg border border-amber-500/30 bg-[color:var(--portal-card)] p-3"><p className="text-xs font-bold text-[color:var(--portal-text)]">Post-event message preview · not sent</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[color:var(--portal-muted)]">{String(postEventPreview.details.body || '')}</p><p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">No message was queued or delivered.</p></div> : null}
            {paymentArtifact?.status === 'pending' && eventComplete ? <p className="mt-3 text-[11px] text-[color:var(--portal-muted)]">After reviewing the follow-up, finish the simulation from Payments by recording simulated settlement. This closes the run; no payment is sent or collected.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
          <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Recent run activity</h3>
          {activities.length ? <ol className="mt-3 space-y-2">{[...activities].reverse().slice(0, 8).map((activity) => <li key={activity.id} className="flex flex-wrap justify-between gap-2 border-b border-[color:var(--portal-border)] pb-2 text-xs last:border-0"><span className="text-[color:var(--portal-text)]">{String(activity.details.title || activity.event_type.replaceAll('_', ' '))}</span><time className="text-[color:var(--portal-muted)]">{new Date(activity.created_at).toLocaleString()}</time></li>)}</ol> : <p className="mt-2 text-xs text-[color:var(--portal-muted)]">No isolated activity has been recorded yet.</p>}
        </div>
      </div> : null}

      {commonNotice}
    </section>
  )
}
