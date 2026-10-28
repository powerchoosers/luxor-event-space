'use client'

import React, { useRef, useState, useTransition } from 'react'
import { motion, useReducedMotion } from 'motion/react'
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
  AlertTriangle,
  Filter,
  BookOpen,
} from 'lucide-react'
import { PortalSelect } from '@/components/portal/PortalUI'
import { BorderBeam } from '@/components/ui/border-beam'
import { MagicCard } from '@/components/ui/magic-card'
import { AnimatedCircularProgressBar } from '@/components/ui/animated-circular-progress-bar'
import { AnimatedBeam } from '@/components/ui/animated-beam'
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

function MetricSparkBar({
  percent,
  color = 'gold',
  delay = 0,
}: {
  percent: number
  color?: 'gold' | 'emerald' | 'neutral'
  delay?: number
}) {
  const prefersReducedMotion = useReducedMotion()
  const clamped = Math.max(8, Math.min(100, percent))

  const barColor =
    color === 'emerald'
      ? 'bg-gradient-to-r from-emerald-500/70 to-emerald-400'
      : color === 'gold'
      ? 'bg-gradient-to-r from-[#caa24c] to-[#f1d27a]'
      : 'bg-gradient-to-r from-[#caa24c]/55 to-[#caa24c]/85'

  return (
    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/45">
      <motion.div
        className={`h-full rounded-full ${barColor}`}
        initial={{ width: prefersReducedMotion ? `${clamped}%` : 0 }}
        style={{ width: prefersReducedMotion ? `${clamped}%` : 0 }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: true, margin: '0px 0px -30px 0px' }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.85,
          delay: prefersReducedMotion ? 0 : delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </div>
  )
}

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
  const prefersReducedMotion = useReducedMotion()

  // Refs for AnimatedBeam in Lead Generation Comparison
  const beamContainerRef = useRef<HTMLDivElement>(null)
  const brochureNodeRef = useRef<HTMLDivElement>(null)
  const multiplierNodeRef = useRef<HTMLDivElement>(null)
  const visitNodeRef = useRef<HTMLDivElement>(null)

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
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
          isZero
            ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
            : isPositive
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        }`}
      >
        {isPositive ? <TrendingUp size={11} /> : !isZero ? <TrendingDown size={11} /> : null}
        {isPositive ? `+${delta}%` : isZero ? '0%' : `-${Math.abs(delta)}%`}
      </span>
    )
  }

  const formatStaticValue = (
    val: number | null | undefined,
    options?: { prefix?: string; suffix?: string; decimals?: number }
  ) => {
    if (val === null || val === undefined) {
      return (
        <span className="text-sm font-medium text-[color:var(--portal-muted)] italic">
          — No data
        </span>
      )
    }
    const formatted =
      options?.decimals !== undefined
        ? val.toLocaleString('en-US', {
            minimumFractionDigits: options.decimals,
            maximumFractionDigits: options.decimals,
          })
        : val.toLocaleString('en-US')
    return `${options?.prefix ?? ''}${formatted}${options?.suffix ?? ''}`
  }

  const visitPageCount = metrics.visitPageViews ?? metrics.tourPageVisits ?? 0
  const visitsScheduledCount = metrics.visitSubmissions ?? metrics.toursBooked ?? 0
  const maxTraffic = Math.max(1, metrics.websiteVisitors ?? 1)

  const visitConversionNum =
    metrics.websiteVisitors && visitPageCount
      ? Math.round((visitPageCount / Math.max(1, metrics.websiteVisitors)) * 100)
      : 0

  const tourCompletionNum =
    metrics.tourAnalyticsAvailable && visitsScheduledCount > 0
      ? Math.round((metrics.toursCompleted / Math.max(1, visitsScheduledCount)) * 100)
      : 0

  const closeRateNum =
    metrics.proposalsSent > 0
      ? Math.round((metrics.bookings / Math.max(1, metrics.proposalsSent)) * 100)
      : 0

  const funnelMultiplier =
    metrics.leadFunnelComparison?.brochureLeads && metrics.leadFunnelComparison?.visitLeads
      ? (
          metrics.leadFunnelComparison.brochureLeads /
          Math.max(1, metrics.leadFunnelComparison.visitLeads)
        ).toFixed(1)
      : null

  const maxFunnelCount = Math.max(
    1,
    ...metrics.funnel.map((s) => (typeof s.count === 'number' ? s.count : 0))
  )

  const maxChannelVisitors = Math.max(
    1,
    ...metrics.trafficSources.map((r) => (typeof r.visitors === 'number' ? r.visitors : 0))
  )

  const maxPageViews = Math.max(
    1,
    ...metrics.websitePerformance.map((p) => (typeof p.views === 'number' ? p.views : 0))
  )

  return (
    <div className="space-y-4 sm:space-y-6 pt-0 sm:pt-2">
      {/* SECTION HEADER & GLOBAL DATE PICKER */}
      <div className="flex flex-col gap-2.5 sm:gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[color:var(--portal-border)] pb-3 sm:pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-text)] tracking-tight">
              Marketing & Sales
            </h2>
            <span className="inline-flex items-center rounded-full bg-[#caa24c]/10 border border-[#caa24c]/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#caa24c]">
              Command Center
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

      {/* LEAD GENERATION COMPARISON WITH ANIMATED BEAM FLOW */}
      <div className="relative overflow-hidden rounded-2xl border border-[#caa24c]/30 bg-gradient-to-r from-[#caa24c]/[0.08] via-[color:var(--portal-card)] to-[#caa24c]/[0.04] p-4 sm:p-6 shadow-xs">
        <BorderBeam size={140} duration={16} borderWidth={1.2} colorFrom="#f1d27a" colorTo="#caa24c" />
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#caa24c] text-[10px] font-bold text-[#18130d]">
                ★
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#caa24c]">
                Lead Generation Comparison
              </p>
            </div>
            <h3 className="mt-1.5 text-base sm:text-lg font-bold text-[color:var(--portal-text)] tracking-tight">
              Brochure Leads vs. Schedule a Visit Leads
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)] leading-relaxed">
              Capturing top-of-funnel leads via the free venue brochure while nurturing them toward scheduling a visit.
            </p>
          </div>

          {/* Visual Flow Diagram with AnimatedBeam */}
          <div
            ref={beamContainerRef}
            className="relative flex flex-col sm:flex-row items-stretch gap-3 xl:w-[680px]"
          >
            <div className="hidden sm:block pointer-events-none">
              <AnimatedBeam
                containerRef={beamContainerRef}
                fromRef={brochureNodeRef}
                toRef={visitNodeRef}
                duration={4.5}
                curvature={0}
                pathOpacity={0.25}
                gradientStartColor="#f1d27a"
                gradientStopColor="#caa24c"
              />
              <AnimatedBeam
                containerRef={beamContainerRef}
                fromRef={visitNodeRef}
                toRef={multiplierNodeRef}
                duration={4.5}
                delay={1.2}
                curvature={0}
                pathOpacity={0.25}
                gradientStartColor="#caa24c"
                gradientStopColor="#10b981"
              />
            </div>

            {/* Node 1: Venue Brochure */}
            <div ref={brochureNodeRef} className="relative z-10 flex-1 min-w-0">
              <MagicCard className="rounded-xl p-3.5 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[#caa24c] font-bold tracking-wider">
                      <BookOpen size={12} />
                      Venue Brochure
                    </span>
                    {renderDelta(metrics.brochureSubmissionsDeltaPercent ?? null)}
                  </div>
                  <p className="mt-1.5 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
                    {formatStaticValue(metrics.brochureSubmissions ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">{metrics.brochureClickedLeads ?? "—"} unique leads with recorded brochure clicks</p>
                  <MetricSparkBar percent={metrics.brochureConversionRate ?? 25} color="gold" delay={0.1} />
                </div>
                <div className="mt-2.5 pt-2 border-t border-[color:var(--portal-border)]/50 flex items-center justify-between text-[11px] text-[color:var(--portal-muted)]">
                  <span className="tabular-nums">{metrics.brochureFormViews ? `${metrics.brochureFormViews} views` : '—'}</span>
                  <span className="font-semibold text-[#caa24c] tabular-nums">
                    {metrics.brochureConversionRate ? `${metrics.brochureConversionRate}% cvr` : '—'}
                  </span>
                </div>
              </MagicCard>
            </div>

            {/* Node 2: Schedule a Visit */}
            <div ref={visitNodeRef} className="relative z-10 flex-1 min-w-0">
              <MagicCard className="rounded-xl p-3.5 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[#caa24c] font-bold tracking-wider">
                      <CalendarCheck2 size={12} />
                      Schedule a Visit
                    </span>
                    {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.toursBookedDeltaPercent ?? null)}
                  </div>
                  <p className="mt-1.5 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
                    {formatStaticValue(visitsScheduledCount)}
                  </p>
                  <MetricSparkBar percent={metrics.visitConversionRate ?? 35} color="emerald" delay={0.2} />
                </div>
                <div className="mt-2.5 pt-2 border-t border-[color:var(--portal-border)]/50 flex items-center justify-between text-[11px] text-[color:var(--portal-muted)]">
                  <span className="tabular-nums">
                    {metrics.visitPageViews ? `${metrics.visitPageViews} views` : `${metrics.tourPageVisits || '—'} views`}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {metrics.visitConversionRate ? `${metrics.visitConversionRate}% cvr` : '—'}
                  </span>
                </div>
              </MagicCard>
            </div>

            {/* Node 3: Funnel Multiplier Bridge */}
            <div
              ref={multiplierNodeRef}
              className="relative z-10 flex-1 min-w-0 rounded-xl border border-[#caa24c]/40 bg-[color:var(--portal-card)] p-3.5 flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-[#caa24c] font-bold tracking-wider">Funnel Multiplier</span>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#caa24c]/15 text-[10px] font-bold text-[#caa24c]">
                    ⇄
                  </span>
                </div>
                <div className="my-1.5 flex items-baseline gap-2">
                  <p className="text-2xl font-extrabold text-[#caa24c] tabular-nums">
                    {funnelMultiplier ? `${funnelMultiplier}x` : 'N/A'}
                  </p>
                  <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">ratio</span>
                </div>
                {/* Visual Comparative Bar */}
                <div className="space-y-1">
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/50 p-0.5 gap-0.5">
                    <motion.div
                      className="h-full rounded-l-full bg-[#caa24c]"
                      initial={{ width: prefersReducedMotion ? '75%' : 0 }}
                      style={{ width: prefersReducedMotion ? '75%' : 0 }}
                      whileInView={{ width: '75%' }}
                      viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <motion.div
                      className="h-full rounded-r-full bg-emerald-500"
                      initial={{ width: prefersReducedMotion ? '25%' : 0 }}
                      style={{ width: prefersReducedMotion ? '25%' : 0 }}
                      whileInView={{ width: '25%' }}
                      viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                      transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-[#caa24c]/20 text-[11px] text-[color:var(--portal-muted)] truncate">
                Brochure vs. visit volume
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 1. CONNECTED 3-STAGE FUNNEL PIPELINE WITH CIRCULAR GAUGES & SPARKBARS */}
      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[color:var(--portal-border)]">
          
          {/* STAGE 1: ACQUISITION & TRAFFIC (3 Metrics) */}
          <div className="p-4 sm:p-5 xl:col-span-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color:var(--portal-border)]/60">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] text-[10px] font-bold text-[color:var(--portal-text)]">
                  01
                </span>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--portal-text)]">
                    Acquisition & Traffic
                  </span>
                  <span className="text-[10px] text-[color:var(--portal-muted)]">
                    Top-of-funnel discovery & visit intent
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AnimatedCircularProgressBar
                  value={visitConversionNum}
                  gaugePrimaryColor="#caa24c"
                  gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                  className="size-11 text-[10px]"
                />
                <span className="hidden sm:inline text-[10px] font-semibold text-[color:var(--portal-muted)] leading-tight">
                  Visit<br />Rate
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Metric 1: Website Visitors */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[color:var(--portal-muted)]">
                        <Users size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Website Visitors
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[color:var(--portal-faint)] font-semibold tracking-wider">
                      Site
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(metrics.websiteVisitors)}
                  </p>
                  <MetricSparkBar percent={100} color="neutral" delay={0.05} />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.websiteVisitorsDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>

              {/* Metric 2: Visit Page Visits */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[color:var(--portal-muted)]">
                        <Eye size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Visit Page Visits
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[color:var(--portal-faint)] font-semibold tracking-wider">
                      Traffic
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(visitPageCount)}
                  </p>
                  <MetricSparkBar
                    percent={Math.round((visitPageCount / maxTraffic) * 100)}
                    color="gold"
                    delay={0.12}
                  />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.tourPageVisitsDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>

              {/* Metric 3: Visit Clicks */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[#caa24c]">
                        <MousePointerClick size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Visit Clicks
                      </p>
                    </div>
                    <div className="relative group/tip cursor-help shrink-0">
                      <Info size={13} className="text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors" />
                      <div className="absolute right-0 top-5 z-50 hidden w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-[11px] font-normal leading-relaxed text-[color:var(--portal-text)] shadow-2xl backdrop-blur-xl group-hover/tip:block">
                        <p className="font-bold text-[#caa24c] mb-1">Visit Clicks (Intent)</p>
                        People who clicked the visit scheduling CTA. This does not mean they successfully scheduled a visit.
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(metrics.tourClicks)}
                  </p>
                  <MetricSparkBar
                    percent={Math.round(((metrics.tourClicks ?? 0) / Math.max(1, visitPageCount)) * 100)}
                    color="neutral"
                    delay={0.18}
                  />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.tourClicksDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>
            </div>
          </div>

          {/* STAGE 2: ENGAGEMENT & TOURS (2 Metrics) */}
          <div className="p-4 sm:p-5 xl:col-span-3 flex flex-col justify-between bg-[color:var(--portal-soft)]/30">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color:var(--portal-border)]/60">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#caa24c]/15 border border-[#caa24c]/30 text-[10px] font-bold text-[#caa24c]">
                  02
                </span>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--portal-text)]">
                    Engagement
                  </span>
                  <span className="text-[10px] text-[color:var(--portal-muted)]">
                    Scheduled & attended
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AnimatedCircularProgressBar
                  value={tourCompletionNum}
                  gaugePrimaryColor="#caa24c"
                  gaugeSecondaryColor="rgba(202, 162, 76, 0.14)"
                  className="size-11 text-[10px]"
                />
                <span className="hidden sm:inline text-[10px] font-semibold text-[color:var(--portal-muted)] leading-tight">
                  Show<br />Rate
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
              {/* Metric 4: Visits Scheduled */}
              <div className="relative overflow-hidden rounded-xl border border-[#caa24c]/45 bg-gradient-to-b from-[#caa24c]/[0.09] to-[color:var(--portal-card)] p-3.5 flex flex-col justify-between shadow-xs">
                <BorderBeam size={70} duration={9} borderWidth={1.2} colorFrom="#f1d27a" colorTo="#caa24c" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[#caa24c]">
                        <CalendarCheck2 size={14} strokeWidth={1.75} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#caa24c] truncate">
                        Visits Scheduled
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#caa24c] text-[8px] text-[#18130d] font-bold">
                        ★
                      </span>
                      <div className="relative group/tip cursor-help">
                        <Info size={13} className="text-[#caa24c] hover:text-[#dfbd68] transition-colors" />
                        <div className="absolute right-0 top-5 z-50 hidden w-60 rounded-xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] p-3 text-[11px] font-normal leading-relaxed text-[color:var(--portal-text)] shadow-2xl backdrop-blur-xl group-hover/tip:block">
                          <p className="font-bold text-[#caa24c] mb-1">Visits Scheduled (Appointments)</p>
                          People who successfully completed the scheduling process and created a visit appointment.
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(visitsScheduledCount)}
                  </p>
                  <MetricSparkBar
                    percent={Math.round((visitsScheduledCount / Math.max(1, visitPageCount)) * 100)}
                    color="gold"
                    delay={0.22}
                  />
                </div>
                <div className="relative z-10 mt-3 pt-2 border-t border-[#caa24c]/25 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.visitSubmissionsDeltaPercent ?? metrics.toursBookedDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </div>

              {/* Metric 5: Tours Completed */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[color:var(--portal-muted)]">
                        <CheckCircle2 size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Tours Completed
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[color:var(--portal-faint)] font-semibold tracking-wider">
                      Attended
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {metrics.tourAnalyticsAvailable ? formatStaticValue(metrics.toursCompleted) : 'Unavailable'}
                  </p>
                  <MetricSparkBar percent={tourCompletionNum} color="gold" delay={0.28} />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.toursCompletedDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>
            </div>
          </div>

          {/* STAGE 3: CONVERSION & REVENUE (3 Metrics) */}
          <div className="p-4 sm:p-5 xl:col-span-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[color:var(--portal-border)]/60">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  03
                </span>
                <div>
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--portal-text)]">
                    Conversion & Revenue
                  </span>
                  <span className="text-[10px] text-[color:var(--portal-muted)]">
                    Proposals sent to closed events
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AnimatedCircularProgressBar
                  value={closeRateNum}
                  gaugePrimaryColor="#10b981"
                  gaugeSecondaryColor="rgba(16, 185, 129, 0.14)"
                  className="size-11 text-[10px]"
                />
                <span className="hidden sm:inline text-[10px] font-semibold text-[color:var(--portal-muted)] leading-tight">
                  Close<br />Rate
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 h-full">
              {/* Metric 6: Proposals Sent */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[color:var(--portal-muted)]">
                        <FileText size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Proposals Sent
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[color:var(--portal-faint)] font-semibold tracking-wider">
                      Sales
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(metrics.proposalsSent)}
                  </p>
                  <MetricSparkBar
                    percent={Math.round((metrics.proposalsSent / Math.max(1, visitsScheduledCount)) * 100)}
                    color="neutral"
                    delay={0.34}
                  />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.proposalsSentDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>

              {/* Metric 7: Bookings */}
              <MagicCard className="rounded-xl p-3.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-emerald-500">
                        <BookmarkCheck size={14} strokeWidth={1.6} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)] truncate">
                        Bookings
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider">
                      Closed
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(metrics.bookings)}
                  </p>
                  <MetricSparkBar percent={closeRateNum} color="emerald" delay={0.4} />
                </div>
                <div className="mt-3 pt-2 border-t border-[color:var(--portal-border)]/40 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.bookingsDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </MagicCard>

              {/* Metric 8: Revenue */}
              <div className="relative overflow-hidden rounded-xl border border-[#caa24c]/40 bg-gradient-to-b from-[#caa24c]/[0.08] to-[color:var(--portal-card)] p-3.5 flex flex-col justify-between shadow-xs">
                <BorderBeam size={75} duration={11} delay={3} borderWidth={1.2} colorFrom="#f1d27a" colorTo="#caa24c" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0 text-[#caa24c]">
                        <DollarSign size={14} strokeWidth={1.75} />
                      </span>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#caa24c] truncate">
                        Revenue
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase text-[#caa24c] font-bold tracking-wider">
                      Total
                    </span>
                  </div>
                  <p className="mt-2 text-xl sm:text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {formatStaticValue(metrics.revenue, {
                      prefix: '$',
                      decimals: metrics.revenue % 1 !== 0 ? 2 : 0,
                    })}
                  </p>
                  <MetricSparkBar percent={metrics.revenue > 0 ? 85 : 10} color="gold" delay={0.45} />
                </div>
                <div className="relative z-10 mt-3 pt-2 border-t border-[#caa24c]/25 flex items-center justify-between gap-1 text-[10px]">
                  {renderDelta(metrics.revenueDeltaPercent)}
                  <span className="text-[10px] text-[color:var(--portal-muted)] truncate">{comparisonLabel}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* TOUR ANALYTICS WITH VISUAL DONUT GAUGES & PROPORTIONAL BARS */}
      <section aria-labelledby="tour-analytics-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="tour-analytics-title" className="text-xs font-bold uppercase tracking-[0.18em] text-[#a8792f] dark:text-[#f1d27a]">
              Tour Analytics
            </h3>
            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
              Tours are grouped by scheduled date. Canceled tours are excluded from the rate denominator.
            </p>
            {!metrics.tourAnalyticsAvailable && (
              <p role="status" className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                Tour records could not be loaded. Metrics are unavailable.
              </p>
            )}
          </div>
          <span className="text-xs font-medium text-[color:var(--portal-muted)]">Period: {rangeLabel}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Tours Scheduled */}
          <MagicCard className="rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                Total Tours Scheduled
              </p>
              <CalendarCheck2 size={15} className="text-[#caa24c]" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
              {metrics.tourAnalyticsAvailable
                ? formatStaticValue(metrics.tourAnalytics.totalScheduled)
                : 'Unavailable'}
            </p>
            <MetricSparkBar percent={100} color="gold" delay={0.1} />
          </MagicCard>

          {/* Card 2: Completed Tours */}
          <MagicCard className="rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                Completed Tours
              </p>
              <CheckCircle2 size={15} className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
              {metrics.tourAnalyticsAvailable
                ? formatStaticValue(metrics.tourAnalytics.completed)
                : 'Unavailable'}
            </p>
            <MetricSparkBar
              percent={metrics.tourAnalyticsAvailable ? metrics.tourAnalytics.completionRate : 0}
              color="emerald"
              delay={0.2}
            />
          </MagicCard>

          {/* Card 3: Completion Rate with Circular Gauge */}
          <MagicCard className="rounded-xl p-4 flex flex-row items-center justify-between gap-3 w-full">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                Completion Rate
              </p>
              <p className="mt-1.5 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
                {metrics.tourAnalyticsAvailable ? `${metrics.tourAnalytics.completionRate}%` : 'Unavailable'}
              </p>
              <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                Attended vs. scheduled
              </p>
            </div>
            {metrics.tourAnalyticsAvailable && (
              <div className="ml-auto shrink-0 flex items-center justify-end">
                <AnimatedCircularProgressBar
                  value={metrics.tourAnalytics.completionRate}
                  gaugePrimaryColor="#10b981"
                  gaugeSecondaryColor="rgba(16, 185, 129, 0.14)"
                  className="size-14 text-xs"
                />
              </div>
            )}
          </MagicCard>

          {/* Card 4: No Shows with Circular Gauge */}
          <MagicCard className="rounded-xl p-4 flex flex-row items-center justify-between gap-3 w-full">
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                No Shows
              </p>
              <p className="mt-1.5 text-2xl font-extrabold text-[color:var(--portal-text)] tabular-nums">
                {metrics.tourAnalyticsAvailable ? (
                  <span>
                    {formatStaticValue(metrics.tourAnalytics.noShows)}{' '}
                    <span className="text-sm font-semibold text-[color:var(--portal-muted)]">
                      ({metrics.tourAnalytics.noShowRate}%)
                    </span>
                  </span>
                ) : (
                  'Unavailable'
                )}
              </p>
              <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                Missed appointments
              </p>
            </div>
            {metrics.tourAnalyticsAvailable && (
              <div className="ml-auto shrink-0 flex items-center justify-end">
                <AnimatedCircularProgressBar
                  value={metrics.tourAnalytics.noShowRate}
                  gaugePrimaryColor="#f59e0b"
                  gaugeSecondaryColor="rgba(245, 158, 11, 0.14)"
                  className="size-14 text-xs"
                />
              </div>
            )}
          </MagicCard>
        </div>
      </section>

      {/* 2. VISUAL SALES FUNNEL WITH ANIMATED BAR CHART */}
      <div className="luxor-glass-card rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#caa24c]">
              Sales Funnel Progression
            </h3>
            <p className="text-xs text-[color:var(--portal-muted)] mt-0.5">
              Visual volume and step-by-step conversion from website visitor to confirmed event
            </p>
          </div>
          <span className="text-xs font-medium text-[color:var(--portal-muted)]">
            Period: {rangeLabel}
          </span>
        </div>

        {/* Funnel progression display with animated fill bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {metrics.funnel.map((item, index) => {
            const isFirst = index === 0
            const isTourBookedStage = item.stage === 'Tours Booked'
            const countNum = typeof item.count === 'number' ? item.count : 0
            const barWidthPct = Math.max(10, Math.round((countNum / maxFunnelCount) * 100))

            return (
              <div
                key={item.stage}
                className={`relative flex flex-col justify-between rounded-xl p-3.5 border transition-all overflow-hidden ${
                  isTourBookedStage
                    ? 'border-[#caa24c]/45 bg-[#caa24c]/[0.06]'
                    : 'border-[color:var(--portal-border)]/60 bg-[color:var(--portal-soft)]/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--portal-muted)]">
                      Stage 0{index + 1}
                    </span>
                    {!isFirst && item.conversionRateFromPrevious !== null ? (
                      <span className="rounded-full bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#caa24c]">
                        {item.conversionRateFromPrevious}%
                      </span>
                    ) : !isFirst && item.count === null ? (
                      <span className="text-[10px] text-[color:var(--portal-muted)]">—</span>
                    ) : null}
                  </div>

                  <p className="text-xs font-bold text-[color:var(--portal-text)] line-clamp-1">
                    {item.stage}
                  </p>

                  <p className="mt-2 text-2xl font-extrabold text-[color:var(--portal-text)] tracking-tight tabular-nums">
                    {item.count !== null ? (
                      formatStaticValue(item.count)
                    ) : (
                      <span className="text-sm font-normal text-[color:var(--portal-muted)] italic">—</span>
                    )}
                  </p>

                  {/* Animated Stage Volume Bar */}
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]/45">
                    <motion.div
                      className={`h-full rounded-full ${
                        isTourBookedStage
                          ? 'bg-gradient-to-r from-[#caa24c] to-[#f1d27a]'
                          : 'bg-gradient-to-r from-[#caa24c]/60 to-[#caa24c]'
                      }`}
                      initial={{ width: prefersReducedMotion ? `${barWidthPct}%` : 0 }}
                      style={{ width: prefersReducedMotion ? `${barWidthPct}%` : 0 }}
                      whileInView={{ width: `${barWidthPct}%` }}
                      viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.9,
                        delay: prefersReducedMotion ? 0 : index * 0.08,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>

                  {item.description && (
                    <p className="mt-2 text-[10px] text-[color:var(--portal-muted)] line-clamp-2">
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

      {/* 3. TRAFFIC SOURCES & WEBSITE PERFORMANCE TABLES WITH INLINE DATA BARS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Where Are Visitors Coming From? */}
        <div className="luxor-glass-card rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--portal-text)]">
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
                  <tr className="border-b border-[color:var(--portal-border)]/60 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
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
                  {metrics.trafficSources.map((row, idx) => {
                    const visitorSharePct =
                      typeof row.visitors === 'number' && row.visitors > 0
                        ? Math.max(6, Math.round((row.visitors / maxChannelVisitors) * 100))
                        : 0

                    return (
                      <tr key={row.source} className="hover:bg-[color:var(--portal-soft)]/50 transition-colors">
                        <td className="py-2.5 pr-2 font-medium text-[color:var(--portal-text)] min-w-[130px]">
                          <div className="flex flex-col gap-1">
                            <span>{row.source}</span>
                            {visitorSharePct > 0 && (
                              <div className="h-1 w-24 overflow-hidden rounded-full bg-[color:var(--portal-border)]/40">
                                <motion.div
                                  className="h-full rounded-full bg-[#caa24c]"
                                  initial={{ width: prefersReducedMotion ? `${visitorSharePct}%` : 0 }}
                                  style={{ width: prefersReducedMotion ? `${visitorSharePct}%` : 0 }}
                                  whileInView={{ width: `${visitorSharePct}%` }}
                                  viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                                  transition={{ duration: 0.7, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {row.visitors !== null ? row.visitors : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {row.tourPageVisits !== null ? row.tourPageVisits : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {row.tourClicks !== null ? row.tourClicks : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold text-[#caa24c]">
                          {row.toursBooked}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold text-emerald-500">
                          {row.bookings}
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-[color:var(--portal-text)] font-semibold">
                          ${row.revenue.toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Table 2: Website Performance */}
        <div className="luxor-glass-card rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--portal-text)]">
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
                  <tr className="border-b border-[color:var(--portal-border)]/60 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
                    <th className="pb-3 pr-2">Page</th>
                    <th className="pb-3 px-2 text-right">Views</th>
                    <th className="pb-3 px-2 text-right">Engagement</th>
                    <th className="pb-3 px-2 text-right">CTA Clicks</th>
                    <th className="pb-3 pl-2 text-right">Exit Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--portal-border)]/30">
                  {metrics.websitePerformance.map((page, idx) => {
                    const viewSharePct =
                      typeof page.views === 'number' && page.views > 0
                        ? Math.max(6, Math.round((page.views / maxPageViews) * 100))
                        : 0

                    return (
                      <tr
                        key={page.path}
                        className={`hover:bg-[color:var(--portal-soft)]/50 transition-colors ${
                          page.isPriority ? 'bg-[#caa24c]/[0.03]' : ''
                        }`}
                      >
                        <td className="py-2.5 pr-2 font-medium text-[color:var(--portal-text)] min-w-[140px]">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span>{page.pageName}</span>
                              {page.isPriority && (
                                <span className="rounded bg-[#caa24c]/10 text-[#caa24c] px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider">
                                  Priority
                                </span>
                              )}
                            </div>
                            {viewSharePct > 0 && (
                              <div className="h-1 w-24 overflow-hidden rounded-full bg-[color:var(--portal-border)]/40">
                                <motion.div
                                  className="h-full rounded-full bg-[#caa24c]/80"
                                  initial={{ width: prefersReducedMotion ? `${viewSharePct}%` : 0 }}
                                  style={{ width: prefersReducedMotion ? `${viewSharePct}%` : 0 }}
                                  whileInView={{ width: `${viewSharePct}%` }}
                                  viewport={{ once: true, margin: '0px 0px -30px 0px' }}
                                  transition={{ duration: 0.7, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {page.views !== null ? page.views : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {page.engagementRate !== null ? page.engagementRate : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold text-[#caa24c]">
                          {page.ctaClicks !== null ? page.ctaClicks : '—'}
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums text-[color:var(--portal-muted)]">
                          {page.exitRate !== null ? page.exitRate : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 4. FUNNEL HEALTH / NEEDS ATTENTION (Diagnostic Signals) */}
      <div className="luxor-glass-card rounded-2xl p-4 sm:p-6 shadow-sm border border-[color:var(--portal-border)]">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={17} className="text-[#caa24c]" />
          <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--portal-text)]">
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">
                    {diag.stageTransition}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      diag.type === 'alert'
                        ? 'bg-rose-500/20 text-rose-500 dark:text-rose-400'
                        : diag.type === 'warning'
                        ? 'bg-[#caa24c]/20 text-[#caa24c]'
                        : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
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
