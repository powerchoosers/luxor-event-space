'use client'

import React from 'react'
import { ArrowUpRight, Mail } from '@/lib/icons/phosphor-compat'
import type { MarketingOverviewData } from '@/lib/luxorMarketingOverview'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

export function MarketingActivityTab() {
  const [data, setData] = React.useState<MarketingOverviewData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [retryVersion, setRetryVersion] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetch('/api/marketing/overview?days=30', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as MarketingOverviewData & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Unable to load campaign activity.')
        if (active) setData(payload)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setData(null)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load campaign activity.')
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retryVersion])

  const emailTotals = data?.emailMetrics.totals

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto portal-scrollbar pb-8">
      <section aria-label="Outbound email delivery summary" className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[color:var(--portal-border)] md:grid-cols-3 xl:grid-cols-5 md:divide-y-0">
          {[
            ['Sent', emailTotals?.sent, 'Resend-accepted outgoing mail'],
            ['Delivered', emailTotals?.delivered, 'Resend delivered events'],
            ['Opens (approx.)', emailTotals?.opened, 'Mail-app auto-opens may inflate this'],
            ['Clicked', emailTotals?.clicked, 'Resend click events in range'],
            ['Bounced', emailTotals?.bounced, 'Resend bounce events in range'],
          ].map(([label, value, detail]) => (
            <div key={String(label)} className="p-4 sm:p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
              {loading ? <div className="mt-3 h-7 w-14 rounded luxor-skeleton" aria-hidden="true" /> : <p className="mt-2 font-mono text-2xl font-semibold leading-none text-[color:var(--portal-text)]">{typeof value === 'number' ? value.toLocaleString() : '—'}</p>}
              <p className="mt-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="marketing-activity-heading" className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <div className="border-b border-[color:var(--portal-border)] p-4 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">Campaign tracking</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="marketing-activity-heading" className="text-lg font-bold text-[color:var(--portal-text)]">Recent activity</h2>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Delivery, open, click, and bounce events from Resend joined to outbox mail (campaign, follow-up, and system).</p>
            </div>
            {data ? <p className="text-[10px] font-semibold text-[color:var(--portal-muted)]">{data.trackedActivityCount.toLocaleString()} tracked events · {formatDate(data.period.startDate)}–{formatDate(data.period.endDate)} · Chicago time</p> : null}
          </div>
        </div>

        {error ? (
          <div role="alert" className="m-4 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:m-6">
            <p className="text-sm font-bold text-[color:var(--portal-text)]">Activity could not load.</p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{error}</p>
            <button type="button" onClick={() => setRetryVersion((value) => value + 1)} className="mt-3 min-h-9 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-bold text-[color:var(--portal-text)] hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">Try again</button>
          </div>
        ) : loading ? (
          <div role="status" aria-label="Loading marketing activity" className="divide-y divide-[color:var(--portal-border)] p-4 sm:p-6">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="flex items-start gap-3 py-4 first:pt-0"><span className="h-9 w-9 rounded-full luxor-skeleton" /><span className="flex-1"><span className="block h-3 w-2/3 rounded luxor-skeleton" /><span className="mt-2 block h-2.5 w-1/3 rounded luxor-skeleton" /></span></div>)}</div>
        ) : data?.recentActivity.length ? (
          <>
            <ul className="divide-y divide-[color:var(--portal-border)] px-4 sm:px-6">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="flex min-w-0 items-center gap-3 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 text-[#a8792f]">
                    {event.eventType === 'clicked' || event.eventType === 'click' ? <ArrowUpRight size={15} /> : <Mail size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{decodeHtmlEntities(event.campaignName)}</span>
                    <span className="mt-1 block text-[11px] text-[color:var(--portal-muted)]">{formatEventType(event.eventType)}</span>
                  </span>
                  <time dateTime={event.createdAt} className="shrink-0 text-right text-[10px] leading-4 text-[color:var(--portal-muted)]">{formatDateTime(event.createdAt)}</time>
                </li>
              ))}
            </ul>
            {data.trackedActivityCount > data.recentActivity.length ? <p className="border-t border-[color:var(--portal-border)] px-4 py-3 text-[10px] text-[color:var(--portal-muted)] sm:px-6">Showing the {data.recentActivity.length} most recent of {data.trackedActivityCount.toLocaleString()} tracked events in this range.</p> : null}
          </>
        ) : (
          <p className="m-4 rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-8 text-center text-sm leading-6 text-[color:var(--portal-muted)] sm:m-6">No campaign tracking events were recorded in this date range.</p>
        )}

        <p className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 px-4 py-3 text-[10px] leading-5 text-[color:var(--portal-muted)] sm:px-6">
          Opens are approximate because mail apps may prefetch messages. Counts exclude test-run mail and come from Resend events joined to production outbox rows.
        </p>
      </section>
    </div>
  )
}

function formatEventType(value: string) {
  if (value === 'open' || value === 'opened') return 'Open signal recorded (approx.)'
  if (value === 'click' || value === 'clicked') return 'Click event recorded'
  if (value === 'delivered') return 'Delivered'
  if (value === 'bounced') return 'Bounced'
  if (value === 'unsubscribe') return 'Unsubscribe recorded'
  return 'Email event recorded'
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
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
