'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PortalButton } from '@/components/portal/PortalUI'
import type { getLuxorBudgetReport } from '@/lib/luxorBudgetReporting'

type Report = ReturnType<typeof getLuxorBudgetReport>
const currency = (value: number | null) => value === null ? 'Needs review' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

/** Presentation contract: the parent owns source loading and budget persistence. */
export function BudgetReports({ report, onSaveTarget }: {
  report: Report
  onSaveTarget: (category: string, amount: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const metrics = [
    { label: 'Collected', value: report.incomeActual, href: '/portal/finances/history' },
    { label: 'Paid expenses', value: report.expenseActual, href: '/portal/finances/expenses' },
    { label: 'Scheduled to collect', value: report.incomeExpected, href: '/portal/finances/schedules' },
    { label: 'Unpaid, due this month', value: report.upcoming, href: '/portal/finances/expenses' },
  ]
  return <div className="space-y-6 text-[color:var(--portal-text)]">
    <p className="text-sm leading-6 text-[color:var(--portal-muted)]">Payments and refunds use their recorded dates. Scheduled collections and unpaid expenses are projections, not cash on hand. Only recorded expenses are included; future recurring expenses that have not been generated are not included.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <Link key={metric.label} href={metric.href} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
        <span className="block text-sm text-[color:var(--portal-muted)]">{metric.label}</span>
        <span className="mt-2 block text-xl font-bold tabular-nums">{currency(metric.value)}</span>
      </Link>)}
    </div>
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
          </div> : <button type="button" onClick={() => { setEditing(row.category); setDraft(row.target === null ? '' : String(row.target)); setError(null) }} className="w-fit text-left text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] sm:col-span-4">{row.target === null ? 'Set target' : 'Edit target'}</button>}
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
