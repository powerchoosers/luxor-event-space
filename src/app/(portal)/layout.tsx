import type { Metadata } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import { 
  Users, 
  Mail, 
  FileText, 
  Phone, 
  LayoutDashboard, 
  Settings, 
  LogOut,
  Bell,
  Search,
  MessageSquare,
  Calendar
} from "lucide-react";
import Link from "next/link";
import React from "react";
import '../globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Luxor | Owner Portal',
  description: 'Luxor event space owner command center.',
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${cormorant.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-screen bg-[#0a0a0a] text-zinc-400 font-sans selection:bg-blue-500/30">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 h-full w-64 border-r border-zinc-900 bg-black/50 backdrop-blur-xl z-50">
        <div className="p-6 flex flex-col h-full">
          {/* Logo / Title */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-lg bg-[#002FA7] flex items-center justify-center shadow-lg shadow-[#002FA7]/20">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm leading-tight tracking-tight uppercase">Luxor</h1>
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest leading-none">Command Center</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-1">
            <SidebarLink href="/portal" icon={<LayoutDashboard size={18} />} label="Overview" active />
            <SidebarLink href="/portal/leads" icon={<Users size={18} />} label="Leads & Clients" />
            <SidebarLink href="/portal/marketing" icon={<Mail size={18} />} label="Marketing" />
            <SidebarLink href="/portal/invoices" icon={<FileText size={18} />} label="Invoices" />
            <SidebarLink href="/portal/communications" icon={<Phone size={18} />} label="Communications" />
            <SidebarLink href="/portal/calendar" icon={<Calendar size={18} />} label="Event Calendar" />
          </nav>

          {/* Bottom Actions */}
          <div className="mt-auto pt-6 border-t border-zinc-900 space-y-2">
            <SidebarLink href="/portal/settings" icon={<Settings size={18} />} label="System Settings" />
            <button className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium transition-all hover:bg-red-500/5 hover:text-red-400 group">
              <LogOut size={18} className="group-hover:translate-x-1 transition-transform" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 h-16 border-b border-zinc-900 bg-black/40 backdrop-blur-md z-40 flex items-center justify-between px-8">
          <div className="flex items-center gap-4 bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800">
            <Search size={14} className="text-zinc-600" />
            <input 
              type="text" 
              placeholder="Search leads, events, or invoices..." 
              className="bg-transparent border-none outline-none text-xs w-64 text-zinc-300 placeholder:text-zinc-600 font-medium"
            />
          </div>

          <div className="flex items-center gap-5">
            <button className="relative p-2 rounded-full hover:bg-zinc-900 transition-colors group">
              <Bell size={18} className="text-zinc-400 group-hover:text-white transition-colors" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-black"></span>
            </button>
            <button className="p-2 rounded-full hover:bg-zinc-900 transition-colors">
              <MessageSquare size={18} className="text-zinc-400" />
            </button>
            <div className="h-8 w-px bg-zinc-900 mx-1"></div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-semibold text-white leading-none">Admin Owner</p>
                <p className="text-[10px] text-zinc-500 font-medium leading-none mt-1 uppercase tracking-tighter">Owner Portfolio</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden ring-2 ring-zinc-900">
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-80" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
      </body>
    </html>
  );
}

function SidebarLink({ href, icon, label, active = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link 
      href={href} 
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group
        ${active 
          ? 'bg-zinc-900/80 text-white border border-white/5 shadow-inner shadow-white/5' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40'
        }
      `}
    >
      <span className={`${active ? 'text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'text-zinc-600 group-hover:text-zinc-400'} transition-colors`}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
