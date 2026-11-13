'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PortalButton, PortalModal } from '@/components/portal/PortalUI'
import { FUNNEL_GOAL_CADENCES, FUNNEL_GOAL_METRICS, getFunnelGoal, parseFunnelGoals, funnelGoalProgress, type FunnelGoals, type FunnelGoalMetric } from '@/lib/luxorFunnelGoals'
import { getFunnelPeriodFromRange, type FunnelPeriod } from '@/lib/luxorFunnelPeriods'
import type { PortalDateRange } from '@/components/portal/PortalDateRangeControl'

type Metric = FunnelGoalMetric | 'depositsReceived' | 'conversionRate'
export type FunnelAnalytics = { period: FunnelPeriod; metrics: Record<Metric, number | null>; dailyLeads: Array<{ date: string; count: number | null }>; issues: string[]; definitions: Record<string, string> }
export type GoalSnapshot = { available: true; goals: FunnelGoals; revision: number; updatedAt: string | null; canEdit: boolean }
type GoalRequest = { requestId: string; expectedRevision: number; goals: FunnelGoals }
const PENDING_KEY = 'luxor:funnel-goals:pending-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LABELS: Record<FunnelGoalMetric, string> = { newInquiries: 'New inquiries', toursScheduled: 'Tours scheduled', toursCompleted: 'Tours completed', proposalsSent: 'Proposals sent', bookedEvents: 'Booked events', revenue: 'Revenue' }
const KPIS = [
  ['newInquiries', 'New inquiries', 'pipeline'], ['toursScheduled', 'Tours scheduled', 'tours'], ['toursCompleted', 'Tours completed', 'tours'],
  ['proposalsSent', 'Proposals sent', 'proposals'], ['depositsReceived', 'Deposits received', 'clients'], ['conversionRate', 'Conversion rate', 'clients'],
] as const
const panel = 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'
const field = 'w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-2 py-2 text-sm text-[color:var(--portal-text)] focus:outline-none focus:ring-2 focus:ring-[#caa24c]/60'
function record(v: unknown): v is Record<string, unknown> { return Boolean(v && typeof v === 'object' && !Array.isArray(v)) }
export function parseGoalSnapshot(value: unknown): GoalSnapshot | null {
  if (!record(value) || value.available !== true || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || typeof value.canEdit !== 'boolean') return null
  if (value.updatedAt !== null && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) return null
  const goals = parseFunnelGoals(value.goals)
  return goals ? { available: true, goals, revision: value.revision as number, updatedAt: value.updatedAt as string | null, canEdit: value.canEdit } : null
}
export function parseFunnelAnalytics(value: unknown, period: FunnelPeriod): FunnelAnalytics | null {
  if (!record(value) || !record(value.period) || value.period.startDate !== period.startDate || value.period.endDate !== period.endDate || value.period.kind !== period.kind || !record(value.metrics) || !Array.isArray(value.dailyLeads)) return null
  const metrics = value.metrics
  const keys: Metric[] = [...FUNNEL_GOAL_METRICS, 'depositsReceived', 'conversionRate']
  if (keys.some(k => metrics[k] !== null && (typeof metrics[k] !== 'number' || !Number.isFinite(metrics[k]) || (metrics[k] as number) < 0))) return null
  const days = value.dailyLeads
  if (days.length !== period.days.length || days.some((d, i) => !record(d) || d.date !== period.days[i] || (d.count !== null && (typeof d.count !== 'number' || !Number.isInteger(d.count) || d.count < 0)))) return null
  return { period, metrics: metrics as FunnelAnalytics['metrics'], dailyLeads: days as FunnelAnalytics['dailyLeads'], issues: Array.isArray(value.issues) ? value.issues.filter((x): x is string => typeof x === 'string') : [], definitions: record(value.definitions) ? Object.fromEntries(Object.entries(value.definitions).filter((x): x is [string, string] => typeof x[1] === 'string')) : {} }
}
export function readPendingFunnelGoals(storage: Storage = sessionStorage): GoalRequest | null {
  const raw = storage.getItem(PENDING_KEY)
  if (!raw) return null
  const v: unknown = JSON.parse(raw)
  if (!record(v) || typeof v.requestId !== 'string' || !UUID.test(v.requestId) || !Number.isSafeInteger(v.expectedRevision) || (v.expectedRevision as number) < 0) throw new Error('The previous goal save needs review before another edit.')
  const goals = parseFunnelGoals(v.goals)
  if (!goals) throw new Error('The previous goal save needs review before another edit.')
  return { requestId: v.requestId.toLowerCase(), expectedRevision: v.expectedRevision as number, goals }
}
export async function saveFunnelGoals(goals: FunnelGoals, revision: number, send: typeof fetch = fetch, storage: Storage = sessionStorage): Promise<GoalSnapshot> {
  const prior = readPendingFunnelGoals(storage)
  const parsed = parseFunnelGoals(goals)
  if (!parsed || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Enter nonnegative whole-number goals, or revenue with up to two decimal places.')
  const input: GoalRequest = prior || { requestId: crypto.randomUUID(), expectedRevision: revision, goals: parsed }
  if (prior && JSON.stringify(prior.goals) !== JSON.stringify(parsed)) throw new Error('Retry the original unconfirmed save before changing its goals.')
  storage.setItem(PENDING_KEY, JSON.stringify(input))
  const response = await send('/api/portal/funnel-goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    // A later rejection cannot disprove an earlier uncertain commit.
    if (!prior && record(body) && body.committed === false && [400, 409].includes(response.status)) storage.removeItem(PENDING_KEY)
    throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'The save could not be confirmed. Retry the original save.')
  }
  const saved = parseGoalSnapshot(body)
  if (!saved || !record(body) || body.requestId !== input.requestId || saved.revision !== input.expectedRevision + 1 || JSON.stringify(saved.goals) !== JSON.stringify(input.goals)) throw new Error('The save could not be confirmed. Retry the original save.')
  storage.removeItem(PENDING_KEY)
  return saved
}
export function funnelNumber(value: number | null | undefined, kind?: string): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (kind === 'conversionRate') return `${value.toFixed(1)}%`
  return new Intl.NumberFormat('en-US', kind === 'revenue' ? { style: 'currency', currency: 'USD', maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }).format(value)
}

