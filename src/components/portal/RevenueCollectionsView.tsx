'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CalendarBlank, CurrencyCircleDollar, MagnifyingGlass, ShieldCheck } from '@phosphor-icons/react'
import { PortalButton, PortalDatePicker, PortalFilterBar, PortalModal, PortalSelect, PortalSkeleton, PortalStatusBadge } from '@/components/portal/PortalUI'
import { RevenueCollectionsShell } from '@/components/portal/RevenueCollectionsShell'
import { BorderBeam } from '@/components/ui/border-beam'
import { FinanceEmptyState, FinanceReviewNotice, formatFinanceCurrency, MonthlyCollectionsBars } from '@/components/portal/RevenueCollectionsPrimitives'
import { LogInstallmentPaymentDialog } from '@/components/portal/LogInstallmentPaymentDialog'
import { useFinanceLedgerRealtime } from '@/hooks/useFinanceLedgerRealtime'
import { useRevenueCollectionsModel } from '@/components/portal/useRevenueCollectionsModel'
import {
  filterLuxorRevenueHistory,
  filterLuxorRevenueReceivables,
  type LuxorRevenueCollectionsOptions,
  type LuxorRevenueHistoryFilters,
  type LuxorRevenueHistoryRow,
  type LuxorRevenuePaymentType,
  type LuxorRevenueRecordStatus,
  type LuxorRevenueScheduleRow,
} from '@/lib/luxorRevenueCollectionsModel'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { isBookingPaymentMilestone } from '@/lib/luxorPaymentDashboardModel'
import { summarizeRevenueProfit } from '@/lib/luxorRevenueProfitSummary'

type RevenueView = 'revenue' | 'schedules' | 'monthly' | 'receivables' | 'history'

const inputClass = 'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)] focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15'
const filterSurface = 'min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5'
const muted = 'text-sm leading-relaxed text-[color:var(--portal-muted)]'

const periodOptions = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
  { value: 'custom', label: 'Custom dates' },
]

const recordStatuses: Array<{ value: LuxorRevenueRecordStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'paid', label: 'Paid' },
  { value: 'needs_review', label: 'Needs review' },
]

const historyStatusOptions = [
  { value: '', label: 'All statuses' },
  { value: 'successful', label: 'Successful' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'needs_review', label: 'Needs review' },
]

const paymentTypeOptions: Array<{ value: LuxorRevenuePaymentType | ''; label: string }> = [
  { value: '', label: 'All payment types' },
  { value: 'booking_deposit', label: 'Booking deposit' },
  { value: 'installment_payment', label: 'Installment' },
  { value: 'final_payment', label: 'Final payment' },
  { value: 'full_payment', label: 'Full payment' },
  { value: 'additional_service_payment', label: 'Additional service' },
  { value: 'other', label: 'Other' },
]

const statusLabel = (status: string) => status.replaceAll('_', ' ')
const toneForStatus = (status: string) => status === 'overdue' || status === 'failed'
  ? 'red' as const
  : status === 'paid' || status === 'successful'
    ? 'green' as const
    : status === 'partially_paid' || status === 'due_today' || status === 'pending'
      ? 'gold' as const
      : status === 'upcoming'
        ? 'blue' as const
        : 'neutral' as const

