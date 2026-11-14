'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Calendar, Download, RefreshCw, Users } from '@/lib/icons/phosphor-compat'
import { PortalButton, PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { type LuxorBooking, type LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { getLuxorBusinessFinanceRows, getLuxorBusinessInquiries } from '@/lib/luxorFinanceReporting'
import { LUXOR_PERMANENT_TEST_LEAD_ID } from '@/lib/luxorTestLeadPolicy'
import { buildLuxorLeadBookingCsv, downloadLuxorCsv } from '@/lib/luxorReportCsv'

type ReportData = { inquiries: LuxorInquiry[]; bookings: LuxorBooking[] }
const EMPTY_DATA: ReportData = { inquiries: [], bookings: [] }

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
      const [inquiriesResponse, bookingsResponse] = await Promise.all([
        fetch('/api/inquiries'),
        fetch('/api/bookings?strictMetrics=1&financeRowsOnly=1'),
      ])
      if (!inquiriesResponse.ok || !bookingsResponse.ok) throw new Error('Some lead or booking records could not be loaded.')
      const [inquiries, bookings] = await Promise.all([inquiriesResponse.json(), bookingsResponse.json()])
      if (!Array.isArray(inquiries) || !Array.isArray(bookings)) throw new Error('Lead and booking records could not be verified.')

      const inquiryRows = inquiries as LuxorInquiry[]
      const bookingRows = bookings as LuxorBooking[]
      const inquiryIds = [...new Set([
        ...inquiryRows.map((inquiry) => inquiry.id),
        ...bookingRows.map((booking) => booking.inquiry_id).filter((id): id is string => typeof id === 'string' && Boolean(id)),
      ])]
      const bookingIds = [...new Set(bookingRows.map((booking) => booking.id).filter((id): id is string => typeof id === 'string'))]
      const testInquiryIds = new Set<string>()
      const testBookingIds = new Set<string>()

      for (let offset = 0; offset < Math.max(inquiryIds.length, bookingIds.length); offset += 1000) {
        const inquiryBatch = inquiryIds.slice(offset, offset + 1000)
        const bookingBatch = bookingIds.slice(offset, offset + 1000)
        const response = await fetch('/api/portal/test-inquiry-classification', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiryIds: inquiryBatch, bookingIds: bookingBatch }),
        })
        if (!response.ok) throw new Error('Verified test-record classification is unavailable; reports are hidden.')
        const classification = await response.json() as { testInquiryIds?: unknown; testBookingIds?: unknown; unresolvedBookingIds?: unknown }
        const requestedInquiries = new Set(inquiryBatch.map((id) => id.toLowerCase()))
        const requestedBookings = new Set(bookingBatch.map((id) => id.toLowerCase()))
        if (!Array.isArray(classification.testInquiryIds)
          || !classification.testInquiryIds.every((id) => typeof id === 'string' && requestedInquiries.has(id.toLowerCase()))
          || !Array.isArray(classification.testBookingIds)
          || !classification.testBookingIds.every((id) => typeof id === 'string' && requestedBookings.has(id.toLowerCase()))
          || !Array.isArray(classification.unresolvedBookingIds) || classification.unresolvedBookingIds.length) {
          throw new Error('Verified test-record classification is unavailable; reports are hidden.')
        }
        classification.testInquiryIds.forEach((id: string) => testInquiryIds.add(id.toLowerCase()))
        classification.testBookingIds.forEach((id: string) => testBookingIds.add(id.toLowerCase()))
      }
      for (const inquiry of inquiryRows) {
        if (inquiry.is_test === true || inquiry.metadata?.is_test_record === true) testInquiryIds.add(inquiry.id.toLowerCase())
      }
      setData({ inquiries: inquiryRows, bookings: bookingRows })
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

  const report = useMemo(() => buildReport(data, verifiedTestInquiryIds, verifiedTestBookingIds), [data, verifiedTestInquiryIds, verifiedTestBookingIds])

  const downloadCsv = () => {
    if (!classificationVerified) return
    const csv = buildLuxorLeadBookingCsv({
      generatedAt: new Date().toISOString(),
      throughMonth: report.months.at(-1)?.label ?? '',
      newLeads30Days: report.newLeads30Days,
      bookings30Days: report.bookings30Days,
      bookedLeadCount: report.bookedLeadCount,
      totalLeads: report.totalLeads,
      months: report.months,
      pipeline: report.pipeline,
      eventTypes: report.eventTypes,
    })
    downloadLuxorCsv(csv, 'luxor-lead-booking-report')
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-5">
      <PortalPageHeader
        icon={<BarChart3 size={18} />}
        title="Reports"
        description="See inquiry activity, booking patterns, and what is moving through the pipeline."
        actions={<div className="flex flex-wrap gap-2">
          <PortalButton onClick={() => void loadReports()} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</PortalButton>
          <PortalButton onClick={downloadCsv} disabled={!classificationVerified}><Download size={13} /> Export CSV</PortalButton>
        </div>}
      />

      {error && <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
      {!classificationVerified && !loading && !error && <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm">Verified record coverage is unavailable; report totals are hidden.</div>}

      {classificationVerified && <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8 space-y-5">
        <section aria-label="Lead and booking summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard icon={<Users size={17} />} label="New leads" value={String(report.newLeads30Days)} detail="In the last 30 days" loading={loading} />
          <MetricCard icon={<Calendar size={17} />} label="Confirmed bookings" value={String(report.bookings30Days)} detail="In the last 30 days" loading={loading} />
          <MetricCard icon={<BarChart3 size={17} />} label="Leads with a booking" value={String(report.bookedLeadCount)} detail={`Of ${report.totalLeads} recorded inquiries, all time`} loading={loading} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ReportSection title="Inquiry and booking activity" description="Inquiries use creation date; bookings use booked date, falling back to record creation when missing.">
            <div className="space-y-4">
              {report.months.map((month) => {
                const maxValue = Math.max(1, ...report.months.flatMap((item) => [item.inquiries, item.bookings]))
                return <div key={month.key} className="grid grid-cols-[5rem_1fr] items-center gap-3">
                  <span className="text-xs text-[color:var(--portal-muted)]">{month.label}</span>
                  <div className="space-y-1.5">
                    <ActivityBar label="Inquiries" count={month.inquiries} max={maxValue} tone="gold" />
                    <ActivityBar label="Bookings" count={month.bookings} max={maxValue} tone="green" />
                  </div>
                </div>
              })}
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[color:var(--portal-border)] pt-3 text-xs text-[color:var(--portal-muted)]">
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#caa24c]" /> Inquiries</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Bookings</span>
              </div>
            </div>
          </ReportSection>

          <ReportSection title="Lead pipeline" description="Current inquiry status across all recorded leads.">
            {report.pipeline.length ? <div className="divide-y divide-[color:var(--portal-border)]">
              {report.pipeline.map((row) => <div key={row.label} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold text-[color:var(--portal-text)]">{row.label}</span>
                  <span className="h-1.5 min-w-2 flex-1 overflow-hidden rounded-full bg-[color:var(--portal-soft)]">
                    <span className="block h-full rounded-full bg-[#caa24c]" style={{ width: `${Math.max(row.count ? 4 : 0, report.totalLeads ? row.count / report.totalLeads * 100 : 0)}%` }} />
                  </span>
                </div>
                <span className="w-9 text-right text-sm font-bold tabular-nums text-[color:var(--portal-text)]">{row.count}</span>
              </div>)}
            </div> : <EmptyState text="No inquiry activity is recorded yet." />}
          </ReportSection>
        </section>

        <ReportSection title="Confirmed bookings by event type" description="Based on confirmed and completed bookings, all time.">
          {report.eventTypes.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {report.eventTypes.map((row) => <div key={row.label} className="space-y-1.5">
              <div className="flex justify-between gap-4 text-sm">
                <span className="truncate font-medium text-[color:var(--portal-text)]">{row.label}</span>
                <span className="shrink-0 tabular-nums text-[color:var(--portal-muted)]">{row.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-soft)]"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${report.confirmedBookings.length ? row.count / report.confirmedBookings.length * 100 : 0}%` }} /></div>
            </div>)}
          </div> : <EmptyState text="No confirmed bookings are recorded yet." />}
        </ReportSection>

        <p className="text-xs leading-relaxed text-[color:var(--portal-muted)]">A lead is counted here once it has at least one linked confirmed or completed booking. Recent leads are still in progress, so this is a count rather than a conversion rate. Balances, payment history, and budgets are in Finances.</p>
      </div>}
    </PortalPageFrame>
  )
}