export function FunnelDailyChart({ period, days, dailyGoal, total, periodGoal }: { period: FunnelPeriod; days: FunnelAnalytics['dailyLeads']; dailyGoal: number | null; total: number | null; periodGoal: number | null }) {
  const scale = Math.max(1, Math.ceil(Math.max(dailyGoal || 0, ...days.map(d => d.count || 0)) / 5) * 5)
  const progress = funnelGoalProgress(total, periodGoal)
  return <section className={`${panel} min-w-0 p-5 xl:col-span-2`} aria-label="Leads by Day">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">Leads by Day</h3><p className="text-xs text-[color:var(--portal-muted)]">New inquiries each day vs. your daily goal.</p></div><p className="text-xs text-[color:var(--portal-muted)]">{dailyGoal === null ? 'No daily goal configured' : `Daily goal: ${funnelNumber(dailyGoal)}`}</p></div>
    <div className="mt-8 overflow-x-auto pb-3 portal-scrollbar" tabIndex={0} role="region" aria-label="Daily lead counts; scroll horizontally to see every date">
      <div className="relative" style={{ minWidth: `${Math.max(320, days.length * 48)}px` }}>
        <div className="relative h-52 border-b border-[color:var(--portal-border)]">
          {dailyGoal !== null ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-[#a8792f]" style={{ bottom: `${dailyGoal / scale * 100}%` }} /> : null}
          <div className="absolute inset-0 flex items-end">{days.map(d => <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end px-2" title={`${d.date}: ${funnelNumber(d.count)} leads`}>
            <span className="mb-1 text-center text-xs font-semibold tabular-nums">{funnelNumber(d.count)}</span>
            <div className="mx-auto w-full max-w-8 rounded-t-sm bg-[#caa24c]" style={{ height: d.count === null ? 0 : `${d.count / scale * 100}%`, flexShrink: 0 }} />
          </div>)}</div>
        </div>
        <div className="mt-2 flex">{days.map(d => <span key={d.date} className="flex-1 text-center text-[10px] tabular-nums text-[color:var(--portal-muted)]">{new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...(period.kind === 'weekly' ? { weekday: 'short' } : { month: 'numeric', day: 'numeric' }) }).format(new Date(`${d.date}T12:00:00Z`))}</span>)}</div>
      </div>
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[color:var(--portal-border)] pt-4 text-xs"><div><dt className="text-[color:var(--portal-muted)]">Total leads</dt><dd className="mt-1 font-bold tabular-nums">{funnelNumber(total)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Period goal</dt><dd className="mt-1 font-bold tabular-nums">{funnelNumber(periodGoal)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Goal achieved</dt><dd className="mt-1 font-bold tabular-nums">{progress.percent === null ? '—' : `${Math.round(progress.percent)}%`}</dd></div></dl>
    <table className="sr-only"><caption>Daily new inquiries for {period.label}</caption><thead><tr><th>Date</th><th>Leads</th></tr></thead><tbody>{days.map(d => <tr key={d.date}><th>{d.date}</th><td>{d.count === null ? 'Unavailable' : d.count}</td></tr>)}</tbody></table>
  </section>
}

