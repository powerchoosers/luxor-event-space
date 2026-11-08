'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PortalButton, PortalSelect } from '@/components/portal/PortalUI'
import type { EventCashMonth, EventProfitability as EventRecord } from '@/lib/luxorEventProfitability'
import { hasUnverifiedExpenseCash } from '@/lib/luxorProfitabilityExpenseEvidence'

type Activity = { id: string; kind: string; amount: number; date: string | null; status: string; note: string }
export type ProfitabilityEvent = EventRecord & { activity: Activity[]; cashMonths: EventCashMonth[] | null; receipts: Array<{ id: string; expenseId: string | null; fileName: string }> | null; proposal: { originalTotal: number | null; discountAmount: number | null; lines: Array<{ description: string; total: number; role: string | null; bucket: string | null; classification: string | null }> } | null }
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (value: number | null) => value === null || !Number.isFinite(value) ? 'Unavailable' : dollars.format(value)
const link = 'font-semibold text-[#9a712e] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]'
const surface = 'rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'
const dateLabel = (value: string | null | undefined) => value ? value.slice(0, 10) : 'Not set'
function financialStatus(event: ProfitabilityEvent) {
  if (event.booking.status === 'cancelled') return 'Canceled · history only'
  if (event.booking.status !== 'confirmed' && event.booking.status !== 'completed') return 'Not confirmed'
  if (event.outstanding === null || event.collections === null || event.unpaidCommitments === null) return 'Needs review'
  const client = event.outstanding <= 0 ? 'Client balance paid' : event.collections > 0 ? 'Client partially paid' : 'Awaiting client payment'
  return event.unpaidCommitments > 0 ? `${client} · expenses outstanding` : client
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return <div><dt className="text-xs text-[color:var(--portal-muted)]">{label}</dt><dd className="mt-1 text-base font-bold tabular-nums text-[color:var(--portal-text)]">{money(value)}</dd></div>
}
function total(rows: ProfitabilityEvent[], key: 'obligation' | 'collections' | 'outstanding' | 'paidDirectCosts' | 'cashContribution' | 'projectedContribution') {
  return rows.length && rows.every((row) => row[key] !== null) ? rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) : null
}

