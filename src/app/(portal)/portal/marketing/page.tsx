'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Eye,
  LayoutTemplate,
  Mail,
  PenSquare,
  Plus,
  RefreshCw,
  Send,
  X,
} from 'lucide-react'
import { PortalEmptyState, PortalPageFrame, PortalPageHeader, PortalStatusBadge } from '@/components/portal/PortalUI'
import { EmailBuilderShell } from './EmailBuilder/EmailBuilderShell'
import { EMAIL_TEMPLATES } from './emailTemplates'

type Tab = 'overview' | 'builder' | 'templates'

type Campaign = {
  id: string
  created_at: string
  name: string
  subject: string
  status: string
  audience_label: string | null
  scheduled_for: string | null
  sent_at: string | null
  recipient_count: number
  sent_count: number
  queued_count: number
  failed_count: number
  open_count: number
  click_count: number
  unique_opens: number
  unique_clicks: number
  open_rate: number
  click_rate: number
}

type CampaignRecipient = {
  id: string
  email: string
  name: string | null
  status: string
  open_count: number
  click_count: number
  sent_at: string | null
  last_opened_at: string | null
  last_clicked_at: string | null
  last_error: string | null
}

type CampaignEvent = {
  id: string
  created_at: string
  event_type: 'open' | 'click' | 'unsubscribe'
  url: string | null
  device_type: string | null
}

type CampaignDetail = {
  campaign: Campaign
  recipients: CampaignRecipient[]
  events: CampaignEvent[]
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CampaignDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  async function loadCampaigns() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/marketing/campaigns', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load campaigns.')
      setCampaigns(payload.campaigns || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load campaigns.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCampaigns()
  }, [])

  const stats = useMemo(() => {
    const recipients = campaigns.reduce((sum, campaign) => sum + Number(campaign.recipient_count || 0), 0)
    const sent = campaigns.reduce((sum, campaign) => sum + Number(campaign.sent_count || 0), 0)
    const opens = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_opens || 0), 0)
    const clicks = campaigns.reduce((sum, campaign) => sum + Number(campaign.unique_clicks || 0), 0)
    const scheduled = campaigns.filter((campaign) => campaign.status === 'scheduled' || campaign.queued_count > 0).length

    return {
      campaigns: campaigns.length,
      recipients,
      scheduled,
      openRate: sent ? Math.round((opens / sent) * 1000) / 10 : 0,
      clickRate: sent ? Math.round((clicks / sent) * 1000) / 10 : 0,
    }
  }, [campaigns])

  async function cancelCampaign(id: string) {
    setBusyId(id)
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to cancel campaign.')
      await loadCampaigns()
    } catch (cancelError) {
      alert(cancelError instanceof Error ? cancelError.message : 'Unable to cancel campaign.')
    } finally {
      setBusyId(null)
    }
  }

  async function openCampaignReport(id: string) {
    setDetailLoadingId(id)
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load campaign report.')
      setSelectedDetail(payload)
    } catch (reportError) {
      alert(reportError instanceof Error ? reportError.message : 'Unable to load campaign report.')
    } finally {
      setDetailLoadingId(null)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
    { id: 'builder', label: 'Email Builder', icon: <PenSquare size={14} /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={14} /> },
  ]

  return (
    <PortalPageFrame className={activeTab === 'builder' ? '!h-[calc(100vh-11rem)] sm:!h-[calc(100vh-12rem)] lg:!h-[calc(100vh-13.5rem)] !min-h-0 overflow-hidden' : ''}>
      <PortalPageHeader
        icon={<Mail size={18} />}
        title="Marketing Command"
        description="Build, schedule, send, and track Luxor email campaigns from one simple control room."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-800/60 bg-zinc-900/30">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#caa24c] text-black shadow-md shadow-[#caa24c]/20'
                      : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={loadCampaigns}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-zinc-400 transition-all hover:text-white disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-black shadow-xl shadow-[#caa24c]/20 transition-all hover:bg-[#dfbd68] hover:scale-105 active:scale-95"
                >
                  <Plus size={14} /> New Campaign
                </button>
              </div>
            )}
          </div>
        }
      />

      {activeTab === 'overview' && (
        <>
          <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-4 lg:gap-6">
            <StatsPanel label="Campaigns" value={String(stats.campaigns)} detail={`${stats.scheduled} scheduled/queued`} />
            <StatsPanel label="Recipients" value={stats.recipients.toLocaleString()} detail={`${campaigns.length} lists`} />
            <StatsPanel label="Open Rate" value={`${stats.openRate}%`} detail="unique opens" />
            <StatsPanel label="Click Rate" value={`${stats.clickRate}%`} detail="unique clicks" />
          </div>

          {error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Marketing data could not load.</p>
                <p className="mt-1 text-xs text-rose-300/80">{error}</p>
              </div>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="space-y-4 lg:col-span-2 lg:space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">Campaigns</h3>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#caa24c] transition-colors hover:text-[#dfbd68]"
                >
                  <PenSquare size={11} />
                  Build Email
                </button>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-zinc-900 bg-black/30 p-8 text-sm text-zinc-500">Loading campaigns...</div>
              ) : campaigns.length ? (
                campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    busy={busyId === campaign.id}
                    reportBusy={detailLoadingId === campaign.id}
                    onReport={() => openCampaignReport(campaign.id)}
                    onCancel={() => cancelCampaign(campaign.id)}
                  />
                ))
              ) : (
                <PortalEmptyState
                  icon={<Mail size={34} />}
                  title="No campaigns yet"
                  description="Build an email, add recipients, and queue or schedule it. Once it sends, opens and clicks will show here."
                  action={
                    <button
                      onClick={() => setActiveTab('builder')}
                      className="rounded-xl bg-[#caa24c] px-5 py-2.5 text-xs font-black uppercase tracking-[0.15em] text-black"
                    >
                      Create Campaign
                    </button>
                  }
                />
              )}
            </div>

            <div className="space-y-6">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">How To Use It</h3>
              <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 p-6 shadow-2xl backdrop-blur-xl">
                <MachineStep icon={<PenSquare size={14} />} title="Build" text="Use the email builder or a template. Keep one clear call-to-action per campaign." />
                <MachineStep icon={<CalendarClock size={14} />} title="Schedule" text="Paste a recipient list, pick a time, and the site creates cron-ready email jobs." />
                <MachineStep icon={<BarChart3 size={14} />} title="Measure" text="Every recipient gets a tracking pixel and wrapped links, so opens and clicks return here." />
              </div>

              <div className="nodal-void-card rounded-2xl border border-[#caa24c]/10 bg-zinc-900/10 p-6 shadow-2xl">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-white">Good Next Campaign</h4>
                <p className="mb-4 text-[11px] font-medium leading-relaxed text-zinc-400">
                  Re-engage tour no-shows with a short concierge note and one button back to the tour page. That is more useful than a big newsletter because it asks for one clear action.
                </p>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#caa24c] transition-transform hover:translate-x-1"
                >
                  Build This Email <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'builder' && (
        <div className="min-h-0 flex-1">
          <EmailBuilderShell />
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="flex-1">
          <div className="mb-6">
            <p className="text-xs text-zinc-500">
              Choose a template to jump-start your next campaign. Templates open from the builder template button.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {EMAIL_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/20 transition-all hover:border-zinc-600 hover:bg-zinc-800/20"
              >
                <div className="h-1.5 w-full" style={{ background: tpl.previewColor }} />
                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-white/90">{tpl.name}</h4>
                    <span
                      className="shrink-0 rounded-sm border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest"
                      style={{ color: tpl.previewColor, borderColor: `${tpl.previewColor}40`, background: `${tpl.previewColor}15` }}
                    >
                      {tpl.category}
                    </span>
                  </div>
                  <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">{tpl.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-700">{tpl.blocks.length} blocks</span>
                    <button
                      onClick={() => setActiveTab('builder')}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all hover:scale-105 active:scale-95"
                      style={{ background: `${tpl.previewColor}20`, color: tpl.previewColor, border: `1px solid ${tpl.previewColor}30` }}
                    >
                      <PenSquare size={10} />
                      Open Builder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDetail ? (
        <CampaignReportModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
      ) : null}
    </PortalPageFrame>
  )
}

