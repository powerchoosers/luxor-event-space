'use client'

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Mail,
  RefreshCw,
  Plus,
  BarChart3,
  TrendingUp,
  MessageSquare,
  LayoutTemplate,
  Users,
  Phone,
  Calendar,
  Megaphone
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalModal,
  PortalStatusBadge,
  PortalButton,
  PortalCloseButton,
  PortalAnimatedTabs,
  PortalTabTransition
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import dynamic from 'next/dynamic'

// Tab Component Imports (Lazy Loaded)
const MarketingOverviewTab = dynamic(() => import('./tabs/MarketingOverviewTab').then(m => m.MarketingOverviewTab), { ssr: false })
const LeadSourcesTab = dynamic(() => import('./tabs/LeadSourcesTab').then(m => m.LeadSourcesTab), { ssr: false })
const EmailCampaignsTab = dynamic(() => import('./tabs/EmailCampaignsTab').then(m => m.EmailCampaignsTab), { ssr: false })
const TextCampaignsTab = dynamic(() => import('./tabs/TextCampaignsTab').then(m => m.TextCampaignsTab), { ssr: false })
const EmailBuilderTab = dynamic(() => import('./tabs/EmailBuilderTab').then(m => m.EmailBuilderTab), { ssr: false })
const ContactListsTab = dynamic(() => import('./tabs/ContactListsTab').then(m => m.ContactListsTab), { ssr: false })
const CallCenterTab = dynamic(() => import('./tabs/CallCenterTab').then(m => m.CallCenterTab), { ssr: false })
const MarketingCalendarTab = dynamic(() => import('./tabs/MarketingCalendarTab').then(m => m.MarketingCalendarTab), { ssr: false })

