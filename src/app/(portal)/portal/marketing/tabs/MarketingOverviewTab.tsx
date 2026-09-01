'use client'

import React from 'react'
import {
  ArrowUpRight,
  CalendarClock,
  Mail,
  MailOpen,
  MousePointerClick,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import { PortalStatusBadge } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import type { Campaign, MarketingActivityEvent, MarketingList, MarketingTab } from '../page'

interface MarketingOverviewTabProps {
  inquiries: LuxorInquiry[]
  campaigns: Campaign[]
  activityEvents: MarketingActivityEvent[]
  marketingLists?: MarketingList[]
  loading: boolean
  onTabChange: (tab: MarketingTab) => void
  onAddContactClick: () => void
}

export function MarketingOverviewTab({
  inquiries,
  campaigns,
  activityEvents,
  marketingLists = [],
  loading,
  onTabChange,
  onAddContactClick,
}: MarketingOverviewTabProps) {
  const [nowTime] = React.useState(() => Date.now())
  const oneWeekAgo = nowTime - 7 * 24 * 60 * 60 * 1000

  const allMembers = React.useMemo(
    () => marketingLists.flatMap((list) => list.members.map((member) => ({ ...member, listName: list.name }))),
    [marketingLists],
  )
  const totalSubscribers = React.useMemo(
    () => new Set(allMembers.map((member) => member.email.trim().toLowerCase()).filter(Boolean)).size,
    [allMembers],
  )
  const newSubscribersThisWeek = React.useMemo(
    () => new Set(
      allMembers
        .filter((member) => member.created_at && new Date(member.created_at).getTime() >= oneWeekAgo)
        .map((member) => member.email.trim().toLowerCase()),
    ).size,
    [allMembers, oneWeekAgo],
  )
  const recentSubscribers = React.useMemo(
    () => [...allMembers]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5),
    [allMembers],
  )

  const grandOpeningRsvps = React.useMemo(
    () => inquiries
      .filter(isGrandOpeningRsvp)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [inquiries],
  )
  const attendingRsvps = grandOpeningRsvps.filter((inquiry) => inquiry.rsvp_status === 'attending').length
  const recordedGuests = grandOpeningRsvps.reduce((sum, inquiry) => sum + Number(inquiry.attendee_count || 0), 0)
  const newInquiriesThisWeek = inquiries.filter((inquiry) => new Date(inquiry.created_at).getTime() >= oneWeekAgo).length
  const followUpQueue = inquiries.filter((inquiry) => ['new', 'contacted', 'tour_requested'].includes(inquiry.status)).length

  const totalSent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent_count || 0), 0)
  const totalUniqueOpens = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_opens || 0), 0)
  const totalUniqueClicks = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_clicks || 0), 0)
  const overallOpenRate = totalSent ? Math.round((totalUniqueOpens / totalSent) * 1000) / 10 : 0

  const topCampaign = React.useMemo(
    () => [...campaigns]
      .filter((campaign) => campaign.recipient_count > 0 || campaign.sent_count > 0)
      .sort((a, b) => {
        const engagementDifference = (b.unique_clicks * 3 + b.unique_opens) - (a.unique_clicks * 3 + a.unique_opens)
        return engagementDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })[0] ?? null,
    [campaigns],
  )

  const scheduledCampaigns = React.useMemo(
    () => campaigns
      .filter((campaign) => campaign.status === 'scheduled' || campaign.status === 'sending' || campaign.queued_count > 0)
      .sort((a, b) => new Date(a.scheduled_for || 0).getTime() - new Date(b.scheduled_for || 0).getTime()),
    [campaigns],
  )

  const audienceRows = React.useMemo(
    () => [...marketingLists].sort((a, b) => b.memberCount - a.memberCount),
    [marketingLists],
  )

  const sentTrend = React.useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(nowTime - (6 - index) * 24 * 60 * 60 * 1000)
      date.setHours(0, 0, 0, 0)
      return { date, value: 0 }
    })
    campaigns.forEach((campaign) => {
      if (!campaign.sent_at) return
      const campaignDate = new Date(campaign.sent_at)
      campaignDate.setHours(0, 0, 0, 0)
      const day = days.find((item) => item.date.getTime() === campaignDate.getTime())
      if (day) day.value += Number(campaign.sent_count || 0)
    })
    return days
  }, [campaigns, nowTime])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(19rem,0.85fr)]">
        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] pb-4">
            <div>
              <h3 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Performance overview</h3>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">A quick read on reach and engagement across your marketing activity.</p>
            </div>
            <span className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-bold text-[color:var(--portal-muted)]">Last 7 days</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-b border-[color:var(--portal-border)] pb-5 sm:grid-cols-5">
            <MetricBlock label="Subscribers" value={totalSubscribers.toLocaleString()} loading={loading} />
            <MetricBlock label="New this week" value={newSubscribersThisWeek.toLocaleString()} loading={loading} />
            <MetricBlock label="Emails sent" value={totalSent.toLocaleString()} loading={loading} />
            <MetricBlock label="Open rate" value={`${overallOpenRate}%`} loading={loading} />
            <MetricBlock label="New inquiries" value={newInquiriesThisWeek.toLocaleString()} loading={loading} />
          </div>
          <TrendChart points={sentTrend} loading={loading} />
        </section>

        <section className="luxor-glass-card flex min-h-[18rem] flex-col rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
            <h3 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Needs attention</h3>
            <ArrowUpRight size={16} className="text-[#caa24c]" />
          </div>
          <AttentionRow value={followUpQueue} label="Needs follow-up" detail="New, contacted, or tour requested" loading={loading} onClick={() => onTabChange('call-center')} />
          <AttentionRow value={newInquiriesThisWeek} label="New inquiries" detail="Submitted in the last 7 days" loading={loading} onClick={() => onTabChange('contact-lists')} />
          <div className="mt-auto border-t border-[color:var(--portal-border)] pt-4">
            <button type="button" onClick={() => onTabChange('call-center')} className="text-xs font-bold text-[#a8792f] hover:text-[#caa24c]">Open follow-up queue →</button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] pb-4">
            <div>
              <h3 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Audience</h3>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Current marketing-list membership, grouped by saved source.</p>
            </div>
            <button type="button" onClick={() => onTabChange('contact-lists')} className="text-[10px] font-black uppercase tracking-wider text-[#a8792f] hover:text-[#caa24c]">Manage audience</button>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((item) => <AudienceSkeleton key={item} />)}
            </div>
          ) : audienceRows.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {audienceRows.map((list) => {
                const share = totalSubscribers ? Math.min(100, (list.memberCount / totalSubscribers) * 100) : 0
                return (
                  <div key={list.name} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                    <div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{list.name}</p><span className="font-mono text-xs font-black text-[#caa24c]">{list.memberCount.toLocaleString()}</span></div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--portal-border)]"><div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${share}%` }} /></div>
                  </div>
                )
              })}
            </div>
          ) : <DataEmptyState loading={loading} message="No subscribers are saved yet." />}
        </section>

        <section className="luxor-glass-card flex min-h-[18rem] flex-col rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4"><h3 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Recent subscribers</h3><button type="button" onClick={() => onTabChange('contact-lists')} className="text-[10px] font-black uppercase tracking-wider text-[#a8792f]">View all</button></div>
          {loading ? <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{[1, 2, 3, 4, 5].map((item) => <SubscriberSkeleton key={item} />)}</div> : recentSubscribers.length ? <div className="mt-3 divide-y divide-[color:var(--portal-border)]">{recentSubscribers.map((subscriber) => <div key={`${subscriber.listName}-${subscriber.id || subscriber.email}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{subscriber.full_name || subscriber.email}</p><p className="mt-0.5 truncate text-[10px] text-[color:var(--portal-muted)]">{subscriber.listName}</p></div><span className="shrink-0 font-mono text-[9px] text-[color:var(--portal-faint)]">{subscriber.created_at ? formatDate(subscriber.created_at) : 'Date not recorded'}</span></div>)}</div> : <DataEmptyState loading={false} message="No subscriber records are available." />}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--portal-border)] pb-4">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Grand Opening history</h3>
              <p className="mt-1 text-[9px] text-[color:var(--portal-muted)]">Legacy RSVP records are read-only and retained for historical reference.</p>
            </div>
          </div>

          {loading ? (
            <HistorySkeleton />
          ) : grandOpeningRsvps.length ? (
            <>
              <div className="grid grid-cols-3 gap-2 border-b border-[color:var(--portal-border)] py-4 text-center font-mono">
                <MetricBlock label="RSVPs" value={grandOpeningRsvps.length.toLocaleString()} />
                <MetricBlock label="Attending" value={attendingRsvps.toLocaleString()} />
                <MetricBlock label="Guests Listed" value={recordedGuests.toLocaleString()} />
              </div>
              <div className="mt-2 divide-y divide-[color:var(--portal-border)]">
                {grandOpeningRsvps.slice(0, 4).map((rsvp) => (
                  <div key={rsvp.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{rsvp.full_name}</p>
                      <p className="mt-0.5 text-[9px] text-[color:var(--portal-muted)]">
                        {rsvp.rsvp_status ? formatStatus(rsvp.rsvp_status) : 'RSVP status not recorded'}
                        {' · '}
                        {rsvp.attendee_count == null ? 'Guest count not provided' : `${rsvp.attendee_count} guest${rsvp.attendee_count === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-[color:var(--portal-faint)]">{formatDate(rsvp.created_at)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <DataEmptyState loading={loading} message="No legacy Grand Opening RSVP rows are stored." />
          )}
        </section>

        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Highest Engagement</h3>
            <button type="button" onClick={() => onTabChange('email-campaigns')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">View campaigns</button>
          </div>

          {loading ? (
            <TopCampaignSkeleton />
          ) : topCampaign ? (
            <div className="pt-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[#caa24c]"><Mail size={18} /></div>
                <div className="min-w-0">
                  <PortalStatusBadge status={topCampaign.status} />
                  <h4 className="mt-2 truncate text-xs font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(topCampaign.name)}</h4>
                  <p className="mt-0.5 truncate text-[9px] text-[color:var(--portal-muted)]">{decodeHtmlEntities(topCampaign.subject)}</p>
                  <p className="mt-1 font-mono text-[9px] text-[color:var(--portal-faint)]">{formatCampaignDate(topCampaign)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[color:var(--portal-border)] pt-4 text-center font-mono">
                <MetricBlock label="Sent" value={topCampaign.sent_count.toLocaleString()} />
                <MetricBlock label="Open" value={`${topCampaign.open_rate}%`} />
                <MetricBlock label="Click" value={`${topCampaign.click_rate}%`} />
                <MetricBlock label="Unsubs" value={topCampaign.unsubscribe_count.toLocaleString()} />
              </div>
            </div>
          ) : (
            <DataEmptyState loading={loading} message="No campaign has recipients or sends yet." />
          )}
        </section>

        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Recent Email Activity</h3>
            <span className="font-mono text-[9px] text-[color:var(--portal-faint)]">{activityEvents.length} tracked</span>
          </div>
          {loading ? (
            <div className="mt-2 divide-y divide-[color:var(--portal-border)]">{[1, 2, 3, 4, 5].map((item) => <ActivitySkeleton key={item} />)}</div>
          ) : activityEvents.length ? (
            <div className="mt-2 divide-y divide-[color:var(--portal-border)]">
              {activityEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 text-[#caa24c]">{event.event_type === 'click' ? <MousePointerClick size={13} /> : <MailOpen size={13} />}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{event.recipient_name || event.recipient_email || 'Recipient name unavailable'}</p>
                      <p className="mt-0.5 truncate text-[9px] text-[color:var(--portal-muted)]">{formatStatus(event.event_type)} · {decodeHtmlEntities(event.campaign_name || event.campaign_subject) || 'Campaign name unavailable'}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-[color:var(--portal-faint)]">{formatDate(event.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <DataEmptyState loading={loading} message="No tracked opens, clicks, or unsubscribes yet." />
          )}
        </section>
      </div>

      <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Scheduled Sends</h3>
            <p className="mt-1 text-[9px] text-[color:var(--portal-muted)]">Campaigns with queued recipients or a scheduled or sending status.</p>
          </div>
          <button type="button" onClick={() => onTabChange('calendar')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">Open calendar</button>
        </div>
        {loading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <ScheduledSkeleton key={item} />)}</div>
        ) : scheduledCampaigns.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {scheduledCampaigns.slice(0, 4).map((campaign) => (
              <div key={campaign.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <CalendarClock size={15} className="shrink-0 text-[#caa24c]" />
                  <PortalStatusBadge status={campaign.status} />
                </div>
                <p className="mt-3 truncate text-xs font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(campaign.name)}</p>
                <p className="mt-1 font-mono text-[9px] text-[color:var(--portal-muted)]">{campaign.scheduled_for ? formatDateTime(campaign.scheduled_for) : 'Send date not set'}</p>
                <p className="mt-2 text-[9px] text-[color:var(--portal-faint)]">{campaign.queued_count.toLocaleString()} queued recipient{campaign.queued_count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        ) : (
          <DataEmptyState loading={false} message="No campaigns are currently scheduled or queued." />
        )}
      </section>

      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5">
        <h4 className="mb-3.5 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ActionButton onClick={onAddContactClick} icon={<Plus size={14} className="text-[#caa24c]" />} label="Add Contact" />
          <ActionButton onClick={() => onTabChange('email-campaigns')} icon={<MailOpen size={14} className="text-[#caa24c]" />} label="View Campaigns" />
          <ActionButton onClick={() => onTabChange('calendar')} icon={<CalendarClock size={14} className="text-[#caa24c]" />} label="View Schedule" />
        </div>
      </div>

      <span className="sr-only">{totalUniqueClicks.toLocaleString()} unique campaign clicks</span>
    </div>
  )
}

function TrendChart({ points, loading }: { points: Array<{ date: Date; value: number }>; loading: boolean }) {
  const max = Math.max(...points.map((point) => point.value), 1)
  const chartPoints = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${92 - (point.value / max) * 68}`).join(' ')
  return (
    <div className="mt-5">
      <div className="relative h-36 overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 p-3">
        <div className="pointer-events-none absolute inset-x-3 top-7 border-t border-dashed border-[color:var(--portal-border)]" />
        <div className="pointer-events-none absolute inset-x-3 top-1/2 border-t border-dashed border-[color:var(--portal-border)]" />
        {loading ? <div className="h-full w-full rounded-lg luxor-skeleton" /> : <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full"><polyline points={chartPoints} fill="none" stroke="#caa24c" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-[color:var(--portal-faint)]"><span>{points[0] ? formatDate(points[0].date.toISOString()) : '—'}</span><span>Email sends</span><span>{points[points.length - 1] ? formatDate(points[points.length - 1].date.toISOString()) : '—'}</span></div>
    </div>
  )
}

function AttentionRow({ value, label, detail, loading, onClick }: { value: number; label: string; detail: string; loading: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 border-b border-[color:var(--portal-border)] py-5 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[#a8792f]"><Users size={16} /></span><span className="min-w-0 flex-1">{loading ? <><span className="block h-7 w-12 rounded luxor-skeleton" /><span className="mt-2 block h-3 w-28 rounded luxor-skeleton" /><span className="mt-1.5 block h-2.5 w-44 max-w-full rounded luxor-skeleton" /></> : <><strong className="block font-mono text-2xl leading-none text-[color:var(--portal-text)]">{value.toLocaleString()}</strong><span className="mt-1 block text-xs font-bold text-[color:var(--portal-text)]">{label}</span><span className="mt-0.5 block text-[10px] text-[color:var(--portal-muted)]">{detail}</span></>}</span><ArrowUpRight size={16} className="text-[color:var(--portal-faint)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#caa24c]" /></button>
}

function MetricBlock({ label, value, loading = false }: { label: string; value: string; loading?: boolean }) {
  return (
    <div className="border-r border-[color:var(--portal-border)] last:border-r-0">
      <p className="text-[8px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">{label}</p>
      {loading ? <div className="mt-2 h-3.5 w-12 rounded luxor-skeleton" /> : <p className="mt-1.5 text-xs font-bold text-[color:var(--portal-text)]">{value}</p>}
    </div>
  )
}

function AudienceSkeleton() {
  return <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><div className="flex items-center justify-between gap-3"><div className="h-3 w-32 rounded luxor-skeleton" /><div className="h-3 w-8 rounded luxor-skeleton" /></div><div className="mt-3 h-1.5 w-full rounded-full luxor-skeleton" /></div>
}

function SubscriberSkeleton() {
  return <div className="flex items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><div className="h-3 w-32 max-w-full rounded luxor-skeleton" /><div className="mt-1.5 h-2.5 w-24 rounded luxor-skeleton" /></div><div className="h-2.5 w-16 rounded luxor-skeleton" /></div>
}

function HistorySkeleton() {
  return <><div className="grid grid-cols-3 gap-2 border-b border-[color:var(--portal-border)] py-4">{['RSVPs', 'Attending', 'Guests Listed'].map((label) => <MetricBlock key={label} label={label} value="" loading />)}</div><div className="mt-2 divide-y divide-[color:var(--portal-border)]">{[1, 2, 3, 4].map((item) => <SubscriberSkeleton key={item} />)}</div></>
}

function TopCampaignSkeleton() {
  return <div className="pt-4"><div className="flex items-start gap-3"><div className="h-12 w-12 shrink-0 rounded-xl luxor-skeleton" /><div className="min-w-0 flex-1"><div className="h-4 w-16 rounded luxor-skeleton" /><div className="mt-2 h-3 w-40 max-w-full rounded luxor-skeleton" /><div className="mt-1.5 h-2.5 w-32 max-w-full rounded luxor-skeleton" /><div className="mt-1.5 h-2.5 w-24 rounded luxor-skeleton" /></div></div><div className="mt-4 grid grid-cols-4 gap-2 border-t border-[color:var(--portal-border)] pt-4">{[1, 2, 3, 4].map((item) => <MetricBlock key={item} label="" value="" loading />)}</div></div>
}

function ActivitySkeleton() {
  return <div className="flex items-start justify-between gap-3 py-2.5"><div className="flex min-w-0 flex-1 items-start gap-2.5"><div className="mt-0.5 h-3.5 w-3.5 rounded luxor-skeleton" /><div className="min-w-0 flex-1"><div className="h-3 w-32 max-w-full rounded luxor-skeleton" /><div className="mt-1.5 h-2.5 w-44 max-w-full rounded luxor-skeleton" /></div></div><div className="h-2.5 w-14 rounded luxor-skeleton" /></div>
}

function ScheduledSkeleton() {
  return <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><div className="flex items-start justify-between gap-2"><div className="h-4 w-4 rounded luxor-skeleton" /><div className="h-4 w-16 rounded-full luxor-skeleton" /></div><div className="mt-3 h-3 w-32 max-w-full rounded luxor-skeleton" /><div className="mt-1.5 h-2.5 w-24 rounded luxor-skeleton" /><div className="mt-2 h-2.5 w-28 rounded luxor-skeleton" /></div>
}

function DataEmptyState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-5 text-center text-xs leading-5 text-[color:var(--portal-muted)]">
      {loading ? (
        <div className="w-full max-w-xs space-y-2">
          <div className="h-3 w-full rounded luxor-skeleton" />
          <div className="h-3 w-3/4 mx-auto rounded luxor-skeleton" />
        </div>
      ) : message}
    </div>
  )
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-center text-xs font-bold text-[color:var(--portal-text)] transition-all hover:border-[#caa24c]/30 hover:bg-[#caa24c]/8 hover:text-[#a8792f] active:scale-95">
      {icon}
      <span>{label}</span>
    </button>
  )
}

function isGrandOpeningRsvp(inquiry: LuxorInquiry) {
  return inquiry.campaign_key === 'grand_opening_2026_07_25'
    || inquiry.flow === 'grand_opening_rsvp'
    || inquiry.source === 'grand_opening_rsvp'
}

function formatStatus(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCampaignDate(campaign: Campaign) {
  if (campaign.sent_at) return `Sent ${formatDateTime(campaign.sent_at)}`
  if (campaign.scheduled_for) return `Scheduled ${formatDateTime(campaign.scheduled_for)}`
  return `Created ${formatDateTime(campaign.created_at)}`
}
