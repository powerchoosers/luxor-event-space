'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { PortalButton, PortalModal } from './PortalUI'
import type { CalendarReviewItem } from '@/lib/luxorCalendarReviewServer'

type Snapshot = { items: CalendarReviewItem[]; page: number; hasNext: boolean }
const labels: Record<string, string> = { ACCEPTED: 'Accepted', DECLINED: 'Declined', TENTATIVE: 'Tentative', 'NEEDS-ACTION': 'Awaiting response', 'NOT-ATTENDING': 'Not an active attendee' }
const endpoint = '/api/portal/calendar-reviews'
function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date)
}

export function CalendarReplyReview() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    void refresh().catch(cause => { if (alive.current) setError(cause.message) })
    return () => { alive.current = false; requestNumber.current++ }
  }, [refresh])

  async function loadPage(page: number) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try { await refresh(page) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh replies.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function saveReview() {
    if (!selection || !note.trim() || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        responseId: selection.item.id, expectedSequence: selection.item.eventSequence,
        decision: selection.decision, note, confirm: 'review-calendar-reply',
      }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save this review.')
      setSelection(null); setNote(''); setNotice('Review saved. No email was sent.')
      // Removing a pending row shifts offsets; return to the first page.
      await refresh(0)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this review.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  return <section aria-labelledby="calendar-reply-review-title" className="min-w-0 space-y-4 border-t border-[color:var(--portal-border)] pt-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 id="calendar-reply-review-title" className="text-sm font-bold text-[color:var(--portal-text)]">Calendar reply review</h3>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[color:var(--portal-muted)]">These replies match an invitation, but the sender could not be verified. Confirm with the guest before changing attendance. Reviewing never sends an email.</p>
      </div>
      <PortalButton size="sm" disabled={busy} onClick={() => void loadPage(0)} aria-label="Refresh calendar replies"><RefreshCw className="h-3.5 w-3.5" />Refresh</PortalButton>
    </div>
    {error && !selection ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{error}</p> : null}
    {notice ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">{notice}</p> : null}
    {!snapshot && !error ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading replies…</p> : null}
    {snapshot?.items.length === 0 ? <p className="py-3 text-xs text-[color:var(--portal-muted)]">No calendar replies awaiting review{snapshot.page ? ' on this page' : ''}.</p> : null}
    <ul className="divide-y divide-[color:var(--portal-border)]">
      {snapshot?.items.map(item => <li key={item.id} className="min-w-0 space-y-3 py-4">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[color:var(--portal-text)]">{item.eventTitle}</p>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{dateLabel(item.startUtc)}</p>
          <p className="mt-2 break-all text-xs text-[color:var(--portal-text)]">{item.attendeeEmail}</p>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Reply: {labels[item.replyStatus] || item.replyStatus} · Saved attendance: {labels[item.currentStatus] || item.currentStatus}</p>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Received response dated {dateLabel(item.replyStamp)}</p>
          {!item.canApprove ? <p className="mt-2 text-xs text-[color:var(--portal-muted)]">This reply is no longer current or the attendee is inactive. It can be dismissed, but not applied.</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/portal/emails?messageId=${encodeURIComponent(item.messageId)}`} className="mr-2 text-xs underline text-[color:var(--portal-text)]">Read original email</a>
          <PortalButton size="sm" disabled={busy || !item.canApprove} onClick={() => { setSelection({ item, decision: 'approve' }); setNote(''); setError('') }}>Review attendance</PortalButton>
          <PortalButton size="sm" disabled={busy} onClick={() => { setSelection({ item, decision: 'dismiss' }); setNote(''); setError('') }}>Dismiss reply</PortalButton>
        </div>
      </li>)}
    </ul>
    {snapshot && (snapshot.page > 0 || snapshot.hasNext) ? <nav aria-label="Calendar reply pages" className="flex items-center justify-end gap-3">
      <PortalButton size="sm" aria-label="Previous calendar reply page" disabled={busy || snapshot.page === 0} onClick={() => void loadPage(snapshot.page - 1)}><ChevronLeft className="h-4 w-4" /></PortalButton>
      <span className="text-xs text-[color:var(--portal-muted)]">Page {snapshot.page + 1}</span>
      <PortalButton size="sm" aria-label="Next calendar reply page" disabled={busy || !snapshot.hasNext} onClick={() => void loadPage(snapshot.page + 1)}><ChevronRight className="h-4 w-4" /></PortalButton>
    </nav> : null}
    <PortalModal isOpen={Boolean(selection)} onClose={() => { if (!busy) setSelection(null) }} title={selection?.decision === 'approve' ? 'Confirm attendance review' : 'Dismiss calendar reply'}>
      {selection ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void saveReview() }}>
        <p className="break-words text-sm text-[color:var(--portal-text)]">{selection.item.eventTitle}</p>
        <p className="break-all text-xs text-[color:var(--portal-muted)]">{selection.item.attendeeEmail}</p>
        <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">{selection.decision === 'approve'
          ? `Mark attendance as ${labels[selection.item.replyStatus]?.toLowerCase() || selection.item.replyStatus}. This records your decision; it does not authenticate the sender.`
          : 'Keep the saved attendance unchanged and remove this reply from the review queue. The original email and your decision remain saved.'}</p>
        <label className="block text-xs font-semibold text-[color:var(--portal-text)]">Review note
          <textarea required maxLength={500} rows={3} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="How did you confirm this decision?" className="mt-2 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 font-normal text-[color:var(--portal-text)] focus:outline-none focus:ring-2 focus:ring-[#caa24c]/40" />
        </label>
        {error ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{error} Close this dialog and refresh to see the latest state.</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <PortalButton disabled={busy} onClick={() => setSelection(null)}>Not now</PortalButton>
          <PortalButton type="submit" disabled={busy || !note.trim()}>{busy ? 'Saving…' : selection.decision === 'approve' ? 'Confirm attendance' : 'Confirm dismissal'}</PortalButton>
        </div>
      </form> : null}
    </PortalModal>
  </section>
}
