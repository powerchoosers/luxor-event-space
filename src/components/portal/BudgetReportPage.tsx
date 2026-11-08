'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from '@/lib/icons/phosphor-compat'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { BudgetReports, type BudgetForecastRow, type BudgetYearRow } from '@/components/portal/BudgetReports'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'
import type { getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'

type Report = ReturnType<typeof getLuxorBudgetReport>
function shiftMonth(month: string, direction: number) {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + direction, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, number - 1, 1)))
}

export function BudgetReportPage() {
  const [month, setMonth] = useState(() => chicagoCalendarDate(new Date()).slice(0, 7))
  const [result, setResult] = useState<{ key: string; report: Report | null; yearRows: BudgetYearRow[]; forecastRows: BudgetForecastRow[]; revenueTargetsAvailable: boolean; error: string | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const key = `${month}:${revision}`
  const report = result?.key === key ? result.report : null
  const error = result?.key === key ? result.error : null
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/portal/budget-reports?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'The report is unavailable.')
        if (!controller.signal.aborted) setResult({ key, report: data.report, yearRows: data.yearRows, forecastRows: data.forecastRows, revenueTargetsAvailable: data.revenueTargetsAvailable === true, error: null })
      })
      .catch((cause) => { if (!controller.signal.aborted) setResult({ key, report: null, yearRows: [], forecastRows: [], revenueTargetsAvailable: false, error: cause instanceof Error ? cause.message : 'The report is unavailable.' }) })
    return () => controller.abort()
  }, [month, key])
  const saveTarget = useCallback(async (category: string, amount: number) => {
    const response = await fetch('/api/portal/budget-reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, category, amount }) })
    if (!response.ok) throw new Error('Save failed')
    setRevision((value) => value + 1)
  }, [month])
  const saveRevenueTarget = useCallback(async (amount: number) => {
    const response = await fetch('/api/portal/budget-reports', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, kind: 'revenue', amount }) })
    if (!response.ok) throw new Error('Save failed')
    setRevision((value) => value + 1)
  }, [month])
  return <PortalPageFrame className="max-md:pt-4">
    <PortalPageHeader title="Monthly plan" description="Set collection and spending targets, then compare them to recorded payments." />
    <Link href="/portal/finances" className="w-fit text-sm font-semibold text-[#9a712e] underline-offset-4 hover:underline dark:text-[#e6c77f]">Financial Center</Link>
    <div className="flex items-center gap-3" aria-label="Report month">
      <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => shiftMonth(value, -1))} className="rounded-lg border border-[color:var(--portal-border)] p-2 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"><ChevronLeft size={18} /></button>
      <span className="min-w-36 text-center text-sm font-bold tabular-nums" aria-live="polite">{monthLabel(month)}</span>
      <button type="button" aria-label="Next month" onClick={() => setMonth((value) => shiftMonth(value, 1))} className="rounded-lg border border-[color:var(--portal-border)] p-2 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"><ChevronRight size={18} /></button>
    </div>
    {error ? <div role="alert" className="text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="underline" onClick={() => setRevision((value) => value + 1)}>Try again</button></div> : report ? <BudgetReports report={report} yearRows={result?.yearRows || []} forecastRows={result?.forecastRows || []} revenueTargetsAvailable={result?.revenueTargetsAvailable === true} onSaveTarget={saveTarget} onSaveRevenueTarget={saveRevenueTarget} onSelectMonth={setMonth} /> : <p className="text-sm text-[color:var(--portal-muted)]" role="status">Loading report…</p>}
  </PortalPageFrame>
}
