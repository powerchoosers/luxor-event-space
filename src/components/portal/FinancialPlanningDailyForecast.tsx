'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { buildForecastDraft, type ForecastFlow, type ForecastGrouping, type ForecastHorizon } from '@/lib/luxorFinancialPlanningModels'
import { openingForTodayDraft } from '@/lib/luxorFinancialPlanningTypes'
import type { StoredPlanningItem } from '@/lib/luxorFinancialPlanningApi'

type ForecastSources = { today: string; flows: ForecastFlow[]; inflowAvailable: boolean; outflowAvailable: boolean; sourceComplete: boolean; issues: string[] }
const money = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
export function FinancialPlanningDailyForecast({ today, items, principalScope, sourceRevision = 0 }: { today: string; items: StoredPlanningItem[]; principalScope: string; sourceRevision?: number }) {
  const [result, setResult] = useState<{ key: string; sources: ForecastSources | null; error: string | null } | null>(null)
  const key = JSON.stringify([principalScope, today, sourceRevision])
  const sources = result?.key === key ? result.sources : null
  const error = result?.key === key ? result.error : null
  const [horizon, setHorizon] = useState<ForecastHorizon>('30d')
  const [grouping, setGrouping] = useState<ForecastGrouping>('weekly')
  const [scenarioId, setScenarioId] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/portal/financial-planning/forecast', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Forecast sources could not be verified.')
        const value = await response.json() as ForecastSources
        if (value.today !== today || !Array.isArray(value.flows) || typeof value.sourceComplete !== 'boolean' || typeof value.inflowAvailable !== 'boolean' || typeof value.outflowAvailable !== 'boolean' || !Array.isArray(value.issues) || !value.issues.every((issue) => typeof issue === 'string')) throw new Error('Forecast sources need to be refreshed.')
        if (!controller.signal.aborted) setResult({ key, sources: value, error: null })
      })
      .catch((cause) => { if (!controller.signal.aborted) setResult({ key, sources: null, error: cause instanceof Error ? cause.message : 'Forecast sources are unavailable.' }) })
    return () => controller.abort()
  }, [today, key])
  const scenarios = items.filter((item): item is Extract<StoredPlanningItem, { kind: 'opening_scenario' }> => item.kind === 'opening_scenario' && item.payload.status === 'active')
  const scenario = scenarios.find((item) => item.payload.id === scenarioId)?.payload || null
  const opening = scenario ? openingForTodayDraft(scenario, today) : null
  let forecast: ReturnType<typeof buildForecastDraft> | null = null
  try {
    if (sources?.today === today) forecast = buildForecastDraft({ today, horizon, grouping, openingBalance: opening?.availability === 'known' ? opening.value : null, minimumReserve: scenario?.minimumReserve ?? null, sourceComplete: sources.sourceComplete, inflowAvailable: sources.inflowAvailable, outflowAvailable: sources.outflowAvailable, flows: sources.flows })
  } catch { /* malformed source data stays unavailable */ }
  return <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-[color:var(--portal-text)] sm:p-5">
    <h2 className="text-base font-bold sm:text-lg">Dated cash outlook</h2>
    <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">Known scheduled collections and unpaid expenses are grouped by their recorded dates. Coverage is partial: overdue items, ungenerated recurring expenses and other cash movements may be missing. A manual opening amount is not a connected bank balance.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Forecast period">{([['30d', '30 days'], ['60d', '60 days'], ['90d', '90 days'], ['6m', '6 months'], ['12m', '12 months']] as const).map(([value, label]) => <PortalButton key={value} variant={horizon === value ? 'primary' : 'secondary'} className={horizon === value ? '!text-white' : ''} aria-pressed={horizon === value} onClick={() => setHorizon(value)}>{label}</PortalButton>)}</div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><span className="mb-1 block text-sm">Group by</span><PortalSelect aria-label="Forecast grouping" value={grouping} onChange={(value) => setGrouping(value as ForecastGrouping)} options={[{ value: 'weekly', label: 'Week' }, { value: 'monthly', label: 'Month' }]} /></div>{scenarios.length ? <div><span className="mb-1 block text-sm">Opening scenario</span><PortalSelect aria-label="Manual opening scenario" value={scenarioId} onChange={setScenarioId} placeholder="Choose a manual scenario" options={scenarios.map((item) => ({ value: item.payload.id, label: item.payload.label }))} /></div> : null}</div>
    {scenario && opening?.availability !== 'known' ? <p role="status" className="mt-3 text-sm">Enter an opening amount dated today, or reconcile intervening movements.</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : !sources ? <p role="status" className="mt-3 text-sm text-[color:var(--portal-muted)]">Loading dated outlook…</p> : !forecast ? <p role="status" className="mt-3 text-sm">Forecast details need review.</p> : <>
      {!forecast.flowsComplete ? <p role="status" className="mt-3 text-sm">Partial coverage: ending balances are withheld. Known amounts below are not complete totals.</p> : null}
      {sources.issues.length ? <ul className="mt-2 space-y-1 text-sm text-[color:var(--portal-muted)]">{[...new Set(sources.issues)].map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
      <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{forecast.periods.map((period) => <div key={period.start} className="py-3 text-sm"><div className="grid gap-1 sm:grid-cols-4 sm:gap-3"><span className="tabular-nums">{period.start} – {period.end}</span><span className="tabular-nums">Scheduled collections: {money(period.knownInflow)}</span><span className="tabular-nums">Unpaid due (assumed timing): {money(period.knownOutflow)}</span><span className="font-semibold tabular-nums">Ending: {money(period.endingBalance)}{period.belowZero ? ' · Below zero' : period.belowReserve ? ' · Below reserve' : ''}</span></div>{period.flows.length ? <details className="mt-2"><summary className="w-fit cursor-pointer text-[color:var(--portal-muted)]">View {period.flows.length} source {period.flows.length === 1 ? 'record' : 'records'}</summary><ul className="mt-2 space-y-1">{period.flows.map((flow) => <li key={`${flow.source}:${flow.id}`}><Link className="underline underline-offset-4" href={flow.href}>{flow.date} · {flow.kind === 'inflow' ? 'Scheduled collection' : 'Unpaid expense due (assumed timing)'} · {money(flow.amount)}</Link></li>)}</ul></details> : null}</div>)}</div>
    </>}
  </section>
}
