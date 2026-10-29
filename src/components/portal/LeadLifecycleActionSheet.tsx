'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, CalendarX2, Loader2, MoreHorizontal } from 'lucide-react'
import { isLuxorInquiryArchived, type LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { PortalButton, PortalModal } from '@/components/portal/PortalUI'

export type LeadLifecycleAction = 'archive' | 'cancel-tour'

export type LeadLifecycleActionResult = {
  lead: LuxorInquiry
  calendarWarning?: string
}

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
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 400 })
  const cancellableTour = hasCancellableTour(lead)
  const canArchive = !lead.is_test && !isLuxorInquiryArchived(lead)

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(224, window.innerWidth - 16)
      const menuHeight = menuRef.current?.scrollHeight ?? 240
      const below = Math.max(0, window.innerHeight - rect.bottom - 12)
      const above = Math.max(0, rect.top - 12)
      const openAbove = below < Math.min(menuHeight, 180) && above > below
      const maxHeight = Math.min(menuHeight, openAbove ? above : below)
      setPosition({
        top: openAbove ? Math.max(8, rect.top - maxHeight - 8) : Math.min(window.innerHeight - maxHeight - 8, rect.bottom + 8),
        left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
        maxHeight,
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

  if (!cancellableTour && !canArchive) return null

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
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[#a8792f] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${className}`}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="portal-dropdown fixed z-[130] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1.5 shadow-2xl shadow-black/25 backdrop-blur-xl"
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
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
          {canArchive ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => chooseAction('archive')}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-text)] transition-colors hover:bg-[#caa24c]/12 hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
            >
              <Archive size={14} className="text-[#caa24c]" aria-hidden="true" />
              Archive Lead
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
): LuxorInquiry {
  if (action === 'cancel-tour') {
    return { ...lead, tour_attendance_status: 'cancelled' }
  }

  return {
    ...lead,
    archived_at: new Date().toISOString(),
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSubmitting(false)
    setError(null)
  }, [action, lead?.id])

  if (!lead || !action) return null

  const isArchive = action === 'archive'

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    try {
      setSubmitting(true)
      setError(null)

      const endpoint = isArchive
        ? `/api/leads/${encodeURIComponent(lead.id)}/archive`
        : '/api/tour-actions'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isArchive
          ? JSON.stringify({})
          : JSON.stringify({ inquiryId: lead.id, action: 'cancel-tour', expectedInquiryUpdatedAt: lead.updated_at }),
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
        throw new Error(payload.error || (isArchive ? 'Unable to archive this lead.' : 'Unable to cancel this tour.'))
      }

      const calendar = payload.cancellation?.calendar || payload.outcome?.tourCancellation?.calendar
      const calendarWarning = calendar?.status === 'needs_reconnect' || calendar?.status === 'failed'
        ? calendar.warning || 'The tour was cancelled, but the Zoho calendar invite still needs to be cancelled manually.'
        : undefined
      onCompleted({
        lead: payload.inquiry || payload.lead || fallbackLeadAfterAction(lead, action),
        calendarWarning,
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = isArchive ? 'Archive this lead?' : 'Cancel scheduled tour'
  const description = isArchive
    ? 'This lead will be moved to Archived Leads. You can retain access to its history without keeping it in your active pipeline.'
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
        {isArchive ? (
          <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/[0.07] p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]">
                <Archive size={15} aria-hidden="true" />
              </span>
              <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Contact, event, communication, tour, proposal, contract, invoice, and document history will remain available.</p>
            </div>
          </div>
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
          <PortalButton type="button" variant="ghost" onClick={onClose} disabled={submitting}>{isArchive ? 'Cancel' : 'Keep editing'}</PortalButton>
          <PortalButton type="submit" variant={isArchive ? 'secondary' : 'primary'} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : isArchive ? <Archive size={14} aria-hidden="true" /> : <CalendarX2 size={14} aria-hidden="true" />}
            {submitting ? 'Saving…' : isArchive ? 'Archive Lead' : 'Cancel tour'}
          </PortalButton>
        </div>
      </form>
    </PortalModal>
  )
}
