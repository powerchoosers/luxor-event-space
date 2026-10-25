'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Calendar, Download, RefreshCw, TrendingUp } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader, PortalStaggerGroup, PortalStaggerCard } from '@/components/portal/PortalUI'
import { MagicCard } from '@/components/ui/magic-card'
import { BorderBeam } from '@/components/ui/border-beam'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { isLuxorNonRevenueTestInquiry, type LuxorBooking, type LuxorBookingExpense, type LuxorInquiry, type LuxorInvoice } from '@/lib/luxorInquiryTypes'

type ReportData = {
  inquiries: LuxorInquiry[]
  bookings: LuxorBooking[]
  invoices: LuxorInvoice[]
  expenses: LuxorBookingExpense[]
}

const EMPTY_DATA: ReportData = { inquiries: [], bookings: [], invoices: [], expenses: [] }

export default function ReportsPage() {
  const [data, setData] = useState<ReportData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const responses = await Promise.all([
        fetch('/api/inquiries'),
        fetch('/api/bookings'),
        fetch('/api/invoices'),
        fetch('/api/expenses'),
      ])
      if (responses.some((response) => !response.ok)) throw new Error('Some business records could not be loaded.')
      const [inquiries, bookings, invoices, expenses] = await Promise.all(responses.map((response) => response.json()))
      setData({ inquiries, bookings, invoices, expenses })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Reports could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  const metrics = useMemo(() => buildMetrics(data), [data])

  const downloadCsv = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total leads', String(metrics.totalLeads)],
      ['Confirmed bookings', String(metrics.confirmedBookings.length)],
      ['Lead-to-booking conversion', `${metrics.conversionRate.toFixed(1)}%`],
      ['Paid invoice revenue', String(metrics.paidRevenue)],
      ['Recorded expenses', String(metrics.recordedExpenses)],
      ['Net recorded income', String(metrics.netIncome)],
      ['Outstanding invoices', String(metrics.outstandingRevenue)],
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
        actions={<div className="flex gap-2"><PortalButton onClick={() => void loadReports()}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</PortalButton><PortalButton onClick={downloadCsv}><Download size={13} /> Export CSV</PortalButton></div>}
      />

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-700 dark:text-rose-300">{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
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
              label="Net Recorded Income"
              value={currency(metrics.netIncome)}
              detail={`${currency(metrics.paidRevenue)} paid less ${currency(metrics.recordedExpenses)} expenses`}
              loading={loading}
              highlight
              progress={metrics.paidRevenue > 0 ? Math.max(0, Math.min(100, (metrics.netIncome / metrics.paidRevenue) * 100)) : 0}
            />
          </PortalStaggerCard>
        </PortalStaggerGroup>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ReportCard title="Paid Revenue by Month" icon={<TrendingUp size={16} />}>
            {metrics.months.map((month) => <ProgressRow key={month.key} label={month.label} value={currency(month.revenue)} percent={metrics.maxMonthlyRevenue ? (month.revenue / metrics.maxMonthlyRevenue) * 100 : 0} />)}
          </ReportCard>
          <ReportCard title="Confirmed Bookings by Event Type" icon={<Calendar size={16} />}>
            {metrics.eventTypes.length ? metrics.eventTypes.map((item) => <ProgressRow key={item.label} label={item.label} value={`${item.count} booking${item.count === 1 ? '' : 's'}`} percent={metrics.confirmedBookings.length ? (item.count / metrics.confirmedBookings.length) * 100 : 0} tone="emerald" />) : <EmptyState text="No confirmed bookings are recorded yet." />}
          </ReportCard>
        </div>

        <PortalStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-4" staggerDelay={0.06}>
          <PortalStaggerCard>
            <SummaryCard
              label="Paid Revenue"
              value={currency(metrics.paidRevenue)}
              detail={`${metrics.paidInvoices.length} paid invoices`}
              progress={metrics.paidRevenue + metrics.outstandingRevenue > 0 ? (metrics.paidRevenue / (metrics.paidRevenue + metrics.outstandingRevenue)) * 100 : 100}
              tone="emerald"
            />
          </PortalStaggerCard>
          <PortalStaggerCard>
            <SummaryCard
              label="Outstanding Invoices"
              value={currency(metrics.outstandingRevenue)}
              detail={`${metrics.outstandingInvoices.length} sent or overdue invoices`}
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

        <p className="text-[10px] leading-relaxed text-[color:var(--portal-muted)]">These reports only reflect records saved in the portal. They are not bank reconciliation, tax advice, or payment-processor settlement reports.</p>
      </div>
    </PortalPageFrame>
  )
}

function buildMetrics(data: ReportData) {
  const testInquiryIds = new Set(data.inquiries.filter(isLuxorNonRevenueTestInquiry).map((inquiry) => inquiry.id))
  const testBookingIds = new Set(data.bookings.filter((booking) => booking.inquiry_id && testInquiryIds.has(booking.inquiry_id)).map((booking) => booking.id))
  const businessInquiries = data.inquiries.filter((inquiry) => !isLuxorNonRevenueTestInquiry(inquiry))
  const businessBookings = data.bookings.filter((booking) => !booking.inquiry_id || !testInquiryIds.has(booking.inquiry_id))
  const businessInvoices = data.invoices.filter((invoice) =>
    (!invoice.inquiry_id || !testInquiryIds.has(invoice.inquiry_id)) && (!invoice.booking_id || !testBookingIds.has(invoice.booking_id)))
  const businessExpenses = data.expenses.filter((expense) => !expense.booking_id || !testBookingIds.has(expense.booking_id))
  const confirmedBookings = businessBookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const paidInvoices = businessInvoices.filter((invoice) => invoice.status === 'paid')
  const outstandingInvoices = businessInvoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
  const paidRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const outstandingRevenue = outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const recordedExpenses = businessExpenses.filter((expense) => expense.status !== 'cancelled').reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
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
  const months = lastSixMonths().map((month) => ({ ...month, revenue: paidInvoices.filter((invoice) => monthKey(invoice.paid_at || invoice.updated_at) === month.key).reduce((sum, invoice) => sum + Number(invoice.total || 0), 0) }))
  const maxMonthlyRevenue = Math.max(0, ...months.map((month) => month.revenue))
  const eventTypeCounts = new Map<string, number>()
  confirmedBookings.forEach((booking) => { const label = booking.event_type?.trim() || 'Other'; eventTypeCounts.set(label, (eventTypeCounts.get(label) || 0) + 1) })
  const eventTypes = [...eventTypeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  const currentMonth = monthKey(new Date().toISOString())
  const currentMonthEventDays = new Set(confirmedBookings.map((booking) => booking.event_date).filter((date): date is string => typeof date === 'string' && monthKey(date) === currentMonth)).size
  return { confirmedBookings, paidInvoices, outstandingInvoices, paidRevenue, outstandingRevenue, recordedExpenses, netIncome: paidRevenue - recordedExpenses, bookedLeadIds, conversionRate, averageBookingValue, averageDaysToBook, months, maxMonthlyRevenue, eventTypes, currentMonthEventDays, totalLeads: businessInquiries.length }
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
            <div className="h-full rounded-full bg-gradient-to-r from-[#caa24c] to-[#f1d27a] transition-all duration-700" style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
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
        <div
          className={`h-full rounded-full transition-all duration-700 ${tone === 'emerald' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-[#b8892e] to-[#e2c16b]'}`}
          style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
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
            <div
              className={`h-full rounded-full transition-all duration-700 ${tone === 'emerald' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-[#caa24c] to-[#f1d27a]'}`}
              style={{ width: `${Math.max(4, Math.min(100, progress))}%` }}
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
