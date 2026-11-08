'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Receipt } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalSelect } from '@/components/portal/PortalUI'
import { getBillBalance, type BillExpense } from '@/lib/luxorBillBalances'
import { billReminders, type BillReminderPreference } from '@/lib/luxorBillReminders'
import type { LuxorBill, LuxorBillIntake, LuxorVendor } from '@/lib/luxorInquiryTypes'
import type { LuxorExpenseTemplate } from '@/lib/luxorExpenseTypes'

type Data = { bills: LuxorBill[]; billIntakes: LuxorBillIntake[]; vendors: LuxorVendor[]; templates: LuxorExpenseTemplate[]; expenses: BillExpense[] | null; reminders: BillReminderPreference[] | null; bookings: Array<{ id: string; client_name: string | null; event_type: string | null; event_date: string | null }> | null }
type Sort = 'due' | 'vendor' | 'amount' | 'status'
const currency = (value: number, code = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(value) }
  catch { return `${value.toFixed(2)} ${code}` }
}
function displayDate(value: string | null | undefined) {
  const day = calendarDay(value)
  if (!day) return 'Not set'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
}
function todayChicago() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
}
function calendarDay(value: string | null | undefined) {
  const day = value?.slice(0, 10) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [year, month, dayNumber] = day.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, dayNumber))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== dayNumber) return null
  return day
}
function paymentState(bill: LuxorBill, balance: ReturnType<typeof getBillBalance>, today: string) {
  if ((bill as LuxorBill & { archived_at?: string | null }).archived_at) return 'Archived'
  if (bill.extraction_status === 'duplicate' || bill.duplicate_of_bill_id) return 'Possible duplicate'
  if (balance.remaining === null) return 'Needs reconciliation'
  if (balance.remaining === 0) return 'Paid'
  const due = calendarDay(bill.due_date)
  if (due && due < today) return 'Overdue'
  if (balance.paid && balance.paid > 0) return 'Partially paid'
  return 'Unpaid'
}
function aggregate(rows: Array<{ remaining: number | null }>) {
  const unknown = rows.filter((item) => item.remaining === null).length
  return { amount: rows.reduce((sum, item) => sum + (item.remaining ?? 0), 0), unknown }
}
function netRecorded(expense: BillExpense) {
  if (!Array.isArray(expense.payments)) return null
  let total = 0
  for (const payment of expense.payments) {
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0 || !['payment', 'refund', 'reversal'].includes(payment.transaction_type) || !calendarDay(payment.payment_date)) return null
    total += payment.transaction_type === 'payment' ? amount : -amount
  }
  return Math.round(total * 100) / 100
}
function paymentNetInMonth(payment: NonNullable<BillExpense['payments']>[number], monthKey: string) {
  const day = calendarDay(payment.payment_date)
  if (!day || !day.startsWith(monthKey)) return 0
  const amount = Number(payment.amount)
  if (!Number.isFinite(amount) || amount <= 0 || !['payment', 'refund', 'reversal'].includes(payment.transaction_type)) return null
  return payment.transaction_type === 'payment' ? amount : -amount
}
function vendorMatches(vendor: { name: string; vendor_type: string; email: string | null; phone: string | null }, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [vendor.name, vendor.vendor_type, vendor.email, vendor.phone].some((value) => (value || '').toLowerCase().includes(needle))
}
function obligationSchedule(template: LuxorExpenseTemplate) {
  if (template.frequency === 'custom' && template.custom_interval && template.custom_unit) return `Every ${template.custom_interval} ${template.custom_unit}`
  return template.frequency
}
function recordedPayments(expense: BillExpense | null) {
  if (!expense || !Array.isArray(expense.payments)) return null
  return [...expense.payments].sort((a, b) => String(a.payment_date).localeCompare(String(b.payment_date)) || a.id.localeCompare(b.id))
}
function Metric({ label, amount, unknown, detail }: { label: string; amount: number; unknown: number; detail?: string }) {
  return <div className="min-w-0 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4"><p className="text-xs text-[color:var(--portal-muted)]">{label}</p><p className="mt-2 text-lg font-bold tabular-nums text-[color:var(--portal-text)]">Known {currency(amount)}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{unknown ? `${unknown} ${unknown === 1 ? 'bill needs' : 'bills need'} reconciliation` : detail || 'From listed linked bills'}</p></div>
}

