'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { PortalButton, PortalDatePicker, PortalSelect, PortalStatusBadge } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import type {
  LuxorTextAudienceRecipient,
  LuxorTextCampaign,
  LuxorTextCampaignType,
} from '@/lib/luxorTextCampaignTypes'

type Dashboard = {
  campaigns: LuxorTextCampaign[]
  audience: LuxorTextAudienceRecipient[]
  stats: {
    campaigns: number
    textsSent: number
    delivered: number
    replies: number
    optOuts: number
    eligibleRecipients: number
    dailySegmentLimit: number
  }
}

const EMPTY_STATS: Dashboard['stats'] = {
  campaigns: 0,
  textsSent: 0,
  delivered: 0,
  replies: 0,
  optOuts: 0,
  eligibleRecipients: 0,
  dailySegmentLimit: 1800,
}

const FIELD_CLASS =
  'w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/50 focus:ring-2 focus:ring-[#caa24c]/10'

function estimateSegments(value: string) {
  const unicode = /[^\x00-\x7F]/.test(value)
  const one = unicode ? 70 : 160
  const multipart = unicode ? 67 : 153
  return value.length <= one ? 1 : Math.max(1, Math.ceil(value.length / multipart))
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function TextCampaignsTab() {
  const { notify } = useToast()
  const [dashboard, setDashboard] = useState<Dashboard>({ campaigns: [], audience: [], stats: EMPTY_STATS })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [name, setName] = useState('')
  const [bodyTemplate, setBodyTemplate] = useState(
    'Luxor Event Space: Hi [FirstName], this is a quick update about your [EventType]. Reply with any questions. Reply STOP to opt out.',
  )
  const [campaignType, setCampaignType] = useState<LuxorTextCampaignType>('customer_care')
  const [statusFilter, setStatusFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [sendMode, setSendMode] = useState('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('10:00')
  const [aiPrompt, setAiPrompt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/text-campaigns', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Text campaigns could not be loaded.')
      setDashboard(payload)
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Text campaigns could not be loaded.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const savedDraft = window.localStorage.getItem('luxor_elena_text_campaign_draft')
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft) as {
          name?: string
          bodyTemplate?: string
          campaignType?: LuxorTextCampaignType
        }
        if (parsed.name) setName(parsed.name)
        if (parsed.bodyTemplate) setBodyTemplate(parsed.bodyTemplate)
        if (parsed.campaignType) setCampaignType(parsed.campaignType)
        window.localStorage.removeItem('luxor_elena_text_campaign_draft')
      } catch {
        window.localStorage.removeItem('luxor_elena_text_campaign_draft')
      }
    }
    const receiveElenaDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; bodyTemplate?: string; campaignType?: LuxorTextCampaignType }>).detail
      if (detail?.name) setName(detail.name)
      if (detail?.bodyTemplate) setBodyTemplate(detail.bodyTemplate)
      if (detail?.campaignType) setCampaignType(detail.campaignType)
    }
    window.addEventListener('luxor:text-campaign-draft', receiveElenaDraft)
    return () => window.removeEventListener('luxor:text-campaign-draft', receiveElenaDraft)
  }, [])

  const statuses = useMemo(
    () => Array.from(new Set(dashboard.audience.map((recipient) => recipient.status).filter(Boolean))).sort(),
    [dashboard.audience],
  )
  const eventTypes = useMemo(
    () => Array.from(new Set(dashboard.audience.map((recipient) => recipient.eventType).filter((value): value is string => Boolean(value)))).sort(),
    [dashboard.audience],
  )
  const previewAudience = useMemo(
    () => dashboard.audience.filter((recipient) =>
      (statusFilter === 'all' || recipient.status === statusFilter) &&
      (eventFilter === 'all' || recipient.eventType === eventFilter)),
    [dashboard.audience, eventFilter, statusFilter],
  )
  const segmentsPerRecipient = estimateSegments(bodyTemplate)
  const estimatedSegments = segmentsPerRecipient * previewAudience.length

  async function askElena() {
    if (!aiPrompt.trim()) {
      notify({ title: 'Tell Elena what the text should accomplish.', variant: 'error' })
      return
    }
    setGenerating(true)
    try {
      const response = await fetch('/api/portal/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          audienceLabel: `${previewAudience.length} opted-in Luxor contacts`,
          exampleRecipient: previewAudience[0] || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Elena could not draft the text.')
      setName(payload.name)
      setBodyTemplate(payload.bodyTemplate)
      setCampaignType(payload.campaignType)
      notify({ title: 'Elena prepared a draft. Review it before queueing.', variant: 'success' })
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Elena could not draft the text.', variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  function openReview() {
    if (!name.trim()) return notify({ title: 'Name the campaign first.', variant: 'error' })
    if (!bodyTemplate.trim()) return notify({ title: 'Write a text message first.', variant: 'error' })
    if (!/luxor/i.test(bodyTemplate) || !/\bstop\b/i.test(bodyTemplate)) {
      return notify({ title: 'The text must identify Luxor and include STOP instructions.', variant: 'error' })
    }
    if (!previewAudience.length) return notify({ title: 'No opted-in contacts match this audience.', variant: 'error' })
    if (sendMode === 'later' && !scheduledDate) return notify({ title: 'Choose a future send date.', variant: 'error' })
    setReviewing(true)
  }

  async function queueCampaign() {
    setSaving(true)
    try {
      const response = await fetch('/api/text-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bodyTemplate,
          campaignType,
          audienceFilter: {
            ...(statusFilter === 'all' ? {} : { statuses: [statusFilter] }),
            ...(eventFilter === 'all' ? {} : { eventTypes: [eventFilter] }),
          },
          audienceLabel: [
            statusFilter === 'all' ? 'All opted-in contacts' : statusFilter,
            eventFilter === 'all' ? null : eventFilter,
          ].filter(Boolean).join(' · '),
          scheduledFor: sendMode === 'later' ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() : null,
          source: 'portal_text_builder',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Campaign could not be queued.')
      setReviewing(false)
      setName('')
      notify({ title: 'Text campaign queued. The worker will pace delivery safely.', variant: 'success' })
      await load()
    } catch (error) {
      notify({ title: error instanceof Error ? error.message : 'Campaign could not be queued.', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {[
          ['Campaigns', dashboard.stats.campaigns],
          ['Eligible', dashboard.stats.eligibleRecipients],
          ['Texts sent', dashboard.stats.textsSent],
          ['Delivered', dashboard.stats.delivered],
          ['Replies', dashboard.stats.replies],
          ['Opt-outs', dashboard.stats.optOuts],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
            <p className="mt-2 font-mono text-xl font-bold text-[color:var(--portal-text)]">{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(21rem,.85fr)]">
        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-[color:var(--portal-text)]">
                <MessageSquare size={17} className="text-[#caa24c]" /> Build a text campaign
              </h3>
              <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">Only contacts with recorded SMS consent are eligible.</p>
            </div>
            <PortalButton size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </PortalButton>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Campaign name</span>
              <input className={FIELD_CLASS} value={name} onChange={(event) => setName(event.target.value)} placeholder="Tour reminder — August" />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Message purpose</span>
                <PortalSelect
                  value={campaignType}
                  onChange={(value) => setCampaignType(value as LuxorTextCampaignType)}
                  options={[
                    { value: 'customer_care', label: 'Customer care' },
                    { value: 'transactional', label: 'Transactional' },
                    { value: 'tour', label: 'Tours' },
                    { value: 'event', label: 'Events' },
                    { value: 'payment', label: 'Payments' },
                    { value: 'invoice', label: 'Invoices' },
                    { value: 'elena', label: 'Elena draft' },
                  ]}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Lead status</span>
                <PortalSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All opted-in' },
                    ...statuses.map((status) => ({ value: status, label: status.replaceAll('_', ' ') })),
                  ]}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Event type</span>
                <PortalSelect
                  value={eventFilter}
                  onChange={setEventFilter}
                  options={[
                    { value: 'all', label: 'All event types' },
                    ...eventTypes.map((eventType) => ({ value: eventType, label: eventType })),
                  ]}
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Message</span>
              <textarea className={`${FIELD_CLASS} min-h-32 resize-y leading-6`} value={bodyTemplate} onChange={(event) => setBodyTemplate(event.target.value)} maxLength={480} />
              <span className="flex justify-between text-[10px] text-[color:var(--portal-muted)]">
                <span>Merge fields: [FirstName] [EventType] [EventDate] [TourDate] [TourTime]</span>
                <span className="font-mono">{bodyTemplate.length}/480 · {segmentsPerRecipient} segment{segmentsPerRecipient === 1 ? '' : 's'}</span>
              </span>
            </label>

            <div className="rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/[0.06] p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--portal-text)]"><Sparkles size={14} className="text-[#caa24c]" /> Draft with Elena</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input className={FIELD_CLASS} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Remind upcoming tour guests to confirm their time" />
                <PortalButton onClick={() => void askElena()} disabled={generating}>
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Draft
                </PortalButton>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Delivery</span>
                <PortalSelect
                  value={sendMode}
                  onChange={setSendMode}
                  options={[
                    { value: 'now', label: 'Queue now' },
                    { value: 'later', label: 'Schedule for later' },
                  ]}
                />
              </label>
              {sendMode === 'later' ? (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Local date and time</span>
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <PortalDatePicker value={scheduledDate} onChange={setScheduledDate} placeholder="Choose send date" />
                    <PortalSelect
                      value={scheduledTime}
                      onChange={setScheduledTime}
                      options={Array.from({ length: 13 }, (_, index) => {
                        const hour = index + 8
                        const value = `${String(hour).padStart(2, '0')}:00`
                        return { value, label: new Date(`2026-01-01T${value}:00`).toLocaleTimeString('en-US', { hour: 'numeric' }) }
                      })}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-[color:var(--portal-muted)]">
                <strong className="text-[color:var(--portal-text)]">{previewAudience.length}</strong> recipients · about <strong className="text-[color:var(--portal-text)]">{estimatedSegments}</strong> carrier segments
                <div className="mt-1">Worker safety cap: {dashboard.stats.dailySegmentLimit.toLocaleString()} segments per rolling 24 hours.</div>
              </div>
              <PortalButton variant="primary" onClick={openReview}><CheckCircle2 size={14} /> Review campaign</PortalButton>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 sm:p-6">
          <h3 className="flex items-center gap-2 text-base font-bold text-[color:var(--portal-text)]"><CalendarClock size={17} className="text-[#caa24c]" /> Recent campaigns</h3>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="flex min-h-40 items-center justify-center text-[color:var(--portal-muted)]"><Loader2 size={20} className="animate-spin" /></div>
            ) : dashboard.campaigns.length ? dashboard.campaigns.slice(0, 12).map((campaign) => (
              <article key={campaign.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[color:var(--portal-text)]">{campaign.name}</p>
                    <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{formatDateTime(campaign.scheduled_for)}</p>
                  </div>
                  <PortalStatusBadge status={campaign.status} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center font-mono text-[10px] text-[color:var(--portal-muted)]">
                  <span>{campaign.recipient_count}<small className="block font-sans">queued</small></span>
                  <span>{campaign.sent_count}<small className="block font-sans">sent</small></span>
                  <span>{campaign.delivered_count}<small className="block font-sans">delivered</small></span>
                  <span>{campaign.reply_count}<small className="block font-sans">replies</small></span>
                </div>
              </article>
            )) : (
              <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] p-8 text-center text-xs leading-5 text-[color:var(--portal-muted)]">No text campaigns have been created yet.</div>
            )}
          </div>
        </section>
      </div>

      {reviewing ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Review text campaign">
          <div className="w-full max-w-xl rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[color:var(--portal-text)]">Review before queueing</h3>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">This creates real delivery jobs. It does not bypass consent or daily limits.</p>
              </div>
              <button onClick={() => setReviewing(false)} aria-label="Close review" className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]"><X size={16} /></button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[color:var(--portal-soft)] p-3"><Users size={14} className="text-[#caa24c]" /><strong className="mt-2 block font-mono text-lg text-[color:var(--portal-text)]">{previewAudience.length}</strong><span className="text-[9px] uppercase text-[color:var(--portal-muted)]">Recipients</span></div>
                <div className="rounded-xl bg-[color:var(--portal-soft)] p-3"><MessageSquare size={14} className="text-[#caa24c]" /><strong className="mt-2 block font-mono text-lg text-[color:var(--portal-text)]">{estimatedSegments}</strong><span className="text-[9px] uppercase text-[color:var(--portal-muted)]">Segments</span></div>
                <div className="rounded-xl bg-[color:var(--portal-soft)] p-3"><Send size={14} className="text-[#caa24c]" /><strong className="mt-2 block text-sm text-[color:var(--portal-text)]">{sendMode === 'now' ? 'Now' : 'Later'}</strong><span className="text-[9px] uppercase text-[color:var(--portal-muted)]">Queue</span></div>
              </div>
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm leading-6 text-[color:var(--portal-text)]">{bodyTemplate}</div>
              {estimatedSegments > dashboard.stats.dailySegmentLimit ? (
                <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> This exceeds the daily safety cap. Remaining jobs will wait for a later worker run.
                </div>
              ) : null}
              <div className="flex justify-end gap-3">
                <PortalButton onClick={() => setReviewing(false)} disabled={saving}>Go back</PortalButton>
                <PortalButton variant="primary" onClick={() => void queueCampaign()} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Confirm and queue
                </PortalButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