function formatDate(value: string | null | undefined) {
  if (!value) return 'Date unavailable'
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`)
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed)
    : 'Date unavailable'
}

function formatMonth(value: string, includeYear = false) {
  const date = new Date(`${value}-01T12:00:00.000Z`)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', ...(includeYear ? { year: 'numeric' as const } : { year: '2-digit' as const }), timeZone: 'UTC' }).format(date)
    : value
}

function shiftCalendarDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10)
}

function Status({ value, warning = false }: { value: string; warning?: boolean }) {
  return <PortalStatusBadge borderless status={statusLabel(value)} tone={toneForStatus(value)} warning={warning} />
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 text-xs font-medium text-[color:var(--portal-muted)]">{label}{children}</label>
}

function SearchField({ value, onChange, label = 'Search clients, bookings, or references' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="relative block min-w-0 flex-1">
    <span className="sr-only">{label}</span>
    <MagnifyingGlass aria-hidden="true" size={16} weight="regular" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
    <input className={`${inputClass} pl-9`} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} />
  </label>
}

function RevenuePeriodFilter({
  preset,
  setPreset,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: {
  preset: LuxorRevenueCollectionsOptions['preset']
  setPreset: (value: NonNullable<LuxorRevenueCollectionsOptions['preset']>) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
}) {
  return <section className="flex flex-col gap-3" aria-label="Revenue period">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Collection period">
        <PortalSelect aria-label="Collection period" className="mt-1" value={preset || 'this_month'} onChange={(value) => setPreset(value as NonNullable<LuxorRevenueCollectionsOptions['preset']>)} options={periodOptions} />
      </Field>
      {preset === 'custom' ? <>
        <Field label="Start date"><div className="mt-1"><PortalDatePicker value={startDate} onChange={setStartDate} timeZone="America/Chicago" placeholder="Choose start date" /></div></Field>
        <Field label="End date"><div className="mt-1"><PortalDatePicker value={endDate} onChange={setEndDate} timeZone="America/Chicago" placeholder="Choose end date" /></div></Field>
      </> : <p className="pb-2 text-xs text-[color:var(--portal-muted)]">Dates use Luxor’s Chicago calendar and include both endpoints.</p>}
    </div>
  </section>
}

function LoadState({ loading, error, hasModel }: { loading: boolean; error: string | null; hasModel: boolean }) {
  if (loading && !hasModel) {
    return (
      <div className="space-y-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading revenue records</span>
        <PortalSkeleton className="h-7 w-52 rounded" /><PortalSkeleton className="h-10 w-40 rounded-xl" />
        <div className="grid overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-3 border-b border-[color:var(--portal-border)] p-5 last:border-0 md:border-b-0 md:border-r"><PortalSkeleton className="h-4 w-36 rounded" /><PortalSkeleton className="h-8 w-28 rounded" /><PortalSkeleton className="h-4 w-44 rounded" /></div>)}</div>
        <PortalSkeleton className="h-44 w-full rounded-2xl" />
      </div>
    )
  }
  if (loading && hasModel) return <p className="text-xs text-[color:var(--portal-muted)]" role="status" aria-live="polite">Refreshing verified finance records…</p>
  if (error) return <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-[color:var(--portal-text)]"><p className="font-semibold">Revenue records could not be verified.</p><p className="mt-1 text-[color:var(--portal-muted)]">{error}</p></div>
  return null
}

function UpcomingPaymentsPreview({ model }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']> }) {
  const rows = model.paymentSchedules
    .filter((row) => (row.status === 'upcoming' || row.status === 'due_today') && row.dueDate && row.remaining !== null && row.remaining > 0)
    .slice()
    .sort((left, right) => (left.dueDate || '').localeCompare(right.dueDate || '') || left.order - right.order)
    .slice(0, 5)

  return <section className={`${filterSurface} overflow-hidden p-0`}>
    <div className="flex items-start justify-between gap-3 p-4 sm:p-5"><div><h2 className="font-semibold text-[color:var(--portal-text)]">Upcoming payments</h2><p className={muted}>Saved installments due next</p></div><Link href="/portal/finances?view=receivables" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">View all <ArrowUpRight aria-hidden="true" size={15} weight="regular" /></Link></div>
    {!model.availability.upcoming ? <div className="px-4 pb-4 sm:px-5 sm:pb-5"><FinanceEmptyState title="Upcoming payments unavailable" detail="Reconcile saved schedules before relying on upcoming totals." /></div>
      : !rows.length ? <div className="px-4 pb-4 sm:px-5 sm:pb-5"><FinanceEmptyState title="No upcoming payments" detail="There are no verified installments due today or later in this schedule window." /></div>
        : <>
          <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="bg-[color:var(--portal-soft)] text-xs text-[color:var(--portal-muted)]"><tr><th className="px-5 py-3 font-medium">Client and event</th><th className="px-4 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium">Due date</th><th className="px-4 py-3 text-right font-medium">Remaining</th><th className="px-5 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[color:var(--portal-border)]">{rows.map((row) => <tr key={row.installmentId} className="text-[color:var(--portal-text)]"><td className="px-5 py-3"><span className="font-medium">{row.clientName}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{row.eventDate ? `Event ${formatDate(row.eventDate)}` : row.eventType || 'Event date unavailable'}</span></td><td className="px-4 py-3">{row.label}</td><td className="whitespace-nowrap px-4 py-3">{formatDate(row.dueDate)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatFinanceCurrency(row.remaining)}{row.reviewRequired ? <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-300">Provisional · unverified</span> : null}</td><td className="px-5 py-3"><Status value={row.status} warning={row.reviewRequired} /></td></tr>)}</tbody></table></div>
          <div className="divide-y divide-[color:var(--portal-border)] md:hidden">{rows.map((row) => <article key={row.installmentId} className="space-y-2 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-medium text-[color:var(--portal-text)]">{row.clientName}</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{row.label} · Due {formatDate(row.dueDate)}</p></div><Status value={row.status} warning={row.reviewRequired} /></div><div className="flex items-end justify-between gap-3"><p className="text-xs text-[color:var(--portal-muted)]">{row.eventDate ? `Event ${formatDate(row.eventDate)}` : row.eventType || 'Event date unavailable'}</p><p className="shrink-0 text-right font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.remaining)}{row.reviewRequired ? <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-300">Provisional · unverified</span> : null}</p></div></article>)}</div>
        </>}
  </section>
}

function RecentPaymentsPreview({ model }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']> }) {
  const rows = model.paymentHistory
    .filter((row) => row.treatment === 'event_collection' && row.status === 'successful' && row.signedAmount !== null && row.signedAmount > 0)
    .slice()
    .sort((left, right) => (right.date || '').localeCompare(left.date || '') || left.id.localeCompare(right.id))
    .slice(0, 5)

  return <section className={filterSurface}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[color:var(--portal-text)]">Recent payments</h2><p className={muted}>Verified event receipts</p></div><Link href="/portal/finances?view=payments" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">View all <ArrowUpRight aria-hidden="true" size={15} weight="regular" /></Link></div>
    {!rows.length ? <div className="mt-4"><FinanceEmptyState title="No recent payments" detail="Verified event receipts will appear here when recorded." /></div> : <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">{rows.map((row) => <li key={row.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium text-[color:var(--portal-text)]">Payment received · {row.clientName}</p><p className="mt-1 text-xs capitalize text-[color:var(--portal-muted)]">{formatDate(row.date)} · {statusLabel(row.paymentType)}</p></div><p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">+{formatFinanceCurrency(row.signedAmount)}</p></li>)}</ul>}
  </section>
}

type ProfitSnapshot = { events: Array<{ booking: { id: string; client_name: string | null; event_type: string | null; status: string }; collections: number | null; paidDirectCosts: number | null; cashContribution: number | null; margin: number | null; unknownExpenseCount: number }>; issues: string[] }

function ProfitabilitySummary({ data, error }: { data: ProfitSnapshot | null; error: boolean }) {
  const summary = data ? summarizeRevenueProfit(data.events, data.issues) : null
  const { collected, paidCosts, cashProfit, margin, unknownCosts } = summary || { collected: null, paidCosts: null, cashProfit: null, margin: null, unknownCosts: false }
  return <section className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]" aria-labelledby="revenue-profit-title">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-5 py-4 sm:px-6">
      <div><h2 id="revenue-profit-title" className="text-base font-bold text-[color:var(--portal-text)]">Event profit so far</h2><p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">All-time cash for confirmed and completed events</p></div>
      <Link href="/portal/finances/profitability" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#9a712e] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">Explore events <ArrowUpRight aria-hidden="true" size={15} /></Link>
    </div>
    {!data ? <p className="px-5 py-6 text-sm text-[color:var(--portal-muted)]" role={error ? 'alert' : 'status'}>{error ? 'Event profit is unavailable. Open event profitability to review the records.' : 'Loading event profit…'}</p> : !summary?.count ? <p className="px-5 py-6 text-sm text-[color:var(--portal-muted)]">Profit will appear when a confirmed event has verified payments and costs.</p> : !summary.verified ? <p className="px-5 py-6 text-sm text-[color:var(--portal-muted)]">Event profit needs review before it can be calculated. Open event profitability to see which records need attention.</p> : <>
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[1fr_2fr] sm:gap-8 sm:px-6">
        <div><p className="text-xs font-semibold text-[color:var(--portal-muted)]">Cash margin</p><p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-[color:var(--portal-text)]">{margin === null ? '—' : `${margin.toFixed(1)}%`}</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{margin === null ? 'Available when net collections are above zero.' : 'Cash profit ÷ net collected'}</p></div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3"><div><dt className="text-xs text-[color:var(--portal-muted)]">Net collected</dt><dd className="mt-1 font-bold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(collected)}</dd></div><div><dt className="text-xs text-[color:var(--portal-muted)]">Direct costs paid</dt><dd className="mt-1 font-bold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(paidCosts)}</dd></div><div><dt className="text-xs text-[color:var(--portal-muted)]">Cash profit</dt><dd className="mt-1 font-bold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(cashProfit)}</dd></div></dl>
      </div>
      <p className="border-t border-[color:var(--portal-border)] px-5 py-3 text-xs leading-5 text-[color:var(--portal-muted)] sm:px-6">Net collected − direct costs paid. This is cash to date, not final profit; unpaid and unrecorded costs and business overhead are not included.{unknownCosts ? ' Some event costs are still unknown.' : ''}</p>
    </>}
  </section>
}

function RevenueDashboard({ model, onPeriodChange, profit, profitError }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']>; onPeriodChange: React.ReactNode; profit: ProfitSnapshot | null; profitError: boolean }) {
  return <div className="space-y-5">
    <div><h2 className="text-xl font-bold tracking-tight text-[color:var(--portal-text)]">Revenue &amp; collections</h2><p className="mt-1 text-sm text-[color:var(--portal-muted)]">See what has come in, what is due, and how events are performing.</p></div>
    {onPeriodChange}
    {!model.period.valid ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-[color:var(--portal-text)]">Choose a valid start and end date to view this period.</p> : null}
    <FinanceReviewNotice issues={model.issues} />
    <section className="relative overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-[color:var(--portal-card)]" aria-label="Collection summary">
      <BorderBeam size={140} duration={16} borderWidth={1.2} colorFrom="#f1d27a" colorTo="#caa24c" />
      <div className="grid grid-cols-2 gap-0 md:grid-cols-[1.15fr_1fr_1fr]"><div className="col-span-2 border-b border-[color:var(--portal-border)] px-5 py-5 md:col-span-1 md:border-b-0 md:border-r sm:px-6"><p className="text-sm font-semibold text-[color:var(--portal-muted)]">Collected in this period</p><p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(model.kpis.totalCollected)}</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{formatFinanceCurrency(model.kpis.grossCollected)} received · {formatFinanceCurrency(model.kpis.eventRefunds)} refunded</p><Link href="/portal/finances?view=payments" className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">View payments →</Link></div>
        <div className="border-r border-[color:var(--portal-border)] px-4 py-5 sm:px-6"><p className="text-sm font-semibold text-[color:var(--portal-muted)]">Expected in this period</p><p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(model.kpis.expectedRevenue)}</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Unpaid scheduled installments due in the selected period.</p></div>
        <div className="px-4 py-5 sm:px-6"><p className="text-sm font-semibold text-[color:var(--portal-muted)]">Outstanding balance</p><p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(model.kpis.outstandingBalance)}</p><p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">Across confirmed bookings · {formatFinanceCurrency(model.kpis.overduePayments)} overdue</p><Link href="/portal/finances?view=receivables" className="mt-3 inline-flex min-h-9 items-center text-xs font-semibold text-[#9a712e] hover:underline dark:text-[#e6c77f]">View payment schedules →</Link></div></div>
    </section>
    <ProfitabilitySummary data={profit} error={profitError} />
    <section id="monthly-collections" className="scroll-mt-4" aria-label="Monthly collections"><MonthlyView model={model} /></section>
    <div className="grid gap-4 xl:grid-cols-2"><UpcomingPaymentsPreview model={model} /><RecentPaymentsPreview model={model} /></div>
    <section className={`${filterSurface} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}><div className="flex items-start gap-3"><ShieldCheck aria-hidden="true" size={19} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#e6c77f]" /><div><h2 className="font-semibold text-[color:var(--portal-text)]">Security deposits</h2><p className={muted}>Refundable deposits are tracked separately from event revenue.</p></div></div><p className="text-lg font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(model.securityDeposits.held)} <span className="text-xs font-normal text-[color:var(--portal-muted)]">held</span></p></section>
  </div>
}

