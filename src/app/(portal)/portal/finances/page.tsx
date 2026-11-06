'use client'

import React, { useEffect, useState, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import {
  FileText,
  Search,
  DollarSign,
  TrendingUp,
  CreditCard,
  TrendingDown,
  RefreshCw,
  Menu,
  Eye,
  Plus,
  X
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalModal,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSelect,
  PortalButton,
  PortalSkeleton
} from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import FinancialOverview from '@/components/portal/FinancialOverview'
import type { LuxorInvoice, LuxorBooking, LuxorPayment, LuxorPaymentRefundView, LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { formatLuxorPaymentCalendarDate, getLuxorBusinessFinanceRows, getLuxorFinanceOverview, getLuxorPaidExpenseBreakdown, getLuxorPaymentCalendarDateKey, type LuxorFinanceAllocationRow } from '@/lib/luxorFinanceReporting'

type BookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

type FinanceTransaction = { kind: 'payment'; payment: LuxorPayment } | { kind: 'refund'; refund: LuxorPaymentRefundView }

type Tab = 'dashboard' | 'invoices' | 'payments' | 'expenses' | 'reports'

function FinanceBrowseViews({ open, close, activeTab, select }: { open: boolean; close: () => void; activeTab: Tab; select: (tab: Tab) => void }) {
  const buttonClass = 'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-medium text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60'
  const choose = (tab: Tab) => { select(tab); close() }
  const row = (label: string, tab: Tab) => <button type="button" onClick={() => choose(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={buttonClass}><span>{label}</span>{activeTab === tab && <span className="text-xs text-[color:var(--portal-muted)]">Current view</span>}</button>
  const heading = (label: string) => <h4 className="px-3 pt-3 text-xs font-semibold text-[color:var(--portal-muted)]">{label}</h4>
  const later = <p className="px-3 py-2 text-sm text-[color:var(--portal-muted)]">Planned for a later phase</p>
  return <PortalModal isOpen={open} onClose={close} title="Browse views" description="Choose a working view or see what is planned." maxWidth="max-w-xl" animateClose>
    <nav aria-label="Financial Center views" className="space-y-1 divide-y divide-[color:var(--portal-border)]">
      <section>{heading('Financial Overview')}{row('Financial Overview', 'dashboard')}</section>
      <section>{heading('Revenue & Collections')}{row('Invoices ledger', 'invoices')}{row('Payments log', 'payments')}</section>
      <section>{heading('Expense Management')}{row('Expense ledger', 'expenses')}</section>
      <section>{heading('Event Profitability')}{later}</section>
      <section>{heading('Bills & Vendors')}<Link href="/portal/operations?tab=bills" onClick={close} className={buttonClass}><span>Open Operations bills</span><span className="text-xs text-[color:var(--portal-muted)]">Operations access</span></Link></section>
      <section>{heading('Budgeting & Forecasting')}{later}</section>
      <section>{heading('Financial Reports')}{row('Financial Reports', 'reports')}</section>
      <section>{heading('Accounting')}{later}</section>
    </nav>
  </PortalModal>
}

export default function FinancesPage() {
  const reduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
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
  amount: number
  incurred_on: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
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

  const fetchFinanceData = async () => {
    const generation = ++refreshGeneration.current
    try {
      setLoading(true)
      setError(null)
      setTestClassificationVerified(false)
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
      setError(err instanceof Error ? err.message : 'Failed to fetch financial metrics.')
    } finally {
      if (generation === refreshGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchFinanceData()
  }, [])

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
    const amount = Number(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
  const { invoices: businessInvoices, expenses: businessExpenses } = businessRows
  const expenseBreakdown = useMemo(() => getLuxorPaidExpenseBreakdown(businessExpenses), [businessExpenses])
  const cancelledExpenseCount = businessExpenses.filter((expense) => expense.status === 'cancelled').length
  const visibleExpenses = businessExpenses.filter((expense) => showCancelledExpenses || expense.status !== 'cancelled')

  const overview = useMemo(() => getLuxorFinanceOverview({ invoices, bookings, payments, installments, refunds, testInquiryIds: businessRows.testInquiryIds, testBookingIds: businessRows.testBookingIds, testInvoiceIds: businessRows.testInvoiceIds, allocations }), [invoices, bookings, payments, installments, refunds, businessRows.testInquiryIds, businessRows.testBookingIds, businessRows.testInvoiceIds, allocations])

  // Payments extraction
  const allPayments = payments.filter((payment) => payment.status === 'paid' || payment.status === 'refunded')
    .filter((payment) => payment.metadata?.is_test_record !== true)
    .filter((payment) => !(payment.booking_id && businessRows.testBookingIds.has(payment.booking_id.toLowerCase())))
    .filter((payment) => !(payment.inquiry_id && businessRows.testInquiryIds.has(payment.inquiry_id.toLowerCase())))
    .filter((payment) => !(payment.invoice_id && businessRows.testInvoiceIds.has(payment.invoice_id.toLowerCase())))
  const visibleRefunds = refunds.filter((refund) => refund.metadata?.is_test_record !== true)
    .filter((refund) => !businessRows.testBookingIds.has(refund.booking_id.toLowerCase()))
    .filter((refund) => !businessRows.testInquiryIds.has(refund.inquiry_id?.toLowerCase() || ''))
    .filter((refund) => !businessRows.testInvoiceIds.has(refund.invoice_id.toLowerCase()))
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

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<DollarSign size={18} />}
        title="Finances"
        actions={
          <div className="flex items-center gap-2">
            <PortalButton onClick={() => setIsViewPickerOpen(true)}><Menu size={14} /> Browse views</PortalButton>
            <PortalButton onClick={fetchFinanceData}>
              <RefreshCw size={13} /> Refresh Ledger
            </PortalButton>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400 shrink-0">
          Telemetry Alert: {error}
        </div>
      )}

      <FinanceBrowseViews open={isViewPickerOpen} close={() => setIsViewPickerOpen(false)} activeTab={activeTab} select={(tab) => { setActiveTab(tab); setSearchTerm('') }} />

      {/* Desktop rectangular sliding tabs */}
      <div className="hidden shrink-0 xl:flex">
        <PortalAnimatedTabs
          variant="slider"
          ariaLabel="Finances sections"
          tabs={[
            { id: 'dashboard', label: 'Financial Overview', icon: <TrendingUp size={15} /> },
            { id: 'invoices', label: 'Invoices Ledger', icon: <FileText size={15} /> },
            { id: 'payments', label: 'Payments Log', icon: <CreditCard size={15} /> },
            { id: 'expenses', label: 'Expenses Tracking', icon: <TrendingDown size={15} /> },
            { id: 'reports', label: 'Financial Reports', icon: <Eye size={15} /> },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab as Tab); setSearchTerm('') }}
        />
      </div>

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden">
      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && loading && <div role="status" aria-label="Loading financial overview" className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <PortalSkeleton key={index} className="h-36 rounded-2xl" />)}</div>}
      {activeTab === 'dashboard' && !loading && !testClassificationVerified && (
        <p role="status" className="p-4 text-sm text-[color:var(--portal-muted)]">Business metrics are unavailable until test records are verified. Refresh the ledger to retry.</p>
      )}
      {activeTab === 'dashboard' && testClassificationVerified && !error && !loading && (
        <FinancialOverview overview={overview} expenses={expenseBreakdown} bills={bills} openView={setActiveTab} activity={allLedgerTransactions.flatMap((transaction) => {
          if (transaction.kind === 'payment') {
            const payment = transaction.payment
            if (payment.status !== 'paid') return []
            return [{ id: payment.id, date: getLuxorPaymentCalendarDateKey(payment), description: payment.notes || 'Payment received', category: String(payment.metadata?.payment_kind || 'Payment'), amount: Number(payment.amount || 0), type: 'Payment' }]
          }
          const refund = transaction.refund
          if (refund.status !== 'succeeded') return []
          return [{ id: refund.id, date: getLuxorPaymentCalendarDateKey({ received_date: null, paid_at: refund.completed_at }), description: 'Refund completed', category: refund.refund_kind === 'security_deposit' ? 'Security deposit' : 'Event', amount: Number(refund.amount || 0), type: 'Refund' }]
        })} />
      )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <PortalTableCard
            controls={
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <div className="relative w-full md:w-96 group">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" />
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
              <div className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-widest tabular-nums">
                {filteredInvoices.length} matching invoices
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
                              href={`/portal/leads/${inv.inquiry_id}`}
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
        {activeTab === 'payments' && (
          <PortalTableCard
            controls={
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)] tabular-nums">Payment and Refund Transactions ({allLedgerTransactions.length})</h3>
            }
          >
            <div className="overflow-x-auto">
              <PortalStickyTable minWidth="900px">
                <PortalStickyThead>
                  <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                    <th className="px-8 py-5">Transaction Ref</th>
                    <th className="px-6 py-5">Source Detail</th>
                    <th className="px-6 py-5">Payment Method</th>
                    <th className="px-6 py-5">Received / Completed Date</th>
                    <th className="px-8 py-5 text-right">Settled Amount</th>
                  </tr>
                </PortalStickyThead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                  {allLedgerTransactions.length === 0 ? (
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
                      const label = isRefund ? (status === 'succeeded' ? 'Refund completed' : `Refund ${status}`) : status === 'refunded' ? 'Legacy refund needs review' : 'Payment recorded'
                      return <tr key={`${transaction.kind}-${id || idx}`} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{id?.slice(0, 10) || `TX-00${idx}`}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-[color:var(--portal-text)] leading-none">{isRefund ? 'Refundable security deposit' : transaction.payment.notes || 'Event Booking Retainer'}</p>
                          <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${isRefund || status === 'refunded' ? 'text-rose-600 dark:text-rose-400' : 'text-[#caa24c]'}`}>{label}</p>
                        </td>
                        <td className="px-6 py-5 text-xs text-[color:var(--portal-muted)] font-medium">{isRefund ? 'Stripe' : transaction.payment.payment_method || 'Bank Transfer'}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{at ? isRefund ? new Date(at).toLocaleDateString() : formatLuxorPaymentCalendarDate(at) : 'N/A'}</td>
                        <td className={`px-8 py-5 text-right tabular-nums font-bold ${isRefund || status === 'refunded' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{isRefund ? status === 'succeeded' ? '-' : '' : status === 'refunded' ? '-' : '+'}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    })
                  )}
                </tbody>
              </PortalStickyTable>
            </div>
          </PortalTableCard>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Operations expense ledger</h3>
              <div className="flex flex-wrap items-center gap-3">
                {cancelledExpenseCount > 0 && <button type="button" onClick={() => setShowCancelledExpenses((show) => !show)} className="text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">{showCancelledExpenses ? 'Hide' : 'Show'} removed ({cancelledExpenseCount})</button>}
                <button
                  type="button"
                  onClick={() => { setExpenseActionError(null); setIsAddingExpense(!isAddingExpense) }}
                  className="luxor-gold-raised inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold !text-white"
                >
                  {isAddingExpense ? <X size={14} /> : <Plus size={14} />} {isAddingExpense ? 'Close form' : 'Log expense'}
                </button>
              </div>
            </div>

            {expenseActionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">{expenseActionError}</p>}

            {isAddingExpense && (
              <form onSubmit={handleAddExpense} className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 max-w-md">
                <h4 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Log Operational Expense</h4>
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
                        { value: 'paid', label: 'Paid' },
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
                  <PortalStickyThead>
                    <tr className="text-[10px] uppercase font-bold text-[color:var(--portal-muted)] tracking-[0.16em] border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/80">
                      <th className="px-8 py-5">Date</th>
                      <th className="px-6 py-5">Description</th>
                      <th className="px-6 py-5">Category</th>
                      <th className="px-6 py-5">Status</th>
                      <th className="px-8 py-5 text-right">Debit (USD)</th>
                      <th className="px-6 py-5 text-right">Actions</th>
                    </tr>
                  </PortalStickyThead>
                  <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                    {visibleExpenses.map((exp) => (
                      <tr key={exp.id} className={`hover:bg-[color:var(--portal-soft)]/50 transition-colors ${exp.status === 'cancelled' ? 'opacity-60' : ''}`}>
                        <td className="px-8 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">
                          {exp.incurred_on ? new Date(exp.incurred_on).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-5 font-bold text-[color:var(--portal-text)]">
                          {exp.description || 'General Operational Expense'}
                        </td>
                        <td className="px-6 py-5 font-bold uppercase tracking-wider text-[10px] text-[#a37d2c] dark:text-[#caa24c]">{exp.category}</td>
                        <td className="px-6 py-5 text-xs capitalize text-[color:var(--portal-muted)]">{exp.status === 'cancelled' ? 'Removed' : exp.status === 'incurred' ? 'Incurred - unpaid' : exp.status === 'paid' ? 'Paid' : 'Planned'}</td>
                        <td className="px-8 py-5 text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
                          {exp.status === 'cancelled' ? '' : '-'}${Number(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-5 text-right">
                          {exp.status !== 'cancelled' && <button type="button" onClick={() => void handleRemoveExpense(exp)} disabled={expenseActionBusyId === exp.id} aria-label={`Remove ${exp.description || 'expense'}`} className="text-xs font-semibold text-[color:var(--portal-muted)] underline decoration-[color:var(--portal-border)] underline-offset-4 hover:text-rose-700 dark:hover:text-rose-300 disabled:opacity-50">{expenseActionBusyId === exp.id ? 'Removing...' : 'Remove'}</button>}
                        </td>
                      </tr>
                    ))}
                    {visibleExpenses.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-xs text-[color:var(--portal-muted)]">No expenses are recorded in this view.</td></tr>}
                  </tbody>
                </PortalStickyTable>
              </div>
            </PortalTableCard>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
            <MagicCard className="rounded-2xl p-6">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Live Business Reports</h3>
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-[color:var(--portal-muted)]">The previous category percentages were estimates presented as facts. The Business Reports page now calculates revenue, conversion, booking value, event types, expenses, and outstanding invoices from saved records.</p>
              <Link href="/portal/reports" className="mt-5 inline-flex rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/15 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a37d2c] dark:text-[#f1d27a]">Open live reports</Link>
            </MagicCard>
          </div>
        )}
      </PortalTabTransition>
    </PortalPageFrame>
  )
}
