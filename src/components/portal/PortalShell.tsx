'use client'

import {
  Bell,
  Calendar,
  FileText,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Search,
  Settings,
  Moon,
  Users
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { LuxorWordmark } from '@/components/LuxorWordmark'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { RouteTransition } from '@/components/RouteTransition'
import type { LuxorPortalSession } from '@/lib/luxorPortalAuth'

const navItems = [
  { href: '/portal', icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { href: '/portal/leads', icon: <Users size={18} />, label: 'Leads & Clients' },
  { href: '/portal/marketing', icon: <Mail size={18} />, label: 'Marketing' },
  { href: '/portal/invoices', icon: <FileText size={18} />, label: 'Invoices' },
  { href: '/portal/communications', icon: <Phone size={18} />, label: 'Communications' },
  { href: '/portal/calendar', icon: <Calendar size={18} />, label: 'Event Calendar' },
]

export function PortalShell({ children, session }: { children: React.ReactNode; session: LuxorPortalSession }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [portalTheme, setPortalTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark'
    const savedTheme = window.localStorage.getItem('luxor-portal-theme')
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark'
  })
  
  // Notification State
  const [notificationCount, setNotificationCount] = useState(0)
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])
  
  // Header Global Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const togglePortalTheme = () => {
    setPortalTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('luxor-portal-theme', next)
      return next
    })
  }

  // Derived Search Results
  const searchResults = searchQuery.trim().length >= 2
    ? inquiries.filter((inq) =>
        inq.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inq.email && inq.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (inq.event_type && inq.event_type.toLowerCase().includes(searchQuery.toLowerCase()))
      ).slice(0, 5)
    : []

  useEffect(() => {
    let active = true
    const loadData = async () => {
      try {
        const res = await fetch('/api/inquiries')
        if (res.ok && active) {
          const data = await res.json()
          setInquiries(data)
          
          // Count 'new' or 'tour_requested' inquiries as unhandled notifications
          const unhandled = data.filter((i: LuxorInquiry) => i.status === 'new' || i.status === 'tour_requested').length
          setNotificationCount(unhandled)
        }
      } catch (err) {
        console.error('Failed to sync notification counter:', err)
      }
    }

    loadData()
    // Poll notifications status every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [pathname])

  const selectSearchResult = (id: string) => {
    setSearchQuery('')
    setSearchFocused(false)
    router.push(`/portal/leads/${id}`)
  }

  return (
    <body data-portal-theme={portalTheme} className="h-screen overflow-hidden bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-muted)] selection:bg-[#caa24c]/30">
      <aside className={`fixed left-0 top-0 z-50 hidden h-full border-r border-[#caa24c]/10 bg-[#050505]/90 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] lg:block ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_20%_0%,rgba(202,162,76,0.14),transparent_16rem)]" />
        <div className={`flex h-full flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'p-4' : 'p-6'}`}>
          <div className={`mb-8 flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
            <Link href="/portal" className="block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" aria-label="Luxor portal overview">
              {sidebarCollapsed ? (
                <LuxorWordmark
                  compact
                  horizontal
                  subline={false}
                  className="[&_.luxor-wordmark]:hidden"
                  markClassName="!h-11 !w-11"
                />
              ) : (
                <>
                  <LuxorWordmark
                    compact
                    horizontal
                    subline={false}
                    className="[&_.luxor-wordmark]:!text-[1.55rem]"
                    markClassName="!h-12 !w-12"
                  />
                  <p className="ml-[3.65rem] mt-1 text-[10px] font-medium uppercase leading-none tracking-widest text-[#caa24c]">
                    Owner Portal
                  </p>
                </>
              )}
            </Link>
            {!sidebarCollapsed ? (
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#caa24c]/15 bg-[#120d0c]/70 text-zinc-500 transition-colors hover:border-[#caa24c]/40 hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
                aria-label="Collapse sidebar"
                aria-expanded="true"
              >
                <PanelLeftClose size={17} />
              </button>
            ) : null}
          </div>

          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="mb-4 inline-flex h-10 w-10 items-center justify-center self-center rounded-lg border border-[#caa24c]/15 bg-[#120d0c]/70 text-zinc-500 transition-colors hover:border-[#caa24c]/40 hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50"
              aria-label="Expand sidebar"
              aria-expanded="false"
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : null}

          <div className={`mb-6 overflow-hidden rounded-xl border border-[#caa24c]/16 bg-[#120d0c]/72 shadow-[inset_0_1px_0_rgba(241,210,122,0.08)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'max-h-0 border-transparent p-0 opacity-0' : 'max-h-44 p-4 opacity-100'}`}>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#caa24c]">Website Signal</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Tour requests from the public site flow directly into this workspace.</p>
            <Link href="/" className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:text-[#f1d27a]">
              View site <ExternalLink size={12} />
            </Link>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <SidebarLink key={item.href} {...item} active={isActivePath(pathname, item.href)} collapsed={sidebarCollapsed} />
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-[#caa24c]/10 pt-6">
            <SidebarLink href="/portal/settings" icon={<Settings size={18} />} label="System Settings" active={pathname === '/portal/settings'} collapsed={sidebarCollapsed} />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className={`group flex w-full items-center rounded-lg text-sm font-medium text-zinc-500 transition-all hover:bg-red-500/5 hover:text-red-400 ${sidebarCollapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'}`} aria-label="Log out">
                <LogOut size={18} className="transition-transform group-hover:translate-x-1" />
                <span className={`${sidebarCollapsed ? 'sr-only' : ''}`}>Log Out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className={`flex h-screen flex-col transition-[padding-left] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <header className="z-40 flex h-16 shrink-0 items-center justify-between border-b border-[#caa24c]/10 bg-[#050505]/75 px-4 backdrop-blur-md sm:px-6 lg:px-8">
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
            
            {/* Header Search Command Bar */}
            <div className="relative hidden w-[min(24rem,36vw)] items-center rounded-lg border border-zinc-850 bg-zinc-950 px-3 py-1.5 sm:flex group">
              <Search size={14} className="shrink-0 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients, events, or emails..."
                className="w-full bg-transparent px-2 text-xs font-semibold text-zinc-300 outline-none placeholder:text-zinc-650"
              />
              
              {/* Search Results Dropdown overlay */}
              {searchFocused && searchResults.length > 0 && (
                <div className="absolute left-0 top-11 z-50 w-full rounded-xl border border-zinc-900 bg-[#080706] shadow-2xl p-2 space-y-1">
                  <div className="text-[8px] font-black uppercase tracking-wider text-zinc-600 px-3 py-1 border-b border-zinc-950 mb-1">
                    Matching Dossier Records
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => selectSearchResult(result.id)}
                      className="w-full text-left flex items-center justify-between px-3 py-2 rounded hover:bg-zinc-900 transition-colors"
                    >
                      <div className="truncate pr-2">
                        <p className="text-xs font-bold text-white leading-tight">{result.full_name}</p>
                        <p className="text-[9px] text-zinc-500 truncate mt-0.5">{result.email || 'No email registered'}</p>
                      </div>
                      <span className="shrink-0 text-[8px] font-bold uppercase tracking-widest text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded">
                        {result.event_type || 'Booking'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-5">
            <Link href="/" className="hidden items-center gap-2 rounded-lg border border-[#caa24c]/18 bg-[#120d0c]/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#caa24c] transition-colors hover:border-[#f1d27a]/40 hover:text-[#f1d27a] md:inline-flex">
              Public site <ExternalLink size={12} />
            </Link>

            <button
              type="button"
              onClick={togglePortalTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/18 bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#caa24c] transition-colors hover:border-[#f1d27a]/40 hover:text-[#f1d27a]"
              aria-label="Toggle portal theme"
            >
              <Moon size={12} />
              {portalTheme === 'dark' ? 'Light' : 'Dark'}
            </button>
            
            {/* Bell Notifications */}
            <Link href="/portal/leads" className="relative rounded-full p-2 transition-colors hover:bg-zinc-900" aria-label="Notifications">
              <Bell size={18} className="text-zinc-400 transition-colors" />
              {notificationCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-4 min-w-4 rounded-full border border-black bg-blue-600 text-[8px] font-black text-white flex items-center justify-center px-1 font-mono">
                  {notificationCount}
                </span>
              )}
            </Link>

            <Link href="/portal/communications" className="rounded-full p-2 transition-colors hover:bg-zinc-900" aria-label="Messages">
              <MessageSquare size={18} className="text-zinc-400" />
            </Link>
            
            <div className="mx-1 hidden h-8 w-px bg-zinc-900 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold leading-none text-white">{session.email}</p>
                <p className="mt-1 text-[10px] font-medium uppercase leading-none tracking-tighter text-zinc-500">Zoho Authorized</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 ring-2 ring-zinc-900">
                <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-650 opacity-80" />
              </div>
            </div>
          </div>
        </header>

        <nav className="portal-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-[#caa24c]/10 bg-[#050505]/86 px-4 py-3 lg:hidden" aria-label="Portal sections">
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

        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.08),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem),var(--portal-bg)] p-4 sm:p-6 lg:p-8">
          <RouteTransition surface="portal">{children}</RouteTransition>
        </div>
      </main>
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
      title={collapsed ? label : undefined}
      aria-label={label}
      className={`group relative flex items-center rounded-lg border text-sm font-medium transition-all ${
        collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'
      } ${
        active
          ? 'border-[#caa24c]/30 bg-[#caa24c]/5 text-[#f1d27a] shadow-[0_0_15px_rgba(202,162,76,0.08)] font-bold'
          : 'border-transparent text-zinc-550 hover:bg-[#caa24c]/2 hover:border-[#caa24c]/10 hover:text-zinc-250'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/4 h-1/2 w-1.5 rounded-r bg-[#caa24c] shadow-[0_0_8px_rgba(202,162,76,0.6)]" />
      )}
      <span className={`${active ? 'text-[#caa24c]' : 'text-zinc-650 group-hover:text-zinc-450'} transition-colors`}>
        {icon}
      </span>
      <span className={`${collapsed ? 'sr-only' : ''}`}>{label}</span>
    </Link>
  )
}

function isActivePath(pathname: string, href: string) {
  if (href === '/portal') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