export function RescheduleInstallmentDialog({
  editing,
  today,
  onClose,
  onSaved,
  inline = false,
  onSavingChange,
}: {
  editing: { row: Pick<LuxorRevenueScheduleRow, 'installmentId' | 'clientName' | 'label' | 'dueDate' | 'remaining'>; expectedUpdatedAt: string } | null
  today: string
  onClose: () => void
  onSaved: () => void
  inline?: boolean
  onSavingChange?: (saving: boolean) => void
}) {
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = Boolean(editing)

  useEffect(() => {
    if (editing) { setDueDate(editing.row.dueDate || ''); setError(null) }
  }, [editing])

  const save = async () => {
    if (!editing || saving || !dueDate || dueDate <= today || dueDate === editing.row.dueDate) return
    setSaving(true)
    onSavingChange?.(true)
    setError(null)
    try {
      const response = await fetch('/api/portal/payment-installments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.row.installmentId, expectedUpdatedAt: editing.expectedUpdatedAt, due_at: dueDate }),
      })
      const result = await response.json().catch(() => null) as { installment?: { id?: string }; error?: string } | null
      if (!response.ok) {
        setError(result?.error || 'The schedule date was not changed. Refresh and try again.')
        return
      }
      if (result?.installment?.id !== editing.row.installmentId) {
        setError('The schedule change could not be confirmed. Close this window and refresh the schedule before trying again.')
        return
      }
      onClose()
      onSaved()
    } catch {
      setError('The save result could not be confirmed. Refresh the schedule before trying again.')
    } finally {
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  const form = editing ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save() }}>
      {!inline && <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]"><p className="font-medium">{editing.row.clientName} · {editing.row.label}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Current due date: {formatDate(editing.row.dueDate)} · Remaining: {formatFinanceCurrency(editing.row.remaining)}</p></div>}
      <Field label="New due date"><div className="mt-1"><PortalDatePicker value={dueDate} onChange={setDueDate} timeZone="America/Chicago" minDate={shiftCalendarDate(today, 1)} placeholder="Choose a future date" /></div></Field>
      <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">The date must remain on or before the signed plan’s final-payment deadline. When installment reminders are enabled, the worker adjusts eligible reminders on its next scan. Saving does not send an email.</p>
      {error ? <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-[color:var(--portal-text)]">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4"><PortalButton onClick={onClose} disabled={saving}>Cancel</PortalButton><PortalButton variant="primary" type="submit" disabled={saving || !dueDate || dueDate <= today || dueDate === editing.row.dueDate}>{saving ? 'Saving…' : 'Save date change'}</PortalButton></div>
    </form> : null

  if (inline) return form

  return <PortalModal isOpen={open} onClose={() => { if (!saving) onClose() }} title="Change payment date" description="Only the due date will change. The signed payment amounts remain the same." maxWidth="max-w-lg" zIndex={220} fullScreenOnMobile animateClose>
    {form}
  </PortalModal>
}

