'use client'

import React, { useEffect, useState, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CreditCard,
  CurrencyDollar,
  Eye,
  FileText,
  List,
  MagnifyingGlass,
  Plus,
  TrendDown,
  TrendUp,
  X,
} from '@phosphor-icons/react'
import { Menu, ChevronDown } from '@/lib/icons/phosphor-compat'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSelect,
  PortalSkeleton,
  PortalContactAvatar,
} from '@/components/portal/PortalUI'
import FinancialOverview from '@/components/portal/FinancialOverview'
import { PaymentHistoryDetails, ReceivablesView, RevenueCollectionsView } from '@/components/portal/RevenueCollectionsView'
import { getLuxorRevenueCollectionsModel, type LuxorRevenueHistoryRow } from '@/lib/luxorRevenueCollectionsModel'
import { BooksRecordsPage } from '@/components/portal/BooksRecordsPage'
import { FinanceMainTabs } from '@/components/portal/FinanceMainTabs'
import { FinanceBrowseViews, type FinanceBrowseView } from '@/components/portal/FinanceBrowseViews'
import type { LuxorInvoice, LuxorBooking, LuxorPayment, LuxorPaymentRefundView, LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { getLuxorBusinessFinanceRows, getLuxorFinanceOverview, getLuxorPaidExpenseBreakdown, getLuxorPaymentCalendarDateKey, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import { expenseAmountState } from '@/lib/luxorExpenseAmount'

type BookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

type FinanceTransaction = { kind: 'payment'; payment: LuxorPayment } | { kind: 'refund'; refund: LuxorPaymentRefundView }

function refundKindDisplay(kind: LuxorPaymentRefundView['refund_kind']) {
  switch (kind) {
    case 'security_deposit':
      return { transactionTitle: 'Refundable security deposit', activityCategory: 'Security deposit refund', needsReview: false }
    case 'event_revenue':
      return { transactionTitle: 'Event revenue refund', activityCategory: 'Event revenue refund', needsReview: false }
    case 'unclassified':
    default:
      return { transactionTitle: 'Unclassified refund', activityCategory: 'Unclassified refund · needs review', needsReview: true }
  }
}

type Tab = 'dashboard' | 'revenue' | 'receivables' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'books'

export default function FinancesPage() {
  const reduceMotion = useReducedMotion()
  const routeSearchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [selectedPaymentRecord, setSelectedPaymentRecord] = useState<LuxorRevenueHistoryRow | null>(null)
  const [paymentScheduleBookingId, setPaymentScheduleBookingId] = useState<string | null>(null)
  const [isViewPickerOpen, setIsViewPickerOpen] = useState(false)
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [payments, setPayments] = useState<LuxorPayment[]>([])
  const [refunds, setRefunds] = useState<LuxorPaymentRefundView[]>([])
  const [installments, setInstallments] = useState<LuxorPaymentInstallment[]>([])
  const [allocations, setAllocations] = useState<LuxorFinanceAllocationRow[] | null>(null)
  const [bills, setBills] = useState<LuxorBill[] | null>(null)
  const [bookings, setBookings] = useState<BookingWithPayments[]>([])
  const [verifiedTestInquiryIds, setVerifiedTestInquiryIds] = useState<ReadonlySet<string>>(new Set())
  const [verifiedTestBookingIds, setVerifiedTestBookingIds] = useState<ReadonlySet<string>>(new Set())
  const [testClassificationVerified, setTestClassificationVerified] = useState(false)
  const refreshGeneration = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

type LuxorBookingExpense = {
  id: string
  created_at: string
  updated_at: string
  booking_id: string | null
  category: string
  description: string | null
  vendor_name: string | null
  amount: number | null
  incurred_on: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
  paid_amount?: number | null
  remaining_balance?: number | null
  payment_status?: 'expected' | 'due_today' | 'overdue' | 'partially_paid' | 'paid' | 'cancelled' | 'needs_review'
  payments?: Array<{ id: string; transaction_type: 'payment' | 'refund' | 'reversal'; amount: number }>
}

  // Add Expense form state
  const [isAddingExpense, setIsAddingExpense] = useState(false)
  const [expenseCategory, setExpenseCategory] = useState('Supplies')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseBookingId, setExpenseBookingId] = useState('')
  const [expenseStatus, setExpenseStatus] = useState('incurred')
  const [expenseActionError, setExpenseActionError] = useState<string | null>(null)
  const [expenseActionBusyId, setExpenseActionBusyId] = useState<string | null>(null)
  const [showCancelledExpenses, setShowCancelledExpenses] = useState(false)
  const [expenses, setExpenses] = useState<LuxorBookingExpense[]>([])

  const fetchFinanceData = async (silent = false) => {
    const generation = ++refreshGeneration.current
    try {
      if (!silent) {
        setLoading(true)
        setTestClassificationVerified(false)
      }
      setError(null)
      const [ledgerRes, sourcesRes] = await Promise.all([
        fetch('/api/portal/finance-overview-ledgers'),
        fetch('/api/portal/finance-overview-sources'),
      ])

      if (!ledgerRes.ok) throw new Error('Failed to load financial records.')
      const { invoices: invData, bookings: bookData, expenses: expData, payments: paymentData, installments: installmentData, refunds: refundData } = await ledgerRes.json()

      if (!Array.isArray(invData) || !Array.isArray(bookData) || !Array.isArray(expData) || !Array.isArray(paymentData) || !Array.isArray(installmentData) || !Array.isArray(refundData)) throw new Error('Financial records could not be verified.')
      if (generation !== refreshGeneration.current) return
      setInvoices(invData)
      setPayments(paymentData)
      setRefunds(refundData)
      setBookings(bookData)
      setExpenses(expData)
      setInstallments(installmentData)
      const sources = sourcesRes.ok ? await sourcesRes.json().catch(() => null) as { allocations?: LuxorFinanceAllocationRow[] | null; bills?: LuxorBill[] | null } | null : null
      if (generation !== refreshGeneration.current) return
      setAllocations(Array.isArray(sources?.allocations) ? sources.allocations : null)
      setBills(Array.isArray(sources?.bills) ? sources.bills : null)

      const inquiryIds = [...new Set([...invData, ...bookData, ...paymentData].map((record) => record.inquiry_id).filter((id): id is string => typeof id === 'string' && Boolean(id)))]
      const knownBookingIds = new Set(bookData.map((booking) => booking.id).filter((id): id is string => typeof id === 'string'))
      const bookingIds = [...new Set([...invData, ...expData, ...paymentData].map((record) => record.booking_id).filter((id): id is string => typeof id === 'string' && Boolean(id) && !knownBookingIds.has(id)))]
      const classifiedInquiryIds = new Set<string>()
      const classifiedBookingIds = new Set<string>()
      for (let offset = 0; offset < Math.max(inquiryIds.length, bookingIds.length); offset += 1000) {
        const inquiryBatch = inquiryIds.slice(offset, offset + 1000)
        const bookingBatch = bookingIds.slice(offset, offset + 1000)
        const classificationResponse = await fetch('/api/portal/test-inquiry-classification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryIds: inquiryBatch, bookingIds: bookingBatch }),
        })
        if (!classificationResponse.ok) throw new Error('Verified test classification is unavailable; business metrics are hidden.')
        const classification = await classificationResponse.json() as { testInquiryIds?: unknown; testBookingIds?: unknown; unresolvedBookingIds?: unknown }
        const requestedInquiryIds = new Set(inquiryBatch.map((id) => id.toLowerCase()))
        const requestedBookingIds = new Set(bookingBatch.map((id) => id.toLowerCase()))
        if (!Array.isArray(classification.testInquiryIds)
          || !classification.testInquiryIds.every((id) => typeof id === 'string' && requestedInquiryIds.has(id.toLowerCase()))
          || !Array.isArray(classification.testBookingIds)
          || !classification.testBookingIds.every((id) => typeof id === 'string' && requestedBookingIds.has(id.toLowerCase()))
          || !Array.isArray(classification.unresolvedBookingIds)
          || classification.unresolvedBookingIds.length > 0) {
          throw new Error('Verified test classification is unavailable; business metrics are hidden.')
        }
        classification.testInquiryIds.forEach((id: string) => classifiedInquiryIds.add(id.toLowerCase()))
        classification.testBookingIds.forEach((id: string) => classifiedBookingIds.add(id.toLowerCase()))
      }
      if (generation !== refreshGeneration.current) return
      setVerifiedTestInquiryIds(classifiedInquiryIds)
      setVerifiedTestBookingIds(classifiedBookingIds)
      setTestClassificationVerified(true)
    } catch (err) {
      if (generation !== refreshGeneration.current) return
      console.error(err)
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to fetch financial metrics.')
    } finally {
      if (generation === refreshGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchFinanceData()
  }, [])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void fetchFinanceData(true)
    }
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)
    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [])

  useEffect(() => {
    const syncViewFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      const view = params.get('view')
      const bookingId = params.get('bookingId')
      if (view === 'receivables' && bookingId) {
        setPaymentScheduleBookingId(bookingId)
        const url = new URL(window.location.href)
        url.searchParams.delete('bookingId')
        url.searchParams.delete('client')
        window.history.replaceState(window.history.state, '', url)
      }
      setActiveTab(view === 'revenue' || view === 'receivables' || view === 'invoices' || view === 'payments' || view === 'expenses' || view === 'books' ? view : 'dashboard')
    }
    syncViewFromUrl()
    window.addEventListener('popstate', syncViewFromUrl)
    return () => window.removeEventListener('popstate', syncViewFromUrl)
  }, [])

  useEffect(() => {
    const view = routeSearchParams.get('view')
    setActiveTab(view === 'revenue' || view === 'receivables' || view === 'invoices' || view === 'payments' || view === 'expenses' || view === 'books' ? view : 'dashboard')
  }, [routeSearchParams])

  const selectLegacyView = (tab: Tab) => {
    setActiveTab(tab)
    setSearchTerm('')
    const url = new URL(window.location.href)
    url.hash = ''
    if (tab === 'dashboard') url.searchParams.delete('view')
    else url.searchParams.set('view', tab)
    window.history.pushState({}, '', url)
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseAmount || !expenseDesc) return
    try {
      setExpenseActionError(null)
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: expenseBookingId || null,
          category: expenseCategory,
          amount: Number(expenseAmount),
          description: expenseDesc,
          incurred_on: new Date().toISOString().split('T')[0],
          status: expenseStatus,
        })
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to save expense.')
      }
      const newExp = await res.json()
      setExpenses((prev) => [newExp, ...prev])
      setExpenseDesc('')
      setExpenseAmount('')
      setExpenseBookingId('')
      setIsAddingExpense(false)
      setExpenseStatus('incurred')
    } catch (err) {
      console.error(err)
      setExpenseActionError(err instanceof Error ? err.message : 'Failed to save expense.')
    }
  }

  const handleRemoveExpense = async (expense: LuxorBookingExpense) => {
    const description = expense.description || 'this expense'
    const amountState = expenseAmountState(expense.amount, expense.metadata)
    if (!amountState.known || amountState.amount === null) return
    const amount = amountState.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (!window.confirm(`Remove “${description}” ($${amount}) from the expense totals? It will be marked cancelled and remain in the ledger history.`)) return
    try {
      setExpenseActionError(null)
      setExpenseActionBusyId(expense.id)
      const response = await fetch('/api/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: expense.id, status: 'cancelled' }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to remove expense.')
      }
      const updated = await response.json() as LuxorBookingExpense
      setExpenses((previous) => previous.map((item) => item.id === updated.id ? updated : item))
    } catch (err) {
      setExpenseActionError(err instanceof Error ? err.message : 'Failed to remove expense.')
    } finally {
      setExpenseActionBusyId(null)
    }
  }

  // Financial Calculations (Memoized for high performance)
  const businessRows = useMemo(() => getLuxorBusinessFinanceRows({
    invoices,
    bookings,
    expenses,
    testInquiryIds: verifiedTestInquiryIds,
    testBookingIds: verifiedTestBookingIds,
  }), [invoices, bookings, expenses, verifiedTestInquiryIds, verifiedTestBookingIds])
  const { expenses: businessExpenses } = businessRows
  const expenseBreakdown = useMemo(() => getLuxorPaidExpenseBreakdown(businessExpenses), [businessExpenses])
  const cancelledExpenseCount = businessExpenses.filter((expense) => expense.status === 'cancelled').length
  const visibleExpenses = businessExpenses.filter((expense) => showCancelledExpenses || expense.status !== 'cancelled')

  const overview = useMemo(() => getLuxorFinanceOverview({ invoices, bookings, payments, installments, refunds, testInquiryIds: businessRows.testInquiryIds, testBookingIds: businessRows.testBookingIds, testInvoiceIds: businessRows.testInvoiceIds, allocations }), [invoices, bookings, payments, installments, refunds, businessRows.testInquiryIds, businessRows.testBookingIds, businessRows.testInvoiceIds, allocations])

  // Payments extraction
  const receivablesModel = useMemo(() => {
    if (!testClassificationVerified || error) return null
    return getLuxorRevenueCollectionsModel({ invoices, bookings, payments, installments, refunds, testInquiryIds: businessRows.testInquiryIds, testBookingIds: businessRows.testBookingIds, testInvoiceIds: businessRows.testInvoiceIds, allocations }, { preset: 'this_month' })
  }, [testClassificationVerified, error, invoices, bookings, payments, installments, refunds, businessRows.testInquiryIds, businessRows.testBookingIds, businessRows.testInvoiceIds, allocations])
  const allPayments = payments.filter((payment) => payment.metadata?.is_test_record !== true)
    .filter((payment) => !(payment.booking_id && businessRows.testBookingIds.has(payment.booking_id.toLowerCase())))
    .filter((payment) => !(payment.inquiry_id && businessRows.testInquiryIds.has(payment.inquiry_id.toLowerCase())))
    .filter((payment) => !(payment.invoice_id && businessRows.testInvoiceIds.has(payment.invoice_id.toLowerCase())))
  const visibleRefunds = refunds.filter((refund) => refund.metadata?.is_test_record !== true)
    .filter((refund) => !(refund.booking_id && businessRows.testBookingIds.has(refund.booking_id.toLowerCase())))
    .filter((refund) => !(refund.inquiry_id && businessRows.testInquiryIds.has(refund.inquiry_id.toLowerCase())))
    .filter((refund) => !(refund.invoice_id && businessRows.testInvoiceIds.has(refund.invoice_id.toLowerCase())))
  const allLedgerTransactions: FinanceTransaction[] = [
    ...allPayments.map((payment) => ({ kind: 'payment' as const, payment })),
    ...visibleRefunds.map((refund) => ({ kind: 'refund' as const, refund })),
  ].sort((left, right) => {
    const leftAt = left.kind === 'payment' ? getLuxorPaymentCalendarDateKey({ received_date: left.payment.received_date, paid_at: left.payment.paid_at || left.payment.created_at }) : left.refund.completed_at || left.refund.requested_at
    const rightAt = right.kind === 'payment' ? getLuxorPaymentCalendarDateKey({ received_date: right.payment.received_date, paid_at: right.payment.paid_at || right.payment.created_at }) : right.refund.completed_at || right.refund.requested_at
    return Date.parse(rightAt || '') - Date.parse(leftAt || '')
  })

  // Filter invoices for Invoices tab
  const filteredInvoices = invoices.filter((inv) => {
    return (
      inv.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.event_type && inv.event_type.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })

  const FINANCE_TAB_LABELS: Record<Tab, string> = {
    dashboard: 'Financial Overview',
    revenue: 'Revenue',
    receivables: 'Payment Schedules',
    invoices: 'Invoices Ledger',
    payments: 'Payments Log',
    expenses: 'Expenses Tracking',
    reports: 'Financial Reports',
    books: 'Books & records',
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6 max-md:pt-4">
      <PortalPageHeader
        icon={<CurrencyDollar size={18} weight="regular" />}
        title="Finances"
        mobileActionsInline
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {/* iPad/Tablet Browse Views button (positioned immediately to the left of action buttons) */}
            <button
              type="button"
              onClick={() => setIsViewPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isViewPickerOpen}
              aria-label={`Browse views. Currently viewing ${FINANCE_TAB_LABELS[activeTab] || 'Overview'}`}
              className="hidden md:inline-flex min-h-10 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-1.5 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
            >
              <Menu size={16} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)] leading-none">Browse views</span>
                <span className="mt-0.5 block truncate text-xs font-bold leading-tight max-w-[130px] lg:max-w-[170px]">
                  {FINANCE_TAB_LABELS[activeTab] || 'Financial Overview'}
                </span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
            </button>
          </div>
        }
      />

      {/* Mobile-only condensed view picker button (matches Leads, Marketing, and Planner) */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setIsViewPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isViewPickerOpen}
          className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45"
        >
          <Menu size={18} className="text-[#a8792f] shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span>
            <span className="mt-0.5 block truncate text-sm font-bold">
              {FINANCE_TAB_LABELS[activeTab] || 'Financial Overview'}
            </span>
          </span>
          <ChevronDown size={17} className="text-[color:var(--portal-muted)] shrink-0" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400 shrink-0">
          Telemetry Alert: {error}
        </div>
      )}

      <FinanceBrowseViews
        open={isViewPickerOpen}
        close={() => setIsViewPickerOpen(false)}
        currentView={(activeTab === 'dashboard' ? 'overview' : activeTab) as FinanceBrowseView}
        onLegacySelect={selectLegacyView}
      />

      <FinanceMainTabs activeTab={activeTab} onLocalSelect={selectLegacyView} />

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden">
      {activeTab === 'revenue' && <div className="h-full overflow-y-auto pb-6 portal-scrollbar"><RevenueCollectionsView view="revenue" actorEmail={null} embedded /></div>}
      {activeTab === 'books' && <div className="h-full overflow-y-auto pb-6 portal-scrollbar"><BooksRecordsPage embedded /></div>}
      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (loading || (!error && testClassificationVerified)) && (
        <FinancialOverview
          loading={loading}
          overview={overview}
          expenses={expenseBreakdown}
          bills={bills}
          openView={selectLegacyView}
          onRefresh={() => { void fetchFinanceData(true) }}
          activity={allLedgerTransactions.flatMap((transaction) => {
            if (transaction.kind === 'payment') {
              const payment = transaction.payment
              if (payment.status !== 'paid') return []
              return [{ id: payment.id, date: getLuxorPaymentCalendarDateKey(payment), description: payment.notes || 'Payment received', category: String(payment.metadata?.payment_kind || 'Payment'), amount: Number(payment.amount || 0), type: 'Payment' }]
            }
            const refund = transaction.refund
            if (refund.status !== 'succeeded') return []
            const display = refundKindDisplay(refund.refund_kind)
            return [{ id: refund.id, date: getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: refund.completed_at }), description: display.needsReview ? 'Unclassified refund · needs review' : 'Refund completed', category: display.activityCategory, amount: Number(refund.amount || 0), type: 'Refund' }]
          })}
        />
      )}
      {activeTab === 'dashboard' && !loading && !testClassificationVerified && (
        <p role="status" className="p-4 text-sm text-[color:var(--portal-muted)]">Business metrics are unavailable until test records are verified. Reload the page to try again.</p>
      )}

        {activeTab === 'receivables' && (
          <div className="h-full overflow-y-auto pb-6 portal-scrollbar">
            {loading && !receivablesModel ? <p role="status" className="p-4 text-sm text-[color:var(--portal-muted)]">Loading receivables…</p> : receivablesModel ? <ReceivablesView model={receivablesModel} onOpenSchedule={setPaymentScheduleBookingId} /> : <p role="alert" className="p-4 text-sm text-[color:var(--portal-muted)]">Receivables are unavailable until financial records are verified.</p>}
          </div>
        )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <PortalTableCard
            controls={
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="relative w-full md:w-96 group">
                  <MagnifyingGlass size={16} weight="regular" className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search invoices by client..."
                    className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-lg pl-10 pr-4 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 transition-all"
                  />
                </div>
              </div>
            }
            footer={
              <div className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-widest tabular-nums min-h-[16px] flex items-center">
                {loading ? (
                  <PortalSkeleton className="h-3 w-28 rounded inline-block" />
                ) : (
                  `${filteredInvoices.length} matching invoices`
                )}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="980px">
                <caption className="sr-only">{loading ? 'Loading invoices' : 'Invoices'}</caption>
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                    <th className="px-8 py-5">Invoice ID</th>
                    <th className="px-6 py-5">Client Portfolio</th>
                    <th className="px-6 py-5">Value (USD)</th>
                    <th className="px-6 py-5">Due Date</th>
                    <th className="px-6 py-5">Lifecycle Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </PortalStickyThead>
                <AnimatePresence mode="wait">
                  <motion.tbody
                    key={loading ? 'loading' : 'loaded'}
                    className="divide-y divide-[color:var(--portal-border)]/50 motion-reduce:!opacity-100 motion-reduce:![filter:none]"
                    aria-busy={loading}
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={reduceMotion ? { opacity: 1 } : { opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                  >
                  {loading ? (
                    Array.from({ length: 5 }, (_, row) => (
                      <tr key={row} aria-hidden="true">
                        <td className="px-8 py-5"><PortalSkeleton className="h-3 w-16 rounded" /></td>
                        <td className="px-6 py-5"><div className="space-y-1"><PortalSkeleton className="h-3 w-28 rounded" /><PortalSkeleton className="h-2.5 w-20 rounded" /></div></td>
                        <td className="px-6 py-5"><PortalSkeleton className="h-4 w-20 rounded" /></td>
                        <td className="px-6 py-5"><PortalSkeleton className="h-3 w-20 rounded" /></td>
                        <td className="px-6 py-5"><PortalSkeleton className="h-5 w-16 rounded-md" /></td>
                        <td className="px-8 py-5"><PortalSkeleton className="ml-auto h-3 w-32 rounded" /></td>
                      </tr>
                    ))
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-xs text-[color:var(--portal-muted)]">No invoices matching criteria.</td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{inv.id.slice(0, 8)}</td>
                        <td className="px-6 py-5">
                          {inv.inquiry_id ? (
                            <Link
                              href={`/portal/leads/${inv.inquiry_id}?from=/portal/finances`}
                              className="inline-block text-xs font-bold leading-none text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a]"
                            >
                              {inv.client_name}
                            </Link>
                          ) : (
                            <p className="text-xs font-bold text-[color:var(--portal-text)] leading-none">{inv.client_name}</p>
                          )}
                          <p className="text-[10px] text-[color:var(--portal-muted)] mt-1">{inv.event_type || 'Event not specified'}</p>
                        </td>
                        <td className="px-6 py-5 tabular-nums font-bold text-[color:var(--portal-text)]">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{inv.due_date || 'TBD'}</td>
                        <td className="px-6 py-5">
                          <PortalStatusBadge status={inv.status} borderless />
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="text-[10px] font-medium text-[color:var(--portal-muted)]">Use send and payment workflows</span>
                        </td>
                      </tr>
                    ))
                  )}
                </motion.tbody>
                </AnimatePresence>
              </PortalStickyTable>
            </div>
          </PortalTableCard>
        )}

        {/* PAYMENTS TAB */}
        {(activeTab === 'payments' || activeTab === 'receivables') && !loading && !error && testClassificationVerified && (
          <div hidden>
            <FinancialOverview overview={overview} expenses={expenseBreakdown} bills={bills} openView={selectLegacyView} onRefresh={() => { void fetchFinanceData(true) }} requestedScheduleBookingId={paymentScheduleBookingId} onRequestedScheduleClosed={() => setPaymentScheduleBookingId(null)} />
          </div>
        )}
        {activeTab === 'payments' && (
          <PortalTableCard
            controls={
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)] tabular-nums flex items-center gap-1.5">
                <span>Payment and Refund Transactions</span>
                {loading ? (
                  <PortalSkeleton className="inline-block h-3.5 w-8 rounded align-middle" />
                ) : (
                  <span>({allLedgerTransactions.length})</span>
                )}
              </h3>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="900px">
                <caption className="sr-only">{loading ? 'Loading payment records' : 'Payment and Refund Transactions'}</caption>
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                    <th className="px-8 py-5">Transaction Ref</th>
                    <th className="px-6 py-5">Client & Event</th>
                    <th className="px-6 py-5">Payment Method</th>
                    <th className="px-6 py-5">Received / Completed Date</th>
                    <th className="px-8 py-5 text-right">Amount</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                  {loading ? (
                    Array.from({ length: 5 }, (_, row) => (
                      <tr key={row} aria-hidden="true">
                        <td className="px-8 py-5"><PortalSkeleton className="h-3.5 w-20 rounded" /></td>
                        <td className="px-6 py-5">
                          <div className="space-y-1">
                            <PortalSkeleton className="h-3.5 w-36 rounded" />
                            <PortalSkeleton className="h-2.5 w-20 rounded" />
                          </div>
                        </td>
                        <td className="px-6 py-5"><PortalSkeleton className="h-3.5 w-24 rounded" /></td>
                        <td className="px-6 py-5"><PortalSkeleton className="h-3.5 w-20 rounded" /></td>
                        <td className="px-8 py-5 text-right"><PortalSkeleton className="ml-auto h-4 w-20 rounded" /></td>
                      </tr>
                    ))
                  ) : allLedgerTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-12 text-center text-xs text-[color:var(--portal-muted)]">No payment transaction records found.</td>
                    </tr>
                  ) : (
                    allLedgerTransactions.map((transaction, idx) => {
                      const isRefund = transaction.kind === 'refund'
                      const id = isRefund ? transaction.refund.id : transaction.payment.id
                      const status = isRefund ? transaction.refund.status : transaction.payment.status
                      const amount = isRefund ? Number(transaction.refund.amount || 0) : Number(transaction.payment.amount || 0)
                      const at = isRefund ? transaction.refund.completed_at || transaction.refund.requested_at : getLuxorPaymentCalendarDateKey({ received_date: transaction.payment.received_date, paid_at: transaction.payment.paid_at || transaction.payment.created_at })
                      const historyRow = receivablesModel?.paymentHistory.find((row) => row.id === `${transaction.kind}:${id}`)
                      const refundDisplay = isRefund ? refundKindDisplay(transaction.refund.refund_kind) : null
                      const refundStatus = status === 'succeeded' ? 'Refund completed' : `Refund ${status}`
                      const label = isRefund
                        ? `${refundDisplay?.needsReview ? 'Needs review · ' : ''}${refundStatus}`
                        : status === 'refunded' ? 'Legacy refund needs review' : status === 'paid' ? 'Payment recorded' : `Payment ${status}`

                      const transactionBookingId = isRefund ? transaction.refund.booking_id : transaction.payment.booking_id
                      const invoiceId = isRefund ? transaction.refund.invoice_id : transaction.payment.invoice_id
                      const bookingId = transactionBookingId || (invoiceId ? invoices.find((invoice) => invoice.id === invoiceId)?.booking_id : null)
                      const booking = bookingId ? bookings.find((b) => b.id === bookingId) : null
                      const hasSchedule = Boolean(bookingId && overview.reportingRows.acceptedInvoiceRows.some((row) => row.invoice.booking_id === bookingId) && overview.reportingRows.scheduleRows.some((row) => row.bookingId === bookingId))
                      const clientName = booking?.client_name || null
                      const eventType = booking?.event_type || null
                      const inquiryId = booking?.inquiry_id || (invoiceId ? invoices.find((invoice) => invoice.id === invoiceId)?.inquiry_id : null) || (isRefund ? transaction.refund.inquiry_id : transaction.payment.inquiry_id)

                      return <tr key={`${transaction.kind}-${id || idx}`} onClick={hasSchedule ? () => setPaymentScheduleBookingId(bookingId!) : undefined} className={hasSchedule ? 'cursor-pointer transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:bg-[color:var(--portal-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#caa24c]' : ''}>
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{id?.slice(0, 10) || `TX-00${idx}`}</td>
                        <td className="px-6 py-5">
                          {inquiryId && clientName ? (
                            <Link href={`/portal/leads/${encodeURIComponent(inquiryId)}?from=${encodeURIComponent('/portal/finances?view=payments')}`} onClick={(event) => event.stopPropagation()} className="group inline-flex min-h-10 max-w-full items-start gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" aria-label={`Open ${clientName} contact`}>
                              <span className="shrink-0 transition-transform duration-200 group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100"><PortalContactAvatar name={clientName} size="sm" className="h-8 w-8 text-[10px]" /></span>
                              <span className="min-w-0"><span className="block text-xs font-bold leading-none text-[color:var(--portal-text)] transition-colors group-hover:text-[#a8792f] group-focus-visible:text-[#a8792f] dark:group-hover:text-[#e6c77f] dark:group-focus-visible:text-[#e6c77f]">{clientName}</span>{eventType && <span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">{eventType}</span>}</span>
                            </Link>
                          ) : <div className="flex items-start gap-3">{clientName && <PortalContactAvatar name={clientName} size="sm" className="h-8 w-8 shrink-0 text-[10px]" />}<div className="min-w-0"><p className="text-xs font-bold leading-none text-[color:var(--portal-text)]">{clientName || refundDisplay?.transactionTitle || (transaction.kind === 'payment' ? transaction.payment.notes || 'Event Booking Retainer' : 'Refund')}</p>{eventType && <p className="mt-0.5 text-[11px] text-[color:var(--portal-muted)]">{eventType}</p>}</div></div>}
                          {hasSchedule && <button type="button" onClick={(event) => { event.stopPropagation(); setPaymentScheduleBookingId(bookingId!) }} className="sr-only focus:not-sr-only focus:mt-2 focus:inline-flex focus:min-h-10 focus:items-center focus:rounded focus:px-2 focus:text-xs focus:text-[#a8792f] focus:outline-none focus:ring-2 focus:ring-[#caa24c]/50">View {clientName || 'client'} payment schedule</button>}
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs text-[color:var(--portal-muted)] font-medium">{isRefund ? transaction.refund.processor || 'Not recorded' : transaction.payment.payment_method || 'Not recorded'}</p>
                          <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${isRefund || status === 'refunded' ? 'text-rose-600 dark:text-rose-400' : 'text-[#caa24c]'}`}>{label}</p>
                        </td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{formatLuxorDate(at) || 'N/A'}</td>
                        <td className="px-8 py-5 text-right tabular-nums font-bold text-[color:var(--portal-text)]">{isRefund && status === 'succeeded' ? '-' : !isRefund && status === 'paid' ? '+' : ''}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{historyRow && <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedPaymentRecord(historyRow) }} onKeyDown={(event) => event.stopPropagation()} className="ml-3 inline-flex min-h-10 items-center rounded-lg px-2 text-xs font-semibold text-[#9a712e] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 dark:text-[#e6c77f]">Details</button>}</td>
                      </tr>
                    })
                  )}
                </tbody>
              </PortalStickyTable>
            </div>
          </PortalTableCard>
        )}

        <PaymentHistoryDetails row={selectedPaymentRecord} onClose={() => setSelectedPaymentRecord(null)} />

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Operations expense ledger</h3>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/portal/finances/expenses" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Open Expense Management</Link>
                {cancelledExpenseCount > 0 && <button type="button" onClick={() => setShowCancelledExpenses((show) => !show)} className="text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">{showCancelledExpenses ? 'Hide' : 'Show'} removed ({cancelledExpenseCount})</button>}
                <button
                  type="button"
                  onClick={() => { setExpenseActionError(null); setIsAddingExpense(!isAddingExpense) }}
                  className="luxor-gold-raised inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold !text-white"
                >
                  {isAddingExpense ? <X size={16} weight="regular" /> : <Plus size={16} weight="regular" />} {isAddingExpense ? 'Close form' : 'Log expense'}
                </button>
              </div>
            </div>

            {expenseActionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">{expenseActionError}</p>}

            {isAddingExpense && (
              <form onSubmit={handleAddExpense} className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 max-w-md">
                <h4 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Log Operational Expense</h4>
                <p className="text-xs text-[color:var(--portal-muted)]">Payments must be recorded separately from the expense. Use Expense Management for payment history, receipts, and recurring costs.</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Booking (optional)</label>
                    <PortalSelect
                      value={expenseBookingId}
                      onChange={setExpenseBookingId}
                      options={[
                        { value: '', label: 'General overhead (not linked to a booking)' },
                        ...businessRows.bookings.map((booking) => ({
                          value: booking.id,
                          label: `${booking.client_name} - ${booking.event_date || 'Date not set'} - ${booking.event_type || 'Event'}`,
                        })),
                      ]}
                      aria-label="Expense booking"
                    />
                    <p className="text-[10px] text-[color:var(--portal-muted)]">Leave this set to general overhead for costs that are not tied to one event.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Category</label>
                    <PortalSelect
                      aria-label="Expense category"
                      value={expenseCategory}
                      onChange={setExpenseCategory}
                      options={[
                        { value: 'Rent', label: 'Rent / Venue Lease' },
                        { value: 'Maintenance', label: 'Maintenance / Repairs' },
                        { value: 'Utilities', label: 'Utilities (Electric/Water)' },
                        { value: 'Supplies', label: 'Cleaning & Hospitality Supplies' },
                        { value: 'Marketing', label: 'Marketing & Ad Spend' }
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--portal-muted)]">Expense status</label>
                    <PortalSelect
                      value={expenseStatus}
                      onChange={setExpenseStatus}
                      options={[
                        { value: 'planned', label: 'Planned - not incurred' },
                        { value: 'incurred', label: 'Incurred - unpaid' },
                      ]}
                      aria-label="Expense status"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="expense-amount" className="text-xs font-semibold text-[color:var(--portal-muted)]">Cost (USD)</label>
                    <input
                      id="expense-amount"
                      type="number"
                      required
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="120.00"
                      className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="expense-description" className="text-xs font-semibold text-[color:var(--portal-muted)]">Description</label>
                    <input
                      id="expense-description"
                      type="text"
                      required
                      value={expenseDesc}
                      onChange={(e) => setExpenseDesc(e.target.value)}
                      placeholder="HVAC Air Filter replacement..."
                      className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => setIsAddingExpense(false)} className="px-3 py-2 border border-transparent text-xs font-bold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] cursor-pointer">Cancel</button>
                  <button type="submit" className="luxor-gold-raised min-h-10 rounded-lg px-4 py-2 text-xs font-bold !text-white">Save Cost</button>
                </div>
              </form>
            )}

            <PortalTableCard>
              <div className="overflow-x-auto">
                <PortalStickyTable minWidth="980px">
                  <caption className="sr-only">{loading ? 'Loading expenses' : 'Expenses'}</caption>
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                      <th className="px-8 py-5">Date</th>
                      <th className="px-6 py-5">Description</th>
                      <th className="px-6 py-5">Category</th>
                      <th className="px-6 py-5">Status</th>
                      <th className="px-8 py-5 text-right">Expense (USD)</th>
                      <th className="px-6 py-5 text-right">Actions</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                    {loading ? (
                      Array.from({ length: 5 }, (_, row) => (
                        <tr key={row} aria-hidden="true">
                          <td className="px-8 py-5"><PortalSkeleton className="h-3.5 w-20 rounded" /></td>
                          <td className="px-6 py-5"><PortalSkeleton className="h-3.5 w-44 rounded" /></td>
                          <td className="px-6 py-5"><PortalSkeleton className="h-4 w-20 rounded-full" /></td>
                          <td className="px-6 py-5"><PortalSkeleton className="h-3.5 w-24 rounded" /></td>
                          <td className="px-8 py-5 text-right"><PortalSkeleton className="ml-auto h-4 w-16 rounded" /></td>
                          <td className="px-6 py-5 text-right"><PortalSkeleton className="ml-auto h-3.5 w-14 rounded" /></td>
                        </tr>
                      ))
                    ) : (
                      visibleExpenses.map((exp) => (
                        <tr key={exp.id} className={`hover:bg-[color:var(--portal-soft)]/50 transition-colors ${exp.status === 'cancelled' ? 'opacity-60' : ''}`}>
                          <td className="px-8 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">
                            {formatLuxorDate(exp.incurred_on) || 'N/A'}
                          </td>
                          <td className="px-6 py-5 font-bold text-[color:var(--portal-text)]">
                            {exp.description || 'General Operational Expense'}
                          </td>
                          <td className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-[#a37d2c] dark:text-[#caa24c]">{exp.category}</td>
                          <td className="px-6 py-5 text-xs capitalize text-[color:var(--portal-muted)]">{exp.payment_status === 'cancelled' || exp.status === 'cancelled' ? 'Canceled' : exp.payment_status === 'needs_review' || exp.paid_amount == null || exp.remaining_balance == null ? 'Needs review' : exp.payment_status === 'overdue' ? 'Overdue' : exp.payment_status === 'due_today' ? 'Due today' : exp.payment_status === 'partially_paid' ? 'Partially paid' : exp.payment_status === 'paid' ? 'Paid' : exp.status === 'incurred' ? 'Incurred - unpaid' : 'Expected'}</td>
                          <td className="px-8 py-5 text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
                            {(() => {
                              const state = expenseAmountState(exp.amount, exp.metadata)
                              if (!state.known || state.amount === null) return exp.metadata?.amount_state === 'variable' ? 'Variable amount' : exp.metadata?.amount_state === 'unknown' ? 'Unknown amount' : 'Amount pending'
                              return `${exp.status === 'cancelled' ? '' : '-'}${state.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
                            })()}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {exp.status !== 'cancelled' && <Link href={`/portal/finances/expenses/${encodeURIComponent(exp.id)}`} className="text-xs font-semibold text-[#9a712e] underline decoration-[color:var(--portal-border)] underline-offset-4 dark:text-[#e6c77f]">Details</Link>}
                              {exp.status !== 'cancelled' && exp.payment_status !== 'needs_review' && expenseAmountState(exp.amount, exp.metadata).known && exp.paid_amount === 0 && exp.remaining_balance != null && Array.isArray(exp.payments) && exp.payments.length === 0 && <button type="button" onClick={() => void handleRemoveExpense(exp)} disabled={expenseActionBusyId === exp.id} aria-label={`Cancel ${exp.description || 'expense'}`} className="text-xs font-semibold text-[color:var(--portal-muted)] underline decoration-[color:var(--portal-border)] underline-offset-4 hover:text-rose-700 dark:hover:text-rose-300 disabled:opacity-50">{expenseActionBusyId === exp.id ? 'Canceling...' : 'Cancel'}</button>}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                    {!loading && visibleExpenses.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-xs text-[color:var(--portal-muted)]">No expenses are recorded in this view.</td></tr>}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

      </PortalTabTransition>
    </PortalPageFrame>
  )
}
