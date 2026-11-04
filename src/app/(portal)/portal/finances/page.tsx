'use client'

import React, { useEffect, useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  FileText,
  Search,
  DollarSign,
  TrendingUp,
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  RefreshCw,
  Eye,
  Plus
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalMobileTabPicker,
  PortalMobileTabTrigger,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalStatusBadge,
  PortalSelect,
  PortalButton,
  PortalTableSkeleton,
  PortalStaggerGroup,
  PortalStaggerCard
} from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import type { LuxorInvoice, LuxorBooking, LuxorPayment, LuxorPaymentRefundView } from '@/lib/luxorInquiryTypes'
import type { LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { getLuxorBusinessFinanceRows, getLuxorInvoiceFinancialSummary, getLuxorRecordedFinanceExpenses } from '@/lib/luxorFinanceReporting'

type BookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

type FinanceTransaction = { kind: 'payment'; payment: LuxorPayment } | { kind: 'refund'; refund: LuxorPaymentRefundView }

type Tab = 'dashboard' | 'invoices' | 'payments' | 'expenses' | 'reports'

const FINANCE_TABS: Array<{ id: Tab; label: string; description: string; icon: React.ReactNode; group: string }> = [
  { id: 'dashboard', label: 'Finances Dashboard', description: 'Revenue pacing, profit metrics, and ledger KPIs', icon: <TrendingUp size={15} />, group: 'Financial Overview' },
  { id: 'invoices', label: 'Invoices Ledger', description: 'Client billing, draft agreements, and payment requests', icon: <FileText size={15} />, group: 'Billing & Payments' },
  { id: 'payments', label: 'Payments Log', description: 'Card charges, bank wires, and recorded deposits', icon: <CreditCard size={15} />, group: 'Billing & Payments' },
  { id: 'expenses', label: 'Expenses Tracking', description: 'Facility costs, operating bills, and vendor payouts', icon: <TrendingDown size={15} />, group: 'Ledgers & Records' },
  { id: 'reports', label: 'Financial Reports', description: 'Monthly summaries, tax reports, and performance charts', icon: <Eye size={15} />, group: 'Ledgers & Records' },
]

export default function FinancesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [isViewPickerOpen, setIsViewPickerOpen] = useState(false)
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [payments, setPayments] = useState<LuxorPayment[]>([])
  const [refunds, setRefunds] = useState<LuxorPaymentRefundView[]>([])
  const [installments, setInstallments] = useState<LuxorPaymentInstallment[]>([])
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
      const [invRes, bookRes, expRes, paymentRes, installmentRes, refundRes] = await Promise.all([
        fetch('/api/invoices?strictMetrics=1'),
        fetch('/api/bookings?strictMetrics=1&financeRowsOnly=1'),
        fetch('/api/expenses?strictMetrics=1'),
        fetch('/api/payments'),
        fetch('/api/portal/payment-installments?strictMetrics=1'),
        fetch('/api/payments/refunds'),
      ])

      if (!invRes.ok || !bookRes.ok || !expRes.ok || !paymentRes.ok || !installmentRes.ok || !refundRes.ok) throw new Error('Failed to load financial records.')

      const [invData, bookData, expData, paymentData, installmentData, refundData] = await Promise.all([
        invRes.json(),
        bookRes.json(),
        expRes.json(),
        paymentRes.json(),
        installmentRes.json(),
        refundRes.json(),
      ])

      if (!Array.isArray(invData) || !Array.isArray(bookData) || !Array.isArray(expData) || !Array.isArray(paymentData) || !Array.isArray(installmentData) || !Array.isArray(refundData)) throw new Error('Financial records could not be verified.')
      if (generation !== refreshGeneration.current) return
      setInvoices(invData)
      setPayments(paymentData)
      setRefunds(refundData)
      setBookings(bookData)
      setExpenses(expData)
      setInstallments(installmentData)

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
    if (!expenseBookingId || !expenseAmount || !expenseDesc) return
    try {
      setExpenseActionError(null)
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: expenseBookingId,
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
  const recordedBusinessExpenses = useMemo(() => getLuxorRecordedFinanceExpenses(businessExpenses), [businessExpenses])
  const paidBusinessExpenses = useMemo(() => businessExpenses.filter((expense) => expense.status === 'paid'), [businessExpenses])
  const incurredUnpaidBusinessExpenses = useMemo(() => businessExpenses.filter((expense) => expense.status === 'incurred'), [businessExpenses])
  const cancelledExpenseCount = businessExpenses.filter((expense) => expense.status === 'cancelled').length
  const visibleExpenses = businessExpenses.filter((expense) => showCancelledExpenses || expense.status !== 'cancelled')

  const financeSummary = useMemo(() => getLuxorInvoiceFinancialSummary(invoices, payments, businessRows.testInquiryIds, businessRows.testBookingIds, installments, new Date(), businessRows.testInvoiceIds, refunds), [invoices, payments, businessRows.testInquiryIds, businessRows.testBookingIds, businessRows.testInvoiceIds, installments, refunds])
  const netRevenue = financeSummary.eventPaymentsReceived
  const outstandingAR = financeSummary.outstandingEventReceivable
  const overdueAR = financeSummary.overdueEventReceivable
  const totalExpenses = useMemo(() => recordedBusinessExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0), [recordedBusinessExpenses])
  const eventPaymentsAfterCosts = useMemo(() => netRevenue - totalExpenses, [netRevenue, totalExpenses])

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
    const leftAt = left.kind === 'payment' ? left.payment.received_date || left.payment.paid_at || left.payment.created_at : left.refund.completed_at || left.refund.requested_at
    const rightAt = right.kind === 'payment' ? right.payment.received_date || right.payment.paid_at || right.payment.created_at : right.refund.completed_at || right.refund.requested_at
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
            <PortalMobileTabTrigger
              tabs={FINANCE_TABS}
              activeTab={activeTab}
              onClick={() => setIsViewPickerOpen(true)}
            />
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

      {/* Mobile view picker modal */}
      <PortalMobileTabPicker
        tabs={FINANCE_TABS}
        activeTab={activeTab}
        open={isViewPickerOpen}
        onOpenChange={setIsViewPickerOpen}
        onTabChange={(tab) => { setActiveTab(tab as Tab); setSearchTerm('') }}
        title="Finances views"
        subtitle="Choose a financial ledger or report."
      />

      {/* Desktop rectangular sliding tabs */}
      <div className="hidden shrink-0 xl:flex">
        <PortalAnimatedTabs
          variant="slider"
          ariaLabel="Finances sections"
          tabs={[
            { id: 'dashboard', label: 'Finances Dashboard', icon: <TrendingUp size={15} /> },
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
      {activeTab === 'dashboard' && !loading && !testClassificationVerified && (
        <p role="status" className="p-4 text-sm text-[color:var(--portal-muted)]">Business metrics are unavailable until test records are verified. Refresh the ledger to retry.</p>
      )}
      {activeTab === 'dashboard' && testClassificationVerified && !error && !loading && (
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
          <div className="space-y-6">
            {financeSummary.refundReconciliationRequired && <p role="status" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-[11px] leading-relaxed text-[color:var(--portal-muted)]">{financeSummary.refundRecordCount} refund records appear in the ledger; Stripe-confirmed outflow is ${financeSummary.refundRecordAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}. Only confirmed refunds reduce collected cash. Pending or uncertain requests stay out of totals until reconciled, and older refund-status payment rows remain flagged for manual source review.</p>}
            {/* Top Cards */}
            <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 flex flex-col justify-between min-h-[154px] h-full">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Event Payments Recorded</p>
                    <p className="text-3xl font-extrabold text-[color:var(--portal-text)] mt-2 tabular-nums tracking-tight">${netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                        initial={{ width: '0%' }}
                        whileInView={{ width: `${netRevenue + outstandingAR > 0 ? Math.max(8, Math.min(100, (netRevenue / (netRevenue + outstandingAR)) * 100)) : 100}%` }}
                        viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 mt-4 font-bold tabular-nums">
                    <ArrowUpRight size={16} /> <span>+{businessInvoices.length} billing items</span>
                  </div>
                    <p className="mt-2 text-[10px] text-[color:var(--portal-muted)]">Known paid cash: ${financeSummary.knownPaidCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 flex flex-col justify-between min-h-[154px] h-full">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Operational Expenses</p>
                    <p className="text-3xl font-extrabold text-[color:var(--portal-text)] mt-2 tabular-nums tracking-tight">${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400"
                        initial={{ width: '0%' }}
                        whileInView={{ width: `${netRevenue > 0 ? Math.max(6, Math.min(100, (totalExpenses / netRevenue) * 100)) : 20}%` }}
                        viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 mt-4 font-bold tabular-nums">
                    <ArrowDownRight size={16} /> <span>{paidBusinessExpenses.length} paid</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{incurredUnpaidBusinessExpenses.length} incurred unpaid · planned costs excluded</p>
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="relative rounded-2xl p-6 flex flex-row items-center justify-between gap-4 min-h-[154px] h-full">
                  <BorderBeam size={95} duration={10} borderWidth={1.2} />
                  <div className="min-w-0 flex-1 pr-2 flex flex-col justify-between h-full">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Event Payments After Costs</p>
                      <p className="text-3xl font-extrabold text-[#a37d2c] dark:text-[#f1d27a] mt-2 tabular-nums tracking-tight">${eventPaymentsAfterCosts.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#a37d2c] dark:text-[#caa24c] mt-4 font-bold tabular-nums">
                        <span>Recorded expenses compared with event payments</span>
                    </div>
                  </div>
                  <div className="ml-auto shrink-0">
                    <AnimatedCircularProgressBar
                      value={netRevenue > 0 ? Math.max(0, (eventPaymentsAfterCosts / netRevenue) * 100) : 0}
                      size={58}
                      strokeWidth={5}
                      gaugePrimaryColor="#caa24c"
                      subLabel="Margin"
                    />
                  </div>
                </MagicCard>
              </PortalStaggerCard>
            </PortalStaggerGroup>

            {/* Invoicing summary */}
            <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-6" staggerDelay={0.07}>
              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 space-y-4 h-full">
                  <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Accounts Receivable</h3>
                  <div className="space-y-3.5">
                    <div className="space-y-1.5 pb-2.5 border-b border-[color:var(--portal-border)]/60">
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--portal-muted)] font-medium">Accepted Event Balance Outstanding</span>
                        <span className="text-[color:var(--portal-text)] font-bold tabular-nums">${outstandingAR.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)]/50 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#b8892e] to-[#e2c16b]"
                          initial={{ width: '0%' }}
                          whileInView={{ width: `${outstandingAR > 0 ? 75 : 6}%` }}
                          viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5 pb-2.5 border-b border-[color:var(--portal-border)]/60">
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--portal-muted)] font-medium">Overdue Receivables</span>
                        <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums">${overdueAR.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[color:var(--portal-border)]/50 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400"
                          initial={{ width: '0%' }}
                          whileInView={{ width: `${outstandingAR > 0 ? Math.max(4, Math.min(100, (overdueAR / outstandingAR) * 100)) : 4}%` }}
                          viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-[color:var(--portal-muted)] font-medium">Refundable Security Deposits Held</span>
                      <span className="text-[#a37d2c] dark:text-[#caa24c] font-bold tabular-nums">${financeSummary.securityDepositsHeld.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-[color:var(--portal-muted)] font-medium">Unallocated Payments</span>
                      <span className="text-amber-700 dark:text-amber-300 font-bold tabular-nums">${financeSummary.unallocatedPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })} · {financeSummary.unallocatedPaymentRows.length}</span>
                    </div>
                    {financeSummary.refundReconciliationRequired && <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-rose-700 dark:text-rose-300 font-medium">Refund-status records · reconcile</span>
                      <span className="text-rose-700 dark:text-rose-300 font-bold tabular-nums">{financeSummary.refundRecordCount} · ${financeSummary.refundRecordAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>}
                  </div>
                  {financeSummary.unallocatedPaymentRows.length > 0 && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-[color:var(--portal-muted)]">These paid-status transactions remain included in known paid cash but cannot yet be assigned to event payments or security deposits. Reconcile invoice links and saved allocations.</p>}
                </MagicCard>
              </PortalStaggerCard>

              <PortalStaggerCard>
                <MagicCard className="rounded-2xl p-6 space-y-4 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Tax Allocation Preview</h3>
                    <p className="text-xs text-[color:var(--portal-muted)] mt-2">
                      Estimated 8.25% of recorded event payments:
                    </p>
                    <p className="text-2xl tabular-nums font-extrabold tracking-tight text-[color:var(--portal-text)] mt-2">${(netRevenue * 0.0825).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#b8892e] to-[#e2c16b]"
                        initial={{ width: '0%' }}
                        whileInView={{ width: '8.25%' }}
                        viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[color:var(--portal-muted)] font-medium">A rough reference only. It is not a tax calculation or bank reconciliation.</p>
                </MagicCard>
              </PortalStaggerCard>
            </PortalStaggerGroup>
          </div>
        </div>
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
                <tbody className="divide-y divide-[color:var(--portal-border)]/50">
                  {loading ? (
                    <PortalTableSkeleton cols={6} rows={5} />
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
                          <p className="text-[10px] text-[color:var(--portal-muted)] mt-1">{inv.event_type || 'Quinceañera'}</p>
                        </td>
                        <td className="px-6 py-5 tabular-nums font-bold text-[color:var(--portal-text)]">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{inv.due_date || 'TBD'}</td>
                        <td className="px-6 py-5">
                          <PortalStatusBadge status={inv.status} />
                        </td>
                        <td className="px-8 py-5 text-right">
                          <span className="text-[10px] font-medium text-[color:var(--portal-muted)]">Use send and payment workflows</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
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
                    <th className="px-6 py-5">Paid Date</th>
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
                      const at = isRefund ? transaction.refund.completed_at || transaction.refund.requested_at : transaction.payment.received_date || transaction.payment.paid_at || transaction.payment.created_at
                      const label = isRefund ? (status === 'succeeded' ? 'Refund completed' : `Refund ${status}`) : status === 'refunded' ? 'Legacy refund needs review' : 'Payment recorded'
                      return <tr key={`${transaction.kind}-${id || idx}`} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="px-8 py-5 tabular-nums font-bold text-xs text-[color:var(--portal-muted)]">#{id?.slice(0, 10) || `TX-00${idx}`}</td>
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-[color:var(--portal-text)] leading-none">{isRefund ? 'Refundable security deposit' : transaction.payment.notes || 'Event Booking Retainer'}</p>
                          <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${isRefund || status === 'refunded' ? 'text-rose-600 dark:text-rose-400' : 'text-[#caa24c]'}`}>{label}</p>
                        </td>
                        <td className="px-6 py-5 text-xs text-[color:var(--portal-muted)] font-medium">{isRefund ? 'Stripe' : transaction.payment.payment_method || 'Bank Transfer'}</td>
                        <td className="px-6 py-5 tabular-nums text-xs text-[color:var(--portal-muted)]">{at ? new Date(at).toLocaleDateString() : 'N/A'}</td>
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
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Operations Expense Ledger</h3>
              <div className="flex items-center gap-3">
                {cancelledExpenseCount > 0 && <button type="button" onClick={() => setShowCancelledExpenses((show) => !show)} className="text-xs font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]">{showCancelledExpenses ? 'Hide' : 'Show'} removed ({cancelledExpenseCount})</button>}
                <button
                  type="button"
                  onClick={() => { setExpenseActionError(null); setIsAddingExpense(!isAddingExpense) }}
                  className="flex items-center gap-2 bg-[#caa24c]/15 border border-[#caa24c]/30 hover:bg-[#caa24c]/25 text-[#a37d2c] dark:text-[#f1d27a] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                >
                  <Plus size={14} /> Log Operational Cost
                </button>
              </div>
            </div>

            {expenseActionError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">{expenseActionError}</p>}

            {isAddingExpense && (
              <form onSubmit={handleAddExpense} className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 max-w-md">
                <h4 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)]">Log Operational Expense</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Booking</label>
                    <PortalSelect
                      value={expenseBookingId}
                      onChange={setExpenseBookingId}
                      options={businessRows.bookings.map((booking) => ({
                        value: booking.id,
                        label: `${booking.client_name} - ${booking.event_date || 'Date not set'} - ${booking.event_type || 'Event'}`,
                      }))}
                      placeholder={businessRows.bookings.length ? 'Select booking...' : 'No bookings available'}
                      disabled={!businessRows.bookings.length}
                      aria-label="Expense booking"
                    />
                    {!businessRows.bookings.length && <p className="text-[10px] text-[color:var(--portal-muted)]">This ledger requires each expense to be linked to a booking.</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Category</label>
                    <PortalSelect
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
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Expense status</label>
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
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Cost (USD)</label>
                    <input
                      type="number"
                      required
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="120.00"
                      className="w-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase font-bold text-[color:var(--portal-muted)]">Description</label>
                    <input
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
                  <button type="submit" disabled={!expenseBookingId} className="px-4 py-2 bg-[#caa24c] hover:bg-[#b58d3b] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50">Save Cost</button>
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
