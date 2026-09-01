'use client'

import React from 'react'
import { CalendarClock, Mail, Send, Users } from 'lucide-react'
import {
  PortalCalendar,
  type PortalCalendarItem,
  type PortalCalendarView,
} from '@/components/portal/PortalCalendar'
import { PortalSelect, PortalStatusBadge } from '@/components/portal/PortalUI'
import type { Campaign } from '../page'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

interface MarketingCalendarTabProps {
  campaigns: Campaign[]
  loading: boolean
}

type CalendarFilter = 'all' | 'scheduled' | 'sent' | 'other'

export function MarketingCalendarTab({ campaigns, loading }: MarketingCalendarTabProps) {
  const [view, setView] = React.useState<PortalCalendarView>('month')
  const [filter, setFilter] = React.useState<CalendarFilter>('all')

  const datedCampaigns = React.useMemo(
    () => campaigns.filter((campaign) => Boolean(campaign.scheduled_for)),
    [campaigns],
  )
  const filteredCampaigns = React.useMemo(
    () => datedCampaigns.filter((campaign) => {
      if (filter === 'all') return true
      if (filter === 'scheduled') return campaign.status === 'scheduled' || campaign.status === 'sending' || campaign.queued_count > 0
      if (filter === 'sent') return campaign.status === 'sent'
      return !['scheduled', 'sending', 'sent'].includes(campaign.status) && campaign.queued_count === 0
    }),
    [datedCampaigns, filter],
  )

  const calendarItems = React.useMemo<PortalCalendarItem[]>(
    () => filteredCampaigns.map((campaign) => ({
      id: campaign.id,
      date: toLocalIsoDate(campaign.scheduled_for as string),
      title: campaign.name,
      subtitle: `${formatTime(campaign.scheduled_for as string)} · ${formatStatus(campaign.status)} · ${campaign.recipient_count.toLocaleString()} recipient${campaign.recipient_count === 1 ? '' : 's'}`,
      tone: toneForCampaign(campaign),
      href: '/portal/marketing?tab=email-campaigns',
      openLabel: 'View campaigns',
      content: <CampaignCalendarDetails campaign={campaign} />,
    })),
    [filteredCampaigns],
  )

  const scheduled = campaigns.filter((campaign) => campaign.status === 'scheduled' || campaign.status === 'sending' || campaign.queued_count > 0)
  const queuedRecipients = campaigns.reduce((sum, campaign) => sum + Number(campaign.queued_count || 0), 0)
  const sentCampaigns = campaigns.filter((campaign) => campaign.status === 'sent').length
  const undatedCampaigns = campaigns.length - datedCampaigns.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Campaign Schedule</h3>
          <p className="mt-1 text-[10px] leading-5 text-zinc-500">Every calendar item below comes from a campaign&apos;s saved send date. Past sends remain visible as history.</p>
        </div>
        <div className="flex items-center">
          <PortalSelect
            value={filter}
            onChange={(value) => setFilter(value as CalendarFilter)}
            options={[
              { value: 'all', label: 'All Campaigns' },
              { value: 'scheduled', label: 'Scheduled / Queued' },
              { value: 'sent', label: 'Sent' },
              { value: 'other', label: 'Draft / Cancelled / Failed' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <CalendarKpi loading={loading} icon={<CalendarClock size={15} />} label="Scheduled / Queued" value={scheduled.length.toLocaleString()} detail={scheduled.length ? 'Campaigns awaiting delivery' : 'Nothing is waiting to send'} />
        <CalendarKpi loading={loading} icon={<Users size={15} />} label="Queued Recipients" value={queuedRecipients.toLocaleString()} detail="Recipient rows awaiting delivery" />
        <CalendarKpi loading={loading} icon={<Send size={15} />} label="Sent Campaigns" value={sentCampaigns.toLocaleString()} detail="Completed campaign records" />
        <CalendarKpi loading={loading} icon={<Mail size={15} />} label="Without Send Date" value={undatedCampaigns.toLocaleString()} detail="Drafts or records not on calendar" />
      </div>

      {!loading && campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-850 bg-zinc-950/20 p-10 text-center">
          <CalendarClock size={22} className="mx-auto text-zinc-700" />
          <h3 className="mt-4 text-sm font-bold text-white">No campaign dates yet</h3>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-[color:var(--portal-muted)]">Create and schedule a campaign. It will appear here after its send date is saved.</p>
        </div>
      ) : loading ? (
        <CalendarSkeleton />
      ) : (
        <PortalCalendar
          title={loading ? 'Loading campaign schedule…' : `${calendarItems.length} campaign send${calendarItems.length === 1 ? '' : 's'}`}
          items={calendarItems}
          view={view}
          onViewChange={setView}
        />
      )}

      {!loading && campaigns.length > 0 && calendarItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-850 bg-zinc-950/20 p-5 text-center text-xs leading-5 text-zinc-600">
          No campaign send dates match this filter.
        </div>
      ) : null}
    </div>
  )
}

