'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarX2, Loader2, MoreHorizontal, XCircle } from 'lucide-react'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { PortalButton, PortalCheckbox, PortalModal, PortalSelect } from '@/components/portal/PortalUI'

export type LeadLifecycleAction = 'deal-lost' | 'cancel-tour'

export type LeadLifecycleActionResult = {
  lead: LuxorInquiry
  calendarWarning?: string
}

const DEAL_LOST_REASON_OPTIONS = [
  { value: '', label: 'Select a reason' },
  { value: 'Chose another venue', label: 'Chose another venue' },
  { value: 'Date unavailable', label: 'Date unavailable' },
  { value: 'Budget did not align', label: 'Budget did not align' },
  { value: 'No response', label: 'No response' },
  { value: 'Other', label: 'Other' },
]

/** A scheduled tour that is still safe to cancel from the owner portal. */
export function hasCancellableTour(lead: LuxorInquiry) {
  if (!lead.preferred_tour_date) return false
  if (['cancelled', 'attended', 'no_show'].includes(lead.tour_attendance_status || '')) return false

  const hasPendingTour = ['tour_requested', 'tour_confirmed'].includes(lead.status)
    || ['pending', 'rescheduled'].includes(lead.tour_attendance_status || '')
  if (!hasPendingTour) return false

  const dateMatch = lead.preferred_tour_date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!dateMatch) return false

  let hours = 23
  let minutes = 59
  const time = lead.preferred_tour_time?.trim() || ''
  if (time) {
    const amPmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    const twentyFourHourMatch = time.match(/^(\d{1,2}):(\d{2})$/)
    if (amPmMatch) {
      hours = Number(amPmMatch[1]) % 12
      if (amPmMatch[3].toUpperCase() === 'PM') hours += 12
      minutes = Number(amPmMatch[2])
    } else if (twentyFourHourMatch) {
      hours = Number(twentyFourHourMatch[1])
      minutes = Number(twentyFourHourMatch[2])
    } else {
      return false
    }
  }
  if (hours > 23 || minutes > 59) return false

  const scheduledAt = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hours, minutes)
  return !Number.isNaN(scheduledAt.getTime()) && scheduledAt >= new Date()
}

