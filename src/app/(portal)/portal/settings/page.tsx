'use client'

import React, { useState } from 'react'
import {
  Settings,
  Building,
  Image,
  Mail,
  Bell,
  Cpu,
  Clock,
  Plus,
  Trash2,
  Lock,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalTableCard,
  PortalSelect
} from '@/components/portal/PortalUI'

type Tab =
  | 'business'
  | 'branding'
  | 'notifications'
  | 'team'
  | 'integrations'
  | 'hours'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('business')
  const [saving, setSaving] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      alert('Settings saved successfully.')
    }, 800)
  }

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Settings size={18} />}
        title="System Settings"
        description="Configure Luxor business configurations, brand assets, email automated routing, and external API channels."
      />

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        {[
          { id: 'business', label: 'Venue Information', icon: <Building size={15} /> },
          { id: 'branding', label: 'Portal Branding', icon: <Image size={15} /> },
          { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
          { id: 'team', label: 'Team & Permissions', icon: <Lock size={15} /> },
          { id: 'integrations', label: 'Integrations', icon: <Cpu size={15} /> },
          { id: 'hours', label: 'Business Hours', icon: <Clock size={15} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#caa24c]/10 border border-[#caa24c]/25 text-[#f1d27a]'
                : 'border border-transparent text-zinc-500 hover:text-zinc-350 hover:bg-zinc-950/40'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settings Forms */}
      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar pr-1 pb-8">
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          {/* VENUE INFORMATION */}
          {activeTab === 'business' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Business Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Venue Name</label>
                  <input
                    type="text"
                    defaultValue="Luxor Event Space"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Contact Email</label>
                  <input
                    type="email"
                    defaultValue="booking@luxoratlaspalmas.com"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[9px] uppercase font-bold text-zinc-500">Venue Location Address</label>
                  <input
                    type="text"
                    defaultValue="1025 Palmas Avenue, Suite 100, Dallas, TX 75201"
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PORTAL BRANDING */}
          {activeTab === 'branding' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Branding & Style Guide</h3>
              <div className="space-y-4 text-xs text-zinc-400">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <div>
                    <p className="font-bold text-white">Primary Brand Color</p>
                    <p className="text-[10px] text-zinc-550 mt-0.5">Luxor Gold Lockup Accent</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-3 py-1 rounded">#CAA24C</span>
                </div>
                <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                  <div>
                    <p className="font-bold text-white">Interface Fonts</p>
                    <p className="text-[10px] text-zinc-550 mt-0.5">Serif: Cormorant Garamond / Sans: Manrope</p>
                  </div>
                  <span className="text-xs font-serif text-[#caa24c] italic">Garamond Active</span>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-white">Venue Brand Tagline</p>
                  <input
                    type="text"
                    defaultValue="ELEGANT SPACES. UNFORGETTABLE EVENTS."
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-md px-3 py-2 text-xs text-zinc-300 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATION PREFERENCES */}
          {activeTab === 'notifications' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Automated Notifications</h3>
              <div className="space-y-3">
                {[
                  { label: 'Notify on new lead form inquiry', desc: 'Email alerts to booking mailbox on new form entries.', checked: true },
                  { label: 'Auto-send tour reminders', desc: 'SMS/Email reminders scheduled to prospects 24 hours before tour.', checked: true },
                  { label: 'Contract signature event alerts', desc: 'Notify workspace coordinators immediately when a client signs.', checked: true },
                  { label: 'Overdue bill utility spikes alerts', desc: 'Alert maintenance when utility sensor spikes or bills exceed average.', checked: false }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                    <input
                      type="checkbox"
                      defaultChecked={item.checked}
                      className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-white">{item.label}</p>
                      <p className="text-[10px] text-zinc-500 mt-1 leading-normal">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TEAM & PERMISSIONS */}
          {activeTab === 'team' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Team Access Roster</h3>
              <div className="divide-y divide-zinc-900/60 text-xs">
                {[
                  { name: 'Elena Concierge', email: 'concierge@luxoratlaspalmas.com', role: 'Full Admin' },
                  { name: 'Lewis Palma (Owner)', email: 'lewis@luxoratlaspalmas.com', role: 'Owner / CEO' }
                ].map((user, idx) => (
                  <div key={idx} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                    <div>
                      <p className="font-bold text-white">{user.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-0.5 font-mono">{user.email}</p>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded">{user.role}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* INTEGRATIONS */}
          {activeTab === 'integrations' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">External API Channels</h3>
              <div className="space-y-4">
                {[
                  { name: 'Zoho Mail Server API', status: 'Connected', desc: 'Used for mailbox synchronization and secure routing.' },
                  { name: 'Stripe Payment Processor', status: 'Connected', desc: 'Securely collects deposits and updates invoice payments.' },
                  { name: 'QuickBooks Bookkeeping Link', status: 'Disconnected', desc: 'Optional bookkeeping ledger synchronization.' }
                ].map((api, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-900 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-white">{api.name}</p>
                      <p className="text-[10px] text-zinc-550 mt-1 max-w-sm leading-relaxed">{api.desc}</p>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded border ${
                      api.status === 'Connected' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                    }`}>
                      {api.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUSINESS HOURS */}
          {activeTab === 'hours' && (
            <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] space-y-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Venue Tour Availability Hours</h3>
              <div className="space-y-3 font-mono text-xs">
                {[
                  { day: 'Monday - Thursday', hours: '9:00 AM - 5:00 PM' },
                  { day: 'Friday', hours: '9:00 AM - 3:00 PM' },
                  { day: 'Saturday - Sunday', hours: 'Events Only (Closed for Tours)' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between border-b border-zinc-900/60 pb-2.5 last:border-0 last:pb-0">
                    <span className="text-zinc-500 font-sans">{item.day}</span>
                    <span className="text-white font-semibold">{item.hours}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit button */}
          <div className="pt-4 border-t border-[color:var(--portal-border)] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#caa24c] hover:bg-[#dfbd68] text-black text-xs font-black uppercase tracking-widest px-6 py-3 rounded-lg shadow-xl shadow-[#caa24c]/10 cursor-pointer disabled:opacity-40 hover:scale-105 active:scale-95 transition-all"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </PortalPageFrame>
  )
}
