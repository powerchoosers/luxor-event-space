'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { History, RotateCcw, Settings2 } from 'lucide-react'

type Payload = {
  settings: { enabled: boolean; identification_email: string; identification_phone: string; email_recipient: string | null } | null
  lead: { id: string; full_name: string; status: string } | null
  runs: Array<{ id: string; status: string; source: string; started_at: string }>
  activity: Array<{ id: number; event_type: string; status: string | null; created_at: string; details?: Record<string, unknown> }>
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

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/portal/test-lead', { cache: 'no-store' })
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
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  if (authorized !== true || (data && data.lead?.id !== leadId)) return null

  const activeRun = data?.runs.find((run) => run.status === 'in_progress')
  async function saveSettings() {
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
    if (!activeRun || !window.confirm('Reset this test run? Its history will remain available.')) return
    setBusy(true); setNotice('')
    try {
      const response = await fetch('/api/portal/test-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset', testRunId: activeRun.id, confirm: true }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Unable to reset test pipeline.')
      setNotice('Test run reset; the permanent lead and history were preserved.')
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to reset test pipeline.') }
    finally { setBusy(false) }
  }

  return (
    <section aria-label="Pinned test lead" className="mb-4 rounded-2xl border border-sky-300/70 bg-sky-50/80 p-4 shadow-sm dark:border-sky-800 dark:bg-sky-950/35">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-[color:var(--portal-text)]">{data?.lead?.full_name || 'Permanent Test Lead'}</h2><span className="rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">Test</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`}>{enabled ? 'Enabled' : 'Disabled'}</span></div>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Current run: {activeRun ? `${activeRun.id.slice(0, 8)} · ${activeRun.status}` : 'No active run'} · Test email recipient: {recipient || 'unconfirmed'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portal/leads/${leadId}`} className="inline-flex h-9 items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]">View Test Lead</Link>
          <button type="button" onClick={() => setView(view === 'history' ? null : 'history')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]"><History size={13} /> Test History</button>
          <button type="button" onClick={() => setView(view === 'settings' ? null : 'settings')} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)]"><Settings2 size={13} /> Test Settings</button>
          <button type="button" disabled={!activeRun || busy} onClick={() => void reset()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"><RotateCcw size={13} /> Reset Pipeline</button>
        </div>
      </div>
      {notice ? <p role="status" className="mt-3 text-xs text-[color:var(--portal-text)]">{notice}</p> : null}
      {view === 'history' ? <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="border-b border-[color:var(--portal-border)] text-[color:var(--portal-muted)]"><th className="p-3">Run</th><th className="p-3">Source</th><th className="p-3">Started</th><th className="p-3">Status</th></tr></thead><tbody>{data?.runs.length ? data.runs.map((run) => <tr key={run.id} className="border-b border-[color:var(--portal-border)] last:border-0"><td className="p-3 font-mono">{run.id.slice(0, 12)}</td><td className="p-3">{run.source}</td><td className="p-3">{new Date(run.started_at).toLocaleString()}</td><td className="p-3">{run.status}</td></tr>) : <tr><td colSpan={4} className="p-3 text-[color:var(--portal-muted)]">No test runs recorded.</td></tr>}</tbody></table><div className="border-t border-[color:var(--portal-border)] p-3 text-xs text-[color:var(--portal-muted)]">{data?.activity.length ?? 0} append-only run events recorded.</div></div> : null}
      {view === 'settings' ? <div className="mt-4 grid gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 md:grid-cols-2">
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Test identification email<input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Test identification phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="text-xs font-semibold text-[color:var(--portal-muted)] md:col-span-2">Confirmed test email recipient<input value={recipient} onChange={(event) => { setRecipient(event.target.value); setConfirmed(false) }} className="mt-1 block h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]" /></label>
        <label className="flex items-start gap-2 text-xs text-[color:var(--portal-muted)] md:col-span-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-sky-700" /><span>I confirmed this exact address is authorized to receive test email. New identifiers are dedicated to testing; the server still rejects unknown customer collisions.</span></label>
        <div className="flex flex-wrap gap-2 md:col-span-2"><button type="button" disabled={busy || (enabled && !confirmed)} onClick={() => void saveSettings()} className="h-10 rounded-lg bg-sky-700 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : enabled ? 'Confirm and enable' : 'Save settings'}</button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable test workflow</label><p className="basis-full text-[11px] text-[color:var(--portal-muted)]">The server rejects any matching inquiry outside the exact owner-reviewed historical ID list.</p></div>
      </div> : null}
    </section>
  )
}
