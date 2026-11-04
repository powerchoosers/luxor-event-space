'use client'

import {
  Bell,
  Clock,
  Calendar,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Users,
  CalendarDays,
  DollarSign,
  Handshake,
  Phone,
  Megaphone,
  MoreHorizontal,
  SlidersHorizontal,
  ArrowUpRight,
  Loader2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, Suspense } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { RouteTransition } from '@/components/RouteTransition'
import type { LuxorPortalSession } from '@/lib/luxorPortalAuth'
import type { PortalPermission, PortalRole } from '@/lib/luxorPortalAccess'
import Image from 'next/image'
import { ToastProvider, useToast } from '@/components/portal/ToastProvider'
import { PortalCloseButton, PortalContactAvatar } from '@/components/portal/PortalUI'
import { PortalViewportDiagnostics } from '@/components/portal/PortalViewportDiagnostics'
import { PortalPhoneButton, PortalVoiceProvider } from '@/components/portal/PortalVoiceProvider'
import { usePortalNotifications } from '@/hooks/usePortalNotifications'
import type { EmailComposeDraft } from '@/components/portal/EmailComposeDrawer'
import { getRecentLeads, getRecentLeadsServerSnapshot, subscribeRecentLeads, saveRecentLead, clearRecentLeads, type RecentLeadItem } from '@/lib/luxorRecentLeads'

type PortalUserProfile = {
  displayName: string
  email: string
  avatarUrl: string | null
}

type PortalTheme = 'light' | 'dark'
type NextBestActionKind = 'reply' | 'tour' | 'proposal' | 'followup' | 'review'
type NextBestActionMode = 'compose' | 'open'

function PortalHeaderDivider() {
  const frameRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const line = frame?.firstElementChild as HTMLSpanElement | null
    if (!frame || !line) return

    // A CSS pixel can cover fractional screen pixels at Windows display scaling
    // or browser zoom. Draw one screen pixel, snapped to the same pixel grid.
    const alignLine = () => {
      const rect = frame.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ratio = Number(window.devicePixelRatio.toFixed(6)) || 1
      const x = Math.round(rect.left * ratio) / ratio - rect.left
      const y = Math.round(rect.top * ratio) / ratio - rect.top
      line.style.width = `${1 / ratio}px`
      line.style.height = `${Math.round(rect.height * ratio) / ratio}px`
      line.style.transform = 'none'
      line.style.left = `${x}px`
      line.style.top = `${y}px`
    }

    alignLine()
    const observer = new ResizeObserver(alignLine)
    observer.observe(frame)
    const header = frame.closest('header')
    if (header) observer.observe(header)
    let resolutionQuery: MediaQueryList
    const watchResolution = () => {
      resolutionQuery?.removeEventListener('change', watchResolution)
      alignLine()
      resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      resolutionQuery.addEventListener('change', watchResolution)
    }
    watchResolution()
    window.addEventListener('resize', alignLine)
    return () => {
      observer.disconnect()
      resolutionQuery.removeEventListener('change', watchResolution)
      window.removeEventListener('resize', alignLine)
    }
  }, [])

  return (
    <span ref={frameRef} data-portal-header-divider className="relative mx-0.5 h-5 w-px shrink-0" aria-hidden="true">
      <span className="absolute left-0 top-0 h-full w-px bg-[color:var(--portal-border)]" />
    </span>
  )
}

function NextBestActionIcon({ kind }: { kind: NextBestActionKind }) {
  const Icon = kind === 'reply'
    ? Mail
    : kind === 'tour'
      ? Calendar
      : kind === 'proposal'
        ? FileText
        : kind === 'followup'
          ? Handshake
          : LayoutDashboard

  return <Icon size={14} aria-hidden="true" />
}

function waitingLabel(value: string | undefined) {
  if (!value) return 'waiting for action'
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 1) return 'just arrived'
  if (elapsedMinutes < 60) return `waiting ${elapsedMinutes}m`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `waiting ${elapsedHours}h`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return `waiting ${elapsedDays}d`
}

function persistPortalThemeCookie(theme: PortalTheme) {
  document.cookie = `luxor-portal-theme=${theme}; path=/; max-age=31536000; samesite=lax`
}

function persistPortalSidebarCookie(collapsed: boolean) {
  document.cookie = `luxor-portal-sidebar=${collapsed ? 'compact' : 'expanded'}; path=/; max-age=31536000; samesite=lax`
}

function canScrollVertically(element: HTMLElement, deltaY: number) {
  if (deltaY === 0) return false
  const style = window.getComputedStyle(element)
  if (!['auto', 'overlay', 'scroll'].includes(style.overflowY)) return false

  const maximumScrollTop = element.scrollHeight - element.clientHeight
  if (maximumScrollTop <= 0) return false
  return deltaY < 0 ? element.scrollTop > 0 : element.scrollTop < maximumScrollTop
}

function hasNativeVerticalScrollPath(target: HTMLElement, deltaY: number) {
  let current: HTMLElement | null = target
  while (current && current !== document.body) {
    if (canScrollVertically(current, deltaY)) return true
    current = current.parentElement
  }
  return false
}

const EmailComposeDrawer = dynamic(
  () => import('@/components/portal/EmailComposeDrawer').then((mod) => mod.EmailComposeDrawer),
  { ssr: false }
)

const NewLeadDrawer = dynamic(
  () => import('@/components/portal/NewLeadDrawer').then((mod) => mod.NewLeadDrawer),
  { ssr: false }
)

const LuxorDraggableTextModal = dynamic(
  () => import('@/components/portal/LuxorDraggableTextModal').then((mod) => mod.LuxorDraggableTextModal),
  { ssr: false }
)

const PortalNotificationModal = dynamic(
  () => import('@/components/portal/PortalNotificationModal').then((mod) => mod.PortalNotificationModal),
  { ssr: false }
)

const PortalElenaChat = dynamic(
  () => import('@/components/portal/PortalElenaChat').then((mod) => mod.PortalElenaChat),
  {
    ssr: false,
    loading: () => (
      <aside
        aria-hidden="true"
        className="portal-elena-chat-panel pointer-events-none fixed right-0 top-0 z-50 flex h-full w-full translate-x-full flex-col border-l-0 border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] opacity-0 shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)]"
      />
    ),
  }
)

const navItems = [
  { href: '/portal', icon: <LayoutDashboard size={18} />, label: 'Overview', permission: 'overview' },
  { href: '/portal/leads', icon: <Users size={18} />, label: 'Leads & Clients', permission: 'leads' },
  { href: '/portal/planner', icon: <CalendarDays size={18} />, label: 'Planner', permission: 'planner' },
  { href: '/portal/calls', icon: <Phone size={18} />, label: 'Phone', permission: 'calls' },
  { href: '/portal/emails', icon: <Mail size={18} />, label: 'Emails', permission: 'emails' },
  { href: '/portal/messages', icon: <MessageSquare size={18} />, label: 'Text', permission: 'messages' },
  { href: '/portal/calendar', icon: <Calendar size={18} />, label: 'Calendar', permission: 'calendar' },
  { href: '/portal/finances', icon: <DollarSign size={18} />, label: 'Finances', permission: 'finances' },
  { href: '/portal/operations', icon: <SlidersHorizontal size={18} />, label: 'Operations', permission: 'operations' },
  { href: '/portal/marketing', icon: <Megaphone size={18} />, label: 'Marketing', permission: 'marketing' },
  { href: '/portal/reports', icon: <FileText size={18} />, label: 'Reports', permission: 'reports' },
]

const mobilePrimaryNavItems = [
  { href: '/portal', icon: <LayoutDashboard size={19} />, label: 'Home' },
  { href: '/portal/leads', icon: <Users size={19} />, label: 'Leads' },
  { href: '/portal/calendar', icon: <Calendar size={19} />, label: 'Calendar' },
]
const mobileEmailNavItem = { href: '/portal/emails', icon: <Mail size={19} />, label: 'Emails' }
const mobileMessagesNavItem = { href: '/portal/messages', icon: <MessageSquare size={19} />, label: 'Messages' }

