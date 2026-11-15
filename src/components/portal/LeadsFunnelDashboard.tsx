'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FUNNEL_GOAL_METRICS, getFunnelGoal, parseFunnelGoals, funnelGoalProgress, type FunnelGoals, type FunnelGoalMetric } from '@/lib/luxorFunnelGoals'
import { getFunnelPeriodFromRange, type FunnelPeriod } from '@/lib/luxorFunnelPeriods'
import type { PortalDateRange } from '@/components/portal/PortalDateRangeControl'
import { NumberTicker } from '@/components/ui/number-ticker'
import { PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

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
function FunnelKpiCard({
  label,
  value,
  metric,
  definition,
  onClick,
  loading,
}: {
  label: string
  value: number | null
  metric: Metric
  definition?: string
  onClick?: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={definition}
      className="w-full bg-[color:var(--portal-card)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/60"
    >
      <PortalSkeletonTransition loading={loading} overlap skeleton={<div className="flex flex-col gap-1"><p aria-hidden="true" className="relative text-[10px] font-bold uppercase tracking-[0.16em]"><span className="invisible">{label}</span><span className="absolute left-0 top-1/2 w-24 max-w-full -translate-y-1/2"><PortalSkeleton className="h-2.5 w-full rounded" /></span></p><div className="flex h-8 items-center"><PortalSkeleton className="h-6 w-12 rounded" /></div></div>}>
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">{label}</p>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-[color:var(--portal-text)]" aria-label={funnelNumber(value, metric)}>{value === null ? '—' : <NumberTicker key={value} aria-hidden="true" value={value} decimalPlaces={metric === 'conversionRate' ? 1 : 0} suffix={metric === 'conversionRate' ? '%' : ''} />}</p>
        </div>
      </PortalSkeletonTransition>
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
  const reduceMotion = useReducedMotion()
  const [activeTooltipDate, setActiveTooltipDate] = useState<string | null>(null)
  const scale = Math.max(1, Math.ceil(Math.max(dailyGoal || 0, ...days.map(d => d.count || 0)) / 5) * 5)
  const progress = funnelGoalProgress(total, periodGoal)
  return <section className={`${panel} min-w-0 p-5 xl:col-span-2 xl:flex xl:flex-col`} aria-label="Leads by Day">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">Leads by Day</h3><p className="text-xs text-[color:var(--portal-muted)]">New inquiries each day vs. your daily goal.</p></div><p className="text-xs text-[color:var(--portal-muted)]">{dailyGoal === null ? 'No daily goal configured' : `Daily goal: ${funnelNumber(dailyGoal)}`}</p></div>
    <div className="mt-8 overflow-x-auto pb-3 portal-scrollbar xl:flex-1" tabIndex={0} role="region" aria-label="Daily lead counts; scroll horizontally to see every date">
      <div className="relative xl:flex xl:h-full xl:flex-col" style={{ minWidth: `${Math.max(320, days.length * 48)}px` }}>
        <div className="relative h-52 border-b border-[color:var(--portal-border)] xl:min-h-52 xl:flex-1">
          {dailyGoal !== null ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-[#a8792f]" style={{ bottom: `${dailyGoal / scale * 100}%` }} /> : null}
          <div className="absolute inset-0 flex items-end">{days.map((d, index) => {
            const date = new Date(`${d.date}T12:00:00Z`)
            const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
            const shortDateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(date)
            const tooltipId = `daily-leads-tooltip-${d.date}`
            const isActive = activeTooltipDate === d.date
            const edgePosition = index < 2 ? 'left-0' : index >= days.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
            return <button
              key={d.date}
              type="button"
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-sm px-2 text-inherit outline-none focus-visible:z-20"
              aria-label={`${dateLabel}: ${d.count === null ? 'data unavailable' : `${funnelNumber(d.count)} ${d.count === 1 ? 'new inquiry' : 'new inquiries'}`}`}
              aria-describedby={isActive ? tooltipId : undefined}
              onPointerEnter={event => { if (event.pointerType !== 'touch') setActiveTooltipDate(d.date) }}
              onPointerLeave={event => { if (event.pointerType !== 'touch') setActiveTooltipDate(current => current === d.date ? null : current) }}
              onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setActiveTooltipDate(d.date) }}
              onBlur={() => setActiveTooltipDate(current => current === d.date ? null : current)}
              onClick={() => {
                if (window.matchMedia('(hover: none)').matches) setActiveTooltipDate(current => current === d.date ? null : d.date)
              }}
            >
              <AnimatePresence>
                {isActive ? <motion.div
                  id={tooltipId}
                  role="tooltip"
                  initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 2, scale: 0.98 }}
                  transition={{ duration: reduceMotion ? 0.01 : 0.14, ease: [0.16, 1, 0.3, 1] }}
                  className={`pointer-events-none absolute z-30 w-max min-w-36 max-w-48 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-left shadow-lg ${edgePosition}`}
                  style={{ bottom: `min(calc(${(d.count ?? 0) / scale * 100}% + 28px), calc(100% - 92px))` }}
                >
                  <span className="block text-[10px] font-semibold text-[color:var(--portal-muted)]">{shortDateLabel}</span>
                  <span className="mt-0.5 block text-sm font-bold tabular-nums text-[color:var(--portal-text)]">{d.count === null ? 'Data unavailable' : `${funnelNumber(d.count)} ${d.count === 1 ? 'new inquiry' : 'new inquiries'}`}</span>
                  {dailyGoal !== null ? <span className="mt-0.5 block text-[10px] text-[color:var(--portal-muted)]">Daily goal: {funnelNumber(dailyGoal)}</span> : null}
                </motion.div> : null}
              </AnimatePresence>
              <span className="mb-1 w-fit self-center rounded px-1 text-center text-xs font-semibold tabular-nums group-focus-visible:ring-2 group-focus-visible:ring-[#caa24c]">{funnelNumber(d.count)}</span>
              {d.count !== null && d.count > 0 ? <motion.span aria-hidden="true" className="mx-auto block w-full max-w-8" style={{ height: `${d.count / scale * 100}%`, flexShrink: 0 }} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
                <motion.span className="block h-full w-full origin-bottom rounded-t-sm bg-[#caa24c]" variants={{ hidden: { scaleY: reduceMotion ? 1 : 0 }, visible: { scaleY: 1 } }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }} />
              </motion.span> : null}
            </button>
          })}</div>
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
    const refreshGoals = () => setReload(n => n + 1)
    window.addEventListener('luxor:funnel-goals-closed', refreshGoals)
    return () => window.removeEventListener('luxor:funnel-goals-closed', refreshGoals)
  }, [])
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
      {KPIS.map(([key, label, tab]) => (
        <FunnelKpiCard
          key={key}
          label={label}
          value={visible?.metrics[key] ?? null}
          metric={key}
          loading={loading}
          definition={visible?.definitions[key]}
          onClick={() => onSelectTab?.(tab)}
        />
      ))}
    </div>
    {(dataError || goalNotice) ? <div className="text-xs text-[color:var(--portal-muted)]" aria-live="polite">{dataError ? <p>{dataError} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Retry</button></p> : null}{goalNotice ? <p>{goalNotice} <button type="button" className="underline" onClick={() => setReload(n => n + 1)}>Reload</button></p> : null}</div> : null}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><section className={`${panel} p-5`} aria-label="Sales Funnel Analysis"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">Sales Funnel Analysis</h3><p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Period activity against saved goals</p></div>{snapshot?.canEdit ? <Link href="/portal/settings?tab=funnelGoals" onClick={event => { if (window.innerWidth >= 1024 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); window.dispatchEvent(new Event('luxor:open-funnel-goals')) } }} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a712e] transition-colors hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 dark:text-[#f1d27a]">Manage goals</Link> : null}</div><ol className="mt-5 space-y-3">{FUNNEL_GOAL_METRICS.map(metric => { const actual = visible?.metrics[metric] ?? null; const goal = snapshot ? getFunnelGoal(snapshot.goals[metric], period) : null; const progress = funnelGoalProgress(actual, goal); return <li key={metric} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 px-3.5 py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{LABELS[metric]}</span><span className="text-sm font-semibold tabular-nums text-[color:var(--portal-text)]">{funnelNumber(actual, metric)}<span className="font-medium text-[color:var(--portal-muted)]"> / {funnelNumber(goal, metric)}</span>{progress.percent === null ? null : <span className="ml-1 text-xs font-bold text-[#a37d2c] dark:text-[#f1d27a]">{Math.round(progress.percent)}%</span>}</span></div><div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[color:var(--portal-border)]/80" role="progressbar" aria-label={`${LABELS[metric]} goal progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent === null ? undefined : progress.barPercent} aria-valuetext={progress.percent === null ? 'Actual or goal unavailable' : `${Math.round(progress.percent)} percent of goal`}><div className="h-full rounded-full bg-gradient-to-r from-[#caa24c] to-[#dfbd68]" style={{ width: `${progress.barPercent}%` }} /></div></li> })}</ol><p className="mt-4 border-t border-[color:var(--portal-border)] pt-3 text-[11px] text-[color:var(--portal-muted)]">Activity counts are not a single-lead cohort. A dash means data or a goal is unavailable.</p></section>
      <FunnelDailyChart period={period} days={visible?.dailyLeads || period.days.map(date => ({ date, count: null }))} dailyGoal={snapshot?.goals.newInquiries.daily ?? null} total={visible?.metrics.newInquiries ?? null} periodGoal={snapshot ? getFunnelGoal(snapshot.goals.newInquiries, period) : null} />
    </div>
  </section>
}