export function EventProfitability({ events }: { events: ProfitabilityEvent[] }) {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [eventType, setEventType] = useState('all')
  const [period, setPeriod] = useState('all')
  const [profitability, setProfitability] = useState('all')
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState('date')
  const [selected, setSelected] = useState<string | null>(null)
  const [record, setRecord] = useState<string | null>(null)
  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      setSelected(params.get('event'))
      setRecord(params.get('record'))
    }
    readLocation()
    window.addEventListener('hashchange', readLocation)
    return () => window.removeEventListener('hashchange', readLocation)
  }, [])
  useEffect(() => {
    if (!selected || !record) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`record-${record}`)?.scrollIntoView({ block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [selected, record])
  const years = useMemo(() => [...new Set(events.map((event) => event.booking.event_date?.slice(0, 4)).filter((value): value is string => Boolean(value)))].sort().reverse(), [events])
  const types = useMemo(() => [...new Set(events.map((event) => event.booking.event_type).filter((value): value is string => Boolean(value)))].sort(), [events])
  const filtered = useMemo(() => events.filter((event) => {
    const booking = event.booking
    return (!query.trim() || booking.client_name.toLowerCase().includes(query.trim().toLowerCase()))
      && (year === 'all' || booking.event_date?.startsWith(year))
      && (eventType === 'all' || booking.event_type === eventType)
      && (period === 'all' || (booking.event_date && (period.startsWith('q') ? Math.ceil(Number(booking.event_date.slice(5, 7)) / 3) === Number(period.slice(1)) : booking.event_date.slice(5, 7) === period)))
      && (profitability === 'all' || (event.cashContribution !== null && (profitability === 'positive' ? event.cashContribution > 0 : event.cashContribution <= 0)))
      && (status === 'all' || (status === 'active' ? booking.status === 'confirmed' || booking.status === 'completed' : booking.status === 'cancelled'))
  }).sort((a, b) => {
    if (sort === 'date') return (a.booking.event_date || '9999').localeCompare(b.booking.event_date || '9999')
    const key = sort as 'obligation' | 'paidDirectCosts' | 'cashContribution' | 'margin'
    const av = a[key], bv = b[key]
    return av === null ? 1 : bv === null ? -1 : bv - av
  }), [events, query, year, eventType, period, profitability, status, sort])
  const active = useMemo(() => filtered.filter((event) => event.booking.status === 'confirmed' || event.booking.status === 'completed'), [filtered])
  const eligibleMargins = active.map((event) => event.margin).filter((value): value is number => value !== null)
  const profile = events.find((event) => event.booking.id === selected)
  const groups = useMemo(() => {
    const rows = new Map<string, ProfitabilityEvent[]>()
    for (const event of active) { const name = event.booking.event_type || 'Not specified'; rows.set(name, [...(rows.get(name) || []), event]) }
    return [...rows].sort(([a], [b]) => a.localeCompare(b))
  }, [active])
  const months = useMemo(() => {
    const rows = new Map<string, ProfitabilityEvent[]>()
    for (const event of active) { const month = event.booking.event_date?.slice(0, 7) || 'Date not set'; rows.set(month, [...(rows.get(month) || []), event]) }
    return [...rows].sort(([a], [b]) => a.localeCompare(b))
  }, [active])
  const cashMonths = useMemo(() => {
    if (!active.length || active.some((event) => event.cashMonths === null)) return null
    const rows = new Map<string, EventCashMonth>()
    for (const event of active) for (const item of event.cashMonths || []) {
      const row = rows.get(item.month) || { month: item.month, received: 0, spent: 0, profit: 0 }
      row.received += item.received; row.spent += item.spent; row.profit += item.profit
      rows.set(item.month, row)
    }
    return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month))
  }, [active])
  if (profile) return <EventProfile event={profile} onBack={() => { window.location.hash = ''; setSelected(null); setRecord(null) }} />
  return <div className="space-y-5">
    <p className="max-w-3xl text-sm leading-6 text-[color:var(--portal-muted)]">Filter by event date. Cash profit is event payments received, less completed event refunds and direct expenses paid. Recorded costs may not include everything the event will cost; overhead is separate.</p>
    <div className={`${surface} grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Client<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients" className="portal-input mt-1 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Event year<PortalSelect aria-label="Event year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All years' }, ...years.map((value) => ({ value, label: value }))]} buttonClassName="mt-1 min-h-10 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Event type<PortalSelect aria-label="Event type" value={eventType} onChange={setEventType} options={[{ value: 'all', label: 'All types' }, ...types.map((value) => ({ value, label: value }))]} buttonClassName="mt-1 min-h-10 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Event period<PortalSelect aria-label="Event period" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'All months' }, ...[1,2,3,4].map((n) => ({ value: `q${n}`, label: `Quarter ${n}` })), ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: new Date(Date.UTC(2024, index, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) }))]} buttonClassName="mt-1 min-h-10 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Cash profit<PortalSelect aria-label="Filter cash profit" value={profitability} onChange={setProfitability} options={[{ value: 'all', label: 'All results' }, { value: 'positive', label: 'Above zero' }, { value: 'nonpositive', label: 'Zero or below' }]} buttonClassName="mt-1 min-h-10 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Events<PortalSelect aria-label="Event status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Confirmed and completed' }, { value: 'cancelled', label: 'Canceled history' }, { value: 'all', label: 'All events' }]} buttonClassName="mt-1 min-h-10 w-full" /></label>
      <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Sort by<PortalSelect aria-label="Sort events" value={sort} onChange={setSort} options={[{ value: 'date', label: 'Event date' }, { value: 'obligation', label: 'Contract value' }, { value: 'paidDirectCosts', label: 'Expenses paid' }, { value: 'cashContribution', label: 'Cash profit' }, { value: 'margin', label: 'Profit margin' }]} buttonClassName="mt-1 min-h-10 w-full" /></label>
    </div>
    {active.length > 0 && <section className={`${surface} p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Selected events</h2><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-7"><Metric label="Contracted" value={total(active, 'obligation')} /><Metric label="Net collected" value={total(active, 'collections')} /><Metric label="Client balances" value={total(active, 'outstanding')} /><Metric label="Expenses paid" value={total(active, 'paidDirectCosts')} /><Metric label="Cash profit" value={total(active, 'cashContribution')} /><Metric label="Estimated contribution" value={total(active, 'projectedContribution')} /><div><dt className="text-xs text-[color:var(--portal-muted)]">Average cash margin</dt><dd className="mt-1 text-base font-bold tabular-nums text-[color:var(--portal-text)]">{eligibleMargins.length ? `${(eligibleMargins.reduce((a, b) => a + b, 0) / eligibleMargins.length).toFixed(1)}%` : 'Unavailable'}</dd></div></dl><p className="mt-3 text-xs text-[color:var(--portal-muted)]">Totals are unavailable if any selected event needs review. Average margin uses {eligibleMargins.length} of {active.length} events with verified positive net collections. Canceled events are excluded.</p></section>}
    <section className={`${surface} p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Events <span className="font-normal text-[color:var(--portal-muted)]">({filtered.length})</span></h2>
      {!filtered.length ? <p className="mt-4 text-sm text-[color:var(--portal-muted)]">No events match these filters.</p> : <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{filtered.map((event) => <button key={event.booking.id} type="button" onClick={() => setSelected(event.booking.id)} className="flex w-full flex-col gap-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 sm:flex-row sm:items-center sm:justify-between"><span><span className="block font-semibold text-[color:var(--portal-text)]">{event.booking.client_name}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{event.booking.event_type || 'Event'} · {dateLabel(event.booking.event_date)} · {financialStatus(event)}</span></span><span className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3"><span className="text-[color:var(--portal-muted)]">Collected <strong className="block tabular-nums text-[color:var(--portal-text)]">{money(event.collections)}</strong></span><span className="text-[color:var(--portal-muted)]">Paid costs <strong className="block tabular-nums text-[color:var(--portal-text)]">{money(event.paidDirectCosts)}</strong></span><span className="text-[color:var(--portal-muted)]">Cash profit <strong className="block tabular-nums text-[color:var(--portal-text)]">{money(event.cashContribution)}</strong></span></span></button>)}</div>}
    </section>
    {groups.length > 0 && <section className={`${surface} p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Compare event types</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Selected events grouped by their scheduled event date. Totals require all events in the group to be verified.</p><div className="mt-3 divide-y divide-[color:var(--portal-border)]">{groups.map(([name, rows]) => { const margins = rows.map((row) => row.margin).filter((value): value is number => value !== null); const contracted = total(rows, 'obligation'); return <div key={name} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="font-semibold text-[color:var(--portal-text)]">{name} <span className="font-normal text-[color:var(--portal-muted)]">({rows.length})</span></span><span className="tabular-nums text-[color:var(--portal-muted)]">Contracted {money(contracted)} · Average booking {money(contracted === null ? null : contracted / rows.length)} · Collected {money(total(rows, 'collections'))} · Paid {money(total(rows, 'paidDirectCosts'))} · Cash profit {money(total(rows, 'cashContribution'))} · Average margin {margins.length ? `${(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(1)}% (${margins.length} of ${rows.length})` : 'Unavailable'}</span></div> })}</div></section>}
    {months.length > 0 && <section className={`${surface} p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Events by month</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Grouped by scheduled event month; amounts are lifetime-to-date for those events, not cash received or paid in that month.</p><div className="mt-3 divide-y divide-[color:var(--portal-border)]">{months.map(([month, rows]) => <div key={month} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="font-semibold tabular-nums text-[color:var(--portal-text)]">{month}</span><span className="tabular-nums text-[color:var(--portal-muted)]">Contracted {money(total(rows, 'obligation'))} · Collected {money(total(rows, 'collections'))} · Paid {money(total(rows, 'paidDirectCosts'))} · Cash profit {money(total(rows, 'cashContribution'))} · Estimated {money(total(rows, 'projectedContribution'))}</span></div>)}</div></section>}
    {active.length > 0 && <section className={`${surface} p-5`}><h2 className="text-base font-bold text-[color:var(--portal-text)]">Cash flow by transaction month</h2><p className="mt-1 text-xs text-[color:var(--portal-muted)]">For the selected event cohort, net event receipts and net expense payments are grouped by their recorded transaction dates. Event-date filters choose the events, not the cash-flow months.</p>{cashMonths === null ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">Cash flow is unavailable until the selected events’ transaction dates and totals reconcile.</p> : cashMonths.length === 0 ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No dated cash activity for these events.</p> : <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{cashMonths.map((row) => <div key={row.month} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="font-semibold tabular-nums text-[color:var(--portal-text)]">{row.month}</span><span className="tabular-nums text-[color:var(--portal-muted)]">Net receipts {money(row.received)} · Net paid {money(row.spent)} · Cash profit {money(row.profit)}</span></div>)}</div>}</section>}
  </div>
}

function EventProfile({ event, onBack }: { event: ProfitabilityEvent; onBack: () => void }) {
  const { booking } = event
  return <div className="space-y-5"><PortalButton onClick={onBack}>Back to events</PortalButton><section className={`${surface} p-5`}><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold text-[color:var(--portal-text)]">{booking.client_name}</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{booking.event_type || 'Event'} · {dateLabel(booking.event_date)} · Booking {booking.status}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{financialStatus(event)} · {booking.guest_count == null ? 'Guest count not set' : `${booking.guest_count} guests`} · {booking.package_name || 'Package not set'}</p></div><Link href={`/portal/planner/event/${encodeURIComponent(booking.id)}`} className={`${link} text-sm`}>Open event planner</Link></div>
    <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"><Metric label="Accepted obligation" value={event.obligation} /><Metric label="Net collected" value={event.collections} /><Metric label="Client balance" value={event.outstanding} /><Metric label="Known direct costs" value={event.knownDirectCosts} /><Metric label="Direct costs paid" value={event.paidDirectCosts} /><Metric label="Unpaid commitments" value={event.unpaidCommitments} /><Metric label="Estimated contribution" value={event.projectedContribution} /><Metric label="Cash profit to date" value={event.cashContribution} /></dl><p className="mt-4 text-xs leading-5 text-[color:var(--portal-muted)]">Cash margin: {event.margin === null ? 'Unavailable' : `${event.margin.toFixed(1)}%`}. Estimated contribution uses the accepted obligation less known direct costs; it excludes unrecorded costs and overhead.</p>{event.issues.length > 0 && <ul className="mt-3 list-inside list-disc text-xs leading-5 text-[color:var(--portal-muted)]">{event.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</section>
    {event.proposal && <section className={`${surface} p-5`}><h3 className="font-bold text-[color:var(--portal-text)]">Accepted proposal details</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Saved proposal lines are shown as recorded, including any deposits or vendor estimates. They are not added to the obligation again.</p><div className="mt-3 text-sm tabular-nums text-[color:var(--portal-muted)]">Original total {money(event.proposal.originalTotal)} · Discount {money(event.proposal.discountAmount)}</div><div className="mt-3 divide-y divide-[color:var(--portal-border)]">{event.proposal.lines.map((line, index) => <div key={`${index}-${line.description}`} className="flex justify-between gap-3 py-2 text-sm"><span className="text-[color:var(--portal-text)]">{line.description}<span className="ml-2 text-xs text-[color:var(--portal-muted)]">{[line.role, line.bucket, line.classification].filter(Boolean).map((value) => value?.replaceAll('_', ' ')).join(' · ')}</span></span><span className="tabular-nums text-[color:var(--portal-text)]">{money(Number(line.total))}</span></div>)}</div></section>}
    <section className={`${surface} p-5`}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold text-[color:var(--portal-text)]">Event expenses</h3><Link className={`${link} text-sm`} href={`/portal/finances/expenses/events?add=1&bookingId=${encodeURIComponent(booking.id)}`}>Add event expense</Link></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Add or edit expenses in Expense Management; this view refreshes when you return.</p>{!event.expenseRecords.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No direct expenses linked.</p> : <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{event.expenseRecords.map((expense) => <div key={expense.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><Link className={link} href={`/portal/finances/expenses/${encodeURIComponent(expense.id)}`}>{expense.description || expense.vendor_name || 'Event expense'}</Link><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{expense.category} · {expense.vendor_name || 'Vendor not set'} · {dateLabel(expense.incurred_on || expense.due_date)} · {hasUnverifiedExpenseCash(expense) ? 'Payment needs review' : expense.payment_status.replaceAll('_', ' ')}</p>{event.receipts === null ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Receipts unavailable.</p> : event.receipts.filter((receipt) => receipt.expenseId === expense.id).map((receipt) => <a key={receipt.id} className={`${link} mt-1 block text-xs`} href={`/api/expenses/receipts/${encodeURIComponent(receipt.id)}?download=0`} target="_blank" rel="noreferrer">View receipt: {receipt.fileName}</a>)}</div><div className="text-xs tabular-nums text-[color:var(--portal-muted)]">Amount {expense.amount_known ? money(Number(expense.amount)) : 'Unknown'} · {hasUnverifiedExpenseCash(expense) ? 'Payment and remaining balance need review' : <>Paid {money(expense.paid_amount)} · Remaining {money(expense.remaining_balance)}</>}</div></div>)}</div>}</section>
    <section className={`${surface} p-5`}><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold text-[color:var(--portal-text)]">Payment and refund records</h3><div className="flex gap-4">{event.invoiceId && <Link href="/portal/invoices" className={`${link} text-sm`}>Invoices</Link>}<Link href="/portal/finances/history" className={`${link} text-sm`}>Financial history</Link></div></div><p className="mt-1 text-xs text-[color:var(--portal-muted)]">These are source transaction amounts, not an additional revenue total. A payment can include a refundable deposit.</p>{!event.activity.length ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No directly linked payment or refund records found.</p> : <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{event.activity.map((row) => <div id={`record-${row.kind}-${row.id}`} key={`${row.kind}-${row.id}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-[color:var(--portal-text)]">{row.kind} · {dateLabel(row.date)} · {row.status}<span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{row.note} · {row.id}</span><a href={`#event=${encodeURIComponent(booking.id)}&record=${encodeURIComponent(`${row.kind}-${row.id}`)}`} className={`${link} mt-1 block text-xs`}>Link to record</a>{row.kind === 'Payment' && row.status === 'paid' && <a href={`/api/payments/${encodeURIComponent(row.id)}/receipt?disposition=inline`} target="_blank" rel="noreferrer" className={`${link} mt-1 block text-xs`}>Open payment receipt</a>}</span><span className="tabular-nums text-[color:var(--portal-text)]">{money(Number(row.amount))}</span></div>)}</div>}</section>
  </div>
}
