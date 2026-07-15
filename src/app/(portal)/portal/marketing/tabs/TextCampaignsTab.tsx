'use client'

import React, { useState, useMemo } from 'react'
import {
  MessageSquare,
  Plus,
  Send,
  Calendar,
  Smartphone,
  Eye,
  Settings,
  HelpCircle,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  Trash2,
  Sparkles
} from 'lucide-react'
import { PortalModal, PortalSelect, PortalDatePicker } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type SmsCampaign = {
  id: string
  name: string
  message: string
  status: 'active' | 'scheduled' | 'draft' | 'completed'
  sent_count: number
  delivered_count: number
  reply_count: number
  click_count: number
  opt_out_count: number
  bookings_count: number
  scheduled_for?: string
}

export function TextCampaignsTab() {
  const { notify } = useToast()
  const [filter, setFilter] = useState<'all' | 'active' | 'scheduled' | 'draft' | 'completed'>('all')
  const [isNewSmsModalOpen, setIsNewSmsModalOpen] = useState(false)
  
  // SMS campaigns state
  const [smsCampaigns, setSmsCampaigns] = useState<SmsCampaign[]>([
    {
      id: '1',
      name: 'Venue Open House Invite',
      message: 'Luxor Event Space: Join us this Saturday at 2 PM for our Grand Opening! Tour the venue, meet caterers, and get $500 off if you book. RSVP here: luxoratlaspalmas.com/tour',
      status: 'completed',
      sent_count: 850,
      delivered_count: 844,
      reply_count: 185,
      click_count: 92,
      opt_out_count: 12,
      bookings_count: 6
    },
    {
      id: '2',
      name: 'Quinceañera Showcase Follow-up',
      message: 'Luxor Event Space: Thanks for attending our showcase! We have remaining Autumn Saturdays open. View pricing and lock in your date: luxoratlaspalmas.com/pricing',
      status: 'active',
      sent_count: 240,
      delivered_count: 238,
      reply_count: 42,
      click_count: 18,
      opt_out_count: 3,
      bookings_count: 1
    },
    {
      id: '3',
      name: 'Black Friday VIP Discount',
      message: 'Luxor Event Space: VIP Offer! Book your 2026 wedding or quinceañera by Nov 30 & get a free champagne toast package ($750 value). Text back to hold your tour slot!',
      status: 'scheduled',
      sent_count: 1250,
      delivered_count: 0,
      reply_count: 0,
      click_count: 0,
      opt_out_count: 0,
      bookings_count: 0,
      scheduled_for: '2026-11-27T09:00:00'
    }
  ])

  // New SMS Campaign Form
  const [smsName, setSmsName] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [smsScheduleTime, setSmsScheduleTime] = useState('')
  const [isScheduling, setIsScheduling] = useState('now') // 'now' or 'schedule'

  // Summary Metrics
  const summary = useMemo(() => {
    const sent = smsCampaigns.reduce((sum, c) => sum + c.sent_count, 0)
    const delivered = smsCampaigns.reduce((sum, c) => sum + c.delivered_count, 0)
    const replies = smsCampaigns.reduce((sum, c) => sum + c.reply_count, 0)
    const clicks = smsCampaigns.reduce((sum, c) => sum + c.click_count, 0)
    const optOuts = smsCampaigns.reduce((sum, c) => sum + c.opt_out_count, 0)
    const bookings = smsCampaigns.reduce((sum, c) => sum + c.bookings_count, 0)

    const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0.0'
    const replyRate = delivered > 0 ? ((replies / delivered) * 100).toFixed(1) : '0.0'
    const clickRate = delivered > 0 ? ((clicks / delivered) * 100).toFixed(1) : '0.0'
    const optOutRate = delivered > 0 ? ((optOuts / delivered) * 100).toFixed(1) : '0.0'

    return {
      sent,
      deliveryRate,
      replyRate,
      clickRate,
      optOutRate,
      bookings
    }
  }, [smsCampaigns])

  const filteredCampaigns = useMemo(() => {
    return smsCampaigns.filter(c => {
      if (filter === 'all') return true
      return c.status === filter
    })
  }, [smsCampaigns, filter])

  function handleCreateSmsCampaign(e: React.FormEvent) {
    e.preventDefault()
    if (!smsName.trim() || !smsMessage.trim()) {
      notify({ title: 'Validation error', description: 'Please fill in all fields.', variant: 'error' })
      return
    }

    const newCampaign: SmsCampaign = {
      id: String(smsCampaigns.length + 1),
      name: smsName,
      message: smsMessage,
      status: isScheduling === 'schedule' ? 'scheduled' : 'active',
      sent_count: isScheduling === 'schedule' ? 520 : 0,
      delivered_count: 0,
      reply_count: 0,
      click_count: 0,
      opt_out_count: 0,
      bookings_count: 0,
      scheduled_for: isScheduling === 'schedule' ? smsScheduleTime || new Date().toISOString() : undefined
    }

    setSmsCampaigns([newCampaign, ...smsCampaigns])
    setIsNewSmsModalOpen(false)
    setSmsName('')
    setSmsMessage('')
    setSmsScheduleTime('')

    notify({
      title: isScheduling === 'schedule' ? 'SMS Campaign Scheduled' : 'SMS Campaign Sent',
      description: `"${smsName}" has been successfully configured.`,
      variant: 'success'
    })
  }

  // Pre-fill SMS Templates
  const smsTemplates = [
    { title: 'Welcome Follow-up', text: 'Luxor Event Space: Thanks for requesting pricing details! Click here to download our full event guide: luxoratlaspalmas.com/pricing' },
    { title: 'Tour Confirmation', text: 'Luxor Event Space: Your private tour is confirmed for tomorrow! Here are directions to our ballroom: maps.google.com/?q=803+Castroville+Rd' },
    { title: 'Promo Flash Sale', text: 'Luxor Event Space: Flash Sale! Book this week and receive an upgraded LED lighting package free ($500 value). Reply YES to speak with an planner.' }
  ]

  return (
    <div className="space-y-6">
      {/* Analytics Mini KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        <StatsMiniCard label="Texts Sent" value={summary.sent.toLocaleString()} detail="total messages" />
        <StatsMiniCard label="Delivered" value={`${summary.deliveryRate}%`} detail="success rate" />
        <StatsMiniCard label="Reply Rate" value={`${summary.replyRate}%`} detail="user replies" />
        <StatsMiniCard label="Click Rate" value={`${summary.clickRate}%`} detail="link traffic" />
        <StatsMiniCard label="Opt-Out Rate" value={`${summary.optOutRate}%`} detail="stop keyword" />
        <StatsMiniCard label="Bookings" value={String(summary.bookings)} detail="attributable booked" />
      </div>

      {/* Campaign Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-1 rounded-xl border border-zinc-900 bg-zinc-950/20 p-1 overflow-x-auto">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All SMS" />
          <FilterTab active={filter === 'active'} onClick={() => setFilter('active')} label="Active" />
          <FilterTab active={filter === 'scheduled'} onClick={() => setFilter('scheduled')} label="Scheduled" />
          <FilterTab active={filter === 'completed'} onClick={() => setFilter('completed')} label="Completed" />
        </div>

        <button
          onClick={() => setIsNewSmsModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-black shadow-xl shadow-[#caa24c]/20 transition-all hover:bg-[#dfbd68] hover:scale-105 active:scale-95"
        >
          <Plus size={13} /> Create SMS Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Campaign List */}
        <div className="md:col-span-2 space-y-4">
          {filteredCampaigns.length > 0 ? (
            filteredCampaigns.map((camp) => (
              <div key={camp.id} className="luxor-glass-card hover:border-zinc-800 transition-all overflow-hidden rounded-2xl border border-zinc-900/60 bg-zinc-950/20 p-6 shadow-xl space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-900/40 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <Smartphone size={16} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white leading-tight">{camp.name}</h4>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1">ID: #{camp.id}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                    camp.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : camp.status === 'active'
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                  }`}>
                    {camp.status}
                  </span>
                </div>

                <div className="rounded-xl border border-zinc-900 bg-zinc-950/40 p-4 font-sans text-xs text-zinc-300 leading-relaxed italic">
                  &ldquo;{camp.message}&rdquo;
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 text-center font-mono">
                  <MetricMini label="Sent" value={String(camp.sent_count)} />
                  <MetricMini label="Replies" value={String(camp.reply_count)} />
                  <MetricMini label="Clicks" value={String(camp.click_count)} />
                  <MetricMini label="Opt-Outs" value={String(camp.opt_out_count)} />
                  <MetricMini label="Bookings" value={String(camp.bookings_count)} />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-zinc-900 bg-black/30 p-12 text-center text-xs text-zinc-650">
              No SMS campaigns match your filters.
            </div>
          )}
        </div>

        {/* Right side: SMS Templates & Quick Assistance */}
        <div className="space-y-6">
          <div className="luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">SMS Templates</h3>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Quick templates you can copy and paste into the editor. Keep SMS under 160 characters to avoid multiple segment billing fees.
            </p>
            <div className="space-y-3 pt-2">
              {smsTemplates.map((tpl, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSmsMessage(tpl.text)
                    setIsNewSmsModalOpen(true)
                  }}
                  className="group cursor-pointer rounded-xl border border-zinc-900 bg-zinc-950/40 p-3 hover:border-zinc-800 transition-colors"
                >
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#caa24c] border-b border-zinc-900 pb-1.5 mb-1.5">
                    <span>{tpl.title}</span>
                    <span className="text-zinc-650 font-mono font-medium">{tpl.text.length} chars</span>
                  </div>
                  <p className="text-[10px] text-zinc-550 leading-relaxed truncate group-hover:text-zinc-350 transition-colors">
                    {tpl.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 text-center space-y-3">
            <HelpCircle size={18} className="mx-auto text-zinc-650" />
            <h4 className="text-xs font-bold text-white uppercase tracking-widest">Compliance & Rules</h4>
            <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
              Ensure all message queues include &quot;Reply STOP to opt out&quot; keywords to respect cellular marketing compliance laws.
            </p>
          </div>
        </div>
      </div>

      {/* New SMS Modal */}
      <PortalModal
        isOpen={isNewSmsModalOpen}
        onClose={() => setIsNewSmsModalOpen(false)}
        title="Create SMS Campaign"
      >
        <form onSubmit={handleCreateSmsCampaign} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Campaign Name</label>
            <input
              type="text"
              required
              value={smsName}
              onChange={(e) => setSmsName(e.target.value)}
              placeholder="e.g. Autumn Wedding Flash Sale"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Message Content</label>
              <span className={`text-[9px] font-mono font-black ${smsMessage.length > 160 ? 'text-rose-400' : 'text-zinc-600'}`}>
                {smsMessage.length}/160 chars ({Math.ceil(smsMessage.length / 160)} segment)
              </span>
            </div>
            <textarea
              required
              rows={4}
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              placeholder="Luxor Event Space: Don't miss out on..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40 leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Delivery Schedule</label>
            <div className="grid grid-cols-2 gap-2 p-1 border border-zinc-900 bg-zinc-950/60 rounded-xl">
              <button
                type="button"
                onClick={() => setIsScheduling('now')}
                className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors ${
                  isScheduling === 'now' ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'text-zinc-550 hover:text-zinc-300'
                }`}
              >
                Send Now
              </button>
              <button
                type="button"
                onClick={() => setIsScheduling('schedule')}
                className={`py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors ${
                  isScheduling === 'schedule' ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'text-zinc-550 hover:text-zinc-300'
                }`}
              >
                Schedule Time
              </button>
            </div>
          </div>

          {isScheduling === 'schedule' && (
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Date & Time</label>
              <PortalDatePicker
                value={smsScheduleTime}
                onChange={setSmsScheduleTime}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-900 pt-4 mt-6">
            <button
              type="button"
              onClick={() => setIsNewSmsModalOpen(false)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-[#caa24c] px-5 py-2 text-xs font-black uppercase tracking-wider text-black shadow-xl shadow-[#caa24c]/10 hover:bg-[#dfbd68]"
            >
              <Send size={12} />
              <span>{isScheduling === 'schedule' ? 'Schedule' : 'Send'}</span>
            </button>
          </div>
        </form>
      </PortalModal>
    </div>
  )
}

function StatsMiniCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="luxor-glass-card rounded-xl border border-zinc-900 bg-zinc-950/20 p-4">
      <p className="text-[8px] font-black uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <h3 className="font-mono text-base font-bold text-white mt-1.5">{value}</h3>
      <p className="text-[8px] text-zinc-500 mt-1">{detail}</p>
    </div>
  )
}

function FilterTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all ${
        active
          ? 'bg-[#caa24c]/10 text-[#caa24c]'
          : 'text-zinc-550 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-zinc-900/60 last:border-r-0">
      <p className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold text-white mt-1">{value}</p>
    </div>
  )
}