function StatsPanel({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="luxor-glass-card luxor-glow-gold group overflow-hidden rounded-2xl p-6 shadow-xl">
      <p className="relative z-10 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <div className="relative z-10 flex items-end justify-between">
        <h3 className="font-mono text-2xl font-bold tracking-tight text-white transition-transform duration-300 group-hover:translate-x-1">{value}</h3>
        <span className="pb-1 text-[10px] font-bold text-zinc-500">{detail}</span>
      </div>
    </div>
  )
}

function CampaignCard({
  campaign,
  busy,
  reportBusy,
  onReport,
  onCancel,
}: {
  campaign: Campaign
  busy: boolean
  reportBusy: boolean
  onReport: () => void
  onCancel: () => void
}) {
  const progress = campaign.recipient_count ? Math.round((campaign.sent_count / campaign.recipient_count) * 100) : 0
  const canCancel = campaign.status === 'scheduled' || campaign.queued_count > 0

  return (
    <div className="luxor-glass-card luxor-glow-blue group overflow-hidden rounded-2xl p-6 shadow-xl">
      <div className="relative z-10 mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/5 p-2 text-blue-400">
            {campaign.status === 'sent' ? <CheckCircle2 size={16} /> : campaign.status === 'scheduled' ? <CalendarClock size={16} /> : <Send size={16} />}
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{campaign.audience_label || 'Manual list'}</p>
            <h4 className="truncate text-sm font-bold text-white/90 transition-colors group-hover:text-blue-400">{campaign.name}</h4>
            <p className="mt-1 truncate text-[11px] text-zinc-500">{campaign.subject}</p>
          </div>
        </div>
        <PortalStatusBadge status={campaign.status} />
      </div>

      <div className="relative z-10 mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Metric label="Recipients" value={campaign.recipient_count.toLocaleString()} />
        <Metric label="Sent" value={campaign.sent_count.toLocaleString()} />
        <Metric label="Open" value={`${campaign.open_rate}%`} />
        <Metric label="Click" value={`${campaign.click_rate}%`} />
        <Metric label="Events" value={(campaign.open_count + campaign.click_count).toLocaleString()} />
      </div>

      <div className="relative z-10 mb-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
        <div className="h-full rounded-full bg-blue-600 transition-all duration-1000" style={{ width: `${progress}%` }} />
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] text-zinc-600">
          {campaign.scheduled_for ? `Scheduled: ${new Date(campaign.scheduled_for).toLocaleString()}` : `Created: ${new Date(campaign.created_at).toLocaleString()}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onReport}
            disabled={reportBusy}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
          >
            <Eye size={11} />
            {reportBusy ? 'Loading...' : 'Report'}
          </button>
          {canCancel ? (
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
            >
              {busy ? 'Cancelling...' : 'Cancel Queue'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CampaignReportModal({ detail, onClose }: { detail: CampaignDetail; onClose: () => void }) {
  const { campaign, recipients, events } = detail
  const engaged = recipients.filter((recipient) => recipient.open_count > 0 || recipient.click_count > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Campaign Report</p>
            <h3 className="mt-1 truncate text-lg font-bold text-white">{campaign.name}</h3>
            <p className="mt-1 truncate text-xs text-zinc-500">{campaign.subject}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="portal-scrollbar overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <ReportMetric label="Recipients" value={campaign.recipient_count.toLocaleString()} />
            <ReportMetric label="Sent" value={campaign.sent_count.toLocaleString()} />
            <ReportMetric label="Engaged" value={engaged.toLocaleString()} />
            <ReportMetric label="Open Rate" value={`${campaign.open_rate}%`} />
            <ReportMetric label="Click Rate" value={`${campaign.click_rate}%`} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Recipients</h4>
                <span className="text-[10px] text-zinc-600">{recipients.length} total</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-zinc-800/70">
                <div className="max-h-96 overflow-y-auto portal-scrollbar">
                  {recipients.map((recipient) => (
                    <div key={recipient.id} className="grid grid-cols-12 gap-3 border-b border-zinc-900 px-4 py-3 last:border-b-0">
                      <div className="col-span-6 min-w-0">
                        <p className="truncate text-xs font-bold text-zinc-200">{recipient.name || recipient.email}</p>
                        <p className="truncate text-[10px] text-zinc-600">{recipient.email}</p>
                      </div>
                      <div className="col-span-2">
                        <PortalStatusBadge status={recipient.status} />
                      </div>
                      <div className="col-span-2 text-right font-mono text-xs text-zinc-300">{recipient.open_count} opens</div>
                      <div className="col-span-2 text-right font-mono text-xs text-zinc-300">{recipient.click_count} clicks</div>
                      {recipient.last_error ? <p className="col-span-12 text-[10px] text-rose-300">{recipient.last_error}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Recent Events</h4>
                <span className="text-[10px] text-zinc-600">{events.length}</span>
              </div>
              <div className="space-y-3">
                {events.length ? events.slice(0, 12).map((event) => (
                  <div key={event.id} className="rounded-xl border border-zinc-800/70 bg-zinc-900/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                        event.event_type === 'click'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : event.event_type === 'unsubscribe'
                          ? 'bg-rose-500/10 text-rose-300'
                          : 'bg-blue-500/10 text-blue-300'
                      }`}>
                        {event.event_type}
                      </span>
                      <span className="text-[10px] text-zinc-600">{new Date(event.created_at).toLocaleString()}</span>
                    </div>
                    {event.url ? <p className="mt-2 break-all text-[10px] leading-4 text-zinc-500">{event.url}</p> : null}
                    <p className="mt-2 text-[10px] text-zinc-700">{event.device_type || 'unknown device'}</p>
                  </div>
                )) : (
                  <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/20 p-5 text-xs leading-5 text-zinc-500">
                    No opens or clicks recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 font-mono text-xl font-bold text-white">{value}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">{label}</p>
      <p className="font-mono text-lg font-bold text-white">{value}</p>
    </div>
  )
}

function MachineStep({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="border-b border-zinc-900/70 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-center gap-2 text-[#caa24c]">
        {icon}
        <h4 className="text-[10px] font-black uppercase tracking-[0.18em]">{title}</h4>
      </div>
      <p className="text-[11px] leading-5 text-zinc-500">{text}</p>
    </div>
  )
}
