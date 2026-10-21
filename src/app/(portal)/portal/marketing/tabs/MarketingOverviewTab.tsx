'use client'

import React from 'react'
import { ArrowUpRight, CalendarClock, MailPlus, Users, Workflow } from 'lucide-react'
import { PortalSelect } from '@/components/portal/PortalUI'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import type { MarketingOverviewData } from '@/lib/luxorMarketingOverview'
import type { MarketingTab } from '../page'

type MarketingOverviewTabProps = {
  onTabChange: (tab: MarketingTab) => void
  onCreateCampaign: () => void
}

export function MarketingOverviewTab({ onTabChange, onCreateCampaign }: MarketingOverviewTabProps) {
  const [rangeDays, setRangeDays] = React.useState<'7' | '30' | '90'>('30')
  const [data, setData] = React.useState<MarketingOverviewData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [retryVersion, setRetryVersion] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`/api/marketing/overview?days=${rangeDays}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as MarketingOverviewData & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load marketing performance.')
        if (active) setData(payload)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setData(null)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load marketing performance.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [rangeDays, retryVersion])

  const periodLabel = data
    ? `${formatDate(data.period.startDate)}–${formatDate(data.period.endDate)} · Chicago time`
    : `Last ${rangeDays} days · Chicago time`

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto portal-scrollbar pb-8">
      <div className="flex flex-col gap-3 border-b border-[color:var(--portal-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">Marketing performance</p>
          <p className="mt-1 text-sm text-[color:var(--portal-muted)]">A live view of inquiries, campaign sends, and the next scheduled emails.</p>
        </div>
        <label className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">
          <span>Date range</span>
          <PortalSelect
            value={rangeDays}
            onChange={(value) => {
              if (value === '7' || value === '30' || value === '90') setRangeDays(value)
            }}
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            className="w-40"
            buttonClassName="min-h-10 bg-[color:var(--portal-card)] font-semibold normal-case tracking-normal"
          />
        </label>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[color:var(--portal-text)]">Marketing data could not load.</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{error}</p>
          </div>
          <button type="button" onClick={() => setRetryVersion((value) => value + 1)} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-bold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Try again</button>
        </div>
      ) : null}

      <section aria-label="Marketing summary" className="grid grid-cols-2 border-y border-[color:var(--portal-border)] xl:grid-cols-4">
        <MetricCard label="Inquiries" value={data?.inquiryCount} detail="Non-test inquiry records by creation date" loading={loading} />
        <MetricCard label="Campaign emails sent" value={data?.sentRecipientCount} detail="Recipient records marked sent with a non-test email job" loading={loading} />
        <MetricCard label="Click events recorded" value={data?.clickEventCount} detail="Tracked click events in this date range" loading={loading} />
        <MetricCard label="Upcoming campaigns" value={data?.upcomingCampaignCount} detail="Scheduled campaigns with future send dates" loading={loading} />
      </section>

      {data && data.excludedUnlinkedSentCount > 0 ? (
        <p className="-mt-3 text-[11px] leading-5 text-[color:var(--portal-muted)]">
          {data.excludedUnlinkedSentCount.toLocaleString()} sent recipient record{data.excludedUnlinkedSentCount === 1 ? '' : 's'} without a linked email job were left out so test sends cannot be counted as production activity.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <section aria-labelledby="inquiries-chart-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="inquiries-chart-title" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Inquiries over time</h2>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">{periodLabel} · non-test inquiries, grouped by local creation date.</p>
            </div>
            <span className="text-[10px] font-semibold text-[color:var(--portal-muted)]">{data ? `${data.inquiryCount.toLocaleString()} total` : ' '}</span>
          </div>
          {loading ? <ChartSkeleton /> : error || !data ? <InlineUnavailable label="Inquiry chart is unavailable until data loads." /> : data.inquiryCount === 0 ? (
            <InlineEmpty label="No non-test inquiries were created in this date range." />
          ) : <InquiryChart points={data.inquiriesByDay} />}
        </section>

        <section aria-labelledby="sources-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div>
            <h2 id="sources-title" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Inquiry sources</h2>
            <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Recorded source values in the same date range.</p>
          </div>
          {loading ? <SourceSkeleton /> : error || !data ? <InlineUnavailable label="Source totals are unavailable until data loads." /> : data.sourceBreakdown.length === 0 ? (
            <InlineEmpty label="No source data is available for this date range." />
          ) : <SourceBreakdown sources={data.sourceBreakdown} total={data.inquiryCount} />}
          <button type="button" onClick={() => onTabChange('sources')} className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8792f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
            View lead sources <ArrowUpRight size={13} />
          </button>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="upcoming-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="upcoming-title" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Upcoming campaigns</h2>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Future sends currently marked Scheduled.</p>
            </div>
            <button type="button" onClick={() => onTabChange('email-campaigns')} className="min-h-9 shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8792f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">View all</button>
          </div>
          {loading ? <UpcomingSkeleton /> : error || !data ? <InlineUnavailable label="Scheduled campaigns are unavailable until data loads." /> : data.upcomingCampaigns.length === 0 ? (
            <InlineEmpty label="No campaigns are scheduled for a future date." />
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {data.upcomingCampaigns.map((campaign) => (
                <li key={campaign.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-1 last:pb-1">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#a8792f]"><CalendarClock size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(campaign.name)}</span>
                    <span className="mt-1 block text-[10px] text-[color:var(--portal-muted)]">Scheduled {formatDateTime(campaign.scheduledFor)}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-[color:var(--portal-border)] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--portal-muted)]">Scheduled</span>
                </li>
              ))}
            </ul>
          )}
          {data && data.upcomingCampaignCount > data.upcomingCampaigns.length ? <p className="mt-2 text-[10px] text-[color:var(--portal-muted)]">Showing the next {data.upcomingCampaigns.length}; {data.upcomingCampaignCount - data.upcomingCampaigns.length} more scheduled.</p> : null}
        </section>

        <section aria-labelledby="recent-activity-title" className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="recent-activity-title" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Recent campaign activity</h2>
              <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Tracked events in {periodLabel}.</p>
            </div>
            <button type="button" onClick={() => onTabChange('activity')} className="min-h-9 shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#a8792f] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">View activity</button>
          </div>
          {loading ? <ActivitySkeleton /> : error || !data ? <InlineUnavailable label="Recent activity is unavailable until data loads." /> : data.recentActivity.length === 0 ? (
            <InlineEmpty label="No campaign tracking events were recorded in this date range." />
          ) : (
            <ul className="mt-3 divide-y divide-[color:var(--portal-border)]">
              {data.recentActivity.slice(0, 6).map((event) => (
                <li key={event.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-1 last:pb-1">
                  <EventMark eventType={event.eventType} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(event.campaignName)}</span>
                    <span className="mt-1 block text-[10px] text-[color:var(--portal-muted)]">{formatEventType(event.eventType)} · {formatDateTime(event.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-[color:var(--portal-border)] pt-3 text-[10px] leading-4 text-[color:var(--portal-muted)]">Opens and clicks are tracking signals, not proof that an email was read or delivered.</p>
        </section>
      </div>

      <section aria-labelledby="quick-actions-title" className="border-t border-[color:var(--portal-border)] pt-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="quick-actions-title" className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">Quick actions</h2>
            <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">Open the tools available today.</p>
          </div>
          <p className="text-[10px] text-[color:var(--portal-muted)]">Automation editing arrives in a later phase.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <QuickAction icon={<MailPlus size={16} />} label="Create campaign" detail="Open the existing campaign editor." onClick={onCreateCampaign} />
          <QuickAction icon={<Users size={16} />} label="Manage contacts" detail="Review existing contacts and lists." onClick={() => onTabChange('contact-lists')} />
          <QuickAction icon={<Workflow size={16} />} label="View automations" detail="See what automation tools are available." onClick={() => onTabChange('automations')} />
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, detail, loading }: { label: string; value?: number; detail: string; loading: boolean }) {
  return (
    <div className="min-h-28 border-b border-r border-[color:var(--portal-border)] p-4 last:border-r-0 even:border-r-0 xl:border-b-0 xl:even:border-r xl:last:border-r-0 sm:p-5">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
      {loading ? <div className="mt-3 h-7 w-16 rounded luxor-skeleton" aria-label={`Loading ${label.toLowerCase()}`} /> : <p className="mt-2 font-mono text-2xl font-semibold leading-none text-[color:var(--portal-text)]">{value === undefined ? '—' : value.toLocaleString()}</p>}
      <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">{detail}</p>
    </div>
  )
}

function InquiryChart({ points }: { points: MarketingOverviewData['inquiriesByDay'] }) {
  const width = 100
  const height = 100
  const max = Math.max(1, ...points.map((point) => point.count))
  const bandWidth = width / Math.max(points.length, 1)
  const barWidth = Math.max(0.35, bandWidth * 0.68)
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]

  return (
    <div className="mt-5">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Daily non-test inquiries from ${formatDate(points[0]?.date || '')} through ${formatDate(points[points.length - 1]?.date || '')}`} className="h-44 w-full overflow-visible">
        <line x1="0" y1="99" x2="100" y2="99" stroke="var(--portal-border)" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
        {points.map((point, index) => {
          const barHeight = point.count ? Math.max(1.5, (point.count / max) * 82) : 0
          const x = index * bandWidth + (bandWidth - barWidth) / 2
          return <g key={point.date}><title>{`${point.count} ${point.count === 1 ? 'inquiry' : 'inquiries'} · ${formatDate(point.date)}`}</title><rect x={x} y={98 - barHeight} width={barWidth} height={barHeight} rx="0.5" fill="#caa24c" opacity="0.88" /></g>
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-[color:var(--portal-muted)]">
        {labelIndexes.map((index) => <span key={index}>{formatDate(points[index]?.date || '')}</span>)}
      </div>
      <p className="sr-only">{points.map((point) => `${formatDate(point.date)}: ${point.count}`).join('; ')}</p>
    </div>
  )
}

function SourceBreakdown({ sources, total }: { sources: MarketingOverviewData['sourceBreakdown']; total: number }) {
  return (
    <ul className="mt-5 space-y-4">
      {sources.map((source) => {
        const width = total ? Math.min(100, (source.count / total) * 100) : 0
        return (
          <li key={source.source}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate font-semibold text-[color:var(--portal-text)]">{source.source}</span>
              <span className="shrink-0 font-mono text-[color:var(--portal-muted)]">{source.count.toLocaleString()}</span>
            </div>
            <div aria-label={`${source.source}: ${source.count} of ${total} inquiries`} role="img" className="h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-soft)]">
              <span className="block h-full rounded-full bg-[#caa24c]" style={{ width: `${width}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function QuickAction({ icon, label, detail, onClick }: { icon: React.ReactNode; label: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-20 items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 text-left transition hover:border-[#caa24c]/50 hover:bg-[#caa24c]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#a8792f]">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-[color:var(--portal-text)]">{label}</span><span className="mt-1 block text-[10px] leading-4 text-[color:var(--portal-muted)]">{detail}</span></span>
      <ArrowUpRight size={15} className="shrink-0 text-[color:var(--portal-faint)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#a8792f]" />
    </button>
  )
}

function EventMark({ eventType }: { eventType: string }) {
  const icon = eventType === 'unsubscribe' ? <Users size={13} /> : eventType === 'click' ? <ArrowUpRight size={13} /> : <MailPlus size={13} />
  return <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[#a8792f]">{icon}</span>
}

function ChartSkeleton() {
  return <div role="status" aria-label="Loading inquiry chart" className="mt-5 h-44 rounded-lg luxor-skeleton" />
}

function SourceSkeleton() {
  return <div role="status" aria-label="Loading inquiry sources" className="mt-5 space-y-4">{[1, 2, 3, 4].map((item) => <div key={item}><div className="h-3 w-3/4 rounded luxor-skeleton" /><div className="mt-2 h-1.5 w-full rounded-full luxor-skeleton" /></div>)}</div>
}

function UpcomingSkeleton() {
  return <div role="status" aria-label="Loading upcoming campaigns" className="mt-3 space-y-2">{[1, 2, 3].map((item) => <div key={item} className="flex items-center gap-3 border-b border-[color:var(--portal-border)] py-3"><span className="h-9 w-9 rounded-full luxor-skeleton" /><span className="flex-1"><span className="block h-3 w-2/3 rounded luxor-skeleton" /><span className="mt-2 block h-2.5 w-1/3 rounded luxor-skeleton" /></span></div>)}</div>
}

function ActivitySkeleton() {
  return <div role="status" aria-label="Loading campaign activity" className="mt-3 space-y-2">{[1, 2, 3].map((item) => <div key={item} className="flex items-start gap-3 border-b border-[color:var(--portal-border)] py-3"><span className="h-7 w-7 rounded-full luxor-skeleton" /><span className="flex-1"><span className="block h-3 w-2/3 rounded luxor-skeleton" /><span className="mt-2 block h-2.5 w-1/3 rounded luxor-skeleton" /></span></div>)}</div>
}

function InlineEmpty({ label }: { label: string }) {
  return <p className="mt-5 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-center text-xs leading-5 text-[color:var(--portal-muted)]">{label}</p>
}

function InlineUnavailable({ label }: { label: string }) {
  return <p className="mt-5 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-center text-xs leading-5 text-[color:var(--portal-muted)]">{label}</p>
}

function formatDate(value: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '—'
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatEventType(value: string) {
  if (value === 'open') return 'Open signal recorded'
  if (value === 'click') return 'Click event recorded'
  if (value === 'unsubscribe') return 'Unsubscribe recorded'
  return 'Campaign event recorded'
}
