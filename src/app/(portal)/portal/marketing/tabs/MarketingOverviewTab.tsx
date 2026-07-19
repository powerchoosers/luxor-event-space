'use client'

import React from 'react'
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Mail,
  MailOpen,
  MousePointerClick,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import { PortalStatusBadge } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import type { Campaign, MarketingActivityEvent, MarketingList } from '../page'

interface MarketingOverviewTabProps {
  inquiries: LuxorInquiry[]
  campaigns: Campaign[]
  activityEvents: MarketingActivityEvent[]
  marketingLists?: MarketingList[]
  loading: boolean
  onTabChange: (tab: string) => void
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
        <StatsCard label="Subscribers" value={loading ? '…' : totalSubscribers.toLocaleString()} icon={<Users size={15} />} detail="Saved marketing-list emails" />
        <StatsCard label="New This Week" value={loading ? '…' : newSubscribersThisWeek.toLocaleString()} icon={<UserPlus size={15} />} detail="Added in the last 7 days" />
        <StatsCard label="Emails Sent" value={loading ? '…' : totalSent.toLocaleString()} icon={<Mail size={15} />} detail="Tracked campaign recipients" />
        <StatsCard label="Open Rate" value={loading ? '…' : `${overallOpenRate}%`} icon={<MailOpen size={15} />} detail={`${totalUniqueOpens.toLocaleString()} unique opens`} />
        <StatsCard label="Needs Follow-up" value={loading ? '…' : followUpQueue.toLocaleString()} icon={<ArrowUpRight size={15} />} detail="New, contacted, or tour requested" />
        <StatsCard label="New Inquiries" value={loading ? '…' : newInquiriesThisWeek.toLocaleString()} icon={<CheckCircle2 size={15} />} detail="Submitted in the last 7 days" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4 border-b border-zinc-900 pb-4">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Audience by List</h3>
              <p className="mt-1 text-[10px] text-zinc-500">Current Supabase marketing-list membership, grouped by saved source.</p>
            </div>
            <span className="font-mono text-xs font-bold text-[#caa24c]">{loading ? '…' : totalSubscribers.toLocaleString()} total</span>
          </div>