function ScheduleView({ model, scheduleRows, actorEmail, onRefresh }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']>; scheduleRows: LuxorPaymentInstallment[]; actorEmail: string | null; onRefresh: () => void }) {
  const [search, setSearch] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('client') || params.get('bookingId') || ''
  })
  const [focusedClient, setFocusedClient] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('client') || params.get('bookingId') || null
  })
  const [status, setStatus] = useState<LuxorRevenueRecordStatus | ''>('')
  const [dueStart, setDueStart] = useState('')
  const [dueEnd, setDueEnd] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [initialBookingId, setInitialBookingId] = useState<string | null>(null)
  const [initialInstallmentId, setInitialInstallmentId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ row: LuxorRevenueScheduleRow; expectedUpdatedAt: string } | null>(null)

  const clearFocusedClient = () => {
    setSearch('')
    setFocusedClient(null)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('client')
      url.searchParams.delete('bookingId')
      window.history.replaceState({}, '', url)
    }
  }

  const schedules = useMemo(() => model.paymentSchedules.filter((row) => {
    if (status && row.status !== status) return false
    if (dueStart && (!row.dueDate || row.dueDate < dueStart)) return false
    if (dueEnd && (!row.dueDate || row.dueDate > dueEnd)) return false
    const query = search.trim().toLowerCase()
    if (query && !`${row.clientName} ${row.label} ${row.eventType || ''} ${row.bookingId} ${row.invoiceId}`.toLowerCase().includes(query)) return false
    return true
  }), [model.paymentSchedules, status, dueStart, dueEnd, search])
  const bookings = useMemo(() => {
    const groups = new Map<string, typeof schedules>()
    schedules.forEach((row) => groups.set(row.bookingId, [...(groups.get(row.bookingId) || []), row]))
    return [...groups.entries()].map(([bookingId, rows]) => ({ bookingId, rows }))
  }, [schedules])
  const sourceScheduleById = new Map(scheduleRows.map((row) => [row.id, row]))
  const paymentChoices = model.paymentSchedules.filter((row) => {
    const sourceRow = sourceScheduleById.get(row.installmentId)
    return Boolean(row.remaining !== null && row.remaining > 0 && !row.reviewRequired && row.status !== 'paid' && row.status !== 'needs_review'
      && sourceRow && !isBookingPaymentMilestone(sourceRow))
  })
  const bookingOptions = [...new Map(paymentChoices.map((row) => [row.bookingId, { id: row.bookingId, label: `${row.clientName}${row.eventType ? ` · ${row.eventType}` : ''} · ${row.bookingId.slice(0, 8)}` }])).values()]
  const scheduleOptions = paymentChoices.map((row) => ({ id: row.installmentId, bookingId: row.bookingId, label: row.label, remainingAmount: row.remaining, dueDate: row.dueDate, eligible: true }))
  const canReschedule = (row: LuxorRevenueScheduleRow) => {
    const sourceRow = sourceScheduleById.get(row.installmentId)
    return Boolean(sourceRow?.updated_at && (sourceRow.status === 'scheduled' || sourceRow.status === 'sent')
      && row.dueDate && row.dueDate > model.asOfDate && row.remaining !== null && row.remaining > 0 && !row.reviewRequired)
  }

  const openLogPayment = (bookingId?: string, installmentId?: string) => {
    setInitialBookingId(bookingId || null)
    setInitialInstallmentId(installmentId || null)
    setPaymentOpen(true)
  }

  return <div className="space-y-5">
    <section className={`${filterSurface} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[color:var(--portal-text)]">Saved event payment schedules</h2><p className={muted}>Amounts come from the reconciled contract and saved installments.</p></div><PortalButton variant="primary" onClick={() => openLogPayment()} disabled={!bookingOptions.length}><CurrencyCircleDollar size={16} weight="regular" /> Log payment</PortalButton></div>
      {focusedClient ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#caa24c]/35 bg-[#caa24c]/10 px-3.5 py-2 text-xs text-[color:var(--portal-text)]">
          <span>Showing payment schedule for <strong>{focusedClient}</strong></span>
          <button type="button" onClick={clearFocusedClient} className="font-semibold text-[#9a6d26] hover:underline dark:text-[#e6c77f]">Show all client schedules</button>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end"><SearchField value={search} onChange={(val) => { setSearch(val); if (!val) setFocusedClient(null) }} label="Search clients or schedule items" /><Field label="Status"><PortalSelect aria-label="Schedule status" className="mt-1" value={status} onChange={(value) => setStatus(value as LuxorRevenueRecordStatus | '')} options={recordStatuses} /></Field><Field label="Due from"><div className="mt-1"><PortalDatePicker value={dueStart} onChange={setDueStart} timeZone="America/Chicago" placeholder="Any date" /></div></Field><Field label="Due through"><div className="mt-1"><PortalDatePicker value={dueEnd} onChange={setDueEnd} timeZone="America/Chicago" placeholder="Any date" /></div></Field></div>
    </section>
    {!bookings.length ? <FinanceEmptyState title="No payment schedules match" detail="Try another status or date range, or clear the search filter." /> : bookings.map(({ bookingId, rows }) => {
      const first = rows[0]
      const totalScheduled = rows.reduce((sum, r) => sum + (r.amountDue || 0), 0)
      const totalCredited = rows.reduce((sum, r) => sum + (r.credited || 0), 0)
      const totalRemaining = rows.reduce((sum, r) => sum + (r.remaining || 0), 0)
      return <section key={bookingId} className={`${filterSurface} overflow-hidden p-0`}>
        <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="break-words text-base font-semibold text-[color:var(--portal-text)]">{first.clientName}</h3>
              {first.inquiryId ? (
                <Link href={`/portal/leads/${encodeURIComponent(first.inquiryId)}`} className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--portal-soft)] px-2.5 py-1 text-xs font-semibold text-[#9a712e] hover:bg-[#caa24c]/15 dark:text-[#e6c77f]">
                  Open client lead <ArrowUpRight size={13} weight="regular" />
                </Link>
              ) : null}
            </div>
            <p className={muted}>{[first.eventType, first.eventDate ? `Event ${formatDate(first.eventDate)}` : null].filter(Boolean).join(' · ') || 'Event details unavailable'}</p>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
              Contract total: <strong className="font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(first.bookingTotal ?? totalScheduled)}</strong>
              <span className="mx-2">·</span>
              Paid: <strong className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatFinanceCurrency(totalCredited)}</strong>
              <span className="mx-2">·</span>
              Remaining: <strong className="font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(totalRemaining)}</strong>
            </p>
          </div>
          <button type="button" onClick={() => openLogPayment(bookingId)} disabled={!rows.some((row) => paymentChoices.some((choice) => choice.installmentId === row.installmentId))} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:cursor-not-allowed disabled:opacity-50"><CurrencyCircleDollar size={16} weight="regular" /> Log payment</button>
        </div>
        <div className="hidden lg:block"><table className="w-full text-left text-sm"><thead className="bg-[color:var(--portal-soft)] text-xs text-[color:var(--portal-muted)]"><tr><th className="px-5 py-3 font-medium">Payment</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 text-right font-medium">Credited</th><th className="px-4 py-3 text-right font-medium">Remaining</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-[color:var(--portal-border)]">{rows.map((row) => <tr key={row.installmentId} className="text-[color:var(--portal-text)]"><td className="px-5 py-3"><span className="font-medium">{row.label}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{row.paymentMethod ? `Method: ${row.paymentMethod}` : row.status === 'paid' ? 'Recorded payment' : 'Scheduled installment'}</span>{row.reviewRequired ? <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Provisional · unverified{row.reviewReason ? ` — ${row.reviewReason}` : ''}</span> : null}</td><td className="whitespace-nowrap px-4 py-3">{formatDate(row.dueDate)}</td><td className="px-4 py-3 text-right tabular-nums">{formatFinanceCurrency(row.amountDue)}</td><td className="px-4 py-3 text-right tabular-nums">{formatFinanceCurrency(row.credited)}</td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatFinanceCurrency(row.remaining)}</td><td className="px-5 py-3"><Status value={row.status} warning={row.reviewRequired} /></td><td className="px-5 py-3 text-right">{row.reviewRequired ? <span className="text-xs text-[color:var(--portal-muted)]">Review first</span> : <div className="flex flex-col items-end">{paymentChoices.some((choice) => choice.installmentId === row.installmentId) ? <button type="button" onClick={() => openLogPayment(bookingId, row.installmentId)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">Log payment</button> : null}{canReschedule(row) ? <button type="button" onClick={() => { const sourceRow = sourceScheduleById.get(row.installmentId); if (sourceRow?.updated_at) setEditing({ row, expectedUpdatedAt: sourceRow.updated_at }) }} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[color:var(--portal-muted)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Change due date</button> : null}</div>}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-[color:var(--portal-border)] lg:hidden">{rows.map((row) => <article key={row.installmentId} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-medium text-[color:var(--portal-text)]">{row.label}</h4><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Due {formatDate(row.dueDate)}</p></div><Status value={row.status} warning={row.reviewRequired} /></div><dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><div><dt className="text-[color:var(--portal-muted)]">Scheduled</dt><dd className="mt-0.5 tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.amountDue)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Credited</dt><dd className="mt-0.5 tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.credited)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Remaining</dt><dd className="mt-0.5 font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.remaining)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Method</dt><dd className="mt-0.5 text-[color:var(--portal-text)]">{row.paymentMethod || (row.status === 'paid' ? 'Recorded' : 'Scheduled')}</dd></div></dl>{row.reviewRequired ? <p className="text-xs text-amber-700 dark:text-amber-300">Provisional · unverified. {row.reviewReason || 'This installment needs reconciliation before it can be used to record a payment.'}</p> : <div className="flex flex-wrap gap-4">{paymentChoices.some((choice) => choice.installmentId === row.installmentId) ? <button type="button" onClick={() => openLogPayment(bookingId, row.installmentId)} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"><CurrencyCircleDollar size={16} weight="regular" /> Log payment</button> : null}{canReschedule(row) ? <button type="button" onClick={() => { const sourceRow = sourceScheduleById.get(row.installmentId); if (sourceRow?.updated_at) setEditing({ row, expectedUpdatedAt: sourceRow.updated_at }) }} className="inline-flex min-h-10 items-center text-sm font-semibold text-[color:var(--portal-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">Change due date</button> : null}</div>}</article>)}</div>
      </section>
    })}
    <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">Changing an installment amount requires a signed agreement amendment. Amount edits are unavailable until that source can be verified.</p>
    <LogInstallmentPaymentDialog open={paymentOpen} onClose={() => setPaymentOpen(false)} bookings={bookingOptions} schedules={scheduleOptions} initialBookingId={initialBookingId} initialInstallmentId={initialInstallmentId} actorEmail={actorEmail} onRecorded={onRefresh} />
    <RescheduleInstallmentDialog editing={editing} today={model.asOfDate} onClose={() => setEditing(null)} onSaved={onRefresh} />
  </div>
}

function MonthlyView({ model }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']> }) {
  return <div className="space-y-5">
    <section className={`${filterSurface} flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`}><div><h2 className="font-semibold text-[color:var(--portal-text)]">Rolling 12 months</h2><p className={muted}>Collected uses recorded event payments. Expected uses future saved installments. Projected combines those two figures only when both are verified.</p></div><p className="shrink-0 text-xs text-[color:var(--portal-muted)]">As of {formatDate(model.asOfDate)}</p></section>
    <MonthlyCollectionsBars rows={model.rolling12Months.map((row) => ({ key: row.month, label: formatMonth(row.month), collected: row.collected, expected: row.expected }))} title="Monthly actual and expected collections" />
    <details className={`${filterSurface} overflow-hidden p-0`} aria-label="Monthly revenue detail"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-[color:var(--portal-text)]">View all monthly totals</summary>
      <div className="hidden md:block"><table className="w-full text-left text-sm"><thead className="bg-[color:var(--portal-soft)] text-xs text-[color:var(--portal-muted)]"><tr><th className="px-5 py-3 font-medium">Month</th><th className="px-4 py-3 text-right font-medium">Collected</th><th className="px-4 py-3 text-right font-medium">Expected</th><th className="px-5 py-3 text-right font-medium">Projected</th></tr></thead><tbody className="divide-y divide-[color:var(--portal-border)]">{model.rolling12Months.map((row) => <tr key={row.month} className="text-[color:var(--portal-text)]"><th scope="row" className="px-5 py-3 font-medium">{formatMonth(row.month, true)}</th><td className="px-4 py-3 text-right tabular-nums">{formatFinanceCurrency(row.collected)}</td><td className="px-4 py-3 text-right tabular-nums">{formatFinanceCurrency(row.expected)}</td><td className="px-5 py-3 text-right font-semibold tabular-nums">{formatFinanceCurrency(row.projected)}</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-[color:var(--portal-border)] md:hidden">{model.rolling12Months.map((row) => <article key={row.month} className="p-4"><h3 className="font-semibold text-[color:var(--portal-text)]">{formatMonth(row.month, true)}</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[color:var(--portal-muted)]">Collected</dt><dd className="mt-1 tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.collected)}</dd></div><div><dt className="text-[color:var(--portal-muted)]">Expected</dt><dd className="mt-1 tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.expected)}</dd></div><div className="col-span-2 border-t border-[color:var(--portal-border)] pt-2"><dt className="text-[color:var(--portal-muted)]">Projected</dt><dd className="mt-1 font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.projected)}</dd></div></dl></article>)}</div>
    </details>
  </div>
}

export function ReceivablesView({ model, onOpenSchedule }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']>; onOpenSchedule?: (bookingId: string) => void }) {
  const [search, setSearch] = useState('')
  const [client, setClient] = useState('')
  const [status, setStatus] = useState<LuxorRevenueRecordStatus | ''>('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [dueStart, setDueStart] = useState('')
  const [dueEnd, setDueEnd] = useState('')
  const [minimum, setMinimum] = useState('')
  const [maximum, setMaximum] = useState('')

  const rows = useMemo(() => filterLuxorRevenueReceivables(model.receivables, {
    search, client, status, eventStartDate: eventStart || null, eventEndDate: eventEnd || null,
    dueStartDate: dueStart || null, dueEndDate: dueEnd || null,
    minimumOutstanding: minimum === '' ? null : Number(minimum), maximumOutstanding: maximum === '' ? null : Number(maximum),
  }), [model.receivables, search, client, status, eventStart, eventEnd, dueStart, dueEnd, minimum, maximum])

  return <div className="space-y-5">
    <section className={filterSurface}>
      <PortalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search clients, bookings, or references"
        resultLabel={`${rows.length} ${rows.length === 1 ? 'booking' : 'bookings'}`}
        activeFilters={[
          ...(client ? [{ id: 'client', label: `Client: ${client}`, onRemove: () => setClient('') }] : []),
          ...(status ? [{ id: 'status', label: recordStatuses.find((item) => item.value === status)?.label || status, onRemove: () => setStatus('') }] : []),
          ...(eventStart ? [{ id: 'event-start', label: `Event from ${formatDate(eventStart)}`, onRemove: () => setEventStart('') }] : []),
          ...(eventEnd ? [{ id: 'event-end', label: `Event through ${formatDate(eventEnd)}`, onRemove: () => setEventEnd('') }] : []),
          ...(dueStart ? [{ id: 'due-start', label: `Due from ${formatDate(dueStart)}`, onRemove: () => setDueStart('') }] : []),
          ...(dueEnd ? [{ id: 'due-end', label: `Due through ${formatDate(dueEnd)}`, onRemove: () => setDueEnd('') }] : []),
          ...(minimum !== '' ? [{ id: 'minimum', label: `Minimum ${formatFinanceCurrency(Number(minimum))}`, onRemove: () => setMinimum('') }] : []),
          ...(maximum !== '' ? [{ id: 'maximum', label: `Maximum ${formatFinanceCurrency(Number(maximum))}`, onRemove: () => setMaximum('') }] : []),
        ]}
        onClearFilters={() => { setClient(''); setStatus(''); setEventStart(''); setEventEnd(''); setDueStart(''); setDueEnd(''); setMinimum(''); setMaximum('') }}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Client"><input className={`${inputClass} mt-1`} value={client} onChange={(event) => setClient(event.target.value)} placeholder="Filter by client" /></Field>
          <Field label="Status"><PortalSelect aria-label="Receivable status" className="mt-1" value={status} onChange={(value) => setStatus(value as LuxorRevenueRecordStatus | '')} options={recordStatuses} /></Field>
          <Field label="Event from"><div className="mt-1"><PortalDatePicker value={eventStart} onChange={setEventStart} timeZone="America/Chicago" placeholder="Any date" /></div></Field>
          <Field label="Event through"><div className="mt-1"><PortalDatePicker value={eventEnd} onChange={setEventEnd} timeZone="America/Chicago" placeholder="Any date" /></div></Field>
          <Field label="Next payment due from"><div className="mt-1"><PortalDatePicker value={dueStart} onChange={setDueStart} timeZone="America/Chicago" placeholder="Any date" /></div></Field>
          <Field label="Next payment due through"><div className="mt-1"><PortalDatePicker value={dueEnd} onChange={setDueEnd} timeZone="America/Chicago" placeholder="Any date" /></div></Field>
          <Field label="Minimum remaining balance"><input className={`${inputClass} mt-1 tabular-nums`} type="number" min="0" step="0.01" inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} placeholder="$0" /></Field>
          <Field label="Maximum remaining balance"><input className={`${inputClass} mt-1 tabular-nums`} type="number" min="0" step="0.01" inputMode="decimal" value={maximum} onChange={(event) => setMaximum(event.target.value)} placeholder="No maximum" /></Field>
        </div>
      </PortalFilterBar>
    </section>
    <FinanceReviewNotice issues={model.issues} />
    {!rows.length ? <FinanceEmptyState title="No receivables match" detail="Adjust the filters or review the saved contracts and payment schedules." /> : <div className="grid gap-3 xl:grid-cols-2">{rows.map((row) => <article key={row.bookingId} className={filterSurface}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="break-words font-semibold text-[color:var(--portal-text)]">{row.clientName}</h3><p className={muted}>{[row.eventType, row.eventDate ? `Event ${formatDate(row.eventDate)}` : null].filter(Boolean).join(' · ') || 'Event details unavailable'}</p></div><Status value={row.status} warning={row.status === 'needs_review'} /></div>
      {row.reviewReason ? <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Why review is needed: {row.reviewReason}</p> : null}
      {row.status === 'needs_review' ? <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Values below are provisional and unverified.</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-[color:var(--portal-border)] py-3 sm:grid-cols-3"><div><dt className="text-xs text-[color:var(--portal-muted)]">Remaining balance</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.remainingBalance)}</dd></div><div><dt className="text-xs text-[color:var(--portal-muted)]">Paid</dt><dd className="mt-1 font-medium tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.paid)}</dd></div><div><dt className="text-xs text-[color:var(--portal-muted)]">Next payment</dt><dd className="mt-1 font-medium tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.nextPaymentAmount)}</dd><dd className="text-xs text-[color:var(--portal-muted)]">{formatDate(row.nextPaymentDue)}</dd></div></dl>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {onOpenSchedule ? <button type="button" onClick={() => onOpenSchedule(row.bookingId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c]/15 px-3 py-1.5 text-xs font-semibold text-[#9a6d26] hover:bg-[#caa24c]/25 dark:text-[#e6c77f]"><CalendarBlank size={14} weight="regular" /> View payment schedule</button> : <Link href={`/portal/finances?view=receivables&bookingId=${encodeURIComponent(row.bookingId)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c]/15 px-3 py-1.5 text-xs font-semibold text-[#9a6d26] hover:bg-[#caa24c]/25 dark:text-[#e6c77f]"><CalendarBlank size={14} weight="regular" /> View payment schedule</Link>}
        {row.inquiryId ? <Link href={`/portal/leads/${encodeURIComponent(row.inquiryId)}`} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">Open lead <ArrowUpRight aria-hidden="true" size={14} weight="regular" /></Link> : null}
      </div>
    </article>)}</div>}
  </div>
}

