'use client'

import {
  Bell,
  Calendar,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Users,
  CalendarRange,
  DollarSign,
  ChevronDown,
  Gauge,
  Receipt,
  Wrench,
  Package,
  Handshake,
  Zap,
  Brush,
  BarChart3,
  Phone,
  TrendingUp,
  Megaphone,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, Suspense } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { RouteTransition } from '@/components/RouteTransition'
import type { LuxorPortalSession } from '@/lib/luxorPortalAuth'
import type { PortalPermission, PortalRole } from '@/lib/luxorPortalAccess'
import Image from 'next/image'
import { ToastProvider, useToast } from '@/components/portal/ToastProvider'
import { PortalContactAvatar } from '@/components/portal/PortalUI'
import { PortalPhoneButton, PortalVoiceProvider } from '@/components/portal/PortalVoiceProvider'
import { usePortalNotifications } from '@/hooks/usePortalNotifications'

type PortalUserProfile = {
  displayName: string
  email: string
  avatarUrl: string | null
}

type PortalTheme = 'light' | 'dark'

function persistPortalThemeCookie(theme: PortalTheme) {
  document.cookie = `luxor-portal-theme=${theme}; path=/; max-age=31536000; samesite=lax`
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
        className="pointer-events-none fixed right-0 top-0 z-50 flex h-full w-full translate-x-full flex-col border-l border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] opacity-0 shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]"
      />
    ),
  }
)

const navItems = [
  { href: '/portal', icon: <LayoutDashboard size={18} />, label: 'Overview', permission: 'overview' },
  { href: '/portal/leads', icon: <Users size={18} />, label: 'Leads & Clients', permission: 'leads' },
  { href: '/portal/calls', icon: <Phone size={18} />, label: 'Phone', permission: 'calls' },
  { href: '/portal/emails', icon: <Mail size={18} />, label: 'Emails', permission: 'emails' },
  { href: '/portal/messages', icon: <MessageSquare size={18} />, label: 'Text Messages', permission: 'messages' },
  { href: '/portal/calendar', icon: <Calendar size={18} />, label: 'Calendar', permission: 'calendar' },
  { href: '/portal/events', icon: <CalendarRange size={18} />, label: 'Events', permission: 'events' },
  { href: '/portal/finances', icon: <DollarSign size={18} />, label: 'Finances', permission: 'finances' },
  { href: '/portal/operations', icon: <SlidersHorizontal size={18} />, label: 'Operations', isDropdown: true, permission: 'operations' },
  { href: '/portal/marketing', icon: <Megaphone size={18} />, label: 'Marketing', isDropdown: true, permission: 'marketing' },
  { href: '/portal/reports', icon: <FileText size={18} />, label: 'Reports', permission: 'reports' },
]

const mobilePrimaryNavItems = [
  { href: '/portal', icon: <LayoutDashboard size={19} />, label: 'Home' },
  { href: '/portal/leads', icon: <Users size={19} />, label: 'Leads' },
  { href: '/portal/calendar', icon: <Calendar size={19} />, label: 'Calendar' },
  { href: '/portal/messages', icon: <MessageSquare size={19} />, label: 'Messages' },
]

const operationsSubItems = [
  { href: '/portal/operations?tab=dashboard', label: 'Dashboard', icon: Gauge },
  { href: '/portal/operations?tab=bills', label: 'Bills & Payments', icon: Receipt },
  { href: '/portal/operations?tab=maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/portal/operations?tab=inventory', label: 'Inventory', icon: Package },
  { href: '/portal/operations?tab=vendors', label: 'Vendors', icon: Handshake },
  { href: '/portal/operations?tab=utilities', label: 'Utilities', icon: Zap },
  { href: '/portal/operations?tab=cleaning', label: 'Cleaning', icon: Brush },
  { href: '/portal/operations?tab=staff', label: 'Staff', icon: Users },
]

const marketingSubItems = [
  { href: '/portal/marketing?tab=overview', label: 'Marketing Overview', icon: BarChart3 },
  { href: '/portal/marketing?tab=sources', label: 'Lead Sources', icon: TrendingUp },
  { href: '/portal/marketing?tab=email-campaigns', label: 'Email Campaigns', icon: Mail },
  { href: '/portal/marketing?tab=text-campaigns', label: 'Text Campaigns', icon: MessageSquare },
  { href: '/portal/marketing?tab=contact-lists', label: 'Contact Lists', icon: Users },
  { href: '/portal/marketing?tab=call-center', label: 'Call Center', icon: Phone },
  { href: '/portal/marketing?tab=calendar', label: 'Marketing Calendar', icon: Calendar },
]

