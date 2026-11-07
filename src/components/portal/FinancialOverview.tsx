'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  CalendarBlank,
  CalendarDots,
  CreditCard,
  CurrencyCircleDollar,
  TrendUp,
  Wallet,
} from '@phosphor-icons/react'
import { PortalSelect, PortalSkeleton, PortalStatusBadge } from '@/components/portal/PortalUI'
import {
  getLuxorCategoryShares,
  getLuxorOverviewChart,
  getLuxorOverviewPeriod,
  getLuxorPaymentCalendarDateKey,
  type getLuxorFinanceOverview,
  type getLuxorPaidExpenseBreakdown,
} from '@/lib/luxorFinanceReporting'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import { chicagoCalendarDate, installmentDisplayState, invoiceEventObligation } from '@/lib/luxorPaymentDashboardModel'

type Overview = ReturnType<typeof getLuxorFinanceOverview>
type Expenses = ReturnType<typeof getLuxorPaidExpenseBreakdown>
type Activity = { id: string; date: string; description: string; category: string; amount: number; type: string }

const currency = (amount: number) => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const card = 'min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-sm'
const muted = 'text-sm leading-relaxed text-[color:var(--portal-muted)]'

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'Date TBD'
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00.000Z`)
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed)
    : value
}

function billAmount(bill: LuxorBill) {
  if (bill.amount_state === 'variable') return 'Variable amount'
  if (bill.amount_state !== 'known' || bill.amount == null || !Number.isFinite(Number(bill.amount)) || Number(bill.amount) < 0) return 'Amount pending'
  return currency(Number(bill.amount))
}

function billReviewExplanation(bill: LuxorBill) {
  if (bill.extraction_status === 'ready') return 'Verified'
  if (bill.amount_state !== 'known' || bill.amount == null) return 'Needs review: bill amount not yet confirmed'
  if (!bill.due_date) return 'Needs review: due date not yet confirmed'
  return 'Needs review: verify extracted bill details'
}

function allocationReason(reason: string | null) {
  if (!reason) return null
  const messages: Record<string, string> = {
    earlier_unassigned_receipt: 'An earlier payment on this booking must be reconciled first.',
    booking_or_client_mismatch: 'The booking and client links on this receipt do not match.',
    invoice_linkage_or_master_ambiguous: 'The invoice and signed agreement links need verification.',
    schedule_missing_or_exceeds_contract: 'The saved payment schedule total does not match the signed agreement.',
    schedule_ambiguous: 'One or more installments are missing a due date or valid amount.',
    installment_balance_disagrees: 'An installment balance does not match its recorded payments.',
    explicit_partial_allocation: 'A saved partial payment allocation needs verification.',
    unreconciled_partial_installment: 'An earlier partial installment payment needs verification.',
    payment_or_refund_classification: 'The payment or refund category needs verification.',
    invoice_overpaid: 'Recorded payments exceed the invoice total.',
    allocation_payment_link_disagrees: 'A saved installment allocation does not match its payment record.',
    saved_remainder_disagrees: 'The unapplied payment remainder needs verification.',
  }
  return messages[reason] || 'The saved payment allocation details need owner verification.'
}

function Amount({ value, fallback = 0 }: { value: number | null | undefined; fallback?: number | null }) {
  const resolved = value !== null && value !== undefined && Number.isFinite(value) ? value : fallback
  return <span className="tabular-nums">{resolved === null || resolved === undefined ? '$0.00' : currency(resolved)}</span>
}

function CategoryChart({ values, label }: { values: Array<{ category: string; amount: number }>; label: string }) {
  const positiveValues = values.filter((row) => row.amount > 0)
  const refunds = values.filter((row) => row.amount < 0)
  const data = getLuxorCategoryShares(positiveValues)
  const netTotal = values.reduce((sum, row) => sum + row.amount, 0)
  const colors = ['#a87827', '#c49650', '#dbb47b', '#e8cba2', '#b9a380', '#83725e', '#cfb18b', '#e5d7c2', '#8d7f6c', '#d0c0a8']
  const stops = data.rows
    .map((row, index) => {
      const start = data.rows.slice(0, index).reduce((sum, item) => sum + item.percent, 0)
      return `${colors[index % colors.length]} ${start}% ${start + row.percent}%`
    })
    .join(', ')
  if (!data.total) return <p className={`${muted} mt-3`}>{refunds.length ? `Refunds exceed ${label.toLowerCase()} paid in this period.` : `No ${label.toLowerCase()} recorded for this period ($0.00).`}</p>
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      <div
        aria-hidden="true"
        className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      >
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--portal-bg)] text-center text-xs font-semibold text-[color:var(--portal-text)]">
          {currency(netTotal)}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {data.rows.map((row, index) => (
          <li key={row.category} className="flex items-start justify-between gap-3 text-xs text-[color:var(--portal-text)]">
            <span>
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              {row.category}
            </span>
            <span className="shrink-0 tabular-nums">
              {currency(row.amount)} · {Math.round(row.percent)}%
            </span>
          </li>
        ))}
        {refunds.length ? <li className="flex items-start justify-between gap-3 border-t border-[color:var(--portal-border)] pt-2 text-xs text-[color:var(--portal-muted)]"><span>Refunds and reversals</span><span className="shrink-0 tabular-nums">{currency(refunds.reduce((sum, row) => sum + row.amount, 0))}</span></li> : null}
      </ul>
    </div>
  )
}

export default function FinancialOverview({
  overview,
  expenses,
  bills,
  activity,
  openView,
  loading = false,
}: {
  overview?: Overview
  expenses?: Expenses
  bills?: LuxorBill[] | null
  activity?: Activity[]
  openView: (view: 'payments' | 'expenses' | 'reports') => void
  loading?: boolean
}) {
  const today = chicagoCalendarDate()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [grouping, setGrouping] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)

  const period = overview ? getLuxorOverviewPeriod(overview, month) : { actual: 0, expected: 0, projected: 0, percent: 0 }
  const chart = useMemo(() => (overview ? getLuxorOverviewChart(overview, year, grouping) : []), [overview, year, grouping])
  const max = Math.max(1, ...chart.map((item) => (item.actual || 0) + (item.expected || 0)))

  const upcoming = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1))
        const key = date.toISOString().slice(0, 7)
        return {
          label: date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
          value: overview?.expectedByMonth ? overview.expectedByMonth[key] || 0 : 0,
        }
      }),
    [overview?.expectedByMonth, today],
  )
  const upcomingMax = Math.max(1, ...upcoming.map((item) => item.value || 0))

  const unpaid = bills
    ?.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    .slice(0, 5)

  const monthName = new Date(Date.UTC(year, Number(monthText) - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const monthShort = new Date(Date.UTC(year, Number(monthText) - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const years = Array.from({ length: 11 }, (_, i) => String(Number(today.slice(0, 4)) - 5 + i))
  if (!years.includes(yearText)) years.push(yearText)

  // Real calculated metrics for the 4 KPI cards
  const periodRevenue = period.actual ?? 0
  const allTimeRevenue = useMemo(
    () => (overview ? overview.reportingRows.eventPaymentRows.reduce((sum, row) => sum + row.amount, 0) : 0),
    [overview],
  )
  const periodExpenses = expenses?.available ? expenses.byMonth?.[month] ?? 0 : 0
  const allTimeExpenses = expenses?.available && expenses.total !== null ? expenses.total : 0
  const periodNetProfit = periodRevenue - periodExpenses
  const allTimeNetProfit = allTimeRevenue - allTimeExpenses
  const outstandingBalance = useMemo(
    () => (overview ? overview.reportingRows.acceptedInvoiceRows.reduce((sum, row) => sum + row.outstanding, 0) : 0),
    [overview],
  )
  const activeContractCount = overview?.reportingRows.acceptedInvoiceRows.length ?? 0

  // Build Active Client Payment Plans and Pending Schedules from overview.reportingRows
  const clientPaymentPlans = useMemo(() => {
    if (!overview) return { active: [], pending: [] }
    const bookingById = new Map(overview.reportingRows.bookings.map((b) => [b.id, b]))
    const invoiceById = new Map(overview.reportingRows.invoices.map((i) => [i.id, i]))
    const activeBookingIds = new Set<string>()

    const active = overview.reportingRows.acceptedInvoiceRows.map((row) => {
      const bookingId = row.invoice.booking_id || ''
      activeBookingIds.add(bookingId)
      const booking = bookingById.get(bookingId)
      const schedule = overview.reportingRows.scheduleRows
        .filter((s) => s.bookingId === bookingId)
        .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.installment.installment_order - b.installment.installment_order)
      const unpaidItems = schedule.filter((s) => s.remaining > 0.005)
      const nextItem = unpaidItems[0] || null
      const paidCount = schedule.filter((s) => s.isPaid).length
      const hasOverdue = schedule.some((s) => s.isOverdue && s.remaining > 0.005)
      const reviewItem = schedule.find((s) => !s.scheduleReconciled || s.reviewReason)
      const percent = row.eventObligation > 0 ? Math.min(100, Math.max(0, Math.round((row.received / row.eventObligation) * 100))) : 100
      return {
        bookingId,
        inquiryId: booking?.inquiry_id || row.invoice.inquiry_id || null,
        clientName: booking?.client_name || row.invoice.client_name || 'Client',
        eventType: booking?.event_type || row.invoice.event_type || 'Event',
        eventDate: booking?.event_date ? getLuxorPaymentCalendarDateKey({ received_date: booking.event_date, paid_at: null }) : null,
        totalContract: row.eventObligation,
        paidAmount: row.received,
        remainingBalance: row.outstanding,
        percent,
        paidCount,
        totalInstallments: schedule.length,
        nextDueDate: nextItem?.dueDate || null,
        nextAmount: nextItem?.remaining ?? null,
        nextLabel: nextItem?.installment.label || null,
        status: reviewItem
          ? ('needs_review' as const)
          : row.outstanding <= 0.005
            ? ('paid' as const)
            : hasOverdue
              ? ('overdue' as const)
              : row.received > 0
                ? ('partially_paid' as const)
                : ('upcoming' as const),
        reviewReason: reviewItem?.reviewReason || null,
        schedule,
      }
    })

    // Also find bookings with saved installments that are awaiting contract signature / initial deposit
    const pendingBookingGroups = new Map<string, typeof overview.reportingRows.installments>()
    for (const inst of overview.reportingRows.installments) {
      if (inst.status === 'void' || inst.metadata?.payment_bucket === 'security_deposit') continue
      if (activeBookingIds.has(inst.booking_id)) continue
      pendingBookingGroups.set(inst.booking_id, [...(pendingBookingGroups.get(inst.booking_id) || []), inst])
    }

    const pending = [...pendingBookingGroups.entries()].flatMap(([bookingId, rawInstallments]) => {
      const booking = bookingById.get(bookingId)
      if (!booking || booking.status === 'cancelled') return []
      const masterInvoice = booking.invoice_id ? invoiceById.get(booking.invoice_id) : undefined
      const sorted = [...rawInstallments].sort((a, b) => a.installment_order - b.installment_order)
      const totalScheduled = sorted.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0)
      const contractTotal = masterInvoice ? invoiceEventObligation(masterInvoice) : Number(booking.contract_total || totalScheduled)
      const firstInstallment = sorted[0]
      const states = sorted.map((item) => {
        const state = installmentDisplayState(item, overview.reportingRows.payments)
        const dueDate = getLuxorPaymentCalendarDateKey({ received_date: item.due_at, paid_at: null }) || null
        return {
          installment: item,
          bookingId,
          invoiceId: item.invoice_id || booking.invoice_id || '',
          amountDue: state.amountDue,
          credited: state.credited,
          remaining: Math.max(0, state.amountDue - state.credited),
          dueDate,
          status: state.status,
          isPaid: state.isPaid,
          isPartial: state.isPartial,
          isOverdue: state.isOverdue,
          overdueDays: state.overdueDays,
          scheduleReconciled: true,
          reviewReason: null,
        }
      })
      const pendingReason =
        booking.contract_status !== 'signed'
          ? `Awaiting client contract signature (${booking.contract_status || 'not signed'}) and initial booking deposit`
          : 'Awaiting initial booking deposit confirmation'
      return [
        {
          bookingId,
          inquiryId: booking.inquiry_id || masterInvoice?.inquiry_id || null,
          clientName: booking.client_name || masterInvoice?.client_name || 'Client',
          eventType: booking.event_type || masterInvoice?.event_type || 'Event',
          eventDate: booking.event_date ? getLuxorPaymentCalendarDateKey({ received_date: booking.event_date, paid_at: null }) : null,
          totalContract: contractTotal,
          paidAmount: 0,
          remainingBalance: contractTotal,
          totalInstallments: sorted.length,
          firstAmount: firstInstallment ? Number(firstInstallment.amount) : null,
          firstDueDate: firstInstallment ? getLuxorPaymentCalendarDateKey({ received_date: firstInstallment.due_at, paid_at: null }) : null,
          pendingReason,
          schedule: states,
        },
      ]
    })

    return { active, pending }
  }, [overview])

  const revenueMonthCategories = useMemo(() => {
    if (!overview?.categoryByMonth) return []
    return Object.entries(overview.categoryByMonth[month] || {}).map(([category, amount]) => ({ category, amount }))
  }, [overview?.categoryByMonth, month])

  const allTimeRevenueCategories = useMemo(() => {
    if (!overview?.categoryByMonth) return []
    const totals = new Map<string, number>()
    for (const monthObj of Object.values(overview.categoryByMonth)) {
      for (const [cat, amt] of Object.entries(monthObj)) {
        totals.set(cat, (totals.get(cat) || 0) + amt)
      }
    }
    return [...totals.entries()].map(([category, amount]) => ({ category, amount }))
  }, [overview?.categoryByMonth])

  const expenseMonthCategories = useMemo(() => {
    if (!expenses?.available) return []
    return expenses.categoriesByMonth?.[month] || []
  }, [expenses, month])

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto pb-8 pr-1 portal-scrollbar">
      {/* Top Header Controls (Always visible, does not fetch) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[color:var(--portal-text)]">Financial Overview</h2>
          <p className={muted}>Revenue, expenses, active client payment plans, and upcoming obligations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PortalSelect
            aria-label="Overview month"
            value={monthText}
            onChange={(value) => setMonth(`${yearText}-${value}`)}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1).padStart(2, '0'),
              label: new Date(Date.UTC(2020, i, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
            }))}
          />
          <PortalSelect
            aria-label="Overview year"
            value={yearText}
            onChange={(value) => setMonth(`${value}-${monthText}`)}
            options={years.sort().map((value) => ({ value, label: value }))}
          />
          <Link
            href="/portal/finances/schedules"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
          >
            <CalendarBlank size={15} weight="regular" className="text-[#a8792f] dark:text-[#e6c77f]" />
            Payment schedules
          </Link>
          <Link
            href="/portal/finances/revenue"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
          >
            Revenue &amp; collections
          </Link>
        </div>
      </div>

      {/* Warnings & Notices (Only shown if a genuine discrepancy exists) */}
      {!loading && overview && overview.issues.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-[color:var(--portal-text)]">
          <p className="font-semibold">Records requiring verification</p>
          <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{overview.issues.join(' · ')}</p>
        </div>
      )}
      {!loading && overview && overview.allocationExceptions.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4" aria-labelledby="allocation-review-title">
          <h3 id="allocation-review-title" className="font-semibold text-[color:var(--portal-text)]">
            Payment allocations to review
          </h3>
          <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
            These receipts remain recorded. Review the allocation details below without recording a duplicate payment.
          </p>
          <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
            {overview.allocationExceptions.map((item) => (
              <li key={item.paymentId} className="py-3 text-sm text-[color:var(--portal-text)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Payment {item.paymentId.slice(0, 8)} ·{' '}
                    {item.status === 'pending' ? 'Allocation pending' : item.status === 'unapplied' ? 'Amount unapplied' : 'Needs review'}
                  </span>
                  {item.inquiryId ? (
                    <Link className="font-semibold text-[#a8792f] dark:text-[#e6c77f]" href={`/portal/leads/${encodeURIComponent(item.inquiryId)}`}>
                      Open lead
                    </Link>
                  ) : (
                    <button type="button" onClick={() => openView('payments')} className="font-semibold text-[#a8792f] dark:text-[#e6c77f]">
                      Open payment ledger
                    </button>
                  )}
                </div>
                {item.unappliedAmount !== null && (
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    {item.status === 'review' ? 'Amount reported for review' : 'Unapplied amount'}: {currency(item.unappliedAmount)}
                  </p>
                )}
                {item.amountNeedsReview && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Unapplied amount needs reconciliation.</p>}
                {item.reason && <p className="mt-1 text-xs text-[color:var(--portal-muted)]">{allocationReason(item.reason)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4 KPI Cards: Exact matching containers, real dollar amounts, zero "Unavailable" */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            title: 'Total revenue',
            value: periodRevenue,
            detail: `${monthName} · ${currency(allTimeRevenue)} collected all time`,
            icon: CurrencyCircleDollar,
          },
          {
            title: 'Total expenses',
            value: periodExpenses,
            detail: `${monthName} · ${currency(allTimeExpenses)} paid all time`,
            icon: CreditCard,
          },
          {
            title: 'Net profit',
            value: periodNetProfit,
            detail: `${monthName} net cash flow · ${currency(allTimeNetProfit)} all time`,
            icon: TrendUp,
          },
          {
            title: 'Outstanding balance',
            value: outstandingBalance,
            detail: `${activeContractCount} active signed ${activeContractCount === 1 ? 'agreement' : 'agreements'} · ${currency(period.expected ?? 0)} due in ${monthShort}`,
            icon: Wallet,
          },
        ].map(({ title, value, detail, icon: Icon }) => (
          <section key={title} className={card}>
            <Icon aria-hidden="true" className="mb-3 text-[#a8792f] dark:text-[#e6c77f]" size={20} weight="regular" />
            <h3 className={muted}>{title}</h3>
            <div className="mt-1 flex min-h-[32px] items-center">
              {loading ? (
                <PortalSkeleton className="my-0.5 h-7 w-28 rounded-md" />
              ) : (
                <p className="break-words text-xl font-semibold text-[color:var(--portal-text)] sm:text-2xl">
                  <Amount value={value} />
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-[color:var(--portal-muted)]">{detail}</p>
          </section>
        ))}
      </div>

      {/* Active Client Payment Plans Section — Direct jump to any client's payment schedule or lead profile */}
      <section className={card} aria-labelledby="active-client-schedules-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="active-client-schedules-heading" className="text-base font-semibold text-[color:var(--portal-text)]">
              Active Client Payment Schedules
            </h3>
            <p className={muted}>
              Clients actively paying toward confirmed events and upcoming scheduled installments.
            </p>
          </div>
          <Link
            href="/portal/finances/schedules"
            className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
          >
            All payment schedules <ArrowUpRight aria-hidden="true" size={15} weight="regular" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, idx) => (
              <div key={idx} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <PortalSkeleton className="h-4 w-36 rounded" />
                    <PortalSkeleton className="h-3 w-48 rounded" />
                  </div>
                  <PortalSkeleton className="h-6 w-24 rounded-full" />
                </div>
                <PortalSkeleton className="h-2 w-full rounded-full" />
                <div className="grid grid-cols-3 gap-2">
                  <PortalSkeleton className="h-9 w-full rounded" />
                  <PortalSkeleton className="h-9 w-full rounded" />
                  <PortalSkeleton className="h-9 w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : clientPaymentPlans.active.length === 0 && clientPaymentPlans.pending.length === 0 ? (
          <p className={`${muted} mt-3`}>No active client payment schedules recorded yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {clientPaymentPlans.active.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {clientPaymentPlans.active.map((plan) => (
                  <article
                    key={plan.bookingId}
                    className="flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)]/60 p-4 transition-colors hover:border-[#caa24c]/40"
                  >
                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-base font-semibold text-[color:var(--portal-text)]">{plan.clientName}</h4>
                          <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                            {plan.eventType}
                            {plan.eventDate ? ` · Event ${formatShortDate(plan.eventDate)}` : ''}
                          </p>
                        </div>
                        <PortalStatusBadge
                          status={plan.status.replaceAll('_', ' ')}
                          tone={
                            plan.status === 'paid'
                              ? 'green'
                              : plan.status === 'overdue'
                                ? 'red'
                                : plan.status === 'partially_paid'
                                  ? 'gold'
                                  : 'blue'
                          }
                          warning={plan.status === 'needs_review'}
                        />
                      </div>

                      {plan.reviewReason ? (
                        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                          Why review is needed: {plan.reviewReason}
                        </p>
                      ) : null}

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-[color:var(--portal-muted)]">
                          <span>
                            Paid <strong className="font-semibold tabular-nums text-[color:var(--portal-text)]">{currency(plan.paidAmount)}</strong> of{' '}
                            <span className="tabular-nums">{currency(plan.totalContract)}</span>
                          </span>
                          <span className="font-semibold tabular-nums text-[color:var(--portal-text)]">
                            {plan.percent}% · {plan.paidCount}/{plan.totalInstallments} paid
                          </span>
                        </div>
                        <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--portal-soft)]">
                          <div
                            className="h-full rounded-full bg-[#b58b3e] transition-all"
                            style={{ width: `${Math.max(4, plan.percent)}%` }}
                          />
                        </div>
                      </div>

                      {/* Key figures */}
                      <dl className="mt-3 grid grid-cols-3 gap-2 border-y border-[color:var(--portal-border)] py-2.5 text-xs">
                        <div>
                          <dt className="text-[color:var(--portal-muted)]">Remaining</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-[color:var(--portal-text)]">
                            {currency(plan.remainingBalance)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[color:var(--portal-muted)]">Next payment</dt>
                          <dd className="mt-0.5 font-semibold tabular-nums text-[color:var(--portal-text)]">
                            {plan.nextAmount !== null ? currency(plan.nextAmount) : '$0.00'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[color:var(--portal-muted)]">Next due date</dt>
                          <dd className="mt-0.5 font-medium text-[color:var(--portal-text)]">
                            {plan.nextDueDate ? formatShortDate(plan.nextDueDate) : 'All paid'}
                          </dd>
                        </div>
                      </dl>

                      {/* Expandable inline schedule preview */}
                      {plan.schedule.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer py-1 font-medium text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">
                            Preview {plan.schedule.length} scheduled installments
                          </summary>
                          <ul className="mt-1.5 space-y-1.5 rounded-lg bg-[color:var(--portal-soft)]/60 p-2.5">
                            {plan.schedule.map((item) => (
                              <li key={item.installment.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[color:var(--portal-text)]">
                                  {item.installment.label} · {formatShortDate(item.dueDate)}
                                </span>
                                <span className="tabular-nums font-medium text-[color:var(--portal-text)]">
                                  {item.isPaid
                                    ? `${currency(item.amountDue)} (Paid${item.installment.payment_method ? ` · ${item.installment.payment_method}` : ''})`
                                    : `${currency(item.remaining)} due`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>

                    {/* Direct Actions */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Link
                        href={`/portal/finances/schedules?bookingId=${encodeURIComponent(plan.bookingId)}&client=${encodeURIComponent(plan.clientName)}`}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c]/15 px-3 py-1.5 text-xs font-semibold text-[#9a6d26] transition-colors hover:bg-[#caa24c]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
                      >
                        <CalendarBlank size={14} weight="regular" />
                        View payment schedule
                      </Link>
                      {plan.inquiryId ? (
                        <Link
                          href={`/portal/leads/${encodeURIComponent(plan.inquiryId)}`}
                          className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                        >
                          Open client lead <ArrowUpRight size={13} weight="regular" />
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Pending / Awaiting Contract Signature Schedules */}
            {clientPaymentPlans.pending.length > 0 && (
              <div className="border-t border-[color:var(--portal-border)] pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--portal-muted)]">
                  Drafted Schedules Awaiting Contract Signature ({clientPaymentPlans.pending.length})
                </h4>
                <div className="mt-2.5 grid gap-3 lg:grid-cols-2">
                  {clientPaymentPlans.pending.map((item) => (
                    <article
                      key={item.bookingId}
                      className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 p-3.5 text-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[color:var(--portal-text)]">{item.clientName}</p>
                          <p className="text-[color:var(--portal-muted)]">
                            {item.eventType}
                            {item.eventDate ? ` · Event ${formatShortDate(item.eventDate)}` : ''} · {currency(item.totalContract)} ({item.totalInstallments} installments)
                          </p>
                        </div>
                        <PortalStatusBadge status="Awaiting signature" tone="gold" />
                      </div>
                      <p className="mt-2 text-[color:var(--portal-muted)]">{item.pendingReason}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/portal/finances/schedules?bookingId=${encodeURIComponent(item.bookingId)}&client=${encodeURIComponent(item.clientName)}`}
                          className="font-semibold text-[#a8792f] hover:underline dark:text-[#e6c77f]"
                        >
                          View drafted schedule →
                        </Link>
                        {item.inquiryId ? (
                          <Link
                            href={`/portal/leads/${encodeURIComponent(item.inquiryId)}`}
                            className="font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                          >
                            Open client lead ↗
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Middle Row: Monthly Revenue & Collections + Collections Year Chart */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Monthly Revenue & Collections */}
        <section className={card}>
          <h3 className="text-base font-semibold text-[color:var(--portal-text)]">Monthly Revenue &amp; Collections</h3>
          <p className={muted}>{monthName}</p>
          <div className="mt-5 flex min-h-[36px] items-center">
            {loading ? (
              <PortalSkeleton className="my-1 h-9 w-36 rounded-md" />
            ) : (
              <p className="text-3xl font-semibold text-[color:var(--portal-text)]">
                <Amount value={period.projected} />
              </p>
            )}
          </div>
          <p className={muted}>Projected collections (collected + expected this month)</p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <div>
              <strong className="flex min-h-[22px] items-center text-[color:var(--portal-text)]">
                {loading ? <PortalSkeleton className="h-5 w-20 rounded" /> : <Amount value={period.actual} />}
              </strong>
              <span className={muted}>Collected</span>
            </div>
            <div>
              <strong className="flex min-h-[22px] items-center text-[color:var(--portal-text)]">
                {loading ? <PortalSkeleton className="h-5 w-20 rounded" /> : <Amount value={period.expected} />}
              </strong>
              <span className={muted}>Expected</span>
            </div>
            <div>
              <strong className="flex min-h-[22px] items-center tabular-nums text-[color:var(--portal-text)]">
                {loading ? <PortalSkeleton className="h-5 w-12 rounded" /> : `${period.percent ?? 0}%`}
              </strong>
              <span className={muted}>Collected</span>
            </div>
          </div>
          <Link
            href="/portal/finances/monthly"
            className="mt-4 inline-flex min-h-10 items-center font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
          >
            View monthly collections <span aria-hidden="true" className="ml-1">→</span>
          </Link>
        </section>

        {/* Collections · Year Chart */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-[color:var(--portal-text)]">Collections · {year}</h3>
            <PortalSelect
              aria-label="Chart period"
              value={grouping}
              onChange={(value) => setGrouping(value as typeof grouping)}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'annual', label: 'Annual' },
              ]}
            />
          </div>
          <p className="mt-2 text-xs text-[color:var(--portal-muted)]">Gold: collected · champagne: expected</p>
          <div className="mt-5 flex h-40 items-end gap-1 sm:gap-3">
            {loading
              ? Array.from({ length: 12 }, (_, idx) => {
                  const monthLabel = new Date(Date.UTC(year, idx, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
                  const barHeights = [40, 65, 50, 75, 45, 80, 95, 60, 35, 70, 55, 30]
                  return (
                    <div key={idx} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <div className="flex h-32 w-full items-end justify-center gap-0.5">
                        <PortalSkeleton className="w-2/5 max-w-8 rounded-t" style={{ height: `${barHeights[idx]}%` }} />
                        <PortalSkeleton className="w-2/5 max-w-8 rounded-t opacity-50" style={{ height: `${Math.round(barHeights[idx] * 0.6)}%` }} />
                      </div>
                      <span className="text-[10px] text-[color:var(--portal-muted)]">{monthLabel}</span>
                    </div>
                  )
                })
              : chart.map((item) => (
                  <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="flex h-32 w-full items-end justify-center gap-0.5"
                      title={`${item.label}: collected ${currency(item.actual ?? 0)}, expected ${currency(item.expected ?? 0)}`}
                    >
                      <div className="w-2/5 max-w-8 rounded-t bg-[#b58b3e]" style={{ height: `${Math.max(0, ((item.actual || 0) / max) * 100)}%` }} />
                      <div className="w-2/5 max-w-8 rounded-t bg-[#e6c99d]" style={{ height: `${Math.max(0, ((item.expected || 0) / max) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-[color:var(--portal-muted)]">{item.label}</span>
                  </div>
                ))}
          </div>
          {!loading && (
            <details className="mt-3 text-xs text-[color:var(--portal-muted)]">
              <summary className="cursor-pointer">View amounts</summary>
              <div className="mt-2 space-y-1">
                {chart.map((item) => (
                  <p key={item.label}>
                    {item.label}: collected <Amount value={item.actual} /> · expected <Amount value={item.expected} />
                  </p>
                ))}
              </div>
            </details>
          )}
        </section>
      </div>

      {/* Row 3: Revenue by category + Expense breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue by category */}
        <section className={card}>
          <h3 className="font-semibold text-[color:var(--portal-text)]">Revenue by category</h3>
          <p className={muted}>{monthName}</p>
          {loading ? (
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <PortalSkeleton className="h-28 w-28 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2.5">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <PortalSkeleton className="h-3.5 w-24 rounded" />
                    <PortalSkeleton className="h-3.5 w-16 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : revenueMonthCategories.length > 0 ? (
            <>
              <CategoryChart label="revenue" values={revenueMonthCategories} />
              <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Refundable security deposits are tracked separately from revenue.</p>
            </>
          ) : (
            <>
              <p className={`${muted} mt-3`}>No revenue receipts recorded in {monthName} ($0.00).</p>
              {allTimeRevenueCategories.length > 0 && (
                <div className="mt-3 border-t border-[color:var(--portal-border)] pt-3">
                  <p className="text-xs font-medium text-[color:var(--portal-muted)]">All-time collected revenue by category</p>
                  <CategoryChart label="all-time revenue" values={allTimeRevenueCategories} />
                </div>
              )}
            </>
          )}
          <button type="button" className="mt-4 text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('payments')}>
            Open payment ledger
          </button>
        </section>

        {/* Expense breakdown */}
        <section className={card}>
          <h3 className="font-semibold text-[color:var(--portal-text)]">Expense breakdown</h3>
          <p className={muted}>{monthName}</p>
          {loading ? (
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <PortalSkeleton className="h-28 w-28 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2.5">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <PortalSkeleton className="h-3.5 w-28 rounded" />
                    <PortalSkeleton className="h-3.5 w-14 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : expenseMonthCategories.length > 0 ? (
            <>
              <CategoryChart label="expenses" values={expenseMonthCategories} />
              <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Showing expense payments and refunds recorded in {monthName}.</p>
            </>
          ) : expenses?.available && expenses.categories.length > 0 ? (
            <>
              <p className={`${muted} mt-3`}>No paid expenses recorded in {monthName} ($0.00).</p>
              <div className="mt-3 border-t border-[color:var(--portal-border)] pt-3">
                <p className="text-xs font-medium text-[color:var(--portal-muted)]">All-time paid expenses</p>
                <CategoryChart label="paid expenses" values={expenses.categories} />
              </div>
            </>
          ) : (
            <p className={`${muted} mt-3`}>No paid expenses recorded for {monthName} ($0.00).</p>
          )}
          <button type="button" className="mt-4 text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('expenses')}>
            Open expense ledger
          </button>
        </section>
      </div>

      {/* Bottom Row: Upcoming collections, Upcoming bills, Recent financial activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Upcoming collections */}
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming collections</h3>
            <Link href="/portal/finances/schedules" className="text-xs font-semibold text-[#a8792f] dark:text-[#e6c77f]">
              Schedules →
            </Link>
          </div>
          {loading ? (
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <PortalSkeleton className="h-3.5 w-14 rounded" />
                    <PortalSkeleton className="h-3.5 w-16 rounded" />
                  </div>
                  <PortalSkeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {upcoming.map((item) => (
                <div key={item.label}>
                  <p className="flex justify-between gap-3 text-sm text-[color:var(--portal-text)]">
                    <span>{item.label}</span>
                    <Amount value={item.value} />
                  </p>
                  <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-soft)]">
                    <div className="h-full rounded-full bg-[#c59a4d]" style={{ width: `${((item.value || 0) / upcomingMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming bills */}
        <section className={card}>
          <div className="flex justify-between gap-2">
            <h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming bills</h3>
            <Link className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" href="/portal/operations?tab=bills">
              View all
            </Link>
          </div>
          {loading ? (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="space-y-1.5 py-3">
                  <div className="flex justify-between gap-2">
                    <PortalSkeleton className="h-3.5 w-28 rounded" />
                    <PortalSkeleton className="h-3.5 w-16 rounded" />
                  </div>
                  <PortalSkeleton className="h-2.5 w-44 rounded" />
                </li>
              ))}
            </ul>
          ) : unpaid === undefined ? (
            <p className={`${muted} mt-3`}>Bills could not be loaded. Refresh to retry.</p>
          ) : unpaid.length === 0 ? (
            <p className={`${muted} mt-3`}>No unpaid bills recorded.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {unpaid.map((bill) => (
                <li key={bill.id} className="py-3 text-sm">
                  <Link
                    href={`/portal/operations?tab=bills&bill=${encodeURIComponent(bill.id)}`}
                    className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#a8792f]"
                  >
                    <div className="flex justify-between gap-2 text-[color:var(--portal-text)]">
                      <span>{bill.service || bill.provider || 'Bill'}</span>
                      <span className="tabular-nums">{billAmount(bill)}</span>
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                      {bill.provider || 'Vendor not set'} · {bill.due_date ? `Due ${formatShortDate(bill.due_date)}` : 'Due date pending'} ·{' '}
                      {billReviewExplanation(bill)}
                    </p>
                  </Link>
                  {bill.vendor_id && (
                    <Link
                      href={`/portal/operations?tab=bills&company=${encodeURIComponent(bill.vendor_id)}`}
                      className="mt-1 inline-block text-xs font-semibold text-[#a8792f] dark:text-[#e6c77f]"
                    >
                      Company history
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent financial activity */}
        <section className={card}>
          <div className="flex justify-between gap-2">
            <h3 className="font-semibold text-[color:var(--portal-text)]">Recent financial activity</h3>
            <button type="button" className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" onClick={() => openView('payments')}>
              View payments
            </button>
          </div>
          {loading ? (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="space-y-1.5 py-3">
                  <div className="flex justify-between gap-2">
                    <PortalSkeleton className="h-3.5 w-36 rounded" />
                    <PortalSkeleton className="h-3.5 w-16 rounded" />
                  </div>
                  <PortalSkeleton className="h-2.5 w-32 rounded" />
                </li>
              ))}
            </ul>
          ) : activity && activity.length ? (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {activity.slice(0, 5).map((item) => (
                <li key={item.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-2 text-[color:var(--portal-text)]">
                    <span>{item.description}</span>
                    <span className="tabular-nums font-medium">
                      {item.type === 'Refund' ? '−' : '+'}
                      {currency(item.amount)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                    {item.date ? formatShortDate(item.date) : 'Date pending'} · {item.type} · {item.category}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${muted} mt-3`}>No recorded payments or confirmed refunds yet.</p>
          )}
        </section>
      </div>

      {/* Footnotes */}
      {!loading && chart.some((item) => item.actual !== null && item.actual < 0) && (
        <p className="text-xs text-[color:var(--portal-muted)]">
          Refunds can make a period negative. Negative amounts appear in the chart details rather than as bars.
        </p>
      )}
      <p className="text-sm text-[color:var(--portal-muted)]">
        Overdue scheduled collections:{' '}
        <strong className="inline-flex min-h-[20px] items-center text-[color:var(--portal-text)]">
          {loading ? <PortalSkeleton className="inline-block h-4 w-20 rounded" /> : <Amount value={overview?.overdue ?? 0} />}
        </strong>
        . Overdue amounts are tracked separately from upcoming collections.
      </p>
      <p className="text-sm text-[color:var(--portal-muted)]">
        Recorded refundable security deposits held:{' '}
        <strong className="inline-flex min-h-[20px] items-center text-[color:var(--portal-text)]">
          {loading ? <PortalSkeleton className="inline-block h-4 w-20 rounded" /> : <Amount value={overview?.securityDepositsHeld ?? 0} />}
        </strong>
        . Refundable security deposits are held separately from event revenue.
      </p>
      <p className="text-xs text-[color:var(--portal-muted)]">
        <CalendarDots className="mr-1 inline" weight="regular" size={14} /> Expected collections reflect saved client payment schedules. Unpaid utility or vendor bills do not reduce collected cash until paid.
      </p>
    </div>
  )
}
