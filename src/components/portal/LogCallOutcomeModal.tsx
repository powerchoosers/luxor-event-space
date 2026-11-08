'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, Check, Phone } from '@/lib/icons/phosphor-compat'
import type { LuxorInquiry, LuxorTask } from '@/lib/luxorInquiryTypes'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { useToast } from '@/components/portal/ToastProvider'
import { WorkflowBadge } from '@/components/portal/WorkflowBadge'
import { selectNextFollowUpDisplay, type ScheduledFollowUpSummary, type WorkflowPreviewResponse } from '@/lib/luxorNextFollowUpDisplay'
import { recordCallWithoutWorkflowAdvance } from '@/lib/luxorCallStopIntent'
import {
  localLuxorIso,
  luxorDate,
  luxorTimeInput,
  luxorToday,
  manualFollowUpDescription,
  type FollowUpChannel,
} from '@/lib/luxorFollowUpHelpers'

export type MinimalLead = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  tour_attendance_status?: string | null
  status?: string | null
}

export type LogCallOutcomeModalProps = {
  isOpen: boolean
  onClose: () => void
  lead: MinimalLead | LuxorInquiry | null
  task?: LuxorTask | null
  onSaved?: (result: { outcome: string; nextStep: string; lead: MinimalLead | LuxorInquiry }) => void | Promise<void>
  onOpenLeadWorkspace?: (lead: MinimalLead | LuxorInquiry, stage: 'tour' | 'proposal') => void
  onComposeEmail?: (lead: MinimalLead | LuxorInquiry) => void
}

function modalDateLabel(dueAt: string | null, dueDate: string | null): string {
  if (dueAt) {
    const value = new Date(dueAt)
    if (!Number.isFinite(value.getTime())) return 'Date unavailable'
    const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(value)
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).format(value)
    return `${date} at ${time} Central`
  }
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.slice(0, 10))) return 'Date unavailable'
  const value = new Date(`${dueDate.slice(0, 10)}T12:00:00Z`)
  return Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value)
    : 'Date unavailable'
}