function buildReport(data: ReportData, testInquiryIds: ReadonlySet<string>, testBookingIds: ReadonlySet<string>) {
  const financeRows = getLuxorBusinessFinanceRows({ invoices: [], bookings: data.bookings, expenses: [], testInquiryIds, testBookingIds })
  const verifiedTestInquiryIds = new Set([...financeRows.testInquiryIds, LUXOR_PERMANENT_TEST_LEAD_ID.toLowerCase()])
  const inquiries = getLuxorBusinessInquiries(data.inquiries, verifiedTestInquiryIds)
  const confirmedBookings = financeRows.bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const inquiryIds = new Set(inquiries.map((inquiry) => inquiry.id.toLowerCase()))
  const bookedLeadIds = new Set(confirmedBookings.map((booking) => booking.inquiry_id?.toLowerCase()).filter((id): id is string => Boolean(id && inquiryIds.has(id))))
  const totalLeads = inquiries.length
  const now = new Date()
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const newLeads30Days = inquiries.filter((inquiry) => isWithin(inquiry.created_at, cutoff, now.getTime())).length
  const datedBookings = confirmedBookings.map((booking) => ({ booking, bookedAt: booking.booked_at || booking.created_at }))
  const bookings30Days = datedBookings.filter(({ bookedAt }) => isWithin(bookedAt, cutoff, now.getTime())).length

  const months = lastSixMonths(now)
  const monthIndex = new Map(months.map((month, index) => [month.key, index]))
  for (const inquiry of inquiries) {
    const index = monthIndex.get(monthKey(inquiry.created_at))
    if (index !== undefined) months[index].inquiries += 1
  }
  for (const { bookedAt } of datedBookings) {
    const index = monthIndex.get(monthKey(bookedAt))
    if (index !== undefined) months[index].bookings += 1
  }

  const stageLabels: Record<string, string> = {
    new: 'New', contacted: 'Contacted', tour_requested: 'Tour requested', tour_confirmed: 'Tour confirmed',
    proposal_sent: 'Proposal sent', booked: 'Booked', closed_lost: 'Closed / not booked',
  }
  const stageOrder = ['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent', 'booked', 'closed_lost']
  const stageCounts = new Map<string, number>()
  for (const inquiry of inquiries) {
    const stage = bookedLeadIds.has(inquiry.id.toLowerCase()) ? 'booked' : inquiry.status
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1)
  }
  const pipeline = stageOrder.map((key) => ({ label: stageLabels[key], count: stageCounts.get(key) || 0 })).filter((row) => row.count > 0)
  const eventTypeCounts = new Map<string, number>()
  for (const booking of confirmedBookings) {
    const label = booking.event_type?.trim() || 'Not specified'
    eventTypeCounts.set(label, (eventTypeCounts.get(label) || 0) + 1)
  }
  const eventTypes = [...eventTypeCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return {
    totalLeads,
    newLeads30Days,
    bookings30Days,
    confirmedBookings,
    bookedLeadCount: bookedLeadIds.size,
    months,
    pipeline,
    eventTypes,
  }
}

