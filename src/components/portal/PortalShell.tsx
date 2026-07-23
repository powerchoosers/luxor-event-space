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
  Sparkles,
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
} from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { RouteTransition } from '@/components/RouteTransition'
import type { LuxorPortalSession } from '@/lib/luxorPortalAuth'
import Image from 'next/image'
import { ToastProvider, useToast } from '@/components/portal/ToastProvider'
import { PortalContactAvatar } from '@/components/portal/PortalUI'
import { EmailComposeDrawer } from '@/components/portal/EmailComposeDrawer'
import { PortalPhoneButton, PortalVoiceProvider } from '@/components/portal/PortalVoiceProvider'
import { usePortalNotifications } from '@/hooks/usePortalNotifications'
import { PortalNotificationModal } from '@/components/portal/PortalNotificationModal'

const PortalElenaChat = dynamic(
  () => import('@/components/portal/PortalElenaChat').then((mod) => mod.PortalElenaChat),
  {
    ssr: false,
    loading: () => (
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#caa24c]/10 bg-[#050505] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]" />
    ),
  }
)

const navItems = [
  { href: '/portal', icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { href: '/portal/leads', icon: <Users size={18} />, label: 'Leads & Clients' },
  { href: '/portal/calls', icon: <Phone size={18} />, label: 'Calls & Voicemail' },
  { href: '/portal/marketing?tab=emails', icon: <Mail size={18} />, label: 'Emails' },
  { href: '/portal/messages', icon: <MessageSquare size={18} />, label: 'Text Messages' },
  { href: '/portal/calendar', icon: <Calendar size={18} />, label: 'Calendar' },
  { href: '/portal/events', icon: <Sparkles size={18} />, label: 'Events' },
  { href: '/portal/finances', icon: <DollarSign size={18} />, label: 'Finances' },
  { href: '/portal/operations', icon: <Settings size={18} />, label: 'Operations', isDropdown: true },
  { href: '/portal/marketing', icon: <Mail size={18} />, label: 'Marketing', isDropdown: true },
  { href: '/portal/reports', icon: <FileText size={18} />, label: 'Reports' },
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
  { href: '/portal/marketing?tab=emails', label: 'Emails', icon: Mail },
  { href: '/portal/marketing?tab=sources', label: 'Lead Sources', icon: TrendingUp },
  { href: '/portal/marketing?tab=email-campaigns', label: 'Email Campaigns', icon: Mail },
  { href: '/portal/marketing?tab=text-campaigns', label: 'Text Campaigns', icon: MessageSquare },
  { href: '/portal/marketing?tab=builder-automation', label: 'Email Builder & Automation', icon: Sparkles },
  { href: '/portal/marketing?tab=contact-lists', label: 'Contact Lists', icon: Users },
  { href: '/portal/marketing?tab=call-center', label: 'Call Center', icon: Phone },
  { href: '/portal/marketing?tab=calendar', label: 'Marketing Calendar', icon: Calendar },
]

export function PortalShell({ children, session }: { children: React.ReactNode; session: LuxorPortalSession }) {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PortalShellContent session={session}>{children}</PortalShellContent>
      </Suspense>
    </ToastProvider>
  )
}