export function LeadLifecycleActionsMenu({
  lead,
  onAction,
  className = '',
}: {
  lead: LuxorInquiry
  onAction: (action: LeadLifecycleAction) => void
  className?: string
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const cancellableTour = hasCancellableTour(lead)
  const canMarkLost = lead.status !== 'closed_lost' && lead.pipeline_stage !== 'closed_lost'

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition({
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        left: Math.max(8, Math.min(window.innerWidth - 232, rect.right - 224)),
      })
    }
    const positionFrame = window.requestAnimationFrame(updatePosition)

    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', closeFromOutside)
    document.addEventListener('keydown', closeFromKeyboard)
    return () => {
      window.cancelAnimationFrame(positionFrame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', closeFromOutside)
      document.removeEventListener('keydown', closeFromKeyboard)
    }
  }, [open])

  if (!cancellableTour && !canMarkLost) return null

  const chooseAction = (action: LeadLifecycleAction) => {
    setOpen(false)
    onAction(action)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`More actions for ${lead.full_name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${className}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="portal-dropdown fixed z-[130] w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-2xl shadow-black/20"
          style={{ top: position.top, left: position.left }}
        >
          {cancellableTour ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAction('cancel-tour')}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
            >
              <CalendarX2 size={14} className="text-[#caa24c]" aria-hidden="true" />
              Cancel scheduled tour
            </button>
          ) : null}
          {canMarkLost ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAction('deal-lost')}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300"
            >
              <XCircle size={14} aria-hidden="true" />
              Mark deal lost
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  )
}

function fallbackLeadAfterAction(
  lead: LuxorInquiry,
  action: LeadLifecycleAction,
  cancelTour: boolean,
): LuxorInquiry {
  if (action === 'cancel-tour') {
    return { ...lead, tour_attendance_status: 'cancelled' }
  }

  return {
    ...lead,
    status: 'closed_lost',
    pipeline_stage: 'closed_lost',
    ...(cancelTour ? { tour_attendance_status: 'cancelled' } : {}),
  }
}

export function LeadLifecycleActionSheet({
  lead,
  action,
  onClose,
  onCompleted,
}: {
  lead: LuxorInquiry | null
  action: LeadLifecycleAction | null
  onClose: () => void
  onCompleted: (result: LeadLifecycleActionResult) => void
}) {
  const cancellableTour = useMemo(() => lead ? hasCancellableTour(lead) : false, [lead])
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [cancelTour, setCancelTour] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setDetails('')
    setCancelTour(action === 'deal-lost' && cancellableTour)
    setSubmitting(false)
    setError(null)
  }, [action, cancellableTour, lead?.id])

  if (!lead || !action) return null

  const needsDetails = action === 'deal-lost' && reason === 'Other'
  const canSubmit = action === 'cancel-tour' || Boolean(reason && (!needsDetails || details.trim()))

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || submitting) return

    const selectedReason = reason.trim()
    const completeReason = selectedReason === 'Other'
      ? details.trim()
      : details.trim()
        ? `${selectedReason} — ${details.trim()}`
        : selectedReason

    try {
      setSubmitting(true)
      setError(null)

      const endpoint = action === 'deal-lost'
        ? `/api/leads/${encodeURIComponent(lead.id)}/deal-lost`
        : '/api/tour-actions'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'deal-lost'
          ? JSON.stringify({ reason: completeReason, cancelTour: cancellableTour && cancelTour })
          : JSON.stringify({ inquiryId: lead.id, action: 'cancel-tour' }),
      })
      const payload = await response.json().catch(() => ({})) as {
        error?: string
        inquiry?: LuxorInquiry
        lead?: LuxorInquiry
        cancellation?: {
          calendar?: { status?: string; warning?: string | null }
        }
        outcome?: {
          tourCancellation?: {
            calendar?: { status?: string; warning?: string | null }
          }
        }
      }
      if (!response.ok) {
        throw new Error(payload.error || (action === 'deal-lost' ? 'Unable to mark this deal as lost.' : 'Unable to cancel this tour.'))
      }

      const calendar = payload.cancellation?.calendar || payload.outcome?.tourCancellation?.calendar
      const calendarWarning = calendar?.status === 'needs_reconnect' || calendar?.status === 'failed'
        ? calendar.warning || 'The tour was cancelled, but the Zoho calendar invite still needs to be cancelled manually.'
        : undefined
      onCompleted({
        lead: payload.inquiry || payload.lead || fallbackLeadAfterAction(lead, action, cancellableTour && cancelTour),
        calendarWarning,
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isDealLost = action === 'deal-lost'
  const title = isDealLost ? 'Mark deal lost' : 'Cancel scheduled tour'
  const description = isDealLost
    ? `Close ${lead.full_name}'s opportunity with a clear reason.`
    : `Cancel ${lead.full_name}'s scheduled tour without closing the lead.`

  return (
    <PortalModal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      title={title}
      description={description}
      ariaLabel={title}
      maxWidth="max-w-xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {isDealLost ? (
          <>
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 dark:text-red-300">
                  <AlertTriangle size={15} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold text-[color:var(--portal-text)]">This closes the active opportunity.</p>
                  <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">
                    Open, unpaid proposal and contract work will be withdrawn. Paid transactions are preserved and are not automatically refunded.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]" htmlFor="deal-lost-reason">Why was the deal lost?</label>
              <PortalSelect
                value={reason}
                onChange={setReason}
                options={DEAL_LOST_REASON_OPTIONS}
                className="w-full"
                buttonClassName="min-h-11"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]" htmlFor="deal-lost-details">
                {needsDetails ? 'Reason details' : 'Optional context'}
              </label>
              <textarea
                id="deal-lost-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder={needsDetails ? 'Tell the team what happened…' : 'Add any useful context for future follow-up…'}
                maxLength={500}
                required={needsDetails}
                className="min-h-24 w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/15"
              />
              <p className="text-right text-[9px] font-medium text-[color:var(--portal-muted)]">{details.length}/500</p>
            </div>

            {cancellableTour ? (
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
                <PortalCheckbox
                  checked={cancelTour}
                  onChange={setCancelTour}
                  label="Cancel scheduled tour"
                  sublabel="Release the slot and stop pending tour reminders."
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/[0.07] p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
                <CalendarX2 size={15} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold text-[color:var(--portal-text)]">The lead will remain open.</p>
                <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">
                  This stops pending tour reminders and releases any held tour time. It does not close the opportunity or change payment history.
                </p>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs font-medium text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" variant="ghost" onClick={onClose} disabled={submitting}>Keep editing</PortalButton>
          <PortalButton type="submit" variant={isDealLost ? 'danger' : 'primary'} disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : isDealLost ? <XCircle size={14} aria-hidden="true" /> : <CalendarX2 size={14} aria-hidden="true" />}
            {submitting ? 'Saving…' : isDealLost ? 'Mark deal lost' : 'Cancel tour'}
          </PortalButton>
        </div>
      </form>
    </PortalModal>
  )
}
