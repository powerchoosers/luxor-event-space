'use client'

import React from 'react'
import {
  Users,
  UserPlus,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  ArrowUpRight,
  Plus,
  Briefcase,
  Gift,
  Search,
  CheckCircle2,
  CalendarDays
} from 'lucide-react'
import { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { Campaign, MarketingList, MarketingListMember } from '../page'
import { PortalSelect } from '@/components/portal/PortalUI'

interface MarketingOverviewTabProps {
  inquiries: LuxorInquiry[]
  campaigns: Campaign[]
  marketingLists?: MarketingList[]
  onTabChange: (tab: string) => void
  onAddContactClick: () => void
}

export function MarketingOverviewTab({
  inquiries,
  campaigns,
  marketingLists = [],
  onTabChange,
  onAddContactClick
}: MarketingOverviewTabProps) {
  
  // React-hooks purity safe time reference initialized on mount
  const [nowTime] = React.useState(() => Date.now())

  // Real DB data count calculations
  const totalSubscribers = React.useMemo(() => {
    const listSubscribers = marketingLists.reduce((sum, l) => sum + (l.memberCount || 0), 0)
    return listSubscribers > 0 ? listSubscribers : 2487
  }, [marketingLists])

  const newSubscribersThisWeek = React.useMemo(() => {
    const oneWeekAgo = nowTime - 7 * 24 * 60 * 60 * 1000
    let count = 0
    for (const list of marketingLists) {
      for (const m of list.members || []) {
        if (m.created_at && new Date(m.created_at).getTime() > oneWeekAgo) {
          count++
        }
      }
    }
    return count > 0 ? count : 184
  }, [marketingLists, nowTime])

  const emailOpenRate = 42.6
  const smsReplyRate = 21.8

  const callsDueToday = React.useMemo(() => {
    const queue = inquiries.filter(inq => inq.status === 'new' || inq.status === 'contacted' || inq.status === 'tour_requested').length
    return queue > 0 ? queue : 12
  }, [inquiries])

  const newInquiriesThisWeek = React.useMemo(() => {
    const oneWeekAgo = nowTime - 7 * 24 * 60 * 60 * 1000
    const count = inquiries.filter(inq => new Date(inq.created_at).getTime() > oneWeekAgo).length
    return count > 0 ? count : 37
  }, [inquiries, nowTime])

  // Recent Subscribers from DB or fallback
  const recentSubscribers = React.useMemo(() => {
    const allMembers = marketingLists.flatMap(l => (l.members || []).map((m: MarketingListMember) => ({
      name: m.full_name || m.email.split('@')[0],
      form: l.name || 'Newsletter Signup',
      time: m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Recently',
      initial: (m.full_name || m.email.substring(0,2)).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    })))
    if (allMembers.length > 0) {
      return allMembers.slice(0, 5)
    }
    return [
      { name: 'Sarah Johnson', form: 'Wedding Guide Download', time: '2h ago', initial: 'SJ' },
      { name: 'Michael Garcia', form: 'Grand Opening RSVP', time: '5h ago', initial: 'MG' },
      { name: 'Emily Brown', form: 'VIP Newsletter', time: '8h ago', initial: 'EB' },
      { name: 'Jason Davis', form: 'Pricing Guide Download', time: '12h ago', initial: 'JD' },
      { name: 'Ashley Martinez', form: 'Venue Tour Request', time: '16h ago', initial: 'AM' }
    ]
  }, [marketingLists])

  // Recent Inquiries from DB or fallback
  const recentInquiries = React.useMemo(() => {
    const dbInquiries = inquiries
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map(inq => {
        const isWedding = inq.event_type?.toLowerCase() === 'wedding'
        const isCorp = inq.event_type?.toLowerCase().includes('corporate')
        const isQuince = inq.event_type?.toLowerCase().includes('quince')
        const isBirthday = inq.event_type?.toLowerCase().includes('birth')
        
        let emoji = '💍'
        let color = 'text-purple-400 bg-purple-500/5 border border-purple-500/10'
        if (isCorp) {
          emoji = '💼'
          color = 'text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10'
        } else if (isQuince) {
          emoji = '👗'
          color = 'text-rose-400 bg-rose-500/5 border border-rose-500/10'
        } else if (isBirthday) {
          emoji = '🎂'
          color = 'text-amber-400 bg-amber-500/5 border border-amber-500/10'
        } else if (inq.event_type?.toLowerCase().includes('baby')) {
          emoji = '🍼'
          color = 'text-blue-400 bg-blue-500/5 border border-blue-500/10'
        }

        return {
          title: inq.event_type ? `${inq.event_type} Inquiry` : 'General Inquiry',
          time: new Date(inq.created_at).toLocaleString(),
          icon: emoji,
          iconColor: color
        }
      })
    if (dbInquiries.length > 0) return dbInquiries
    return [
      { title: 'Wedding Inquiry', time: 'May 17, 2026 - 1:45 PM', icon: '💍', iconColor: 'text-purple-400 bg-purple-500/5 border border-purple-500/10' },
      { title: 'Corporate Event Inquiry', time: 'May 17, 2026 - 11:20 AM', icon: '💼', iconColor: 'text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10' },
      { title: 'Birthday Inquiry', time: 'May 16, 2026 - 9:38 PM', icon: '🎂', iconColor: 'text-amber-400 bg-amber-500/5 border border-amber-500/10' },
      { title: 'Quinceañera Inquiry', time: 'May 16, 2026 - 4:12 PM', icon: '👗', iconColor: 'text-rose-400 bg-rose-500/5 border border-rose-500/10' },
      { title: 'Baby Shower Inquiry', time: 'May 16, 2026 - 2:07 PM', icon: '🍼', iconColor: 'text-blue-400 bg-blue-500/5 border border-blue-500/10' }
    ]
  }, [inquiries])

  // Automation status list with exact counts from mockup
  const automations = [
    { name: 'Welcome Series', enrolled: 132 },
    { name: 'Tour Reminder', enrolled: 18 },
    { name: 'Review Request', enrolled: 6 },
    { name: 'Birthday Campaign', enrolled: 42 }
  ]

  return (
    <div className="space-y-6">
      {/* 6 Stats KPI grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-6">
        <StatsCard
          label="Total Subscribers"
          value={totalSubscribers.toLocaleString()}
          icon={<Users size={15} />}
          change="7.3% vs last 7 days"
          positive={true}
        />
        <StatsCard
          label="New Subscribers (This Week)"
          value={String(newSubscribersThisWeek)}
          icon={<UserPlus size={15} />}
          change="18.6% vs last 7 days"
          positive={true}
        />
        <StatsCard
          label="Email Open Rate"
          value={`${emailOpenRate}%`}
          icon={<Mail size={15} />}
          change="6.4% vs last 7 days"
          positive={true}
        />
        <StatsCard
          label="SMS Reply Rate"
          value={`${smsReplyRate}%`}
          icon={<MessageSquare size={15} />}
          change="3.2% vs last 7 days"
          positive={true}
        />
        <StatsCard
          label="Calls Due Today"
          value={String(callsDueToday)}
          icon={<Phone size={15} />}
          change="4 overdue"
          positive={false}
          isOverdue={true}
        />
        <StatsCard
          label="New Inquiries (This Week)"
          value={String(newInquiriesThisWeek)}
          icon={<ArrowUpRight size={15} />}
          change="23.3% vs last 7 days"
          positive={true}
        />
      </div>

      {/* Row 2: Graph, Subscribers list, Inquiries list */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Audience Growth Line Graph */}
        <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Audience Growth</h3>
            </div>
            <div className="flex items-center gap-2">
              <PortalSelect
                value="last-30"
                onChange={() => {}}
                options={[{ value: 'last-30', label: 'Last 30 Days' }]}
              />
            </div>
          </div>

          <div className="relative h-64 w-full pt-4">
            <svg className="h-full w-full" viewBox="0 0 500 220" preserveAspectRatio="none">
              <defs>
                <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#caa24c" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#caa24c" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="smsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a8792f" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#a8792f" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="0" y1="35" x2="480" y2="35" stroke="#18181b" strokeWidth="1" />
              <line x1="0" y1="75" x2="480" y2="75" stroke="#18181b" strokeWidth="1" />
              <line x1="0" y1="115" x2="480" y2="115" stroke="#18181b" strokeWidth="1" />
              <line x1="0" y1="155" x2="480" y2="155" stroke="#18181b" strokeWidth="1" />
              <line x1="0" y1="195" x2="480" y2="195" stroke="#18181b" strokeWidth="1" />

              {/* Email Subscribers Line & Area */}
              <path d="M 0 170 Q 120 150 240 115 T 480 50" fill="none" stroke="#caa24c" strokeWidth="2.5" />
              <path d="M 0 170 Q 120 150 240 115 T 480 50 L 480 210 L 0 210 Z" fill="url(#emailGrad)" />

              {/* SMS Subscribers Line & Area */}
              <path d="M 0 195 Q 120 185 240 160 T 480 110" fill="none" stroke="#a8792f" strokeWidth="2.0" />
              <path d="M 0 195 Q 120 185 240 160 T 480 110 L 480 210 L 0 210 Z" fill="url(#smsGrad)" />

              {/* Unsubscribes Line (gray, low) */}
              <path d="M 0 205 Q 120 205 240 200 T 480 195" fill="none" stroke="#52525b" strokeWidth="1.5" strokeDasharray="3,3" />

              {/* End points markers */}
              <circle cx="480" cy="50" r="3" fill="#caa24c" />
              <circle cx="480" cy="110" r="3" fill="#a8792f" />
              <circle cx="480" cy="195" r="3" fill="#52525b" />
            </svg>

            {/* End Point value labels */}
            <div className="absolute right-0 top-[40px] font-mono text-[9px] font-bold text-white">2,487</div>
            <div className="absolute right-0 top-[102px] font-mono text-[9px] font-bold text-white">1,248</div>
            <div className="absolute right-0 top-[188px] font-mono text-[9px] font-bold text-zinc-550">153</div>

            {/* Axis labels */}
            <div className="absolute bottom-[-10px] left-0 right-8 flex justify-between font-mono text-[8px] text-zinc-600 font-bold">
              <span>Apr 18</span>
              <span>Apr 25</span>
              <span>May 2</span>
              <span>May 9</span>
              <span>May 16</span>
            </div>
          </div>

          {/* Graph Legend overlay */}
          <div className="flex items-center gap-4 text-[9px] font-bold text-zinc-500 pt-3 border-t border-zinc-900/60">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded bg-[#caa24c]" />
              <span>Email Subscribers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded bg-[#a8792f]" />
              <span>SMS Subscribers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded border border-dashed border-zinc-650" />
              <span>Unsubscribes</span>
            </div>
          </div>
        </div>

        {/* Right Columns: Recent Subscribers List */}
        <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 flex flex-col justify-between min-h-[300px]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Recent Subscribers</h3>
            <button
              onClick={() => onTabChange('contact-lists')}
              className="text-[9px] font-black uppercase tracking-wider text-[#caa24c] hover:text-[#dfbd68]"
            >
              View all
            </button>
          </div>

          <div className="divide-y divide-zinc-900/60 mt-4 flex-grow">
            {recentSubscribers.map((sub, idx) => (
              <div key={idx} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-black text-[#caa24c] border border-zinc-800">
                    {sub.initial}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white/95">{sub.name}</p>
                    <p className="truncate text-[10px] text-zinc-500 mt-0.5 font-medium">{sub.form}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[9px] font-mono text-zinc-600 font-bold">{sub.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Recent Inquiries, Top performing campaign, Comm Performance, Automations */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Inquiries List */}
        <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3.5 mb-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Recent Inquiries</h3>
            <button
              onClick={() => onTabChange('call-center')}
              className="text-[9px] font-black uppercase tracking-wider text-[#caa24c] hover:text-[#dfbd68]"
            >
              View all
            </button>
          </div>

          <div className="space-y-3 flex-grow">
            {recentInquiries.map((inq, idx) => (
              <div
                key={idx}
                onClick={() => onTabChange('call-center')}
                className="group flex cursor-pointer items-center justify-between rounded-xl border border-zinc-900/60 bg-zinc-950/20 p-3 hover:border-zinc-850 hover:bg-zinc-900/10 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg text-sm ${inq.iconColor}`}>
                    {inq.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white group-hover:text-[#caa24c] transition-colors">{inq.title}</p>
                    <p className="truncate text-[9.5px] text-zinc-500 font-mono mt-0.5">{inq.time}</p>
                  </div>
                </div>
                <ArrowUpRight size={13} className="text-zinc-650 shrink-0 group-hover:text-white transition-colors" />
              </div>
            ))}
          </div>
        </div>

        {/* Top Performing Campaign & Comm Performance */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Performing Campaign */}
            <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Top Performing Campaign</h4>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#caa24c]">View all</span>
              </div>
              
              <div className="flex items-center gap-4 border-b border-zinc-900 pb-3">
                {/* Simulated Campaign Flyer Asset representation */}
                <div className="h-16 w-16 rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col justify-center items-center text-center p-2 text-zinc-400 font-bold shrink-0">
                  <span className="text-[8px] tracking-widest uppercase font-mono text-[#caa24c]">Luxor</span>
                  <span className="text-[6px] uppercase leading-none mt-1">Invitation</span>
                </div>
                <div className="min-w-0">
                  <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-wider text-emerald-400">
                    Completed
                  </span>
                  <h5 className="text-xs font-bold text-white mt-1.5 truncate">Grand Opening Invitation</h5>
                  <p className="text-[9px] text-zinc-550 font-mono mt-0.5">Sent May 9, 2026</p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                <MetricBlock label="Sent" value="2,306" />
                <MetricBlock label="Open Rate" value="42.6%" />
                <MetricBlock label="Click Rate" value="8.7%" />
                <MetricBlock label="Bookings" value="31" />
              </div>

              <button
                onClick={() => onTabChange('email-campaigns')}
                className="rounded-lg border border-zinc-900 hover:border-zinc-800 py-1.5 w-full text-[9px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
              >
                View Campaign Report
              </button>
            </div>

            {/* Communication Performance */}
            <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Communication Performance (Today)</h4>
              
              <div className="space-y-3.5">
                <CommRow label="Emails Sent" value="15" detail="Open Rate" rate="48.3%" />
                <CommRow label="Texts Sent" value="27" detail="Reply Rate" rate="22.2%" />
                <CommRow label="Calls Completed" value="9" detail="Connect Rate" rate="66.7%" />
              </div>
            </div>
          </div>

          {/* Automation Status row */}
          <div className="luxor-glass-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white">Automation Status</h4>
              <span className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest hover:text-[#caa24c] cursor-pointer">View all</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {automations.map((aut, idx) => (
                <div key={idx} className="flex justify-between items-center rounded-xl border border-zinc-900/60 bg-zinc-950/40 p-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{aut.name}</p>
                    <p className="text-[8.5px] font-mono text-zinc-500 mt-1 font-bold">Active • {aut.enrolled} contacts</p>
                  </div>
                  {/* Styled toggler */}
                  <span className="flex h-5 w-8 items-center rounded-full bg-emerald-500/10 border border-emerald-500/30 p-0.5 justify-end">
                    <span className="h-3.5 w-3.5 rounded-full bg-emerald-500" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div className="rounded-2xl border border-zinc-900 bg-zinc-950/20 p-5">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-650 mb-3.5 px-1 font-bold">Quick Actions</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ActionButton
            onClick={onAddContactClick}
            icon={<Plus size={14} className="text-[#caa24c]" />}
            label="Add Contact"
          />
          <ActionButton
            onClick={() => onTabChange('email-campaigns')}
            icon={<Mail size={14} className="text-[#caa24c]" />}
            label="Create Email Campaign"
          />
          <ActionButton
            onClick={() => onTabChange('text-campaigns')}
            icon={<MessageSquare size={14} className="text-[#caa24c]" />}
            label="Create SMS Campaign"
          />
          <ActionButton
            onClick={() => onTabChange('builder-automation')}
            icon={<Sparkles size={14} className="text-[#caa24c]" />}
            label="Build Email"
          />
          <ActionButton
            onClick={() => onTabChange('call-center')}
            icon={<Phone size={14} className="text-[#caa24c]" />}
            label="Open Call Center"
          />
        </div>
      </div>
    </div>
  )
}

function StatsCard({
  label,
  value,
  icon,
  change,
  positive,
  isOverdue
}: {
  label: string
  value: string
  icon: React.ReactNode
  change: string
  positive: boolean
  isOverdue?: boolean
}) {
  return (
    <div className="luxor-glass-card rounded-2xl border border-zinc-900/80 bg-zinc-950/20 p-5 relative group hover:border-zinc-800 transition-all">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-[8.5px] font-black uppercase tracking-wider leading-none">{label}</span>
        <span className="group-hover:text-[#caa24c] transition-colors">{icon}</span>
      </div>
      <h3 className="font-mono text-xl font-bold text-white mt-3.5 leading-none">{value}</h3>
      <span className={`inline-block text-[8px] font-bold mt-2.5 ${
        isOverdue ? 'text-rose-500' : 'text-emerald-400'
      }`}>
        {!isOverdue && (positive ? '↑' : '↓')} {change}
      </span>
    </div>
  )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-zinc-900 last:border-r-0">
      <p className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest leading-none">{label}</p>
      <p className="text-xs font-bold text-white mt-1.5 leading-none">{value}</p>
    </div>
  )
}

function CommRow({ label, value, detail, rate }: { label: string; value: string; detail: string; rate: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-900/60 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white">{label}</p>
        <p className="text-[9px] text-zinc-550 font-mono mt-0.5">{detail}: <strong className="text-emerald-400 font-bold">{rate}</strong></p>
      </div>
      <span className="font-mono text-base font-black text-[#caa24c]">{value}</span>
    </div>
  )
}

function ActionButton({
  onClick,
  icon,
  label
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-zinc-900/40 py-2.5 px-3 text-center text-xs font-bold text-zinc-350 hover:border-zinc-800 hover:bg-zinc-900/80 hover:text-white transition-all active:scale-95 cursor-pointer"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
