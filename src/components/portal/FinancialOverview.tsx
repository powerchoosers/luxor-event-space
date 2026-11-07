'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDots, CreditCard, CurrencyCircleDollar, CurrencyDollar, TrendUp } from '@phosphor-icons/react'
import { PortalSelect } from '@/components/portal/PortalUI'
import { getLuxorCategoryShares, getLuxorOverviewChart, getLuxorOverviewPeriod, type getLuxorFinanceOverview, type getLuxorPaidExpenseBreakdown } from '@/lib/luxorFinanceReporting'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import { chicagoCalendarDate } from '@/lib/luxorPaymentDashboardModel'

type Overview = ReturnType<typeof getLuxorFinanceOverview>
type Expenses = ReturnType<typeof getLuxorPaidExpenseBreakdown>
type Activity = { id: string; date: string; description: string; category: string; amount: number; type: string }
const currency = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const card = 'min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm'
const muted = 'text-sm leading-relaxed text-[color:var(--portal-muted)]'
function billAmount(bill: LuxorBill) {
  if (bill.amount_state === 'variable') return 'Variable amount'
  if (bill.amount_state !== 'known' || bill.amount == null || !Number.isFinite(Number(bill.amount)) || Number(bill.amount) < 0) return 'Amount unverified'
  return currency(Number(bill.amount))
}
function allocationReason(reason: string | null) {
  if (!reason) return null
  const messages: Record<string, string> = {
    earlier_unassigned_receipt: 'An earlier payment must be reconciled first.',
    booking_or_client_mismatch: 'The booking and client links need review.',
    invoice_linkage_or_master_ambiguous: 'The invoice and agreement links need review.',
    schedule_missing_or_exceeds_contract: 'The payment schedule is missing or exceeds the agreement.',
    schedule_ambiguous: 'The payment schedule needs review.',
    installment_balance_disagrees: 'An installment balance does not match its saved payments.',
    explicit_partial_allocation: 'A saved partial allocation needs review.',
    unreconciled_partial_installment: 'An earlier partial installment needs review.',
    payment_or_refund_classification: 'The payment or refund classification needs review.',
    invoice_overpaid: 'The invoice shows payments above its balance.',
    allocation_payment_link_disagrees: 'A saved allocation does not match its payment.',
    saved_remainder_disagrees: 'The saved remainder needs review.',
  }
  return messages[reason] || 'The saved payment details need review.'
}

function Amount({ value }: { value: number | null }) {
  return <span className="tabular-nums">{value === null ? 'Unavailable' : currency(value)}</span>
}

