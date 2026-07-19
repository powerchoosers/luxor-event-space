'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Calendar, Download, RefreshCw, TrendingUp } from 'lucide-react'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import type { LuxorBooking, LuxorBookingExpense, LuxorInquiry, LuxorInvoice } from '@/lib/luxorInquiryTypes'

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
      ['Total leads', String(data.inquiries.length)],
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
        description="Live calculations from the leads, bookings, invoices, and expenses currently recorded in Luxor."
        actions={<div className="flex gap-2"><PortalButton onClick={() => void loadReports()}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</PortalButton><PortalButton onClick={downloadCsv}><Download size={13} /> Export CSV</PortalButton></div>}
      />

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-300">{error}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsPanel label="Average Booking Value" value={currency(metrics.averageBookingValue)} detail={`${metrics.confirmedBookings.length} confirmed or completed bookings`} loading={loading} />
          <StatsPanel label="Lead-to-Booking Rate" value={`${metrics.conversionRate.toFixed(1)}%`} detail={`${metrics.bookedLeadIds.size} booked leads from ${data.inquiries.length} total`} loading={loading} />
          <StatsPanel label="Average Days to Book" value={metrics.averageDaysToBook === null ? 'Not enough data' : `${metrics.averageDaysToBook.toFixed(1)} days`} detail="From inquiry creation to booking" loading={loading} />
          <StatsPanel label="Net Recorded Income" value={currency(metrics.netIncome)} detail={`${currency(metrics.paidRevenue)} paid less ${currency(metrics.recordedExpenses)} expenses`} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ReportCard title="Paid Revenue by Month" icon={<TrendingUp size={16} />}>
            {metrics.months.map((month) => <ProgressRow key={month.key} label={month.label} value={currency(month.revenue)} percent={metrics.maxMonthlyRevenue ? (month.revenue / metrics.maxMonthlyRevenue) * 100 : 0} />)}
          </ReportCard>
          <ReportCard title="Confirmed Bookings by Event Type" icon={<Calendar size={16} />}>
            {metrics.eventTypes.length ? metrics.eventTypes.map((item) => <ProgressRow key={item.label} label={item.label} value={`${item.count} booking${item.count === 1 ? '' : 's'}`} percent={metrics.confirmedBookings.length ? (item.count / metrics.confirmedBookings.length) * 100 : 0} tone="purple" />) : <EmptyState text="No confirmed bookings are recorded yet." />}
          </ReportCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Paid Revenue" value={currency(metrics.paidRevenue)} detail={`${metrics.paidInvoices.length} paid invoices`} />
          <SummaryCard label="Outstanding Invoices" value={currency(metrics.outstandingRevenue)} detail={`${metrics.outstandingInvoices.length} sent or overdue invoices`} />
          <SummaryCard label="Current-Month Event Days" value={String(metrics.currentMonthEventDays)} detail="Distinct confirmed or completed event dates" />
        </div>

        <p className="text-[10px] leading-relaxed text-zinc-600">These reports only reflect records saved in the portal. They are not bank reconciliation, tax advice, or payment-processor settlement reports.</p>
      </div>
    </PortalPageFrame>
  )
}

function buildMetrics(data: ReportData) {
  const confirmedBookings = data.bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const paidInvoices = data.invoices.filter((invoice) => invoice.status === 'paid')
  const outstandingInvoices = data.invoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'overdue')
  const paidRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const outstandingRevenue = outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
  const recordedExpenses = data.expenses.filter((expense) => expense.status !== 'cancelled').reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
  const bookedLeadIds = new Set(confirmedBookings.map((booking) => booking.inquiry_id).filter((id): id is string => Boolean(id)))
  const conversionRate = data.inquiries.length ? (bookedLeadIds.size / data.inquiries.length) * 100 : 0
  const averageBookingValue = confirmedBookings.length ? confirmedBookings.reduce((sum, booking) => sum + Number(booking.contract_total || 0), 0) / confirmedBookings.length : 0
  const inquiryCreatedAt = new Map(data.inquiries.map((inquiry) => [inquiry.id, new Date(inquiry.created_at).getTime()]))
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
  return { confirmedBookings, paidInvoices, outstandingInvoices, paidRevenue, outstandingRevenue, recordedExpenses, netIncome: paidRevenue - recordedExpenses, bookedLeadIds, conversionRate, averageBookingValue, averageDaysToBook, months, maxMonthlyRevenue, eventTypes, currentMonthEventDays }
}

function lastSixMonths() { const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }); return Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); return { key: monthKey(date.toISOString()), label: formatter.format(date) } }) }
function monthKey(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function currency(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value) }
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"` }

function StatsPanel({ label, value, detail, loading }: { label: string; value: string; detail: string; loading: boolean }) { return <div className="luxor-glass-card rounded-xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] min-h-[118px]"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p><p className="font-mono text-xl font-bold text-white mt-2">{loading ? 'Loading…' : value}</p><p className="text-[10px] text-zinc-600 mt-3">{detail}</p></div> }
function ReportCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4"><h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2"><span className="text-[#caa24c]">{icon}</span>{title}</h3><div className="space-y-4 pt-2 text-xs">{children}</div></div> }
function ProgressRow({ label, value, percent, tone = 'gold' }: { label: string; value: string; percent: number; tone?: 'gold' | 'purple' }) { return <div className="space-y-1.5"><div className="flex justify-between gap-4 font-bold"><span className="text-white">{label}</span><span className="font-mono text-zinc-400">{value}</span></div><div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden"><div className={`h-full rounded-full ${tone === 'purple' ? 'bg-purple-500' : 'bg-[#caa24c]'}`} style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }} /></div></div> }
function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="luxor-glass-card rounded-2xl p-5 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</p><p className="mt-2 font-mono text-xl font-bold text-white">{value}</p><p className="mt-2 text-[10px] text-zinc-600">{detail}</p></div> }
function EmptyState({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-xs text-zinc-600">{text}</p> }
