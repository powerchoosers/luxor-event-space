'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PortalButton } from '@/components/portal/PortalUI'
import { getLuxorForecastScenario, type getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'

type Report = ReturnType<typeof getLuxorBudgetReport>
export type BudgetYearRow = { month: string; revenueTarget: number | null; revenueActual: number | null; expenseTarget: number | null; expenseActual: number | null }
export type BudgetForecastRow = { month: string; collections: number | null; expenses: number | null }
const currency = (value: number | null) => value === null ? 'Needs review' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

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
  const [opening, setOpening] = useState('')
  const [reserve, setReserve] = useState('')
  const [horizon, setHorizon] = useState(3)
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
  const selectedYearRow = yearRows.find((row) => row.month === report.month)
  const currentMonth = report.today.slice(0, 7)
  const yearToDate = yearRows.filter((row) => row.month <= currentMonth)
  const sumKnown = (values: Array<number | null>) => values.length && values.every((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null
  const sumEntered = (values: Array<number | null>) => values.some((value) => value !== null) ? values.reduce<number>((sum, value) => sum + (value || 0), 0) : null
  const targetTotal = (values: Array<number | null>) => { const total = sumEntered(values); return total === null ? 'Not set' : currency(total) }
  const openingAmount = /^-?\d+(\.\d{1,2})?$/.test(opening.trim()) ? Number(opening) : null
  const reserveAmount = /^\d+(\.\d{1,2})?$/.test(reserve.trim()) ? Number(reserve) : null
  const scenarioRows = getLuxorForecastScenario(openingAmount, forecastRows.slice(0, horizon), reserveAmount)
  const metrics = [
    { label: 'Collected', value: report.incomeActual, href: '/portal/finances/history' },
    { label: 'Paid expenses', value: report.expenseActual, href: '/portal/finances/expenses' },
    { label: 'Scheduled to collect', value: report.incomeExpected, href: '/portal/finances/schedules' },
    { label: 'Unpaid, due this month', value: report.upcoming, href: '/portal/finances/expenses' },
  ]
  return <div className="space-y-6 text-[color:var(--portal-text)]">
    <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Payments and refunds use their recorded dates. Scheduled collections and unpaid expenses are projections, not cash on hand. Only recorded expenses are included; future recurring expenses that have not been generated are not included.</p>
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Monthly collection target</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">A planning target for event payments received, net of confirmed event refunds. It does not change a booking or payment schedule.</p>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm tabular-nums">
        <span>Target <strong>{!revenueTargetsAvailable ? 'Unavailable' : selectedYearRow?.revenueTarget == null ? 'Not set' : currency(selectedYearRow.revenueTarget)}</strong></span>
        <span>Collected <strong>{currency(report.incomeActual)}</strong></span>
        <span>Difference <strong>{selectedYearRow?.revenueTarget == null || report.incomeActual === null ? '—' : currency(report.incomeActual - selectedYearRow.revenueTarget)}</strong></span>
      </div>
      {!revenueTargetsAvailable ? <p role="status" className="mt-3 text-sm">Collection targets are unavailable. Refresh or try again later.</p> : revenueEditing ? <div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm">Monthly collection target<input autoFocus inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} className="portal-input mt-1 block w-40" /></label><PortalButton variant="primary" className="!text-white" disabled={saving} onClick={() => void saveRevenue()}>{saving ? 'Saving…' : 'Save'}</PortalButton><PortalButton disabled={saving} onClick={() => { setRevenueEditing(false); setError(null) }}>Cancel</PortalButton>{error ? <p role="alert" className="w-full text-sm">{error}</p> : null}</div> : <button type="button" className="mt-3 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]" onClick={() => { setEditing(null); setRevenueEditing(true); setError(null); setDraft(selectedYearRow?.revenueTarget == null ? '' : String(selectedYearRow.revenueTarget)) }}>{selectedYearRow?.revenueTarget == null ? 'Set target' : 'Edit target'}</button>}
    </section>
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Year at a glance</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Each month has its own targets, so seasonal plans stay in your control. Expense targets are the sum of categories entered; a dash means no target was set. Choose a month to review or edit it.</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums"><span>Collection targets entered <strong>{revenueTargetsAvailable ? targetTotal(yearRows.map((row) => row.revenueTarget)) : 'Unavailable'}</strong></span><span>Collected year to date <strong>{yearToDate.length ? currency(sumKnown(yearToDate.map((row) => row.revenueActual))) : '—'}</strong></span><span>Expense targets entered <strong>{targetTotal(yearRows.map((row) => row.expenseTarget))}</strong></span><span>Paid year to date <strong>{yearToDate.length ? currency(sumKnown(yearToDate.map((row) => row.expenseActual))) : '—'}</strong></span></div>
      <div className="mt-4 divide-y divide-[color:var(--portal-border)]">{yearRows.map((row) => <button key={row.month} type="button" onClick={() => onSelectMonth(row.month)} aria-current={row.month === report.month ? 'date' : undefined} className={`grid w-full gap-1 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] sm:grid-cols-5 sm:gap-3 ${row.month === report.month ? 'font-semibold' : ''}`}>
        <span>{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Collection target </span>{row.revenueTarget === null ? '—' : currency(row.revenueTarget)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Collected </span>{row.month > currentMonth ? 'Future' : currency(row.revenueActual)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Expense targets </span>{row.expenseTarget === null ? '—' : currency(row.expenseTarget)}</span>
        <span className="tabular-nums"><span className="text-[color:var(--portal-muted)]">Paid </span>{row.month > currentMonth ? 'Future' : currency(row.expenseActual)}</span>
      </button>)}</div>
    </section>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
        <span className="block text-sm text-[color:var(--portal-muted)]">{metric.label}</span>
        <span className="mt-2 block text-xl font-bold tabular-nums">{currency(metric.value)}</span>
      </Link>)}
    </div>
    {report.month === currentMonth ? <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Cash scenario</h2>
      <p className="mt-1 text-sm leading-6 text-[color:var(--portal-muted)]">Enter an opening amount as of today to explore known scheduled event collections and unpaid expenses. This is a partial planning scenario, not a connected bank balance. Overdue items, ungenerated recurring expenses and other cash movements are excluded; amounts entered here are not saved. The first month is partial.</p>
      <div className="mt-4 flex flex-wrap gap-4"><label className="text-sm">Opening amount today<input inputMode="decimal" value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="Not entered" className="portal-input mt-1 block w-40 tabular-nums" /></label><label className="text-sm">Minimum reserve (optional)<input inputMode="decimal" value={reserve} onChange={(event) => setReserve(event.target.value)} placeholder="Not entered" className="portal-input mt-1 block w-40 tabular-nums" /></label></div>
      {opening.trim() && openingAmount === null ? <p role="alert" className="mt-2 text-sm">Enter an amount with up to two decimal places.</p> : null}
      {reserve.trim() && reserveAmount === null ? <p role="alert" className="mt-2 text-sm">Enter a non-negative reserve with up to two decimal places.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Forecast horizon">{[3, 6, 12].map((months) => <PortalButton key={months} variant={horizon === months ? 'primary' : 'secondary'} className={horizon === months ? '!text-white' : ''} aria-pressed={horizon === months} onClick={() => setHorizon(months)}>{months} months</PortalButton>)}</div>
      <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{scenarioRows.map((row) => <div key={row.month} className="grid gap-1 py-3 text-sm sm:grid-cols-4 sm:gap-3"><span>{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span><span className="tabular-nums">Scheduled in: {currency(row.collections)}</span><span className="tabular-nums">Unpaid out: {currency(row.expenses)}</span><span className="font-semibold tabular-nums">Ending: {row.ending === null ? 'Unavailable' : currency(row.ending)}{row.belowZero ? ' · Below zero' : row.belowReserve ? ' · Below reserve' : ''}</span></div>)}</div>
    </section> : null}
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Projected change in recorded flows</h2>
      <p className="mt-2 text-2xl font-bold tabular-nums">{currency(report.projectedFlow)}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--portal-muted)]">Collected plus scheduled collections, less paid expenses and unpaid expenses due on or after today. This is not a bank balance. Overdue amounts have no assumed payment date.</p>
      <p className="mt-2 text-sm">Unpaid and overdue in this month: <strong className="tabular-nums">{currency(report.overdue)}</strong></p>
    </section>
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Budget versus paid expenses</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Targets are monthly spending plans. Remaining is target less recorded payments, net of expense refunds and reversals.</p>
      {report.categories.length === 0 ? <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No spending or targets for this month yet.</p> : <div className="mt-4 divide-y divide-[color:var(--portal-border)]">
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
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Affected totals are hidden until the records can be verified.</p>
      <ul className="mt-3 space-y-2">{report.issues.map((issue, index) => <li key={`${issue.href}-${index}`}><Link href={issue.href} className="text-sm underline underline-offset-4">{issue.message}</Link></li>)}</ul>
    </section> : null}
    <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
      <h2 className="text-base font-bold sm:text-lg">Expense activity</h2>
      <p className="mt-1 text-sm text-[color:var(--portal-muted)]">Open an item to see its source and payment history.</p>
      {report.lines.length === 0 ? <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No dated expense activity for this month.</p> : <ul className="mt-4 divide-y divide-[color:var(--portal-border)]">{report.lines.map((line) => <li key={`${line.kind}-${line.id}`}><Link href={line.href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"><span><strong>{line.label}</strong><span className="block text-[color:var(--portal-muted)]">{line.date} · {line.category} · {line.kind === 'unpaid' ? 'Unpaid' : line.kind === 'payment' ? 'Paid' : line.kind === 'refund' ? 'Refund' : 'Reversal'}</span></span><span className="font-semibold tabular-nums">{currency(line.amount)}</span></Link></li>)}</ul>}
    </section>
  </div>
}