function lastSixMonths(now: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1))
    const key = monthKey(date.toISOString())
    return { key, label: new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date), inquiries: 0, bookings: 0 }
  })
}

function monthKey(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function isWithin(value: string | null | undefined, start: number, end: number) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end
}

function MetricCard({ icon, label, value, detail, loading }: { icon: React.ReactNode; label: string; value: string; detail: string; loading: boolean }) {
  return <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[color:var(--portal-muted)]">{label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[color:var(--portal-text)]">{loading ? '…' : value}</p>
      </div>
      <span className="rounded-lg bg-[color:var(--portal-soft)] p-2 text-[#a37d2c] dark:text-[#f1d27a]">{icon}</span>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-[color:var(--portal-muted)]">{detail}</p>
  </div>
}

function ReportSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
    <div className="mb-4">
      <h2 className="text-base font-bold text-[color:var(--portal-text)]">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--portal-muted)]">{description}</p>
    </div>
    {children}
  </section>
}

function ActivityBar({ label, count, max, tone }: { label: string; count: number; max: number; tone: 'gold' | 'green' }) {
  return <div className="flex items-center gap-2">
    <span className="w-[4.4rem] text-[10px] text-[color:var(--portal-muted)]">{label}</span>
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--portal-soft)]" aria-label={`${label}: ${count}`}>
      <div className={`h-full rounded-full ${tone === 'gold' ? 'bg-[#caa24c]' : 'bg-emerald-600'}`} style={{ width: `${count ? Math.max(4, count / max * 100) : 0}%` }} />
    </div>
    <span className="w-6 text-right text-[10px] tabular-nums text-[color:var(--portal-muted)]">{count}</span>
  </div>
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg bg-[color:var(--portal-soft)] px-4 py-5 text-sm text-[color:var(--portal-muted)]">{text}</p>
}
