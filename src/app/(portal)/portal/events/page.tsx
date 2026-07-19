'use client'

import React, { useEffect, useState } from 'react'
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
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
                    <IncompleteState booking={selectedEvent} title="No event timeline is attached here yet" description="Build the real event timeline in the client dossier. Sample event times are no longer shown as completed plans." tab="timeline" />
                  </div>
                )}

                {/* Floor Plan */}
                {activeDetailTab === 'layout' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Floor Plan Layout</h3>
                    <IncompleteState booking={selectedEvent} title="No floor plan is attached" description="Layout uploads are not connected yet. Store the confirmed table count and layout details in the client dossier notes until document storage is added." tab="notes" />
                  </div>
                )}

                {/* Vendors */}
                {activeDetailTab === 'vendors' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Assigned Vendors</h3>
                    <IncompleteState booking={selectedEvent} title="No vendors are displayed until they are linked" description="Add real caterers, DJs, decorators, security, and vendor notes in the client dossier." tab="vendors" />
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
                    <IncompleteState booking={selectedEvent} title="Event-specific checklist not configured" description="Use tasks in the client dossier for required work. A checked sample list is no longer presented as real venue readiness." tab="tasks" />
                  </div>
                )}

                {/* Walkthrough */}
                {activeDetailTab === 'walkthrough' && (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-[#caa24c]">Final Walkthrough Verification</h3>
                    <IncompleteState booking={selectedEvent} title="Walkthrough not recorded" description="Record the walkthrough as a dated task or note in the client dossier. The portal will not claim completion without saved evidence." tab="tasks" />
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

function IncompleteState({ booking, title, description, tab }: { booking: BookingWithPayments; title: string; description: string; tab: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-black/20 p-6 text-center">
      <AlertCircle size={28} className="mx-auto text-amber-400" />
      <p className="mt-3 text-xs font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[10px] leading-relaxed text-zinc-500">{description}</p>
      {booking.inquiry_id && <Link href={`/portal/leads/${booking.inquiry_id}?tab=${tab}`} className="mt-4 inline-flex items-center gap-1 rounded-lg border border-[#caa24c]/25 bg-[#caa24c]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#f1d27a]">Open client dossier <ChevronRight size={12} /></Link>}
    </div>
  )
}
