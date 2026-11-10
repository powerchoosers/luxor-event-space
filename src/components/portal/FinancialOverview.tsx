'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useInView, useMotionValue, useSpring } from 'motion/react'
import Link from 'next/link'
import {
  ArrowUpRight,
  CalendarBlank,
  CalendarDots,
  CaretDown,
  CreditCard,
  CurrencyCircleDollar,
  TrendUp,
  Wallet,
} from '@phosphor-icons/react'
import { LogInstallmentPaymentDialog } from '@/components/portal/LogInstallmentPaymentDialog'
import { RescheduleInstallmentDialog } from '@/components/portal/RevenueCollectionsView'
import { PortalButton, PortalCloseButton, PortalContactAvatar, PortalModal, PortalSelect, PortalSkeleton, PortalStatusBadge } from '@/components/portal/PortalUI'
import {
  getLuxorCategoryShares,
  getLuxorOverviewChart,
  getLuxorPaymentCalendarDateKey,
  type getLuxorFinanceOverview,
  type getLuxorPaidExpenseBreakdown,
} from '@/lib/luxorFinanceReporting'
import type { LuxorBill, LuxorPayment, LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { chicagoCalendarDate, installmentDisplayState, invoiceEventObligation, isBookingPaymentMilestone, isFinalPaymentMilestone } from '@/lib/luxorPaymentDashboardModel'
import { expenseCategoryColors } from '@/lib/luxorExpenseChartColors'

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

function AnimatedAmount({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()
  const motionValue = useMotionValue(0)
  const springValue = useSpring(motionValue, { damping: 40, stiffness: 400 })
  const inView = useInView(ref, { once: true, margin: '0px' })

  useEffect(() => {
    if (reduceMotion) {
      if (ref.current) ref.current.textContent = currency(value)
      return
    }
    if (inView) motionValue.set(value)
  }, [inView, value, motionValue, reduceMotion])

  useEffect(
    () =>
      springValue.on('change', (latest) => {
        if (ref.current && !reduceMotion) ref.current.textContent = currency(latest)
      }),
    [springValue, reduceMotion]
  )

  return <span ref={ref} className="tabular-nums">{reduceMotion ? currency(value) : currency(0)}</span>
}

function Amount({ value, fallback = null }: { value: number | null | undefined; fallback?: number | null }) {
  const resolved = value !== null && value !== undefined && Number.isFinite(value) ? value : fallback
  if (resolved === null || resolved === undefined || !Number.isFinite(resolved)) {
    return <span className="tabular-nums">Unavailable</span>
  }
  return <AnimatedAmount value={resolved} />
}

function InViewBar({ percent, trackClassName, barClassName }: { percent: number; trackClassName: string; barClassName: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px' })
  const width = `${Math.max(0, Math.min(100, percent))}%`
  return (
    <div ref={ref} aria-hidden="true" className={trackClassName}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${barClassName}`}
        style={{ width: inView ? width : '0%' }}
      />
    </div>
  )
}

function InViewGrowBar({ percent, className }: { percent: number; className: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px' })
  return (
    <div
      ref={ref}
      className={`transition-[height] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${className}`}
      style={{ height: inView ? `${Math.max(0, Math.min(100, percent))}%` : '0%' }}
    />
  )
}

type PaymentScheduleItem = {
  installment: LuxorPaymentInstallment
  bookingId: string
  invoiceId: string
  amountDue: number
  credited: number
  remaining: number
  dueDate: string | null
  status: string
  isPaid: boolean
  isPartial: boolean
  isOverdue: boolean
  overdueDays: number
  scheduleReconciled: boolean
  reviewReason?: string | null
}

type PaymentSchedulePlan = {
  bookingId: string
  inquiryId: string | null
  clientName: string
  eventType: string
  eventDate: string | null
  totalContract: number
  paidAmount: number
  remainingBalance: number
  percent: number
  paidCount: number
  totalInstallments: number
  nextDueDate: string | null
  nextAmount: number | null
  nextLabel: string | null
  status: string
  reviewReason: string | null
  schedule: PaymentScheduleItem[]
}

function PaymentScheduleDrawer({
  plan,
  open,
  onClose,
  onLogPayment,
  payableIds,
  correctableIds,
  onCorrect,
  editableIds,
  onEditDueDate,
  dateEdit,
  today,
  onDateEditClose,
  onDateSaved,
  dateSaving,
  onDateSavingChange,
  suspendDismiss,
}: {
  plan: PaymentSchedulePlan | null
  open: boolean
  onClose: () => void
  onLogPayment: (id: string) => void
  payableIds: Set<string>
  correctableIds: Set<string>
  onCorrect: (id: string) => void
  editableIds: Set<string>
  onEditDueDate: (id: string) => void
  dateEdit: { row: { installmentId: string; clientName: string; label: string; dueDate: string | null; remaining: number }; expectedUpdatedAt: string } | null
  today: string
  onDateEditClose: () => void
  onDateSaved: () => void
  dateSaving: boolean
  onDateSavingChange: (saving: boolean) => void
  suspendDismiss: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [holdVisible, setHoldVisible] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => drawerRef.current?.focus())
    return () => { cancelAnimationFrame(frame); previous?.focus() }
  }, [open])

  React.useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  React.useEffect(() => {
    if (open && !reduceMotion) {
      const timer = setTimeout(() => setHoldVisible(true), 0)
      return () => clearTimeout(timer)
    }
    if (!open) setHoldVisible(false)
  }, [open, reduceMotion])

  React.useEffect(() => {
    if (!open) return

    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !suspendDismiss) {
        if (document.querySelector('[data-portal-popover="true"]')) return
        event.preventDefault()
        if (dateEdit) onDateEditClose()
        else onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
    }
  }, [open, onClose, suspendDismiss, dateEdit, onDateEditClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence initial={false} mode="wait">
      {(open || holdVisible) && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: open ? 1 : 0 }}
          exit={reduceMotion ? {} : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.23, 1, 0.32, 1] }}
          onAnimationComplete={() => {
            if (!open) setHoldVisible(false)
          }}
          aria-hidden={!open}
          inert={!open}
          className="fixed inset-0 z-[200]"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-schedule-title"
            tabIndex={-1}
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: open ? 0 : '100%' }}
            exit={reduceMotion ? {} : { x: '100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-0 h-full w-full max-w-[600px] overflow-hidden border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-[-18px_0_48px_rgba(0,0,0,0.22)]"
          >
            {plan && (
              <div className="flex h-full flex-col">
                {/* Header */}
                <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3.5 sm:px-6 sm:py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {plan.inquiryId ? (
                      <Link href={`/portal/leads/${encodeURIComponent(plan.inquiryId)}`} aria-label={`Open ${plan.clientName} contact`} className="shrink-0 rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 motion-reduce:transition-none motion-reduce:hover:scale-100">
                        <PortalContactAvatar name={plan.clientName} size="lg" />
                      </Link>
                    ) : <PortalContactAvatar name={plan.clientName} size="lg" className="shrink-0" />}
                    <div className="min-w-0">
                    <h3 id="payment-schedule-title" className="text-base font-semibold tracking-tight text-[color:var(--portal-text)]">
                      {plan.inquiryId ? <Link href={`/portal/leads/${encodeURIComponent(plan.inquiryId)}`} className="rounded-sm transition-colors hover:text-[#a87827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:hover:text-[#e6c77f]">{plan.clientName}</Link> : plan.clientName}
                    </h3>
                    <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
                      {plan.eventType}
                      {plan.eventDate ? ` · Event ${formatShortDate(plan.eventDate)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                      Contract total: <strong className="font-semibold tabular-nums text-[color:var(--portal-text)]">{currency(plan.totalContract)}</strong>
                      <span className="mx-2">·</span>
                      Paid: <strong className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{currency(plan.paidAmount)}</strong>
                      <span className="mx-2">·</span>
                      Remaining: <strong className="font-semibold tabular-nums text-[color:var(--portal-text)]">{currency(plan.remainingBalance)}</strong>
                    </p>
                  </div>
                  </div>
                  <PortalCloseButton onClick={onClose} aria-label="Close payment schedule" className="shrink-0" />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 portal-scrollbar sm:px-6">
                  <h4 className="text-sm font-bold text-[color:var(--portal-text)]">Payment schedule</h4>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Scheduled payments and recorded credits for this booking.</p>
                  {plan.schedule.length === 0 ? (
                    <p className="mt-6 text-sm text-[color:var(--portal-muted)]">No payment schedule available for this booking.</p>
                  ) : (
                    <div className="mt-4 divide-y divide-[color:var(--portal-border)] border-y border-[color:var(--portal-border)]">
                      {plan.schedule.map((item) => (
                        <article key={item.installment.id} className="py-4 sm:py-5">
                          <div className="flex items-start justify-between gap-3">
                            {editableIds.has(item.installment.id) ? (
                              <button type="button" id={`date-trigger-${item.installment.id}`} onClick={() => onEditDueDate(item.installment.id)} disabled={dateSaving} aria-expanded={dateEdit?.row.installmentId === item.installment.id} aria-controls={`date-editor-${item.installment.id}`} aria-label={`Change due date for ${item.installment.label}`} className="group min-h-11 min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
                                <span className="block text-sm font-semibold text-[color:var(--portal-text)]">{item.installment.label}</span>
                                <span className="mt-1 block text-xs text-[color:var(--portal-muted)] transition-colors group-hover:text-[#b66c22] group-focus-visible:text-[#b66c22] dark:group-hover:text-[#e6ae63] dark:group-focus-visible:text-[#e6ae63]">Due {item.dueDate ? formatShortDate(item.dueDate) : 'TBD'}</span>
                              </button>
                            ) : <div className="min-w-0">
                              <h5 className="text-sm font-semibold text-[color:var(--portal-text)]">{item.installment.label}</h5>
                              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Due {item.dueDate ? formatShortDate(item.dueDate) : 'TBD'}{item.installment.payment_method ? ` · ${item.installment.payment_method}` : ''}</p>
                            </div>}
                            {payableIds.has(item.installment.id) ? (
                              <button type="button" onClick={() => onLogPayment(item.installment.id)} aria-label={`Log payment for ${item.installment.label}`} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-[#94691f] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">{item.isOverdue ? 'Overdue' : item.isPartial ? 'Partial' : 'Upcoming'}</button>
                            ) : correctableIds.has(item.installment.id) ? <button type="button" onClick={() => onCorrect(item.installment.id)} aria-label={`Correct payment for ${item.installment.label}`} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-emerald-300">Paid</button> : <span className={`shrink-0 text-xs font-semibold ${item.isPaid ? 'text-emerald-700 dark:text-emerald-300' : item.isOverdue ? 'text-rose-700 dark:text-rose-300' : 'text-[color:var(--portal-muted)]'}`}>{item.isPaid ? 'Paid' : item.isOverdue ? 'Overdue' : item.isPartial ? 'Partial' : 'Upcoming'}</span>}
                          </div>
                          <AnimatePresence initial={false}>
                            {dateEdit?.row.installmentId === item.installment.id && (
                              <motion.div id={`date-editor-${item.installment.id}`} initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.23, 1, 0.32, 1] }} className="overflow-hidden">
                                <div className="pt-3"><RescheduleInstallmentDialog inline editing={dateEdit} today={today} onClose={onDateEditClose} onSaved={onDateSaved} onSavingChange={onDateSavingChange} /></div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                            <div><dt className="text-[color:var(--portal-muted)]">Amount</dt><dd className="mt-1 font-medium tabular-nums text-[color:var(--portal-text)]">{currency(item.amountDue)}</dd></div>
                            <div><dt className="text-[color:var(--portal-muted)]">Credited</dt><dd className="mt-1 font-medium tabular-nums text-[color:var(--portal-text)]">{currency(item.credited)}</dd></div>
                            <div><dt className="text-[color:var(--portal-muted)]">Remaining</dt><dd className="mt-1 font-semibold tabular-nums text-[color:var(--portal-text)]">{currency(item.remaining)}</dd></div>
                          </dl>
                          {!item.scheduleReconciled && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{allocationReason(item.reviewReason ?? null) || 'This payment needs review.'}</p>}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function EmptyCategoryChart({ message, amount = 0 }: { message: string; amount?: number }) {
  return <div className="mt-4 flex flex-wrap items-center gap-5">
    <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full border-[16px] border-[color:var(--portal-border)] dark:border-[#887c68]" aria-hidden="true">
      <span className="text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">{currency(amount)}</span>
    </div>
    <p className="min-w-[10rem] flex-1 text-xs text-[color:var(--portal-muted)]">{message}</p>
  </div>
}

function CategoryChart({ values, label, tone = 'revenue' }: { values: Array<{ category: string; amount: number }>; label: string; tone?: 'revenue' | 'expense' }) {
  const positiveValues = values.filter((row) => row.amount > 0)
  const refunds = values.filter((row) => row.amount < 0)
  const data = getLuxorCategoryShares(positiveValues)
  const netTotal = values.reduce((sum, row) => sum + row.amount, 0)
  const colors = ['#a87827', '#c49650', '#dbb47b', '#e8cba2', '#b9a380', '#83725e', '#cfb18b', '#e5d7c2', '#8d7f6c', '#d0c0a8']
  const expenseColors = expenseCategoryColors(data.rows.map((row) => row.category))
  const colorFor = (category: string, index: number) => tone === 'expense' ? expenseColors.get(category)! : colors[index % colors.length]
  const stops = data.rows
    .map((row, index) => {
      const start = data.rows.slice(0, index).reduce((sum, item) => sum + item.percent, 0)
      return `${colorFor(row.category, index)} ${start}% ${start + row.percent}%`
    })
    .join(', ')
  if (!data.total) return <EmptyCategoryChart amount={netTotal} message={refunds.length ? `Refunds and reversals: ${currency(netTotal)}.` : `No ${label.toLowerCase()} recorded for this period ($0.00).`} />
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      <motion.div
        aria-hidden="true"
        className="grid h-28 w-28 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '0px' }}
        transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
      >
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[color:var(--portal-card)] text-center text-xs font-semibold tabular-nums text-[color:var(--portal-text)]">
          <AnimatedAmount value={netTotal} />
        </div>
      </motion.div>
      <ul className="min-w-[10rem] flex-1 space-y-2">
        {data.rows.map((row, index) => (
          <li key={row.category} className="flex items-start justify-between gap-3 text-xs text-[color:var(--portal-text)]">
            <span>
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorFor(row.category, index) }}
              />
              {row.category}
            </span>
            <span className="shrink-0 tabular-nums">
              <AnimatedAmount value={row.amount} /> · {Math.round(row.percent)}%
            </span>
          </li>
        ))}
        {refunds.length ? <li className="flex items-start justify-between gap-3 border-t border-[color:var(--portal-border)] pt-2 text-xs text-[color:var(--portal-muted)]"><span>Refunds and reversals</span><span className="shrink-0"><AnimatedAmount value={refunds.reduce((sum, row) => sum + row.amount, 0)} /></span></li> : null}
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
  onRefresh,
  requestedScheduleBookingId,
  onRequestedScheduleClosed,
  loading = false,
  selectedRange,
  rangeExpenses,
}: {
  overview?: Overview
  expenses?: Expenses
  bills?: LuxorBill[] | null
  activity?: Activity[]
  openView: (view: 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports') => void
  onRefresh: () => void
  requestedScheduleBookingId?: string | null
  onRequestedScheduleClosed?: () => void
  loading?: boolean
  selectedRange?: { start: string; end: string }
  rangeExpenses?: { total: number; categories: Array<{ category: string; amount: number }> } | null
}) {
  const scrollFrame = useRef<number | null>(null)
  useEffect(() => () => { if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current) }, [])
  const scrollToView = (button: HTMLButtonElement, view: 'receivables' | 'revenue' | 'invoices' | 'expenses' | 'payments') => {
    if (scrollFrame.current !== null) return
    const scrollers: Array<{ element: HTMLElement; top: number }> = []
    for (let element = button.parentElement; element; element = element.parentElement) {
      if (element.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) scrollers.push({ element, top: element.scrollTop })
    }
    const page = document.scrollingElement as HTMLElement | null
    if (page && page.scrollTop > 0 && !scrollers.some(({ element }) => element === page)) scrollers.push({ element: page, top: page.scrollTop })
    if (!scrollers.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      scrollers.forEach(({ element }) => { element.scrollTop = 0 })
      openView(view)
      return
    }
    let start: number | null = null
    const scroll = (now: number) => {
      if (start === null) start = now
      const progress = Math.min((now - start) / 320, 1)
      const remaining = (1 - progress) ** 3
      scrollers.forEach(({ element, top }) => { element.scrollTop = top * remaining })
      if (progress < 1) scrollFrame.current = requestAnimationFrame(scroll)
      else { scrollFrame.current = null; openView(view) }
    }
    scrollFrame.current = requestAnimationFrame(scroll)
  }
  const today = chicagoCalendarDate()
  const month = (selectedRange?.start || today).slice(0, 7)
  const range = selectedRange ?? { start: `${month}-01`, end: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10) }
  const [grouping, setGrouping] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [amountsOpen, setAmountsOpen] = useState(false)
  const reduceAmountsMotion = useReducedMotion()
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const [selectedSchedulePlan, setSelectedSchedulePlan] = useState<PaymentSchedulePlan | null>(null)
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false)
  const [dateSaving, setDateSaving] = useState(false)
  const [dateEdit, setDateEdit] = useState<{ row: { installmentId: string; clientName: string; label: string; dueDate: string | null; remaining: number }; expectedUpdatedAt: string } | null>(null)
  const [paymentInstallmentId, setPaymentInstallmentId] = useState<string | null>(null)
  const [correction, setCorrection] = useState<{ installmentId: string; label: string; payment: LuxorPayment } | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionBusy, setCorrectionBusy] = useState(false)
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [actorEmail, setActorEmail] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    fetch('/api/portal/user-preferences').then((response) => response.ok ? response.json() : null).then((data) => { if (active && typeof data?.email === 'string') setActorEmail(data.email) }).catch(() => {})
    return () => { active = false }
  }, [])

  const correctionPayments = useMemo(() => {
    const grouped = new Map<string, LuxorPayment[]>()
    for (const payment of overview?.reportingRows.payments || []) {
      if (payment.status !== 'paid') continue
      const allocations = payment.metadata?.installment_allocations
      if (!Array.isArray(allocations)) continue
      for (const allocation of allocations) {
        if (allocation && typeof allocation === 'object' && typeof allocation.installment_id === 'string') {
          grouped.set(allocation.installment_id, [...(grouped.get(allocation.installment_id) || []), payment])
        }
      }
    }
    const eligible = new Map<string, LuxorPayment>()
    for (const [id, rows] of grouped) {
      const payment = rows[0]
      const allocations = payment.metadata?.installment_allocations
      if (rows.length === 1 && payment.processor === 'manual' && payment.metadata?.manual_entry === true && typeof payment.metadata?.installment_entry_key === 'string' && Array.isArray(allocations) && allocations.length === 1 && Number(allocations[0]?.amount) === Number(payment.amount) && payment.updated_at) eligible.set(id, payment)
    }
    return eligible
  }, [overview])
  const submitCorrection = async () => {
    if (!correction || correctionBusy || correctionReason.trim().length < 3) return
    setCorrectionBusy(true)
    setCorrectionError(null)
    try {
      const response = await fetch('/api/portal/payment-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId: correction.payment.id, installmentId: correction.installmentId, expectedUpdatedAt: correction.payment.updated_at, reason: correctionReason.trim() }) })
      const result = await response.json().catch(() => null) as { corrected?: boolean; error?: string } | null
      if (!response.ok || !result?.corrected) throw new Error(result?.error || 'The correction could not be confirmed. Refresh and review the payment before trying again.')
      setCorrection(null)
      setCorrectionReason('')
      onRefresh()
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : 'The correction could not be confirmed. Refresh and review the payment before trying again.')
      onRefresh()
    } finally { setCorrectionBusy(false) }
  }

  const period = useMemo(() => {
    if (!overview) return { actual: null, expected: null, projected: null, percent: null }
    const actual = overview.actualByMonth ? Math.round(overview.reportingRows.eventPaymentRows.filter((row) => { const day = getLuxorPaymentCalendarDateKey(row); return day >= range.start && day <= range.end }).reduce((sum, row) => sum + row.amount, 0) * 100) / 100 : null
    const expected = overview.expectedByMonth ? Math.round(overview.reportingRows.scheduleRows.filter((row) => row.dueDate && row.dueDate >= range.start && row.dueDate <= range.end && row.dueDate >= today).reduce((sum, row) => sum + row.remaining, 0) * 100) / 100 : null
    const projected = actual === null || expected === null ? null : Math.round((actual + expected) * 100) / 100
    const percent = projected !== null && actual !== null && actual >= 0 ? projected > 0 ? Math.round(actual / projected * 100) : 0 : null
    return { actual, expected, projected, percent }
  }, [overview, range.start, range.end, today])
  const chart = useMemo(() => (overview ? getLuxorOverviewChart(overview, year, grouping) : []), [overview, year, grouping])
  const max = Math.max(1, ...chart.map((item) => (item.actual || 0) + (item.expected || 0)))

  const upcoming = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + i, 1))
        const key = date.toISOString().slice(0, 7)
        return {
          label: date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
          value: overview?.expectedByMonth ? overview.expectedByMonth[key] || 0 : null,
        }
      }),
    [overview?.expectedByMonth, today],
  )
  const upcomingMax = Math.max(1, ...upcoming.map((item) => item.value || 0))

  const unpaid = bills
    ?.filter((bill) => bill.status !== 'paid' && bill.extraction_status !== 'duplicate' && !bill.duplicate_of_bill_id)
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    .slice(0, 5)

  const formatPeriodDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const monthName = `${formatPeriodDate(range.start)} – ${formatPeriodDate(range.end)}`
  const monthShort = 'the selected period'

  // Real calculated metrics for the 4 KPI cards
  const periodRevenue = period.actual
  const allTimeRevenue = useMemo(
    () => (overview?.actualByMonth ? overview.reportingRows.eventPaymentRows.reduce((sum, row) => sum + row.amount, 0) : null),
    [overview],
  )
  const periodExpenses = rangeExpenses ? rangeExpenses.total : null
  const allTimeExpenses = expenses?.available && expenses.total !== null ? expenses.total : null
  const periodNetProfit = periodRevenue === null || periodExpenses === null ? null : periodRevenue - periodExpenses
  const allTimeNetProfit = allTimeRevenue === null || allTimeExpenses === null ? null : allTimeRevenue - allTimeExpenses
  const outstandingBalance = useMemo(
    () => (overview?.actualByMonth && overview.expectedByMonth ? overview.reportingRows.acceptedInvoiceRows.reduce((sum, row) => sum + row.outstanding, 0) : null),
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

  useEffect(() => {
    if (!requestedScheduleBookingId) return
    const plan = clientPaymentPlans.active.find((item) => item.bookingId === requestedScheduleBookingId)
    if (plan) { setSelectedSchedulePlan(plan); setScheduleDrawerOpen(true) }
  }, [requestedScheduleBookingId, clientPaymentPlans.active])

  const revenueMonthCategories = useMemo(() => {
    if (!overview?.categoryByMonth) return []
    const totals = new Map<string, number>()
    for (const row of overview.reportingRows.eventPaymentRows) {
      const day = getLuxorPaymentCalendarDateKey(row)
      if (day >= range.start && day <= range.end && row.amount > 0) totals.set(row.category || 'Unclassified', (totals.get(row.category || 'Unclassified') || 0) + row.amount)
    }
    return [...totals].map(([category, amount]) => ({ category, amount }))
  }, [overview, range.start, range.end])

  const expenseMonthCategories = rangeExpenses?.categories || []

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto pb-8 pr-1 portal-scrollbar">

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

      {/* Summary amounts remain unavailable when their source is unavailable. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            title: 'Payments received',
            value: periodRevenue,
            detail: `${monthName} · ${allTimeRevenue === null ? 'All-time collections unavailable' : `${currency(allTimeRevenue)} collected all time`}`,
            icon: CurrencyCircleDollar,
          },
          {
            title: 'Paid expenses',
            value: periodExpenses,
            detail: `${monthName} · ${allTimeExpenses === null ? 'All-time expenses unavailable' : `${currency(allTimeExpenses)} paid all time`}`,
            icon: CreditCard,
          },
          {
            title: 'Net cash flow',
            value: periodNetProfit,
            detail: `${monthName} net cash flow · ${allTimeNetProfit === null ? 'All-time net unavailable' : `${currency(allTimeNetProfit)} all time`}`,
            icon: TrendUp,
          },
          {
            title: 'Outstanding',
            value: outstandingBalance,
            detail: outstandingBalance !== null ? `${activeContractCount} active signed ${activeContractCount === 1 ? 'agreement' : 'agreements'} · ${period.expected === null ? 'Scheduled amount unavailable' : `${currency(period.expected)} due in ${monthShort}`}` : 'Agreement balances unavailable',
            icon: Wallet,
          },
        ].map(({ title, value, detail, icon: Icon }) => (
          <section key={title} className={card}>
            <div className="flex flex-col items-start md:mb-3 md:flex-row md:items-center md:gap-2">
              <Icon aria-hidden="true" className="mb-2 text-[#a8792f] dark:text-[#e6c77f] md:mb-0 md:shrink-0" size={20} weight="regular" />
              <h3 className={muted}>{title}</h3>
            </div>
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
          <button
            type="button"
            onClick={(event) => scrollToView(event.currentTarget, 'receivables')}
            className="group inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
          >
            All payment schedules <ArrowUpRight aria-hidden="true" size={15} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          </button>
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
        ) : !overview || !overview.actualByMonth || !overview.expectedByMonth ? (
          <p className={`${muted} mt-3`}>Payment schedules are unavailable until the records are verified.</p>
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
                        {plan.status === 'partially_paid' ? (
                          <span className="inline-flex items-center rounded-md bg-[#caa24c]/15 px-2 py-0.5 text-[11px] font-medium text-[#9a6d26] dark:text-[#e6c77f]">Partially paid</span>
                        ) : <PortalStatusBadge
                          borderless
                          status={plan.status.replaceAll('_', ' ')}
                          tone={
                            plan.status === 'paid'
                              ? 'green'
                              : plan.status === 'overdue'
                                ? 'red'
                                : 'blue'
                          }
                          warning={plan.status === 'needs_review'}
                        />}
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
                        <InViewBar
                          percent={Math.max(4, plan.percent)}
                          trackClassName="mt-1.5 h-2 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"
                          barClassName="bg-[#b58b3e]"
                        />
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
                            {plan.nextAmount !== null ? currency(plan.nextAmount) : plan.remainingBalance <= 0.005 ? '$0.00' : 'Unavailable'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[color:var(--portal-muted)]">Next due date</dt>
                          <dd className="mt-0.5 font-medium text-[color:var(--portal-text)]">
                            {plan.nextDueDate ? formatShortDate(plan.nextDueDate) : plan.nextAmount === null && plan.remainingBalance <= 0.005 ? 'All paid' : 'Date pending'}
                          </dd>
                        </div>
                      </dl>

                    </div>

                    {/* Direct Actions */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSchedulePlan(plan)
                          setScheduleDrawerOpen(true)
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#caa24c]/15 px-3 py-1.5 text-xs font-semibold text-[#9a6d26] transition-colors hover:bg-[#caa24c]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
                      >
                        <CalendarBlank size={14} weight="regular" />
                        View payment schedule
                      </button>
                      {plan.inquiryId ? (
                        <Link
                          href={`/portal/leads/${encodeURIComponent(plan.inquiryId)}`}
                          className="group inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                        >
                          Open client lead <ArrowUpRight aria-hidden="true" size={13} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
                {clientPaymentPlans.active.length % 2 === 1 && <div className="hidden items-center justify-center rounded-xl border-2 border-dotted border-[color:color-mix(in_srgb,var(--portal-muted)_38%,transparent)] p-4 text-center text-xs text-[color:var(--portal-muted)] dark:border-[#c6ad80]/35 dark:bg-[color:var(--portal-bg)]/60 lg:flex">Additional active schedules appear here.</div>}
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
                        <span className="inline-flex items-center rounded-md bg-[#caa24c]/15 px-2 py-0.5 text-[11px] font-medium text-[#9a6d26] dark:text-[#e6c77f]">Awaiting signature</span>
                      </div>
                      <p className="mt-2 text-[color:var(--portal-muted)]">{item.pendingReason}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const plan = clientPaymentPlans.pending.find((p) => p.bookingId === item.bookingId)
                            if (plan) {
                              setSelectedSchedulePlan({
                                ...plan,
                                percent: 0,
                                paidCount: 0,
                                nextDueDate: plan.firstDueDate,
                                nextAmount: plan.firstAmount,
                                nextLabel: null,
                                status: 'upcoming',
                                reviewReason: null,
                              })
                              setScheduleDrawerOpen(true)
                            }
                          }}
                          className="font-semibold text-[#a8792f] hover:underline dark:text-[#e6c77f]"
                        >
                          View drafted schedule →
                        </button>
                        {item.inquiryId ? (
                          <Link
                            href={`/portal/leads/${encodeURIComponent(item.inquiryId)}`}
                            className="group inline-flex items-center gap-1 font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]"
                          >
                            Open client lead <ArrowUpRight aria-hidden="true" size={13} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {clientPaymentPlans.pending.length % 2 === 1 && <div className="hidden items-center justify-center rounded-xl border-2 border-dotted border-[color:color-mix(in_srgb,var(--portal-muted)_38%,transparent)] p-4 text-center text-xs text-[color:var(--portal-muted)] dark:border-[#c6ad80]/35 dark:bg-[color:var(--portal-bg)]/60 lg:flex">Additional drafts appear here.</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Middle Row: Monthly Revenue & Collections + Collections Year Chart */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Monthly Revenue & Collections */}
        <section className={`${card} flex flex-col`}>
          <h3 className="text-base font-semibold text-[color:var(--portal-text)]">Revenue &amp; Collections</h3>
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
          <p className={muted}>Projected collections (collected + expected in this period)</p>
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
                {loading ? <PortalSkeleton className="h-5 w-12 rounded" /> : period.percent === null ? 'Unavailable' : `${period.percent}%`}
              </strong>
              <span className={muted}>Collected</span>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => scrollToView(event.currentTarget, 'revenue')}
            className="group ml-auto mt-auto flex min-h-10 w-fit items-center gap-1 pt-4 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]"
          >
            View revenue <ArrowUpRight aria-hidden="true" size={15} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          </button>
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
          {!loading && !overview && <p role="status" className={`${muted} mt-3`}>Collections data is unavailable. Reload the page to try again.</p>}
          <div className="mt-5 flex h-40 items-end gap-2">
            {!loading && overview && <div aria-label="Chart scale in dollars" className="flex w-12 shrink-0 flex-col justify-end gap-1 text-right text-[10px] text-[color:var(--portal-muted)]">
              <div className="relative h-32">
                {[max, max / 2, 0].map((value, index) => <span key={index} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${index * 50}%` }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)}</span>)}
              </div>
              <span aria-hidden="true" className="invisible text-[10px]">Jan</span>
            </div>}
            <div className="relative flex min-w-0 flex-1 items-end gap-1 sm:gap-3">
            {!loading && overview && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[19px] flex h-32 flex-col justify-between">
              {[0, 1, 2].map((line) => <div key={line} className="border-t border-[color:var(--portal-border)]" />)}
            </div>}
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
                      title={`${item.label}: collected ${item.actual === null ? 'unavailable' : currency(item.actual)}, expected ${item.expected === null ? 'unavailable' : currency(item.expected)}`}
                    >
                      {item.actual !== null && item.actual > 0 && <InViewGrowBar percent={Math.max(0, (item.actual / max) * 100)} className="w-2/5 max-w-8 rounded-t bg-[#b58b3e]" />}
                      {item.expected !== null && item.expected > 0 && <InViewGrowBar percent={Math.max(0, (item.expected / max) * 100)} className="w-2/5 max-w-8 rounded-t bg-[#e6c99d]" />}
                    </div>
                    <span className="text-[10px] text-[color:var(--portal-muted)]">{item.label}</span>
                  </div>
                ))}
            </div>
          </div>
          {!loading && overview && (
            <div className="mt-3 border-t border-[color:var(--portal-border)]">
              <button type="button" aria-expanded={amountsOpen} aria-controls="collections-amounts" onClick={() => setAmountsOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-end gap-2 text-right text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:text-[#a8792f] dark:hover:text-[#e6c77f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50">
                {amountsOpen ? 'Hide amounts' : 'View amounts'}
                <CaretDown aria-hidden="true" size={15} className={`text-[color:var(--portal-muted)] transition-transform duration-200 motion-reduce:transition-none ${amountsOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {amountsOpen && <motion.div id="collections-amounts" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceAmountsMotion ? 0 : 0.22 }} className="overflow-hidden">
                  <table className="mb-2 w-full table-fixed text-xs tabular-nums">
                    <thead className="text-[color:var(--portal-muted)]"><tr><th scope="col" className="py-2 text-left font-medium">Period</th><th scope="col" className="py-2 text-right font-medium">Collected</th><th scope="col" className="py-2 text-right font-medium">Expected</th></tr></thead>
                    <tbody className="divide-y divide-[color:var(--portal-border)]">{chart.map((item) => <tr key={item.label}><th scope="row" className="py-2.5 text-left font-medium text-[color:var(--portal-text)]">{item.label}</th><td className="py-2.5 text-right text-[color:var(--portal-text)]"><Amount value={item.actual} /></td><td className="py-2.5 text-right text-[color:var(--portal-text)]"><Amount value={item.expected} /></td></tr>)}</tbody>
                  </table>
                </motion.div>}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      {/* Row 3: Revenue by category + Expense breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Revenue by category */}
        <section className={`${card} flex flex-col`}>
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
          ) : !overview?.categoryByMonth ? (
            <p className={`${muted} mt-3`}>Revenue categories are unavailable until the records are verified.</p>
          ) : revenueMonthCategories.length > 0 ? (
            <>
              <CategoryChart label="revenue" values={revenueMonthCategories} />
              <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Refundable security deposits are tracked separately from revenue.</p>
            </>
          ) : (
            <EmptyCategoryChart message="No revenue receipts recorded in this period ($0.00)." />
          )}
          <button type="button" className="group ml-auto mt-auto flex min-h-10 w-fit items-center gap-1 pt-4 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]" onClick={(event) => scrollToView(event.currentTarget, 'invoices')}>
            Open invoices ledger <ArrowUpRight aria-hidden="true" size={15} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          </button>
        </section>

        {/* Expense breakdown */}
        <section className={`${card} flex flex-col`}>
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
          ) : !rangeExpenses ? (
            <p className={`${muted} mt-3`}>Paid expense details are unavailable until the records are verified.</p>
          ) : expenseMonthCategories.length > 0 ? (
            <>
              <CategoryChart label="expenses" values={expenseMonthCategories} tone="expense" />
              <p className="mt-3 text-xs text-[color:var(--portal-muted)]">Showing expense payments and refunds recorded in {monthName}.</p>
            </>
          ) : (
            <EmptyCategoryChart message="No paid expenses recorded in this period ($0.00)." />
          )}
          <button type="button" className="group ml-auto mt-auto flex min-h-10 w-fit items-center gap-1 pt-4 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]" onClick={(event) => scrollToView(event.currentTarget, 'expenses')}>
            Open expense ledger <ArrowUpRight aria-hidden="true" size={15} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          </button>
        </section>
      </div>

      {/* Bottom Row: Upcoming collections, Upcoming bills, Recent financial activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Upcoming collections */}
        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming collections</h3>
            <Link href="/portal/finances?view=receivables" className="text-xs font-semibold text-[#a8792f] dark:text-[#e6c77f]">
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
                    <span className="tabular-nums">{item.value === null ? 'Unavailable' : currency(item.value)}</span>
                  </p>
                  {item.value !== null && (
                    <InViewBar
                      percent={((item.value || 0) / upcomingMax) * 100}
                      trackClassName="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"
                      barClassName="bg-[#c59a4d]"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming bills */}
        <section className={card}>
          <div className="flex justify-between gap-2">
            <h3 className="font-semibold text-[color:var(--portal-text)]">Upcoming bills</h3>
            <Link className="text-sm font-semibold text-[#a8792f] dark:text-[#e6c77f]" href="/portal/finances?view=bill-review">
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
            <p className={`${muted} mt-3`}>Bills could not be loaded. Reload the page to try again.</p>
          ) : unpaid.length === 0 ? (
            <p className={`${muted} mt-3`}>No bills are marked open in the loaded list. Paid bills may still need payment review.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {unpaid.map((bill) => (
                <li key={bill.id} className="py-3 text-sm">
                  <Link
                    href={`/portal/finances?view=bill-review&bill=${encodeURIComponent(bill.id)}`}
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
                      href={`/portal/finances?view=bill-review&company=${encodeURIComponent(bill.vendor_id)}`}
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
            <button type="button" className="group inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#a8792f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]" onClick={(event) => scrollToView(event.currentTarget, 'payments')}>
              View payments <ArrowUpRight aria-hidden="true" size={15} weight="regular" className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
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
          ) : !activity ? (
            <p className={`${muted} mt-3`}>Recent activity is unavailable. Reload the page to try again.</p>
          ) : activity.length ? (
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
          {loading ? <PortalSkeleton className="inline-block h-4 w-20 rounded" /> : <Amount value={overview?.overdue} />}
        </strong>
        . Overdue amounts are tracked separately from upcoming collections.
      </p>
      <p className="text-sm text-[color:var(--portal-muted)]">
        Recorded refundable security deposits held:{' '}
        <strong className="inline-flex min-h-[20px] items-center text-[color:var(--portal-text)]">
          {loading ? <PortalSkeleton className="inline-block h-4 w-20 rounded" /> : <Amount value={overview?.securityDepositsHeld} />}
        </strong>
        . Refundable security deposits are held separately from event revenue.
      </p>
      <p className="text-xs text-[color:var(--portal-muted)]">
        <CalendarDots className="mr-1 inline" weight="regular" size={14} /> Expected collections reflect saved client payment schedules. Unpaid utility or vendor bills do not reduce collected cash until paid.
      </p>

      {/* Payment Schedule Drawer */}
      <PaymentScheduleDrawer
        plan={clientPaymentPlans.active.find((plan) => plan.bookingId === selectedSchedulePlan?.bookingId) || selectedSchedulePlan}
        payableIds={new Set((actorEmail ? clientPaymentPlans.active.find((plan) => plan.bookingId === selectedSchedulePlan?.bookingId)?.schedule || [] : []).filter((item) => item.scheduleReconciled && !item.reviewReason && item.remaining > 0 && !item.isPaid && !isBookingPaymentMilestone(item.installment)).map((item) => item.installment.id))}
        correctableIds={new Set((clientPaymentPlans.active.find((plan) => plan.bookingId === selectedSchedulePlan?.bookingId)?.schedule || []).filter((item) => item.isPaid && item.scheduleReconciled && !item.reviewReason && correctionPayments.has(item.installment.id)).map((item) => item.installment.id))}
        onCorrect={(id) => { const payment = correctionPayments.get(id); const item = selectedSchedulePlan?.schedule.find((row) => row.installment.id === id); if (payment && item) { setCorrectionReason(''); setCorrectionError(null); setCorrection({ installmentId: id, label: item.installment.label, payment }) } }}
        editableIds={new Set((clientPaymentPlans.active.find((plan) => plan.bookingId === selectedSchedulePlan?.bookingId)?.schedule || []).filter((item) => item.scheduleReconciled && !item.reviewReason && item.installment.updated_at && (item.installment.status === 'scheduled' || item.installment.status === 'sent') && item.dueDate && item.dueDate > today && item.remaining > 0 && !isBookingPaymentMilestone(item.installment) && !isFinalPaymentMilestone(item.installment)).map((item) => item.installment.id))}
        onEditDueDate={(id) => { const plan = clientPaymentPlans.active.find((item) => item.bookingId === selectedSchedulePlan?.bookingId); const item = plan?.schedule.find((row) => row.installment.id === id); if (dateEdit?.row.installmentId === id) { setDateEdit(null); return } if (plan && item?.installment.updated_at) setDateEdit({ row: { installmentId: id, clientName: plan.clientName, label: item.installment.label, dueDate: item.dueDate, remaining: item.remaining }, expectedUpdatedAt: item.installment.updated_at }) }}
        dateEdit={dateEdit}
        today={today}
        onDateEditClose={() => { const id = dateEdit?.row.installmentId; setDateEdit(null); if (id) requestAnimationFrame(() => document.getElementById(`date-trigger-${id}`)?.focus()) }}
        onDateSaved={onRefresh}
        dateSaving={dateSaving}
        onDateSavingChange={setDateSaving}
        suspendDismiss={Boolean(paymentInstallmentId || correction || dateSaving)}
        onLogPayment={setPaymentInstallmentId}
        open={scheduleDrawerOpen}
        onClose={() => { if (dateSaving) return; setDateEdit(null); setScheduleDrawerOpen(false); onRequestedScheduleClosed?.() }}
      />
      <PortalModal isOpen={Boolean(correction)} onClose={() => { if (!correctionBusy) setCorrection(null) }} title="Correct payment" description="Use this when a manual payment was recorded by mistake." zIndex={220} animateClose>
        {correction && <div className="space-y-4 p-5 sm:p-6">
          <p className="text-sm text-[color:var(--portal-text)]">{correction.label} · <strong className="tabular-nums">{currency(Number(correction.payment.amount))}</strong> · {correction.payment.payment_method || 'Manual payment'}</p>
          <p className="text-sm text-[color:var(--portal-muted)]">This removes the recorded credit and restores the amount due. The original entry and correction will remain in the audit history. No refund is issued.</p>
          <label className="block text-sm font-medium text-[color:var(--portal-text)]">Reason for correction<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} maxLength={500} disabled={correctionBusy} className="mt-2 min-h-24 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" /></label>
          {correctionError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{correctionError}</p>}
          <div className="flex justify-end gap-2"><PortalButton disabled={correctionBusy} onClick={() => setCorrection(null)}>Cancel</PortalButton><PortalButton variant="primary" disabled={correctionBusy || correctionReason.trim().length < 3} onClick={() => void submitCorrection()}>{correctionBusy ? 'Saving…' : 'Correct payment'}</PortalButton></div>
        </div>}
      </PortalModal>
      <LogInstallmentPaymentDialog
        open={Boolean(paymentInstallmentId)}
        onClose={() => setPaymentInstallmentId(null)}
        bookings={selectedSchedulePlan ? [{ id: selectedSchedulePlan.bookingId, label: selectedSchedulePlan.clientName }] : []}
        schedules={(clientPaymentPlans.active.find((plan) => plan.bookingId === selectedSchedulePlan?.bookingId)?.schedule || []).filter((item) => item.scheduleReconciled && !item.reviewReason && item.remaining > 0 && !item.isPaid && !isBookingPaymentMilestone(item.installment)).map((item) => ({ id: item.installment.id, bookingId: item.bookingId, label: item.installment.label, remainingAmount: item.remaining, dueDate: item.dueDate, eligible: true }))}
        initialBookingId={selectedSchedulePlan?.bookingId}
        initialInstallmentId={paymentInstallmentId}
        actorEmail={actorEmail}
        onRecorded={onRefresh}
      />
    </div>
  )
}
