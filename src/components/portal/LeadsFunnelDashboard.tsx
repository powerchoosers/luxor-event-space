'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FUNNEL_GOAL_METRICS, getFunnelGoal, parseFunnelGoals, funnelGoalProgress, type FunnelGoals, type FunnelGoalMetric } from '@/lib/luxorFunnelGoals'
import { getFunnelPeriodFromRange, type FunnelPeriod } from '@/lib/luxorFunnelPeriods'
import type { PortalDateRange } from '@/components/portal/PortalDateRangeControl'
import { MagicCard } from '@/components/ui/magic-card'

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
const KPI_TONE: Record<(typeof KPIS)[number][0], 'blue' | 'gold' | 'green'> = {
  newInquiries: 'gold',
  toursScheduled: 'blue',
  toursCompleted: 'green',
  proposalsSent: 'gold',
  depositsReceived: 'green',
  conversionRate: 'blue',
}
const KPI_TONE_CLASS = {
  blue: 'text-sky-600 dark:text-sky-400 border-sky-500/20 bg-sky-500/10',
  gold: 'text-[#a37d2c] dark:text-[#f1d27a] border-[#caa24c]/25 bg-[#caa24c]/10',
  green: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
} as const

function FunnelKpiCard({
  label,
  value,
  tone,
  definition,
  onClick,
}: {
  label: string
  value: string
  tone: 'blue' | 'gold' | 'green'
  definition?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={definition}
      className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60"
    >
      <MagicCard className="h-full rounded-xl px-4 py-3.5">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{label}</p>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-[color:var(--portal-text)]">{value}</p>
          <span className={`self-start rounded-md border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${KPI_TONE_CLASS[tone]}`}>Period</span>
        </div>
      </MagicCard>
    </button>
  )
}
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
  useEffect(() => {
    const controller = new AbortController(); let active = true
    queueMicrotask(() => {
      if (!active) return
      setLoading(true)
      setAnalytics(null)
      setDataError('')
    })
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
  return <section className="space-y-5" aria-label="Funnel performance dashboard">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
      {KPIS.map(([key, label, tab]) => (
        <FunnelKpiCard
          key={key}
          label={label}
          value={funnelNumber(visible?.metrics[key], key)}
          tone={KPI_TONE[key]}
          definition={visible?.definitions[key]}
          onClick={() => onSelectTab?.(tab)}
        />
      ))}
    </div>
    {(loading || dataError || goalNotice || visible?.issues.length) ? <div className="text-xs text-[color:var(--portal-muted)]" aria-live="polite">{loading ? <p>Loading selected period…</p> : null}{dataError ? <p>{dataError} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Retry</button></p> : null}{goalNotice ? <p>{goalNotice} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Reload</button></p> : null}{visible?.issues.length ? <details><summary>About these numbers ({visible.issues.length})</summary><ul className="mt-2 list-disc pl-4">{visible.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details> : null}</div> : null}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><section className={`${panel} p-5`} aria-label="Sales Funnel Analysis"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">Sales Funnel Analysis</h3><p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Period activity against saved goals</p></div>{snapshot?.canEdit ? <Link href="/portal/settings?tab=funnelGoals" className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a712e] transition-colors hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 dark:text-[#f1d27a]">Manage goals</Link> : null}</div><ol className="mt-5 space-y-3">{FUNNEL_GOAL_METRICS.map(metric => { const actual = visible?.metrics[metric] ?? null; const goal = snapshot ? getFunnelGoal(snapshot.goals[metric], period) : null; const progress = funnelGoalProgress(actual, goal); return <li key={metric} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 px-3.5 py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{LABELS[metric]}</span><span className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{funnelNumber(actual, metric)}<span className="font-medium text-[color:var(--portal-muted)]"> / {funnelNumber(goal, metric)}</span>{progress.percent === null ? null : <span className="ml-1 text-xs font-bold text-[#a37d2c] dark:text-[#f1d27a]">{Math.round(progress.percent)}%</span>}</span></div><div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[color:var(--portal-border)]/80" role="progressbar" aria-label={`${LABELS[metric]} goal progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent === null ? undefined : progress.barPercent} aria-valuetext={progress.percent === null ? 'Actual or goal unavailable' : `${Math.round(progress.percent)} percent of goal`}><div className="h-full rounded-full bg-gradient-to-r from-[#caa24c] to-[#dfbd68]" style={{ width: `${progress.barPercent}%` }} /></div></li> })}</ol><p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-[11px] text-[color:var(--portal-muted)]">Activity counts are not a single-lead cohort. A dash means data or a goal is unavailable.</p></section>
      <FunnelDailyChart period={period} days={visible?.dailyLeads || period.days.map(date => ({ date, count: null }))} dailyGoal={snapshot?.goals.newInquiries.daily ?? null} total={visible?.metrics.newInquiries ?? null} periodGoal={snapshot ? getFunnelGoal(snapshot.goals.newInquiries, period) : null} />
    </div>
  </section>
}
