'use client'

import React, { useState, useTransition } from 'react'
import {
  Users,
  Eye,
  MousePointerClick,
  CalendarCheck2,
  CheckCircle2,
  FileText,
  BookmarkCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Info,
  ArrowDown,
  HelpCircle,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Filter,
} from 'lucide-react'
import { PortalSelect } from '@/components/portal/PortalUI'
import type { MarketingSalesMetrics, AnalyticsDatePreset } from '@/lib/luxorAnalyticsServer'

interface PortalMarketingSalesSectionProps {
  initialMetrics: MarketingSalesMetrics
  initialPreset: AnalyticsDatePreset
  initialRangeLabel: string
  initialComparisonLabel: string
}

const DATE_OPTIONS = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'previous_month', label: 'Previous Month' },
]

export function PortalMarketingSalesSection({
  initialMetrics,
  initialPreset,
  initialRangeLabel,
  initialComparisonLabel,
}: PortalMarketingSalesSectionProps) {
  const [preset, setPreset] = useState<AnalyticsDatePreset>(initialPreset)
  const [metrics, setMetrics] = useState<MarketingSalesMetrics>(initialMetrics)
  const [rangeLabel, setRangeLabel] = useState(initialRangeLabel)
  const [comparisonLabel, setComparisonLabel] = useState(initialComparisonLabel)
  const [isPending, startTransition] = useTransition()

  const handlePresetChange = (newPreset: string) => {
    const val = newPreset as AnalyticsDatePreset
    setPreset(val)

    startTransition(async () => {
      try {
        const res = await fetch(`/api/portal/analytics?preset=${val}`)
        if (!res.ok) return
        const data = await res.json()
        if (data?.metrics) {
          setMetrics(data.metrics)
          setRangeLabel(data.range.label)
          setComparisonLabel(data.range.comparisonLabel)
        }
      } catch (err) {
        console.error('Failed to update analytics preset:', err)
      }
    })
  }

  const renderDelta = (delta: number | null) => {
    if (delta === null) return null
    const isPositive = delta > 0
    const isZero = delta === 0

    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold font-mono ${
          isZero
            ? 'text-[color:var(--portal-muted)]'
            : isPositive
            ? 'text-emerald-500'
            : 'text-rose-500'
        }`}
      >
        {isPositive ? <TrendingUp size={12} /> : !isZero ? <TrendingDown size={12} /> : null}
        {isPositive ? `↑ ${delta}%` : isZero ? '0%' : `↓ ${Math.abs(delta)}%`}
      </span>
    )
  }

  const renderValueOrFallback = (val: number | null, prefix = '', suffix = '') => {
    if (val === null) {
      return (
        <span className="text-sm font-medium text-[color:var(--portal-muted)] italic">
          — No data connected
        </span>
      )
    }
    return `${prefix}${val.toLocaleString()}${suffix}`
  }

  return (
    <div className="space-y-6 pt-2">
      {/* SECTION HEADER & GLOBAL DATE PICKER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[color:var(--portal-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[color:var(--portal-text)] tracking-tight">
              Marketing & Sales
            </h2>
            <span className="inline-flex items-center rounded-full bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#caa24c]">
              Sales Command Center
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[color:var(--portal-muted)]">
            See how people are discovering Luxor and moving from website visitor to booked event.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Filter size={13} className="text-[color:var(--portal-muted)] shrink-0 hidden sm:block" />
          <PortalSelect
            value={preset}
            onChange={handlePresetChange}
            options={DATE_OPTIONS}
            disabled={isPending}
            className="w-44"
            buttonClassName="h-9 px-3 text-xs font-semibold bg-[color:var(--portal-card)] border-[color:var(--portal-border)] text-[color:var(--portal-text)]"
          />
        </div>
      </div>

      {/* LEAD GENERATION COMPARISON: Brochure Leads → Schedule a Visit Leads */}
      <div className="rounded-2xl border border-[#caa24c]/30 bg-gradient-to-r from-[#caa24c]/10 via-[color:var(--portal-card)] to-[#caa24c]/5 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#caa24c] text-[11px] font-bold text-black">
                ★
              </span>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">
                Lead Generation Comparison
              </p>
            </div>
            <h3 className="mt-1 text-lg font-bold text-[color:var(--portal-text)]">
              Brochure Leads vs. Schedule a Visit Leads
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              Capturing top-of-funnel leads via the free venue brochure while nurturing them toward scheduling a visit.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Brochure Leads */}
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase text-[#caa24c] font-bold">Venue Brochure</span>
                {renderDelta(metrics.brochureSubmissionsDeltaPercent ?? null)}
              </div>
              <p className="mt-1 text-xl font-extrabold text-[color:var(--portal-text)]">
                {metrics.brochureSubmissions ?? 0}
              </p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[color:var(--portal-muted)]">
                <span>{metrics.brochureFormViews ? `${metrics.brochureFormViews} views` : '—'}</span>
                <span className="font-semibold text-[#caa24c]">{metrics.brochureConversionRate ? `${metrics.brochureConversionRate}% cvr` : '—'}</span>
              </div>
            </div>

            {/* Visit Leads */}
            <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase text-[#caa24c] font-bold">Schedule a Visit</span>
                {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.toursBookedDeltaPercent ?? null)}
              </div>
              <p className="mt-1 text-xl font-extrabold text-[color:var(--portal-text)]">
                {metrics.visitSubmissions ?? metrics.toursBooked ?? 0}
              </p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-[color:var(--portal-muted)]">
                <span>{metrics.visitPageViews ? `${metrics.visitPageViews} views` : `${metrics.tourPageVisits || '—'} views`}</span>
                <span className="font-semibold text-[#caa24c]">{metrics.visitConversionRate ? `${metrics.visitConversionRate}% cvr` : '—'}</span>
              </div>
            </div>

            {/* Comparison Ratio */}
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/10 p-3 flex flex-col justify-between">
              <span className="text-[9px] font-mono uppercase text-[#caa24c] font-bold">Funnel Multiplier</span>
              <p className="mt-1 text-lg font-black text-[#caa24c]">
                {metrics.leadFunnelComparison?.brochureLeads && metrics.leadFunnelComparison?.visitLeads
                  ? `${(metrics.leadFunnelComparison.brochureLeads / Math.max(1, metrics.leadFunnelComparison.visitLeads)).toFixed(1)}x`
                  : 'N/A'}
              </p>
              <p className="text-[10px] text-[color:var(--portal-muted)] truncate">Brochure to visit ratio</p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. MARKETING & SALES KPI CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-8">
        {/* Card 1: Website Visitors */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--portal-muted)]">
                <Users size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-[color:var(--portal-faint)]">Site</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Website Visitors
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {renderValueOrFallback(metrics.websiteVisitors)}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.websiteVisitorsDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 2: Tour Page Visits */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--portal-muted)]">
                <Eye size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-[color:var(--portal-faint)]">Traffic</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Visit Page Visits
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {renderValueOrFallback(metrics.visitPageViews ?? metrics.tourPageVisits)}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.tourPageVisitsDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 3: Tour Clicks */}
        <div className="luxor-glass-card relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[#caa24c]">
                <MousePointerClick size={18} strokeWidth={1.5} />
              </span>
              <div className="relative group/tip cursor-help">
                <Info size={14} className="text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors" />
                <div className="absolute right-0 top-6 z-50 hidden w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[11px] font-normal leading-relaxed text-[color:var(--portal-text)] shadow-2xl backdrop-blur-xl group-hover/tip:block">
                  <p className="font-bold text-[#caa24c] mb-1">Visit Clicks (Intent)</p>
                  People who clicked the visit scheduling CTA. This does not mean they successfully scheduled a visit.
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Visit Clicks
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {renderValueOrFallback(metrics.tourClicks)}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.tourClicksDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 4: ⭐ VISITS SCHEDULED (Primary Prominent Metric) */}
        <div className="luxor-glass-card relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 border-2 border-[#caa24c]/40 bg-gradient-to-b from-[#caa24c]/[0.08] to-transparent shadow-xl group">
          <div className="absolute -right-2 -top-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#caa24c] text-[9px] text-[#050505] font-bold">
              ★
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[#caa24c]">
                <CalendarCheck2 size={20} strokeWidth={1.75} />
              </span>
              <div className="relative group/tip cursor-help">
                <Info size={14} className="text-[#caa24c] hover:text-[#dfbd68] transition-colors" />
                <div className="absolute right-0 top-6 z-50 hidden w-60 rounded-xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] p-3 text-[11px] font-normal leading-relaxed text-[color:var(--portal-text)] shadow-2xl backdrop-blur-xl group-hover/tip:block">
                  <p className="font-bold text-[#caa24c] mb-1">Visits Scheduled (Appointments)</p>
                  People who successfully completed the scheduling process and created a visit appointment.
                </div>
              </div>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">
              Visits Scheduled
            </p>
            <p className="mt-1 text-3xl sm:text-4xl font-black text-[color:var(--portal-text)] tracking-tight">
              {metrics.visitSubmissions ?? metrics.toursBooked}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[#caa24c]/30 flex items-center justify-between text-[11px]">
            {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.toursBookedDeltaPercent)}
            <span className="text-[10px] font-medium text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 5: Tours Completed */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--portal-muted)]">
                <CheckCircle2 size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-[color:var(--portal-faint)]">Attended</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Tours Completed
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {metrics.toursCompleted}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.toursCompletedDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 6: Proposals Sent */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[color:var(--portal-muted)]">
                <FileText size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-[color:var(--portal-faint)]">Sales</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Proposals Sent
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {metrics.proposalsSent}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.proposalsSentDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 7: Bookings */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-500">
                <BookmarkCheck size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-emerald-500/80">Closed</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Bookings
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight">
              {metrics.bookings}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.bookingsDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>

        {/* Card 8: Revenue */}
        <div className="luxor-glass-card flex flex-col justify-between rounded-2xl p-4 sm:p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[#caa24c]">
                <DollarSign size={18} strokeWidth={1.5} />
              </span>
              <span className="text-[9px] font-mono uppercase text-[color:var(--portal-faint)]">Total</span>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
              Revenue
            </p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight font-mono">
              ${metrics.revenue.toLocaleString()}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between text-[10px]">
            {renderDelta(metrics.revenueDeltaPercent)}
            <span className="text-[10px] text-[color:var(--portal-muted)]">{comparisonLabel}</span>
          </div>
        </div>
      </div>

      {/* 2. VISUAL SALES FUNNEL */}
      <div className="luxor-glass-card rounded-2xl p-5 sm:p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#caa24c]">
              Sales Funnel
            </h3>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">
              From website visitor to confirmed event
            </p>
          </div>
          <span className="text-[10px] font-mono text-[color:var(--portal-muted)]">
            Period: {rangeLabel}
          </span>
        </div>

        {/* Funnel progression display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {metrics.funnel.map((item, index) => {
            const isFirst = index === 0
            const isTourBookedStage = item.stage === 'Tours Booked'

            return (
              <div
                key={item.stage}
                className={`relative flex flex-col justify-between rounded-xl p-4 border transition-all ${
                  isTourBookedStage
                    ? 'border-[#caa24c]/40 bg-[#caa24c]/[0.05]'
                    : 'border-[color:var(--portal-border)]/50 bg-[color:var(--portal-soft)]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-mono uppercase text-[color:var(--portal-muted)]">
                      Stage 0{index + 1}
                    </span>
                    {!isFirst && item.conversionRateFromPrevious !== null ? (
                      <span className="rounded-full bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] px-2 py-0.5 text-[10px] font-bold font-mono text-[#caa24c]">
                        {item.conversionRateFromPrevious}%
                      </span>
                    ) : !isFirst && item.count === null ? (
                      <span className="text-[9px] text-[color:var(--portal-muted)] font-mono">—</span>
                    ) : null}
                  </div>

                  <p className="text-xs font-bold text-[color:var(--portal-text)] line-clamp-1">
                    {item.stage}
                  </p>

                  <p className="mt-2 text-2xl font-black text-[color:var(--portal-text)] tracking-tight">
                    {item.count !== null ? item.count.toLocaleString() : (
                      <span className="text-sm font-normal text-[color:var(--portal-muted)] italic">—</span>
                    )}
                  </p>

                  {item.description && (
                    <p className="mt-1 text-[10px] text-[color:var(--portal-muted)] line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                {!isFirst && (
                  <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 text-[10px] text-[color:var(--portal-muted)] flex items-center gap-1">
                    <ArrowDown size={10} className="text-[#caa24c] shrink-0" />
                    <span>from prior stage</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. TRAFFIC SOURCES & WEBSITE PERFORMANCE TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Where Are Visitors Coming From? */}
        <div className="luxor-glass-card rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">
                  Where Are Visitors Coming From?
                </h3>
                <p className="text-[11px] text-[color:var(--portal-muted)] mt-0.5">
                  Understand which marketing channels generate actual tours and bookings.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--portal-border)]/60 text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">
                    <th className="pb-3 pr-2">Channel</th>
                    <th className="pb-3 px-2 text-right">Visitors</th>
                    <th className="pb-3 px-2 text-right">Tour Visits</th>
                    <th className="pb-3 px-2 text-right">Tour Clicks</th>
                    <th className="pb-3 px-2 text-right text-[#caa24c]">Tours Booked</th>
                    <th className="pb-3 px-2 text-right">Bookings</th>
                    <th className="pb-3 pl-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/30">
                  {metrics.trafficSources.map((row) => (
                    <tr key={row.source} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                      <td className="py-2.5 pr-2 font-medium text-[color:var(--portal-text)]">
                        {row.source}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {row.visitors !== null ? row.visitors : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {row.tourPageVisits !== null ? row.tourPageVisits : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {row.tourClicks !== null ? row.tourClicks : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-[#caa24c]">
                        {row.toursBooked}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-500">
                        {row.bookings}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono text-[color:var(--portal-text)] font-semibold">
                        ${row.revenue.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Table 2: Website Performance */}
        <div className="luxor-glass-card rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">
                  Website Performance
                </h3>
                <p className="text-[11px] text-[color:var(--portal-muted)] mt-0.5">
                  Page engagement, scheduling CTA clicks, and drop-off rates across key surfaces.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--portal-border)]/60 text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">
                    <th className="pb-3 pr-2">Page</th>
                    <th className="pb-3 px-2 text-right">Views</th>
                    <th className="pb-3 px-2 text-right">Engagement</th>
                    <th className="pb-3 px-2 text-right">CTA Clicks</th>
                    <th className="pb-3 pl-2 text-right">Exit Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/30">
                  {metrics.websitePerformance.map((page) => (
                    <tr
                      key={page.path}
                      className={`hover:bg-[color:var(--portal-soft)]/50 transition-colors ${
                        page.isPriority ? 'bg-[#caa24c]/[0.03]' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-2 font-medium text-[color:var(--portal-text)] flex items-center gap-1.5">
                        {page.pageName}
                        {page.isPriority && (
                          <span className="rounded bg-[#caa24c]/10 text-[#caa24c] px-1 text-[8px] font-mono uppercase font-bold">
                            Priority
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {page.views !== null ? page.views : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {page.engagementRate !== null ? page.engagementRate : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-[#caa24c]">
                        {page.ctaClicks !== null ? page.ctaClicks : '—'}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono text-[color:var(--portal-muted)]">
                        {page.exitRate !== null ? page.exitRate : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 4. FUNNEL HEALTH / NEEDS ATTENTION (Diagnostic Signals) */}
      <div className="luxor-glass-card rounded-2xl p-5 sm:p-6 shadow-2xl border border-[color:var(--portal-border)]">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={17} className="text-[#caa24c]" />
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">
            Funnel Health & Diagnostic Signals
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {metrics.diagnostics.map((diag) => (
            <div
              key={diag.id}
              className={`rounded-xl p-4 border flex flex-col justify-between ${
                diag.type === 'alert'
                  ? 'border-rose-500/25 bg-rose-500/5'
                  : diag.type === 'warning'
                  ? 'border-[#caa24c]/30 bg-[#caa24c]/5'
                  : 'border-emerald-500/25 bg-emerald-500/5'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--portal-muted)]">
                    {diag.stageTransition}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase font-mono ${
                      diag.type === 'alert'
                        ? 'bg-rose-500/20 text-rose-400'
                        : diag.type === 'warning'
                        ? 'bg-[#caa24c]/20 text-[#caa24c]'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {diag.type === 'alert' ? 'Leak Detected' : diag.type === 'warning' ? 'Watch' : 'Optimal'}
                  </span>
                </div>
                <p className="text-xs font-bold text-[color:var(--portal-text)] leading-snug">
                  {diag.message}
                </p>
                <p className="mt-2 text-[11px] text-[color:var(--portal-muted)] leading-relaxed">
                  {diag.recommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