          {audienceRows.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {audienceRows.map((list) => {
                const share = totalSubscribers ? Math.min(100, (list.memberCount / totalSubscribers) * 100) : 0
                return (
                  <div key={list.name} className="rounded-xl border border-zinc-900/70 bg-zinc-950/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-bold text-white">{list.name}</p>
                      <span className="font-mono text-xs font-black text-[#caa24c]">{list.memberCount.toLocaleString()}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                      <div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <DataEmptyState loading={loading} message="No subscribers are saved in Supabase yet." />
          )}
        </section>

        <section className="luxor-glass-card flex min-h-[18rem] flex-col rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Recent Subscribers</h3>
            <button type="button" onClick={() => onTabChange('contact-lists')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c] hover:text-[#dfbd68]">View all</button>
          </div>
          {recentSubscribers.length ? (
            <div className="mt-3 divide-y divide-zinc-900/60">
              {recentSubscribers.map((subscriber) => (
                <div key={`${subscriber.listName}-${subscriber.id || subscriber.email}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{subscriber.full_name || subscriber.email}</p>
                    <p className="mt-0.5 truncate text-[10px] text-zinc-500">{subscriber.listName}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-600">{subscriber.created_at ? formatDate(subscriber.created_at) : 'Date not recorded'}</span>
                </div>
              ))}
            </div>
          ) : (
            <DataEmptyState loading={loading} message="No subscriber records are available." />
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-900 pb-4">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Grand Opening RSVP Activity</h3>
              <p className="mt-1 text-[9px] text-zinc-500">Real RSVP submissions from Supabase.</p>
            </div>
            <button type="button" onClick={() => onTabChange('contact-lists')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">View RSVPs</button>
          </div>

          {grandOpeningRsvps.length ? (
            <>
              <div className="grid grid-cols-3 gap-2 border-b border-zinc-900 py-4 text-center font-mono">
                <MetricBlock label="RSVPs" value={grandOpeningRsvps.length.toLocaleString()} />
                <MetricBlock label="Attending" value={attendingRsvps.toLocaleString()} />
                <MetricBlock label="Guests Listed" value={recordedGuests.toLocaleString()} />
              </div>
              <div className="mt-2 divide-y divide-zinc-900/60">
                {grandOpeningRsvps.slice(0, 4).map((rsvp) => (
                  <div key={rsvp.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{rsvp.full_name}</p>
                      <p className="mt-0.5 text-[9px] text-zinc-500">
                        {rsvp.rsvp_status ? formatStatus(rsvp.rsvp_status) : 'RSVP status not recorded'}
                        {' · '}
                        {rsvp.attendee_count == null ? 'Guest count not provided' : `${rsvp.attendee_count} guest${rsvp.attendee_count === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-zinc-600">{formatDate(rsvp.created_at)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <DataEmptyState loading={loading} message="No Grand Opening RSVPs have been submitted." />
          )}
        </section>

        <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Highest Engagement</h3>
            <button type="button" onClick={() => onTabChange('email-campaigns')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">View campaigns</button>
          </div>

          {topCampaign ? (
            <div className="pt-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-[#caa24c]"><Mail size={18} /></div>
                <div className="min-w-0">
                  <PortalStatusBadge status={topCampaign.status} />
                  <h4 className="mt-2 truncate text-xs font-bold text-white">{topCampaign.name}</h4>
                  <p className="mt-0.5 truncate text-[9px] text-zinc-550">{topCampaign.subject}</p>
                  <p className="mt-1 font-mono text-[9px] text-zinc-600">{formatCampaignDate(topCampaign)}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-zinc-900 pt-4 text-center font-mono">
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

        <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Recent Email Activity</h3>
            <span className="font-mono text-[9px] text-zinc-600">{activityEvents.length} tracked</span>
          </div>
          {activityEvents.length ? (
            <div className="mt-2 divide-y divide-zinc-900/60">
              {activityEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 text-[#caa24c]">{event.event_type === 'click' ? <MousePointerClick size={13} /> : <MailOpen size={13} />}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{event.recipient_name || event.recipient_email || 'Recipient name unavailable'}</p>
                      <p className="mt-0.5 truncate text-[9px] text-zinc-500">{formatStatus(event.event_type)} · {event.campaign_name || event.campaign_subject || 'Campaign name unavailable'}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-600">{formatDate(event.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <DataEmptyState loading={loading} message="No tracked opens, clicks, or unsubscribes yet." />
          )}
        </section>
      </div>

      <section className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Scheduled Sends</h3>
            <p className="mt-1 text-[9px] text-zinc-500">Campaigns with queued recipients or a scheduled/sending status in Supabase.</p>
          </div>
          <button type="button" onClick={() => onTabChange('calendar')} className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">Open calendar</button>
        </div>
        {scheduledCampaigns.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {scheduledCampaigns.slice(0, 4).map((campaign) => (
              <div key={campaign.id} className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-4">
                <div className="flex items-start justify-between gap-2">
                  <CalendarClock size={15} className="shrink-0 text-[#caa24c]" />
                  <PortalStatusBadge status={campaign.status} />
                </div>
                <p className="mt-3 truncate text-xs font-bold text-white">{campaign.name}</p>
                <p className="mt-1 font-mono text-[9px] text-zinc-500">{campaign.scheduled_for ? formatDateTime(campaign.scheduled_for) : 'Send date not set'}</p>
                <p className="mt-2 text-[9px] text-zinc-600">{campaign.queued_count.toLocaleString()} queued recipient{campaign.queued_count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        ) : (
          <DataEmptyState loading={loading} message="No campaigns are currently scheduled or queued." />
        )}
      </section>

      <div className="rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
        <h4 className="mb-3.5 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-650">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionButton onClick={onAddContactClick} icon={<Plus size={14} className="text-[#caa24c]" />} label="Add Contact" />
          <ActionButton onClick={() => onTabChange('builder-automation')} icon={<Mail size={14} className="text-[#caa24c]" />} label="Build Email" />
          <ActionButton onClick={() => onTabChange('email-campaigns')} icon={<MailOpen size={14} className="text-[#caa24c]" />} label="View Campaigns" />
          <ActionButton onClick={() => onTabChange('calendar')} icon={<CalendarClock size={14} className="text-[#caa24c]" />} label="View Schedule" />
        </div>
      </div>

      <span className="sr-only">{totalUniqueClicks.toLocaleString()} unique campaign clicks</span>
    </div>
  )
}

function StatsCard({ label, value, icon, detail }: { label: string; value: string; icon: React.ReactNode; detail: string }) {
  return (
    <div className="luxor-glass-card rounded-2xl border border-zinc-900/80 bg-zinc-950/20 p-5 transition-all hover:border-zinc-800">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-[8.5px] font-black uppercase tracking-wider leading-none">{label}</span>
        <span className="text-[#caa24c]">{icon}</span>
      </div>
      <h3 className="mt-3.5 font-mono text-xl font-bold leading-none text-white">{value}</h3>
      <p className="mt-2.5 text-[8px] font-bold leading-4 text-zinc-600">{detail}</p>
    </div>
  )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-zinc-900 last:border-r-0">
      <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-550">{label}</p>
      <p className="mt-1.5 text-xs font-bold text-white">{value}</p>
    </div>
  )
}

function DataEmptyState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-zinc-850 bg-zinc-950/20 p-5 text-center text-xs leading-5 text-zinc-600">
      {loading ? 'Loading Supabase data…' : message}
    </div>
  )
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-zinc-900/40 px-3 py-2.5 text-center text-xs font-bold text-zinc-350 transition-all hover:border-zinc-800 hover:bg-zinc-900/80 hover:text-white active:scale-95">
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