export function LogCallOutcomeModal({
  isOpen,
  onClose,
  lead,
  task,
  onSaved,
  onOpenLeadWorkspace,
  onComposeEmail,
}: LogCallOutcomeModalProps) {
  const { notify } = useToast()
  const today = luxorToday()

  const [callOutcome, setCallOutcome] = useState('')
  const [callNote, setCallNote] = useState('')
  const [nextStep, setNextStep] = useState('none')
  const [nextDate, setNextDate] = useState('')
  const [nextTime, setNextTime] = useState('10:00')
  const [nextChannel, setNextChannel] = useState<FollowUpChannel>('phone')
  const [saving, setSaving] = useState(false)
  const [stopIntentAttempted, setStopIntentAttempted] = useState(false)
  const savingRef = useRef(false)
  const continueRequestId = useRef<string | null>(null)

  // Next scheduled task state & inline editing
  const [nextScheduledTask, setNextScheduledTask] = useState<ScheduledFollowUpSummary | null>(null)
  const [previewNotice, setPreviewNotice] = useState<string | null>(null)
  const [loadingNext, setLoadingNext] = useState(false)
  const [editingNextTask, setEditingNextTask] = useState<LuxorTask | null>(null)
  const [editNextDate, setEditNextDate] = useState('')
  const [editNextTime, setEditNextTime] = useState('09:00')
  const [savingNextTask, setSavingNextTask] = useState(false)

  // Reset state when opening/closing
  useEffect(() => {
    if (!isOpen || !lead) {
      setCallOutcome('')
      setCallNote('')
      setNextStep('none')
      setNextDate('')
      setNextTime('10:00')
      setNextChannel('phone')
      setEditingNextTask(null)
      setNextScheduledTask(null)
      setPreviewNotice(null)
      setStopIntentAttempted(false)
      continueRequestId.current = null
      return
    }

    // Load lead's tasks to identify next scheduled follow-up
    let active = true
    setLoadingNext(true)

    const taskRequest = fetch(`/api/tasks?inquiryId=${encodeURIComponent(lead.id)}`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('Tasks unavailable'); return res.json() as Promise<LuxorTask[]> })
    const previewRequest = task
      ? fetch(`/api/workflow-next-preview?inquiryId=${encodeURIComponent(lead.id)}&taskId=${encodeURIComponent(task.id)}`, { cache: 'no-store' })
        .then((res) => { if (!res.ok) throw new Error('Preview unavailable'); return res.json() as Promise<WorkflowPreviewResponse> })
      : Promise.resolve<WorkflowPreviewResponse>({ mode: 'legacy' })
    Promise.allSettled([taskRequest, previewRequest])
      .then(([tasksResult, previewResult]) => {
        if (!active) return
        const display = selectNextFollowUpDisplay(tasksResult, previewResult, task?.id)
        setNextScheduledTask(display.summary)
        setPreviewNotice(display.notice)
      })
      .catch(() => {
        if (active) { setNextScheduledTask(null); setPreviewNotice('The next follow-up could not be loaded.') }
      })
      .finally(() => {
        if (active) setLoadingNext(false)
      })

    return () => {
      active = false
    }
  }, [isOpen, lead, task])

  function handleEditScheduledTask(targetTask: LuxorTask) {
    setEditingNextTask(targetTask)
    setEditNextDate(targetTask.due_at ? luxorDate(targetTask.due_at) : targetTask.due_date?.slice(0, 10) ?? '')
    setEditNextTime(targetTask.due_at ? luxorTimeInput(targetTask.due_at) : '09:00')
  }

  async function handleSaveScheduledTask() {
    if (!editingNextTask || !editNextDate || !editNextTime || savingNextTask) return
    setSavingNextTask(true)
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNextTask.id,
          due_date: editNextDate,
          due_at: localLuxorIso(editNextDate, editNextTime),
        }),
      })
      if (!response.ok) throw new Error('The follow-up could not be rescheduled.')
      const updated = await response.json() as LuxorTask
      setNextScheduledTask((prev) => (prev ? { ...prev, dueAt: updated.due_at ?? null, dueDate: updated.due_date ?? null, task: updated } : null))
      setEditingNextTask(null)
      notify({ title: 'Follow-up rescheduled', description: modalDateLabel(localLuxorIso(editNextDate, editNextTime), null), variant: 'success' })
    } catch (error) {
      notify({ title: 'Follow-up could not be rescheduled', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' })
    } finally {
      setSavingNextTask(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lead || !callOutcome || savingRef.current || stopIntentAttempted) return
    savingRef.current = true
    setSaving(true)

    let callOutcomeSaved = false
    let taskCompleted = false
    let atomicRequestAttempted = false
    let workflowOutcomeRecorded = false
    let workflowActivationConfirmed = false
    const atomicAdoptedAttempt = Boolean(task?.id && task.adoption_designation === 'current' && nextStep === 'none')

    try {
      // Completing a task can immediately advance either a system or custom
      // workflow. The brochure-only stop endpoint is not an atomic stop for
      // the task's owning workflow, so never complete before a verified stop.
      if (nextStep === 'stop' || nextStep === 'nurture' || callOutcome === 'not_interested') {
        setStopIntentAttempted(true)
        // This path is separately gated off by default on both client and
        // server. A lost/invalid response may follow a committed transaction:
        // do not fall back to another note or retry from this modal.
        if (process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_INTENT_ENABLED === 'true'
          && callOutcome !== 'not_interested' && task?.id) {
          const intent = nextStep === 'nurture' ? 'nurture' : 'stop'
          const outcome = callOutcome === 'no_answer' ? 'no_answer' : callOutcome === 'voicemail_left' ? 'voicemail_left' : 'reached'
          const requestId = crypto.randomUUID()
          atomicRequestAttempted = true
          const response = await fetch('/api/workflow-call-intent', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, inquiryId: lead.id, taskId: task.id, intent, outcome, note: callNote }),
          }).catch(() => { throw new Error('The call outcome could not be confirmed. Refresh the lead and review the task and workflow before retrying.') })
          const result: unknown = await response.json().catch(() => null)
          if (!response.ok || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'stopped'
            || !('intent' in result) || result.intent !== intent || !('taskId' in result) || result.taskId !== task.id
            || !('noteId' in result) || typeof result.noteId !== 'string' || !result.noteId) {
            throw new Error('The call outcome could not be confirmed. Refresh the lead and review the task and workflow before retrying.')
          }
          atomicRequestAttempted = false
          callOutcomeSaved = true
          taskCompleted = true
          notify({ title: intent === 'nurture' ? 'Call saved; lead moved to nurture' : 'Call saved; workflow stopped', variant: 'success' })
          const savedLead = lead
          onClose()
          if (onSaved) await onSaved({ outcome: callOutcome, nextStep, lead: savedLead })
          return
        }
        const result = await recordCallWithoutWorkflowAdvance({ inquiryId: lead.id, taskId: task?.id, outcome: callOutcome, note: callNote, intent: nextStep === 'nurture' ? 'nurture' : 'stop' })
        const description = nextStep === 'nurture'
          ? `${result.noteConfirmed ? 'The call note was saved.' : 'The call note could not be confirmed; check the timeline before retrying.'} This form did not complete the task or move the lead to nurture. Review the task and workflow before continuing.`
          : result.failure === 'decline_unconfirmed'
          ? `The decline could not be confirmed. ${result.noteConfirmed ? 'The call note was saved. ' : 'The call note could not be confirmed. '}Check the lead before retrying. This form did not complete the task or confirm the workflow stopped.`
          : result.failure === 'note_unconfirmed'
            ? `${result.declineConfirmed ? 'Decline recorded. ' : ''}The call note could not be confirmed. Check the timeline before retrying. The task was not completed and workflow stopping was not confirmed.`
            : `The call note was saved.${result.declineConfirmed ? ' The decline was recorded.' : ''} This form did not complete the task or confirm the workflow stopped. Check the task and workflow before continuing.`
        notify({ title: result.noteConfirmed ? 'Call note saved; follow-up needs review' : 'Call outcome needs review', description, variant: 'error' })
        return
      }

      // An uncertain response may have committed; never issue a fallback.
      if (process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED === 'true'
        && task?.id && !atomicAdoptedAttempt && nextStep === 'none') {
        const outcome = callOutcome === 'no_answer' ? 'no_answer' : callOutcome === 'voicemail_left' ? 'voicemail_left' : 'reached'
        continueRequestId.current ??= crypto.randomUUID()
        setStopIntentAttempted(true)
        atomicRequestAttempted = true
        const response = await fetch('/api/workflow-call-continue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: continueRequestId.current, inquiryId: lead.id, taskId: task.id, outcome, label: callOutcome, note: callNote }),
        }).catch(() => { throw new Error('The call outcome could not be confirmed. Refresh and review before retrying.') })
        const result: unknown = await response.json().catch(() => null)
        if (!response.ok || !result || typeof result !== 'object' || !('status' in result) || result.status !== 'completed'
          || !('taskId' in result) || result.taskId !== task.id || !('noteId' in result) || typeof result.noteId !== 'string' || !result.noteId
          || !('workflowKind' in result) || (result.workflowKind !== 'system' && result.workflowKind !== 'custom')) {
          throw new Error('The call outcome could not be confirmed. Refresh and review before retrying.')
        }
        atomicRequestAttempted = false
        callOutcomeSaved = true
        taskCompleted = true
        notify({ title: 'Call outcome saved', description: 'Check follow-up activity for the next action.', variant: 'success' })
        const savedLead = lead
        onClose()
        if (onSaved) await onSaved({ outcome: callOutcome, nextStep, lead: savedLead })
        return
      }

      // A reached outcome must be recorded against the actual workflow, and a
      // manual next step must not race an automatic successor. Until one atomic
      // owner-aware operation exists, preserve the note without completing work.
      if (nextStep === 'later' || (!atomicAdoptedAttempt && !['no_answer', 'voicemail_left'].includes(callOutcome))) {
        setStopIntentAttempted(true)
        const isManual = nextStep === 'later'
        const result = await recordCallWithoutWorkflowAdvance({
          inquiryId: lead.id, taskId: task?.id, outcome: callOutcome, note: callNote,
          intent: isManual ? 'review_manual' : 'review_reached',
          requestedNext: isManual && nextDate ? `${nextChannel === 'email' ? 'Email' : 'Call'} — ${modalDateLabel(localLuxorIso(nextDate, nextTime), null)}` : undefined,
        })
        notify({
          title: result.noteConfirmed ? 'Call note saved; follow-up needs review' : 'Call outcome needs review',
          description: result.noteConfirmed
            ? `The call note was saved. ${isManual ? 'This form did not schedule the requested follow-up. ' : ''}${!['no_answer', 'voicemail_left'].includes(callOutcome) ? 'This form did not record a workflow response. ' : ''}${task ? 'This form left the task open.' : 'No task was completed.'} Review the workflow before continuing.`
            : `The call note could not be confirmed. Check the timeline before retrying. ${task ? 'The task remains open.' : 'No task was completed.'} No follow-up was scheduled.`,
          variant: 'error',
        })
        return
      }

      // 2. Complete task if linked
      const mappedOutcome = callOutcome === 'no_answer' ? 'no_answer' : callOutcome === 'voicemail_left' ? 'voicemail_left' : 'reached'
      if (task) {
        if (atomicAdoptedAttempt) {
          // A lost response can follow a commit. Keep the modal open and do not
          // issue fallback writes until the saved state has been reviewed.
          setStopIntentAttempted(true)
          atomicRequestAttempted = true
        }
        const response = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            status: 'completed',
            ...(atomicAdoptedAttempt ? { atomicAdoptedOnly: true, nextStep: 'none', callLabel: callOutcome, callNote }
              : { completed_at: new Date().toISOString() }),
            call_outcome: mappedOutcome,
          }),
        }).catch((error: unknown) => {
          if (atomicAdoptedAttempt) throw new Error('The call outcome could not be confirmed. Refresh the lead and review the task and workflow before retrying.')
          throw error
        })
        if (!response.ok) {
          if (atomicAdoptedAttempt) throw new Error('The call outcome could not be confirmed. Refresh the lead and review the task and workflow before retrying.')
          const payload = await response.json().catch(() => ({}))
          throw new Error(typeof payload.error === 'string' ? payload.error : 'The task could not be updated.')
        }
        if (atomicAdoptedAttempt) {
          const result: unknown = await response.json().catch(() => null)
          if (!result || typeof result !== 'object' || !('id' in result) || result.id !== task.id
            || !('status' in result) || result.status !== 'completed'
            || !('workflow_outcome_recorded' in result) || result.workflow_outcome_recorded !== true) {
            throw new Error('The call outcome could not be confirmed. Refresh the lead and review the task and workflow before retrying.')
          }
          workflowOutcomeRecorded = true
          const activation = 'workflow_activation' in result && result.workflow_activation && typeof result.workflow_activation === 'object'
            ? result.workflow_activation : null
          workflowActivationConfirmed = Boolean(activation && 'status' in activation && activation.status === 'armed'
            && 'effectiveDueAt' in activation && typeof activation.effectiveDueAt === 'string'
            && Number.isFinite(Date.parse(activation.effectiveDueAt)))
          atomicRequestAttempted = false
        }
        taskCompleted = true
      }

      // 3. If reached, record response
      if (!workflowOutcomeRecorded && mappedOutcome === 'reached' && callOutcome !== 'not_interested') {
        await fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryId: lead.id, action: 'response' }),
        }).catch(() => {})
      }

      // 4. Save note to lead timeline
      if (!workflowOutcomeRecorded) {
        const noteResponse = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiryId: lead.id,
            content: `Manual call outcome: ${callOutcome.replaceAll('_', ' ')}.${callNote.trim() ? ` ${callNote.trim()}` : ''}`,
            noteType: 'status_change',
            taskId: task?.id,
          }),
        })
        if (!noteResponse.ok) throw new Error('The call note could not be confirmed. Check the timeline before retrying.')
      }

      callOutcomeSaved = true

      // 5. Handle Next Step: Schedule another follow-up
      if (callOutcome !== 'not_interested' && nextStep === 'later' && nextDate) {
        const isPostTour = lead.tour_attendance_status === 'attended'
        const followUp = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiryId: lead.id,
            title: 'Follow up after call',
            description: manualFollowUpDescription(nextChannel, isPostTour),
            dueDate: nextDate,
            dueAt: localLuxorIso(nextDate, nextTime),
            priority: 'medium',
          }),
        })
        if (!followUp.ok) throw new Error('Call note saved, but the next follow-up could not be scheduled.')
      }

      notify(workflowOutcomeRecorded && !workflowActivationConfirmed
        ? {
          title: 'Call saved; follow-up needs review',
          description: 'The call and note were saved. Follow-up scheduling could not be confirmed; review the workflow before continuing.',
          variant: 'error',
        }
        : {
          title: 'Call outcome saved',
          description: workflowOutcomeRecorded ? 'The call and note were saved. The next workflow email is scheduled.'
            : nextStep === 'later' ? 'The dated manual follow-up was scheduled.' : "The call outcome was saved to this lead's timeline.",
          variant: 'success',
        })

      const completedLead = lead
      const chosenStep = nextStep
      onClose()

      if (onSaved) {
        await onSaved({ outcome: callOutcome, nextStep: chosenStep, lead: completedLead })
      }

      if (chosenStep === 'tour' || chosenStep === 'proposal') {
        onOpenLeadWorkspace?.(completedLead, chosenStep)
      } else if (chosenStep === 'thank_you') {
        if (onComposeEmail) {
          onComposeEmail(completedLead)
        } else {
          window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: completedLead } }))
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again in a moment.'
      notify({
        title: atomicRequestAttempted ? 'Call outcome needs review' : callOutcomeSaved ? 'Call outcome saved; next step needs review' : taskCompleted ? 'Task completed; call note needs review' : 'Call outcome was not fully saved',
        description: message,
        variant: 'error',
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!lead) return null

  const nextDueDay = nextScheduledTask?.dueAt && Number.isFinite(Date.parse(nextScheduledTask.dueAt))
    ? luxorDate(nextScheduledTask.dueAt) : nextScheduledTask?.dueDate?.slice(0, 10)
  const isPrecedingOverdue = Boolean(nextScheduledTask && !nextScheduledTask.tentative && nextDueDay && nextDueDay < today)

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Call Outcome"
      description="Record the result and choose a dated manual next step. This form does not place a call."
      maxWidth="max-w-xl"
      zIndex={115}
      footer={
        <div className="flex justify-end gap-2">
          <PortalButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </PortalButton>
          <PortalButton
            type="submit"
            form="portal-log-call-outcome-form"
            disabled={!callOutcome || saving || stopIntentAttempted || Boolean(editingNextTask) || (nextStep === 'later' && !nextDate)}
          >
            <Check size={14} />{' '}
            {nextStep === 'later'
              ? 'Save & Schedule'
              : ['tour', 'proposal', 'thank_you'].includes(nextStep)
                ? 'Save & Continue'
                : 'Save Outcome'}
          </PortalButton>
        </div>
      }
    >
      <form id="portal-log-call-outcome-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Task Title & Workflow Header */}
        {(task?.title || task?.workflow_name) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--portal-border)] pb-2.5">
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Completing task</span>
              <p className="truncate text-sm font-semibold text-[color:var(--portal-text)]">{task?.title}</p>
            </div>
            {task?.workflow_name && (
              <WorkflowBadge workflowName={task.workflow_name} workflowType={task.workflow_type} size="md" />
            )}
          </div>
        )}

        {/* Next Follow-Up Preview Box */}
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--portal-muted)]">
                <CalendarClock size={13} />
                Next follow-up on this lead
              </p>
              {loadingNext ? (
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Checking scheduled follow-ups…</p>
              ) : nextScheduledTask ? (
                <>
                  <p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{nextScheduledTask.title}</p>
                  <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                    {nextScheduledTask.tentative ? 'Tentative: ' : ''}{modalDateLabel(nextScheduledTask.dueAt, nextScheduledTask.dueDate)}
                    {isPrecedingOverdue ? ' · Overdue' : ''}
                    {nextScheduledTask.automated ? ' · Automated' : ''}
                  </p>
                  {nextScheduledTask.tentative && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">If completed now. The date adjusts when this task is completed.</p>}
                  {nextScheduledTask.requiresReview && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Requires review before it can proceed.</p>}
                </>
              ) : (
                <p className="mt-1 text-sm text-[color:var(--portal-muted)]">{previewNotice || 'No other follow-up is currently scheduled.'}</p>
              )}
            </div>

            {nextScheduledTask?.task && !nextScheduledTask.automated && !editingNextTask && (
              <button
                type="button"
                onClick={() => handleEditScheduledTask(nextScheduledTask.task!)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#8c6529] hover:bg-[#caa24c]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 dark:text-[#f1d27a]"
              >
                Edit date & time
              </button>
            )}
          </div>

          {/* Inline Reschedule Fields */}
          {editingNextTask && (
            <div className="mt-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Reschedule next follow-up</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Date
                  <PortalDatePicker value={editNextDate} onChange={setEditNextDate} minDate={today} className="mt-1 w-full" />
                </label>
                <label className="text-xs font-semibold">
                  Time (Central)
                  <input
                    type="time"
                    value={editNextTime}
                    onChange={(event) => setEditNextTime(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#caa24c]/40"
                  />
                </label>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <PortalButton type="button" size="sm" variant="ghost" disabled={savingNextTask} onClick={() => setEditingNextTask(null)}>
                    Cancel
                  </PortalButton>
                  <PortalButton type="button" size="sm" disabled={!editNextDate || !editNextTime || savingNextTask} onClick={() => void handleSaveScheduledTask()}>
                    {savingNextTask ? 'Saving…' : 'Save date'}
                  </PortalButton>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lead and Dial row */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--portal-muted)]">
          <p>
            <span className="font-semibold text-[color:var(--portal-text)]">{lead.full_name}</span>
            {lead.phone ? ` · ${formatPhoneDisplay(lead.phone)}` : ' · No phone number'}
          </p>
          {lead.phone && (
            <button
              type="button"
              onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-xs font-semibold text-[#8c6529] hover:bg-[#caa24c]/10 dark:text-[#f1d27a]"
            >
              <Phone size={13} /> Call now
            </button>
          )}
        </div>

        {/* Call Outcome Options */}
        <fieldset>
          <legend className="mb-2 text-xs font-semibold">Call outcome</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['no_answer', 'No Answer'],
              ['interested', 'Interested'],
              ['wants_tour', 'Wants Tour'],
              ['needs_time', 'Needs Time'],
              ['not_interested', 'Not Interested'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={callOutcome === value}
                onClick={() => {
                  setCallOutcome(value)
                  if (value === 'not_interested') setNextStep('none')
                }}
                className={`min-h-11 rounded-lg border px-2 text-xs font-semibold transition-colors cursor-pointer ${
                  callOutcome === value
                    ? 'border-[#a8792f] bg-[#a8792f]/10 text-[#8c6529] dark:text-[#f1d27a]'
                    : 'border-[color:var(--portal-border)] hover:bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Note input */}
        <label className="block text-sm">
          Add a note
          <textarea
            value={callNote}
            onChange={(event) => setCallNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Call summary or voicemail note (saved to lead timeline)"
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#caa24c]/40"
          />
        </label>
        {stopIntentAttempted && <p role="status" className="text-xs text-[color:var(--portal-muted)]">Check the lead timeline and workflow before taking another action. Close this window to refresh.</p>}

        {/* Next step dropdown */}
        <label className="block text-sm">
          Next step
          <PortalSelect
            value={nextStep}
            onChange={setNextStep}
            disabled={callOutcome === 'not_interested'}
            options={[
              { value: 'none', label: 'No additional next step' },
              { value: 'tour', label: 'Schedule Tour' },
              { value: 'proposal', label: 'Send Proposal' },
              { value: 'later', label: 'Schedule another follow-up' },
              { value: 'thank_you', label: 'Send Thank You' },
              { value: 'nurture', label: 'Move to Nurture' },
              { value: 'stop', label: 'No Further Follow-Up' },
            ]}
            className="mt-1 w-full"
            buttonClassName="h-10"
          />
        </label>

        {nextStep === 'nurture' && (
          <p className="text-xs text-[color:var(--portal-muted)]">
            The call note can be saved here. Moving this lead to nurture requires workflow review.
          </p>
        )}

        {/* Next step: Schedule another follow-up */}
        {nextStep === 'later' && (
          <div className="grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 sm:grid-cols-3">
            <label className="text-sm sm:col-span-2">
              Follow-up date
              <PortalDatePicker value={nextDate} onChange={setNextDate} placeholder="Choose date" minDate={today} className="mt-1 w-full" />
            </label>
            <label className="text-sm">
              Time
              <input
                type="time"
                value={nextTime}
                onChange={(event) => setNextTime(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#caa24c]/40"
              />
            </label>
            <label className="text-sm sm:col-span-3">
              Reminder type
              <PortalSelect
                value={nextChannel}
                onChange={(value) => setNextChannel(value as FollowUpChannel)}
                options={[
                  { value: 'phone', label: 'Phone call' },
                  { value: 'email', label: 'Email task (manual; no email sent)' },
                ]}
                className="mt-1 w-full"
                buttonClassName="h-10"
              />
            </label>
          </div>
        )}
      </form>
    </PortalModal>
  )
}