function PortalShellContent({ children, session }: { children: React.ReactNode; session: LuxorPortalSession }) {
  const pathname = usePathname()
  const isLeadDetailPage = pathname.startsWith('/portal/leads/')
  const router = useRouter()
  const searchParams = useSearchParams()
  const usesInternalTableScroll =
    pathname === '/portal/leads' ||
    pathname === '/portal/messages' ||
    (pathname === '/portal/marketing' && ['contact-lists', 'emails'].includes(searchParams?.get('tab') || ''))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [operationsExpanded, setOperationsExpanded] = useState(pathname.startsWith('/portal/operations'))
  const [marketingExpanded, setMarketingExpanded] = useState(pathname.startsWith('/portal/marketing'))
  const [elenaOpen, setElenaOpen] = useState(false)

  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    if (pathname.startsWith('/portal/operations')) {
      setOperationsExpanded(true)
    }
    if (pathname.startsWith('/portal/marketing')) {
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
      return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark'
    },
    () => 'dark'
  )

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
        bill_due: 'warning',
        form: 'info',
        call: 'warning',
        sms: 'info',
        email: 'info',
      }
      notify({
        title: item.title,
        description: item.subtitle,
        variant: variantMap[item.type] ?? 'info',
        durationMs: 8000,
        action: (
          <button
            type="button"
            onClick={() => router.push(item.targetUrl)}
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
    <body data-portal-theme={portalTheme} className="h-screen overflow-hidden bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-muted)] selection:bg-[#caa24c]/30">
      <PortalVoiceProvider>
      <aside className={`fixed left-0 top-0 z-50 hidden h-full backdrop-blur-xl shadow-[24px_0_60px_-36px_rgba(0,0,0,0.85)] transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:block overflow-y-auto overflow-x-hidden portal-scrollbar ${
        portalTheme === 'light'
          ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95'
          : 'border-transparent bg-[radial-gradient(circle_at_18%_-8%,rgba(202,162,76,0.04),transparent_22rem),linear-gradient(180deg,rgba(11,10,9,0.995)_0%,rgba(6,6,6,0.995)_100%)]'
      } ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex flex-col min-h-full px-3.5 py-6">
          <div className="mb-8 flex items-center justify-between px-1">
            <Link href="/portal" className="flex items-center gap-3 min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" aria-label="Luxor portal overview">
              <div className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full border border-[#caa24c]/40 bg-black/40 p-0.5 overflow-hidden">
                <Image
                  src="/luxor-palm-mark.png"
                  alt=""
                  width={255}
                  height={190}
                  className="h-10 w-10 object-contain object-[center_42%]"
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
            {navItems.map((item) => {
              if (item.isDropdown) {
                const isCurrentGroup = pathname.startsWith(item.href)
                const isExpanded = item.href === '/portal/operations' ? operationsExpanded : marketingExpanded
                return (
                  <div key={item.href} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (item.href === '/portal/operations') {
                          setOperationsExpanded(!operationsExpanded)
                        } else if (item.href === '/portal/marketing') {
                          setMarketingExpanded(!marketingExpanded)
                        }
                      }}
                      title={sidebarCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      className={`group relative flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
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
                <SidebarLink key={item.href} {...item} active={isActivePath(pathname, item.href)} collapsed={sidebarCollapsed} />
              )
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-[#caa24c]/10 pt-6">
            <SidebarLink href="/portal/settings" icon={<Settings size={18} />} label="System Settings" active={pathname === '/portal/settings'} collapsed={sidebarCollapsed} />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title={sidebarCollapsed ? 'Log Out' : undefined}
                className="group relative flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-zinc-550 transition-all hover:bg-red-500/5 hover:border-red-500/10 hover:text-red-400 cursor-pointer"
                aria-label="Log out"
              >
                <span className="w-5 h-5 flex items-center justify-center shrink-0">
                  <LogOut size={18} className="transition-transform group-hover:translate-x-0.5" />
                </span>
                <span
                  className={`whitespace-nowrap overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                    sidebarCollapsed
                      ? 'max-w-0 opacity-0 -translate-x-1 pointer-events-none'
                      : 'max-w-[200px] opacity-100 translate-x-0'
                  }`}
                >
                  Log Out
                </span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className={`flex h-screen flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className={`z-30 flex h-16 shrink-0 items-center justify-between border-b px-4 backdrop-blur-md sm:px-6 lg:px-8 ${
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
              onClick={() => setSidebarCollapsed((current) => !current)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 rounded-lg"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>

            {/* Header Search Command Bar */}
            <div className="relative hidden w-[min(24rem,36vw)] items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 sm:flex group">
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
          </div>

          <div className="flex items-center gap-2 sm:gap-5">
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

            <Link href="/portal/messages?tab=sms" prefetch className="rounded-full p-2 transition-colors hover:bg-[color:var(--portal-soft)] cursor-pointer" aria-label="Text messages">
              <MessageSquare size={20} className="text-zinc-400" />
            </Link>
            
            <button
              type="button"
              onClick={() => setElenaOpen((current) => !current)}
              className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-full border transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 ${
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
                className="object-cover"
              />
            </button>
            
            <div className="mx-1 hidden h-8 w-px bg-[color:var(--portal-border)] sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold leading-none text-white">{session.email}</p>
                <p className="mt-1 text-[10px] font-medium uppercase leading-none tracking-tighter text-zinc-500">Zoho Authorized</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] ring-2 ring-[color:var(--portal-soft)]">
                <div className="h-full w-full bg-gradient-to-br from-blue-400 to-indigo-600 opacity-80" />
              </div>
            </div>
          </div>
        </header>

        <nav className={`portal-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b px-4 py-3 lg:hidden ${
          portalTheme === 'light'
            ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95'
            : 'border-[#caa24c]/10 bg-[#050505]/86'
        }`} aria-label="Portal sections">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                  active
                    ? 'border-[#caa24c]/45 bg-[#caa24c]/10 text-white'
                    : 'border-zinc-900 bg-zinc-950 text-zinc-500 hover:border-zinc-800 hover:text-zinc-300'
                }`}
              >
                <span className={active ? 'text-[#caa24c]' : 'text-zinc-650'}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className={`portal-scrollbar min-h-0 flex-1 ${usesInternalTableScroll ? 'flex flex-col overflow-y-hidden' : 'overflow-y-auto'} overflow-x-hidden ${isLeadDetailPage ? 'px-4 pt-4 pb-0 sm:px-6 sm:pt-6 sm:pb-0 lg:px-8 lg:pt-8 lg:pb-0' : 'p-4 sm:p-6 lg:p-8'} ${
          portalTheme === 'light'
            ? 'bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.06),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem),var(--portal-bg)]'
            : 'bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.08),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem),var(--portal-bg)]'
        }`}>
          <RouteTransition surface="portal" fillAvailableHeight={usesInternalTableScroll}>{children}</RouteTransition>
        </div>
      </main>
      <PortalElenaChat isOpen={elenaOpen} onClose={() => setElenaOpen(false)} activePath={pathname} />
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
      className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
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

function isActivePath(pathname: string, href: string) {
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