import type { EmailTemplate } from './emailTemplates'
import type { LuxorInquiry, LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'

export type MarketingTab =
  | 'overview'
  | 'sources'
  | 'email-campaigns'
  | 'text-campaigns'
  | 'builder-automation'
  | 'contact-lists'
  | 'call-center'
  | 'calendar'

const MARKETING_TABS = [
  { id: 'overview', label: 'Marketing Overview', icon: <BarChart3 size={15} /> },
  { id: 'sources', label: 'Lead Sources', icon: <TrendingUp size={15} /> },
  { id: 'email-campaigns', label: 'Email Campaigns', icon: <Megaphone size={15} /> },
  { id: 'text-campaigns', label: 'Text Campaigns', icon: <MessageSquare size={15} /> },
  { id: 'builder-automation', label: 'Email Builder', icon: <LayoutTemplate size={15} /> },
  { id: 'contact-lists', label: 'Contact Lists', icon: <Users size={15} /> },
  { id: 'call-center', label: 'Call Center', icon: <Phone size={15} /> },
  { id: 'calendar', label: 'Marketing Calendar', icon: <Calendar size={15} /> },
] as const satisfies readonly { id: MarketingTab; label: string; icon: React.ReactNode }[]

function isMarketingTab(tab: string | null): tab is MarketingTab {
  return MARKETING_TABS.some((item) => item.id === tab)
}

export type Campaign = {
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
  unsubscribe_count: number
  open_rate: number
  click_rate: number
  html_body?: string
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

export type MarketingActivityEvent = CampaignEvent & {
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

export interface MarketingListMember {
  id?: string
  created_at?: string
  email: string
  full_name: string | null
  source: string
  list_id: string
  metadata?: Record<string, unknown>
}

export interface MarketingList {
  id: string
  name: string
  description: string | null
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
  memberCount: number
  members: MarketingListMember[]
}

export default function MarketingPage() {
  return (
    <Suspense fallback={
      <PortalPageFrame>
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-5">
            <div className="space-y-2">
              <div className="h-6 w-48 rounded-lg luxor-skeleton" />
              <div className="h-3 w-80 rounded luxor-skeleton" />
            </div>
            <div className="h-9 w-32 rounded-xl luxor-skeleton" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 space-y-2">
                <div className="h-2.5 w-16 rounded luxor-skeleton" />
                <div className="h-6 w-20 rounded luxor-skeleton" />
                <div className="h-2 w-24 rounded luxor-skeleton" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="h-64 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 lg:col-span-2 luxor-skeleton" />
            <div className="h-64 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 luxor-skeleton" />
          </div>
        </div>
      </PortalPageFrame>
    }>
      <MarketingPageContent />
    </Suspense>
  )
}

function MarketingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { notify } = useToast()

  // Tab & Filter States derived from URL
  const tabParam = searchParams.get('tab')
  const activeTab: MarketingTab = isMarketingTab(tabParam) ? tabParam : 'overview'
  const initialSourceFilter = searchParams.get('source') || ''

  // Campaign & Inquiries lists database states
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])
  const [marketingActivity, setMarketingActivity] = useState<MarketingActivityEvent[]>([])
  
  // Loaders
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [loadingInquiries, setLoadingInquiries] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Queue & Report States
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<CampaignDetail | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [builderTemplate, setBuilderTemplate] = useState<EmailTemplate | null>(null)
  const [builderSession, setBuilderSession] = useState(0)
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false)

  // Watchers & References
  const latestActivityAtRef = useRef<string | null>(null)
  const seenActivityIdsRef = useRef<Set<string>>(new Set())
  const selectedCampaignIdRef = useRef<string | null>(null)

  // 1. Fetch campaigns from DB
  const loadCampaigns = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoadingCampaigns(true)
    setError(null)
    try {
      const response = await fetch('/api/marketing/campaigns', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load campaigns.')
      setCampaigns(payload.campaigns || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load campaigns.')
    } finally {
      if (!options.silent) setLoadingCampaigns(false)
    }
  }, [])

  // 2. Fetch inquiries from DB
  const loadInquiries = useCallback(async () => {
    setLoadingInquiries(true)
    try {
      const response = await fetch('/api/inquiries', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setInquiries(data)
      }
    } catch (err) {
      console.error('Failed to load inquiries:', err)
    } finally {
      setLoadingInquiries(false)
    }
  }, [])

  // 2b. Fetch marketing subscriber lists
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([])
  const [loadingLists, setLoadingLists] = useState(true)

  const loadMarketingLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const res = await fetch('/api/marketing/lists', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setMarketingLists(data.lists || [])
      }
    } catch (err) {
      console.error('Failed loading marketing lists:', err)
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadCampaigns()
      void loadInquiries()
      void loadMarketingLists()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loadCampaigns, loadInquiries, loadMarketingLists])

  // Watchers for Elena AI drafts and changes
  useEffect(() => {
    const handleCampaignPublished = () => {
      loadCampaigns()
    }

    const handleDraftLoaded = () => {
      router.push('/portal/marketing?tab=builder-automation')
      setBuilderTemplate(null)
    }

    window.addEventListener('elena-campaign-published', handleCampaignPublished)
    window.addEventListener('elena-campaign-draft-loaded', handleDraftLoaded)

    return () => {
      window.removeEventListener('elena-campaign-published', handleCampaignPublished)
      window.removeEventListener('elena-campaign-draft-loaded', handleDraftLoaded)
    }
  }, [loadCampaigns, router])

  useEffect(() => {
    selectedCampaignIdRef.current = selectedDetail?.campaign.id ?? null
  }, [selectedDetail?.campaign.id])

  // 3. Status Action: Cancel Campaign
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

  // 4. Status Action: Send Campaign Now
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

  // 5. Fetch Campaign Report Detail
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

  // 6. Live Marketing Event watcher
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
          setMarketingActivity(events)
          return
        }

        const newEvents = events
          .filter((event) => !seenActivityIdsRef.current.has(event.id))
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        if (!newEvents.length) return

        setMarketingActivity((current) => mergeMarketingActivity(newEvents, current))

        newEvents.forEach((event) => {
          seenActivityIdsRef.current.add(event.id)
          const recipient = event.recipient_name || event.recipient_email || 'Unknown recipient'
          const campaign = event.campaign_name || event.campaign_subject || 'Unknown campaign'
          const title = event.event_type === 'click'
            ? 'Marketing link clicked'
            : event.event_type === 'unsubscribe'
              ? 'Marketing recipient unsubscribed'
              : 'Marketing email opened'
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

  // Email Builder specific triggers
  function openTemplateInBuilder(template: EmailTemplate) {
    localStorage.removeItem('luxor_email_builder_working_draft')
    setBuilderTemplate(template)
    setBuilderSession((current) => current + 1)
    router.push('/portal/marketing?tab=builder-automation')
  }

  function openBlankBuilder() {
    localStorage.removeItem('elena_active_campaign_draft')
    localStorage.removeItem('luxor_email_builder_working_draft')
    setBuilderTemplate(null)
    setBuilderSession((current) => current + 1)
    router.push('/portal/marketing?tab=builder-automation')
  }

  // Database updates triggered by Call Center Outcome Logging
  async function handleUpdateInquiryStatus(id: string, status: LuxorInquiryStatus, updates: Partial<LuxorInquiry> = {}) {
    try {
      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, ...updates })
      })
      if (!res.ok) {
        const payload = await res.json()
        throw new Error(payload.error || 'Failed to update lead status.')
      }
      await loadInquiries()
    } catch (err) {
      console.error('Failed updating lead status:', err)
      throw err
    }
  }

  async function handleMarkDealLost(id: string, reason: string) {
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/deal-lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, cancelTour: true }),
      })
      const payload = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(payload.error || 'Failed to close this lead safely.')
      await loadInquiries()
    } catch (err) {
      console.error('Failed marking lead deal lost:', err)
      throw err
    }
  }

  async function handleAddNote(inquiryId: string, content: string) {
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId,
          content,
          noteType: 'general',
          author: 'Portal Owner'
        })
      })
      if (!res.ok) {
        const payload = await res.json()
        throw new Error(payload.error || 'Failed to save note.')
      }
    } catch (err) {
      console.error('Failed saving call note:', err)
      throw err
    }
  }

  async function handleAddContact(contact: Partial<LuxorInquiry>) {
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact)
      })
      if (!res.ok) {
        const payload = await res.json()
        throw new Error(payload.error || 'Failed to create contact.')
      }
      await loadInquiries()
    } catch (err) {
      console.error('Failed creating contact:', err)
      throw err
    }
  }

  // Router Helpers
  const handleTabChange = (tab: MarketingTab) => {
    router.push(`/portal/marketing?tab=${tab}`)
  }

  const handleFilterSource = (source: string) => {
    router.push(`/portal/marketing?tab=contact-lists&source=${encodeURIComponent(source)}`)
  }

  // Derive page headers
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'sources':
        return {
          title: 'Lead Sources',
          icon: <TrendingUp size={18} />
        }
      case 'email-campaigns':
        return {
          title: 'Email Campaigns',
          icon: <Mail size={18} />,
          description: 'Create, send, and track campaigns for your audience.'
        }
      case 'text-campaigns':
        return {
          title: 'Text Campaigns',
          icon: <MessageSquare size={18} />
        }
      case 'builder-automation':
        return {
          title: 'Email Builder',
          icon: <LayoutTemplate size={18} />
        }
      case 'contact-lists':
        return {
          title: 'Contact Lists',
          icon: <Users size={18} />
        }
      case 'call-center':
        return {
          title: 'Call Center',
          icon: <Phone size={18} />
        }
      case 'calendar':
        return {
          title: 'Marketing Calendar',
          icon: <Calendar size={18} />
        }
      case 'overview':
      default:
        return {
          title: 'Marketing Overview',
          icon: <Megaphone size={18} />
        }
    }
  }

  const header = getHeaderInfo()

  let headerActions: React.ReactNode
  if (activeTab === 'email-campaigns') {
    headerActions = (
      <>
        <PortalButton onClick={() => loadCampaigns()} disabled={loadingCampaigns}>
          <RefreshCw size={13} className={loadingCampaigns ? 'animate-spin' : ''} /> Refresh
        </PortalButton>
        <PortalButton variant="primary" onClick={openBlankBuilder}>
          <Plus size={13} /> Create Campaign
        </PortalButton>
      </>
    )
  } else if (activeTab === 'builder-automation') {
    headerActions = (
      <PortalButton variant="primary" onClick={openBlankBuilder}>
        <Plus size={13} /> New Email
      </PortalButton>
    )
  } else if (activeTab === 'contact-lists') {
    headerActions = (
      <PortalButton variant="primary" onClick={() => setIsAddContactModalOpen(true)}>
        <Plus size={13} /> Add Contact
      </PortalButton>
    )
  } else if (activeTab === 'calendar') {
    headerActions = (
      <PortalButton variant="primary" onClick={openBlankBuilder}>
        <Plus size={13} /> Create Campaign
      </PortalButton>
    )
  }

  return (
    <PortalPageFrame className={activeTab === 'contact-lists' || activeTab === 'builder-automation' || activeTab === 'call-center' ? 'h-full flex-1 min-h-0 overflow-clip' : ''}>
      <PortalPageHeader
        icon={header.icon}
        title={header.title}
        description={'description' in header ? header.description : undefined}
        actions={headerActions}
      />

      {activeTab !== 'email-campaigns' ? (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-[color:var(--portal-border)] pb-2 portal-scrollbar">
          <PortalAnimatedTabs
            tabs={MARKETING_TABS}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            ariaLabel="Marketing sections"
          />
        </div>
      ) : null}

      <div className="mt-1 flex min-h-0 flex-grow flex-col overflow-hidden">
        <PortalTabTransition activeKey={activeTab} className="flex h-full min-h-0 flex-col overflow-hidden">
            {activeTab === 'overview' && (
              <MarketingOverviewTab
                inquiries={inquiries}
                campaigns={campaigns}
                activityEvents={marketingActivity}
                marketingLists={marketingLists}
                loading={loadingCampaigns || loadingInquiries || loadingLists}
                onTabChange={handleTabChange}
                onAddContactClick={() => router.push('/portal/marketing?tab=contact-lists&add=true')}
              />
            )}

            {activeTab === 'sources' && (
              <LeadSourcesTab
                inquiries={inquiries}
                loading={loadingInquiries}
                onFilterSource={handleFilterSource}
              />
            )}

            {activeTab === 'email-campaigns' && (
              <EmailCampaignsTab
                campaigns={campaigns}
                loading={loadingCampaigns}
                error={error}
                busyId={busyId}
                detailLoadingId={detailLoadingId}
                onReport={openCampaignReport}
                onCancel={cancelCampaign}
                onSendNow={sendCampaignNow}
                onChanged={() => loadCampaigns()}
              />
            )}

            {activeTab === 'text-campaigns' && (
              <TextCampaignsTab />
            )}

            {activeTab === 'builder-automation' && (
              <EmailBuilderTab
                key={builderSession}
                initialTemplate={builderTemplate}
                campaigns={campaigns}
                activityEvents={marketingActivity}
                onOpenBlankBuilder={openBlankBuilder}
                onOpenTemplateInBuilder={openTemplateInBuilder}
              />
            )}

            {activeTab === 'contact-lists' && (
              <ContactListsTab
                inquiries={inquiries}
                marketingLists={marketingLists}
                loading={loadingInquiries || loadingLists}
                initialSourceFilter={initialSourceFilter}
                onAddContact={handleAddContact}
                onChanged={loadMarketingLists}
                isAddModalOpen={isAddContactModalOpen}
                onAddModalOpenChange={setIsAddContactModalOpen}
              />
            )}

            {activeTab === 'call-center' && (
              <CallCenterTab
                inquiries={inquiries}
                loading={loadingInquiries}
                onUpdateInquiryStatus={handleUpdateInquiryStatus}
                onMarkDealLost={handleMarkDealLost}
                onAddNote={handleAddNote}
              />
            )}

            {activeTab === 'calendar' && (
              <MarketingCalendarTab
                campaigns={campaigns}
                loading={loadingCampaigns}
              />
            )}
        </PortalTabTransition>
      </div>

      <CampaignReportModal detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
    </PortalPageFrame>
  )
}