export function LeadsFunnelDashboard({ range, onSelectTab, onPeriodChange }: { range: PortalDateRange; onSelectTab?: (tab: 'pipeline' | 'tours' | 'proposals' | 'clients') => void; onPeriodChange?: (period: FunnelPeriod) => void }) {
  const period = useMemo(() => getFunnelPeriodFromRange(range.start, range.end), [range.start, range.end])
  useEffect(() => { onPeriodChange?.(period) }, [period, onPeriodChange])
  const [analytics, setAnalytics] = useState<FunnelAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [reload, setReload] = useState(0)
  const [snapshot, setSnapshot] = useState<GoalSnapshot | null>(null)
  const [goalNotice, setGoalNotice] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<FunnelGoals | null>(null)
  const [saveNotice, setSaveNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState(false)
  const [month, setMonth] = useState(() => range.start.slice(0, 7))
  const [quarter, setQuarter] = useState(() => `${range.start.slice(0, 4)}-Q${Math.floor((+range.start.slice(5, 7) - 1) / 3) + 1}`)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    setLoading(true); setAnalytics(null); setDataError('')
    fetch(`/api/portal/funnel-analytics?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const parsed = parseFunnelAnalytics(await response.json(), period)
      if (!response.ok || !parsed) throw new Error('Period data is unavailable. No estimates are shown.')
      if (active) setAnalytics(parsed)
    }).catch(() => { if (active && !controller.signal.aborted) setDataError('Period data is unavailable. No estimates are shown.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [range.start, range.end, period, reload])
  useEffect(() => {
    const controller = new AbortController(); let active = true
    fetch('/api/portal/funnel-goals', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const parsed = parseGoalSnapshot(await response.json())
      if (!response.ok || !parsed) throw new Error('Saved goals are unavailable.')
      if (active) { setSnapshot(parsed); setGoalNotice('') }
    }).catch(() => { if (active && !controller.signal.aborted) { setSnapshot(null); setGoalNotice('Saved goals are unavailable. Actual metrics remain visible.') } })
    return () => { active = false; controller.abort() }
  }, [reload])
  const visible = analytics?.period.startDate === period.startDate && analytics.period.endDate === period.endDate ? analytics : null
  function openEditor() {
    if (!snapshot?.canEdit) return
    try { const old = readPendingFunnelGoals(); setDraft(old?.goals || structuredClone(snapshot.goals)); setPending(Boolean(old)); setSaveNotice(old ? 'An earlier save is unconfirmed. Retry it unchanged to check the result.' : ''); setEditorOpen(true) }
    catch (error) { setGoalNotice(error instanceof Error ? error.message : 'Previous save needs review.') }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft || !snapshot || savingRef.current) return
    savingRef.current = true; setSaving(true); setSaveNotice('')
    try {
      const saved = await saveFunnelGoals(draft, snapshot.revision)
      if (mounted.current) { setSnapshot(saved); setPending(false); setEditorOpen(false); setGoalNotice('Goals saved.'); setReload(n => n + 1) }
    } catch (error) {
      if (mounted.current) { setSaveNotice(error instanceof Error ? error.message : 'Save could not be confirmed.'); try { setPending(Boolean(readPendingFunnelGoals())) } catch { setPending(true) } }
    } finally { savingRef.current = false; if (mounted.current) setSaving(false) }
  }
  function change(metric: FunnelGoalMetric, cadence: typeof FUNNEL_GOAL_CADENCES[number], raw: string) {
    if (draft) setDraft({ ...draft, [metric]: { ...draft[metric], [cadence]: raw === '' ? null : Number(raw) } })
  }
  function changeOverride(metric: FunnelGoalMetric, type: 'monthlyOverrides' | 'quarterlyOverrides', key: string, raw: string) {
    if (!draft) return
    const overrides = { ...draft[metric][type] }; if (raw === '') delete overrides[key]; else overrides[key] = Number(raw)
    setDraft({ ...draft, [metric]: { ...draft[metric], [type]: overrides } })
  }
  const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const quarterValid = /^\d{4}-Q[1-4]$/.test(quarter)
  return <section className="space-y-5" aria-label="Funnel performance dashboard">
    <div className="flex justify-end">
      <PortalButton onClick={openEditor} disabled={!snapshot?.canEdit} title={snapshot && !snapshot.canEdit ? 'Settings permission is required.' : goalNotice || 'Edit saved goals'}>Edit Goals</PortalButton>
    </div>
    <div className="grid grid-cols-2 gap-y-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-3 py-5 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>{KPIS.map(([key, label, tab]) => <button key={key} type="button" onClick={() => onSelectTab?.(tab)} title={visible?.definitions[key]} className="rounded-lg px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] xl:border-r xl:border-[color:var(--portal-border)] xl:last:border-0"><span className="text-xs font-semibold">{label}</span><span className="mt-3 block text-center text-3xl font-bold tabular-nums">{funnelNumber(visible?.metrics[key], key)}</span></button>)}</div>
    {(loading || dataError || goalNotice || visible?.issues.length) ? <div className="text-xs text-[color:var(--portal-muted)]" aria-live="polite">{loading ? <p>Loading selected period…</p> : null}{dataError ? <p>{dataError} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Retry</button></p> : null}{goalNotice ? <p>{goalNotice} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Reload</button></p> : null}{visible?.issues.length ? <details><summary>Data note: some metrics are unavailable ({visible.issues.length})</summary><ul className="mt-2 list-disc pl-4">{visible.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details> : null}</div> : null}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><section className={`${panel} p-5`} aria-label="Sales Funnel Analysis"><h3 className="text-lg font-bold">Sales Funnel Analysis</h3><p className="text-xs text-[color:var(--portal-muted)]">Period activity against saved goals</p><ol className="mt-5 space-y-4">{FUNNEL_GOAL_METRICS.map(metric => { const actual = visible?.metrics[metric] ?? null; const goal = snapshot ? getFunnelGoal(snapshot.goals[metric], period) : null; const progress = funnelGoalProgress(actual, goal); return <li key={metric}><div className="flex flex-wrap justify-between gap-1 text-xs"><span className="font-semibold">{LABELS[metric]}</span><span className="tabular-nums">{funnelNumber(actual, metric)} / {funnelNumber(goal, metric)}{progress.percent === null ? '' : ` (${Math.round(progress.percent)}%)`}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--portal-border)]" role="progressbar" aria-label={`${LABELS[metric]} goal progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent === null ? undefined : progress.barPercent} aria-valuetext={progress.percent === null ? 'Actual or goal unavailable' : `${Math.round(progress.percent)} percent of goal`}><div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${progress.barPercent}%` }} /></div></li> })}</ol><p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-[11px] text-[color:var(--portal-muted)]">Activity counts are not a single-lead cohort. A dash means data or a goal is unavailable.</p></section>
      <FunnelDailyChart period={period} days={visible?.dailyLeads || period.days.map(date => ({ date, count: null }))} dailyGoal={snapshot?.goals.newInquiries.daily ?? null} total={visible?.metrics.newInquiries ?? null} periodGoal={snapshot ? getFunnelGoal(snapshot.goals.newInquiries, period) : null} />
    </div>
    <p className="text-[11px] text-[color:var(--portal-muted)]">Conversion: leads created in this period that booked by period end, divided by leads created in this period.</p>
    <PortalModal isOpen={editorOpen} onClose={() => { if (!saving) setEditorOpen(false) }} title="Edit Goals" description="Shared goals save across devices. Leave a value blank to use its calendar-based calculation." maxWidth="max-w-5xl">
      <form onSubmit={save} className="space-y-5"><fieldset disabled={saving || pending} className="space-y-5"><legend className="sr-only">Shared performance goals</legend><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><caption className="mb-3 text-left text-[color:var(--portal-muted)]">Defaults: daily goals calculate calendar totals. Explicit weekly, monthly, quarterly or annual values override those totals.</caption><thead><tr><th className="p-2">Metric</th>{FUNNEL_GOAL_CADENCES.map(c => <th key={c} className="p-2 capitalize">{c}</th>)}</tr></thead><tbody>{draft ? FUNNEL_GOAL_METRICS.map(metric => <tr key={metric}><th className="p-2 font-semibold">{LABELS[metric]}</th>{FUNNEL_GOAL_CADENCES.map(c => <td key={c} className="p-2"><input className={field} type="number" min="0" max="1000000000000" step={metric === 'revenue' ? '0.01' : '1'} aria-label={`${LABELS[metric]} ${c} goal`} value={draft[metric][c] ?? ''} placeholder="Unset" onChange={e => change(metric, c, e.target.value)} /></td>)}</tr>) : null}</tbody></table></div>
        <div className="grid gap-5 md:grid-cols-2">{(['monthlyOverrides', 'quarterlyOverrides'] as const).map(type => { const monthly = type === 'monthlyOverrides'; const key = monthly ? month : quarter; const valid = monthly ? monthValid : quarterValid; return <div key={type}><label className="mb-3 block text-xs font-semibold">{monthly ? 'Month override (YYYY-MM)' : 'Quarter override (YYYY-Q1 to Q4)'}<input type="text" className={`${field} mt-2`} value={key} onChange={e => monthly ? setMonth(e.target.value) : setQuarter(e.target.value)} aria-invalid={!valid} /></label>{!valid ? <p className="text-xs text-red-600">Enter a valid calendar {monthly ? 'month' : 'quarter'}.</p> : null}{draft ? FUNNEL_GOAL_METRICS.map(metric => <label key={metric} className="mb-2 grid grid-cols-2 items-center gap-3 text-xs">{LABELS[metric]}<input className={field} type="number" min="0" max="1000000000000" step={metric === 'revenue' ? '0.01' : '1'} aria-label={`${LABELS[metric]} ${monthly ? 'month' : 'quarter'} override`} disabled={!valid} value={valid ? draft[metric][type][key] ?? '' : ''} placeholder="Use default" onChange={e => changeOverride(metric, type, key, e.target.value)} /></label>) : null}</div> })}</div><p className="text-xs text-[color:var(--portal-muted)]">An exact month or quarter override wins over its default. Without a quarterly total, the three month goals are added. The chart line always uses the daily inquiry goal. Revenue is optional.</p></fieldset>
        {saveNotice ? <p role="alert" className="text-sm text-[color:var(--portal-muted)]">{saveNotice}</p> : null}<div className="flex flex-wrap justify-end gap-2"><PortalButton disabled={saving} onClick={() => setEditorOpen(false)}>Cancel</PortalButton>{!pending ? <PortalButton disabled={saving} onClick={() => { setEditorOpen(false); setReload(n => n + 1) }}>Reload saved goals</PortalButton> : null}<PortalButton type="submit" variant="primary" disabled={saving || !draft}>{saving ? 'Saving…' : pending ? 'Retry original save' : 'Save goals'}</PortalButton></div>
      </form>
    </PortalModal>
  </section>
}
