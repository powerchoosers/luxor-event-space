'use client'

import { useEffect, useRef, useState } from 'react'
import { checkPlanningReceipt } from '@/lib/luxorFinancialPlanningResolutionClient'
import { PortalButton } from '@/components/portal/PortalUI'
import { createRevenuePlanRetryStore, loadRevenuePlan, saveRevenuePlan } from '@/lib/luxorFinancialRevenuePlanClient'
import { validateRevenueWrite, type RevenuePlanSnapshot, type RevenuePlanWrite } from '@/lib/luxorFinancialRevenuePlan'

/** Annual target is independent; monthly allocations are always entered explicitly. */
export function FinancialRevenuePlan({ year, scope, onSaved }: { year: number; scope: string; onSaved: () => void }) {
  const [state, setState] = useState<{ key: string; snapshot: RevenuePlanSnapshot | null; pending: RevenuePlanWrite | null; writeAvailable: boolean; error: string | null } | null>(null)
  const [version, setVersion] = useState(0)
  const [annual, setAnnual] = useState('')
  const [values, setValues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inFlight = useRef(false)
  const key = `${scope}:${year}:${version}`
  useEffect(() => {
    let active = true
    Promise.resolve().then(async () => {
      try {
        const store = createRevenuePlanRetryStore(window.sessionStorage, scope)
        const pending = store.load()
        if (pending) { if (active) setState({ key, snapshot: null, pending, writeAvailable: false, error: null }); return }
        const { snapshot, writeAvailable } = await loadRevenuePlan(year, scope)
        if (active) {
          setAnnual(snapshot.plan.annualTarget === null ? '' : String(snapshot.plan.annualTarget))
          setValues(snapshot.plan.months.map((row) => row.amount === null ? '' : String(row.amount)))
          setState({ key, snapshot, pending: null, writeAvailable, error: null })
        }
      } catch { if (active) setState({ key, snapshot: null, pending: null, writeAvailable: false, error: 'Annual targets or retry storage are unavailable.' }) }
    })
    return () => { active = false }
  }, [key, scope, year])
  const current = state?.key === key ? state : null
  async function send(request: RevenuePlanWrite) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage(null)
    let store: ReturnType<typeof createRevenuePlanRetryStore> | null = null
    try {
      store = createRevenuePlanRetryStore(window.sessionStorage, scope)
      const status = await saveRevenuePlan(store, request)
      if (status === 'conflict') setMessage('Targets changed elsewhere. Review the latest values before saving.')
      else if (status === 'rejected') setMessage('The plan was not saved. Check the target and monthly allocations.')
      else if (status === 'unavailable') setMessage('Annual plan saving is not available yet. Your existing monthly targets are unchanged.')
      else { setMessage('Plan saved.'); try { onSaved() } catch { setMessage('Plan saved. Refresh the budget view to see it.') } }
      setVersion((value) => value + 1)
    } catch {
      try { const pending = store?.load() ?? null; setState({ key, snapshot: current?.snapshot || null, pending, writeAvailable: current?.writeAvailable === true, error: store ? null : 'Retry storage needs review.' }) }
      catch { setState({ key, snapshot: null, pending: request, writeAvailable: false, error: 'Retry storage needs review.' }) }
      setMessage('Save could not be confirmed. Retry the same request before making another change.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function checkStatus() {
    const pending = current?.pending
    if (!pending || inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage(null)
    try {
      const status = await checkPlanningReceipt({ ...pending, kind: 'revenue_plan' })
      if (status === 'saved' || status === 'conflict') {
        createRevenuePlanRetryStore(window.sessionStorage, scope).clear(pending.operationId)
        setMessage(status === 'saved' ? 'Save confirmed.' : 'Targets changed elsewhere. Review the latest values.')
        setVersion((value) => value + 1)
        if (status === 'saved') { try { onSaved() } catch { setMessage('Save confirmed. Refresh the budget view to see it.') } }
      } else setMessage(status === 'not_found' ? 'Save status is still unknown. Check again later.' : 'The saved request needs review; no changes were made.')
    } catch { setMessage('Save status could not be verified. The request remains saved in this tab.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  function submit() {
    if (current?.pending) { void send(current.pending); return }
    const snapshot = current?.snapshot
    if (!snapshot || !current?.writeAvailable || busy) return
    const parse = (value: string): number | null | undefined => {
      if (!value.trim()) return null
      if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return undefined
      const result = Number(value)
      return Number.isFinite(result) && result <= 9999999999.99 ? result : undefined
    }
    const annualValue = parse(annual)
    const months = values.map(parse)
    if (annualValue === undefined || months.length !== 12 || months.some((value) => value === undefined)) { setMessage('Use non-negative amounts with up to two decimal places.'); return }
    if (months.some((value, index) => value === null && snapshot.baseline[index].amount !== null)) { setMessage('Existing monthly targets cannot be cleared here. Enter a replacement amount.'); return }
    const request: RevenuePlanWrite = { principalScope: scope, operationId: crypto.randomUUID(), expectedRevision: snapshot.exists ? snapshot.plan.revision : null, plan: { ...snapshot.plan, annualTarget: annualValue, months: snapshot.plan.months.map((row, index) => ({ ...row, amount: months[index] as number | null })) }, baseline: snapshot.baseline }
    if (!validateRevenueWrite(request)) { setMessage('If every month is allocated, the amounts must add up to the annual target.'); return }
    void send(request)
  }
  return <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-[color:var(--portal-text)] sm:p-5">
    <h2 className="text-base font-bold sm:text-lg">Annual collection plan</h2>
    <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Set a target and choose each month’s amount. Blank months are unallocated; nothing is divided automatically. Targets do not change payments.</p>
    {current && !current.writeAvailable && !current.pending && !current.error ? <p role="status" className="mt-3 text-sm">Annual plan saving is not available yet. Existing targets remain visible below.</p> : null}
    {current?.pending ? <p role="status" className="mt-3 text-sm">A previous save needs confirmation before another plan can be edited. Keep this tab open until it is confirmed.</p> : current?.error ? <p role="alert" className="mt-3 text-sm">{current.error} <button type="button" className="underline" onClick={() => setVersion((value) => value + 1)}>Try again</button></p> : !current ? <p role="status" className="mt-3 text-sm">Loading targets…</p> : <details className="mt-4"><summary className="w-fit cursor-pointer text-sm font-semibold underline underline-offset-4">Review or edit {year} targets</summary><label className="mt-3 block text-sm">Annual target (optional)<input value={annual} onChange={(event) => setAnnual(event.target.value)} inputMode="decimal" className="portal-input mt-1 block w-40 tabular-nums" disabled={busy || !current.writeAvailable} /></label><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{current.snapshot?.plan.months.map((row, index) => <label key={row.month} className="text-sm">{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}<input value={values[index] || ''} onChange={(event) => setValues((previous) => previous.map((value, i) => i === index ? event.target.value : value))} inputMode="decimal" className="portal-input mt-1 block w-full tabular-nums" disabled={busy || !current.writeAvailable} /></label>)}</div></details>}
    {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
    {current?.pending ? <PortalButton className="mt-4 mr-2" disabled={busy} onClick={() => void checkStatus()}>Check save status</PortalButton> : null}
    {current && !current.error ? <PortalButton className="mt-4 !text-white" variant="primary" onClick={submit} disabled={busy || (!current.pending && !current.writeAvailable)}>{busy ? 'Saving…' : current.pending ? 'Retry save' : 'Save plan'}</PortalButton> : null}
  </section>
}