function historyDateSource(value: LuxorRevenueHistoryRow['dateSource']) {
  const labels: Record<LuxorRevenueHistoryRow['dateSource'], string> = {
    received_date: 'Received date', paid_at: 'Paid timestamp', created_at: 'Record created', completed_at: 'Refund completed', requested_at: 'Refund requested', unavailable: 'Date unavailable',
  }
  return labels[value]
}

export function PaymentHistoryDetails({ row, onClose }: { row: LuxorRevenueHistoryRow | null; onClose: () => void }) {
  if (!row) return null
  return <PortalModal isOpen={Boolean(row)} onClose={onClose} title="Payment record" description="Saved payment and refund references for this transaction." maxWidth="max-w-2xl" animateClose>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-[color:var(--portal-text)]">{row.clientName}</p><p className={muted}>{row.eventType || 'Event type unavailable'}</p></div><Status value={row.status} warning={row.status === 'needs_review'} /></div>
      <dl className="grid gap-3 rounded-xl border border-[color:var(--portal-border)] p-4 sm:grid-cols-2">
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Amount</dt><dd className="mt-1 font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.signedAmount)}</dd></div>
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Recorded date</dt><dd className="mt-1 text-sm text-[color:var(--portal-text)]">{formatDate(row.date)}<span className="ml-1 text-xs text-[color:var(--portal-muted)]">({historyDateSource(row.dateSource)})</span></dd></div>
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Payment method</dt><dd className="mt-1 text-sm text-[color:var(--portal-text)]">{row.paymentMethod || 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Payment type</dt><dd className="mt-1 text-sm capitalize text-[color:var(--portal-text)]">{statusLabel(row.paymentType)}</dd></div>
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Revenue treatment</dt><dd className="mt-1 text-sm capitalize text-[color:var(--portal-text)]">{statusLabel(row.treatment)}</dd></div>
        <div><dt className="text-xs text-[color:var(--portal-muted)]">Effect on event revenue</dt><dd className="mt-1 text-sm tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.revenueEffect)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-[color:var(--portal-muted)]">Transaction reference</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.transactionReference}</dd></div>
        {row.processorReference ? <div className="sm:col-span-2"><dt className="text-xs text-[color:var(--portal-muted)]">Processor reference</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.processorReference}</dd></div> : null}
        {row.processorRefundId ? <div className="sm:col-span-2"><dt className="text-xs text-[color:var(--portal-muted)]">Processor refund ID</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.processorRefundId}</dd></div> : null}
        {row.sourcePaymentId ? <div className="sm:col-span-2"><dt className="text-xs text-[color:var(--portal-muted)]">Source payment ID</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.sourcePaymentId}</dd></div> : null}
        {row.bookingId ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Booking ID</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.bookingId}</dd></div> : null}
        {row.invoiceId ? <div><dt className="text-xs text-[color:var(--portal-muted)]">Invoice ID</dt><dd className="mt-1 break-all text-sm text-[color:var(--portal-text)]">{row.invoiceId}</dd></div> : null}
        {row.notes ? <div className="sm:col-span-2"><dt className="text-xs text-[color:var(--portal-muted)]">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[color:var(--portal-text)]">{row.notes}</dd></div> : null}
      </dl>
      <div className="flex justify-end"><PortalButton onClick={onClose}>Close</PortalButton></div>
    </div>
  </PortalModal>
}

