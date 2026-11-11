'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from '@/lib/icons/phosphor-compat'
import {
  PortalButton,
  PortalModal,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
  type PortalStatusTone,
} from './PortalUI'
import type { CalendarReviewItem } from '@/lib/luxorCalendarReviewServer'

type Snapshot = { items: CalendarReviewItem[]; page: number; hasNext: boolean }

const labels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  TENTATIVE: 'Tentative',
  'NEEDS-ACTION': 'Awaiting response',
  'NOT-ATTENDING': 'Not attending',
}

const tones: Record<string, PortalStatusTone> = {
  ACCEPTED: 'green',
  DECLINED: 'red',
  TENTATIVE: 'gold',
  'NEEDS-ACTION': 'neutral',
  'NOT-ATTENDING': 'neutral',
}

const endpoint = '/api/portal/calendar-reviews'

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date)
}

export function CalendarReplyReview() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')
  const [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<{ item: CalendarReviewItem; decision: 'approve' | 'dismiss' } | null>(null)
  const [note, setNote] = useState('')
  const requestNumber = useRef(0)
  const inFlight = useRef(false)
  const alive = useRef(true)

  const refresh = useCallback(async (page = 0) => {
    const number = ++requestNumber.current
    const response = await fetch(`${endpoint}?page=${page}`, { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Could not load calendar replies.')
    if (alive.current && number === requestNumber.current) setSnapshot(payload)
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh().catch((cause) => {
      if (alive.current) setError(cause.message)
    })
    return () => {
      alive.current = false
      requestNumber.current++
    }
  }, [refresh])

  async function loadPage(page: number) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await refresh(page)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh replies.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function saveReview() {
    if (!selection || !note.trim() || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setModalError('')
    setNotice('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseId: selection.item.id,
          expectedSequence: selection.item.eventSequence,
          decision: selection.decision,
          note,
          confirm: 'review-calendar-reply',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save this review.')
      setSelection(null)
      setNote('')
      setNotice('Review saved. No email was sent.')
      await refresh(0)
    } catch (cause) {
      setModalError(cause instanceof Error ? cause.message : 'Could not save this review.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const isInitialLoading = !snapshot && !error

  return (
    <section
      aria-labelledby="calendar-reply-review-title"
      className="min-w-0 space-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 id="calendar-reply-review-title" className="text-base font-bold text-[color:var(--portal-text)]">
              Calendar reply review
            </h3>
            {snapshot && snapshot.items.length > 0 ? (
              <PortalStatusBadge
                borderless
                tone="gold"
                status={`${snapshot.items.length} awaiting review`}
              />
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
            Confirm unverified invitation replies with the guest before changing saved attendance.
          </p>
        </div>
        <PortalButton
          size="sm"
          disabled={busy}
          onClick={() => void loadPage(0)}
          aria-label="Refresh calendar replies"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </PortalButton>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}

      <PortalSkeletonTransition
        loading={isInitialLoading}
        skeleton={
          <div className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35 px-4">
            {[0, 1].map((idx) => (
              <div key={idx} className="space-y-2 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <PortalSkeleton className="h-4 w-48 rounded" />
                  <PortalSkeleton className="h-5 w-20 rounded-md" />
                </div>
                <PortalSkeleton className="h-3.5 w-36 rounded" />
              </div>
            ))}
          </div>
        }
      >
        {snapshot?.items.length === 0 ? (
          <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 px-4 py-3 text-xs text-[color:var(--portal-muted)]">
            No calendar replies awaiting review{snapshot.page ? ' on this page' : ''}.
          </p>
        ) : null}

        {snapshot && snapshot.items.length > 0 ? (
          <ul className="divide-y divide-[color:var(--portal-border)] rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/35 px-4">
            {snapshot.items.map((item) => (
              <li key={item.id} className="min-w-0 space-y-3 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-[color:var(--portal-text)]">{item.eventTitle}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-[color:var(--portal-muted)]">{dateLabel(item.startUtc)}</p>
                    <p className="mt-1.5 break-all text-xs font-medium text-[color:var(--portal-text)]">{item.attendeeEmail}</p>
                  </div>
                  <PortalStatusBadge
                    borderless
                    tone={tones[item.replyStatus] || 'neutral'}
                    status={labels[item.replyStatus] || item.replyStatus}
                  />
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--portal-muted)]">
                  <span>Saved attendance: <strong className="font-semibold text-[color:var(--portal-text)]">{labels[item.currentStatus] || item.currentStatus}</strong></span>
                  <span className="tabular-nums">Reply dated {dateLabel(item.replyStamp)}</span>
                </div>

                {!item.canApprove ? (
                  <p className="text-xs text-[color:var(--portal-muted)]">
                    This reply is no longer current or the attendee is inactive. Dismiss to clear it.
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Link
                    href={`/portal/emails?messageId=${encodeURIComponent(item.messageId)}`}
                    className="inline-flex min-h-8.5 items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35"
                  >
                    Read original email
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                  <PortalButton
                    size="sm"
                    variant="primary"
                    disabled={busy || !item.canApprove}
                    onClick={() => {
                      setSelection({ item, decision: 'approve' })
                      setNote('')
                      setModalError('')
                    }}
                  >
                    Review attendance
                  </PortalButton>
                  <PortalButton
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setSelection({ item, decision: 'dismiss' })
                      setNote('')
                      setModalError('')
                    }}
                  >
                    Dismiss reply
                  </PortalButton>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </PortalSkeletonTransition>

      {snapshot && (snapshot.page > 0 || snapshot.hasNext) ? (
        <nav aria-label="Calendar reply pages" className="flex items-center justify-end gap-2">
          <PortalButton
            size="sm"
            aria-label="Previous calendar reply page"
            disabled={busy || snapshot.page === 0}
            onClick={() => void loadPage(snapshot.page - 1)}
          >
            <ChevronLeft size={14} />
            Previous
          </PortalButton>
          <span className="px-2 text-xs tabular-nums text-[color:var(--portal-muted)]">Page {snapshot.page + 1}</span>
          <PortalButton
            size="sm"
            aria-label="Next calendar reply page"
            disabled={busy || !snapshot.hasNext}
            onClick={() => void loadPage(snapshot.page + 1)}
          >
            Next
            <ChevronRight size={14} />
          </PortalButton>
        </nav>
      ) : null}

      <PortalModal
        isOpen={Boolean(selection)}
        onClose={() => {
          if (!busy) {
            setSelection(null)
            setModalError('')
          }
        }}
        title={selection?.decision === 'approve' ? 'Confirm attendance review' : 'Dismiss calendar reply'}
        maxWidth="max-w-md"
      >
        {selection ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void saveReview()
            }}
          >
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3.5">
              <p className="break-words text-sm font-bold text-[color:var(--portal-text)]">{selection.item.eventTitle}</p>
              <p className="mt-0.5 break-all text-xs text-[color:var(--portal-muted)]">{selection.item.attendeeEmail}</p>
            </div>

            <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">
              {selection.decision === 'approve'
                ? `Mark attendance as ${labels[selection.item.replyStatus]?.toLowerCase() || selection.item.replyStatus}. Reviewing never sends an email.`
                : 'Keep saved attendance unchanged and remove this reply from the queue.'}
            </p>

            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-[color:var(--portal-muted)]">Review note</span>
              <textarea
                required
                maxLength={500}
                rows={3}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                placeholder="How did you confirm this decision?"
                className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/15"
              />
            </label>

            {modalError ? (
              <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
                {modalError} Close and refresh to verify the latest state.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-3 sm:flex-row sm:justify-end">
              <PortalButton
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSelection(null)
                  setModalError('')
                }}
              >
                Not now
              </PortalButton>
              <PortalButton variant="primary" type="submit" disabled={busy || !note.trim()}>
                {busy ? 'Saving…' : selection.decision === 'approve' ? 'Confirm attendance' : 'Confirm dismissal'}
              </PortalButton>
            </div>
          </form>
        ) : null}
      </PortalModal>
    </section>
  )
}
