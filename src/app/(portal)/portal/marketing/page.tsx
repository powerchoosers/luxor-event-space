'use client'

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Mail,
  Plus,
  BarChart3,
  TrendingUp,
  MessageSquare,
  LayoutTemplate,
  Users,
  Phone,
  Calendar,
  Megaphone,
  PenSquare,
  FilePenLine,
  Clock3,
  Workflow,
  Menu,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalModal,
  PortalStatusBadge,
  PortalButton,
  PortalCloseButton,
  PortalTabTransition
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import dynamic from 'next/dynamic'

// Tab Component Imports (Lazy Loaded)
const MarketingOverviewTab = dynamic(() => import('./tabs/MarketingOverviewTab').then(m => m.MarketingOverviewTab), { ssr: false, loading: () => <MarketingOverviewSkeleton /> })
const AutomationsLibraryTab = dynamic(() => import('./tabs/AutomationsLibraryTab').then(m => m.AutomationsLibraryTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const MarketingActivityTab = dynamic(() => import('./tabs/MarketingActivityTab').then(m => m.MarketingActivityTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const MarketingTemplatesTab = dynamic(() => import('./tabs/MarketingTemplatesTab').then(m => m.MarketingTemplatesTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const LeadSourcesTab = dynamic(() => import('./tabs/LeadSourcesTab').then(m => m.LeadSourcesTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const EmailCampaignsTab = dynamic(() => import('./tabs/EmailCampaignsTab').then(m => m.EmailCampaignsTab), { ssr: false, loading: () => <MarketingCampaignSkeleton /> })
const TextCampaignsTab = dynamic(() => import('./tabs/TextCampaignsTab').then(m => m.TextCampaignsTab), { ssr: false, loading: () => <MarketingTextSkeleton /> })
const EmailBuilderTab = dynamic(() => import('./tabs/EmailBuilderTab').then(m => m.EmailBuilderTab), { ssr: false, loading: () => <MarketingBuilderSkeleton /> })
const ContactListsTab = dynamic(() => import('./tabs/ContactListsTab').then(m => m.ContactListsTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const CallCenterTab = dynamic(() => import('./tabs/CallCenterTab').then(m => m.CallCenterTab), { ssr: false, loading: () => <MarketingTableSkeleton /> })
const MarketingCalendarTab = dynamic(() => import('./tabs/MarketingCalendarTab').then(m => m.MarketingCalendarTab), { ssr: false, loading: () => <MarketingCalendarSkeleton /> })

import { EMAIL_TEMPLATES, type EmailTemplate } from './emailTemplates'
import { normalizeLuxorEventType, type LuxorInquiry, type LuxorInquiryStatus } from '@/lib/luxorInquiryTypes'

export type MarketingTab =
  | 'overview'
  | 'automations'
  | 'templates'
  | 'activity'
  | 'sources'
  | 'email-campaigns'
  | 'text-campaigns'
  | 'builder-automation'
  | 'contact-lists'
  | 'call-center'
  | 'calendar'

function isTransientFetchError(error: unknown) {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded-lg luxor-skeleton ${className}`} aria-hidden="true" />
}

function MarketingOverviewSkeleton() {
  return <div className="space-y-6" aria-label="Loading marketing overview"><div className="grid grid-cols-2 border-y border-[color:var(--portal-border)] xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="min-h-28 border-r border-[color:var(--portal-border)] p-4 last:border-r-0"><SkeletonBlock className="h-2.5 w-28" /><SkeletonBlock className="mt-3 h-7 w-16" /><SkeletonBlock className="mt-2 h-2.5 w-36 max-w-full" /></div>)}</div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]"><SkeletonBlock className="h-72 w-full rounded-2xl" /><SkeletonBlock className="h-72 w-full rounded-2xl" /></div><div className="grid gap-5 xl:grid-cols-2"><SkeletonBlock className="h-64 w-full rounded-2xl" /><SkeletonBlock className="h-64 w-full rounded-2xl" /></div></div>
}

function MarketingCampaignSkeleton() {
  return <div className="space-y-7" aria-label="Loading campaigns"><div className="grid border-y border-[color:var(--portal-border)] md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="min-h-24 p-5"><SkeletonBlock className="h-2.5 w-24" /><SkeletonBlock className="mt-2 h-6 w-20" /><SkeletonBlock className="mt-2 h-2.5 w-32" /></div>)}</div><div className="flex items-end justify-between gap-4"><div><SkeletonBlock className="h-7 w-44" /><SkeletonBlock className="mt-2 h-3 w-64 max-w-full" /></div><SkeletonBlock className="h-10 w-64 max-w-full" /></div><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item}><SkeletonBlock className="aspect-[4/5] w-full rounded-xl" /><SkeletonBlock className="mt-3 h-4 w-36" /><SkeletonBlock className="mt-2 h-2.5 w-48 max-w-full" /></div>)}</div></div>
}

function MarketingTableSkeleton() {
  return <div className="space-y-6" aria-label="Loading marketing records"><div className="h-28 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5"><SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="mt-3 h-3 w-72 max-w-full" /></div><div className="overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><div className="hidden border-b border-[color:var(--portal-border)] px-5 py-4 sm:grid sm:grid-cols-4 sm:gap-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-2.5 w-20" />)}</div>{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="flex min-h-16 items-center gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 last:border-0"><SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><SkeletonBlock className="h-3 w-40 max-w-full" /><SkeletonBlock className="mt-2 h-2.5 w-56 max-w-full" /></div><SkeletonBlock className="h-3 w-20" /></div>)}</div></div>
}

function MarketingTextSkeleton() {
  return <div className="space-y-7" aria-label="Loading text campaigns"><SkeletonBlock className="h-24 w-full rounded-2xl" /><div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(21rem,.85fr)]"><SkeletonBlock className="h-[32rem] w-full rounded-2xl" /><SkeletonBlock className="h-[32rem] w-full rounded-2xl" /></div></div>
}

function MarketingBuilderSkeleton() {
  return <div className="grid min-h-[36rem] gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-label="Loading email builder"><SkeletonBlock className="h-[36rem] w-full rounded-2xl" /><SkeletonBlock className="h-[36rem] w-full rounded-2xl" /></div>
}

function MarketingCalendarSkeleton() {
  return <div className="space-y-6" aria-label="Loading campaign calendar"><SkeletonBlock className="h-24 w-full rounded-2xl" /><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-32 w-full rounded-2xl" />)}</div><SkeletonBlock className="h-[36rem] w-full rounded-2xl" /></div>
}

const PRIMARY_MARKETING_TABS = [
  { id: 'overview', label: 'Overview', icon: <BarChart3 size={15} /> },
  { id: 'automations', label: 'Automations', icon: <Workflow size={15} /> },
  { id: 'contact-lists', label: 'Contacts & Lists', icon: <Users size={15} /> },
  { id: 'email-campaigns', label: 'Campaigns', icon: <Megaphone size={15} /> },
  { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={15} /> },
  { id: 'activity', label: 'Activity', icon: <Clock3 size={15} /> },
] as const satisfies readonly { id: MarketingTab; label: string; icon: React.ReactNode }[]

const LEGACY_MARKETING_TABS = [
  { id: 'sources', label: 'Lead Sources', icon: <TrendingUp size={15} /> },
  { id: 'email-campaigns', label: 'Campaigns', icon: <Mail size={15} /> },
  { id: 'text-campaigns', label: 'Text Campaigns', icon: <MessageSquare size={15} /> },
  { id: 'builder-automation', label: 'Email Builder', icon: <LayoutTemplate size={15} /> },
  { id: 'contact-lists', label: 'Contacts & Lists', icon: <Users size={15} /> },
  { id: 'call-center', label: 'Call Center', icon: <Phone size={15} /> },
  { id: 'calendar', label: 'Marketing Calendar', icon: <Calendar size={15} /> },
] as const satisfies readonly { id: MarketingTab; label: string; icon: React.ReactNode }[]

const MOBILE_MARKETING_VIEW_GROUPS = [
  {
    title: 'Performance & Activity',
    items: [
      { id: 'overview', label: 'Overview', description: 'Inquiry and campaign performance', icon: <BarChart3 size={16} /> },
      { id: 'activity', label: 'Activity', description: 'Recent email and campaign history', icon: <Clock3 size={16} /> },
    ],
  },
  {
    title: 'Audience & Workflows',
    items: [
      { id: 'automations', label: 'Automations', description: 'Follow-ups, confirmations, and reminders', icon: <Workflow size={16} /> },
      { id: 'contact-lists', label: 'Contacts & Lists', description: 'Manage contact records and audiences', icon: <Users size={16} /> },
      { id: 'sources', label: 'Lead Sources', description: 'See where new inquiries come from', icon: <TrendingUp size={16} /> },
      { id: 'call-center', label: 'Call Center', description: 'Review call activity and outcomes', icon: <Phone size={16} /> },
    ],
  },
  {
    title: 'Campaigns & Content',
    items: [
      { id: 'email-campaigns', label: 'Campaigns', description: 'Review email campaigns and schedules', icon: <Megaphone size={16} /> },
      { id: 'text-campaigns', label: 'Text Campaigns', description: 'Review text campaigns and delivery', icon: <MessageSquare size={16} /> },
      { id: 'builder-automation', label: 'Email Builder', description: 'Create and edit email content', icon: <PenSquare size={16} /> },
      { id: 'templates', label: 'Templates', description: 'Browse reusable email templates', icon: <LayoutTemplate size={16} /> },
      { id: 'calendar', label: 'Marketing Calendar', description: 'Review scheduled campaigns', icon: <Calendar size={16} /> },
    ],
  },
] as const satisfies readonly { title: string; items: readonly { id: MarketingTab; label: string; description: string; icon: React.ReactNode }[] }[]

function isMarketingTab(tab: string | null): tab is MarketingTab {
  return PRIMARY_MARKETING_TABS.some((item) => item.id === tab) || LEGACY_MARKETING_TABS.some((item) => item.id === tab)
}

function primaryTabFor(tab: MarketingTab): MarketingTab {
  if (tab === 'sources' || tab === 'call-center') return 'contact-lists'
  if (tab === 'text-campaigns' || tab === 'builder-automation' || tab === 'calendar') return 'email-campaigns'
  return tab
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
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
  const [builderCanvasOpen, setBuilderCanvasOpen] = useState(false)
  const [campaignModalOpen, setCampaignModalOpen] = useState(activeTab === 'builder-automation')
  const [campaignModalView, setCampaignModalView] = useState<'start' | 'templates'>('start')
  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false)
  const [mobileViewPickerOpen, setMobileViewPickerOpen] = useState(false)

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
  const loadInquiries = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoadingInquiries(true)
    try {
      const response = await fetch('/api/inquiries', { cache: 'no-store' })
      if (response.ok) {
        const data = await response.json()
        setInquiries(data)
      }
    } catch (err) {
      if (!isTransientFetchError(err)) console.error('Failed to load inquiries:', err)
    } finally {
      if (!options.silent) setLoadingInquiries(false)
    }
  }, [])

  // 2b. Fetch marketing subscriber lists
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([])
  const [loadingLists, setLoadingLists] = useState(true)

  const loadMarketingLists = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoadingLists(true)
    try {
      const res = await fetch('/api/marketing/lists', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setMarketingLists(data.lists || [])
      }
    } catch (err) {
      if (!isTransientFetchError(err)) console.error('Failed loading marketing lists:', err)
    } finally {
      if (!options.silent) setLoadingLists(false)
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
        const isJson = response.headers.get('content-type')?.includes('application/json')
        const payload = isJson ? await response.json() : { events: [] }
        if (!response.ok) throw new Error(payload.error || `Unable to load marketing events (${response.status}).`)
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

        const selectedCampaignId = selectedCampaignIdRef.current
        if (selectedCampaignId && newEvents.some((event) => event.campaign_id === selectedCampaignId)) {
          await refreshCampaignReport(selectedCampaignId, { silent: true })
        }
      } catch (activityError) {
        console.warn('Marketing activity watcher paused:', activityError)
      } finally {
        if (active) {
          timeoutId = setTimeout(() => pollMarketingActivity(false), 15_000)
        }
      }
    }

    void pollMarketingActivity(true)

    return () => {
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [notify, refreshCampaignReport])

  // Keep this workspace current without repeatedly touching Zoho. These API reads are
  // backed by Luxor's application data; we only revalidate while the page is visible,
  // and skip a refresh if one is already in flight.
  const refreshAllData = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    await Promise.all([
      loadCampaigns({ silent: true }),
      loadInquiries({ silent: true }),
      loadMarketingLists({ silent: true }),
    ])
  }, [loadCampaigns, loadInquiries, loadMarketingLists])

  useEffect(() => {
    let refreshing = false
    const refreshIfVisible = async () => {
      if (refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        await refreshAllData()
      } finally {
        refreshing = false
      }
    }
    const intervalId = window.setInterval(() => void refreshIfVisible(), 45_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshIfVisible()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [refreshAllData])

  // Email Builder specific triggers
  function openTemplateInBuilder(template: EmailTemplate) {
    localStorage.removeItem('luxor_email_builder_working_draft')
    setBuilderTemplate(template)
    setBuilderSession((current) => current + 1)
    setCampaignModalOpen(false)
    setBuilderCanvasOpen(true)
    router.push('/portal/marketing?tab=builder-automation')
  }

  function openBlankBuilder() {
    localStorage.removeItem('elena_active_campaign_draft')
    localStorage.removeItem('luxor_email_builder_working_draft')
    setBuilderTemplate(null)
    setBuilderSession((current) => current + 1)
    setCampaignModalOpen(false)
    setBuilderCanvasOpen(true)
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
      const eventType = normalizeLuxorEventType(contact.event_type)
      if (!eventType) throw new Error('Please enter an event type.')
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: typeof contact.full_name === 'string' ? contact.full_name.trim() : '',
          email: contact.email || '',
          phone: contact.phone || '',
          eventType,
          targetDate: contact.target_date || '',
          guestCount: contact.guest_count ?? '',
          budget: contact.budget || '',
          message: contact.message || '',
          source: contact.source || 'portal_manual',
          flow: 'manual_entry',
          pagePath: '/portal/marketing',
          marketingOptIn: Boolean(contact.marketing_opt_in),
        }),
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
      case 'automations':
        return {
          title: 'Automations',
          icon: <Workflow size={18} />,
          description: 'Manage saved follow-ups, confirmations, reminders, and marketing workflows in one place.'
        }
      case 'templates':
        return {
          title: 'Templates',
          icon: <LayoutTemplate size={18} />,
          description: 'Browse starter and saved email layouts.'
        }
      case 'activity':
        return {
          title: 'Activity',
          icon: <Clock3 size={18} />,
          description: 'Review recorded email campaign tracking events.'
        }
      case 'sources':
        return {
          title: 'Lead Sources',
          icon: <TrendingUp size={18} />,
          description: 'See which channels bring people into the Luxor booking journey.'
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
          icon: <MessageSquare size={18} />,
          description: 'Send thoughtful, consent-based updates to your audience.'
        }
      case 'builder-automation':
        return {
          title: 'Email Builder',
          icon: <LayoutTemplate size={18} />,
          description: 'Create a campaign, shape the message, and prepare it for delivery.'
        }
      case 'contact-lists':
        return {
          title: 'Contact Lists',
          icon: <Users size={18} />,
          description: 'Keep the right people organized for the next conversation.'
        }
      case 'call-center':
        return {
          title: 'Call Center',
          icon: <Phone size={18} />,
          description: 'Work the follow-up queue and turn inquiries into tours.'
        }
      case 'calendar':
        return {
          title: 'Marketing Calendar',
          icon: <Calendar size={18} />,
          description: 'See what is scheduled, what has shipped, and what needs a date.'
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
  const createCampaignButton = (
    <PortalButton variant="primary" onClick={() => { setCampaignModalView('start'); setCampaignModalOpen(true) }}>
      <Plus size={13} /> Create campaign
    </PortalButton>
  )

  if (activeTab === 'sources' || activeTab === 'text-campaigns' || activeTab === 'call-center') {
    headerActions = (
      createCampaignButton
    )
  } else if (activeTab === 'email-campaigns') {
    headerActions = (
      createCampaignButton
    )
  } else if (activeTab === 'builder-automation') {
    headerActions = (
      createCampaignButton
    )
  } else if (activeTab === 'contact-lists') {
    headerActions = (
      <PortalButton variant="primary" onClick={() => setIsAddContactModalOpen(true)}>
        <Plus size={13} /> Add Contact
      </PortalButton>
    )
  } else if (activeTab === 'calendar') {
    headerActions = (
      createCampaignButton
    )
  } else if (activeTab === 'automations') {
    headerActions = (
      <div className="flex items-center gap-2">
        <Link
          href="/portal/marketing/custom-workflows/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#caa24c] px-4 text-xs font-bold text-[#17130b] shadow-sm transition hover:bg-[#d6b45f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
        >
          <Plus size={14} /> Create Workflow
        </Link>
      </div>
    )
  }

  if (activeTab === 'contact-lists') {
    headerActions = <>{createCampaignButton}{headerActions}</>
  }

  return (
    <PortalPageFrame className={activeTab === 'contact-lists' || activeTab === 'builder-automation' || activeTab === 'call-center' ? 'h-full flex-1 min-h-0 overflow-clip' : ''}>
      <PortalModal isOpen={campaignModalOpen && !builderCanvasOpen} onClose={() => setCampaignModalOpen(false)} maxWidth="max-w-3xl" ariaLabel="Create a campaign">
        <div className="border-b border-[color:var(--portal-border)] px-6 py-5 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f]">Create a campaign</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">{campaignModalView === 'templates' ? 'Choose a Luxor template.' : 'Choose how you want to start.'}</h2>
              <p className="mt-2 max-w-lg text-sm leading-5 text-[color:var(--portal-muted)]">{campaignModalView === 'templates' ? 'Preview the available starting points, then open one in the editor.' : 'Pick a Luxor starting point, open a blank message, or have Elena prepare a first draft. You’ll edit and review everything before sending.'}</p>
            </div>
            <PortalCloseButton onClick={() => setCampaignModalOpen(false)} aria-label="Close campaign start dialog" />
          </div>
        </div>
        {campaignModalView === 'start' ? <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8">
          <button type="button" onClick={() => openTemplateInBuilder(EMAIL_TEMPLATES[0])} className="group rounded-xl border border-[#caa24c]/45 bg-[#caa24c]/10 p-4 text-left transition hover:-translate-y-0.5 hover:bg-[#caa24c]/15">
            <LayoutTemplate size={20} className="text-[#a8792f]" />
            <span className="mt-5 block text-sm font-bold text-[color:var(--portal-text)]">Use a Luxor template</span>
            <span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Start with a polished event layout.</span>
            <span className="mt-4 block text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f]">Start template →</span>
          </button>
          <button type="button" onClick={openBlankBuilder} className="group rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#caa24c]/45">
            <FilePenLine size={20} className="text-[#a8792f]" />
            <span className="mt-5 block text-sm font-bold text-[color:var(--portal-text)]">Start blank</span>
            <span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Build the message block by block.</span>
            <span className="mt-4 block text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f]">Open blank canvas →</span>
          </button>
          <button type="button" onClick={openBlankBuilder} className="group rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#caa24c]/45">
            <PenSquare size={20} className="text-[#a8792f]" />
            <span className="mt-5 block text-sm font-bold text-[color:var(--portal-text)]">Draft with Elena</span>
            <span className="mt-1 block text-xs leading-5 text-[color:var(--portal-muted)]">Describe the audience and purpose.</span>
            <span className="mt-4 block text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f]">Generate a draft →</span>
          </button>
        </div> : <div className="grid max-h-[min(32rem,60vh)] gap-3 overflow-y-auto p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
          {EMAIL_TEMPLATES.map((template) => (
            <button key={template.id} type="button" onClick={() => openTemplateInBuilder(template)} className="group overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-left transition hover:-translate-y-0.5 hover:border-[#caa24c]/50">
              <div className="h-1.5" style={{ backgroundColor: template.previewColor || '#caa24c' }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-[color:var(--portal-text)] group-hover:text-[#a8792f]">{decodeHtmlEntities(template.name)}</span>
                  <span className="text-[8px] font-black uppercase tracking-wider text-[#a8792f]">{template.category}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">{template.description}</p>
                <span className="mt-4 block text-[9px] font-black uppercase tracking-[0.14em] text-[#a8792f]">Use template →</span>
              </div>
            </button>
          ))}
        </div>}
        <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] px-6 py-4 sm:px-8">
          <span className="text-[10px] text-[color:var(--portal-muted)]">Need a different starting point?</span>
          {campaignModalView === 'templates' ? <button type="button" onClick={() => setCampaignModalView('start')} className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] hover:underline">Back to start options</button> : <button type="button" onClick={() => setCampaignModalView('templates')} className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a8792f] hover:underline">Browse all templates</button>}
        </div>
      </PortalModal>
      {!builderCanvasOpen ? (
        <div className="shrink-0 space-y-5 border-b border-[color:var(--portal-border)] pb-5">
          <PortalPageHeader
            icon={activeTab === 'overview' ? undefined : header.icon}
            title={activeTab === 'overview' ? 'Marketing' : header.title}
            description={activeTab === 'overview' ? 'Grow your audience, engage your contacts, and fill your event calendar.' : ('description' in header ? header.description : undefined)}
            actions={headerActions}
          />
        </div>
      ) : null}

      {!builderCanvasOpen ? (
        <>
        <div className="shrink-0 md:hidden">
          <MarketingMobileViewPicker activeTab={activeTab} open={mobileViewPickerOpen} onOpenChange={setMobileViewPickerOpen} onTabChange={handleTabChange} />
        </div>
        <div className="hidden shrink-0 md:block">
          <MarketingWorkspaceNav activeTab={activeTab} onTabChange={handleTabChange} />
          <MarketingSubnav activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        </>
      ) : null}

      <div className="mt-1 flex min-h-0 flex-grow flex-col overflow-hidden">
        <PortalTabTransition activeKey={activeTab} className="flex h-full min-h-0 flex-col overflow-hidden">
            {activeTab === 'overview' && (
              <MarketingOverviewTab
                onTabChange={handleTabChange}
                onCreateCampaign={() => { setCampaignModalView('start'); setCampaignModalOpen(true) }}
              />
            )}

            {activeTab === 'automations' && <AutomationsLibraryTab />}

            {activeTab === 'templates' && (
              <MarketingTemplatesTab
                onOpenTemplate={openTemplateInBuilder}
                onOpenBuilder={openBlankBuilder}
              />
            )}

            {activeTab === 'activity' && <MarketingActivityTab />}

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
                onCanvasChange={setBuilderCanvasOpen}
                openCanvas={builderCanvasOpen}
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

function MarketingWorkspaceNav({ activeTab, onTabChange }: { activeTab: MarketingTab; onTabChange: (tab: MarketingTab) => void }) {
  const selectedTab = primaryTabFor(activeTab)
  return (
    <nav aria-label="Marketing sections" className="min-w-0 overflow-x-auto portal-scrollbar pb-1">
      <div className="flex min-w-max items-center gap-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1">
        {PRIMARY_MARKETING_TABS.map((tab) => {
          const isActive = selectedTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 sm:px-4 sm:text-xs ${isActive ? 'bg-[#caa24c]/15 text-[#8c6424] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
            >
              {tab.icon}<span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MarketingMobileViewPicker({
  activeTab,
  open,
  onOpenChange,
  onTabChange,
}: {
  activeTab: MarketingTab
  open: boolean
  onOpenChange: (open: boolean) => void
  onTabChange: (tab: MarketingTab) => void
}) {
  const activeView = PRIMARY_MARKETING_TABS.find((item) => item.id === activeTab)
    ?? LEGACY_MARKETING_TABS.find((item) => item.id === activeTab)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onOpenChange, open])

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
      >
        <Menu size={18} className="shrink-0 text-[#a8792f]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Browse views</span>
          <span className="mt-0.5 block truncate text-sm font-bold">{activeView?.label ?? 'Overview'}</span>
        </span>
        <ChevronDown size={17} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" />
      </button>

      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onMouseDown={() => onOpenChange(false)}
            >
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="marketing-view-menu-title"
                className="flex max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
                initial={{ opacity: 0, y: 56, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.985 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-4">
                  <div>
                    <h2 id="marketing-view-menu-title" className="text-base font-bold text-[color:var(--portal-text)]">Browse views</h2>
                    <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Choose a marketing view.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close views menu"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-6 portal-scrollbar">
                  <nav aria-label="Marketing views" className="space-y-4">
                    {MOBILE_MARKETING_VIEW_GROUPS.map((group) => (
                      <section key={group.title}>
                        <h3 className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-faint)]">{group.title}</h3>
                        <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] divide-y divide-[color:var(--portal-border)]">
                          {group.items.map((item) => {
                            const selected = activeTab === item.id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                aria-current={selected ? 'page' : undefined}
                                onClick={() => {
                                  onTabChange(item.id)
                                  onOpenChange(false)
                                }}
                                className={`flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/45 ${selected ? 'bg-[#caa24c]/10 text-[#9a6d26] dark:text-[#e0bd67]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}
                              >
                                <span className="shrink-0">{item.icon}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold">{item.label}</span>
                                  <span className="mt-0.5 block text-[11px] text-[color:var(--portal-muted)]">{item.description}</span>
                                </span>
                                <ChevronRight size={16} className="shrink-0 text-[color:var(--portal-faint)]" aria-hidden="true" />
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </nav>
                </div>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  )
}

function MarketingSubnav({ activeTab, onTabChange }: { activeTab: MarketingTab; onTabChange: (tab: MarketingTab) => void }) {
  const root = primaryTabFor(activeTab)
  const items = root === 'contact-lists'
    ? LEGACY_MARKETING_TABS.filter((tab) => tab.id === 'sources' || tab.id === 'call-center')
    : root === 'email-campaigns'
      ? LEGACY_MARKETING_TABS.filter((tab) => tab.id === 'text-campaigns' || tab.id === 'builder-automation' || tab.id === 'calendar')
      : []

  if (!items.length) return null
  return (
    <nav aria-label={root === 'contact-lists' ? 'Contacts tools' : 'Campaign tools'} className="mt-2 min-w-0 overflow-x-auto portal-scrollbar">
      <div className="flex min-w-max items-center gap-1">
        {items.map((tab) => (
          <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${activeTab === tab.id ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}>
            {tab.icon}<span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function CampaignReportModal({ detail, onClose }: { detail: CampaignDetail | null; onClose: () => void }) {
  if (!detail) return null

  const { campaign, recipients, events } = detail
  const engaged = recipients.filter((recipient) => recipient.open_count > 0 || recipient.click_count > 0).length
  const campaignLinks = extractAnchorLinks(campaign.html_body || '')

  return (
    <PortalModal isOpen={!!detail} onClose={onClose} maxWidth="max-w-5xl font-sans">
      <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Campaign Report</p>
          <h3 className="mt-1 truncate text-lg font-bold text-[color:var(--portal-text)]">{decodeHtmlEntities(campaign.name)}</h3>
          <p className="mt-1 truncate text-xs text-[color:var(--portal-muted)]">{decodeHtmlEntities(campaign.subject)}</p>
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
                <a href={link.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[10px] text-[#b8924a] underline underline-offset-2">
                  {link.url}
                </a>
              </div>
            )) : <p className="text-xs text-[color:var(--portal-muted)]">No clickable links were found.</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Recipients</h4>
              <span className="text-[10px] text-[color:var(--portal-muted)] tabular-nums font-semibold">{recipients.length} total</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50">
              <div className="max-h-96 overflow-y-auto portal-scrollbar">
                {recipients.map((recipient) => (
                  <div key={recipient.id} className="grid grid-cols-12 gap-3 border-b border-[color:var(--portal-border)]/60 px-4 py-3 last:border-b-0">
                    <div className="col-span-6 min-w-0">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{recipient.name || recipient.email}</p>
                      <p className="truncate text-[10px] text-[color:var(--portal-muted)]">{recipient.email}</p>
                    </div>
                    <div className="col-span-2">
                      <PortalStatusBadge status={recipient.status} />
                    </div>
                    <div className="col-span-2 text-right tabular-nums font-semibold text-xs text-[color:var(--portal-muted)]">{recipient.open_count} opens</div>
                    <div className="col-span-2 text-right tabular-nums font-semibold text-xs text-[color:var(--portal-muted)]">{recipient.click_count} clicks</div>
                    {recipient.last_error ? <p className="col-span-12 text-[10px] text-rose-500">{recipient.last_error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">Recent Events</h4>
              <span className="text-[10px] text-[color:var(--portal-muted)] tabular-nums font-semibold">{events.length}</span>
            </div>
            <div className="space-y-3">
              {events.length ? events.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                      event.event_type === 'click'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                        : event.event_type === 'unsubscribe'
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20'
                        : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                    }`}>
                      {event.event_type}
                    </span>
                    <span className="text-[9px] text-[color:var(--portal-muted)] tabular-nums">{new Date(event.created_at).toLocaleTimeString()}</span>
                  </div>
                  {event.url ? <p className="mt-2 break-all text-[9px] leading-4 text-[color:var(--portal-muted)]">{event.url}</p> : null}
                  <p className="mt-2 text-[9px] text-[color:var(--portal-muted)]">{event.device_type || 'unknown device'}</p>
                </div>
              )) : (
                <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-5 text-xs leading-5 text-[color:var(--portal-muted)]">
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
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
      <p className="mt-2 tabular-nums text-lg font-extrabold tracking-tight text-[color:var(--portal-text)]">{value}</p>
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