function PaymentHistoryView({ model }: { model: NonNullable<ReturnType<typeof useRevenueCollectionsModel>['model']> }) {
  const [search, setSearch] = useState('')
  const [client, setClient] = useState('')
  const [method, setMethod] = useState('')
  const [type, setType] = useState<LuxorRevenuePaymentType | ''>('')
  const [status, setStatus] = useState<LuxorRevenueHistoryFilters['status']>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedRow, setSelectedRow] = useState<LuxorRevenueHistoryRow | null>(null)

  const rows = useMemo(() => filterLuxorRevenueHistory(model.paymentHistory, {
    search, client, paymentMethod: method, paymentType: type, status, startDate: startDate || null, endDate: endDate || null,
  }).slice().sort((left, right) => (right.date || '').localeCompare(left.date || '') || left.transactionReference.localeCompare(right.transactionReference)), [model.paymentHistory, search, client, method, type, status, startDate, endDate])
  const methods = [...new Set(model.paymentHistory.map((row) => row.paymentMethod).filter((value): value is string => Boolean(value)))].sort()

  return <div className="space-y-5">
    <section className={`${filterSurface} space-y-4`}><div><h2 className="font-semibold text-[color:var(--portal-text)]">Recorded payments and refunds</h2><p className={muted}>Unapplied money and refundable security deposits stay separate from event revenue.</p></div>
      <div className="flex flex-col gap-3 lg:flex-row"><SearchField value={search} onChange={setSearch} /><Field label="Client"><input className={`${inputClass} mt-1`} value={client} onChange={(event) => setClient(event.target.value)} placeholder="Filter by client" /></Field><Field label="Method"><PortalSelect aria-label="Payment method filter" className="mt-1" value={method} onChange={setMethod} options={[{ value: '', label: 'All methods' }, ...methods.map((value) => ({ value, label: value }))]} /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Payment type"><PortalSelect aria-label="Payment type filter" className="mt-1" value={type} onChange={(value) => setType(value as LuxorRevenuePaymentType | '')} options={paymentTypeOptions} /></Field><Field label="Status"><PortalSelect aria-label="Payment status filter" className="mt-1" value={status || ''} onChange={(value) => setStatus(value as LuxorRevenueHistoryFilters['status'])} options={historyStatusOptions} /></Field><Field label="Date from"><div className="mt-1"><PortalDatePicker value={startDate} onChange={setStartDate} timeZone="America/Chicago" placeholder="Any date" /></div></Field><Field label="Date through"><div className="mt-1"><PortalDatePicker value={endDate} onChange={setEndDate} timeZone="America/Chicago" placeholder="Any date" /></div></Field></div>
    </section>
    <FinanceReviewNotice issues={model.issues} />
    {!rows.length ? <FinanceEmptyState title="No payment records match" detail="Adjust the filters or check the saved payment and refund history." /> : <section className={`${filterSurface} overflow-hidden p-0`}>
      <div className="hidden lg:block"><table className="w-full text-left text-sm"><thead className="bg-[color:var(--portal-soft)] text-xs text-[color:var(--portal-muted)]"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Type and method</th><th className="px-4 py-3 text-right font-medium">Amount</th><th className="px-4 py-3 font-medium">Treatment</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3"><span className="sr-only">Details</span></th></tr></thead><tbody className="divide-y divide-[color:var(--portal-border)]">{rows.map((row) => <tr key={row.id} className="text-[color:var(--portal-text)]"><td className="whitespace-nowrap px-5 py-3">{formatDate(row.date)}<span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{historyDateSource(row.dateSource)}</span></td><td className="px-4 py-3"><span className="font-medium">{row.clientName}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{row.eventType || 'Event unavailable'}</span></td><td className="px-4 py-3"><span className="capitalize">{statusLabel(row.paymentType)}</span><span className="mt-1 block text-xs text-[color:var(--portal-muted)]">{row.paymentMethod || 'Method unavailable'}</span></td><td className="px-4 py-3 text-right font-medium tabular-nums">{formatFinanceCurrency(row.signedAmount)}</td><td className="px-4 py-3 capitalize">{statusLabel(row.treatment)}</td><td className="px-4 py-3"><Status value={row.status} warning={row.status === 'needs_review'} /></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedRow(row)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">Details</button></td></tr>)}</tbody></table></div>
      <div className="divide-y divide-[color:var(--portal-border)] lg:hidden">{rows.map((row) => <article key={row.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-[color:var(--portal-text)]">{row.clientName}</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">{formatDate(row.date)} · {historyDateSource(row.dateSource)}</p></div><Status value={row.status} warning={row.status === 'needs_review'} /></div><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs capitalize text-[color:var(--portal-muted)]">{statusLabel(row.paymentType)}{row.paymentMethod ? ` · ${row.paymentMethod}` : ''}</p><p className="mt-1 font-semibold tabular-nums text-[color:var(--portal-text)]">{formatFinanceCurrency(row.signedAmount)}</p></div><button type="button" onClick={() => setSelectedRow(row)} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#9a712e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">Details <ArrowUpRight aria-hidden="true" size={14} weight="regular" /></button></div></article>)}</div>
    </section>}
    <PaymentHistoryDetails row={selectedRow} onClose={() => setSelectedRow(null)} />
  </div>
}

