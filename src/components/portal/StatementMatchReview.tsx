'use client'

import { useRef, useState } from 'react'
import { PortalSelect } from '@/components/portal/PortalUI'
import { confirmSessionChoice, latestDurableReviews, type DurableMatchReviewEvent, type ExpenseMatchCandidate } from '@/lib/luxorStatementMatchReview'
import type { StatementReviewRow } from '@/lib/luxorStatementReview'

const button = 'inline-flex min-h-10 items-center rounded-xl border border-[color:var(--portal-border)] px-4 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-50'
type Pending = { id: string; payload: string; previousId: string | null; uncertain: boolean }

/** Recorded review choices are not bank reconciliation or accounting entries. */
export function StatementMatchReview({ statementId, accountLabel, row, events, canEdit, statusVerified, onRefresh }: {
  statementId: string
  accountLabel: string | null
  row: StatementReviewRow
  events: DurableMatchReviewEvent[]
  canEdit: boolean
  statusVerified: boolean
  onRefresh: () => Promise<DurableMatchReviewEvent[] | null>
}) {
  const [candidates, setCandidates] = useState<ExpenseMatchCandidate[] | null>(null)
  const [sourceId, setSourceId] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('')
  const [verified, setVerified] = useState(false), [duplicates, setDuplicates] = useState(false), [confirmed, setConfirmed] = useState(false), [clearConfirmed, setClearConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [error, setError] = useState('')
  const pending = useRef<Pending | null>(null), inFlight = useRef(false)
  const latest = latestDurableReviews(events).get(row.rowNumber)
  const active = latest?.action === 'selected' ? latest : null
  const candidate = candidates?.find((item) => item.id === sourceId)
  const load = async () => {
    setBusy(true); setError(''); setCandidates(null); setSourceId('')
    try {
      const response = await fetch(`/api/portal/statement-match-candidates?statement_id=${encodeURIComponent(statementId)}&row=${row.rowNumber}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.candidates)) throw new Error(data.error || 'Unable to load candidates.')
      setCandidates(data.candidates)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load candidates.') }
    finally { setBusy(false) }
  }
  const perform = async (request: Pending) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const response = await fetch('/api/portal/statement-match-reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: request.payload })
      const data = await response.json()
      if (!response.ok) {
        if (response.status >= 500 || response.status === 409 || request.uncertain) { request.uncertain = true; setLocked(true) }
        else { pending.current = null; setLocked(false) }
        setError(data.error || 'Unable to record this choice.')
        return
      }
      if (data.event?.id !== request.id) throw new Error('Review result could not be verified.')
      pending.current = null; setLocked(false); setCandidates(null); setSourceId(''); setNote(''); setReason(''); setVerified(false); setDuplicates(false); setConfirmed(false); setClearConfirmed(false)
      if (!await onRefresh()) setError('The choice was saved, but its current status could not be loaded.')
    } catch { request.uncertain = true; setLocked(true); setError('The outcome is uncertain. Retry the same request or refresh the review history.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = (body: Record<string, unknown>) => {
    if (pending.current || inFlight.current) return
    const id = crypto.randomUUID(), previousId = latest?.id || null
    const request = { id, previousId, uncertain: false, payload: JSON.stringify({ ...body, request_id: id, statement_id: statementId, row_number: row.rowNumber, previous_id: previousId }) }
    pending.current = request; void perform(request)
  }
  const refresh = async () => {
    setBusy(true)
    try {
      const refreshed = await onRefresh()
      if (!refreshed) { setError('Review history is unavailable.'); return }
      const request = pending.current
      if (request) {
        const now = latestDurableReviews(refreshed).get(row.rowNumber)
        if (refreshed.some((event) => event.id === request.id) || (now?.id || null) !== request.previousId) {
          pending.current = null; setLocked(false); setError('Review history refreshed. Check the current choice before continuing.')
        } else setError('No result is visible yet. Retry the same request; do not assume it failed.')
      } else setError('')
    } finally { setBusy(false) }
  }
  const choose = () => {
    setError('')
    try {
      if (!candidate || !accountLabel) throw new Error('Choose a source and verify the statement account first.')
      confirmSessionChoice({ row, source: candidate, events: [], confirmed, verifiedAccountAndCurrency: verified, acknowledgedDuplicate: duplicates, note })
      submit({ action: 'selected', source_payment_id: candidate.id, note, explicitly_confirmed: true, account_currency_attested: true, duplicate_acknowledged: duplicates })
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to review this selection.') }
  }
  const clear = () => {
    setError('')
    if (!active || !clearConfirmed || !reason.trim() || reason.trim().length > 500) { setError('Confirm the correction and provide a reason.'); return }
    submit({ action: 'cleared', source_payment_id: active.source_payment_id, note: reason, explicitly_confirmed: true, account_currency_attested: false, duplicate_acknowledged: false })
  }
  return <section className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm">
    <h4 className="font-bold">Review row {row.rowNumber}</h4>
    <p className="leading-6 text-[color:var(--portal-muted)]">A recorded choice is a reviewer&apos;s selection, not verified settlement, bank reconciliation, or an accounting entry. The source account and currency are not verified by Luxor; compare your statement and supporting evidence. Only exact-date, exact-amount expense payments and refunds are available; partial and split matches are not supported.</p>
    {!accountLabel && <p role="alert">The selected statement account is unavailable. A choice cannot be recorded.</p>}
    {error && <p role="alert">{error} {locked && <><button type="button" disabled={busy} className="underline" onClick={() => void refresh()}>Refresh history</button>{' '}{pending.current && <button type="button" disabled={busy} className="underline" onClick={() => pending.current && void perform(pending.current)}>Retry same request</button>}</>}</p>}
    {!statusVerified ? <p>Current review status is unavailable; no status is assumed.</p> : active ? <div className="space-y-3"><p className="break-all font-semibold">Recorded review choice: expense payment {active.source_payment_id}</p><p className="break-words">Evidence noted: {active.note}</p><p className="text-[color:var(--portal-muted)]">Settlement and account association remain unverified.</p>
      {canEdit && <><label className="block font-semibold">Reason for clearing this choice<textarea className="portal-input mt-1 w-full" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={busy || locked} /></label><label className="flex items-start gap-2"><input type="checkbox" checked={clearConfirmed} onChange={(e) => setClearConfirmed(e.target.checked)} disabled={busy || locked} />I confirm this choice should be cleared.</label><button type="button" className={button} disabled={busy || locked} onClick={clear}>Clear choice</button></>}
    </div> : <div className="space-y-3"><p className="font-semibold">No review choice recorded</p>
      {canEdit && <button type="button" className={button} disabled={busy || locked || !accountLabel || row.issues.length > 0} onClick={() => void load()}>{busy ? 'Loading…' : 'Find expense payment candidates'}</button>}
      {row.issues.length > 0 && <p>Resolve the statement row before reviewing a candidate.</p>}
      {candidates && !candidates.length && <p>No exact expense-payment or expense-refund candidates found. Other source types are not searched.</p>}
      {canEdit && candidates && candidates.length > 0 && <><PortalSelect aria-label="Expense payment candidate" value={sourceId} disabled={busy || locked} onChange={(value) => { setSourceId(value); setVerified(false); setDuplicates(false); setConfirmed(false); setNote('') }} placeholder="Choose a candidate to inspect" options={candidates.map((item) => ({ value: item.id, label: `${item.vendor || 'Vendor unavailable'} · ${item.date} · ${(item.amountCents / 100).toFixed(2)} · ${item.method || 'Method unavailable'} · ${item.reference || item.id}` }))} />
        {candidate && <><p className="break-all">Source payment: {candidate.id}<br />Expense: {candidate.expenseId}<br />Reference: {candidate.reference || 'Not recorded'}<br />Payment method: {candidate.method || 'Not recorded'}</p><label className="flex items-start gap-2"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={busy || locked} />I checked that the source used {accountLabel || 'the statement account'} and that the currencies agree.</label>{row.possibleDuplicateRows.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={duplicates} onChange={(e) => setDuplicates(e.target.checked)} disabled={busy || locked} />I compared the possible duplicate statement rows.</label>}<label className="block font-semibold">Evidence checked<textarea className="portal-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={busy || locked} /></label><label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy || locked} />I confirm this review choice.</label><button type="button" className={button} disabled={busy || locked} onClick={choose}>Record review choice</button></>}
      </>}
    </div>}
    {statusVerified && events.some((event) => event.row_number === row.rowNumber) && <div className="space-y-1 border-t border-[color:var(--portal-border)] pt-3"><p className="font-semibold">Review history</p>{events.filter((event) => event.row_number === row.rowNumber).map((event) => <p className="break-words text-[color:var(--portal-muted)]" key={event.id}>{event.action === 'selected' ? `Selected ${event.source_payment_id}: ${event.note}` : `Cleared ${event.source_payment_id}: ${event.note}`} · {event.created_by} · {new Date(event.created_at).toLocaleString()}</p>)}</div>}
  </section>
}
