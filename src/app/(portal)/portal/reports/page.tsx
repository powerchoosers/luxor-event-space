'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Calendar, Download, RefreshCw, TrendingUp } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalStaggerGroup, PortalStaggerCard } from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { type LuxorBooking, type LuxorBookingExpense, type LuxorInquiry, type LuxorInvoice, type LuxorPayment, type LuxorPaymentInstallment } from '@/lib/luxorInquiryTypes'
import { getLuxorBusinessFinanceRows, getLuxorBusinessInquiries, getLuxorInvoiceFinancialSummary, getLuxorRecordedFinanceExpenses } from '@/lib/luxorFinanceReporting'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'

type ReportData = {
  inquiries: LuxorInquiry[]
  bookings: LuxorBooking[]
  invoices: LuxorInvoice[]
  payments: LuxorPayment[]
  expenses: LuxorBookingExpense[]
  installments: LuxorPaymentInstallment[]
}

const EMPTY_DATA: ReportData = { inquiries: [], bookings: [], invoices: [], payments: [], expenses: [], installments: [] }

export default function ReportsPage() {
  const [data, setData] = useState<ReportData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verifiedTestInquiryIds, setVerifiedTestInquiryIds] = useState<ReadonlySet<string>>(new Set())
  const [verifiedTestBookingIds, setVerifiedTestBookingIds] = useState<ReadonlySet<string>>(new Set())
  const [classificationVerified, setClassificationVerified] = useState(false)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    setClassificationVerified(false)
    try {
      const responses = await Promise.all([
        fetch('/api/inquiries'),
        fetch('/api/bookings?strictMetrics=1&financeRowsOnly=1'),
        fetch('/api/invoices?strictMetrics=1'),
        fetch('/api/payments'),
        fetch('/api/expenses?strictMetrics=1'),
        fetch('/api/portal/payment-installments?strictMetrics=1'),
      ])
      if (responses.some((response) => !response.ok)) throw new Error('Some business records could not be loaded.')
      const [inquiries, bookings, invoices, payments, expenses, installments] = await Promise.all(responses.map((response) => response.json()))
      if (![inquiries, bookings, invoices, payments, expenses, installments].every(Array.isArray)) throw new Error('Business records could not be verified.')
      const inquiryRows = inquiries as LuxorInquiry[]
      const bookingRows = bookings as LuxorBooking[]
      const invoiceRows = invoices as LuxorInvoice[]
      const paymentRows = payments as LuxorPayment[]
      const expenseRows = expenses as LuxorBookingExpense[]
      const installmentRows = installments as LuxorPaymentInstallment[]
      const inquiryIds = [...new Set([...inquiryRows.map((inquiry) => inquiry.id), ...[...invoiceRows, ...bookingRows, ...paymentRows].map((record) => record.inquiry_id).filter((id): id is string => typeof id === 'string' && Boolean(id))])]
      const knownBookingIds = new Set(bookingRows.map((booking) => booking.id).filter((id): id is string => typeof id === 'string'))
      const bookingIds = [...new Set([...invoiceRows, ...expenseRows, ...paymentRows].map((record) => record.booking_id).filter((id): id is string => typeof id === 'string' && Boolean(id) && !knownBookingIds.has(id)))]
      const testInquiryIds = new Set<string>()
      const testBookingIds = new Set<string>()
      for (let offset = 0; offset < Math.max(inquiryIds.length, bookingIds.length); offset += 1000) {
        const inquiryBatch = inquiryIds.slice(offset, offset + 1000)
        const bookingBatch = bookingIds.slice(offset, offset + 1000)
        const classificationResponse = await fetch('/api/portal/test-inquiry-classification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inquiryIds: inquiryBatch, bookingIds: bookingBatch }) })
        if (!classificationResponse.ok) throw new Error('Verified test classification is unavailable; reports are hidden.')
        const classification = await classificationResponse.json() as { testInquiryIds?: unknown; testBookingIds?: unknown; unresolvedBookingIds?: unknown }
        const requestedInquiries = new Set(inquiryBatch.map((id) => id.toLowerCase()))
        const requestedBookings = new Set(bookingBatch.map((id) => id.toLowerCase()))
        if (!Array.isArray(classification.testInquiryIds) || !classification.testInquiryIds.every((id) => typeof id === 'string' && requestedInquiries.has(id.toLowerCase()))
          || !Array.isArray(classification.testBookingIds) || !classification.testBookingIds.every((id) => typeof id === 'string' && requestedBookings.has(id.toLowerCase()))
          || !Array.isArray(classification.unresolvedBookingIds) || classification.unresolvedBookingIds.length) throw new Error('Verified test classification is unavailable; reports are hidden.')
        classification.testInquiryIds.forEach((id: string) => testInquiryIds.add(id.toLowerCase()))
        classification.testBookingIds.forEach((id: string) => testBookingIds.add(id.toLowerCase()))
      }
      for (const inquiry of inquiryRows) {
        if (inquiry.is_test === true || inquiry.metadata?.is_test_record === true) testInquiryIds.add(inquiry.id.toLowerCase())
      }
      setData({ inquiries: inquiryRows, bookings: bookingRows, invoices: invoiceRows, payments: paymentRows, expenses: expenseRows, installments: installmentRows })
      setVerifiedTestInquiryIds(testInquiryIds)
      setVerifiedTestBookingIds(testBookingIds)
      setClassificationVerified(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Reports could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  const metrics = useMemo(() => buildMetrics(data, verifiedTestInquiryIds, verifiedTestBookingIds), [data, verifiedTestInquiryIds, verifiedTestBookingIds])

  const downloadCsv = () => {
    if (!classificationVerified) return
    const rows = [
      ['Metric', 'Value'],
      ['Total leads', String(metrics.totalLeads)],
      ['Confirmed bookings', String(metrics.confirmedBookings.length)],
      ['Lead-to-booking conversion', `${metrics.conversionRate.toFixed(1)}%`],
      ['Known paid cash (paid-status rows only)', String(metrics.knownPaidCashTotal)],
      ['Refund-status transaction count', String(metrics.refundRecordCount)],
      ['Refund-status recorded gross amount; not treated as signed cash', String(metrics.refundRecordAmount)],
      ['Event payments recorded', String(metrics.paidRevenue)],
      ['Refundable security deposits held', String(metrics.securityDepositsHeld)],
      ['Unallocated payments requiring review', String(metrics.unallocatedPayments)],
      ['Recorded expenses', String(metrics.recordedExpenses)],
      ['Net recorded income from known paid-status rows', String(metrics.netIncome)],
      ['Accepted event balance outstanding', String(metrics.outstandingRevenue)],
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `luxor-business-summary-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<BarChart3 size={18} />}
        title="Business Analytics & Reports"
        actions={<div className="flex gap-2"><PortalButton onClick={() => void loadReports()}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</PortalButton><PortalButton onClick={downloadCsv} disabled={!classificationVerified}><Download size={13} /> Export CSV</PortalButton></div>}
      />

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
      {!classificationVerified && !loading && !error && <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs">Verified record coverage is unavailable; report totals are hidden.</div>}
      {classificationVerified && metrics.refundReconciliationRequired && <div role="status" className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs leading-relaxed">Refund-status rows ({metrics.refundRecordCount}, {currency(metrics.refundRecordAmount)} recorded gross) are shown separately. The saved amount does not establish whether a row is an original receipt marked refunded or a separate refund event. Finance totals are unreconciled; figures below include paid-status rows only and should not be treated as definitive until reconciled with the payment source.</div>}

      {classificationVerified && <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
        <PortalStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PortalStaggerCard>
            <StatsPanel
              label="Average Booking Value"
              value={currency(metrics.averageBookingValue)}
              detail={`${metrics.confirmedBookings.length} confirmed or completed bookings`}
              loading={loading}
              progress={Math.min(100, (metrics.averageBookingValue / 10000) * 100)}
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <StatsPanel
              label="Lead-to-Booking Rate"
              value={`${metrics.conversionRate.toFixed(1)}%`}
              detail={`${metrics.bookedLeadIds.size} booked leads from ${metrics.totalLeads} total`}
              loading={loading}
              gaugePercent={metrics.conversionRate}
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <StatsPanel
              label="Average Days to Book"
              value={metrics.averageDaysToBook === null ? 'Not enough data' : `${metrics.averageDaysToBook.toFixed(1)} days`}
              detail="From inquiry creation to booking"
              loading={loading}
              progress={metrics.averageDaysToBook === null ? 0 : Math.min(100, Math.max(12, 100 - metrics.averageDaysToBook * 2))}
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <StatsPanel
              label="Recorded Income After Costs"
              value={currency(metrics.netIncome)}
              detail={`${currency(metrics.paidRevenue)} event payments recorded less ${currency(metrics.recordedExpenses)} expenses`}
              loading={loading}
              highlight
              progress={metrics.paidRevenue > 0 ? Math.max(0, Math.min(100, (metrics.netIncome / metrics.paidRevenue) * 100)) : 0}
            />
          </PortalStaggerCard>
        </PortalStaggerGroup>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ReportCard title="Event Payments Recorded by Month" icon={<TrendingUp size={16} />}>
            {metrics.months.map((month) => <ProgressRow key={month.key} label={month.label} value={currency(month.revenue)} percent={metrics.maxMonthlyRevenue ? (month.revenue / metrics.maxMonthlyRevenue) * 100 : 0} />)}
          </ReportCard>
          <ReportCard title="Confirmed Bookings by Event Type" icon={<Calendar size={16} />}>
            {metrics.eventTypes.length ? metrics.eventTypes.map((item) => <ProgressRow key={item.label} label={item.label} value={`${item.count} booking${item.count === 1 ? '' : 's'}`} percent={metrics.confirmedBookings.length ? (item.count / metrics.confirmedBookings.length) * 100 : 0} tone="emerald" />) : <EmptyState text="No confirmed bookings are recorded yet." />}
          </ReportCard>
        </div>

        <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4" staggerDelay={0.06}>
          <PortalStaggerCard>
            <SummaryCard
              label="Known Paid Cash"
              value={currency(metrics.knownPaidCashTotal)}
              detail="Paid-status transactions only"
              tone="emerald"
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Refundable Security Deposits Held"
              value={currency(metrics.securityDepositsHeld)}
              detail="Separate from event payments"
              tone="gold"
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Unallocated Payments"
              value={currency(metrics.unallocatedPayments)}
              detail={`${metrics.unallocatedPaymentCount} transaction${metrics.unallocatedPaymentCount === 1 ? '' : 's'} need reconciliation`}
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Event Payments Recorded"
              value={currency(metrics.paidRevenue)}
              detail="From paid-status payment records"
              progress={metrics.paidRevenue + metrics.outstandingRevenue > 0 ? (metrics.paidRevenue / (metrics.paidRevenue + metrics.outstandingRevenue)) * 100 : 100}
              tone="emerald"
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Accepted Event Balance Outstanding"
              value={currency(metrics.outstandingRevenue)}
              detail="Accepted event obligations less recorded event payments"
              progress={metrics.paidRevenue + metrics.outstandingRevenue > 0 ? (metrics.outstandingRevenue / (metrics.paidRevenue + metrics.outstandingRevenue)) * 100 : 0}
              tone="gold"
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Current-Month Event Days"
              value={String(metrics.currentMonthEventDays)}
              detail="Distinct confirmed or completed event dates"
              gaugePercent={Math.min(100, (metrics.currentMonthEventDays / 12) * 100)}
            />
          </PortalStaggerCard>
        </PortalStaggerGroup>

        {metrics.unallocatedPaymentCount > 0 && (
          <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-[color:var(--portal-muted)]">
            {metrics.unallocatedPaymentCount} paid-status transaction{metrics.unallocatedPaymentCount === 1 ? '' : 's'} totaling {currency(metrics.unallocatedPayments)} remain in known paid cash but are not assigned to event payments or refundable security deposits. Reconcile their invoice or allocation before relying on classified totals.
          </p>
        )}

        <p className="text-[10px] leading-relaxed text-[color:var(--portal-muted)]">These reports use accepted proposals for event obligations and paid-status transaction records for known receipts. Refund-status rows are reported separately and are not assigned a cash direction. These are not bank reconciliation, tax advice, or payment-processor settlement reports.</p>
      </div>}
    </PortalPageFrame>
  )
}

function buildMetrics(data: ReportData, testInquiryIds: ReadonlySet<string>, testBookingIds: ReadonlySet<string>) {
  const financeRows = getLuxorBusinessFinanceRows({ invoices: data.invoices, bookings: data.bookings, expenses: data.expenses, testInquiryIds, testBookingIds })
  const verifiedTestInquiryIds = new Set([...financeRows.testInquiryIds, LUXOR_PERMANENT_TEST_LEAD_ID.toLowerCase()])
  const verifiedTestBookingIds = financeRows.testBookingIds
  const businessInquiries = getLuxorBusinessInquiries(data.inquiries, verifiedTestInquiryIds)
  const businessBookings = financeRows.bookings
  const businessExpenses = financeRows.expenses
  const confirmedBookings = businessBookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const finance = getLuxorInvoiceFinancialSummary(data.invoices, data.payments, verifiedTestInquiryIds, verifiedTestBookingIds, data.installments, new Date(), financeRows.testInvoiceIds)
  const paidRevenue = finance.eventPaymentsReceived
  const outstandingRevenue = finance.outstandingEventReceivable
  const recordedExpenses = getLuxorRecordedFinanceExpenses(businessExpenses).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const bookedLeadIds = new Set(confirmedBookings.map((booking) => booking.inquiry_id).filter((id): id is string => Boolean(id)))
  const conversionRate = businessInquiries.length ? (bookedLeadIds.size / businessInquiries.length) * 100 : 0
  const averageBookingValue = confirmedBookings.length ? confirmedBookings.reduce((sum, booking) => sum + Number(booking.contract_total || 0), 0) / confirmedBookings.length : 0
  const inquiryCreatedAt = new Map(businessInquiries.map((inquiry) => [inquiry.id, new Date(inquiry.created_at).getTime()]))
  const bookingDurations = confirmedBookings.flatMap((booking) => {
    const start = booking.inquiry_id ? inquiryCreatedAt.get(booking.inquiry_id) : undefined
    const end = new Date(booking.booked_at || booking.created_at).getTime()
    return start && Number.isFinite(end) && end >= start ? [(end - start) / 86_400_000] : []
  })
  const averageDaysToBook = bookingDurations.length ? bookingDurations.reduce((sum, days) => sum + days, 0) / bookingDurations.length : null
  const months = lastSixMonths().map((month) => ({ ...month, revenue: finance.eventPaymentRows.filter((payment) => monthKey(payment.paid_at || '') === month.key).reduce((sum, payment) => sum + payment.amount, 0) }))
  const maxMonthlyRevenue = Math.max(0, ...months.map((month) => month.revenue))
  const eventTypeCounts = new Map<string, number>()
  confirmedBookings.forEach((booking) => { const label = booking.event_type?.trim() || 'Other'; eventTypeCounts.set(label, (eventTypeCounts.get(label) || 0) + 1) })
  const eventTypes = [...eventTypeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  const currentMonth = monthKey(new Date().toISOString())
  const currentMonthEventDays = new Set(confirmedBookings.map((booking) => booking.event_date).filter((date): date is string => typeof date === 'string' && monthKey(date) === currentMonth)).size
  return { confirmedBookings, paidRevenue, outstandingRevenue, knownPaidCashTotal: finance.knownPaidCashTotal, refundRecordCount: finance.refundRecordCount, refundRecordAmount: finance.refundRecordAmount, refundReconciliationRequired: finance.refundReconciliationRequired, securityDepositsHeld: finance.securityDepositsHeld, unallocatedPayments: finance.unallocatedPayments, unallocatedPaymentCount: finance.unallocatedPaymentRows.length, recordedExpenses, netIncome: paidRevenue - recordedExpenses, bookedLeadIds, conversionRate, averageBookingValue, averageDaysToBook, months, maxMonthlyRevenue, eventTypes, currentMonthEventDays, totalLeads: businessInquiries.length }
}

function lastSixMonths() { const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }); return Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); return { key: monthKey(date.toISOString()), label: formatter.format(date) } }) }
function monthKey(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function currency(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value) }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"` }

function StatsPanel({ label, value, detail, loading, gaugePercent, progress, highlight }: { label: string; value: string; detail: string; loading: boolean; gaugePercent?: number; progress?: number; highlight?: boolean }) {
  return (
    <MagicCard className="relative flex flex-row items-center justify-between gap-3 rounded-xl p-5 min-h-[126px] h-full">
      {highlight ? <BorderBeam size={80} duration={10} borderWidth={1.2} /> : null}
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
        <p className={`text-2xl font-extrabold tabular-nums tracking-tight mt-2 ${highlight ? 'text-[#a37d2c] dark:text-[#f1d27a]' : 'text-[color:var(--portal-text)]'}`}>
          {loading ? 'Loading…' : value}
        </p>
        {progress !== undefined ? (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#caa24c] to-[#f1d27a]"
              initial={{ width: '0%' }}
              whileInView={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
              viewport={{ once: true, margin: '0px 0px -30px 0px' }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ) : null}
        <p className="text-[11px] text-[color:var(--portal-muted)] mt-2">{detail}</p>
      </div>
      {gaugePercent !== undefined ? (
        <div className="ml-auto shrink-0">
          <AnimatedCircularProgressBar
            value={gaugePercent}
            size={52}
            strokeWidth={5}
            gaugePrimaryColor="#caa24c"
            subLabel="Rate"
          />
        </div>
      ) : null}
    </MagicCard>
  )
}

function ReportCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <MagicCard className="rounded-2xl p-6 space-y-4">
      <h3 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[color:var(--portal-text)] flex items-center gap-2">
        <span className="text-[#caa24c]">{icon}</span>{title}
      </h3>
      <div className="space-y-4 pt-2 text-xs">{children}</div>
    </MagicCard>
  )
}

function ProgressRow({ label, value, percent, tone = 'gold' }: { label: string; value: string; percent: number; tone?: 'gold' | 'emerald' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-4 font-bold">
        <span className="text-[color:var(--portal-text)]">{label}</span>
        <span className="tabular-nums font-bold text-[color:var(--portal-muted)]">{value}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)]/60 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${tone === 'emerald' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-[#b8892e] to-[#e2c16b]'}`}
          initial={{ width: '0%' }}
          whileInView={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
          viewport={{ once: true, margin: '0px 0px -30px 0px' }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, detail, progress, gaugePercent, tone = 'gold' }: { label: string; value: string; detail: string; progress?: number; gaugePercent?: number; tone?: 'gold' | 'emerald' }) {
  return (
    <MagicCard className="flex flex-row items-center justify-between gap-3 rounded-2xl p-5 h-full">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
        <p className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-[color:var(--portal-text)]">{value}</p>
        {progress !== undefined ? (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50">
            <motion.div
              className={`h-full rounded-full ${tone === 'emerald' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-[#caa24c] to-[#f1d27a]'}`}
              initial={{ width: '0%' }}
              whileInView={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
              viewport={{ once: true, margin: '0px 0px -30px 0px' }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ) : null}
        <p className="mt-2 text-[11px] text-[color:var(--portal-muted)]">{detail}</p>
      </div>
      {gaugePercent !== undefined ? (
        <div className="ml-auto shrink-0">
          <AnimatedCircularProgressBar
            value={gaugePercent}
            size={48}
            strokeWidth={4.5}
            gaugePrimaryColor="#caa24c"
            subLabel="Goal"
          />
        </div>
      ) : null}
    </MagicCard>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-8 text-center text-xs text-[color:var(--portal-muted)]">{text}</p>
}
