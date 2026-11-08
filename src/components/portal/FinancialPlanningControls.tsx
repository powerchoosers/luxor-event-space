'use client'

import { checkPlanningReceipt } from '@/lib/luxorFinancialPlanningResolutionClient'
import React, { useEffect, useRef, useState } from 'react'
import { PortalButton, PortalDatePicker, PortalSelect } from '@/components/portal/PortalUI'
import { getGoalProgressDraft } from '@/lib/luxorFinancialPlanningModels'
import { buildPlanningStatusRequestDraft, savePlanningWithRecoveryDraft, type createPlanningRetryStoreDraft, type PendingPlanningRequest, type PlanningSaveResult } from '@/lib/luxorFinancialPlanningRecovery'
import type { PlanningGoal, ManualOpeningScenario } from '@/lib/luxorFinancialPlanningTypes'
import type { PlanningReviewItem, StoredPlanningItem } from '@/lib/luxorFinancialPlanningApi'
import type { GoalActualDraft } from '@/lib/luxorFinancialPlanningActuals'

/** Isolated adapter: the parent supplies verified actuals and authenticated saves. */
export type { GoalActualDraft } from '@/lib/luxorFinancialPlanningActuals'
type Recovery = ReturnType<typeof createPlanningRetryStoreDraft>
export function LuxorPlanningControlsDraft({ today, items, actuals, recovery, save, onSaved, scope, needsReview }: {
  today: string
  scope: string
  needsReview: PlanningReviewItem[]
  items: StoredPlanningItem[]
  actuals: Record<string, GoalActualDraft | undefined>
  /** A stable, principal-scoped store; clear the principal's key on logout. */
  recovery: Recovery
  save: (request: PendingPlanningRequest) => Promise<PlanningSaveResult>
  onSaved: () => void
}) {
  const [kind, setKind] = useState<'goal' | 'opening_scenario'>('goal')
  const [editing, setEditing] = useState<StoredPlanningItem | null>(null)
  const [title, setTitle] = useState('')
  const [metric, setMetric] = useState<PlanningGoal['metric']>('event_collections')
  const [direction, setDirection] = useState<PlanningGoal['direction']>('at_least')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [amount, setAmount] = useState('')
  const [reserve, setReserve] = useState('')
  const [pending, setPending] = useState<PendingPlanningRequest | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (!active) return
      try { setPending(recovery.load()); setReady(true) }
      catch { setError('A saved request needs review. Refresh after resolving the local storage issue.'); setReady(false) }
    })
    return () => { active = false }
  }, [recovery])
  const locked = !ready || busy || Boolean(pending)
  const number = (value: string, nullable: boolean, signed = false) => {
    if (!value.trim() && nullable) return null
    const parsed = Number(value)
    return (signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value.trim()) && Number.isFinite(parsed) && Math.abs(parsed) <= 9999999999.99 ? parsed : undefined
  }
  function reset() { setEditing(null); setTitle(''); setAmount(''); setReserve(''); setStart(today); setEnd(today) }
  async function send(request: PendingPlanningRequest) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const result = await savePlanningWithRecoveryDraft(recovery, request, save)
      setPending(null)
      if (result.status === 'conflict') setError('This item changed elsewhere. Refresh before editing it again.')
      else if (result.status === 'rejected') setError('The details were not saved. Check the fields and try again.')
      else reset()
      try { onSaved() } catch { setError('Saved. Refresh to load the latest planning records.') }
    } catch {
      // Stage happens before send. If the store itself is unavailable, do not
      // allow a second operation until the host can establish the save state.
      try { setPending(recovery.load()) } catch { setPending(request); setReady(false) }
      setError('Save could not be confirmed. Retry the saved request or resolve local storage before another change.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  async function checkStatus() {
    if (!pending || inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const status = await checkPlanningReceipt({ ...pending, principalScope: scope })
      if (status === 'saved' || status === 'conflict') {
        recovery.clear(pending.operationId)
        setPending(null)
        setError(status === 'saved' ? 'Save confirmed.' : 'This item changed elsewhere. Review the latest version.')
        try { onSaved() } catch { setError(status === 'saved' ? 'Save confirmed. Refresh to see the latest planning records.' : 'The item changed. Refresh to see the latest planning records.') }
      } else setError(status === 'not_found' ? 'Save status is still unknown. Check again later.' : 'The saved request needs review; no changes were made.')
    } catch { setError('Save status could not be verified. The request remains saved in this tab.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  function edit(item: StoredPlanningItem) {
    setEditing(item); setKind(item.kind); setError(null)
    if (item.kind === 'goal') {
      setTitle(item.payload.title); setMetric(item.payload.metric); setDirection(item.payload.direction); setStart(item.payload.periodStart); setEnd(item.payload.periodEnd); setAmount(String(item.payload.target)); setReserve('')
    } else {
      setTitle(item.payload.label); setStart(item.payload.asOf); setAmount(item.payload.openingAmount === null ? '' : String(item.payload.openingAmount)); setReserve(item.payload.minimumReserve === null ? '' : String(item.payload.minimumReserve))
    }
  }
  function submit() {
    if (pending) { void send(pending); return }
    if (locked) return
    const value = number(amount, kind === 'opening_scenario', kind === 'opening_scenario' || metric === 'net_recorded_flows')
    const reserveValue = kind === 'opening_scenario' ? number(reserve, true) : null
    if (!title.trim() || value === undefined || reserveValue === undefined || !start || (kind === 'goal' && (!end || start > end)) || (kind === 'goal' && value === null)) { setError('Check the name, dates and amounts.'); return }
    if (kind === 'goal' && ((metric === 'booking_count' && !Number.isInteger(value)) || (metric === 'event_margin' && (Number(value) < 0 || Number(value) > 100)))) { setError('Check the target for this goal.'); return }
    const id = editing?.payload.id || crypto.randomUUID()
    const revision = editing?.payload.revision ?? 0
    const payload: PlanningGoal | ManualOpeningScenario = kind === 'goal'
      ? { id, title: title.trim(), metric, periodStart: start, periodEnd: end, target: value as number, direction, status: editing?.payload.status || 'active', revision }
      : { id, label: title.trim(), source: 'manual', asOf: start, openingAmount: value, minimumReserve: reserveValue, status: editing?.payload.status || 'active', revision }
    void send({ kind, payload, operationId: crypto.randomUUID(), expectedRevision: editing ? revision : null, schemaVersion: 1, expectedPayload: editing ? { ...editing.payload } : null })
  }
  function setItemStatus(item: StoredPlanningItem, status: 'active' | 'archived') {
    if (locked) return
    void send(buildPlanningStatusRequestDraft(item, status, crypto.randomUUID()))
  }
  function progress(goal: PlanningGoal) {
    const actual = actuals[goal.id]
    const matched = Boolean(actual && actual.metric === goal.metric && actual.periodStart === goal.periodStart && actual.periodEnd === goal.periodEnd)
    return getGoalProgressDraft({ target: goal.target, actual: matched ? actual?.value ?? null : null, direction: goal.direction, sourceComplete: Boolean(matched && actual?.sourceComplete) })
  }
  const amountText = (value: number | null) => value === null ? 'Needs review' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
  return <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-[color:var(--portal-text)] sm:p-5">
    <h2 className="text-base font-bold sm:text-lg">Planning</h2>
    <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Goals do not change transactions. Opening amounts are entered manually and are not connected bank balances.</p>
    {needsReview.length ? <div className="mt-3 text-sm"><p role="status">{needsReview.length} planning {needsReview.length === 1 ? 'record needs' : 'records need'} review. These records are preserved but cannot be edited or used in calculations until reviewed.</p><details className="mt-2"><summary className="cursor-pointer underline underline-offset-4">Show references for support</summary><ul className="mt-2 break-all">{needsReview.map((item) => <li key={item.id}>{item.kind === 'goal' ? 'Goal' : item.kind === 'opening_scenario' ? 'Scenario' : 'Planning record'}: {item.id}</li>)}</ul></details></div> : null}
    {pending ? <p role="status" className="mt-3 text-sm">{pending.schemaVersion === 1 && pending.expectedPayload !== undefined ? 'An earlier save needs confirmation. Check its status or retry before making another change. Keep this tab open until it is confirmed.' : 'An earlier save needs confirmation. Check its status before making another change. Keep this tab open until it is confirmed.'}</p> : null}
    {items.length ? <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">{items.map((item) => {
      const p = item.kind === 'goal' ? progress(item.payload) : null
      const actual = item.kind === 'goal' ? actuals[item.payload.id] : null
      const safeLink = actual?.href?.startsWith('/portal/') ? actual.href : null
      return <li key={item.payload.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-3"><div><strong>{item.kind === 'goal' ? item.payload.title : item.payload.label}</strong><span className="ml-2 text-[color:var(--portal-muted)]">{item.payload.status === 'archived' ? 'Archived' : item.kind === 'goal' ? 'Goal' : 'Manual opening'}</span>
        {item.kind === 'goal' && p ? <p className="mt-1 tabular-nums">Actual{item.payload.periodEnd >= today ? ' so far' : ''}: {amountText(p.actual)} · Target: {amountText(item.payload.target)} · {p.met === null ? 'Progress unavailable' : item.payload.periodEnd >= today ? (item.payload.direction === 'at_most' ? (p.met ? 'Currently within limit' : 'Currently over limit') : (p.met ? 'Target reached so far' : 'In progress')) : p.met ? 'Target met' : 'Target not met'}{p.percent === null ? '' : ` · ${p.percent}% of target`}{p.actual !== null && safeLink ? <> · <a href={safeLink} className="underline underline-offset-4">View records</a></> : null}</p> : item.kind === 'opening_scenario' ? <p className="mt-1 text-[color:var(--portal-muted)]">Manual amount as of {item.payload.asOf}: <span className="tabular-nums">{item.payload.openingAmount === null ? 'Not entered' : amountText(item.payload.openingAmount)}</span>{item.payload.asOf !== today ? ' · Update or reconcile before use' : ''}</p> : null}</div><div className="flex gap-2"><PortalButton disabled={locked} onClick={() => edit(item)}>Edit</PortalButton><PortalButton disabled={locked} onClick={() => setItemStatus(item, item.payload.status === 'active' ? 'archived' : 'active')}>{item.payload.status === 'active' ? 'Archive' : 'Restore'}</PortalButton></div></div></li>
    })}</ul> : <p className="mt-4 text-sm text-[color:var(--portal-muted)]">{needsReview.length ? 'No other goals or manual scenarios are available.' : 'No goals or manual scenarios yet.'}</p>}
    <h3 className="mt-5 text-sm font-bold">{editing ? 'Edit planning item' : 'Add a planning item'}</h3>
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <div><span className="mb-1 block text-sm">Type</span><PortalSelect aria-label="Planning item type" value={kind} onChange={(value) => setKind(value as typeof kind)} disabled={locked || Boolean(editing)} options={[{ value: 'goal', label: 'Goal' }, { value: 'opening_scenario', label: 'Manual opening scenario' }]} /></div>
      <label className="text-sm">Name<input className="portal-input mt-1 block w-full" value={title} onChange={(event) => setTitle(event.target.value)} disabled={locked} maxLength={120} /></label>
      {kind === 'goal' ? <><div><span className="mb-1 block text-sm">Measure</span><PortalSelect aria-label="Goal measure" value={metric} onChange={(value) => setMetric(value as typeof metric)} disabled={locked} options={[{ value: 'event_collections', label: 'Event collections' }, { value: 'paid_expenses', label: 'Paid expenses' }, { value: 'booking_count', label: 'Bookings' }, { value: 'net_recorded_flows', label: 'Net recorded flows' }, { value: 'event_margin', label: 'Event margin' }, { value: 'minimum_reserve', label: 'Minimum reserve' }]} /></div><div><span className="mb-1 block text-sm">Target direction</span><PortalSelect aria-label="Target direction" value={direction} onChange={(value) => setDirection(value as typeof direction)} disabled={locked} options={[{ value: 'at_least', label: 'At least' }, { value: 'at_most', label: 'At most' }]} /></div></> : null}
      <div><span className="mb-1 block text-sm">{kind === 'goal' ? 'From' : 'As of'}</span>{locked ? <span className="text-sm tabular-nums">{start}</span> : <PortalDatePicker value={start} onChange={setStart} />}</div>
      {kind === 'goal' ? <div><span className="mb-1 block text-sm">Through</span>{locked ? <span className="text-sm tabular-nums">{end}</span> : <PortalDatePicker value={end} onChange={setEnd} />}</div> : null}
      <label className="text-sm">{kind === 'goal' ? 'Target' : 'Opening amount (optional)'}<input className="portal-input mt-1 block w-full tabular-nums" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={locked} /></label>
      {kind === 'opening_scenario' ? <label className="text-sm">Minimum reserve (optional)<input className="portal-input mt-1 block w-full tabular-nums" inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} disabled={locked} /></label> : null}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : null}
    <div className="mt-4 flex gap-2">{!pending || (pending.schemaVersion === 1 && pending.expectedPayload !== undefined) ? <PortalButton variant="primary" className="!text-white" onClick={submit} disabled={busy || !ready}>{busy ? 'Saving…' : pending ? 'Retry save' : 'Save'}</PortalButton> : null}{pending ? <PortalButton disabled={busy || !ready} onClick={() => void checkStatus()}>Check save status</PortalButton> : null}{editing && !pending ? <PortalButton disabled={locked} onClick={reset}>Cancel</PortalButton> : null}</div>
  </section>
}
