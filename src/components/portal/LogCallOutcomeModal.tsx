'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, Check, Phone } from '@/lib/icons/phosphor-compat'
import type { LuxorInquiry, LuxorTask } from '@/lib/luxorInquiryTypes'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { useToast } from '@/components/portal/ToastProvider'
import { WorkflowBadge } from '@/components/portal/WorkflowBadge'
import {
  formatFollowUpDateLabel,
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

type ScheduledFollowUpSummary = {
  id: string
  title: string
  dueAt: string | null
  dueDate: string | null
  task?: LuxorTask
  automated?: boolean
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
  const savingRef = useRef(false)

  // Next scheduled task state & inline editing
  const [nextScheduledTask, setNextScheduledTask] = useState<ScheduledFollowUpSummary | null>(null)
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
      return
    }

    // Load lead's tasks to identify next scheduled follow-up
    let active = true
    setLoadingNext(true)

    fetch(`/api/tasks?inquiryId=${encodeURIComponent(lead.id)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((tasks: LuxorTask[]) => {
        if (!active) return
        const pendingOtherTasks = tasks
          .filter((t) => t.status === 'pending' && t.id !== task?.id)
          .sort((a, b) => (a.due_at ?? a.due_date ?? '\uffff').localeCompare(b.due_at ?? b.due_date ?? '\uffff'))

        if (pendingOtherTasks[0]) {
          const t = pendingOtherTasks[0]
          setNextScheduledTask({
            id: t.id,
            title: t.title,
            dueAt: t.due_at ?? null,
            dueDate: t.due_date ?? null,
            task: t,
            automated: Boolean(t.automation_enrollment_id),
          })
        } else {
          setNextScheduledTask(null)
        }
      })
      .catch(() => {
        if (active) setNextScheduledTask(null)
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
      notify({ title: 'Follow-up rescheduled', description: `${editNextDate} at ${editNextTime} Central`, variant: 'success' })
    } catch (error) {
      notify({ title: 'Follow-up could not be rescheduled', description: error instanceof Error ? error.message : 'Try again.', variant: 'error' })
    } finally {
      setSavingNextTask(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lead || !callOutcome || savingRef.current) return
    savingRef.current = true
    setSaving(true)

    let callOutcomeSaved = false
    let declineSaved = false

    try {
      // 1. If not interested, update sequence disposition
      if (callOutcome === 'not_interested') {
        const decline = await fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiryId: lead.id,
            action: 'disposition',
            disposition: 'not_interested',
            reason: 'Manual call outcome',
          }),
        })
        if (!decline.ok) throw new Error('The lead’s decline could not be saved; no call outcome was recorded.')
        declineSaved = true
      }

      // 2. Complete task if linked
      const mappedOutcome = callOutcome === 'no_answer' ? 'no_answer' : callOutcome === 'voicemail_left' ? 'voicemail_left' : 'reached'
      if (task) {
        const response = await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            status: 'completed',
            completed_at: new Date().toISOString(),
            call_outcome: mappedOutcome,
          }),
        })
        if (!response.ok) throw new Error('The task could not be updated.')
      }

      // 3. If reached, record response
      if (mappedOutcome === 'reached' && callOutcome !== 'not_interested') {
        await fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryId: lead.id, action: 'response' }),
        }).catch(() => {})
      }

      // 4. Save note to lead timeline
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: lead.id,
          content: `Manual call outcome: ${callOutcome.replaceAll('_', ' ')}.${callNote.trim() ? ` ${callNote.trim()}` : ''}`,
          noteType: 'status_change',
          taskId: task?.id,
        }),
      })

      if (callOutcome === 'not_interested') {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiryId: lead.id,
            content: 'Lead declined further contact after a manual call. Active brochure sequence was stopped.',
            noteType: 'status_change',
          }),
        }).catch(() => {})
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

      // 6. Handle Next Step: Stop follow-up sequence
      if (callOutcome !== 'not_interested' && nextStep === 'stop') {
        await fetch('/api/follow-ups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryId: lead.id, action: 'stop', stopReason: 'manual_stop' }),
        }).catch(() => {})
      }

      // 7. Handle Next Step: Move to nurture
      if (callOutcome !== 'not_interested' && nextStep === 'nurture') {
        await fetch('/api/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lead.id, follow_up_disposition: 'nurture' }),
        }).catch(() => {})
      }

      notify({
        title: 'Call outcome saved',
        description: nextStep === 'later' ? 'The dated manual follow-up was scheduled.' : 'The call outcome was saved to this lead’s timeline.',
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
        title: callOutcomeSaved && nextStep === 'stop' ? 'Call outcome saved; sequence status unknown' : declineSaved ? 'Decline saved; call outcome needs retry' : 'Call outcome was not fully saved',
        description: message,
        variant: 'error',
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!lead) return null

  const isPrecedingOverdue = nextScheduledTask
    ? (nextScheduledTask.dueAt ? luxorDate(nextScheduledTask.dueAt) : nextScheduledTask.dueDate?.slice(0, 10) ?? '') < today
    : false

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
            disabled={!callOutcome || saving || Boolean(editingNextTask) || (nextStep === 'later' && !nextDate)}
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
                    {formatFollowUpDateLabel(nextScheduledTask.dueAt, nextScheduledTask.dueDate)}
                    {nextScheduledTask.dueAt ? ' Central' : ''}
                    {isPrecedingOverdue ? ' · Overdue' : ''}
                    {nextScheduledTask.automated ? ' · Automated' : ''}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-[color:var(--portal-muted)]">No other follow-up is currently scheduled.</p>
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
            This changes the lead&apos;s stage to Nurture on their profile.
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
