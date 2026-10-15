'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { History, RotateCcw, Settings2 } from 'lucide-react'
import { PortalDatePicker } from '@/components/portal/PortalUI'

type Payload = {
  page?: number
  pageSize?: number
  hasMore?: boolean
  settings: { enabled: boolean; identification_email: string; identification_phone: string; email_recipient: string | null } | null
  lead: { id: string; full_name: string; status: string; pipeline_stage?: string | null } | null
  runs: Array<{ id: string; status: string; source: string; started_at: string; completed_at?: string | null; reset_at?: string | null; submitted_email?: string | null; submitted_phone?: string | null; submitted_details?: Record<string, unknown> }>
  activity: Array<{ id: number; test_run_id?: string; event_type: string; status: string | null; source?: string | null; created_at: string; details?: Record<string, unknown>; provider_status?: string | null; delivery_status?: string | null; error_message?: string | null; attempt?: number | null }>
  artifacts?: Array<{ id: string; test_run_id: string; artifact_type: string; status: string; updated_at?: string; details: Record<string, unknown> }>
  emails?: Array<{ id: string; test_run_id: string; category: string; status: string; actual_recipient: string; provider_status: string | null; delivery_status: string; error_message: string | null; email_job_id?: string | null; provider?: string | null; provider_message_id?: string | null; created_at?: string }>
  system?: { emailProvider?: string; normalizedPhone?: string }
}

