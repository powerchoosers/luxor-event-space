'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Users,
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  Phone,
  Calendar,
  MoreHorizontal,
  Sparkles,
  X
} from 'lucide-react'
import Link from 'next/link'
import { LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus, LuxorPipelineStage } from '@/lib/luxorInquiryTypes'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalModal,
  PortalSelect
} from '@/components/portal/PortalUI'

const INQUIRY_STATUS_OPTIONS: { value: LuxorInquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'tour_requested', label: 'Tour Requested' },
  { value: 'tour_confirmed', label: 'Tour Confirmed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

const PIPELINE_COLUMNS: { id: LuxorPipelineStage; label: string; short: string; tone: string; status?: LuxorInquiryStatus }[] = [
  { id: 'inquiry', label: 'Inquiry', short: 'Inquiry', tone: 'blue', status: 'new' },
  { id: 'tour', label: 'Tour', short: 'Tour', tone: 'purple', status: 'tour_requested' },
  { id: 'proposal_sent', label: 'Proposal Sent', short: 'Proposal', tone: 'indigo', status: 'proposal_sent' },
  { id: 'book_reserve', label: 'Book & Reserve', short: 'Reserve', tone: 'green', status: 'booked' },
  { id: 'planning_begins', label: 'Planning Begins', short: 'Planning', tone: 'cyan', status: 'booked' },
  { id: 'final_details', label: 'Final Details', short: 'Details', tone: 'amber', status: 'booked' },
  { id: 'setup_event_day', label: 'Set Up + Event Day', short: 'Event Day', tone: 'rose', status: 'booked' },
  { id: 'after_event', label: 'After Event', short: 'After', tone: 'zinc', status: 'booked' },
]

export default function LeadsPage() {
  const [leads, setLeads] = useState<LuxorInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // View mode toggle
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board')
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'active' | 'name' | 'guests'>('active')
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

  // New Lead Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newLeadName, setNewLeadName] = useState('')
  const [newLeadEmail, setNewLeadEmail] = useState('')
  const [newLeadPhone, setNewLeadPhone] = useState('')
  const [newLeadEventType, setNewLeadEventType] = useState('Wedding')
  const [newLeadGuestCount, setNewLeadGuestCount] = useState('')
  const [newLeadTargetDate, setNewLeadTargetDate] = useState('')
  const [newLeadMessage, setNewLeadMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/inquiries')
      if (!res.ok) throw new Error('Failed to load inquiries.')
      const data = await res.json()
      setLeads(data)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load inquiries.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadName.trim()) return

    try {
      setSubmitting(true)
      const payload: LuxorInquiryInput = {
        fullName: newLeadName,
        email: newLeadEmail || undefined,
        phone: newLeadPhone || undefined,
        eventType: newLeadEventType,
        guestCount: newLeadGuestCount || undefined,
        targetDate: newLeadTargetDate || undefined,
        message: newLeadMessage || undefined,
        source: 'portal_manual',
        flow: 'manual_entry',
        pagePath: '/portal/leads',
      }

      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lead.')
      }

      setIsModalOpen(false)
      // Reset form
      setNewLeadName('')
      setNewLeadEmail('')
      setNewLeadPhone('')
      setNewLeadEventType('Wedding')
      setNewLeadGuestCount('')
      setNewLeadTargetDate('')
      setNewLeadMessage('')
      
      // Reload inquiries
      fetchLeads()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create lead.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMoveStatus = async (leadId: string, newStatus: LuxorInquiryStatus) => {
    try {
      // Optimistically update status locally
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      )

      const res = await fetch(`/api/inquiries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, status: newStatus, author: 'Portal Owner' }),
      })
      if (!res.ok) throw new Error('Failed to update status.')
    } catch (err) {
      console.error(err)
      alert('Error updating status.')
      fetchLeads() // Re-sync from database if error
    }
  }

  const handleMovePipelineStage = async (leadId: string, newStage: LuxorPipelineStage) => {
    const column = PIPELINE_COLUMNS.find((item) => item.id === newStage)
    try {
      setLeads((prev) =>
        prev.map((lead) => (
          lead.id === leadId
            ? { ...lead, pipeline_stage: newStage, status: column?.status || lead.status }
            : lead
        ))
      )

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: leadId,
          pipeline_stage: newStage,
          ...(column?.status ? { status: column.status } : {}),
          author: 'Portal Owner',
        }),
      })
      if (!res.ok) throw new Error('Failed to update pipeline stage.')
    } catch (err) {
      console.error(err)
      alert('Error updating pipeline stage.')
      fetchLeads()
    }
  }

  // Filter & Sort Inquiries
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.phone && lead.phone.includes(searchTerm))

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const matchesCampaign =
      campaignFilter === 'all' ||
      (campaignFilter === 'grand_opening' && isGrandOpeningRsvp(lead)) ||
      (campaignFilter === 'standard' && !isGrandOpeningRsvp(lead))

    return matchesSearch && matchesStatus && matchesCampaign
  })

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === 'name') {
      return a.full_name.localeCompare(b.full_name)
    }
    if (sortBy === 'guests') {
      return (b.guest_count || 0) - (a.guest_count || 0)
    }
    // Default: recently active (created_at desc)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Computed Metrics
  const totalCount = sortedLeads.length
  const newLeadsCount = leads.filter((l) => l.status === 'new').length
  const grandOpeningCount = leads.filter(isGrandOpeningRsvp).length
  const missingContact = leads.filter((l) => !l.email && !l.phone).length

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<Users size={18} />}
        title="Leads & Clients"
        description="Monitor and manage the intake pipeline of event space prospects."
        actions={
          <div className="flex w-full flex-col items-stretch gap-3 xl:w-auto xl:items-end">
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[520px]">
              <LeadMetric label="Live Inquiries" value={String(leads.length)} detail="Forms and chat" />
              <LeadMetric label="Grand Opening" value={String(grandOpeningCount)} detail="RSVP campaign" tone="gold" />
              <LeadMetric label="New Leads" value={String(newLeadsCount)} detail={missingContact ? `${missingContact} missing contact` : 'Ready for follow-up'} tone="green" />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex border border-zinc-800 rounded-md p-0.5 bg-zinc-950/60 font-semibold text-[10px] tracking-widest uppercase">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/20'
                      : 'text-zinc-500 hover:text-zinc-350 font-bold'
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('board')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    viewMode === 'board'
                      ? 'bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/20'
                      : 'text-zinc-500 hover:text-zinc-350 font-bold'
                  }`}
                >
                  Board
                </button>
              </div>

              <PortalSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  ...INQUIRY_STATUS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.value === 'booked' ? 'Booked (Won)' : option.label,
                  })),
                ]}
              />
              <PortalSelect
                value={campaignFilter}
                onChange={setCampaignFilter}
                options={[
                  { value: 'all', label: 'All Sources' },
                  { value: 'grand_opening', label: 'Grand Opening RSVPs' },
                  { value: 'standard', label: 'Standard Leads' },
                ]}
              />
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/20"
              >
                <Plus size={14} /> New Lead
              </button>
            </div>
          </div>
        }
      />

      {viewMode === 'list' ? (
        <PortalTableCard
          controls={
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <div className="relative w-full md:w-96">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search leads by name, email, or phone..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-350 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium placeholder:text-zinc-700"
                />
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-widest relative">
                <span className="text-zinc-650">Sort by:</span>
                <button
                  type="button"
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                  className="flex items-center gap-1 text-zinc-350 hover:text-white transition-colors"
                >
                  {sortBy === 'name' ? 'Name' : sortBy === 'guests' ? 'Guest Count' : 'Recently Active'} <ChevronDown size={14} />
                </button>
                {sortDropdownOpen && (
                  <div className="absolute right-0 top-6 z-30 bg-[#080706] border border-zinc-900 rounded-md shadow-xl p-1.5 min-w-[120px] space-y-1">
                    <button
                      type="button"
                      onClick={() => { setSortBy('active'); setSortDropdownOpen(false) }}
                      className="w-full text-left text-[10px] font-bold uppercase tracking-wider text-zinc-450 hover:text-white px-2 py-1 hover:bg-zinc-900 rounded-md"
                    >
                      Recently Active
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSortBy('name'); setSortDropdownOpen(false) }}
                      className="w-full text-left text-[10px] font-bold uppercase tracking-wider text-zinc-455 hover:text-white px-2 py-1 hover:bg-zinc-900 rounded-md"
                    >
                      Name
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSortBy('guests'); setSortDropdownOpen(false) }}
                      className="w-full text-left text-[10px] font-bold uppercase tracking-wider text-zinc-455 hover:text-white px-2 py-1 hover:bg-zinc-900 rounded-md"
                    >
                      Guest Count
                    </button>
                  </div>
                )}
              </div>
            </div>
          }
          footer={
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-600 tracking-widest">
              <p>
                Showing <span className="text-zinc-400">{totalCount}</span> live Luxor inquiries
              </p>
            </div>
          }
        >
          <PortalStickyTable minWidth="1060px">
            <PortalStickyThead>
              <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.15em]">
                <th className="px-8 py-5">Full Name & Contact</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Event Parameters</th>
                <th className="px-6 py-5">Intake Date</th>
                <th className="px-6 py-5">Source Node</th>
                <th className="px-8 py-5 text-right">Engagement</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-zinc-900/30">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-sm text-zinc-500 text-center font-semibold tracking-wider">
                    FETCHING RECORDS...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-sm text-red-300">
                    {error}
                  </td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-sm text-zinc-500">
                    <div className="max-w-xl">
                      <p className="text-base font-semibold text-zinc-300">No records matching search parameters.</p>
                      <p className="mt-2 leading-6">Try broadening your search term or selecting another lifecycle status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-zinc-900/40 transition-colors group">
                    <td className="px-8 py-6">
                      <Link
                        href={`/portal/leads/${lead.id}`}
                        className="flex items-center gap-4 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700/50 flex items-center justify-center text-zinc-400 font-bold group-hover:from-blue-600 group-hover:to-indigo-600 group-hover:text-white group-hover:border-blue-500/50 transition-all duration-300">
                            {getInitials(lead.full_name)}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/90 leading-tight mb-1 group-hover:translate-x-0.5 transition-transform">
                            {lead.full_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] text-zinc-500 font-medium group-hover:text-zinc-400">
                              {lead.email ?? lead.phone ?? `ID: ${lead.id.slice(0, 8)}`}
                            </p>
                            {isGrandOpeningRsvp(lead) ? <GrandOpeningBadge /> : null}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-6 font-mono">
                      <PortalSelect
                        value={lead.status}
                        onChange={(value) => handleMoveStatus(lead.id, value as LuxorInquiryStatus)}
                        options={INQUIRY_STATUS_OPTIONS}
                        className="min-w-[170px]"
                      />
                    </td>
                    <td className="px-6 py-6 font-mono text-xs text-zinc-300">
                      <div className="font-semibold text-white">{lead.event_type || 'Quinceañera'}</div>
                      <div className="text-zinc-500 mt-1">
                        {isGrandOpeningRsvp(lead)
                          ? `${lead.attendee_count || lead.guest_count || 1} attending`
                          : lead.guest_count
                            ? `${lead.guest_count} guests`
                            : 'Guest count needed'}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-start flex-col">
                        <span className="text-xs text-zinc-400 font-medium">{formatDate(lead.created_at)}</span>
                        <span className="text-[10px] text-[#caa24c] font-medium uppercase tracking-tighter mt-1">
                          {lead.target_date || 'Date requested'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <span className={`text-xs font-bold uppercase tracking-widest ${isGrandOpeningRsvp(lead) ? 'text-[#f1d27a]' : 'text-zinc-500'}`}>
                        {formatSourceLabel(lead)}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                        <Link
                          href={`/portal/leads/${lead.id}`}
                          className="p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all hover:bg-zinc-800"
                          title="Open Dossier"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </PortalStickyTable>
        </PortalTableCard>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto portal-scrollbar pb-4 flex gap-4 select-none">
          {PIPELINE_COLUMNS.map((col, colIndex, colArray) => {
            const colLeads = sortedLeads.filter(l => getPipelineStage(l) === col.id)
            return (
              <div key={col.id} className="flex-1 min-w-[280px] max-w-[340px] bg-zinc-950/15 border border-zinc-900/60 rounded-2xl flex flex-col h-[calc(100vh-21rem)] overflow-hidden">
                {/* Column Header */}
                <div className="p-4 border-b border-zinc-900/80 bg-[#070707] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      col.tone === 'blue' ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]' :
                      col.tone === 'cyan' ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]' :
                      col.tone === 'purple' ? 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]' :
                      col.tone === 'amber' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                      col.tone === 'indigo' ? 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]' :
                      col.tone === 'rose' ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]' :
                      col.tone === 'zinc' ? 'bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.5)]' :
                      'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                    }`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{col.short}</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-zinc-500 bg-zinc-900 border border-zinc-800/80 px-2 py-0.5 rounded-md">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-3 flex-1 overflow-y-auto portal-scrollbar space-y-3">
                  {colLeads.length === 0 ? (
                    <div className="border border-dashed border-zinc-900/40 rounded-xl py-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-650">
                      No leads
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <div key={lead.id} className="luxor-glass-card hover:translate-y-[-2px] p-4 rounded-xl flex flex-col justify-between min-h-[140px] hover:border-zinc-850 transition-all group relative">
                        <Link href={`/portal/leads/${lead.id}`} className="space-y-3 block">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800/60 flex items-center justify-center text-zinc-500 text-[10px] font-bold group-hover:bg-[#caa24c]/10 group-hover:text-[#f1d27a] group-hover:border-[#caa24c]/20 transition-all duration-300">
                              {getInitials(lead.full_name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold text-white/90 group-hover:text-blue-400 transition-colors block truncate leading-none mb-1 group-hover:translate-x-0.5 transition-transform">
                                {lead.full_name}
                              </span>
                              <p className="text-[9px] text-zinc-500 truncate font-mono">
                                {lead.email ?? lead.phone ?? 'No contact'}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1.5 border-t border-zinc-900/60 pt-2.5">
                            <div className="flex items-center justify-between text-[10px] text-zinc-300 font-mono">
                              <span className="font-semibold text-white/80">{lead.event_type || 'Quinceañera'}</span>
                              <span className="text-zinc-500">
                                {isGrandOpeningRsvp(lead)
                                  ? `${lead.attendee_count || lead.guest_count || 1} RSVP`
                                  : lead.guest_count
                                    ? `${lead.guest_count} guests`
                                    : 'No count'}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-[9px] text-[#caa24c] font-medium uppercase tracking-tight">
                              <Calendar size={11} className="text-zinc-600" />
                              <span>{lead.target_date || 'Date TBD'}</span>
                            </div>
                            {isGrandOpeningRsvp(lead) ? <GrandOpeningBadge /> : null}
                          </div>
                        </Link>

                        {/* Card Action Controls */}
                        <div className="flex items-center justify-between border-t border-zinc-900/40 pt-3 mt-3">
                          <div className="flex gap-1.5">
                            {lead.email && (
                              <a href={`mailto:${lead.email}`} className="p-1 rounded bg-zinc-900/50 border border-zinc-850 text-zinc-500 hover:text-white transition-colors" title="Send Email">
                                <Mail size={11} />
                              </a>
                            )}
                            {lead.phone && (
                              <a href={`tel:${lead.phone}`} className="p-1 rounded bg-zinc-900/50 border border-zinc-850 text-zinc-500 hover:text-white transition-colors" title="Call Phone">
                                <Phone size={11} />
                              </a>
                            )}
                          </div>

                          <div className="flex gap-1">
                            {colIndex > 0 && (
                              <button
                                type="button"
                                onClick={() => handleMovePipelineStage(lead.id, colArray[colIndex - 1].id)}
                                className="p-1 rounded bg-zinc-900/60 border border-zinc-850 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                title={`Move to ${colArray[colIndex - 1].label}`}
                              >
                                <ChevronLeft size={12} />
                              </button>
                            )}
                            {colIndex < colArray.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMovePipelineStage(lead.id, colArray[colIndex + 1].id)}
                                className="p-1 rounded bg-zinc-900/60 border border-zinc-850 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                                title={`Move to ${colArray[colIndex + 1].label}`}
                              >
                                <ChevronRight size={12} />
                              </button>
                            )}
                            {lead.status !== 'closed_lost' && (
                              <button
                                type="button"
                                onClick={() => handleMoveStatus(lead.id, 'closed_lost')}
                                className="p-1 rounded bg-zinc-900/60 border border-zinc-850 text-zinc-650 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                                title="Mark Lost"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* Lost Leads Drawer / Collapsed Last Column */}
          <div className="flex-1 min-w-[280px] max-w-[340px] bg-zinc-950/5 border border-zinc-900/40 rounded-2xl flex flex-col h-[calc(100vh-21rem)] overflow-hidden opacity-60 hover:opacity-100 transition-all duration-300">
            <div className="p-4 border-b border-zinc-900/80 bg-[#070707] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Closed Lost</span>
              </div>
              <span className="text-[9px] font-mono font-bold text-zinc-650 bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded-md">
                {sortedLeads.filter(l => l.status === 'closed_lost').length}
              </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto portal-scrollbar space-y-3">
              {sortedLeads.filter(l => l.status === 'closed_lost').length === 0 ? (
                <div className="border border-dashed border-zinc-900/40 rounded-xl py-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-700">
                  No lost leads
                </div>
              ) : (
                sortedLeads.filter(l => l.status === 'closed_lost').map((lead) => (
                  <div key={lead.id} className="bg-zinc-950/65 border border-zinc-900/60 p-4 rounded-xl flex flex-col justify-between min-h-[120px] hover:border-zinc-800 transition-all group">
                    <Link href={`/portal/leads/${lead.id}`} className="block">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-850/60 flex items-center justify-center text-zinc-600 text-[10px] font-bold">
                          {getInitials(lead.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-zinc-400 group-hover:text-blue-500 block truncate leading-none mb-1">
                            {lead.full_name}
                          </span>
                          <p className="text-[9px] text-zinc-600 truncate font-mono">{lead.email ?? lead.phone ?? 'No contact'}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-650 mt-2 font-medium">
                        {isGrandOpeningRsvp(lead)
                          ? `Grand Opening RSVP • ${lead.attendee_count || lead.guest_count || 1} attending`
                          : `${lead.event_type || 'Quinceañera'} • ${lead.guest_count || 0} guests`}
                      </p>
                    </Link>

                    <div className="flex justify-end pt-3 mt-3 border-t border-zinc-900/20">
                      <button
                        type="button"
                        onClick={() => handleMoveStatus(lead.id, 'new')}
                        className="text-[9px] font-black uppercase tracking-wider text-blue-500/80 hover:text-blue-400"
                      >
                        Re-Open Lead
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Lead Addition Modal */}
      {isModalOpen && (
        <PortalModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Client / Lead">
          <form onSubmit={handleCreateLead} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Full Name</label>
              <input
                type="text"
                required
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                placeholder="Client name..."
                className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Email Address</label>
                <input
                  type="email"
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Phone Number</label>
                <input
                  type="text"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="214-555-0199"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Event Type</label>
                <PortalSelect
                  value={newLeadEventType}
                  onChange={setNewLeadEventType}
                  className="w-full"
                  options={[
                    { value: 'Wedding', label: 'Wedding' },
                    { value: 'Quinceañera', label: 'Quinceañera' },
                    { value: 'Baby shower', label: 'Baby Shower' },
                    { value: 'Birthday', label: 'Birthday' },
                    { value: 'Corporate event', label: 'Corporate' },
                    { value: 'Private celebration', label: 'Celebration' }
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Guest Count</label>
                <input
                  type="number"
                  value={newLeadGuestCount}
                  onChange={(e) => setNewLeadGuestCount(e.target.value)}
                  placeholder="200"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500 text-center"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Target Month/Date</label>
                <input
                  type="text"
                  value={newLeadTargetDate}
                  onChange={(e) => setNewLeadTargetDate(e.target.value)}
                  placeholder="Oct 2026"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Initial Inquiry Details / Message</label>
              <textarea
                value={newLeadMessage}
                onChange={(e) => setNewLeadMessage(e.target.value)}
                placeholder="Include setup, package needs, or specific booking parameters..."
                className="w-full h-20 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded p-2 outline-none focus:border-blue-500 leading-relaxed font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 disabled:opacity-40"
            >
              Add Client Lead
            </button>
          </form>
        </PortalModal>
      )}
    </PortalPageFrame>
  )
}

function LeadMetric({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  label: string
  value: string
  detail: string
  tone?: 'blue' | 'gold' | 'green'
}) {
  const tones = {
    blue: 'text-blue-400 border-blue-500/15 bg-blue-500/5',
    gold: 'text-[#f1d27a] border-[#caa24c]/18 bg-[#caa24c]/8',
    green: 'text-emerald-400 border-emerald-500/15 bg-emerald-500/5',
  }

  return (
    <div className="rounded-xl border border-[#caa24c]/10 bg-black/36 px-4 py-3 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">{label}</p>
        <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}>Live</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl font-bold text-white">{value}</p>
        <p className="pb-1 text-right text-[11px] font-medium leading-4 text-[#d7c29a]/60">{detail}</p>
      </div>
    </div>
  )
}

function GrandOpeningBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[#caa24c]/25 bg-[#caa24c]/10 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-[#f1d27a]">
      <Sparkles size={9} />
      Grand Opening RSVP
    </span>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function isGrandOpeningRsvp(lead: LuxorInquiry) {
  return lead.campaign_key === 'grand_opening_2026_07_25' || lead.flow === 'grand_opening_rsvp' || lead.source === 'grand_opening_rsvp'
}

function formatSourceLabel(lead: LuxorInquiry) {
  return isGrandOpeningRsvp(lead) ? 'Grand Opening RSVP' : lead.source.replaceAll('_', ' ')
}

function getPipelineStage(lead: LuxorInquiry): LuxorPipelineStage {
  if (lead.pipeline_stage) return lead.pipeline_stage
  if (lead.status === 'tour_requested' || lead.status === 'tour_confirmed') return 'tour'
  if (lead.status === 'proposal_sent') return 'proposal_sent'
  if (lead.status === 'booked') return 'book_reserve'
  if (lead.status === 'closed_lost') return 'closed_lost'
  return 'inquiry'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