function CampaignReportModal({ detail, onClose }: { detail: CampaignDetail | null; onClose: () => void }) {
  if (!detail) return null

  const { campaign, recipients, events } = detail
  const engaged = recipients.filter((recipient) => recipient.open_count > 0 || recipient.click_count > 0).length
  const campaignLinks = extractAnchorLinks(campaign.html_body || '')

  return (
    <PortalModal isOpen={!!detail} onClose={onClose} maxWidth="max-w-5xl font-sans">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Campaign Report</p>
          <h3 className="mt-1 truncate text-lg font-bold text-white">{decodeHtmlEntities(campaign.name)}</h3>
          <p className="mt-1 truncate text-xs text-zinc-500">{decodeHtmlEntities(campaign.subject)}</p>
        </div>
        <PortalCloseButton onClick={onClose} aria-label="Close report" />
      </div>

      <div className="portal-scrollbar overflow-y-auto p-6 max-h-[500px]">
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
          <ReportMetric label="Recipients" value={campaign.recipient_count.toLocaleString()} />
          <ReportMetric label="Sent" value={campaign.sent_count.toLocaleString()} />
          <ReportMetric label="Engaged" value={engaged.toLocaleString()} />
          <ReportMetric label="Unsubscribes" value={campaign.unsubscribe_count.toLocaleString()} />
          <ReportMetric label="Open Rate" value={`${campaign.open_rate}%`} />
          <ReportMetric label="Click Rate" value={`${campaign.click_rate}%`} />
        </div>

        <div className="mb-6 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-[color:var(--portal-muted)]">Links in this email</h4>
              <p className="mt-1 text-xs text-[color:var(--portal-muted)]">
                {campaign.queued_count > 0
                  ? 'This campaign still has queued recipients. Cancel it before changing and rescheduling the email.'
                  : 'Delivered emails cannot be rewritten, but these destinations remain visible for review.'}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {campaignLinks.length ? campaignLinks.map((link, index) => (
              <div key={`${link.url}-${index}`} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5">
                <p className="text-xs font-semibold text-[color:var(--portal-text)]">{link.label || `Link ${index + 1}`}</p>
                <a href={link.url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[10px] text-[#b8924a] underline underline-offset-2">
                  {link.url}
                </a>
              </div>
            )) : <p className="text-xs text-[color:var(--portal-muted)]">No clickable links were found.</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-650">Recipients</h4>
              <span className="text-[10px] text-zinc-600 font-mono">{recipients.length} total</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/20">
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
                    <div className="col-span-2 text-right font-mono text-xs text-zinc-400">{recipient.open_count} opens</div>
                    <div className="col-span-2 text-right font-mono text-xs text-zinc-400">{recipient.click_count} clicks</div>
                    {recipient.last_error ? <p className="col-span-12 text-[10px] text-rose-300">{recipient.last_error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-650">Recent Events</h4>
              <span className="text-[10px] text-zinc-650 font-mono">{events.length}</span>
            </div>
            <div className="space-y-3">
              {events.length ? events.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-xl border border-zinc-900 bg-zinc-950/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                      event.event_type === 'click'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : event.event_type === 'unsubscribe'
                        ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                    }`}>
                      {event.event_type}
                    </span>
                    <span className="text-[9px] text-zinc-600 font-mono">{new Date(event.created_at).toLocaleTimeString()}</span>
                  </div>
                  {event.url ? <p className="mt-2 break-all text-[9px] leading-4 text-zinc-500">{event.url}</p> : null}
                  <p className="mt-2 text-[9px] text-zinc-650 font-mono">{event.device_type || 'unknown device'}</p>
                </div>
              )) : (
                <div className="rounded-xl border border-zinc-900 bg-zinc-950/20 p-5 text-xs leading-5 text-zinc-600">
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
    <div className="rounded-xl border border-zinc-900 bg-zinc-950/20 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-550">{label}</p>
      <p className="mt-2 font-mono text-base font-bold text-white">{value}</p>
    </div>
  )
}

function mergeMarketingActivity(
  incoming: MarketingActivityEvent[],
  current: MarketingActivityEvent[],
) {
  const byId = new Map<string, MarketingActivityEvent>()
  ;[...incoming, ...current].forEach((event) => byId.set(event.id, event))
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 25)
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

function extractAnchorLinks(html: string) {
  const links: { label: string; url: string }[] = []
  const seen = new Set<string>()
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(anchorPattern)) {
    const url = decodeHtmlEntities(match[1] || '').trim()
    if (!url || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:') || seen.has(url)) continue
    seen.add(url)
    const label = decodeHtmlEntities((match[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    links.push({ label, url })
  }
  return links
}
