'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LuxorInquiry, LuxorTask } from '@/lib/luxorInquiryTypes'
import { isLuxorInquiryArchived } from '@/lib/luxorInquiryTypes'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import { FollowUpLeadPicker } from '@/components/portal/FollowUpLeadPicker'
import { useToast } from '@/components/portal/ToastProvider'
import {
  localLuxorIso,
  luxorToday,
  manualFollowUpDescription,
  type FollowUpChannel,
} from '@/lib/luxorFollowUpHelpers'

export type AddFollowUpModalProps = {
  isOpen: boolean
  onClose: () => void
  initialLead?: LuxorInquiry | null
  leads?: LuxorInquiry[]
  onCreated?: (task: LuxorTask) => void | Promise<void>
}

export function AddFollowUpModal({
  isOpen,
  onClose,
  initialLead,
  leads = [],
  onCreated,
}: AddFollowUpModalProps) {
  const { notify } = useToast()
  const today = luxorToday()

  const [leadId, setLeadId] = useState('')
  const [channel, setChannel] = useState<FollowUpChannel>('phone')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('09:00')
  const [assignee, setAssignee] = useState('')
  const [notes, setNotes] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [internalLeads, setInternalLeads] = useState<LuxorInquiry[]>(leads)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // Sync initial lead or load leads if not provided
  useEffect(() => {
    if (!isOpen) return
    if (initialLead) {
      setLeadId(initialLead.id)
    } else {
      setLeadId('')
    }
    setChannel('phone')
    setTitle('')
    setDueDate('')
    setDueTime('09:00')
    setNotes('')

    // Fetch assignees
    fetch('/api/tasks?all=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { assignees?: string[] } | null) => {
        if (data?.assignees) {
          setAssignees(data.assignees)
          setAssignee((curr) => curr || data.assignees![0] || '')
        }
      })
      .catch(() => {})

    // Fetch leads if not provided
    if (!leads.length && !initialLead) {
      fetch('/api/inquiries', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : []))
        .then((items: LuxorInquiry[]) => setInternalLeads(items))
        .catch(() => {})
    } else if (leads.length) {
      setInternalLeads(leads)
    }
  }, [isOpen, initialLead, leads])

  const targetLead = initialLead || internalLeads.find((l) => l.id === leadId)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const activeLeadId = initialLead?.id || leadId
    if (!activeLeadId || !title.trim() || !dueDate || !dueTime || savingRef.current) return
    savingRef.current = true
    setSaving(true)

    try {
      const isPostTour = targetLead?.tour_attendance_status === 'attended'
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: activeLeadId,
          title: title.trim(),
          description: manualFollowUpDescription(channel, isPostTour, notes),
          dueDate,
          dueAt: localLuxorIso(dueDate, dueTime),
          assignedTo: assignee || undefined,
          priority: 'medium',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(errorData.error || 'Try again after checking the follow-up details.')
      }

      const created = (await response.json()) as LuxorTask
      notify({
        title: `${channel === 'phone' ? 'Phone' : 'Email'} follow-up task added`,
        description: 'No call or email was sent.',
        variant: 'success',
      })

      onClose()
      if (onCreated) {
        await onCreated(created)
      }
    } catch (error) {
      notify({
        title: 'The follow-up could not be saved',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'error',
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Follow-Up"
      description="Create a manual reminder on the existing lead. This does not send an email or place a call."
      maxWidth="max-w-lg"
      zIndex={110}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lead Selection */}
        <div>
          <label htmlFor="follow-up-modal-lead" className="block text-sm font-medium">
            Lead
          </label>
          {initialLead ? (
            <div className="mt-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2.5">
              <span className="block font-semibold text-sm text-[color:var(--portal-text)]">{initialLead.full_name}</span>
              <span className="block text-xs text-[color:var(--portal-muted)]">
                {initialLead.event_type || 'Event'} {initialLead.phone ? `· ${initialLead.phone}` : ''}
              </span>
            </div>
          ) : (
            <FollowUpLeadPicker
              id="follow-up-modal-lead"
              leads={internalLeads.filter((l) => !isLuxorInquiryArchived(l))}
              value={leadId}
              onChange={setLeadId}
            />
          )}
        </div>

        {/* Type selector */}
        <label className="block text-sm font-medium">
          Type
          <PortalSelect
            value={channel}
            onChange={(value) => setChannel(value as FollowUpChannel)}
            options={[
              { value: 'phone', label: 'Phone call' },
              { value: 'email', label: 'Email task' },
            ]}
            className="mt-1 w-full"
            buttonClassName="h-10"
          />
        </label>

        {/* Title */}
        <label className="block text-sm font-medium">
          Title
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={channel === 'phone' ? 'Personal call' : 'Follow-up email'}
            className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          />
        </label>

        {/* Due Date */}
        <label className="block text-sm font-medium">
          Due date
          <PortalDatePicker
            value={dueDate}
            onChange={setDueDate}
            placeholder="Choose date"
            minDate={today}
            className="mt-1 w-full [&>button]:h-10 [&>button]:rounded-lg [&>button]:px-3 [&>button]:py-2 [&>button]:normal-case [&>button]:tracking-normal"
          />
        </label>

        {/* Due Time */}
        <label className="block text-sm font-medium">
          Due time (Central)
          <input
            required
            type="time"
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
          />
        </label>

        {/* Assigned To */}
        <label className="block text-sm font-medium">
          Assigned to
          <PortalSelect
            value={assignee}
            onChange={setAssignee}
            options={[
              { value: '', label: 'Assign to me' },
              ...assignees.map((email) => ({ value: email, label: email })),
            ]}
            className="mt-1 w-full"
            buttonClassName="h-10"
          />
        </label>

        {/* Notes */}
        <label className="block text-sm font-medium">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Context or talking points for this reminder"
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none focus:ring-2 focus:ring-[#caa24c]/40"
          />
        </label>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <PortalButton type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </PortalButton>
          <PortalButton
            type="submit"
            disabled={!(initialLead?.id || leadId) || !title.trim() || !dueDate || !dueTime || saving}
          >
            {saving ? 'Saving…' : 'Save Follow-Up'}
          </PortalButton>
        </div>
      </form>
    </PortalModal>
  )
}