function CampaignCalendarDetails({ campaign }: { campaign: Campaign }) {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-900 bg-zinc-950/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <PortalStatusBadge status={campaign.status} />
        <span className="font-mono text-[10px] text-zinc-500">{formatDateTime(campaign.scheduled_for as string)}</span>
      </div>
      <p className="text-sm font-bold text-white">{decodeHtmlEntities(campaign.subject)}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DetailMetric label="Recipients" value={campaign.recipient_count.toLocaleString()} />
        <DetailMetric label="Sent" value={campaign.sent_count.toLocaleString()} />
        <DetailMetric label="Queued" value={campaign.queued_count.toLocaleString()} />
        <DetailMetric label="Failed" value={campaign.failed_count.toLocaleString()} />
      </div>
      {campaign.sent_at ? <p className="text-[10px] text-zinc-500">Recorded sent time: {formatDateTime(campaign.sent_at)}</p> : null}
    </div>
  )
}

function CalendarKpi({ icon, label, value, detail, loading }: { icon: React.ReactNode; label: string; value: string; detail: string; loading: boolean }) {
  return (
    <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-[8.5px] font-black uppercase tracking-wider">{label}</span>
        <span className="text-[#caa24c]">{icon}</span>
      </div>
      {loading ? <div className="mt-3 h-6 w-16 rounded luxor-skeleton" /> : <p className="mt-3 font-mono text-xl font-bold text-white">{value}</p>}
      {loading ? <div className="mt-2 h-2.5 w-36 max-w-full rounded luxor-skeleton" /> : <p className="mt-2 text-[8.5px] leading-4 text-zinc-600">{detail}</p>}
    </div>
  )
}

function CalendarSkeleton() {
  return <section className="luxor-glass-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><div className="flex items-center justify-between border-b border-[color:var(--portal-border)] p-5 sm:p-6"><div><div className="h-2.5 w-28 rounded luxor-skeleton" /><div className="mt-2 h-7 w-48 rounded luxor-skeleton" /></div><div className="h-10 w-44 rounded-xl luxor-skeleton" /></div><div className="grid min-h-[36rem] grid-cols-2 gap-px bg-[color:var(--portal-border)] p-px sm:grid-cols-4 lg:grid-cols-7">{Array.from({ length: 28 }, (_, index) => <div key={index} className="min-h-28 bg-[color:var(--portal-card)] p-3"><div className="h-2.5 w-12 rounded luxor-skeleton" /><div className="mt-2 h-3.5 w-6 rounded luxor-skeleton" /><div className="mt-5 space-y-2"><div className="h-2.5 w-full rounded luxor-skeleton" /><div className="h-2.5 w-3/4 rounded luxor-skeleton" /></div></div>)}</div></section>
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-black/20 p-3">
      <p className="text-[8px] font-black uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-white">{value}</p>
    </div>
  )
}

function toneForCampaign(campaign: Campaign): PortalCalendarItem['tone'] {
  if (campaign.status === 'sent') return 'green'
  if (campaign.status === 'scheduled' || campaign.status === 'sending' || campaign.queued_count > 0) return 'gold'
  if (campaign.status === 'failed' || campaign.status === 'cancelled') return 'rose'
  return 'zinc'
}

function toLocalIsoDate(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatStatus(value: string) {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
