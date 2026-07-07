'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { PortalEmptyState, PortalPageFrame, PortalPageHeader, PortalStatusBadge, PortalModal, PortalAnimatedTabs, PortalTabTransition } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { EmailBuilderShell } from './EmailBuilder/EmailBuilderShell'
import { EMAIL_TEMPLATES, type EmailTemplate } from './emailTemplates'

type Tab = 'sources' | 'overview' | 'builder' | 'templates'

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

type MarketingActivityEvent = CampaignEvent & {
  campaign_id: string
  recipient_id: string
  recipient_email: string | null
  recipient_name: string | null
  campaign_name: string | null
  campaign_subject: string | null
}

type CampaignDetail = {
  campaign: Campaign
  recipients: CampaignRecipient[]
  events: CampaignEvent[]
}

export default function MarketingPage() {
  const { notify } = useToast()
  const [activeTab, setActiveTab] = useState<Tab>('sources')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CampaignDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [builderTemplate, setBuilderTemplate] = useState<EmailTemplate | null>(null)
  const latestActivityAtRef = useRef<string | null>(null)
  const seenActivityIdsRef = useRef<Set<string>>(new Set())
  const selectedCampaignIdRef = useRef<string | null>(null)

  const loadCampaigns = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/marketing/campaigns', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load campaigns.')
      setCampaigns(payload.campaigns || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load campaigns.')
    } finally {
      if (!options.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  useEffect(() => {
    selectedCampaignIdRef.current = selectedDetail?.campaign.id ?? null
  }, [selectedDetail?.campaign.id])

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
      notify({
        title: 'Campaign was not cancelled',
        description: cancelError instanceof Error ? cancelError.message : 'Unable to cancel campaign.',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function sendCampaignNow(id: string) {
    setBusyId(id)
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-now' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to send campaign now.')
      await loadCampaigns()
    } catch (sendError) {
      notify({
        title: 'Campaign was not sent',
        description: sendError instanceof Error ? sendError.message : 'Unable to send campaign now.',
        variant: 'error',
      })
    } finally {
      setBusyId(null)
    }
  }

  const refreshCampaignReport = useCallback(async (id: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) setDetailLoadingId(id)
    try {
      const response = await fetch(`/api/marketing/campaigns/${id}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load campaign report.')
      setSelectedDetail(payload)
    } catch (reportError) {
      notify({
        title: 'Report could not load',
        description: reportError instanceof Error ? reportError.message : 'Unable to load campaign report.',
        variant: 'error',
      })
    } finally {
      if (!options.silent) setDetailLoadingId(null)
    }
  }, [notify])

  function openCampaignReport(id: string) {
    void refreshCampaignReport(id)
  }

  useEffect(() => {
    let active = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const pollMarketingActivity = async (initial = false) => {
      try {
        const since = latestActivityAtRef.current
        const url = since
          ? `/api/marketing/events?since=${encodeURIComponent(since)}&limit=25`
          : '/api/marketing/events?limit=25'
        const response = await fetch(url, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Unable to load marketing events.')
        if (!active) return

        const events = Array.isArray(payload.events) ? payload.events as MarketingActivityEvent[] : []
        if (events.length) {
          const newest = events[0]?.created_at
          if (newest && (!latestActivityAtRef.current || new Date(newest).getTime() > new Date(latestActivityAtRef.current).getTime())) {
            latestActivityAtRef.current = newest
          }
        }

        if (initial) {
          events.forEach((event) => seenActivityIdsRef.current.add(event.id))
          return
        }

        const newEvents = events
          .filter((event) => !seenActivityIdsRef.current.has(event.id))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        if (!newEvents.length) return

        newEvents.forEach((event) => {
          seenActivityIdsRef.current.add(event.id)
          const recipient = event.recipient_name || event.recipient_email || 'Unknown recipient'
          const campaign = event.campaign_name || event.campaign_subject || 'Unknown campaign'
          const title = event.event_type === 'click' ? 'Marketing link clicked' : 'Marketing email opened'
          const target = event.event_type === 'click' && event.url ? ` -> ${shortenUrl(event.url)}` : ''

          notify({
            title,
            description: `${recipient} on ${campaign}${target}`,
            variant: event.event_type === 'click' ? 'success' : 'info',
          })
        })

        await loadCampaigns({ silent: true })

        const selectedCampaignId = selectedCampaignIdRef.current
        if (selectedCampaignId && newEvents.some((event) => event.campaign_id === selectedCampaignId)) {
          await refreshCampaignReport(selectedCampaignId, { silent: true })
        }
      } catch (activityError) {
        console.error('Marketing activity watcher failed:', activityError)
      } finally {
        if (active) {
          timeoutId = setTimeout(() => pollMarketingActivity(false), 3000)
        }
      }
    }

    void pollMarketingActivity(true)

    return () => {
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [loadCampaigns, notify, refreshCampaignReport])

  function openTemplateInBuilder(template: EmailTemplate) {
    setBuilderTemplate(template)
    setActiveTab('builder')
  }

  function openBlankBuilder() {
    setBuilderTemplate(null)
    setActiveTab('builder')
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sources', label: 'Lead Sources', icon: <Eye size={14} /> },
    { id: 'overview', label: 'Email Campaigns', icon: <BarChart3 size={14} /> },
    { id: 'builder', label: 'Email Builder', icon: <PenSquare size={14} /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={14} /> },
  ]

  return (
    <PortalPageFrame className={activeTab === 'builder' ? '!h-full !min-h-0 overflow-hidden' : ''}>
      <PortalPageHeader
        icon={<Mail size={18} />}
        title="Marketing Command"
        description="Build, schedule, send, and track Luxor email campaigns from one simple control room."
        actions={
          <div className="flex flex-col items-end gap-2.5">
            {/* Top row: Campaign Actions (only in overview mode) */}
            {activeTab === 'overview' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadCampaigns()}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-2 text-xs font-black uppercase tracking-[0.15em] text-zinc-400 transition-all hover:text-white disabled:opacity-50"
                >
                  <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  onClick={openBlankBuilder}
                  className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-black shadow-xl shadow-[#caa24c]/20 transition-all hover:bg-[#dfbd68] hover:scale-105 active:scale-95"
                >
                  <Plus size={13} /> New Campaign
                </button>
              </div>
            )}

            {/* Bottom row: Navigation Tabs */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-1 overflow-x-auto portal-scrollbar">
              <PortalAnimatedTabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={(tab) => (tab === 'builder' ? openBlankBuilder() : setActiveTab(tab))}
              />
            </div>
          </div>
        }
      />

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'sources' && (
          <MarketingSourcesDashboard />
        )}

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
                    onClick={openBlankBuilder}
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
                      onSendNow={() => sendCampaignNow(campaign.id)}
                    />
                  ))
                ) : (
                  <PortalEmptyState
                    icon={<Mail size={34} />}
                    title="No campaigns yet"
                    description="Build an email, add recipients, and queue or schedule it. Once it sends, opens and clicks will show here."
                    action={
                      <button
                        onClick={openBlankBuilder}
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
                    onClick={openBlankBuilder}
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
            <EmailBuilderShell key={builderTemplate?.id || 'blank-builder'} initialTemplate={builderTemplate} />
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="flex-1">
            <div className="mb-6">
              <p className="text-xs text-zinc-500">
                Choose a template to jump-start your next campaign. Click any card to open it in the email builder.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {EMAIL_TEMPLATES.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => openTemplateInBuilder(tpl)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/20 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-800/20 focus:outline-none focus:ring-2 focus:ring-[#caa24c]/35"
                >
                  <div className="h-1.5 w-full" style={{ background: tpl.previewColor }} />
                  <div className="p-5">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h4 className="text-sm font-bold text-white/90 transition-colors group-hover:text-white">{tpl.name}</h4>
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
                      <span
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] transition-all group-hover:scale-105"
                        style={{ background: `${tpl.previewColor}20`, color: tpl.previewColor, border: `1px solid ${tpl.previewColor}30` }}
                      >
                        <PenSquare size={10} />
                        Open Builder
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </PortalTabTransition>

      <CampaignReportModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
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
  onSendNow,
}: {
  campaign: Campaign
  busy: boolean
  reportBusy: boolean
  onReport: () => void
  onCancel: () => void
  onSendNow: () => void
}) {
  const progress = campaign.recipient_count ? Math.round((campaign.sent_count / campaign.recipient_count) * 100) : 0
  const canCancel = campaign.status === 'scheduled' || campaign.queued_count > 0
  const canSendNow = campaign.queued_count > 0 && campaign.status !== 'cancelled'

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
          {canSendNow ? (
            <button
              onClick={onSendNow}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#dfbd68] transition-colors hover:bg-[#caa24c]/15 disabled:opacity-50"
            >
              <Send size={11} />
              {busy ? 'Sending...' : 'Send Now'}
            </button>
          ) : null}
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

function CampaignReportModal({ detail, onClose }: { detail: CampaignDetail | null; onClose: () => void }) {
  if (!detail) return null

  const { campaign, recipients, events } = detail
  const engaged = recipients.filter((recipient) => recipient.open_count > 0 || recipient.click_count > 0).length

  return (
    <PortalModal isOpen={!!detail} onClose={onClose} maxWidth="max-w-5xl">
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
      </PortalModal>
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

function shortenUrl(url: string) {
  try {
    const parsed = new URL(url)
    const value = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`
    return value.length > 42 ? `${value.slice(0, 39)}...` : value
  } catch {
    return url.length > 42 ? `${url.slice(0, 39)}...` : url
  }
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

function MarketingSourcesDashboard() {
  const sourcesData = [
    { source: 'Google Ads / Search', count: 112, conversion: '14.2%', pct: 75 },
    { source: 'Instagram Organic', count: 96, conversion: '11.5%', pct: 64 },
    { source: 'Peerspace Referrals', count: 74, conversion: '9.8%', pct: 49 },
    { source: 'The Knot Profile', count: 68, conversion: '8.4%', pct: 45 },
    { source: 'WeddingWire Profile', count: 52, conversion: '7.6%', pct: 34 },
    { source: 'Facebook Ads', count: 48, conversion: '6.2%', pct: 32 },
    { source: 'Chat Widget Auto-Leads', count: 84, conversion: '10.2%', pct: 56 }
  ]

  return (
    <div className="space-y-6">
      {/* Top summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsPanel label="Website Visitors" value="2,480" detail="Uniques (Last 30d)" />
        <StatsPanel label="Chat Conversions" value="84" detail="10.2% contact rate" />
        <StatsPanel label="Best Lead Channel" value="Google Search" detail="14.2% booked conversion" />
        <StatsPanel label="Ad Spend ROI" value="3.8x ROI" detail="$1.2k spend -> $4.5k booked" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversion by lead source bar list */}
        <div className="luxor-glass-card rounded-2xl p-6 lg:col-span-2 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center justify-between">
            <span>Conversion rate by channel source</span>
            <span className="text-[10px] text-zinc-500">Last 60 Days Analytics</span>
          </h3>

          <div className="space-y-4">
            {sourcesData.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-white">{item.source}</span>
                  <span className="font-mono text-zinc-400">{item.count} leads ({item.conversion} conv)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden flex">
                  <div className="h-full rounded-full bg-[#caa24c]" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ad Performance summary */}
        <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Active Ad Campaign Stats</h3>
            <div className="space-y-4 pt-3 font-mono">
              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-sans">Google PPC Cost Per Lead</span>
                <span className="text-white font-bold">$10.45</span>
              </div>
              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-sans">Instagram CPM Average</span>
                <span className="text-white font-bold">$4.12</span>
              </div>
              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-500 font-sans">The Knot Premium Listing Fee</span>
                <span className="text-white font-bold">$180 / mo</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-550 font-sans">WeddingWire Premium Fee</span>
                <span className="text-white font-bold">$150 / mo</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-zinc-650 leading-relaxed font-medium">
            Ad conversion telemetry updates automatically via integrated Zoho Lead tracker hooks.
          </p>
        </div>
      </div>
    </div>
  )
}