export default function FinancialBills() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState<Sort>('due')
  const [vendorQuery, setVendorQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const refresh = useCallback(async () => {
    try {
      const [operations, expenseResponse] = await Promise.all([fetch('/api/portal/bill-center', { cache: 'no-store' }), fetch('/api/expenses', { cache: 'no-store' })])
      if (!operations.ok || !expenseResponse.ok) throw new Error('Bills and expenses could not be loaded. Operations and finance access are required.')
      const [ops, expenseRows] = await Promise.all([operations.json(), expenseResponse.json()])
      if (!Array.isArray(ops.bills) || !Array.isArray(ops.billIntakes) || !Array.isArray(ops.vendors) || !Array.isArray(ops.templates) || (ops.reminders !== null && !Array.isArray(ops.reminders)) || (ops.bookings !== null && !Array.isArray(ops.bookings)) || !Array.isArray(expenseRows)) throw new Error('Bill records could not be verified. Please try again.')
      setData({ bills: ops.bills, billIntakes: ops.billIntakes, vendors: ops.vendors, templates: ops.templates, reminders: ops.reminders, bookings: ops.bookings ?? null, expenses: expenseResponse.headers.get('X-Luxor-Expense-History') === 'legacy-only' ? null : expenseRows })
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load bills.'); setData(null) }
  }, [])
  useEffect(() => { void refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [refresh])
  useEffect(() => {
    if (!data?.billIntakes.some((intake) => intake.status === 'received' || intake.status === 'processing')) return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [data, refresh])
  async function upload(file: File) {
    setUploading(true); setNotice(null)
    try {
      const form = new FormData(); form.set('file', file)
      const response = await fetch('/api/operations/bills/intake', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Bill upload failed.')
      setNotice('Bill uploaded and queued for AI analysis. Review the extracted details before approval.')
      await refresh()
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Bill upload failed.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const today = todayChicago()
  const reminders = data?.reminders ? billReminders(data.bills, data.expenses, data.reminders, today) : []
  const month = today.slice(0, 7)
  const thirtyDays = new Date(new Date(`${today}T12:00:00Z`).getTime() + 29 * 86400000).toISOString().slice(0, 10)
  const rows = useMemo(() => (data?.bills || []).filter((bill) => bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id).map((bill) => {
    const balance = getBillBalance(bill, data?.expenses || null)
    return { bill, ...balance, state: paymentState(bill, balance, today) }
  }), [data, today])
  const open = rows.filter((row) => row.state !== 'Paid' && row.state !== 'Archived')
  const paidWithoutHistory = rows.filter((row) => row.bill.status === 'paid' && row.remaining === null).length
  const outstanding = aggregate(open)
  const undated = open.filter((row) => !calendarDay(row.bill.due_date)).length
  const dueMonthBase = aggregate(open.filter((row) => calendarDay(row.bill.due_date)?.startsWith(month)))
  const overdueBase = aggregate(open.filter((row) => { const due = calendarDay(row.bill.due_date); return Boolean(due && due < today) }))
  const upcomingBase = aggregate(open.filter((row) => { const due = calendarDay(row.bill.due_date); return Boolean(due && due >= today && due <= thirtyDays) }))
  const dueMonth = dueMonthBase
  const overdue = overdueBase
  const upcoming = upcomingBase
  const completeHistory = rows.filter((row) => row.paid !== null && row.expense && netRecorded(row.expense) !== null && Math.abs((netRecorded(row.expense) ?? 0) - row.paid) < 0.005)
  const unknownPaid = rows.length - completeHistory.length
  const paidThisMonth = completeHistory.flatMap((row) => row.expense?.payments || []).reduce((sum, payment) => {
    const delta = paymentNetInMonth(payment, month)
    return delta === null ? sum : sum + delta
  }, 0)
  const visible = rows.filter(({ bill, state, expense }) => {
    const vendorName = data?.vendors.find((vendor) => vendor.id === bill.vendor_id)?.name || ''
    const booking = expense?.booking_id && data?.bookings ? data.bookings.find((item) => item.id === expense.booking_id) : null
    const eventDay = booking?.event_date?.slice(0, 10)
    const haystack = `${bill.provider} ${vendorName} ${booking?.client_name || ''} ${booking?.event_type || ''} ${eventDay && /^\d{4}-\d{2}-\d{2}$/.test(eventDay) ? eventDay : ''} ${bill.service} ${bill.invoice_number || ''} ${bill.bill_category || ''} ${bill.review_notes || ''}`.toLowerCase()
    return (filter === 'all' || state === filter) && haystack.includes(query.trim().toLowerCase())
  }).sort((a, b) => {
    const vendorLabel = (bill: LuxorBill) => data?.vendors.find((vendor) => vendor.id === bill.vendor_id)?.name || bill.provider
    return sort === 'vendor' ? vendorLabel(a.bill).localeCompare(vendorLabel(b.bill)) : sort === 'amount' ? (a.original === null ? 1 : 0) - (b.original === null ? 1 : 0) || (b.original ?? 0) - (a.original ?? 0) : sort === 'status' ? a.state.localeCompare(b.state) : (calendarDay(a.bill.due_date) || '9999').localeCompare(calendarDay(b.bill.due_date) || '9999')
  })
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const [year, monthNumber] = month.split('-').map(Number)
    return new Date(Date.UTC(year, monthNumber - 1 - (5 - index), 1)).toISOString().slice(0, 7)
  })
  const paymentTrend = monthKeys.map((key) => ({ key, value: completeHistory.flatMap((row) => row.expense?.payments || []).reduce((sum, payment) => {
    const delta = paymentNetInMonth(payment, key)
    return delta === null ? sum : sum + delta
  }, 0) }))
  const maxTrend = Math.max(1, ...paymentTrend.map((item) => Math.abs(item.value)))
  const statusCounts = ['Unpaid', 'Partially paid', 'Paid', 'Overdue', 'Needs reconciliation'].map((state) => ({ state, count: rows.filter((row) => row.state === state).length }))
  const duplicateCount = data?.bills.filter((bill) => bill.extraction_status === 'duplicate' || Boolean(bill.duplicate_of_bill_id)).length || 0
  const unmatchedCompanies = rows.filter(({ bill }) => !bill.vendor_id).length
  return <PortalPageFrame>
    <PortalPageHeader icon={<Receipt size={22} />} title="Bills and vendors" description="Review bills, balances, and payments connected to expenses." actions={<><input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Choose a bill to upload" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file) }} /><PortalButton variant="primary" disabled={uploading || !data || Boolean(error)} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Upload bill'}</PortalButton></>} />
    <Link href="/portal/finances" className="w-fit text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">Financial Center</Link>
    {notice ? <p role="status" className="text-sm text-[color:var(--portal-text)]">{notice}</p> : null}
    {error ? <div role="alert" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 text-sm text-[color:var(--portal-text)]">{error} <button type="button" className="ml-2 font-semibold text-[#a8792f]" onClick={() => void refresh()}>Try again</button></div> : null}
    {!data && !error ? <p role="status" className="text-sm text-[color:var(--portal-muted)]">Loading bills…</p> : null}
    {data ? <>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Bill, vendor, and intake lists are count-checked when loaded. Unlinked or conflicting balances require reconciliation.</p>
      {unmatchedCompanies ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{unmatchedCompanies} {unmatchedCompanies === 1 ? 'bill needs' : 'bills need'} a confirmed vendor link. <Link href="/portal/operations?tab=bills" className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open Bill review</Link>.</p> : null}
      {paidWithoutHistory ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{paidWithoutHistory} {paidWithoutHistory === 1 ? 'bill is' : 'bills are'} marked paid but lack a verified linked payment history; review {paidWithoutHistory === 1 ? 'it' : 'them'} before relying on totals.</p> : null}
      {undated ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{undated} open {undated === 1 ? 'bill has' : 'bills have'} no due date, so {undated === 1 ? 'it is' : 'they are'} not counted as due this month, overdue, or due in the next 30 days.</p> : null}
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Bill reminders</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">{data.reminders === null ? 'Reminder preferences are not available yet, so nothing is listed here. Due and overdue bills below still come from recorded due dates. No external notifications are sent.' : 'Shown here from your bill preferences when a linked balance is verified. Unlinked or conflicting balances require review and do not appear here. No external notifications are sent.'}</p>{data.reminders !== null && reminders.length ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{reminders.map(({ bill, remaining, days }) => <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">{bill.provider}</Link><span className="text-[color:var(--portal-text)]">{days < 0 ? `Overdue by ${Math.abs(days)} days` : days === 0 ? 'Due today' : `Due in ${days} days`} · {currency(remaining)} remaining</span></li>)}</ul> : data.reminders !== null ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No reminders currently match your preferences.</p> : null}</section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Outstanding" {...outstanding} /><Metric label="Due this month" {...dueMonth} /><Metric label="Overdue" {...overdue} /><Metric label="Paid this month" amount={paidThisMonth} unknown={0} detail={unknownPaid ? `From complete payment histories. ${unknownPaid} ${unknownPaid === 1 ? 'bill is' : 'bills are'} excluded because the history is incomplete.` : 'Net recorded payments'} /><Metric label="Next 30 days" {...upcoming} /></div>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"><h2 className="text-base font-bold text-[color:var(--portal-text)]">Bill overview</h2><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[color:var(--portal-muted)]">{statusCounts.map(({ state, count }) => <span key={state}>{state}: <strong className="tabular-nums text-[color:var(--portal-text)]">{count}</strong></span>)}</div>{duplicateCount ? <p className="mt-2 text-xs text-[color:var(--portal-muted)]">{duplicateCount} possible duplicate bills are excluded while they are reviewed in Operations.</p> : null}<h3 className="mt-6 text-sm font-bold text-[color:var(--portal-text)]">Recorded payment trend</h3><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Net payments and adjustments from linked expenses. {unknownPaid ? `Incomplete or undated history for ${unknownPaid} bills is not included.` : 'Only recorded transactions are shown.'}</p><div className="mt-4 space-y-3">{paymentTrend.map((item) => <div key={item.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs"><span className="tabular-nums text-[color:var(--portal-muted)]">{item.key}</span><div className="h-2 rounded-full bg-[color:var(--portal-soft)]"><div className={`h-2 rounded-full ${item.value < 0 ? 'bg-rose-400' : 'bg-[#b98a3d]'}`} style={{ width: `${Math.abs(item.value) / maxTrend * 100}%` }} /></div><span className="tabular-nums text-[color:var(--portal-text)]">{currency(item.value)}</span></div>)}</div></section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Bills</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Amounts and payments come from each linked expense. Review AI suggestions against the original bill.</p></div><Link href="/portal/operations?tab=bills" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]">Open Bill review <ArrowUpRight size={14} className="inline" /></Link></div>
        {data.billIntakes.some((item) => ['received', 'processing', 'failed', 'ignored', 'duplicate'].includes(item.status)) ? <div className="mt-4 space-y-2 border-t border-[color:var(--portal-border)] pt-4">{data.billIntakes.filter((item) => ['received', 'processing', 'failed', 'ignored', 'duplicate'].includes(item.status)).map((item) => <p key={item.id} className="text-sm text-[color:var(--portal-muted)]">{item.filename}: {item.status === 'failed' ? 'Analysis failed; retry in Bill review' : item.status === 'ignored' ? 'Analysis stopped or ignored; review in Bill review' : item.status === 'duplicate' ? 'Possible duplicate; review in Bill review' : 'Queued or analyzing…'}</p>)}</div> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><label><span className="sr-only">Search bills</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vendor, bill, invoice, category, or note" className="min-h-10 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)]" /></label><PortalSelect value={filter} onChange={setFilter} options={['all', 'Unpaid', 'Partially paid', 'Paid', 'Overdue', 'Needs reconciliation', 'Archived'].map((value) => ({ value, label: value === 'all' ? 'All statuses' : value }))} buttonClassName="min-h-10 w-full" /><PortalSelect value={sort} onChange={(value) => setSort(value as Sort)} options={[{ value: 'due', label: 'Sort by due date' }, { value: 'vendor', label: 'Sort by vendor' }, { value: 'amount', label: 'Sort by amount' }, { value: 'status', label: 'Sort by status' }]} buttonClassName="min-h-10 w-full" /></div>
        {!visible.length ? <p className="mt-5 text-sm text-[color:var(--portal-muted)]">No bills in this view.</p> : <div className="mt-4 divide-y divide-[color:var(--portal-border)]">{visible.map(({ bill, original, paid, remaining, reason, state, expense }) => { const lines = recordedPayments(expense); const linkedVendor = data.vendors.find((vendor) => vendor.id === bill.vendor_id); const title = linkedVendor?.name || bill.provider; const booking = expense?.booking_id && data.bookings ? data.bookings.find((item) => item.id === expense.booking_id) : null; const eventDay = booking?.event_date?.slice(0, 10); const eventDate = eventDay && /^\d{4}-\d{2}-\d{2}$/.test(eventDay) ? ` · ${displayDate(eventDay)}` : ''; const eventLabel = expense?.booking_id ? (booking ? ` · ${booking.client_name || 'Event'}${booking.event_type ? ` · ${booking.event_type}` : ''}${eventDate}` : ' · Event expense') : expense ? ' · General overhead' : ''; return <div key={bill.id} className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] md:items-center"><div className="min-w-0"><Link href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`} className="font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">{title} <ArrowUpRight size={12} className="inline" /></Link><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{bill.service}{bill.invoice_number ? ` · #${bill.invoice_number}` : ''} · {bill.bill_category || 'Uncategorized'} · {bill.frequency || 'Frequency not recorded'}{linkedVendor && linkedVendor.name !== bill.provider ? ` · ${bill.provider}` : ''}{eventLabel}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Issued {displayDate(bill.issue_date)} · Due {displayDate(bill.due_date)} · {state}</p>{bill.review_notes ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Note: {bill.review_notes}</p> : null}</div><div><span className="block text-xs text-[color:var(--portal-muted)]">Original</span><span className="tabular-nums text-[color:var(--portal-text)]">{original === null ? 'Unknown' : currency(original, bill.currency)}{bill.extraction_status === 'needs_review' ? ' · review' : ''}</span></div><div><span className="block text-xs text-[color:var(--portal-muted)]">Paid</span><span className="tabular-nums text-[color:var(--portal-text)]">{paid === null ? 'Unavailable' : currency(paid)}</span></div><div><span className="block text-xs text-[color:var(--portal-muted)]">Remaining</span><span className="tabular-nums text-[color:var(--portal-text)]">{remaining === null ? 'Unavailable' : currency(remaining)}</span>{reason ? <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{reason}</p> : null}{expense ? <Link href={`/portal/finances/expenses/${encodeURIComponent(expense.id)}`} className="mt-1 block text-xs font-semibold text-[#9a712e] dark:text-[#e6c77f]">Open expense</Link> : null}</div>{lines ? <ul className="space-y-1 text-xs text-[color:var(--portal-muted)] md:col-span-4"><li>{remaining === null ? 'Recorded activity. These lines are not a complete balance.' : 'Recorded payments'}</li>{lines.length ? lines.map((payment) => { const amount = Number(payment.amount); return <li key={payment.id} className="text-[color:var(--portal-text)]">{displayDate(payment.payment_date)} · {Number.isFinite(amount) ? currency(amount) : 'Amount unavailable'} · {payment.transaction_type} · {payment.payment_method || 'Method not recorded'}{payment.reference_number ? ` · ${payment.reference_number}` : ''}{payment.notes ? ` · ${payment.notes}` : ''}</li> }) : <li>No payment lines are saved on the linked expense.</li>}</ul> : expense ? <p className="text-xs text-[color:var(--portal-muted)] md:col-span-4">Payment lines are unavailable.</p> : null}</div> })}</div>}
      </section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Vendors</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">Open a company to see its linked bills, payment history, and source documents.</p></div><Link href="/portal/operations?tab=vendors" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]">Manage vendors <ArrowUpRight size={14} className="inline" /></Link></div><label className="mt-4 block"><span className="sr-only">Search vendors</span><input value={vendorQuery} onChange={(event) => setVendorQuery(event.target.value)} placeholder="Search name, category, email, or phone" className="min-h-10 w-full max-w-sm rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)]" /></label><ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{data.vendors.filter((item) => vendorMatches(item, vendorQuery)).map((item) => <li key={item.id}><Link href={`/portal/finances/bills/vendors/${encodeURIComponent(item.id)}`} className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm"><span className="font-semibold text-[#9a712e] dark:text-[#e6c77f]">{item.name}{(item as LuxorVendor & { archived_at?: string | null }).archived_at ? <span className="ml-2 text-xs font-normal text-[color:var(--portal-muted)]">Archived</span> : null}</span><span className="text-[color:var(--portal-muted)]">{item.vendor_type} <ArrowUpRight size={13} className="inline" /></span></Link></li>)}</ul>{!data.vendors.some((item) => vendorMatches(item, vendorQuery)) ? <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No vendors found.</p> : null}</section>
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-[color:var(--portal-text)]">Recurring obligations</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">These are the existing recurring expenses. They create obligations, not payments, and they are not a second bill schedule. No money is sent automatically.</p></div><Link href="/portal/finances/expenses/recurring" className="text-sm font-semibold text-[#9a712e] dark:text-[#e6c77f]">Manage recurring expenses <ArrowUpRight size={14} className="inline" /></Link></div>{data.templates.some((template) => template.is_active) ? <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{data.templates.filter((template) => template.is_active).map((template) => { const next = data.expenses?.filter((expense) => expense.recurring_template_id === template.id && expense.status !== 'paid' && expense.status !== 'cancelled' && expense.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0]; return <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="text-[color:var(--portal-text)]">{template.name}<span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{template.vendor_name || 'Vendor not set'} · {template.category} · {obligationSchedule(template)} · Starts {displayDate(template.first_due_date)}{template.payment_method ? ` · ${template.payment_method}` : ''} · {data.expenses ? next ? `Next recorded due ${displayDate(next.due_date)}` : 'No open occurrence recorded' : 'Occurrence history unavailable'}</span></span><span className="tabular-nums text-[color:var(--portal-text)]">{template.is_variable || template.expected_amount == null ? 'Variable' : `${currency(Number(template.expected_amount))} expected`}</span></li> })}</ul> : <p className="mt-3 text-sm text-[color:var(--portal-muted)]">No active recurring obligations.</p>}</section>
      <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Payments are recorded in Expense Management; future obligations are not counted as paid.</p>
    </> : null}
  </PortalPageFrame>
}
