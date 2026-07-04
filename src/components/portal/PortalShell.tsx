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
  Phone,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'

const navItems = [
  { href: '/portal', icon: <LayoutDashboard size={18} />, label: 'Overview' },
  { href: '/portal/leads', icon: <Users size={18} />, label: 'Leads & Clients' },
  { href: '/portal/marketing', icon: <Mail size={18} />, label: 'Marketing' },
  { href: '/portal/invoices', icon: <FileText size={18} />, label: 'Invoices' },
  { href: '/portal/communications', icon: <Phone size={18} />, label: 'Communications' },
  { href: '/portal/calendar', icon: <Calendar size={18} />, label: 'Event Calendar' },
]

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <body className="h-screen overflow-hidden bg-[#080706] font-sans text-zinc-400 selection:bg-[#caa24c]/30">
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-64 border-r border-[#caa24c]/10 bg-[#050505]/90 backdrop-blur-xl lg:block">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_20%_0%,rgba(202,162,76,0.14),transparent_16rem)]" />
        <div className="flex h-full flex-col p-6">
          <Link href="/portal" className="mb-8 flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50" aria-label="Luxor portal overview">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/80 bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(241,210,122,0.8)]">
              <Image
                src="/luxor-brand-mark.png"
                alt="Luxor"
                width={44}
                height={44}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-sm font-semibold uppercase leading-tight tracking-[0.22em] text-white">Luxor</h1>
              <p className="text-[10px] font-medium uppercase leading-none tracking-widest text-[#caa24c]">Owner Portal</p>
            </div>
          </Link>

          <div className="mb-6 rounded-xl border border-[#caa24c]/16 bg-[#120d0c]/72 p-4 shadow-[inset_0_1px_0_rgba(241,210,122,0.08)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#caa24c]">Website Signal</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Tour requests from the public site flow directly into this workspace.</p>
            <Link href="/" className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:text-[#f1d27a]">
              View site <ExternalLink size={12} />
            </Link>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <SidebarLink key={item.href} {...item} active={isActivePath(pathname, item.href)} />
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-[#caa24c]/10 pt-6">
            <SidebarLink href="/portal/settings" icon={<Settings size={18} />} label="System Settings" active={pathname === '/portal/settings'} />
            <button className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-500 transition-all hover:bg-red-500/5 hover:text-red-400">
              <LogOut size={18} className="transition-transform group-hover:translate-x-1" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex h-screen flex-col lg:pl-64">
        <header className="z-40 flex h-16 shrink-0 items-center justify-between border-b border-[#caa24c]/10 bg-[#050505]/75 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/portal" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white p-1.5 shadow-[0_14px_34px_-22px_rgba(241,210,122,0.85)] lg:hidden" aria-label="Luxor portal overview">
              <Image src="/luxor-brand-mark.png" alt="Luxor" width={32} height={32} className="h-full w-full object-contain" priority />
            </Link>
            <div className="relative hidden w-[min(24rem,36vw)] items-center rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 sm:flex">
              <Search size={14} className="shrink-0 text-zinc-600" />
              <input
                type="text"
                placeholder="Search leads, events, or invoices..."
                className="w-full bg-transparent px-2 text-xs font-medium text-zinc-300 outline-none placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-5">
            <Link href="/" className="hidden items-center gap-2 rounded-lg border border-[#caa24c]/18 bg-[#120d0c]/70 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#caa24c] transition-colors hover:border-[#f1d27a]/40 hover:text-[#f1d27a] md:inline-flex">
              Public site <ExternalLink size={12} />
            </Link>
            <button className="relative rounded-full p-2 transition-colors hover:bg-zinc-900" aria-label="Notifications">
              <Bell size={18} className="text-zinc-400 transition-colors" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-black bg-blue-500" />
            </button>
            <button className="rounded-full p-2 transition-colors hover:bg-zinc-900" aria-label="Messages">
              <MessageSquare size={18} className="text-zinc-400" />
            </button>
            <div className="mx-1 hidden h-8 w-px bg-zinc-900 sm:block" />
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold leading-none text-white">Admin Owner</p>
                <p className="mt-1 text-[10px] font-medium uppercase leading-none tracking-tighter text-zinc-500">Owner Portfolio</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 ring-2 ring-zinc-900">
                <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-80" />
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
                <span className={active ? 'text-[#caa24c]' : 'text-zinc-600'}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_78%_0%,rgba(189,101,117,0.08),transparent_24rem),radial-gradient(circle_at_8%_12%,rgba(202,162,76,0.08),transparent_22rem)] p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </body>
  )
}

function SidebarLink({
  href,
  icon,
  label,
  active = false,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'border border-[#caa24c]/18 bg-[#120d0c] text-white shadow-inner shadow-[#caa24c]/5'
          : 'text-zinc-500 hover:bg-zinc-900/40 hover:text-zinc-300'
      }`}
    >
      <span className={`${active ? 'text-[#caa24c] shadow-[0_0_15px_rgba(202,162,76,0.26)]' : 'text-zinc-600 group-hover:text-zinc-400'} transition-colors`}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  )
}

function isActivePath(pathname: string, href: string) {
  if (href === '/portal') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