function CategoryChart({ values, label }: { values: Array<{ category: string; amount: number }>; label: string }) {
  const data = getLuxorCategoryShares(values)
  const colors = ['#a87827', '#c49650', '#dbb47b', '#e8cba2', '#b9a380', '#83725e', '#cfb18b', '#e5d7c2', '#8d7f6c', '#d0c0a8']
  const stops = data.rows.map((row, index) => { const start = data.rows.slice(0, index).reduce((sum, item) => sum + item.percent, 0); return `${colors[index % colors.length]} ${start}% ${start + row.percent}%` }).join(', ')
  if (!data.total) return <p className={`${muted} mt-3`}>No {label.toLowerCase()} recorded.</p>
  return <div className="mt-4 flex flex-wrap items-center gap-5"><div aria-hidden="true" className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${stops})` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--portal-bg)] text-center text-xs font-semibold text-[color:var(--portal-text)]">{currency(data.total)}</div></div><ul className="min-w-0 flex-1 space-y-2">{data.rows.map((row, index) => <li key={row.category} className="flex items-start justify-between gap-3 text-xs text-[color:var(--portal-text)]"><span><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{row.category}</span><span className="shrink-0 tabular-nums">{currency(row.amount)} · {Math.round(row.percent)}%</span></li>)}</ul></div>
}

export default function FinancialOverview({ overview, expenses, bills, activity, openView }: { overview: Overview; expenses: Expenses; bills: LuxorBill[] | null; activity: Activity[]; openView: (view: 'payments' | 'expenses' | 'reports') => void }) {
  const today = chicagoCalendarDate()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [grouping, setGrouping] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const period = getLuxorOverviewPeriod(overview, month)
  const chart = useMemo(() => getLuxorOverviewChart(overview, year, grouping), [overview, year, grouping])
  const max = Math.max(1, ...chart.map((item) => (item.actual || 0) + (item.expected || 0)))
  const upcoming = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1))
    const key = date.toISOString().slice(0, 7)
    return { label: date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: overview.expectedByMonth ? overview.expectedByMonth[key] || 0 : null }
  }), [overview.expectedByMonth, today])
  const upcomingMax = Math.max(1, ...upcoming.map((item) => item.value || 0))
  const unpaid = bills?.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0, 5)
  const monthName = new Date(Date.UTC(year, Number(monthText) - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const years = Array.from({ length: 11 }, (_, i) => String(Number(today.slice(0, 4)) - 5 + i))
  if (!years.includes(yearText)) years.push(yearText)
  return <div className="h-full min-h-0 space-y-4 overflow-y-auto pb-8 pr-1 portal-scrollbar">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-2xl font-semibold text-[color:var(--portal-text)]">Financial Overview</h2><p className={muted}>Revenue, expenses and upcoming obligations.</p></div>
      <div className="flex flex-wrap items-center gap-2"><PortalSelect aria-label="Overview month" value={monthText} onChange={(value) => setMonth(`${yearText}-${value}`)} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: new Date(Date.UTC(2020, i, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) }))} /><PortalSelect aria-label="Overview year" value={yearText} onChange={(value) => setMonth(`${value}-${monthText}`)} options={years.sort().map((value) => ({ value, label: value }))} /><Link href="/portal/finances/revenue" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Revenue &amp; collections</Link></div>
    </div>
    {overview.issues.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-[color:var(--portal-text)]">Some figures are unavailable until records are reconciled: {overview.issues.join('; ')}.</div>}
    {overview.allocationExceptions.length > 0 && <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" aria-labelledby="allocation-review-title"><h3 id="allocation-review-title" className="font-semibold text-[color:var(--portal-text)]">Payment allocations to review</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">These receipts remain recorded. Review the allocation without recording another payment.</p><ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{overview.allocationExceptions.map((item) => <li key={item.paymentId} className="py-3 text-sm text-[color:var(--portal-text)]"><div className="flex flex-wrap items-center justify-between gap-2"><span>Payment {item.paymentId.slice(0, 8)} · {item.status === 'pending' ? 'Allocation pending' : item.status === 'unapplied' ? 'Amount unapplied' : 'Needs review'}</span>{item.inquiryId ? <Link className="font-semibold text-[#a8792f] dark:text-[#e6c77f]" href={`/portal/leads/${encodeURIComponent(item.inquiryId)}`}>Open lead</Link> : <button type="button" onClick={() => openView('payments')} className="font-semibold text-[#a8792f] dark:text-[#e6c77f]">Open payment ledger</button>}</div>{item.unappliedAmount !== null && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{item.status === 'review' ? 'Amount reported for review' : 'Unapplied amount'}: {currency(item.unappliedAmount)}</p>}{item.amountNeedsReview && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Unapplied amount needs reconciliation.</p>}{item.reason && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{allocationReason(item.reason)}</p>}</li>)}</ul></section>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[
        { title: 'Total revenue', value: period.actual, detail: `${monthName} · eligible receipts`, icon: CurrencyCircleDollar },
        { title: 'Total expenses', value: null, detail: 'Payment dates are not recorded', icon: CreditCard },
        { title: 'Net profit', value: null, detail: 'Cash basis · paid expense dates unavailable', icon: TrendUp },
        { title: 'Cash position', value: null, detail: 'No verified bank balance', icon: CurrencyDollar },
      ].map(({ title, value, detail, icon: Icon }) => <section key={title} className={card}><Icon aria-hidden="true" className="mb-3 text-[#a8792f] dark:text-[#e6c77f]" size={20} weight="regular" /><h3 className={muted}>{title}</h3><p className="mt-1 break-words text-xl font-semibold text-[color:var(--portal-text)] sm:text-2xl"><Amount value={value} /></p><p className="mt-2 text-xs text-[color:var(--portal-muted)]">{detail}</p></section>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className={card}><h3 className="text-base font-semibold text-[color:var(--portal-text)]">Monthly Revenue &amp; Collections</h3><p className={muted}>{monthName}</p><p className="mt-5 text-3xl font-semibold text-[color:var(--portal-text)]"><Amount value={period.projected} /></p><p className={muted}>Projected collections</p><div className="mt-5 grid grid-cols-3 gap-2 text-sm"><div><strong className="block text-[color:var(--portal-text)]"><Amount value={period.actual} /></strong><span className={muted}>Collected</span></div><div><strong className="block text-[color:var(--portal-text)]"><Amount value={period.expected} /></strong><span className={muted}>Expected</span></div><div><strong className="block text-[color:var(--portal-text)]">{period.percent === null ? '—' : `${period.percent}%`}</strong><span className={muted}>Collected</span></div></div>{period.projected === null && <p className="mt-4 text-xs text-[color:var(--portal-muted)]">Projection and percentage need reconciled payment schedules.</p>}<Link href="/portal/finances/monthly" className="mt-4 inline-flex min-h-10 items-center font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">View monthly collections <span aria-hidden="true" className="ml-1">→</span></Link></section>
      <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold text-[color:var(--portal-text)]">Collections · {year}</h3><PortalSelect aria-label="Chart period" value={grouping} onChange={(value) => setGrouping(value as typeof grouping)} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' }]} /></div><p className="mt-2 text-xs text-[color:var(--portal-muted)]">Gold: collected · champagne: expected</p><div className="mt-5 flex h-40 items-end gap-1 sm:gap-3">{chart.map((item) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-32 w-full items-end justify-center gap-0.5" title={`${item.label}: collected ${item.actual === null ? 'unavailable' : currency(item.actual)}, expected ${item.expected === null ? 'unavailable' : currency(item.expected)}`}><div className="w-2/5 max-w-8 rounded-t bg-[#b58b3e]" style={{ height: `${Math.max(0, (item.actual || 0) / max * 100)}%` }} /><div className="w-2/5 max-w-8 rounded-t bg-[#e6c99d]" style={{ height: `${Math.max(0, (item.expected || 0) / max * 100)}%` }} /></div><span className="text-[10px] text-[color:var(--portal-muted)]">{item.label}</span></div>)}</div><details className="mt-3 text-xs text-[color:var(--portal-muted)]"><summary className="cursor-pointer">View amounts</summary><div className="mt-2 space-y-1">{chart.map((item) => <p key={item.label}>{item.label}: collected <Amount value={item.actual} /> · expected <Amount value={item.expected} /></p>)}</div></details>{(!overview.actualByMonth || !overview.expectedByMonth) && <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Unavailable series are not shown as zero.</p>}</section>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}><h3 className="font-semibold text-[color:var(--portal-text)]">Revenue by category</h3><p className={muted}>{monthName}</p>{overview.categoryByMonth ? <><CategoryChart label="revenue" values={Object.entries(overview.categoryByMonth[month] || {}).map(([category, amount]) => ({ category, amount }))} /><p className="mt-3 text-xs text-[color:var(--portal-muted)]">Unclassified receipts need review. Refundable deposits are separate.</p></> : <p className={`${muted} mt-3`}>Category totals are unavailable while receipts or refunds need reconciliation.</p>}<button type="button" className="mt-4 text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('payments')}>Open payment ledger</button></section>
      <section className={card}><h3 className="font-semibold text-[color:var(--portal-text)]">Expense breakdown</h3><p className={`${muted} mt-2`}>Selected-period expenses are unavailable because payment dates are not recorded.</p>{expenses.available ? <><p className="mt-3 text-xs text-[color:var(--portal-muted)]">All-time paid expense records</p><CategoryChart label="paid expenses" values={expenses.categories} /></> : <p className={`${muted} mt-3`}>{expenses.reason}</p>}<button type="button" className="mt-4 text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('expenses')}>Open expense ledger</button></section>
    </div>
    <div className="grid gap-4 xl:grid-cols-3"><section className={card}><h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming collections</h3>{overview.expectedByMonth ? <div className="mt-4 space-y-2">{upcoming.map((item) => <div key={item.label}><p className="flex justify-between gap-3 text-sm text-[color:var(--portal-text)]"><span>{item.label}</span><Amount value={item.value} /></p><div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"><div className="h-full rounded-full bg-[#c59a4d]" style={{ width: `${(item.value || 0) / upcomingMax * 100}%` }} /></div></div>)}</div> : <p className={`${muted} mt-3`}>Unavailable until payment schedules and allocations reconcile.</p>}</section><section className={card}><div className="flex justify-between gap-2"><h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming bills</h3><Link className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" href="/portal/operations?tab=bills">View all</Link></div>{unpaid === undefined ? <p className={`${muted} mt-3`}>Bills could not be loaded. Refresh to retry.</p> : unpaid.length === 0 ? <p className={`${muted} mt-3`}>No unpaid bills recorded.</p> : <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{unpaid.map((bill) => <li key={bill.id} className="py-3 text-sm"><Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a8792f]"><div className="flex justify-between gap-2 text-[color:var(--portal-text)]"><span>{bill.service || bill.provider || 'Bill'}</span><span>{billAmount(bill)}</span></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.provider || 'Vendor not set'} · {bill.due_date || 'Due date pending'} · {bill.status} · {bill.extraction_status === 'ready' ? 'Ready' : 'Needs review'}</p></Link>{bill.vendor_id && <Link href={`/portal/operations?tab=bills&company=${encodeURIComponent(bill.vendor_id)}`} className="mt-1 inline-block text-xs font-semibold text-[#a8792f] dark:text-[#e6c77f]">Company history</Link>}</li>)}</ul>}</section><section className={card}><div className="flex justify-between gap-2"><h3 className="font-semibold text-[color:var(--portal-text)]">Recent financial activity</h3><button type="button" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('payments')}>View payments</button></div>{activity.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{activity.slice(0, 5).map((item) => <li key={item.id} className="py-3 text-sm"><div className="flex justify-between gap-2 text-[color:var(--portal-text)]"><span>{item.description}</span><span>{item.type === 'Refund' ? '−' : '+'}{currency(item.amount)}</span></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{item.date || 'Date unavailable'} · {item.type} · {item.category}</p></li>)}</ul> : <p className={`${muted} mt-3`}>No recorded payments or confirmed refunds.</p>}<p className="mt-3 text-xs text-[color:var(--portal-muted)]">Paid expense dates and adjustment history are not available here.</p></section></div>
    {chart.some((item) => item.actual !== null && item.actual < 0) && <p className="text-xs text-[color:var(--portal-muted)]">Refunds can make a period negative. Negative amounts appear in the chart details rather than as bars.</p>}
    <p className="text-sm text-[color:var(--portal-muted)]">Overdue scheduled collections: <strong className="text-[color:var(--portal-text)]"><Amount value={overview.overdue} /></strong>. Overdue amounts are shown separately from upcoming collections.</p>
    <p className="text-sm text-[color:var(--portal-muted)]">Recorded refundable security deposits held: <strong className="text-[color:var(--portal-text)]"><Amount value={overview.securityDepositsHeld} /></strong>. Deposits are separate from revenue and are not a bank balance.</p>
    <p className="text-xs text-[color:var(--portal-muted)]"><CalendarDots className="mr-1 inline" weight="regular" size={14} /> Expected collections use saved installment allocations and are not revenue. Unpaid bills do not reduce actual results.</p>
  </div>
}