const PORTAL_MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function subscribeToPortalMobileViewport(callback: () => void) {
  const mediaQuery = window.matchMedia(PORTAL_MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getPortalMobileViewportSnapshot() {
  return window.matchMedia(PORTAL_MOBILE_MEDIA_QUERY).matches
}

export function PortalShell({ children, session, initialProfile, initialTheme, permissions, role }: { children: React.ReactNode; session: LuxorPortalSession; initialProfile: PortalUserProfile; initialTheme: PortalTheme; permissions: PortalPermission[]; role: PortalRole }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PortalShellContent session={session} initialProfile={initialProfile} initialTheme={initialTheme} permissions={permissions} role={role}>{children}</PortalShellContent>
      </Suspense>
    </ToastProvider>
  )
}

function PortalShellContent({ children, session, initialProfile, initialTheme, permissions, role }: { children: React.ReactNode; session: LuxorPortalSession; initialProfile: PortalUserProfile; initialTheme: PortalTheme; permissions: PortalPermission[]; role: PortalRole }) {
  const pathname = usePathname()
  const canAccess = useCallback((permission: PortalPermission) => role === 'owner' || permissions.includes(permission), [permissions, role])
  const isLeadDetailPage = pathname.startsWith('/portal/leads/')
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobileViewport = useSyncExternalStore(
    subscribeToPortalMobileViewport,
    getPortalMobileViewportSnapshot,
    () => false,
  )
  const usesInternalTableScroll =
    (!isMobileViewport && pathname === '/portal/leads') ||
    pathname === '/portal/emails' ||
    pathname === '/portal/messages' ||
    (pathname === '/portal/marketing' && ['contact-lists', 'emails', 'builder-automation', 'call-center'].includes(searchParams?.get('tab') || ''))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [operationsExpanded, setOperationsExpanded] = useState(pathname.startsWith('/portal/operations'))
  const [marketingExpanded, setMarketingExpanded] = useState(pathname.startsWith('/portal/marketing') && searchParams?.get('tab') !== 'emails')
  const [elenaOpen, setElenaOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [userProfile, setUserProfile] = useState<PortalUserProfile>(initialProfile)
  const reduceMotion = useReducedMotion()
  const contentScrollRef = useRef<HTMLDivElement>(null)

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
      setSidebarCollapsed(window.localStorage.getItem('luxor-portal-sidebar') === 'compact')
    }

    applySidebarLayout()
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
    if (pathname.startsWith('/portal/operations')) {
      setOperationsExpanded(true)
    }
    if (pathname.startsWith('/portal/marketing') && searchParams?.get('tab') !== 'emails') {
      setMarketingExpanded(true)
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
        contract: 'success',
        email_open: 'info',
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

  // Global Email Compose State & Event Listener
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeLead, setComposeLead] = useState<LuxorInquiry | null>(null)

  useEffect(() => {
    const handleComposeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ lead?: LuxorInquiry; email?: string }>
      if (customEvent.detail?.lead) {
        setComposeLead(customEvent.detail.lead)
      } else if (customEvent.detail?.email) {
        setComposeLead({ email: customEvent.detail.email, full_name: customEvent.detail.email } as LuxorInquiry)
      } else {
        setComposeLead(null)
      }
      setIsComposeOpen(true)
    }

    window.addEventListener('luxor-compose-email', handleComposeEvent)
    return () => {
      window.removeEventListener('luxor-compose-email', handleComposeEvent)
    }
  }, [])
  
  // Header Global Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const deferredSearchQuery = useDeferredValue(searchQuery)


  // Derived Search Results
  const searchResults = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()
    if (query.length < 2) return []

    return inquiries.filter((inq) =>
      inq.full_name.toLowerCase().includes(query) ||
      (inq.email && inq.email.toLowerCase().includes(query)) ||
      (inq.event_type && inq.event_type.toLowerCase().includes(query))
    ).slice(0, 5)
  }, [deferredSearchQuery, inquiries])

  // Load inquiries for header search bar
  useEffect(() => {
    let active = true
    const loadInquiries = async () => {
      try {
        const res = await fetch('/api/inquiries', { headers: { Accept: 'application/json' }, cache: 'no-store' })
        if (res.ok && active) {
          const data = await res.json()
          setInquiries(data)
        }
      } catch (err) {
        console.error('Failed to load inquiries for search:', err)
      }
    }
    loadInquiries()
    return () => { active = false }
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
    setSearchQuery('')
    setSearchFocused(false)
    router.push(`/portal/leads/${id}`)
  }, [router])

  return (
    <body data-portal-theme={portalTheme} className="h-[100dvh] overflow-hidden bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-muted)] selection:bg-[#caa24c]/30">
      <PortalVoiceProvider>
      <aside onWheelCapture={handOffWheelToPage} className={`fixed left-0 top-0 z-50 hidden h-[100dvh] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl shadow-[24px_0_60px_-36px_rgba(0,0,0,0.85)] transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:block overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
        portalTheme === 'light'
          ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95'
          : 'border-transparent bg-[radial-gradient(circle_at_18%_-8%,rgba(202,162,76,0.04),transparent_22rem),linear-gradient(180deg,rgba(11,10,9,0.995)_0%,rgba(6,6,6,0.995)_100%)]'
      } ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col min-h-full px-3 py-5">
          <div className={`mb-5 flex items-center justify-between transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            sidebarCollapsed ? 'px-1.5' : 'px-1'
          }`}>
            <Link href="/portal" className="flex items-center gap-3 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" aria-label="Luxor portal overview">
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
                  className="h-auto w-[2rem] max-w-none object-contain"
                  priority
                />
              </div>
              <div className={`transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] whitespace-nowrap overflow-hidden ${
                sidebarCollapsed ? 'max-w-0 opacity-0 -translate-x-2 pointer-events-none' : 'max-w-[180px] opacity-100 translate-x-0'
              }`}>
                <p className="luxor-wordmark !text-[1.4rem] leading-none">LUXOR</p>
                <p className="mt-1 text-[9px] font-medium uppercase leading-none tracking-widest text-[#caa24c]">
                  Owner Portal
                </p>
              </div>
            </Link>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.filter((item) => canAccess(item.permission as PortalPermission)).map((item) => {
              if (item.isDropdown) {
                const isCurrentGroup = item.href === '/portal/marketing'
                  ? pathname.startsWith('/portal/marketing') && searchParams?.get('tab') !== 'emails'
                  : pathname.startsWith(item.href)
                const isExpanded = item.href === '/portal/operations'
                  ? operationsExpanded
                  : marketingExpanded && !(pathname.startsWith('/portal/marketing') && searchParams?.get('tab') === 'emails')
                return (
                  <div key={item.href} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (sidebarCollapsed) {
                          setSidebarCollapsed(false)
                          window.localStorage.setItem('luxor-portal-sidebar', 'expanded')
                          if (item.href === '/portal/operations') {
                            setOperationsExpanded(true)
                          } else if (item.href === '/portal/marketing') {
                            setMarketingExpanded(true)
                          }
                        } else {
                          if (item.href === '/portal/operations') {
                            setOperationsExpanded(!operationsExpanded)
                          } else if (item.href === '/portal/marketing') {
                            setMarketingExpanded(!marketingExpanded)
                          }
                        }
                      }}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      className={`group relative flex w-full items-center justify-between rounded-lg border py-2.5 text-sm font-medium transition-all cursor-pointer ${
                        sidebarCollapsed ? 'px-[18px]' : 'px-3'
                      } ${
                        isCurrentGroup
                          ? 'border-[#caa24c]/30 bg-[#caa24c]/5 text-[#f1d27a] shadow-[0_0_15px_rgba(202,162,76,0.08)] font-bold'
                          : 'border-transparent text-zinc-550 hover:bg-[#caa24c]/2 hover:border-[#caa24c]/10 hover:text-zinc-250'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isCurrentGroup && (
                          <span className="absolute left-0 top-1/4 h-1/2 w-1.5 rounded-r bg-[#caa24c]" />
                        )}
                        <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${isCurrentGroup ? 'text-[#caa24c]' : 'text-zinc-650 group-hover:text-zinc-450'} transition-colors`}>
                          {item.icon}
                        </span>
                        <span
                          className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                            sidebarCollapsed
                              ? 'max-w-0 opacity-0 -translate-x-1 pointer-events-none'
                              : 'max-w-[200px] opacity-100 translate-x-0'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <span
                        className={`text-zinc-500 mr-1 shrink-0 transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                          sidebarCollapsed
                            ? 'max-w-0 opacity-0 pointer-events-none'
                            : 'max-w-[20px] opacity-100'
                        }`}
                      >
                        <ChevronDown size={14} className={`transform transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                      </span>
                    </button>
                    
                    <AnimatePresence initial={false}>
                      {isExpanded && !sidebarCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                          className="pl-6 space-y-1 border-l border-zinc-900/60 ml-5 mt-1 overflow-hidden"
                        >
                          {(item.href === '/portal/operations' ? operationsSubItems : marketingSubItems).map((sub) => {
                            const tabParam = searchParams?.get('tab')
                            const defaultTab = item.href === '/portal/operations' ? 'dashboard' : 'overview'
                            const isSubActive = pathname === item.href && (
                              (sub.href.includes(`tab=${defaultTab}`) && !tabParam) ||
                              (!!tabParam && sub.href.includes(`tab=${tabParam}`))
                            )
                            return (
                              <SidebarSubLink
                                key={sub.href}
                                href={sub.href}
                                label={sub.label}
                                icon={sub.icon}
                                active={isSubActive}
                              />
                            )
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              }
              return (
                <SidebarLink key={item.href} {...item} active={isActivePath(pathname, item.href, searchParams)} collapsed={sidebarCollapsed} />
              )
            })}
          </nav>

          <div className="mt-auto space-y-1.5 border-t border-[#caa24c]/10 pt-4">
            {canAccess('settings') ? <SidebarLink href="/portal/settings" icon={<Settings size={18} />} label="System Settings" active={isActivePath(pathname, '/portal/settings', searchParams)} collapsed={sidebarCollapsed} /> : null}
            <div className="relative">
              <AnimatePresence initial={false}>
                {accountMenuOpen ? (
                  <motion.div
                    key="account-menu"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className={`absolute bottom-full z-20 mb-2 origin-bottom rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 shadow-2xl ${sidebarCollapsed ? 'left-0 w-56' : 'inset-x-0'}`}
                  >
                    <div className="border-b border-[color:var(--portal-border)] px-3 py-2">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{userProfile.displayName}</p>
                      <p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{userProfile.email}</p>
                    </div>
                    <form action="/api/auth/logout" method="post" className="mt-1">
                      <button
                        type="submit"
                        className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-550 transition-all hover:bg-red-500/5 hover:text-red-400"
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
                  if (sidebarCollapsed) setSidebarCollapsed(false)
                  setAccountMenuOpen((current) => !current)
                }}
                title={sidebarCollapsed ? userProfile.displayName : undefined}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
              className={`group flex items-center rounded-lg border border-transparent py-2 transition-all hover:border-[#caa24c]/15 hover:bg-[#caa24c]/5 ${sidebarCollapsed ? 'mx-auto w-10 justify-center gap-0 px-0' : 'w-full gap-3 px-2'}`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#caa24c]/25 bg-gradient-to-br from-[#f1d27a] via-[#caa24c] to-[#9b6d24] bg-cover bg-center font-serif text-[11px] font-bold text-[#18130d] ring-2 ring-[color:var(--portal-soft)]"
                  style={userProfile.avatarUrl ? { backgroundImage: `url(${userProfile.avatarUrl})` } : undefined}
                >
                  {userProfile.avatarUrl ? null : userInitials}
                </div>
                <span className={`min-w-0 overflow-hidden text-left transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'max-w-0 opacity-0 -translate-x-1' : 'max-w-[180px] opacity-100 translate-x-0'}`}>
                  <span className="block truncate text-xs font-bold text-[color:var(--portal-text)]">{userProfile.displayName}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[color:var(--portal-muted)]">Account</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main onWheelCapture={handOffWheelToPage} className={`flex h-[100dvh] flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-[margin-left] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className={`z-50 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-4 backdrop-blur-md sm:gap-x-4 sm:px-6 lg:px-8 ${
          portalTheme === 'light'
            ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95'
            : 'border-[#caa24c]/10 bg-[#050505]/75'
        }`}>
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/portal" className="flex min-w-0 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 lg:hidden" aria-label="Luxor portal overview">
              <LuxorWordmark
                compact
                horizontal
                subline={false}
                className="max-w-[9.5rem] [&_.luxor-wordmark]:!text-[1.35rem]"
                markClassName="!h-10 !w-10"
              />
            </Link>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((current) => {
                const next = !current
                window.localStorage.setItem('luxor-portal-sidebar', next ? 'compact' : 'expanded')
                return next
              })}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 lg:inline-flex"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>

          {/* Header Search Command Bar */}
          <div className="group relative col-start-2 hidden w-full max-w-96 items-center justify-self-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 sm:flex">
              <Search size={14} className="shrink-0 text-zinc-500 group-focus-within:text-[#caa24c] transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 250)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients, events, or emails..."
                className="portal-input-transparent w-full px-2 text-xs font-semibold text-zinc-200 outline-none placeholder:text-zinc-500"
              />
              
              {/* Search Results Dropdown overlay */}
              <AnimatePresence>
                {searchFocused && searchResults.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="portal-search-dropdown absolute left-0 top-12 z-[100] w-full min-w-[22rem] rounded-xl border p-2 space-y-1 shadow-2xl backdrop-blur-2xl"
                  >
                    <div className="text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] px-3 py-1 border-b mb-1 border-[color:var(--portal-border)]">
                      Matching Dossier Records
                    </div>
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        onMouseDown={(e) => e.preventDefault()}
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
                            <p className="text-xs font-bold text-[color:var(--portal-text)] leading-tight truncate group-hover/item:text-[#caa24c] transition-colors">
                              {result.full_name}
                            </p>
                            <p className="text-[9px] text-[color:var(--portal-muted)] truncate mt-0.5">
                              {result.email || 'No email registered'}
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
                          <span className="text-[8px] font-bold uppercase tracking-widest text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded">
                            {result.event_type || 'Booking'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          <div className="flex items-center justify-self-end gap-2 sm:gap-5">
            <PortalPhoneButton />
            
            {/* Bell Notifications */}
            <div className="relative">
              <button
                ref={bellButtonRef}
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="relative rounded-full p-2 transition-colors hover:bg-[color:var(--portal-soft)] cursor-pointer"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell size={20} className="text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors" />
                {notificationCount > 0 && (
                  <span className="portal-notification-number absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full border border-[color:var(--portal-card)] bg-blue-600 px-0.5 font-mono text-[9px] font-black text-white shadow-xs ring-2 ring-blue-500/40 animate-pulse">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>

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

            <Link href="/portal/messages?tab=sms" prefetch className="hidden rounded-full p-2 transition-colors hover:bg-[color:var(--portal-soft)] cursor-pointer sm:inline-flex" aria-label="Text messages">
              <MessageSquare size={20} className="text-zinc-400" />
            </Link>
            
            <button
              type="button"
              onClick={() => setElenaOpen((current) => !current)}
              className={`relative hidden h-9 w-9 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 sm:block ${
                elenaOpen 
                  ? 'border-[#caa24c] ring-2 ring-[#caa24c]/30' 
                  : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] hover:border-[#caa24c]/30'
              }`}
              aria-label="Toggle Elena AI Concierge"
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
        </header>

        {/* Phone and portrait-tablet content reserve space for the shared bottom bar. */}
        <div ref={contentScrollRef} className={`portal-scrollbar min-h-0 flex-1 transition-[border-radius] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:rounded-tl-[28px] ${usesInternalTableScroll ? 'flex flex-col overflow-y-hidden' : 'overflow-y-auto'} overflow-x-hidden ${isLeadDetailPage ? 'px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-0' : 'p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-8'} ${
          portalTheme === 'light'
            ? 'bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.06),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem),var(--portal-bg)]'
            : 'bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.08),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem),var(--portal-bg)]'
        }`}>
          <RouteTransition surface="portal" fillAvailableHeight={usesInternalTableScroll}>{children}</RouteTransition>
        </div>

        <nav
          className={`fixed inset-x-0 bottom-0 z-[60] grid grid-cols-5 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 shadow-[0_-14px_35px_-30px_rgba(0,0,0,0.7)] backdrop-blur-2xl lg:hidden ${
            portalTheme === 'light'
              ? 'border-[color:var(--portal-border)] bg-[#fffdf9]/85'
              : 'border-[#caa24c]/15 bg-[#080706]/85'
          }`}
          aria-label="Primary portal navigation"
        >
          {mobilePrimaryNavItems.filter((item) => canAccess(item.href === '/portal' ? 'overview' : item.href === '/portal/leads' ? 'leads' : item.href === '/portal/calendar' ? 'calendar' : 'messages')).map((item) => {
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
              !mobilePrimaryNavItems.some((item) => isActivePath(pathname, item.href, searchParams))
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
      </main>
      <PortalElenaChat isOpen={elenaOpen} onClose={() => setElenaOpen(false)} activePath={pathname} />
      <AnimatePresence>
        {mobileMoreOpen && (
          <motion.div
            className="portal-modal-layer fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMoreOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="More portal sections"
              className="portal-sheet max-h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] w-full overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[#fffdf9]/95 p-4 shadow-2xl backdrop-blur-2xl dark:bg-[#12110f]/95 sm:max-w-xl"
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
                <button type="button" onClick={() => setMobileMoreOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]" aria-label="Close more sections">
                  <X size={19} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {navItems.filter((item) => canAccess(item.permission as PortalPermission) && !mobilePrimaryNavItems.some((primary) => primary.href === item.href)).map((item) => {
                  const active = isActivePath(pathname, item.href, searchParams)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMoreOpen(false)}
                      className={`flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-xs font-bold transition-colors ${
                        active ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-[#caa24c]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] hover:border-[#caa24c]/30'
                      }`}
                    >
                      <span className="text-[#caa24c]">{item.icon}</span>
                      <span className="leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
                {canAccess('settings') ? <Link href="/portal/settings" onClick={() => setMobileMoreOpen(false)} className="flex min-h-20 flex-col items-start justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs font-bold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/30">
                  <Settings size={18} className="text-[#caa24c]" />
                  <span>Settings</span>
                </Link> : null}
                <button type="button" onClick={() => { setMobileMoreOpen(false); setElenaOpen(true) }} className="flex min-h-20 flex-col items-start justify-between rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs font-bold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/30">
                  <span className="relative inline-flex h-[22px] w-[22px] overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
                    <Image src="/luxor-concierge.png" alt="Elena AI Assistant" fill sizes="22px" className="object-cover" />
                  </span>
                  <span>Elena</span>
                </button>
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
            onClose={() => setIsComposeOpen(false)}
            lead={composeLead}
          />
        )}
      </AnimatePresence>
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
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      prefetch
      title={collapsed ? label : undefined}
      aria-label={label}
      className={`group relative flex items-center gap-3 rounded-lg border py-2.5 text-sm font-medium transition-all ${
        collapsed ? 'px-[18px]' : 'px-3'
      } ${
        active
          ? 'border-[#caa24c]/30 bg-[#caa24c]/5 text-[#f1d27a] shadow-[0_0_15px_rgba(202,162,76,0.08)] font-bold'
          : 'border-transparent text-zinc-550 hover:bg-[#caa24c]/2 hover:border-[#caa24c]/10 hover:text-zinc-250'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/4 h-1/2 w-1.5 rounded-r bg-[#caa24c] shadow-[0_0_8px_rgba(202,162,76,0.6)]" />
      )}
      <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${active ? 'text-[#caa24c]' : 'text-zinc-650 group-hover:text-zinc-450'} transition-colors`}>
        {icon}
      </span>
      <span
        className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          collapsed
            ? 'max-w-0 opacity-0 -translate-x-1 pointer-events-none'
            : 'max-w-[200px] opacity-100 translate-x-0'
        }`}
      >
        {label}
      </span>
    </Link>
  )
}

function isActivePath(pathname: string, href: string, searchParams?: ReturnType<typeof useSearchParams> | null) {
  if (href.includes('?tab=')) {
    const [basePath, query] = href.split('?')
    const expectedTab = new URLSearchParams(query).get('tab')
    return pathname === basePath && searchParams?.get('tab') === expectedTab
  }
  if (href === '/portal/marketing') {
    return pathname === href && searchParams?.get('tab') !== 'emails'
  }
  if (href === '/portal') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarSubLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  active: boolean
}) {
  return (
    <Link
      href={href}
      prefetch
      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs transition-colors cursor-pointer ${
        active
          ? 'text-[#f1d27a] font-bold bg-[#caa24c]/5'
          : 'text-zinc-550 hover:text-zinc-300 hover:bg-zinc-950/20'
      }`}
    >
      <span className={active ? 'text-[#caa24c]' : 'text-zinc-650'}>
        <Icon size={14} />
      </span>
      <span>{label}</span>
    </Link>
  )
}
