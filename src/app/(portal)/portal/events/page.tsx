'use client'

import React, { useEffect, useState, useMemo, useDeferredValue } from 'react'
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
  ChevronRight,
  ArrowRightLeft,
  Trash2
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
import {
  PortalBulkActionDeck,
  PortalBulkChoiceDialog,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'
import type { LuxorBooking, LuxorBookingStatus, LuxorPayment } from '@/lib/luxorInquiryTypes'

const BOOKING_STATUS_OPTIONS: Array<{ value: LuxorBookingStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'tentative', label: 'Tentative' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

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
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<'timeline' | 'layout' | 'vendors' | 'payments' | 'checklist' | 'walkthrough'>('timeline')
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<LuxorBookingStatus>('confirmed')

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

  // Filter bookings (Memoized for high performance)
  const filteredBookings = useMemo(() => {
    const term = deferredSearchTerm.toLowerCase().trim()
    if (!term) return bookings
    return bookings.filter((b) => {
      return (
        b.client_name.toLowerCase().includes(term) ||
        (b.event_type && b.event_type.toLowerCase().includes(term)) ||
        b.id.toLowerCase().includes(term)
      )
    })
  }, [bookings, deferredSearchTerm])

  const selectedEvent = useMemo(() => bookings.find((b) => b.id === selectedEventId), [bookings, selectedEventId])
  const matchingBookingIds = useMemo(() => filteredBookings.map((booking) => booking.id), [filteredBookings])
  const bulkSelectedCount = bulkSelection.selectedCount(matchingBookingIds.length)

  const runBookingStatusAction = async (status: LuxorBookingStatus) => {
    const ids = bulkSelection.resolveIds(matchingBookingIds)
    if (!ids.length) return
    setBulkBusy(status)
    const updatedIds: string[] = []
    const errors: string[] = []
    for (const id of ids) {
      try {
        const response = await fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        })
        const payload = await response.json().catch(() => ({})) as BookingWithPayments & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Event could not be updated.')
        updatedIds.push(id)
      } catch (updateError) {
        errors.push(updateError instanceof Error ? updateError.message : 'Event could not be updated.')
      }
    }
    setBookings((current) => current.map((booking) => updatedIds.includes(booking.id) ? { ...booking, status } : booking))
    bulkSelection.clear()
    setBulkBusy(null)
    if (errors.length) alert(`${updatedIds.length} event${updatedIds.length === 1 ? '' : 's'} updated. ${errors.length} could not be changed.`)
  }

  const deleteSelectedBookings = async () => {
    const ids = bulkSelection.resolveIds(matchingBookingIds)
    if (!ids.length) return
    setBulkBusy('delete')
    try {
      const response = await fetch('/api/portal/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'bookings', action: 'delete', ids }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; ids?: string[]; warning?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to delete events.')
      const deletedIds = payload.ids || []
      setBookings((current) => current.filter((booking) => !deletedIds.includes(booking.id)))
      bulkSelection.clear()
      setConfirmBulkDelete(false)
      if (payload.warning) alert(payload.warning)
    } catch (deleteError) {
      alert(deleteError instanceof Error ? deleteError.message : 'Unable to delete events.')
    } finally {
      setBulkBusy(null)
    }
  }

  // Sub-metrics
  const confirmedCount = useMemo(() => bookings.filter((b) => b.status === 'confirmed').length, [bookings])

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden flex flex-col gap-6">
      <PortalPageHeader
        icon={<Sparkles size={18} />}
        title="Event Operations"
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
                {matchingBookingIds.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(matchingBookingIds)} onChange={() => bulkSelection.selectPage(matchingBookingIds)} label="Select all visible events" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Select all visible events</span>
                  </div>
                ) : null}
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
                <div className="p-4 space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-2 p-3">
                      <div className="h-4 w-40 rounded luxor-skeleton" />
                      <div className="h-3 w-28 rounded luxor-skeleton" />
                    </div>
                  ))}
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500">No events matched search criteria.</div>
              ) : (
                filteredBookings.map((b, rowIndex) => {
                  const active = b.id === selectedEventId
                  return (
                    <div
                      key={b.id}
                      className={`group flex w-full items-start border-l-2 transition-all ${
                        active
                          ? 'bg-[#caa24c]/5 border-[#caa24c]'
                          : 'border-transparent hover:bg-zinc-950/20'
                      } ${bulkSelection.isSelected(b.id) ? 'bg-[#caa24c]/5' : ''}`}
                    >
                      <div className="shrink-0 py-4 pl-3"><PortalBulkRowSelector checked={bulkSelection.isSelected(b.id)} index={rowIndex + 1} onChange={() => bulkSelection.toggle(b.id)} label={b.client_name} /></div>
                      <button type="button" onClick={() => setSelectedEventId(b.id)} className="flex min-w-0 flex-1 flex-col gap-2 p-4 text-left">
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
                    </div>
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
                    <div className="grid grid-cols-1 gap-3 font-mono sm:grid-cols-3 sm:gap-4">
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
      <PortalBulkActionDeck
        selectedCount={bulkSelectedCount}
        pageCount={matchingBookingIds.length}
        totalCount={matchingBookingIds.length}
        allMatching={bulkSelection.allMatching}
        busyAction={bulkBusy}
        noun="event"
        onSelectAll={bulkSelection.selectAllMatching}
        onClear={bulkSelection.clear}
        onAction={(action) => {
          if (action === 'status') setBulkStatusOpen(true)
          if (action === 'delete') setConfirmBulkDelete(true)
        }}
        actions={[
          { id: 'status', label: 'Change status', icon: <ArrowRightLeft size={13} /> },
          { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' },
        ]}
      />
      <PortalBulkChoiceDialog
        open={bulkStatusOpen}
        title="Change event status"
        description={`Update ${bulkSelectedCount} selected ${bulkSelectedCount === 1 ? 'event' : 'events'} through the normal booking workflow.`}
        label="New status"
        value={bulkStatus}
        options={BOOKING_STATUS_OPTIONS}
        confirmLabel="Update events"
        busy={Boolean(bulkBusy)}
        onValueChange={(value) => setBulkStatus(value as LuxorBookingStatus)}
        onConfirm={() => { setBulkStatusOpen(false); void runBookingStatusAction(bulkStatus) }}
        onClose={() => setBulkStatusOpen(false)}
      />
      <PortalBulkConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulkSelectedCount} selected event${bulkSelectedCount === 1 ? '' : 's'}?`}
        description="This permanently removes eligible booking records and their booking expenses. Events with paid payment history are protected and will be kept. The original lead is not deleted."
        confirmLabel="Delete eligible events"
        busy={bulkBusy === 'delete'}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void deleteSelectedBookings()}
      />
    </PortalPageFrame>
  )
}

function IncompleteState({ booking, title, description, tab }: { booking: BookingWithPayments; title: string; description: string; tab: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-6 text-center">
      <AlertCircle size={28} className="mx-auto text-amber-500" />
      <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{description}</p>
      {booking.inquiry_id && <Link href={`/portal/leads/${booking.inquiry_id}?tab=${tab}`} className="mt-4 inline-flex items-center gap-1 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a]">Open client dossier <ChevronRight size={12} /></Link>}
    </div>
  )
}