export function LuxorTestLeadPanel({ leadId }: { leadId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [view, setView] = useState<'history' | 'settings' | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [recipient, setRecipient] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [tourDate, setTourDate] = useState('')
  const [tourTime, setTourTime] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/portal/test-lead?page=${historyPage}`, { cache: 'no-store' })
      if (!response.ok) { setAuthorized(false); return }
      const payload = await response.json() as Payload
      setAuthorized(true)
      setData(payload)
      setEmail(payload.settings?.identification_email ?? '')
      setPhone(payload.settings?.identification_phone ?? '')
      setRecipient(payload.settings?.email_recipient ?? '')
      setEnabled(Boolean(payload.settings?.enabled))
    } catch {
      setAuthorized(false)
    }
  }, [historyPage])

  useEffect(() => { void refresh() }, [refresh])
  if (authorized !== true || (data && data.lead?.id !== leadId)) return null

  const activeRun = data?.runs.find((run) => run.status === 'in_progress')
  const latestRun = data?.runs[0] ?? null
  const resetRun = activeRun || (latestRun && ['completed', 'failed'].includes(latestRun.status) ? latestRun : null)
  const lastReset = data?.runs.reduce<string | null>((latest, run) => run.reset_at && (!latest || run.reset_at > latest) ? run.reset_at : latest, null) ?? null
  async function saveSettings() {
    if (enabled && !data?.settings?.enabled) {
      if (!confirmed) { setNotice('Confirm the verified inbox before enabling test submissions.'); return }
      if (!window.confirm('Enable exact email/phone matching? Matching public forms queue test email automatically to the verified inbox; the portal Send test action also queues email. SMS remains simulated.')) return
    }
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificationEmail: email, identificationPhone: phone, emailRecipient: recipient, enabled, confirmRecipient: confirmed }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to save test settings.')
      setNotice('Test settings saved.')
      setConfirmed(false)
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save test settings.') }
    finally { setBusy(false) }
  }

  async function reset() {
    if (!resetRun || !window.confirm('Reset this test pipeline? It will return the permanent test lead to Inquiry, cancel pending test-only jobs, and reset simulated tours, proposals, contracts, invoices, bookings, planning, payments, and SMS. Previous run history and the test lead will remain. No real customer data or transactions are affected.')) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', testRunId: resetRun.id, confirm: true }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to reset test pipeline.')
      setNotice(`Test run ${resetRun.id} reset. The permanent lead and history were preserved; the next qualifying submission will start a new run.`)
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to reset test pipeline.') }
    finally { setBusy(false) }
  }

  async function advanceArtifact(runId: string, artifactType: string, status: string) {
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance', testRunId: runId, artifactType, status, details: { actor: 'authorized_portal_admin' } }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to advance simulated workflow.')
      setNotice(`${artifactType} marked ${status} in the simulation.`)
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to advance simulated workflow.') }
    finally { setBusy(false) }
  }

  async function queueTestEmail(runId: string, category: string) {
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_test_email', testRunId: runId, category }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to queue test email.')
      setNotice(`Test email queued to ${recipient}; provider acceptance and delivery will be tracked separately.`)
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to queue test email.') }
    finally { setBusy(false) }
  }

  async function changeTour(runId: string, tourAction: 'reschedule' | 'cancel') {
    const confirmText = tourAction === 'reschedule'
      ? `Queue a simulated tour confirmation and two reminders to ${recipient || 'the verified test inbox'}? No real calendar or venue inventory will change.`
      : `Cancel this simulated tour and queue one cancellation notice to ${recipient || 'the verified test inbox'}? No real calendar or venue inventory will change.`
    if (!window.confirm(confirmText)) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tour_change', tourAction, testRunId: runId,
          actionKey: window.crypto.randomUUID(), date: tourDate, time: tourTime }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to update simulated tour.')
      setNotice(tourAction === 'reschedule' ? 'Simulated tour rescheduled; run-scoped confirmation and reminders are queued.' : 'Simulated tour cancelled; queued reminders were cancelled and a run-scoped cancellation notice was queued.')
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to update simulated tour.') }
    finally { setBusy(false) }
  }

  const simulatedNextStatus: Record<string, Record<string, string>> = {
    tour: { simulated: 'requested', requested: 'scheduled', scheduled: 'confirmed', confirmed: 'completed' },
    proposal: { simulated: 'drafted', drafted: 'sent', sent: 'accepted' },
    contract: { simulated: 'prepared', prepared: 'sent', sent: 'signed' },
    invoice: { simulated: 'issued' },
    booking: { simulated: 'tentative', tentative: 'confirmed' },
    payment: { simulated: 'pending', pending: 'paid' },
    sms: { simulated: 'queued', queued: 'sent', sent: 'delivered' },
  }

  return (
    <section aria-label="Pinned test lead" className="mb-4 w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm dark:border-amber-700 dark:bg-amber-950/25">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-100 text-sm font-extrabold text-amber-900 dark:border-amber-600 dark:bg-amber-900/60 dark:text-amber-100">LT</div>
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-[color:var(--portal-text)]">{data?.lead?.full_name || 'Permanent Test Lead'}</h2><span className="rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">Test</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`}>{enabled ? 'Enabled' : 'Disabled'}</span></div>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Stage: {String(data?.lead?.pipeline_stage || data?.lead?.status || 'Inquiry')} · Current run: {activeRun ? `${activeRun.id} · ${activeRun.status}` : 'No active run'} · Test email recipient: {recipient || 'unconfirmed'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portal/leads/${leadId}`} className="inline-flex h-9 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]">View Test Lead</Link>
          <button type="button" onClick={() => setView(view === 'history' ? null : 'history')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]"><History size={13} /> Test History</button>
          <button type="button" onClick={() => setView(view === 'settings' ? null : 'settings')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]"><Settings2 size={13} /> Test Settings</button>
          <button type="button" disabled={!resetRun || busy} onClick={() => void reset()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw size={13} /> Reset Pipeline</button>
        </div>
      </div>
      {notice ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-text)]">{notice}</p> : null}
      {view === 'history' ? <div className="mt-4 space-y-4">
        <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><table className="w-full min-w-[1120px] text-left text-xs"><thead><tr className="border-b border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Run ID</th><th className="p-3">Source</th><th className="p-3">Submitted email</th><th className="p-3">Submitted phone</th><th className="p-3">Started</th><th className="p-3">Completed</th><th className="p-3">Reset</th><th className="p-3">Status</th><th className="p-3">Submitted details</th></tr></thead><tbody>{data?.runs.length ? data.runs.map((run) => <tr key={run.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3 font-mono">{run.id}</td><td className="p-3">{run.source}</td><td className="p-3">{String(run.submitted_email || '—')}</td><td className="p-3">{String(run.submitted_phone || '—')}</td><td className="p-3">{new Date(run.started_at).toLocaleString()}</td><td className="p-3">{run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}</td><td className="p-3">{run.reset_at ? new Date(run.reset_at).toLocaleString() : '—'}</td><td className="p-3">{run.status}</td><td className="p-3"><details><summary className="cursor-pointer text-sky-700 dark:text-sky-300">View details</summary><pre className="mt-2 max-w-sm whitespace-pre-wrap">{JSON.stringify(run.submitted_details || {}, null, 2)}</pre></details></td></tr>) : <tr><td colSpan={9} className="p-3 text-[color:var(--portal-muted)]">No test runs recorded.</td></tr>}</tbody></table><div className="flex items-center justify-between border-t border-[color:var(--portal-border)] p-3 text-xs text-[color:var(--portal-muted)]"><span>{data?.activity.length ?? 0} activity events on this page · Page {historyPage}</span><div className="flex gap-2"><button type="button" aria-label="Previous history page" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} className="h-8 w-8 rounded-lg border border-[color:var(--portal-border)] disabled:opacity-40">‹</button><span className="self-center">{historyPage}</span><button type="button" aria-label="Next history page" disabled={!data?.hasMore} onClick={() => setHistoryPage((page) => page + 1)} className="h-8 w-8 rounded-lg border border-[color:var(--portal-border)] disabled:opacity-40">›</button></div></div></div>
        <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><h3 className="p-3 text-xs font-bold text-[color:var(--portal-text)]">Run activity and errors</h3><table className="w-full min-w-[800px] text-left text-xs"><thead><tr className="border-y border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Time</th><th className="p-3">Run</th><th className="p-3">Event</th><th className="p-3">Status</th><th className="p-3">Source</th><th className="p-3">Retry</th><th className="p-3">Details / error</th></tr></thead><tbody>{data?.activity.length ? data.activity.map((event) => <tr key={event.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3">{new Date(event.created_at).toLocaleString()}</td><td className="p-3 font-mono">{event.test_run_id || '—'}</td><td className="p-3">{event.event_type}</td><td className="p-3">{event.status || '—'}</td><td className="p-3">{event.source || '—'}</td><td className="p-3">{event.attempt ?? '—'}</td><td className="p-3"><span>{event.error_message || ''}</span><details><summary className="cursor-pointer text-sky-700 dark:text-sky-300">Details</summary><pre className="mt-2 max-w-sm whitespace-pre-wrap">{JSON.stringify(event.details || {}, null, 2)}</pre></details></td></tr>) : <tr><td colSpan={7} className="p-3 text-[color:var(--portal-muted)]">No activity recorded on this page.</td></tr>}</tbody></table></div>
        <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><h3 className="p-3 text-xs font-bold text-[color:var(--portal-text)]">Simulated tours, proposals, contracts, invoices, bookings, payments, and SMS</h3><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-y border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Run</th><th className="p-3">Workflow</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3">Details</th></tr></thead><tbody>{data?.artifacts?.length ? data.artifacts.map((artifact) => <tr key={artifact.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3 font-mono">{artifact.test_run_id}</td><td className="p-3 capitalize">{artifact.artifact_type}</td><td className="p-3">{artifact.status}</td><td className="p-3">{String(artifact.details.updated_at || '—')}</td><td className="p-3"><pre className="max-w-sm whitespace-pre-wrap">{JSON.stringify(artifact.details || {}, null, 2)}</pre></td></tr>) : <tr><td colSpan={5} className="p-3 text-[color:var(--portal-muted)]">No simulated workflow records.</td></tr>}</tbody></table></div>
        <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><h3 className="p-3 text-xs font-bold text-[color:var(--portal-text)]">Test email routing and provider delivery</h3><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-y border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Run</th><th className="p-3">Category</th><th className="p-3">Actual recipient</th><th className="p-3">Queue</th><th className="p-3">Provider</th><th className="p-3">Delivery</th><th className="p-3">Error</th></tr></thead><tbody>{data?.emails?.length ? data.emails.map((email) => <tr key={email.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3 font-mono">{email.test_run_id}</td><td className="p-3">{email.category.replaceAll('_', ' ')}</td><td className="p-3">{email.actual_recipient}</td><td className="p-3">{email.status}</td><td className="p-3">{email.provider_status || 'not attempted'}</td><td className="p-3">{email.delivery_status}</td><td className="p-3">{email.error_message || '—'}</td></tr>) : <tr><td colSpan={7} className="p-3 text-[color:var(--portal-muted)]">No test emails recorded.</td></tr>}</tbody></table><p className="p-3 text-[11px] text-[color:var(--portal-muted)]">Provider acceptance and delivery are tracked separately; delivery is confirmed only by provider callback.</p></div>
      </div> : null}
      {view === 'history' && activeRun ? <div className="mt-3 grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)_auto_auto] sm:items-end">
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">New tour date<PortalDatePicker value={tourDate} onChange={setTourDate} placeholder="Choose tour date" /></label>
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">New tour time<input value={tourTime} onChange={(event) => setTourTime(event.target.value)} placeholder="4:00 PM" className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <button type="button" disabled={busy || !tourDate || !tourTime} onClick={() => void changeTour(activeRun.id, 'reschedule')} className="h-10 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white disabled:opacity-45">Reschedule simulated tour</button>
        <button type="button" disabled={busy} onClick={() => void changeTour(activeRun.id, 'cancel')} className="h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] disabled:opacity-45">Cancel simulated tour</button>
      </div> : null}
      {view === 'history' && activeRun ? <div className="mt-3 grid gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:grid-cols-2 xl:grid-cols-4"><p className="text-xs font-bold text-[color:var(--portal-text)] sm:col-span-2 xl:col-span-4">Test lifecycle artifacts stay isolated; tour changes do not write production calendar or inventory. Test emails may send to the verified inbox; SMS and money movement remain simulated.</p>{(data?.artifacts || []).filter((artifact) => artifact.test_run_id === activeRun.id).map((artifact) => { const next = simulatedNextStatus[artifact.artifact_type]?.[artifact.status]; return <div key={artifact.id} className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--portal-border)] p-2"><div><p className="text-xs font-semibold capitalize text-[color:var(--portal-text)]">{artifact.artifact_type}</p><p className="text-[11px] text-[color:var(--portal-muted)]">{artifact.status} · simulated</p></div><button type="button" disabled={busy || !next} onClick={() => next && void advanceArtifact(activeRun.id, artifact.artifact_type, next)} className="rounded-md bg-sky-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40">{next ? `Advance to ${next}` : 'Complete'}</button></div>})}</div> : null}
      {view === 'history' && activeRun ? <div className="mt-3 overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Email category</th><th className="p-3">Actual recipient</th><th className="p-3">Queue status</th><th className="p-3">Provider status</th><th className="p-3">Delivery</th><th className="p-3">Action</th></tr></thead><tbody>{(data?.emails || []).filter((email) => email.test_run_id === activeRun.id).map((email) => <tr key={email.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3">{email.category.replaceAll('_', ' ')}</td><td className="p-3">{email.actual_recipient}</td><td className="p-3">{email.status}</td><td className="p-3">{email.provider_status || 'not attempted'}</td><td className="p-3">{email.delivery_status}</td><td className="p-3"><button type="button" disabled={busy || email.status === 'queued' || email.status === 'provider_accepted' || email.status === 'delivered'} onClick={() => void queueTestEmail(activeRun.id, email.category)} className="rounded-md bg-sky-700 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40">Send test</button></td></tr>)}</tbody></table><p className="p-3 text-[11px] text-[color:var(--portal-muted)]">Test mail routes only to the verified inbox. Provider acceptance does not imply delivery; delivery status changes on provider callbacks.</p></div> : null}
      {view === 'settings' ? <div className="mt-4 grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Test identification email<input value={email} readOnly className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Test identification phone<input value={phone} readOnly className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="text-xs font-semibold text-[color:var(--portal-muted)] md:col-span-2">Verified test email recipient<input value={recipient} readOnly className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="flex items-start gap-2 text-xs text-[color:var(--portal-muted)] md:col-span-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-sky-700" /><span>I confirmed this exact inbox is authorized to receive optional test emails. The test email action sends only to this address.</span></label>
        <label className="flex items-start gap-2 text-xs font-semibold text-[color:var(--portal-text)] md:col-span-2"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="mt-0.5 accent-sky-700" /><span>Enable exact-match test submissions</span></label>
        <div className="flex flex-wrap gap-2 md:col-span-2"><button type="button" disabled={busy || (enabled && !data?.settings?.enabled && !confirmed)} onClick={() => void saveSettings()} className="h-10 rounded-lg bg-sky-700 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : enabled && !data?.settings?.enabled ? 'Enable test workflow' : 'Save settings'}</button><span className="self-center text-xs font-semibold text-[color:var(--portal-muted)]">{enabled ? 'Enabled' : 'Disabled by default'}</span><p className="basis-full text-[11px] text-[color:var(--portal-muted)]">Normalized phone: {data?.system?.normalizedPhone || '—'} · Inquiry, newsletter, and Elena contact routes use server-side matching; external integration health is not checked here.</p><p className="basis-full text-[11px] text-[color:var(--portal-muted)]">Mail provider configuration: {data?.system?.emailProvider || 'unavailable'} (configuration only; delivery health is not checked). Latest run: {latestRun ? `${latestRun.id} · ${latestRun.status}` : 'none'} · Current run: {activeRun?.id || 'none'} · Last reset: {lastReset ? new Date(lastReset).toLocaleString() : 'none'}. Exact-match public submissions can queue automatic test mail, and Send test queues mail explicitly; both deliver only to the verified inbox. SMS remains simulated.</p></div>
      </div> : null}
    </section>
  )
}
