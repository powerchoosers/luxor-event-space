'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, RefreshCw } from '@/lib/icons/phosphor-compat'
import { PortalModal } from './PortalUI'
import type { LuxorBreakdown, LuxorBreakdownSummary } from '@/lib/luxorBreakdownTypes'
import type { LuxorLeadEvent } from '@/lib/luxorInquiryTypes'

function dateTime(value: string) {
  return new Date(value).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
}

/** Informational comparisons deliberately live outside the formal proposal list. */
export function LeadBreakdownHistory({ inquiryId, events, refreshKey }: { inquiryId: string; events: LuxorLeadEvent[]; refreshKey: number }) {
  const [rows, setRows] = useState<LuxorBreakdownSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<LuxorBreakdown | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setRows([])
    setError(null)
    void fetch(`/api/proposal-breakdowns?inquiryId=${encodeURIComponent(inquiryId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok || !Array.isArray(payload.breakdowns)) throw new Error(payload.error || 'Breakdown history could not be loaded.')
        setRows(payload.breakdowns)
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Breakdown history is unavailable.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [inquiryId, refreshKey, revision])

  useEffect(() => {
    requestVersion.current += 1
    setSelected(null)
    setOpening(null)
  }, [inquiryId])

  const view = async (id: string) => {
    const version = ++requestVersion.current
    setOpening(id)
    setError(null)
    try {
      const response = await fetch(`/api/proposal-breakdowns?id=${encodeURIComponent(id)}&inquiryId=${encodeURIComponent(inquiryId)}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload.breakdown?.html || payload.breakdown.inquiry_id !== inquiryId) throw new Error(payload.error || 'The saved breakdown could not be opened.')
      if (requestVersion.current === version) setSelected(payload.breakdown)
    } catch (reason) {
      if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : 'The saved breakdown is unavailable.')
    } finally {
      if (requestVersion.current === version) setOpening(null)
    }
  }

  return <section aria-label="Breakdown history" className="mt-5 border-y border-[color:var(--portal-border)] py-5">
    <div className="flex items-start justify-between gap-3">
      <div><h4 className="text-sm font-semibold text-[color:var(--portal-text)]">Breakdown history</h4><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Informational emails and their original prices. These do not create a final proposal or reserve an event.</p></div>
      <button type="button" aria-label="Refresh breakdown history" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-text)] disabled:opacity-50"><RefreshCw size={14} /></button>
    </div>
    {error ? <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
    {loading ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-muted)]">Loading breakdown history…</p> : !rows.length && !error ? <p className="mt-3 text-xs text-[color:var(--portal-muted)]">No breakdown emails saved yet. Preview and send one from the package comparison in the builder.</p> : null}
    {rows.length ? <ol className="mt-3 divide-y divide-[color:var(--portal-border)]">{rows.map((row) => {
      const event = events.find((item) => item.id === row.lead_event_id)
      const label = row.delivery_state === 'sent' ? 'Sent' : row.delivery_state === 'prepared' ? 'Saved, not sent' : row.delivery_state === 'sending' ? 'Send in progress or awaiting confirmation' : 'Delivery unconfirmed'
      return <li key={row.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="text-sm font-semibold text-[color:var(--portal-text)]">{row.subject}</p><p className="mt-1 break-words text-xs text-[color:var(--portal-muted)]">{row.recipient_email} · {label}{row.sent_at ? ` ${dateTime(row.sent_at)}` : ` · Saved ${dateTime(row.created_at)}`}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{row.selection.eventType || event?.event_type || 'Event'}{row.selection.eventDate ? ` · ${row.selection.eventDate}` : ''}{row.lead_event_id ? '' : ' · Lead-level comparison'}</p>{row.error_message ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">{row.error_message}</p> : null}</div>
        <button type="button" onClick={() => void view(row.id)} disabled={Boolean(opening)} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-50"><Eye size={14} />{opening === row.id ? 'Opening…' : 'View saved email'}</button>
      </li>
    })}</ol> : null}
    <PortalModal isOpen={Boolean(selected)} onClose={() => { requestVersion.current += 1; setSelected(null) }} title="Saved breakdown email" description={selected ? `${selected.recipient_email} · ${selected.sent_at ? `Sent ${dateTime(selected.sent_at)}` : `Saved ${dateTime(selected.created_at)}`} · Original pricing snapshot` : ''} maxWidth="max-w-4xl" fullScreenOnCompact>
      {selected ? <iframe title="Saved breakdown email and original pricing" srcDoc={selected.html} sandbox="" className="h-[70vh] w-full border-0 bg-white" /> : null}
    </PortalModal>
  </section>
}
