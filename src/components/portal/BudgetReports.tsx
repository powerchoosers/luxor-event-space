'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Download } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import { resolveBudgetExportRange, validBudgetMonth, type BudgetExportPreset } from '@/lib/luxorBudgetMonthRange'
import { getLuxorForecastScenario, type getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'
import { buildLuxorBudgetRangeCsv, downloadLuxorCsv } from '@/lib/luxorReportCsv'

type Report = ReturnType<typeof getLuxorBudgetReport>
export type BudgetYearRow = { month: string; revenueTarget: number | null; revenueActual: number | null; expenseTarget: number | null; expenseActual: number | null }
export type BudgetForecastRow = { month: string; collections: number | null; expenses: number | null }
const currency = (value: number | null) => value === null ? 'Needs review' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const LOOKAHEAD_MONTHS = 3

function monthTitle(month: string) {
  const [year, number] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, number - 1, 1)))
}

/** Presentation contract: the parent owns source loading and budget persistence. */
export function BudgetReports({ report, yearRows, forecastRows, revenueTargetsAvailable, onSaveTarget, onSaveRevenueTarget, onSelectMonth }: {
  report: Report
  yearRows: BudgetYearRow[]
  forecastRows: BudgetForecastRow[]
  revenueTargetsAvailable: boolean
  onSaveTarget: (category: string, amount: number) => Promise<void>
  onSaveRevenueTarget: (amount: number) => Promise<void>
  onSelectMonth: (month: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revenueEditing, setRevenueEditing] = useState(false)
  const [showYear, setShowYear] = useState(false)
  const [opening, setOpening] = useState('')
  const [reserve, setReserve] = useState('')
  const [exportPreset, setExportPreset] = useState<BudgetExportPreset>('viewed_month')
  const [customFrom, setCustomFrom] = useState(report.month)
  const [customTo, setCustomTo] = useState(report.month)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const summary = report.summary
  const selectedYearRow = yearRows.find((row) => row.month === report.month)
  const currentMonth = report.today.slice(0, 7)
  const yearToDate = yearRows.filter((row) => row.month <= currentMonth)
  const sumKnown = (values: Array<number | null>) => values.length && values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null
  const sumEntered = (values: Array<number | null>) => values.some((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null
  const targetTotal = (values: Array<number | null>) => { const total = sumEntered(values); return total === null ? 'Not set' : currency(total) }
  const openingAmount = /^-?\d+(\.\d{1,2})?$/.test(opening.trim()) ? Number(opening) : null
  const reserveAmount = /^\d+(\.\d{1,2})?$/.test(reserve.trim()) ? Number(reserve) : null
  const scenarioRows = getLuxorForecastScenario(openingAmount, forecastRows.slice(0, LOOKAHEAD_MONTHS), reserveAmount)

  async function save(category: string) {
    const value = Number(draft)
    if (!draft.trim() || !Number.isFinite(value) || value < 0 || !/^\d+(\.\d{1,2})?$/.test(draft.trim())) {
      setError('Enter a non-negative amount with up to two decimal places.')
      return
    }
    setSaving(true); setError(null)
    try {
      await onSaveTarget(category, value)
      setEditing(null)
    } catch {
      setError('The budget could not be saved. Please try again.')
    } finally { setSaving(false) }
  }
  async function saveRevenue() {
    const value = Number(draft)
    if (!draft.trim() || !/^\d+(\.\d{1,2})?$/.test(draft.trim()) || !Number.isFinite(value) || value > 9999999999.99) {
      setError('Enter a non-negative amount with up to two decimal places.')
      return
    }
    setSaving(true); setError(null)
    try { await onSaveRevenueTarget(value); setRevenueEditing(false) }
    catch { setError('The target could not be saved. Please try again.') }
    finally { setSaving(false) }
  }

  useEffect(() => {
    setCustomFrom(report.month)
    setCustomTo(report.month)
  }, [report.month])

  async function downloadPlanCsv() {
    let from: string
    let to: string
    try {
      const range = resolveBudgetExportRange(exportPreset, report.month, customFrom, customTo)
      from = range.from
      to = range.to
      if (!validBudgetMonth(from) || !validBudgetMonth(to) || from > to) throw new Error('Choose a valid range.')
    } catch {
      setExportError('Choose a valid month range (up to 24 months).')
      return
    }
    setExportBusy(true)
    setExportError(null)
    try {
      const response = await fetch(`/api/portal/budget-reports/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Export failed.')
      const csv = buildLuxorBudgetRangeCsv({
        from: data.from,
        to: data.to,
        generatedAt: data.generatedAt,
        months: (data.months as Array<{ month: string; summary: Report['summary']; categories: Report['categories'] }>).map((row) => ({
          month: row.month,
          generatedAt: data.generatedAt,
          summary: row.summary,
          categories: row.categories,
        })),
      })
      downloadLuxorCsv(csv, `luxor-monthly-plan-${from}-to-${to}`)
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed.')
    } finally {
      setExportBusy(false)
    }
  }

  const exportOptions: { value: BudgetExportPreset; label: string }[] = [
    { value: 'viewed_month', label: 'Month on screen' },
    { value: 'last_3', label: 'Last 3 months' },
    { value: 'last_6', label: 'Last 6 months' },
    { value: 'calendar_year', label: `Calendar year ${report.month.slice(0, 4)}` },
    { value: 'last_12', label: 'Last 12 months' },
    { value: 'last_24', label: 'Last 24 months (max)' },
    { value: 'custom', label: 'Custom range' },
  ]

  const kpis = [
    { label: 'Collection target', value: !revenueTargetsAvailable ? null : selectedYearRow?.revenueTarget ?? null, href: '#collection-target' },
    { label: 'Collected', value: report.incomeActual, href: '/portal/finances/history' },
    { label: 'Expense targets', value: summary.expenseTargetTotal, href: '#expense-targets' },
    { label: 'Paid expenses', value: report.expenseActual, href: '/portal/finances/expenses' },
  ]

  return <div className="space-y-6 text-[color:var(--portal-text)]">
    <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Compare what you planned to collect and spend with recorded payments. Targets use your existing expense categories — set each month for seasonal business.</p>

    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5" aria-labelledby="month-summary-heading">
      <h2 id="month-summary-heading" className="text-base font-bold sm:text-lg">{monthTitle(report.month)}</h2>
      <p role="status" className="mt-2 text-sm leading-relaxed text-[color:var(--portal-text)]">{summary.statusMessage}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((metric) => <Link key={metric.label} href={metric.href} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-3 transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
          <span className="block text-xs font-medium text-[color:var(--portal-muted)]">{metric.label}</span>
          <span className="mt-1 block text-lg font-bold tabular-nums">{currency(metric.value)}</span>
        </Link>)}
      </div>
      <p className="mt-4 text-sm text-[color:var(--portal-muted)]">Month cash margin (operational): <strong className="tabular-nums text-[color:var(--portal-text)]">{currency(summary.operationalMargin)}</strong> — collected minus paid expenses; not tax net income.</p>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] text-sm">
            <span className="text-[color:var(--portal-muted)]">CSV includes</span>
            <PortalSelect
              className="mt-1 block w-full min-w-[12rem]"
              aria-label="Export range"
              value={exportPreset}
              onChange={(value) => setExportPreset(value as BudgetExportPreset)}
              options={exportOptions}
            />
          </label>
          {exportPreset === 'custom' ? <>
            <label className="text-sm">From<input type="month" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="portal-input mt-1 block tabular-nums" /></label>
            <label className="text-sm">To<input type="month" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="portal-input mt-1 block tabular-nums" /></label>
          </> : null}
          <PortalButton type="button" variant="secondary" className="gap-2" disabled={exportBusy} onClick={() => void downloadPlanCsv()}>
            <Download size={18} aria-hidden />
            {exportBusy ? 'Preparing…' : 'Download CSV'}
          </PortalButton>
        </div>
        <p className="text-xs text-[color:var(--portal-muted)]">Up to 24 months per file. Each month includes targets, actuals, and categories.</p>
        {exportError ? <p role="alert" className="text-sm">{exportError}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/finances/profitability" className="text-sm font-semibold underline underline-offset-4">Event profitability</Link>
          <Link href="/portal/finances/accountant" className="text-sm font-semibold underline underline-offset-4">Accountant exports</Link>
        </div>
      </div>
    </section>

    <section id="collection-target" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Collection target</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Event payments received, net of confirmed refunds. This does not change bookings or schedules.</p>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm tabular-nums">
        <span>Target <strong>{!revenueTargetsAvailable ? 'Unavailable' : selectedYearRow?.revenueTarget == null ? 'Not set' : currency(selectedYearRow.revenueTarget)}</strong></span>
        <span>Collected <strong>{currency(report.incomeActual)}</strong></span>
        <span>Difference <strong>{selectedYearRow?.revenueTarget == null || report.incomeActual === null ? '—' : currency(report.incomeActual - selectedYearRow.revenueTarget)}</strong></span>
      </div>
      {!revenueTargetsAvailable ? <p role="status" className="mt-3 text-sm">Collection targets could not be loaded. Refresh to try again.</p> : revenueEditing ? <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Monthly collection target<input autoFocus inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} className="portal-input mt-1 block w-40" /></label><PortalButton variant="primary" className="!text-white" disabled={saving} onClick={() => void saveRevenue()}>{saving ? 'Saving…' : 'Save'}</PortalButton><PortalButton disabled={saving} onClick={() => { setRevenueEditing(false); setError(null) }}>Cancel</PortalButton>{error ? <p role="alert" className="w-full text-sm">{error}</p> : null}</div> : <button type="button" className="mt-3 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]" onClick={() => { setEditing(null); setRevenueEditing(true); setError(null); setDraft(selectedYearRow?.revenueTarget == null ? '' : String(selectedYearRow.revenueTarget)) }}>{selectedYearRow?.revenueTarget == null ? 'Set target' : 'Edit target'}</button>}
    </section>

    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold sm:text-lg">Full year</h2>
          <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Seasonal plans: set each month separately. YTD uses recorded payments only.</p>
        </div>
        <PortalButton type="button" variant="secondary" aria-expanded={showYear} onClick={() => setShowYear((open) => !open)}>{showYear ? 'Hide year' : 'Show full year'}</PortalButton>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
        <span>Collection targets <strong>{revenueTargetsAvailable ? targetTotal(yearRows.map((row) => row.revenueTarget)) : 'Unavailable'}</strong></span>
        <span>Collected YTD <strong>{yearToDate.length ? currency(sumKnown(yearToDate.map((row) => row.revenueActual))) : '—'}</strong></span>
        <span>Expense targets <strong>{targetTotal(yearRows.map((row) => row.expenseTarget))}</strong></span>
        <span>Paid YTD <strong>{yearToDate.length ? currency(sumKnown(yearToDate.map((row) => row.expenseActual))) : '—'}</strong></span>
      </div>
      {showYear ? <div className="mt-4 divide-y divide-[color:var(--portal-border)]">{yearRows.map((row) => <button key={row.month} type="button" onClick={() => onSelectMonth(row.month)} aria-current={row.month === report.month ? 'date' : undefined} className={`grid w-full gap-1 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] sm:grid-cols-5 sm:gap-3 ${row.month === report.month ? 'font-semibold' : ''}`}>
        <span>{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Target </span>{row.revenueTarget === null ? '—' : currency(row.revenueTarget)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Collected </span>{row.month > currentMonth ? 'Future' : currency(row.revenueActual)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Spend plan </span>{row.expenseTarget === null ? '—' : currency(row.expenseTarget)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Paid </span>{row.month > currentMonth ? 'Future' : currency(row.expenseActual)}</span>
      </button>)}</div> : null}
    </section>

    {report.month === currentMonth ? <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Known scheduled flows (next 90 days)</h2>
      <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">Scheduled collections and unpaid expenses from existing records — not your bank balance. Opening and reserve amounts are not saved. Overdue items and ungenerated recurring expenses are excluded.</p>
      <p className="mt-3 text-sm">Recorded flow change this month: <strong className="tabular-nums">{currency(report.projectedFlow)}</strong></p>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="text-sm">Opening today (optional)<input inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="Not entered" className="portal-input mt-1 block w-40 tabular-nums" /></label>
        <label className="text-sm">Minimum reserve (optional)<input inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} placeholder="Not entered" className="portal-input mt-1 block w-40 tabular-nums" /></label>
      </div>
      {opening.trim() && openingAmount === null ? <p role="alert" className="mt-2 text-sm">Enter an amount with up to two decimal places.</p> : null}
      {reserve.trim() && reserveAmount === null ? <p role="alert" className="mt-2 text-sm">Enter a non-negative reserve with up to two decimal places.</p> : null}
      <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{scenarioRows.map((row) => <div key={row.month} className="grid gap-1 py-3 text-sm sm:grid-cols-4 sm:gap-3">
        <span>{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span>
        <span className="tabular-nums">Scheduled in: {currency(row.collections)}</span>
        <span className="tabular-nums">Unpaid out: {currency(row.expenses)}</span>
        <span className="font-semibold tabular-nums">Ending: {row.ending === null ? 'Unavailable' : currency(row.ending)}{row.belowZero ? ' · Below zero' : row.belowReserve ? ' · Below reserve' : ''}</span>
      </div>)}</div>
    </section> : null}

    <section id="expense-targets" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Spending targets by category</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Monthly spending plans by expense category. Paid means recorded payment lines in this month.</p>
      {report.categories.length === 0 ? <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No categories or activity for this month yet.</p> : <div className="mt-4 divide-y divide-[color:var(--portal-border)]">
        {report.categories.map((row) => <div key={row.category} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(90px,auto))] sm:items-center sm:gap-5">
          <strong className="text-sm">{row.category}</strong>
          <span className="text-sm tabular-nums"><span className="text-[color:var(--portal-muted)]">Target </span>{row.target === null ? 'Not set' : currency(row.target)}</span>
          <span className="text-sm tabular-nums"><span className="text-[color:var(--portal-muted)]">Paid </span>{currency(row.actual)}</span>
          <span className="text-sm tabular-nums"><span className="text-[color:var(--portal-muted)]">Remaining </span>{row.remaining === null ? '—' : currency(row.remaining)}</span>
          {editing === row.category ? <div className="flex flex-wrap items-end gap-2 sm:col-span-4">
            <label className="text-sm">Monthly target for {row.category}<input autoFocus inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} className="portal-input mt-1 block w-40" /></label>
            <PortalButton variant="primary" className="!text-white" onClick={() => void save(row.category)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PortalButton>
            <PortalButton variant="secondary" onClick={() => { setEditing(null); setError(null) }} disabled={saving}>Cancel</PortalButton>
            {error ? <p role="alert" className="w-full text-sm text-[color:var(--portal-text)]">{error}</p> : null}
          </div> : row.canEdit ? <button type="button" onClick={() => { setRevenueEditing(false); setEditing(row.category); setDraft(row.target === null ? '' : String(row.target)); setError(null) }} className="w-fit text-left text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] sm:col-span-4">{row.target === null ? 'Set target' : 'Edit target'}</button> : <span className="text-sm text-[color:var(--portal-muted)] sm:col-span-4">Inactive or unclassified category</span>}
        </div>)}
      </div>}
    </section>

    {report.issues.length > 0 ? <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Needs review</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Totals stay hidden until these records can be verified.</p>
      <ul className="mt-3 space-y-2">{report.issues.map((issue, index) => <li key={`${issue.href}-${index}`}><Link href={issue.href} className="text-sm underline underline-offset-4">{issue.message}</Link></li>)}</ul>
    </section> : null}

    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Expense activity</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Open an item for payment history.</p>
      {report.lines.length === 0 ? <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No dated expense activity for this month.</p> : <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">{report.lines.map((line) => <li key={`${line.kind}-${line.id}`}><Link href={line.href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"><span><strong>{line.label}</strong><span className="block text-[color:var(--portal-muted)]">{line.date} · {line.category} · {line.kind === 'unpaid' ? 'Unpaid' : line.kind === 'payment' ? 'Paid' : line.kind === 'refund' ? 'Refund' : 'Reversal'}</span></span><span className="font-semibold tabular-nums">{currency(line.amount)}</span></Link></li>)}</ul>}
    </section>
  </div>
}