export function RevenueCollectionsView({ view, actorEmail, embedded = false, active = true }: { view: RevenueView; actorEmail: string | null; embedded?: boolean; active?: boolean }) {
  const monthlyAnchorHandled = useRef(false)
  const [profit, setProfit] = useState<ProfitSnapshot | null>(null)
  const [profitError, setProfitError] = useState(false)
  const [profitRevision, setProfitRevision] = useState(0)
  useEffect(() => {
    if (view !== 'revenue') return
    const controller = new AbortController()
    fetch('/api/portal/event-profitability', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Unavailable')
      const result = await response.json() as ProfitSnapshot
      if (!Array.isArray(result.events) || !Array.isArray(result.issues)) throw new Error('Unavailable')
      if (!controller.signal.aborted) { setProfit(result); setProfitError(false) }
    }).catch(() => { if (!controller.signal.aborted) { setProfit(null); setProfitError(true) } })
    return () => controller.abort()
  }, [view, profitRevision])
  const [preset, setPreset] = useState<NonNullable<LuxorRevenueCollectionsOptions['preset']>>('this_month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const options = { preset, startDate, endDate }
  const { model, loading, error, refresh, scheduleRows } = useRevenueCollectionsModel(options)
  useFinanceLedgerRealtime(active, () => { void refresh(); setProfitRevision((value) => value + 1) })
  const wasActive = useRef(active)
  useEffect(() => {
    const shouldRefresh = active && !wasActive.current && model && !loading
    wasActive.current = active
    if (shouldRefresh) {
      const timer = window.setTimeout(() => { void refresh(); setProfitRevision((value) => value + 1) }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [active, model, loading, refresh])
  const periodFilter = <RevenuePeriodFilter preset={preset} setPreset={setPreset} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate} />
  useEffect(() => {
    if (embedded && view === 'revenue' && model && !monthlyAnchorHandled.current && window.location.hash === '#monthly-collections') {
      monthlyAnchorHandled.current = true
      requestAnimationFrame(() => document.getElementById('monthly-collections')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }))
    }
  }, [embedded, view, model])

  const content = <main className={embedded ? "space-y-5" : "space-y-5 p-4 sm:p-6"} aria-busy={loading}>
      <LoadState loading={loading} error={error} hasModel={Boolean(model)} />
      {!error && model ? <>
        {view === 'revenue' ? <RevenueDashboard model={model} onPeriodChange={periodFilter} profit={profit} profitError={profitError} /> : null}
        {view === 'schedules' ? <ScheduleView model={model} scheduleRows={scheduleRows} actorEmail={actorEmail} onRefresh={() => { void refresh() }} /> : null}
        {view === 'monthly' ? <MonthlyView model={model} /> : null}
        {view === 'receivables' ? <ReceivablesView model={model} /> : null}
        {view === 'history' ? <PaymentHistoryView model={model} /> : null}
      </> : null}
    </main>
  return embedded ? content : <RevenueCollectionsShell view={view}>{content}</RevenueCollectionsShell>
}