const PORTAL_MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function subscribeToPortalMobileViewport(callback: () => void) {
  const mediaQuery = window.matchMedia(PORTAL_MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getPortalMobileViewportSnapshot() {
  return window.matchMedia(PORTAL_MOBILE_MEDIA_QUERY).matches
}

const PORTAL_DESKTOP_MEDIA_QUERY = '(min-width: 1024px)'

function subscribeToPortalDesktopViewport(callback: () => void) {
  const mediaQuery = window.matchMedia(PORTAL_DESKTOP_MEDIA_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getPortalDesktopViewportSnapshot() {
  return window.matchMedia(PORTAL_DESKTOP_MEDIA_QUERY).matches
}

export function PortalShell({ children, session, initialProfile, initialTheme, initialSidebarCollapsed, permissions, role, buildId }: { children: React.ReactNode; session: LuxorPortalSession; initialProfile: PortalUserProfile; initialTheme: PortalTheme; initialSidebarCollapsed: boolean; permissions: PortalPermission[]; role: PortalRole; buildId?: string }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PortalShellContent session={session} initialProfile={initialProfile} initialTheme={initialTheme} initialSidebarCollapsed={initialSidebarCollapsed} permissions={permissions} role={role} buildId={buildId}>{children}</PortalShellContent>
      </Suspense>
    </ToastProvider>
  )
}

function PortalShellContent({ children, session, initialProfile, initialTheme, initialSidebarCollapsed, permissions, role, buildId }: { children: React.ReactNode; session: LuxorPortalSession; initialProfile: PortalUserProfile; initialTheme: PortalTheme; initialSidebarCollapsed: boolean; permissions: PortalPermission[]; role: PortalRole; buildId?: string }) {
  const pathname = usePathname()
  const canAccess = useCallback((permission: PortalPermission) => role === 'owner' || permissions.includes(permission), [permissions, role])
  const accessibleMobilePrimaryNavItems = [
    ...mobilePrimaryNavItems,
    ...(canAccess('emails') ? [mobileEmailNavItem] : canAccess('messages') ? [mobileMessagesNavItem] : []),
  ]
  const isLeadDetailPage = pathname.startsWith('/portal/leads/')
  const router = useRouter()
  const searchParams = useSearchParams()
  const viewportDiagnosticsOpen = searchParams?.get('viewport-diagnostics') === '1'
  const isMobileViewport = useSyncExternalStore(
    subscribeToPortalMobileViewport,
    getPortalMobileViewportSnapshot,
    () => false,
  )
  const isDesktopViewport = useSyncExternalStore(
    subscribeToPortalDesktopViewport,
    getPortalDesktopViewportSnapshot,
    () => true,
  )
  const isCustomWorkflowEditor = pathname.startsWith('/portal/marketing/custom-workflows/')
  const usesInternalPaneScroll =
    (!isMobileViewport && pathname === '/portal/leads') ||
    pathname === '/portal/emails' ||
    pathname === '/portal/email-tools' ||
    pathname === '/portal/messages' ||
    pathname === '/portal/calls' ||
    (!isDesktopViewport && isCustomWorkflowEditor) ||
    (pathname === '/portal/marketing' && ['contact-lists', 'emails', 'builder-automation', 'call-center'].includes(searchParams?.get('tab') || ''))
  const isEmailPage = pathname === '/portal/emails'
  const isCallsPage = pathname === '/portal/calls'
  const isMessagesPage = pathname === '/portal/messages'
  const closeViewportDiagnostics = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams?.toString() ?? '')
    nextParams.delete('viewport-diagnostics')
    const query = nextParams.toString()
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false })
  }, [pathname, router, searchParams])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed)
  const [elenaOpen, setElenaOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [accountHovered, setAccountHovered] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [pendingNavigationHref, setPendingNavigationHref] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<PortalUserProfile>(initialProfile)
  const reduceMotion = useReducedMotion()
  const contentScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0
    }
  }, [pathname, searchParams])

  const sidebarCollapsedRef = useRef(initialSidebarCollapsed)
  const sidebarIsCollapsed = sidebarCollapsed

  const handleSidebarNavigate = useCallback((href: string) => {
    let targetHref = href
    if (typeof window !== 'undefined') {
      if (href === '/portal/operations') {
        const lastTab = window.localStorage.getItem('luxor-portal-operations-last-tab')
        if (lastTab) targetHref = `/portal/operations?tab=${lastTab}`
      } else if (href === '/portal/marketing') {
        const lastTab = window.localStorage.getItem('luxor-portal-marketing-last-tab')
        if (lastTab) targetHref = `/portal/marketing?tab=${lastTab}`
      }
    }
    setPendingNavigationHref(targetHref)
    router.push(targetHref)
  }, [router])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current
      sidebarCollapsedRef.current = next
      window.localStorage.setItem('luxor-portal-sidebar', next ? 'compact' : 'expanded')
      persistPortalSidebarCookie(next)
      return next
    })
    window.dispatchEvent(new Event('luxor-portal-sidebar'))
  }, [])

  const handleSidebarEmptyClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement)?.closest?.('.portal-account-menu')) return
    // Inspect the complete event path because icon clicks may target a nested
    // SVG/path rather than the button itself. Any link or button in that path
    // owns the click and must not also trigger the empty-rail behavior.
    const path = event.nativeEvent.composedPath()
    const clickedControl = path.some((target) => {
      if (!target || typeof (target as Element).matches !== 'function') return false
      return (target as Element).matches('a, button, input, form')
    })
    if (clickedControl) return
    toggleSidebar()
  }, [toggleSidebar])

  useEffect(() => {
    const destinations = [
      ...navItems.map((item) => item.href),
      '/portal/settings',
    ]
    const timer = window.setTimeout(() => {
      destinations.forEach((href) => router.prefetch(href))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [router])

  // Header, mobile navigation, and the desktop sidebar sit beside the page
  // scroll area. If a wheel gesture starts there, hand it to the page—unless
  // the pointer is already over a native scrollable control or a dialog.
  const handOffWheelToPage = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.deltaY === 0 || event.ctrlKey || event.metaKey) return

    const target = event.target instanceof HTMLElement ? event.target : null
    if (!target) return
    if (target.closest('[role="dialog"], .portal-modal-layer, .portal-modal-body, .portal-sheet, input, textarea, select, [contenteditable="true"]')) return
    if (hasNativeVerticalScrollPath(target, event.deltaY)) return

    const page = contentScrollRef.current
    if (!page || !canScrollVertically(page, event.deltaY)) return

    event.preventDefault()
    page.scrollTop += event.deltaY
  }, [])

  useEffect(() => {
    const applySidebarLayout = () => {
      const collapsed = window.localStorage.getItem('luxor-portal-sidebar') === 'compact'
      if (sidebarCollapsedRef.current !== collapsed) {
        sidebarCollapsedRef.current = collapsed
        setSidebarCollapsed(collapsed)
      }
    }

    window.addEventListener('luxor-portal-sidebar', applySidebarLayout)
    return () => window.removeEventListener('luxor-portal-sidebar', applySidebarLayout)
  }, [])

  const loadUserProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/portal/user-preferences')
      if (!response.ok) return
      const data = await response.json()
      setUserProfile({
        displayName: typeof data.display_name === 'string' && data.display_name.trim() ? data.display_name.trim() : session.email.split('@')[0],
        email: typeof data.email === 'string' && data.email.trim() ? data.email.trim() : session.email,
        avatarUrl: typeof data.avatar_url === 'string' && data.avatar_url.trim() ? data.avatar_url.trim() : null,
      })
    } catch (error) {
      console.error('Failed to load portal profile:', error)
    }
  }, [session.email])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadUserProfile(), 0)
    window.addEventListener('luxor:profile-updated', loadUserProfile)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener('luxor:profile-updated', loadUserProfile)
    }
  }, [loadUserProfile])

  const userInitials = userProfile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'LE'

  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    if (pendingNavigationHref) {
      setPendingNavigationHref(null)
    }
  }

  const portalTheme = useSyncExternalStore(
    (callback) => {
      window.addEventListener('storage', callback)
      window.addEventListener('luxor-portal-theme', callback)
      return () => {
        window.removeEventListener('storage', callback)
        window.removeEventListener('luxor-portal-theme', callback)
      }
    },
    () => {
      const savedTheme = window.localStorage.getItem('luxor-portal-theme')
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : initialTheme
    },
    () => initialTheme
  )

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('luxor-portal-theme')
    if (savedTheme === 'light' || savedTheme === 'dark') persistPortalThemeCookie(savedTheme)
  }, [])

  // Notification State & Popover Modal
  const { notify } = useToast()
  const {
    items: notificationItems,
    unreadCount: notificationCount,
    unreadCountsByType,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
    refresh: refreshNotifications,
    registerToastCallback,
  } = usePortalNotifications()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const bellButtonRef = useRef<HTMLButtonElement>(null)

  // Fire toasts immediately when new notifications arrive between polls
  useEffect(() => {
    return registerToastCallback((item) => {
      const variantMap: Record<string, 'success' | 'warning' | 'info' | 'error'> = {
        invoice_paid: 'success',
        proposal_opened: 'info',
        checkout_opened: 'info',
        bill_due: 'warning',
        form: 'info',
        call: 'warning',
        sms: 'info',
        email: 'info',
        booking: 'success',
        calendar_response: 'success',
        contract: 'success',
        email_open: 'info',
        email_delivery_issue: 'warning',
        layout_feedback: 'info',
      }
      notify({
        title: item.title,
        description: item.subtitle,
        variant: variantMap[item.type] ?? 'info',
        durationMs: 8000,
        onClick: () => router.push(item.targetUrl),
        action: (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              router.push(item.targetUrl)
            }}
            className="mt-1 text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100 cursor-pointer"
          >
            View →
          </button>
        ),
      })
    })
  }, [registerToastCallback, notify, router])
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])

  // Global Add Client / Lead Drawer State
  const [isNewLeadDrawerOpen, setIsNewLeadDrawerOpen] = useState(false)

  // Global SMS / Text Modal State & Event Listener
  const [activeTextMessage, setActiveTextMessage] = useState<{
    inquiryId?: string
    phone: string
    contactName?: string
  } | null>(null)

  // Global Email Compose State & Event Listener
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeLead, setComposeLead] = useState<LuxorInquiry | null>(null)
  const [composeTemplateId, setComposeTemplateId] = useState<string | null>(null)
  const [composePurpose, setComposePurpose] = useState<'regular' | 'inquiry-response'>('regular')
  const [composeInitialSubject, setComposeInitialSubject] = useState('')
  const [composeDraft, setComposeDraft] = useState<EmailComposeDraft | null>(null)
  const composeContextKeyRef = useRef('global')
  const composeContextKeyBase = composeLead?.id
    ? `lead:${composeLead.id}`
    : composeLead?.email
      ? `email:${composeLead.email.trim().toLowerCase()}`
      : 'global'
  const composeContextKey = composePurpose === 'inquiry-response' ? `${composeContextKeyBase}:inquiry-response` : composeContextKeyBase
  const persistComposeDraft = useCallback((draft: EmailComposeDraft) => setComposeDraft(draft), [setComposeDraft])

  useEffect(() => {
    const handleComposeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ lead?: LuxorInquiry; email?: string; templateId?: string; purpose?: 'regular' | 'inquiry-response'; initialSubject?: string }>
      const nextLead = customEvent.detail?.lead
        ? customEvent.detail.lead
        : customEvent.detail?.email
          ? { email: customEvent.detail.email, full_name: customEvent.detail.email } as LuxorInquiry
          : null
      const nextPurpose = customEvent.detail?.purpose === 'inquiry-response' ? 'inquiry-response' : 'regular'
      const nextContextKeyBase = nextLead?.id
        ? `lead:${nextLead.id}`
        : nextLead?.email
          ? `email:${nextLead.email.trim().toLowerCase()}`
          : 'global'
      const nextContextKey = nextPurpose === 'inquiry-response' ? `${nextContextKeyBase}:inquiry-response` : nextContextKeyBase
      if (composeContextKeyRef.current !== nextContextKey) {
        composeContextKeyRef.current = nextContextKey
        setComposeDraft(null)
      }
      setComposeTemplateId(typeof customEvent.detail?.templateId === 'string' ? customEvent.detail.templateId : null)
      setComposePurpose(nextPurpose)
      setComposeInitialSubject(nextPurpose === 'inquiry-response' && typeof customEvent.detail?.initialSubject === 'string' ? customEvent.detail.initialSubject : '')
      setComposeLead(nextLead)
      setIsComposeOpen(true)
    }

    const handleOpenElena = () => setElenaOpen(true)

    const handleTextEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ inquiryId?: string; phone?: string; contactName?: string }>
      if (customEvent.detail?.phone) {
        setActiveTextMessage({
          inquiryId: customEvent.detail.inquiryId,
          phone: customEvent.detail.phone,
          contactName: customEvent.detail.contactName || 'Client',
        })
      }
    }

    const handleOpenNewLead = () => setIsNewLeadDrawerOpen(true)

    window.addEventListener('luxor-compose-email', handleComposeEvent)
    window.addEventListener('luxor-open-elena', handleOpenElena)
    window.addEventListener('luxor-open-text', handleTextEvent)
    window.addEventListener('luxor-open-new-lead', handleOpenNewLead)
    window.addEventListener('luxor:open-new-lead', handleOpenNewLead)
    return () => {
      window.removeEventListener('luxor-compose-email', handleComposeEvent)
      window.removeEventListener('luxor-open-elena', handleOpenElena)
      window.removeEventListener('luxor-open-text', handleTextEvent)
      window.removeEventListener('luxor-open-new-lead', handleOpenNewLead)
      window.removeEventListener('luxor:open-new-lead', handleOpenNewLead)
    }
  }, [])
  
  // Header Global Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null)
  const mobileSearchToggleRef = useRef<HTMLButtonElement>(null)
  const deferredSearchQuery = useDeferredValue(searchQuery)

  // Close mobile search on pathname change during render
  const [prevSearchPathname, setPrevSearchPathname] = useState(pathname)
  if (pathname !== prevSearchPathname) {
    setPrevSearchPathname(pathname)
    if (mobileSearchOpen) {
      setMobileSearchOpen(false)
    }
  }

  // Close mobile search when clicking or tapping outside of search bar and dropdown
  useEffect(() => {
    if (!mobileSearchOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return

      if (mobileSearchContainerRef.current?.contains(target)) return
      if (mobileSearchToggleRef.current?.contains(target)) return

      setMobileSearchOpen(false)
      mobileSearchInputRef.current?.blur()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [mobileSearchOpen])

  const recentLeads = useSyncExternalStore(
    subscribeRecentLeads,
    getRecentLeads,
    getRecentLeadsServerSnapshot,
  )

  // Auto-record current opened lead if pathname is a lead dossier
  useEffect(() => {
    if (!pathname.startsWith('/portal/leads/')) return
    const id = pathname.replace('/portal/leads/', '').split('/')[0].split('?')[0]
    if (!id || id === 'new') return
    const matched = inquiries.find((inq) => inq.id === id)
    if (matched) {
      saveRecentLead({
        id: matched.id,
        fullName: matched.full_name,
        email: matched.email,
        phone: matched.phone,
        eventType: matched.event_type,
        status: matched.status,
        avatarUrl: typeof matched.metadata?.avatar_url === 'string' ? matched.metadata.avatar_url : undefined,
      })
    }
  }, [pathname, inquiries])

  const displayRecentLeads = useMemo<RecentLeadItem[]>(() => {
    if (recentLeads.length > 0) {
      return recentLeads.map((item) => {
        const live = inquiries.find((i) => i.id === item.id)
        if (!live) return item
        return {
          ...item,
          fullName: live.full_name || item.fullName,
          email: live.email || item.email,
          phone: live.phone || item.phone,
          eventType: live.event_type || item.eventType,
          status: live.status || item.status,
          avatarUrl: (typeof live.metadata?.avatar_url === 'string' ? live.metadata.avatar_url : undefined) || item.avatarUrl,
        }
      }).slice(0, 6)
    }
    return [...inquiries]
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 5)
      .map((inq) => ({
        id: inq.id,
        fullName: inq.full_name,
        email: inq.email || undefined,
        phone: inq.phone || undefined,
        eventType: inq.event_type || undefined,
        status: inq.status || undefined,
        avatarUrl: typeof inq.metadata?.avatar_url === 'string' ? inq.metadata.avatar_url : undefined,
        openedAt: new Date(inq.updated_at || inq.created_at).getTime(),
      }))
  }, [recentLeads, inquiries])

  // Derived Search Results
  const searchResults = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    if (!query) return []

    return inquiries.filter((inq) =>
      inq.full_name.toLowerCase().includes(query) ||
      (inq.email && inq.email.toLowerCase().includes(query)) ||
      (inq.phone && inq.phone.includes(query)) ||
      (inq.event_type && inq.event_type.toLowerCase().includes(query))
    ).slice(0, 6)
  }, [deferredSearchQuery, inquiries])

  const nextBestAction = useMemo(() => {
    const priority: Record<LuxorInquiry['status'], number> = {
      new: 0,
      tour_requested: 1,
      proposal_sent: 2,
      contacted: 3,
      tour_confirmed: 4,
      booked: 5,
      closed_lost: 6,
    }
    const candidate = [...inquiries]
      .filter((inquiry) => inquiry.status !== 'booked' && inquiry.status !== 'closed_lost')
      .sort((a, b) => {
        const byStatus = priority[a.status] - priority[b.status]
        if (byStatus !== 0) return byStatus
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
      })[0]

    if (!candidate) {
      return {
        title: 'Review today\'s priorities',
        detail: 'Keep leads, tours, and proposals moving.',
        href: '/portal/leads',
        kind: 'review' as const,
        mode: 'open' as NextBestActionMode,
        inquiry: null,
      }
    }

    const name = candidate.full_name || 'this inquiry'
    const waiting = waitingLabel(candidate.updated_at || candidate.created_at)
    if (candidate.status === 'new') {
      return { title: `Reply to ${name}`, detail: `${candidate.event_type || 'Event'} inquiry · ${waiting}`, href: `/portal/leads/${candidate.id}`, kind: 'reply' as const, mode: candidate.email ? 'compose' as NextBestActionMode : 'open' as NextBestActionMode, inquiry: candidate }
    }
    if (candidate.status === 'tour_requested') {
      return { title: `Set ${name}'s tour time`, detail: `Tour time needed · ${waiting}`, href: `/portal/leads/${candidate.id}`, kind: 'tour' as const, mode: 'open' as NextBestActionMode, inquiry: candidate }
    }
    if (candidate.status === 'proposal_sent') {
      return { title: `Follow up on ${name}'s proposal`, detail: `Proposal sent · ${waiting}`, href: `/portal/leads/${candidate.id}`, kind: 'proposal' as const, mode: candidate.email ? 'compose' as NextBestActionMode : 'open' as NextBestActionMode, inquiry: candidate }
    }
    return { title: `Follow up with ${name}`, detail: `${candidate.status.replace(/_/g, ' ')} · ${waiting}`, href: `/portal/leads/${candidate.id}`, kind: 'followup' as const, mode: candidate.email ? 'compose' as NextBestActionMode : 'open' as NextBestActionMode, inquiry: candidate }
  }, [inquiries])

  const handleNextBestAction = useCallback(() => {
    if (nextBestAction.mode === 'compose' && nextBestAction.inquiry) {
      window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: nextBestAction.inquiry } }))
      return
    }
    router.push(nextBestAction.href)
  }, [nextBestAction, router])

  // Reuse the protected notification summary's live inquiry snapshot instead
  // of polling the full inquiry API separately from the dashboard.
  useEffect(() => {
    const handleInquiriesRefreshed = (event: Event) => {
      const data = (event as CustomEvent<LuxorInquiry[]>).detail
      if (Array.isArray(data)) setInquiries(data)
    }
    window.addEventListener('luxor:portal-inquiries-refreshed', handleInquiriesRefreshed)
    return () => {
      window.removeEventListener('luxor:portal-inquiries-refreshed', handleInquiriesRefreshed)
    }
  }, [])

  useEffect(() => {
    fetch('/api/portal/user-preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.theme && (data.theme === 'light' || data.theme === 'dark')) {
          const currentLocal = window.localStorage.getItem('luxor-portal-theme')
          if (currentLocal !== data.theme) {
            window.localStorage.setItem('luxor-portal-theme', data.theme)
            window.dispatchEvent(new Event('luxor-portal-theme'))
          }
          persistPortalThemeCookie(data.theme)
        }
      })
      .catch((err) => console.error('Failed to sync theme preference:', err))
  }, [])

  const selectSearchResult = useCallback((id: string) => {
    const targetLead = inquiries.find((inq) => inq.id === id)
    if (targetLead) {
      saveRecentLead({
        id: targetLead.id,
        fullName: targetLead.full_name,
        email: targetLead.email,
        phone: targetLead.phone,
        eventType: targetLead.event_type,
        status: targetLead.status,
        avatarUrl: typeof targetLead.metadata?.avatar_url === 'string' ? targetLead.metadata.avatar_url : undefined,
      })
    }
    setSearchQuery('')
    setSearchFocused(false)
    router.push(`/portal/leads/${id}`)
  }, [inquiries, router])

  return (
    <body data-portal-theme={portalTheme} className="portal-shell h-[100dvh] overflow-hidden bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-muted)] selection:bg-[#caa24c]/30">
      <PortalVoiceProvider>
      <aside
        onWheelCapture={handOffWheelToPage}
        onClick={handleSidebarEmptyClick}
        className={`fixed left-0 top-0 z-50 hidden h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:block overflow-visible cursor-pointer select-none border-0 border-none ${
          portalTheme === 'light'
            ? 'bg-[color:var(--portal-card)]/95 shadow-none'
            : 'bg-[#050505]'
        } ${sidebarIsCollapsed ? 'w-16' : 'w-60'}`}
      >
        <div className="flex flex-col h-full px-2 py-5 cursor-pointer">
          <div className={`mb-5 flex items-center justify-between transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            sidebarIsCollapsed ? 'px-1.5' : 'px-1'
          }`}>
            <div className="group/logo relative flex min-w-0 items-center">
            <Link
              href="/portal"
              onClick={(event) => {
                if (sidebarIsCollapsed) {
                  event.preventDefault()
                  toggleSidebar()
                }
              }}
              className="flex items-center gap-3 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
              aria-label={sidebarIsCollapsed ? 'Expand navigation panel' : 'Luxor portal overview'}
            >
              <div
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 shadow-[0_5px_16px_-9px_rgba(111,77,20,0.55)] ring-1 ring-[#caa24c]/10 transition-colors ${
                  portalTheme === 'light'
                    ? 'border-[#caa24c] bg-[#fffaf0]'
                    : 'border-[#caa24c]/75 bg-[#caa24c]/10'
                }`}
              >
                <Image
                  src="/luxor-portal-mark-gold-tight.png"
                  alt=""
                  width={1254}
                  height={1254}
                  className="h-auto w-[2rem] max-w-none object-contain transition-[filter,opacity,transform] duration-300 ease-out group-hover/logo:scale-90 group-hover/logo:blur-sm group-hover/logo:opacity-20"
                  priority
                />
              </div>
              <div className={`transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] whitespace-nowrap overflow-hidden ${
                sidebarIsCollapsed ? 'max-w-0 opacity-0 -translate-x-2 pointer-events-none' : 'max-w-[180px] opacity-100 translate-x-0'
              }`}>
                <p className="luxor-wordmark !text-[1.4rem] leading-none">LUXOR</p>
                <p className="mt-1 text-[9px] font-medium uppercase leading-none tracking-widest text-[#caa24c]">
                  Owner Portal
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={toggleSidebar}
              className="absolute left-0 top-0 z-10 flex h-10 w-10 items-center justify-center text-[#caa24c] opacity-0 transition-[opacity,transform,filter] duration-300 ease-out group-hover/logo:scale-110 group-hover/logo:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60"
              aria-label={sidebarIsCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarIsCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className={`h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ${sidebarIsCollapsed ? 'hidden' : 'inline-flex'}`}
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>

          <nav className="flex flex-col space-y-1">
            {navItems.filter((item) => canAccess(item.permission as PortalPermission)).map((item) => {
              const hasPendingTarget = Boolean(pendingNavigationHref)
              const isItemPending = pendingNavigationHref
                ? isActivePath(pendingNavigationHref.split('?')[0], item.href, searchParams)
                : false
              return (
                <SidebarLink
                  key={item.href}
                  {...item}
                  active={isActivePath(pathname, item.href, searchParams)}
                  collapsed={sidebarIsCollapsed}
                  pending={isItemPending}
                  hasPendingTarget={hasPendingTarget}
                  onNavigate={handleSidebarNavigate}
                />
              )
            })}
          </nav>

          {/* Invisible blank spot hit zone between nav items and bottom actions */}
          <div
            onClick={(event) => {
              event.stopPropagation()
              toggleSidebar()
            }}
            aria-hidden="true"
            className="flex-1 min-h-[3.5rem] w-full cursor-pointer select-none"
          />

          <div className="mt-auto space-y-1.5 border-t border-[#caa24c]/10 pt-4">
            {canAccess('settings') ? (
              <SidebarLink
                href="/portal/settings"
                icon={<Settings size={18} />}
                label="System Settings"
                active={isActivePath(pathname, '/portal/settings', searchParams)}
                collapsed={sidebarIsCollapsed}
                pending={pendingNavigationHref ? isActivePath(pendingNavigationHref, '/portal/settings', searchParams) : false}
                hasPendingTarget={Boolean(pendingNavigationHref)}
                onNavigate={handleSidebarNavigate}
              />
            ) : null}
            <div className="relative">
              <AnimatePresence initial={false}>
                {accountMenuOpen ? (
                  <motion.div
                    key="account-menu"
                    onClick={(event) => event.stopPropagation()}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className={`portal-account-menu absolute bottom-full z-20 mb-2 origin-bottom rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/88 p-2 shadow-2xl backdrop-blur-xl ${sidebarIsCollapsed ? 'left-0 w-56' : 'inset-x-0'}`}
                  >
                    <div className="border-b border-[color:var(--portal-border)] px-3 py-2">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{userProfile.displayName}</p>
                      <p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{userProfile.email}</p>
                    </div>
                    <form action="/api/auth/logout" method="post" className="mt-1">
                      <button
                        type="submit"
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[color:var(--portal-muted)] transition-all hover:bg-red-500/10 hover:text-red-400"
                      >
                        <LogOut size={17} className="transition-transform group-hover:translate-x-0.5" />
                        Log Out
                      </button>
                    </form>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => {
                  if (sidebarIsCollapsed) toggleSidebar()
                  setAccountMenuOpen((current) => !current)
                }}
                onMouseEnter={() => setAccountHovered(true)}
                onMouseLeave={() => setAccountHovered(false)}
                onFocus={() => setAccountHovered(true)}
                onBlur={() => setAccountHovered(false)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                className={`group relative flex items-center rounded-lg border border-transparent transition-all ${sidebarIsCollapsed ? 'mx-auto h-10 w-10 justify-center gap-0 p-0 hover:bg-[color:var(--portal-soft)]/40' : 'w-full gap-3 px-2 py-2 hover:bg-[color:var(--portal-soft)]/40'}`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#caa24c]/25 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-[11px] font-bold text-[#18130d] ring-2 ring-[color:var(--portal-soft)] transition-transform duration-200 ease-out group-hover:scale-110"
                  style={userProfile.avatarUrl ? { backgroundImage: `url(${userProfile.avatarUrl})` } : undefined}
                >
                  {userProfile.avatarUrl ? null : userInitials}
                </div>
                <AnimatePresence>
                  {sidebarIsCollapsed && accountHovered && !accountMenuOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -6, scale: 0.96 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -4, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--portal-text)] shadow-xl backdrop-blur-xl"
                    >
                      {userProfile.displayName || 'Account'}
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className={`min-w-0 overflow-hidden text-left transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarIsCollapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[180px] opacity-100 translate-x-0'}`}>
                  <span className="block truncate text-xs font-bold text-[color:var(--portal-text)]">{userProfile.displayName}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[color:var(--portal-muted)]">Account</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main onWheelCapture={handOffWheelToPage} style={{ backgroundColor: 'var(--portal-frame)' }} className={`portal-main flex h-[100dvh] min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] transition-[margin-left] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarIsCollapsed ? 'lg:ml-16' : 'lg:ml-60'}`}>
        <header className={`z-50 grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 border-b px-4 sm:h-16 sm:gap-x-4 sm:px-6 lg:px-8 ${
          portalTheme === 'light'
            ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95'
            : 'border-b-0 bg-[#050505]'
        }`}>
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/portal" className="flex min-w-0 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 lg:hidden" aria-label="Luxor portal overview">
              <LuxorWordmark
                compact
                horizontal
                subline={false}
                className="max-w-[9.5rem] max-sm:!gap-2.5 [&_.luxor-wordmark]:!text-[1.2rem] sm:[&_.luxor-wordmark]:!text-[1.35rem]"
                markClassName="!h-8 !w-8 sm:!h-10 sm:!w-10"
              />
            </Link>

            <button
              type="button"
              onClick={handleNextBestAction}
              className="group/next-action hidden h-11 min-w-0 max-w-[19rem] items-center gap-2 rounded-xl border-0 bg-[color:var(--portal-soft)]/70 px-2.5 transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 xl:flex"
              aria-label={`Next best action: ${nextBestAction.title}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 text-[#caa24c]">
                <NextBestActionIcon kind={nextBestAction.kind} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[10px] font-bold text-[color:var(--portal-text)]">{nextBestAction.title}</span>
                <span className="mt-0.5 block truncate text-[8px] text-[color:var(--portal-muted)]">{nextBestAction.detail}</span>
              </span>
              <ArrowUpRight size={13} className="ml-auto shrink-0 text-[color:var(--portal-muted)] transition-transform duration-200 group-hover/next-action:-translate-y-0.5 group-hover/next-action:translate-x-0.5 group-hover/next-action:text-[#caa24c]" aria-hidden="true" />
            </button>

          </div>

          {/* Header Search Command Bar & Quick Add Client / Lead */}
          <div className="col-start-2 hidden items-center justify-self-center gap-2.5 sm:flex">
            <div
              className={`group relative flex h-9.5 items-center rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3.5 transition-[width,border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[color:var(--portal-border)] focus-within:border-[#caa24c]/40 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/10 cursor-text ${
                searchFocused ? 'w-[28rem] lg:w-[30rem]' : 'w-72 md:w-80'
              }`}
              onClick={() => {
                searchInputRef.current?.focus()
                setSearchFocused(true)
              }}
            >
            <Search size={14} className="shrink-0 text-[color:var(--portal-muted)] group-focus-within:text-[#caa24c] transition-colors" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onClick={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 220)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchFocused(false)
                  searchInputRef.current?.blur()
                }
              }}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients, events, or emails..."
              className="portal-input-transparent w-full px-2 text-xs font-medium text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchQuery('')
                  searchInputRef.current?.focus()
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
              
            {/* Search Results Dropdown overlay */}
            <AnimatePresence>
              {searchFocused && (
                <motion.div
                  onMouseDown={(e) => e.preventDefault()}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className="portal-search-dropdown absolute inset-x-0 top-12 z-[100] w-full rounded-xl border p-2 space-y-1 shadow-xl backdrop-blur-2xl overflow-hidden"
                >
                  {searchQuery.trim().length > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] font-medium text-[color:var(--portal-muted)] px-3 py-1.5 border-b mb-1 border-[color:var(--portal-border)]">
                        <span className="flex items-center gap-1.5">
                          <Search size={11} className="text-[#caa24c]" />
                          Matching leads
                        </span>
                        {searchResults.length > 0 && (
                          <span className="tabular-nums text-[11px] text-[color:var(--portal-faint)]">
                            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'}
                          </span>
                        )}
                      </div>
                      {searchResults.length > 0 ? (
                        searchResults.map((result) => (
                          <div
                            key={result.id}
                            className="group/item flex items-center justify-between rounded-lg p-2 hover:bg-[color:var(--portal-soft)] transition-colors"
                          >
                            <Link
                              href={`/portal/leads/${result.id}`}
                              onClick={() => selectSearchResult(result.id)}
                              className="flex flex-1 items-center gap-2.5 min-w-0 outline-none cursor-pointer"
                            >
                              <PortalContactAvatar
                                name={result.full_name}
                                avatarUrl={typeof result.metadata?.avatar_url === 'string' ? result.metadata.avatar_url : undefined}
                                size="sm"
                              />
                              <div className="truncate min-w-0 flex-1">
                                <p className="text-xs font-semibold text-[color:var(--portal-text)] leading-tight truncate group-hover/item:text-[#caa24c] transition-colors">
                                  {result.full_name}
                                </p>
                                <p className="text-[11px] text-[color:var(--portal-muted)] truncate mt-0.5">
                                  {result.email || result.phone || 'No contact details registered'}
                                </p>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1.5 pl-2 shrink-0">
                              {result.email && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: result } }))
                                  }}
                                  className="rounded p-1.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/10 hover:text-[#caa24c] transition-colors cursor-pointer"
                                  title={`Email ${result.full_name}`}
                                >
                                  <Mail size={13} />
                                </button>
                              )}
                              <span className="text-[10px] font-medium text-[#9a6d26] dark:text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded-md">
                                {result.event_type || 'Booking'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-6 text-center text-xs text-[color:var(--portal-muted)]">
                          No leads found matching “{searchQuery.trim()}”
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[11px] font-medium text-[color:var(--portal-muted)] px-3 py-1.5 border-b mb-1 border-[color:var(--portal-border)]">
                        <span className="flex items-center gap-1.5">
                          <Clock size={11} className="text-[#caa24c]" />
                          {recentLeads.length > 0 ? 'Recently opened' : 'Recent leads'}
                        </span>
                        {recentLeads.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              clearRecentLeads()
                            }}
                            className="text-[11px] font-medium text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {displayRecentLeads.length > 0 ? (
                        displayRecentLeads.map((item) => (
                          <div
                            key={item.id}
                            className="group/item flex items-center justify-between rounded-lg p-2 hover:bg-[color:var(--portal-soft)] transition-colors"
                          >
                            <Link
                              href={`/portal/leads/${item.id}`}
                              onClick={() => selectSearchResult(item.id)}
                              className="flex flex-1 items-center gap-2.5 min-w-0 outline-none cursor-pointer"
                            >
                              <PortalContactAvatar
                                name={item.fullName}
                                avatarUrl={item.avatarUrl}
                                size="sm"
                              />
                              <div className="truncate min-w-0 flex-1">
                                <p className="text-xs font-semibold text-[color:var(--portal-text)] leading-tight truncate group-hover/item:text-[#caa24c] transition-colors">
                                  {item.fullName}
                                </p>
                                <p className="text-[11px] text-[color:var(--portal-muted)] truncate mt-0.5">
                                  {item.email || item.phone || 'Lead Dossier'}
                                </p>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1.5 pl-2 shrink-0">
                              {item.email && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    const fullLead = inquiries.find((i) => i.id === item.id)
                                    window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: fullLead || { id: item.id, full_name: item.fullName, email: item.email } } }))
                                  }}
                                  className="rounded p-1.5 text-[color:var(--portal-muted)] hover:bg-[#caa24c]/10 hover:text-[#caa24c] transition-colors cursor-pointer"
                                  title={`Email ${item.fullName}`}
                                >
                                  <Mail size={13} />
                                </button>
                              )}
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded">
                                {item.eventType || item.status || 'Lead'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-6 text-center text-xs text-[color:var(--portal-muted)]">
                          No recent leads yet. Start by searching or opening a dossier.
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsNewLeadDrawerOpen(true)}
              aria-label="Add new client or lead"
              title="Add new client or lead"
              className="luxor-gold-raised inline-flex h-9.5 w-9.5 min-w-[2.375rem] aspect-square shrink-0 items-center justify-center rounded-xl text-white shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-self-end">
            {/* Mobile Header Actions (Search | Phone | Notifications) */}
            <div className="flex h-9 items-center sm:hidden gap-1">
              {/* 1. Mobile Search Toggle */}
              <button
                ref={mobileSearchToggleRef}
                type="button"
                onClick={() => {
                  setMobileSearchOpen((prev) => {
                    const next = !prev
                    if (next) setTimeout(() => mobileSearchInputRef.current?.focus(), 150)
                    return next
                  })
                }}
                className={`portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
                  mobileSearchOpen
                    ? 'bg-[#caa24c]/15 text-[#caa24c] shadow-xs'
                    : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10'
                }`}
                aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
                aria-expanded={mobileSearchOpen}
              >
                <Search size={18} />
              </button>

              {/* Vertical divider */}
              <PortalHeaderDivider />

              {/* 2. Phone Button */}
              <PortalPhoneButton
                compact
                className="portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10 group"
              />

              {/* Vertical divider */}
              <PortalHeaderDivider />

              {/* 3. Bell Notifications */}
              <div className="relative flex items-center justify-center">
                <button
                  ref={(el) => {
                    if (el) bellButtonRef.current = el
                  }}
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={`portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
                    notificationsOpen
                      ? 'bg-[#caa24c]/15 text-[#caa24c] shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10'
                  }`}
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <div className="relative inline-flex items-center justify-center">
                    <Bell size={18} />
                    {notificationCount > 0 && (
                      <span ref={(node) => node?.style.setProperty('color', '#fff', 'important')} className="portal-notification-number absolute -top-1 -right-2 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[8px] font-black text-white shadow-xs ring-2 ring-[color:var(--portal-card)]">
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Desktop Header Actions (Phone | Bell | Messages | Elena) */}
            <div className="hidden sm:flex h-9 items-center gap-1">
              {/* 1. Phone Button */}
              <PortalPhoneButton
                compact
                className="portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10 group"
              />

              {/* Vertical divider 1 */}
              <PortalHeaderDivider />

              {/* 2. Bell Notifications */}
              <div className="relative flex items-center justify-center">
                <button
                  ref={(el) => {
                    if (el) bellButtonRef.current = el
                  }}
                  type="button"
                  onClick={() => setNotificationsOpen((prev) => !prev)}
                  className={`portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer ${
                    notificationsOpen
                      ? 'bg-[#caa24c]/15 text-[#caa24c] shadow-xs'
                      : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10'
                  }`}
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <div className="relative inline-flex items-center justify-center">
                    <Bell size={18} />
                    {notificationCount > 0 && (
                      <span ref={(node) => node?.style.setProperty('color', '#fff', 'important')} className="portal-notification-number absolute -top-1 -right-2 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 font-mono text-[8px] font-black text-white shadow-xs ring-2 ring-[color:var(--portal-card)]">
                        {notificationCount > 99 ? '99+' : notificationCount}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Vertical divider 2 */}
              <PortalHeaderDivider />

              {/* 3. Text messages */}
              <Link
                href="/portal/messages?tab=sms"
                prefetch
                className="portal-header-action relative flex h-9 w-9 !min-w-0 !min-h-0 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95 cursor-pointer text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10"
                aria-label="Text messages"
                title="Text messages"
              >
                <MessageSquare size={18} />
              </Link>

              {/* 4. Elena AI Concierge */}
              <button
                type="button"
                onClick={() => setElenaOpen((current) => !current)}
                className={`relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 cursor-pointer ${
                  elenaOpen 
                    ? 'border-[#caa24c] ring-2 ring-[#caa24c]/30' 
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/40'
                }`}
                aria-label="Toggle Elena AI Concierge"
                title="Elena AI Assistant"
              >
                <Image 
                  src="/luxor-concierge.png" 
                  alt="Elena AI Assistant" 
                  fill 
                  sizes="36px"
                  className="object-cover"
                />
              </button>
            </div>

            <PortalNotificationModal
              isOpen={notificationsOpen}
              triggerRef={bellButtonRef}
              onClose={() => setNotificationsOpen(false)}
              items={notificationItems}
              unreadCount={notificationCount}
              unreadCountsByType={unreadCountsByType}
              loading={notificationsLoading}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onRefresh={refreshNotifications}
            />
            
          </div>
        </header>

        {/* Mobile Search Bar and Backdrop */}
        <AnimatePresence>
          {mobileSearchOpen && (
            <>
              {/* Tap-outside backdrop */}
              <motion.div
                key="mobile-search-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-30 bg-black/15 backdrop-blur-[1px] sm:hidden"
                onClick={() => {
                  setMobileSearchOpen(false)
                  mobileSearchInputRef.current?.blur()
                }}
                aria-hidden="true"
              />
              <motion.div
                key="mobile-search-panel"
                ref={mobileSearchContainerRef}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="relative z-40 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/98 backdrop-blur-xl sm:hidden shadow-lg overflow-visible"
              >
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 focus-within:border-[#caa24c]/60 focus-within:ring-2 focus-within:ring-[#caa24c]/20 transition-all">
                    <Search size={15} className="shrink-0 text-[#caa24c]" />
                    <input
                      ref={mobileSearchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search clients, events, or emails..."
                      className="portal-input-transparent h-full flex-1 bg-transparent text-xs font-semibold text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        mobileSearchInputRef.current?.focus()
                      }}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer ${
                        searchQuery ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                      aria-label="Clear search"
                      tabIndex={searchQuery ? 0 : -1}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSearchOpen(false)
                      setIsNewLeadDrawerOpen(true)
                    }}
                    aria-label="Add new client or lead"
                    title="Add new client or lead"
                    className="luxor-gold-raised inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs transition-transform active:scale-95 cursor-pointer"
                  >
                    <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Mobile Search Results Floating Dropdown Overlay */}
              <AnimatePresence>
                {mobileSearchOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.99 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.32, 1] }}
                    className="absolute left-3 right-3 top-[calc(100%+0.375rem)] z-50 max-h-80 overflow-y-auto portal-scrollbar divide-y divide-[color:var(--portal-border)]/40 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/98 backdrop-blur-2xl shadow-2xl"
                  >
                    {searchQuery.trim().length > 0 ? (
                      <>
                        <div className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] px-3 py-1.5 bg-[color:var(--portal-soft)]/50 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Search size={10} className="text-[#caa24c]" />
                            Matching Dossier Records
                          </span>
                          {searchResults.length > 0 && (
                            <span className="font-mono text-[9px] text-[color:var(--portal-faint)]">
                              {searchResults.length}
                            </span>
                          )}
                        </div>
                        {searchResults.length > 0 ? (
                          searchResults.map((result) => (
                            <Link
                              key={result.id}
                              href={`/portal/leads/${result.id}`}
                              onClick={() => {
                                selectSearchResult(result.id)
                                setMobileSearchOpen(false)
                              }}
                              className="flex items-center justify-between p-2.5 hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <PortalContactAvatar
                                  name={result.full_name}
                                  avatarUrl={typeof result.metadata?.avatar_url === 'string' ? result.metadata.avatar_url : undefined}
                                  size="sm"
                                />
                                <div className="truncate min-w-0 flex-1">
                                  <p className="text-xs font-bold text-[color:var(--portal-text)] leading-tight truncate">
                                    {result.full_name}
                                  </p>
                                  <p className="text-[10px] text-[color:var(--portal-muted)] truncate mt-0.5">
                                    {result.email || result.phone || 'No contact details registered'}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded shrink-0 ml-2">
                                {result.event_type || 'Lead'}
                              </span>
                            </Link>
                          ))
                        ) : (
                          <div className="px-3 py-6 text-center text-xs text-[color:var(--portal-muted)]">
                            No leads found matching “{searchQuery.trim()}”
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] px-3 py-1.5 bg-[color:var(--portal-soft)]/50 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Clock size={10} className="text-[#caa24c]" />
                            {recentLeads.length > 0 ? 'Recently Opened Leads' : 'Recent Leads'}
                          </span>
                          {recentLeads.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                clearRecentLeads()
                              }}
                              className="text-[8px] font-semibold text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        {displayRecentLeads.length > 0 ? (
                          displayRecentLeads.map((item) => (
                            <Link
                              key={item.id}
                              href={`/portal/leads/${item.id}`}
                              onClick={() => {
                                selectSearchResult(item.id)
                                setMobileSearchOpen(false)
                              }}
                              className="flex items-center justify-between p-2.5 hover:bg-[color:var(--portal-soft)] active:bg-[#caa24c]/10 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <PortalContactAvatar
                                  name={item.fullName}
                                  avatarUrl={item.avatarUrl}
                                  size="sm"
                                />
                                <div className="truncate min-w-0 flex-1">
                                  <p className="text-xs font-bold text-[color:var(--portal-text)] leading-tight truncate">
                                    {item.fullName}
                                  </p>
                                  <p className="text-[10px] text-[color:var(--portal-muted)] truncate mt-0.5">
                                    {item.email || item.phone || 'Lead Dossier'}
                                  </p>
                                </div>
                              </div>
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded shrink-0 ml-2">
                                {item.eventType || item.status || 'Lead'}
                              </span>
                            </Link>
                          ))
                        ) : (
                          <div className="px-3 py-6 text-center text-xs text-[color:var(--portal-muted)]">
                            No recent leads yet. Start by searching or opening a dossier.
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

        {/* The shell reserves the bottom bar; detail pages also reserve their action row. */}
        <div ref={contentScrollRef} className={`portal-scrollbar min-h-0 min-w-0 flex-1 bg-[color:var(--portal-bg)] transition-[border-radius] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:rounded-tl-[28px] ${usesInternalPaneScroll ? 'flex flex-col overflow-y-hidden' : 'overflow-y-auto'} overflow-x-hidden ${isCallsPage || isMessagesPage ? 'p-0 lg:p-8' : isCustomWorkflowEditor ? 'p-0 lg:p-8' : isEmailPage ? 'p-0 lg:p-8' : isLeadDetailPage ? 'px-4 pt-4 pb-44 sm:p-6 lg:px-8 lg:pt-8 lg:pb-0' : pathname === '/portal/leads' ? 'p-4 max-md:pt-0 max-md:pb-[calc(4rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8' : 'p-4 sm:p-6 lg:p-8'} ${
          portalTheme === 'light'
            ? 'bg-[image:radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.06),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem)]'
            : 'bg-[image:radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.08),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem)]'
        }`}>
          <RouteTransition surface="portal" fillAvailableHeight={usesInternalPaneScroll}>{children}</RouteTransition>
        </div>
      </main>

        <nav
          onWheelCapture={handOffWheelToPage}
          className={`portal-mobile-nav fixed inset-x-0 bottom-0 z-[60] grid grid-cols-5 border-t px-2 shadow-[0_-14px_35px_-30px_rgba(0,0,0,0.7)] backdrop-blur-2xl lg:hidden ${
            portalTheme === 'light'
              ? 'border-[color:var(--portal-border)] bg-[#fffdf9]/85'
              : 'border-[#caa24c]/15 bg-[#080706]/85'
          }`}
          aria-label="Primary portal navigation"
        >
          {accessibleMobilePrimaryNavItems.filter((item) => canAccess(item.href === '/portal' ? 'overview' : item.href === '/portal/leads' ? 'leads' : item.href === '/portal/calendar' ? 'calendar' : item.href === '/portal/emails' ? 'emails' : 'messages')).map((item) => {
            const active = isActivePath(pathname, item.href, searchParams)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${
                  active ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${
              !accessibleMobilePrimaryNavItems.some((item) => isActivePath(pathname, item.href, searchParams))
                ? 'bg-[#caa24c]/10 text-[#caa24c]'
                : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
            }`}
            aria-label="More portal sections"
            aria-expanded={mobileMoreOpen}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
      <PortalElenaChat isOpen={elenaOpen} onClose={() => setElenaOpen(false)} activePath={pathname} />
      <AnimatePresence>
        {mobileMoreOpen && (
          <motion.div
            className="portal-modal-layer fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-3 pb-[calc(var(--portal-mobile-nav-height)+0.75rem)] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMoreOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="More portal sections"
              className="portal-overlay-surface portal-sheet backdrop-blur-2xl max-h-full w-full overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] p-4 shadow-2xl sm:max-w-xl"
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-serif text-lg font-semibold text-[color:var(--portal-text)]">More at Luxor</p>
                  <p className="text-xs text-[color:var(--portal-muted)]">Operations, communication, and account tools.</p>
                </div>
                <PortalCloseButton onClick={() => setMobileMoreOpen(false)} aria-label="Close more sections" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {navItems
                  .filter(
                    (item) =>
                      item.href !== '/portal/planner' &&
                      canAccess(item.permission as PortalPermission) &&
                      !accessibleMobilePrimaryNavItems.some((primary) => primary.href === item.href)
                  )
                  .map((item) => {
                    const active = isActivePath(pathname, item.href, searchParams)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMoreOpen(false)}
                        className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-bold transition-colors ${
                          active
                            ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-[#caa24c]'
                            : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/30'
                        }`}
                      >
                        <span className="flex items-center justify-center text-[#caa24c]">{item.icon}</span>
                        <span className="leading-tight text-center">{item.label}</span>
                      </Link>
                    )
                  })}
                {canAccess('settings') ? (
                  <Link
                    href="/portal/settings"
                    onClick={() => setMobileMoreOpen(false)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-bold transition-colors ${
                      isActivePath(pathname, '/portal/settings', searchParams)
                        ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-[#caa24c]'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/30'
                    }`}
                  >
                    <span className="flex items-center justify-center text-[#caa24c]">
                      <Settings size={18} />
                    </span>
                    <span className="leading-tight text-center">Settings</span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false)
                    setElenaOpen(true)
                  }}
                  className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-center text-xs font-bold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/30 cursor-pointer"
                >
                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xs">
                    <Image src="/luxor-concierge.png" alt="Elena AI Assistant" fill sizes="24px" className="object-cover" />
                  </span>
                  <span className="leading-tight text-center">Elena</span>
                </button>
                {canAccess('planner') ? (
                  <Link
                    href="/portal/planner"
                    onClick={() => setMobileMoreOpen(false)}
                    className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center text-xs font-bold transition-colors ${
                      isActivePath(pathname, '/portal/planner', searchParams)
                        ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-[#caa24c]'
                        : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/30'
                    }`}
                    aria-current={isActivePath(pathname, '/portal/planner', searchParams) ? 'page' : undefined}
                  >
                    <span className="flex items-center justify-center text-[#caa24c]">
                      <CalendarDays size={18} />
                    </span>
                    <span className="leading-tight text-center">Planner</span>
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 flex items-center gap-3 border-t border-[color:var(--portal-border)] pt-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#caa24c]/25 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-xs font-bold text-[#18130d]"
                  style={userProfile.avatarUrl ? { backgroundImage: `url(${userProfile.avatarUrl})` } : undefined}
                >
                  {userProfile.avatarUrl ? null : userInitials}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[color:var(--portal-text)]">{userProfile.displayName}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[color:var(--portal-muted)]">{userProfile.email}</span>
                </span>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/20 px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300">
                    <LogOut size={16} />
                    Log out
                  </button>
                </form>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isComposeOpen && (
          <EmailComposeDrawer
            isOpen={isComposeOpen}
            onClose={() => { setIsComposeOpen(false); setComposeTemplateId(null) }}
            lead={composeLead}
            initialTemplateId={composeTemplateId}
            purpose={composePurpose}
            initialSubject={composeInitialSubject}
            composeContextKey={composeContextKey}
            initialDraft={composeDraft?.contextKey === composeContextKey ? composeDraft : null}
            onDraftChange={persistComposeDraft}
            onSuccess={() => setComposeDraft(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isNewLeadDrawerOpen && (
          <NewLeadDrawer
            isOpen={isNewLeadDrawerOpen}
            onClose={() => setIsNewLeadDrawerOpen(false)}
            onCreated={() => {
              window.dispatchEvent(new CustomEvent('luxor:portal-inquiries-refreshed'))
            }}
            pagePath={pathname}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activeTextMessage && (
          <LuxorDraggableTextModal
            inquiryId={activeTextMessage.inquiryId}
            phone={activeTextMessage.phone}
            contactName={activeTextMessage.contactName}
            onClose={() => setActiveTextMessage(null)}
          />
        )}
      </AnimatePresence>
      {viewportDiagnosticsOpen ? <PortalViewportDiagnostics buildId={buildId} onClose={closeViewportDiagnostics} /> : null}
      </PortalVoiceProvider>
    </body>
  )
}

function SidebarLink({
  href,
  icon,
  label,
  active,
  collapsed,
  pending,
  hasPendingTarget,
  onNavigate,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
  collapsed: boolean
  pending: boolean
  hasPendingTarget?: boolean
  onNavigate: (href: string) => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const isSelected = hasPendingTarget ? pending : active

  return (
    <Link
      href={href}
      prefetch
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        setIsHovered(false)
        onNavigate(href)
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      aria-label={label}
      className={`group relative flex items-center rounded-lg border border-transparent py-2.5 text-sm font-medium transition-colors ${
        collapsed ? 'mx-auto h-11 w-11 justify-center gap-0 p-0' : 'w-full gap-3 px-3'
      } ${
        isSelected
          ? 'text-[#18130d] dark:text-[#f1d27a] font-semibold'
          : 'text-[color:var(--portal-muted)] hover:bg-[#caa24c]/[0.08] hover:text-[#18130d] dark:hover:bg-[#caa24c]/[0.06] dark:hover:text-[#f4f4f5]'
      }`}
    >
      {isSelected && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-[#caa24c]/15 dark:bg-[#caa24c]/10 pointer-events-none"
          transition={{
            type: 'spring',
            stiffness: 450,
            damping: 35,
          }}
        />
      )}
      <span className={`relative z-10 w-5 h-5 flex items-center justify-center shrink-0 ${isSelected ? 'text-[#9e7627] dark:text-[#caa24c]' : 'text-[color:var(--portal-muted)] group-hover:text-[#9e7627] dark:group-hover:text-[#caa24c]'} transition-colors ${pending && !active ? 'animate-pulse' : ''}`}>
        {icon}
      </span>
      <AnimatePresence>
        {collapsed && isHovered && (
          <motion.span
            initial={{ opacity: 0, x: -6, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--portal-text)] shadow-xl backdrop-blur-xl"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        className={`relative z-10 whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          collapsed
            ? 'max-w-0 opacity-0 -translate-x-1 pointer-events-none'
            : 'max-w-[200px] opacity-100 translate-x-0'
        }`}
      >
        {label}
      </span>
      {pending && !active && !collapsed ? <Loader2 size={13} className="relative z-10 ml-auto shrink-0 animate-spin text-[#9e7627] dark:text-[#caa24c]" aria-hidden="true" /> : null}
    </Link>
  )
}

function isActivePath(pathname: string, href: string, searchParams?: ReturnType<typeof useSearchParams> | null) {
  if (href.includes('?tab=')) {
    const [basePath, query] = href.split('?')
    const expectedTab = new URLSearchParams(query).get('tab')
    return pathname === basePath && searchParams?.get('tab') === expectedTab
  }
  if (href === '/portal/operations') {
    return pathname === href || pathname.startsWith('/portal/operations/')
  }
  if (href === '/portal/marketing') {
    return pathname === href || pathname.startsWith('/portal/marketing/')
  }
  if (href === '/portal') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
