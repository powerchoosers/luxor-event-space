'use client'

import { useCallback, useEffect, useState } from 'react'
import { PortalButton, PortalDatePicker } from '@/components/portal/PortalUI'

type Plan = { id: string; amount: number; planned_date: string; status: 'planned' | 'cancelled'; requires_review: boolean; closure_reason: 'cancelled' | 'reviewed' | null }
type Preferences = { seven_days: boolean; three_days: boolean; due_day: boolean; overdue: boolean; updated_at: string }
type Pending = { id: string; amount: number; date: string }
const defaultPreferences = { seven_days: false, three_days: false, due_day: false, overdue: false }
export default function BillPlanning({ billId, canPlan, canConfigure }: { billId: string; canPlan: boolean; canConfigure: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [choices, setChoices] = useState(defaultPreferences)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [preferenceUncertain, setPreferenceUncertain] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const storageKey = `luxor-bill-plan:${billId}`
  useEffect(() => { try { const raw = sessionStorage.getItem(storageKey); if (raw) { const parsed = JSON.parse(raw) as Pending; if (typeof parsed.id === 'string' && typeof parsed.amount === 'number' && typeof parsed.date === 'string') setPending(parsed) } } catch {} }, [storageKey])
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(billId)}/planning`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || body.unavailable === true) {
        if (body.unavailable === true) { setUnavailable(true); setPlans([]); setPreferences(null); setLoaded(true); setError(''); return }
        throw new Error(body.error || 'Planning unavailable.')
      }
      if (!Array.isArray(body.plans)) throw new Error(body.error || 'Planning unavailable.')
      setUnavailable(false); setPlans(body.plans); setPreferences(body.preferences || null); setChoices(body.preferences || defaultPreferences); setLoaded(true); setError(''); setPreferenceUncertain(false)
    } catch (cause) { setLoaded(false); setError(cause instanceof Error ? cause.message : 'Planning unavailable.') }
  }, [billId])
  useEffect(() => { void refresh() }, [refresh])
  async function sendPlan(intent: Pending) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(billId)}/planning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', amount: intent.amount, plannedDate: intent.date, requestId: intent.id }) })
      const result = await response.json()
      if (!response.ok) {
        if (result.unavailable === true) { setUnavailable(true); setPlans([]); setPreferences(null); setLoaded(true) }
        if (response.status < 500) { setPending(null); sessionStorage.removeItem(storageKey) }
        throw new Error(result.error || 'Plan could not be saved.')
      }
      setPending(null); sessionStorage.removeItem(storageKey); setAmount(''); setDate(''); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Plan could not be confirmed. Retry the same request.') }
    finally { setBusy(false) }
  }
  function createPlan(event: React.FormEvent) {
    event.preventDefault(); if (pending) { void sendPlan(pending); return }
    const number = Number(amount)
    if (!amount.trim() || !Number.isFinite(number) || number <= 0 || number > 9999999999.99 || Math.abs(Math.round(number * 100) - number * 100) > 0.0000001 || !date) { setError('Enter a positive amount and a date.'); return }
    const intent = { id: crypto.randomUUID(), amount: number, date }
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)) } catch { setError('This browser cannot safely retain the request for retry.'); return }
    setPending(intent); void sendPlan(intent)
  }
  async function cancelPlan(planId: string, action: 'cancel' | 'reviewed') {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/operations/bills/${encodeURIComponent(billId)}/planning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, planId }) })
      const result = await response.json()
      if (!response.ok) {
        if (result.unavailable === true) { setUnavailable(true); setPlans([]); setPreferences(null); setLoaded(true) }
        throw new Error(result.error || 'Plan could not be canceled.')
      }
      await refresh()
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Plan could not be canceled.') } finally { setBusy(false) }
  }
  async function savePreferences() {
    setBusy(true); setError('')
    try { const response = await fetch(`/api/operations/bills/${encodeURIComponent(billId)}/planning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preferences', ...choices, expectedUpdatedAt: preferences?.updated_at || null }) }); const body = await response.json(); if (!response.ok) { if (body.unavailable === true) { setUnavailable(true); setPlans([]); setPreferences(null); setLoaded(true) } else if (response.status >= 500) setPreferenceUncertain(true); throw new Error(body.error || 'Preferences could not be saved.') } setPreferences(body.preferences); setChoices(body.preferences); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Preferences could not be confirmed. Reload before retrying.') } finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><div><h4 className="text-sm font-bold text-[color:var(--portal-text)]">Payment planning</h4><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">A plan is a note for your records. It does not send money or count as a payment; record actual payments on the linked expense.</p></div>
    {error ? <p role="alert" className="text-xs text-[color:var(--portal-text)]">{error}</p> : null}{unavailable ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Payment plans and reminder preferences are not stored yet. The bill due date still applies. Nothing is scheduled, and no notification is sent.</p> : !loaded ? <PortalButton size="sm" onClick={() => void refresh()}>Reload planning</PortalButton> : <>
      <PortalButton size="sm" disabled={busy} onClick={() => void refresh()}>Refresh plans</PortalButton>
      {plans.length ? <ul className="divide-y divide-[color:var(--portal-border)]">{plans.map((plan) => <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-[color:var(--portal-text)]"><span className="tabular-nums">{plan.planned_date} · {Number(plan.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} · {plan.status === 'cancelled' && plan.closure_reason === 'reviewed' ? 'closed after review' : plan.requires_review ? 'payment history changed — review needed' : plan.status}</span>{plan.status === 'planned' ? <span className="flex flex-wrap gap-2">{plan.requires_review ? <PortalButton size="sm" disabled={busy} onClick={() => { if (window.confirm('Close this plan after reviewing the expense payment history? This does not record or change a payment.')) void cancelPlan(plan.id, 'reviewed') }}>Close after review</PortalButton> : null}<PortalButton size="sm" disabled={busy} onClick={() => void cancelPlan(plan.id, 'cancel')}>Cancel plan</PortalButton></span> : null}</li>)}</ul> : <p className="text-xs text-[color:var(--portal-muted)]">No payment plans.</p>}
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">A change to payment history flags every open plan for review. Check the linked expense, then close or cancel the appropriate plans. Closing a plan does not record a payment.</p>
      {canPlan || pending ? <form onSubmit={createPlan} className="space-y-2"><label className="block text-xs text-[color:var(--portal-text)]">Planned amount<input type="number" min="0.01" step="0.01" disabled={busy || Boolean(pending)} value={pending ? String(pending.amount) : amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm tabular-nums text-[color:var(--portal-text)]" /></label><div><p className="mb-1 text-xs text-[color:var(--portal-text)]">Planned date</p>{pending ? <p className="text-sm tabular-nums text-[color:var(--portal-text)]">{pending.date}</p> : <PortalDatePicker value={date} onChange={setDate} timeZone="America/Chicago" allowPastDates={false} />}</div><PortalButton type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : pending ? 'Retry same plan' : 'Save plan'}</PortalButton></form> : <p className="text-xs text-[color:var(--portal-muted)]">Approve and link an expense before adding a plan.</p>}
      <div className="space-y-2 border-t border-[color:var(--portal-border)] pt-3"><h4 className="text-sm font-bold text-[color:var(--portal-text)]">Reminder preferences</h4><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Enabled reminders appear in Bills and vendors when the linked remaining balance is verified. No external notifications are sent.</p>{!canConfigure ? <p className="text-xs text-[color:var(--portal-muted)]">Restore the bill before editing preferences.</p> : null}{([['seven_days','7 days before'],['three_days','3 days before'],['due_day','On the due date'],['overdue','When overdue']] as const).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs text-[color:var(--portal-text)]"><input type="checkbox" checked={choices[key]} onChange={(event) => setChoices({ ...choices, [key]: event.target.checked })} disabled={busy || preferenceUncertain || !canConfigure} />{label}</label>)}<div className="flex gap-2"><PortalButton size="sm" disabled={busy || preferenceUncertain || !canConfigure} onClick={() => void savePreferences()}>Save preferences</PortalButton>{preferenceUncertain ? <PortalButton size="sm" disabled={busy} onClick={() => void refresh()}>Reload</PortalButton> : null}</div></div>
    </>}
  </section>
}
