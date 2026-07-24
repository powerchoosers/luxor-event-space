'use client'

import React, { useMemo, useState } from 'react'
import { AlertCircle, Eye, Loader2, Mail, Send, X } from 'lucide-react'
import {
  PortalStatusBadge,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
} from '@/components/portal/PortalUI'
import type { Campaign } from '../page'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

interface EmailCampaignsTabProps {
  campaigns: Campaign[]
  loading: boolean
  error: string | null
  busyId: string | null
  detailLoadingId: string | null
  onReport: (id: string) => void
  onCancel: (id: string) => void
  onSendNow: (id: string) => void
}

type CampaignFilter = 'all' | 'sent' | 'scheduled' | 'draft' | 'automations'

export function EmailCampaignsTab({
  campaigns,
  loading,
  error,
  busyId,
  detailLoadingId,
  onReport,
  onCancel,
  onSendNow,
}: EmailCampaignsTabProps) {
  const [filter, setFilter] = useState<CampaignFilter>('all')

  const stats = useMemo(() => {
    const recipients = campaigns.reduce((sum, campaign) => sum + Number(campaign.recipient_count || 0), 0)
    const sent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent_count || 0), 0)
    const queued = campaigns.reduce((sum, campaign) => sum + Number(campaign.queued_count || 0), 0)
    const uniqueOpens = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_opens || 0), 0)
    const uniqueClicks = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_clicks || 0), 0)
    const unsubscribes = campaigns.reduce((sum, campaign) => sum + Number(campaign.unsubscribe_count || 0), 0)

    return [
      { label: 'Campaigns', value: campaigns.length.toLocaleString(), detail: 'Saved in Supabase' },
      { label: 'Recipients', value: recipients.toLocaleString(), detail: 'Campaign recipient rows' },
      { label: 'Emails Sent', value: sent.toLocaleString(), detail: 'Recipients marked sent' },
      { label: 'Queued', value: queued.toLocaleString(), detail: 'Waiting for delivery' },
      { label: 'Open Rate', value: `${sent ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0}%`, detail: `${uniqueOpens.toLocaleString()} unique opens` },
      { label: 'Click Rate', value: `${sent ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0}%`, detail: `${uniqueClicks.toLocaleString()} clicks · ${unsubscribes} unsubs` },
    ]
  }, [campaigns])

  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => {
    if (filter === 'all') return true
    if (filter === 'automations') return campaign.audience_label?.toLowerCase().includes('automat') ?? false
    return campaign.status === filter
  }), [campaigns, filter])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 transition-all hover:border-[#caa24c]/30">
            <p className="text-[8.5px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">{stat.label}</p>
            {loading ? (
              <div className="mt-2.5 h-6 w-16 rounded luxor-skeleton" />
            ) : (
              <h3 className="mt-2.5 font-mono text-base font-bold text-[color:var(--portal-text)]">{stat.value}</h3>
            )}
            <p className="mt-2 text-[8.5px] font-bold leading-4 text-[color:var(--portal-muted)]">{stat.detail}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Campaign data could not load.</p>
            <p className="mt-1 text-xs text-rose-300/80">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center">
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All Campaigns" />
          <FilterTab active={filter === 'sent'} onClick={() => setFilter('sent')} label="Sent" />
          <FilterTab active={filter === 'scheduled'} onClick={() => setFilter('scheduled')} label="Scheduled" />
          <FilterTab active={filter === 'draft'} onClick={() => setFilter('draft')} label="Drafts" />
          <FilterTab active={filter === 'automations'} onClick={() => setFilter('automations')} label="Automations" />
        </div>
      </div>

      <PortalTableCard controls={(
        <div className="flex items-center justify-between w-full">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Supabase Campaigns</h3>
            <p className="text-[9px] text-[color:var(--portal-muted)] mt-0.5">Tracked campaign activity, deliverability metrics, and report launcher.</p>
          </div>
          <span className="font-mono text-[9px] text-[color:var(--portal-muted)]">{loading ? 'Loading…' : `${filteredCampaigns.length} campaign${filteredCampaigns.length === 1 ? '' : 's'}`}</span>
        </div>
      )}>
        <PortalStickyTable>
          <thead>
            <tr className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 text-left text-[8.5px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">
              <th className="px-6 py-3.5">Campaign Name</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Recipients</th>
              <th className="px-4 py-3.5 text-right">Sent</th>
              <th className="px-4 py-3.5 text-right">Queued</th>
              <th className="px-4 py-3.5 text-right">Failed</th>
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5 text-right">Open Rate</th>
              <th className="px-4 py-3.5 text-right">Click Rate</th>
              <th className="px-4 py-3.5 text-right">Unsubs</th>
              <th className="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-[color:var(--portal-border)]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl luxor-skeleton shrink-0" />
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="h-3.5 w-36 rounded luxor-skeleton" />
                        <div className="h-2.5 w-24 rounded luxor-skeleton" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4"><div className="h-5 w-16 rounded-full luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-8 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-8 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-8 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-8 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4"><div className="h-3.5 w-20 rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-10 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-10 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-4 py-4 text-right"><div className="h-3.5 w-8 ml-auto rounded luxor-skeleton" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-4 w-12 ml-auto rounded luxor-skeleton" /></td>
                </tr>
              ))
            ) : !filteredCampaigns.length ? (
              <tr>
                <td colSpan={11} className="px-6 py-12 text-center text-xs text-[color:var(--portal-muted)]">
                  {campaigns.length ? 'No campaigns match this filter.' : 'No marketing campaigns have been saved in Supabase yet.'}
                </td>
              </tr>
            ) : null}
            {filteredCampaigns.map((campaign) => {
              const rowBusy = busyId === campaign.id
              const reportBusy = detailLoadingId === campaign.id
              const canManageQueue = campaign.queued_count > 0

              return (
                <tr key={campaign.id} className="border-b border-zinc-900/40 transition-colors hover:bg-zinc-900/10">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400"><Mail size={13} /></div>
                      <div className="min-w-0">
                        <p className="truncate font-bold leading-tight text-white">{decodeHtmlEntities(campaign.name)}</p>
                        <p className="mt-0.5 truncate text-[10px] text-zinc-500">{decodeHtmlEntities(campaign.subject)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4"><PortalStatusBadge status={campaign.status} /></td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.recipient_count.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.sent_count.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.queued_count.toLocaleString()}</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.failed_count.toLocaleString()}</td>
                  <td className="px-4 py-4 text-zinc-400">{formatCampaignDate(campaign)}</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.open_rate}%</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.click_rate}%</td>
                  <td className="px-4 py-4 text-right font-mono text-zinc-350">{campaign.unsubscribe_count.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => onReport(campaign.id)} disabled={reportBusy} aria-label={`Open report for ${decodeHtmlEntities(campaign.name)}`} className="rounded p-1 text-zinc-500 transition-colors hover:text-white disabled:opacity-50">
                        {reportBusy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                      </button>
                      {canManageQueue ? (
                        <>
                          <button type="button" onClick={() => onSendNow(campaign.id)} disabled={rowBusy} aria-label={`Send ${decodeHtmlEntities(campaign.name)} now`} className="rounded p-1 text-emerald-500 transition-colors hover:text-emerald-300 disabled:opacity-50"><Send size={13} /></button>
                          <button type="button" onClick={() => onCancel(campaign.id)} disabled={rowBusy} aria-label={`Cancel ${decodeHtmlEntities(campaign.name)}`} className="rounded p-1 text-rose-500 transition-colors hover:text-rose-300 disabled:opacity-50"><X size={13} /></button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </PortalStickyTable>
      </PortalTableCard>
    </div>
  )
}

function FilterTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all ${active ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'text-zinc-550 hover:text-zinc-300'}`}>
      {label}
    </button>
  )
}

function formatCampaignDate(campaign: Campaign) {
  const value = campaign.sent_at || campaign.scheduled_for
  if (!value) return 'Not scheduled'
  const label = campaign.sent_at ? 'Sent' : 'Scheduled'
  return `${label} ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))}`
}
