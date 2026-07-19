'use client'

import React, { useEffect, useState } from 'react'
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Grid3X3,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Users,
  CheckSquare,
  ClipboardList,
  Building,
  CheckCircle2,
  AlertCircle,
  ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalStatusBadge,
  PortalTableCard,
  PortalStickyTable,
  PortalStickyThead,
  PortalButton
} from '@/components/portal/PortalUI'
import type { LuxorBooking, LuxorPayment } from '@/lib/luxorInquiryTypes'

type BookingWithPayments = LuxorBooking & {
  payments?: LuxorPayment[]
  paid_total?: number
  balance_due?: number
}

export default function EventsPage() {
  const [bookings, setBookings] = useState<BookingWithPayments[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'timeline' | 'layout' | 'vendors' | 'payments' | 'checklist' | 'walkthrough'>('timeline')

  const fetchBookings = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/bookings')
      if (!res.ok) throw new Error('Failed to load bookings.')
      const data = await res.json()
      setBookings(data)
      if (data.length > 0) {
        setSelectedEventId(data[0].id)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to fetch booked events.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
  }, [])

  // Filter bookings
  const filteredBookings = bookings.filter((b) => {
    const term = searchTerm.toLowerCase()
    return (
      b.client_name.toLowerCase().includes(term) ||
      (b.event_type && b.event_type.toLowerCase().includes(term)) ||
      b.id.toLowerCase().includes(term)
    )
  })

  const selectedEvent = bookings.find((b) => b.id === selectedEventId)

  // Sub-metrics
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Sparkles size={18} />}
        title="Event Operations"
        description="Detail-level event planner and production readiness center for booked venue agreements."
        actions={
          <PortalButton onClick={fetchBookings}>
            <RefreshCw size={13} /> Reload Events
          </PortalButton>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400 shrink-0">
          Telemetry Alert: {error}
        </div>
      )}

      {/* Main split dashboard view */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6">
        {/* Left pane: Events List */}
        <div className="lg:col-span-5 flex flex-col min-h-[300px] lg:min-h-0">
          <PortalTableCard
            controls={
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)]">Active Contracts</span>
                  <span className="text-[10px] font-mono text-[#caa24c] bg-[#caa24c]/10 border border-[#caa24c]/20 px-2 py-0.5 rounded">
                    {confirmedCount} Confirmed / {bookings.length} Total
                  </span>
                </div>
                <div className="relative group">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by client or type..."
                    className="w-full bg-[#050505] border border-[color:var(--portal-border)] rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-350 outline-none focus:border-[#caa24c]/50 transition-all"
                  />
                </div>
              </div>
            }
          >
            <div className="divide-y divide-zinc-900/30">
              {loading ? (
                <div className="p-8 text-center text-xs font-semibold tracking-wider text-zinc-500">FETCHING OPERATIONS...</div>
              ) : filteredBookings.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No events matched search criteria.</div>
              ) : (
                filteredBookings.map((b) => {
                  const active = b.id === selectedEventId
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedEventId(b.id)}
                      className={`w-full text-left p-4 flex flex-col gap-2 transition-all border-l-2 cursor-pointer ${
                        active
                          ? 'bg-[#caa24c]/5 border-[#caa24c]'
                          : 'border-transparent hover:bg-zinc-950/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="truncate">
                          <p className={`text-xs font-bold leading-none truncate transition-colors ${active ? 'text-[#f1d27a]' : 'text-white/90'}`}>
                            {b.client_name}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-1">
                            {b.event_type || 'Quinceañera'}
                          </p>
                        </div>
                        <PortalStatusBadge status={b.status} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono mt-1 text-zinc-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} className="text-zinc-650" />
                          <span>{b.event_date || 'Date Pending'}</span>
                        </div>
                        <div className="flex items-center gap-1 font-bold text-zinc-400">
                          <span>${Number(b.contract_total || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </PortalTableCard>
        </div>

        {/* Right pane: Inspection Panel */}
        <div className="lg:col-span-7 flex flex-col min-h-[400px] lg:min-h-0">
          {selectedEvent ? (
            <div className="luxor-glass-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col h-full overflow-hidden shadow-2xl">
              {/* Event title header */}
              <div className="p-6 border-b border-[color:var(--portal-border)] bg-[#050505]/40 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-serif text-white tracking-wide">{selectedEvent.client_name}</h2>
                    <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-[0.15em] mt-0.5">
                      {selectedEvent.event_type || 'Quinceañera'} Setup & Coordination
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-zinc-400">ID: {selectedEvent.id.slice(0, 8)}</span>
                    <p className="text-[9px] text-[#caa24c] font-black uppercase tracking-widest mt-1">Status: {selectedEvent.status}</p>
                  </div>
                </div>

                {/* Sub-tab switcher */}
                <div className="flex flex-wrap gap-1 border-t border-[color:var(--portal-border)] pt-3 mt-1">
                  <PortalAnimatedTabs
                    tabs={[
                    { id: 'timeline', label: 'Timeline' },
                    { id: 'layout', label: 'Floor Plan' },
                    { id: 'vendors', label: 'Vendors' },
                    { id: 'payments', label: 'Payments' },
                    { id: 'checklist', label: 'Checklist' },
                    { id: 'walkthrough', label: 'Walkthrough' }
                    ]}
                    activeTab={activeDetailTab}
                    onTabChange={(tab) => setActiveDetailTab(tab as 'timeline' | 'layout' | 'vendors' | 'payments' | 'checklist' | 'walkthrough')}
                  />
                </div>
              </div>

              {/* Tab Contents */}
              <PortalTabTransition activeKey={activeDetailTab} className="flex-1 overflow-y-auto portal-scrollbar p-6 space-y-6">
                {/* Timeline */}
                {activeDetailTab === 'timeline' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Event Day Timeline</h3>
                    <div className="relative pl-6 border-l border-zinc-900 space-y-6">
                      <div className="relative">
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <p className="text-xs font-bold text-white uppercase tracking-wider">12:00 PM — Load-In & Vendor Setup</p>
                        <p className="text-[10px] text-zinc-500 mt-1">Caterer, Decorators, and DJ arrive for load-in.</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500" />
                        <p className="text-xs font-bold text-white uppercase tracking-wider">3:30 PM — Venue Prep Check</p>
                        <p className="text-[10px] text-zinc-550 mt-1">Elena concierge checklist verification (HVAC, bathroom stock).</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-[#caa24c]" />
                        <p className="text-xs font-bold text-white uppercase tracking-wider">5:00 PM — Doors Open & Reception Start</p>
                        <p className="text-[10px] text-zinc-555 mt-1">Guest arrival, cocktail service begins in main lobby.</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <p className="text-xs font-bold text-white uppercase tracking-wider">6:30 PM — Main Banquet / Dinner Served</p>
                        <p className="text-[10px] text-zinc-550 mt-1">Grand entrance followed by dinner service.</p>
                      </div>
                      <div className="relative">
                        <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <p className="text-xs font-bold text-white uppercase tracking-wider">10:00 PM — Last Call & Departures</p>
                        <p className="text-[10px] text-zinc-550 mt-1">Bar service closes, cleanup crew starts load-out.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Floor Plan */}
                {activeDetailTab === 'layout' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Floor Plan Layout</h3>
                      <span className="text-[9px] font-mono bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400">
                        {selectedEvent.guest_count || 150} Guests Banquet
                      </span>
                    </div>
                    
                    <div className="border border-zinc-900 bg-[#050505] rounded-xl p-4 flex flex-col items-center justify-center min-h-[220px]">
                      <Grid3X3 className="text-zinc-700 mb-4" size={48} strokeWidth={1} />
                      <p className="text-xs font-bold text-zinc-300">Round Tables Setup (A-Lockup)</p>
                      <p className="text-[10px] text-zinc-500 text-center max-w-sm mt-1.5 leading-relaxed">
                        18 Round Tables arranged symmetrically around the central axis. Head table aligned near the ballroom mirror backdrop.
                      </p>
                      <button className="mt-4 bg-[#caa24c]/10 hover:bg-[#caa24c]/20 border border-[#caa24c]/25 rounded-md px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-[#caa24c] transition-all cursor-pointer">
                        Upload Layout PDF
                      </button>
                    </div>
                  </div>
                )}

                {/* Vendors */}
                {activeDetailTab === 'vendors' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Assigned Vendors</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-zinc-950/40 border border-zinc-900/60 p-4 rounded-xl">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Catering Services</p>
                        <p className="text-xs font-bold text-white mt-1">Palace Fine Catering</p>
                        <p className="text-[10px] text-[#caa24c] mt-0.5 font-medium">Insurance Uploaded (COI Valid)</p>
                      </div>
                      <div className="bg-zinc-950/40 border border-zinc-900/60 p-4 rounded-xl">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Entertainment / DJ</p>
                        <p className="text-xs font-bold text-white mt-1">Dallas Sound Masters</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Setup: 1:30 PM</p>
                      </div>
                      <div className="bg-zinc-950/40 border border-zinc-900/60 p-4 rounded-xl">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Security Service</p>
                        <p className="text-xs font-bold text-white mt-1">Atlas Executive Security</p>
                        <p className="text-[10px] text-emerald-400 mt-0.5 font-medium">2 Guards Allocated</p>
                      </div>
                      <div className="bg-zinc-950/40 border border-zinc-900/60 p-4 rounded-xl">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Florals / Decor</p>
                        <p className="text-xs font-bold text-white mt-1">Golden Rose Florist</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Load-in at 11:30 AM</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payments */}
                {activeDetailTab === 'payments' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Financial Balance</h3>
                    <div className="grid grid-cols-3 gap-4 font-mono">
                      <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Contract Total</p>
                        <p className="text-sm font-bold text-white mt-1">${Number(selectedEvent.contract_total || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Paid To Date</p>
                        <p className="text-sm font-bold text-emerald-450 mt-1">${Number(selectedEvent.paid_total || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">Balance Due</p>
                        <p className={`text-sm font-bold mt-1 ${Number(selectedEvent.balance_due || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          ${Number(selectedEvent.balance_due || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Invoice & Receipts History</p>
                      <div className="space-y-2.5">
                        <div className="flex justify-between text-xs items-center bg-[#050505]/20 border border-[color:var(--portal-border)]/60 rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-[#caa24c]" />
                            <div>
                              <p className="font-bold text-white">Retainer Deposit Paid</p>
                              <p className="text-[10px] text-zinc-500">Receipt Ref: #PAY-33108</p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-emerald-400">+${Number(selectedEvent.deposit_required || 0).toLocaleString()}</span>
                        </div>

                        <div className="flex justify-between text-xs items-center bg-[#050505]/20 border border-[color:var(--portal-border)]/60 rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-[#caa24c]" />
                            <div>
                              <p className="font-bold text-white">Final Event Balance Invoice</p>
                              <p className="text-[10px] text-zinc-500">Due date: {selectedEvent.final_payment_due_date || 'TBD'}</p>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-zinc-400">${Number(selectedEvent.balance_due || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Checklist */}
                {activeDetailTab === 'checklist' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Venue Preparedness</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Ballroom Flooring Buffed', checked: true },
                        { label: 'Chairs & Round Tables Count Verified', checked: true },
                        { label: 'HVAC Temperature Calibrated', checked: true },
                        { label: 'Bathrooms Stocked (Soap & Towels)', checked: false, critical: true },
                        { label: 'Emergency Exit Lighting Checked', checked: false }
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-zinc-950/20 border border-zinc-900 rounded-lg p-3">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-[#caa24c] border-zinc-800 bg-transparent cursor-pointer"
                            checked={item.checked}
                            readOnly
                          />
                          <span className={`text-xs font-medium ${item.checked ? 'line-through text-zinc-600 font-normal' : 'text-white'}`}>
                            {item.label}
                          </span>
                          {!item.checked && item.critical && (
                            <span className="ml-auto text-[8px] font-bold bg-rose-500/10 border border-rose-500/25 text-rose-400 px-2 py-0.5 rounded uppercase tracking-wider">Critical</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Walkthrough */}
                {activeDetailTab === 'walkthrough' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Final Walkthrough Verification</h3>
                    <div className="bg-[#050505] border border-zinc-900 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                      <CheckCircle2 size={36} className="text-emerald-400 mb-3" />
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Final Walkthrough Confirmed</p>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-sm">
                        Walkthrough with event coordinator completed on schedule. Layout, vendors, and timeline locked in.
                      </p>
                      <div className="mt-4 flex gap-4 text-xs font-mono">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-zinc-600">Date Verified</p>
                          <p className="text-zinc-300 font-semibold mt-1">July 01, 2026</p>
                        </div>
                        <div className="w-px bg-zinc-900" />
                        <div>
                          <p className="text-[9px] uppercase font-bold text-zinc-600">Sign-Off Owner</p>
                          <p className="text-zinc-300 font-semibold mt-1">Elena Concierge</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </PortalTabTransition>
            </div>
          ) : (
            <div className="flex-1 border border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center text-center p-10 bg-zinc-950/5">
              <Users size={32} className="text-zinc-800 mb-3" />
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Select an Event</p>
              <p className="text-[10px] text-zinc-600 max-w-xs mt-1">
                Choose a booked client from the ledger on the left to inspect timeline and operational readiness.
              </p>
            </div>
          )}
        </div>
      </div>
    </PortalPageFrame>
  )
}
