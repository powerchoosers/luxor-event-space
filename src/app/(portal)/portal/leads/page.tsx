'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
  X,
  TrendingUp,
  UserCheck,
  FileCheck
} from 'lucide-react'
import Link from 'next/link'
import { LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus, LuxorPipelineStage } from '@/lib/luxorInquiryTypes'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalModal,
  PortalSelect,
  PortalButton,
  PortalContactAvatar
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
  { id: 'proposal', label: 'Proposal', short: 'Proposal', tone: 'indigo', status: 'proposal_sent' },
  { id: 'contract', label: 'Contract', short: 'Contract', tone: 'indigo', status: 'booked' },
  { id: 'deposit', label: 'Deposit', short: 'Deposit', tone: 'green', status: 'booked' },
  { id: 'planning', label: 'Planning', short: 'Planning', tone: 'cyan', status: 'booked' },
  { id: 'final_payment', label: 'Final Payment', short: 'Final Payment', tone: 'amber', status: 'booked' },
  { id: 'event', label: 'Event', short: 'Event', tone: 'rose', status: 'booked' },
  { id: 'closing', label: 'Complete', short: 'Complete', tone: 'zinc', status: 'booked' },
]

const PIPELINE_STAGE_OPTIONS: { value: LuxorPipelineStage; label: string }[] = [
  { value: 'inquiry', label: 'Inquiry' },
  { value: 'tour', label: 'Tour' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'contract', label: 'Contract' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'planning', label: 'Planning' },
  { value: 'final_payment', label: 'Final Payment' },
  { value: 'event', label: 'Event' },
  { value: 'closing', label: 'Complete' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

export default function LeadsPage() {
  const [leads, setLeads] = useState<LuxorInquiry[]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients'>('dashboard')
  
  // View mode toggle
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'active' | 'name' | 'guests'>('active')
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState<number>(1)

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

  // Load view preferences from cache on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('luxor_leads_active_tab')
      const savedViewMode = localStorage.getItem('luxor_leads_view_mode')
      const savedPage = localStorage.getItem('luxor_leads_current_page')
      if (savedTab) {
        setActiveTab(savedTab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients')
      }
      if (savedViewMode) {
        setViewMode(savedViewMode as 'list' | 'board')
      }
      if (savedPage) {
        setCurrentPage(parseInt(savedPage, 10))
      }
    }
  }, [])

  // Restore board scroll position once data is loaded and columns are rendered
  useEffect(() => {
    if (!loading && activeTab === 'pipeline' && viewMode === 'board') {
      const savedScroll = localStorage.getItem('luxor_leads_board_scroll_left')
      if (savedScroll && boardRef.current) {
        requestAnimationFrame(() => {
          if (boardRef.current) {
            boardRef.current.scrollLeft = parseInt(savedScroll, 10)
          }
        })
      }
    }
  }, [loading, activeTab, viewMode])

  const handleBoardScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft
    localStorage.setItem('luxor_leads_board_scroll_left', String(scrollLeft))
  }

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

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'grand_opening' ? isGrandOpeningRsvp(lead) : getPipelineStage(lead) === statusFilter)

    return matchesSearch && matchesStatus
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

  // Pagination Calculations
  const totalPages = Math.ceil(totalCount / 25)
  const startIndex = (currentPage - 1) * 25
  const paginatedLeads = sortedLeads.slice(startIndex, startIndex + 25)

  // Ensure current page bounds stay valid when filters change
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    localStorage.setItem('luxor_leads_current_page', String(page))
  }
  const grandOpeningCount = leads.filter(isGrandOpeningRsvp).length
  const missingContact = leads.filter((l) => !l.email && !l.phone).length
  return (
    <PortalPageFrame className="flex-1 min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<Users size={18} />}
        title="Leads & Clients"
        description="Monitor and manage the intake pipeline of event space prospects."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {activeTab === 'pipeline' && (
              <>
                <div className="flex border border-zinc-800 rounded-md p-0.5 bg-zinc-950/60 font-semibold text-[10px] tracking-widest uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('list')
                      localStorage.setItem('luxor_leads_view_mode', 'list')
                    }}
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
                    onClick={() => {
                      setViewMode('board')
                      setStatusFilter('all')
                      localStorage.setItem('luxor_leads_view_mode', 'board')
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'board'
                        ? 'bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/20'
                        : 'text-zinc-500 hover:text-zinc-350 font-bold'
                    }`}
                  >
                    Board
                  </button>
                </div>

                {viewMode === 'list' && (
                  <PortalSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'all', label: 'All Steps' },
                      { value: 'grand_opening', label: 'Grand Opening RSVP' },
                      ...PIPELINE_STAGE_OPTIONS
                    ]}
                  />
                )}
              </>
            )}
            <PortalButton variant="primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={14} /> New Lead
            </PortalButton>
          </div>
        }
      />

      {/* Sub-tab navigation */}
      <div className="flex shrink-0 gap-2 border-b border-[color:var(--portal-border)] pb-2 overflow-x-auto portal-scrollbar">
        <PortalAnimatedTabs
          tabs={[
          { id: 'dashboard', label: 'Funnel Dashboard', icon: <TrendingUp size={15} /> },
          { id: 'pipeline', label: 'Pipeline Board', icon: <Users size={15} /> },
          { id: 'tours', label: 'Tours', icon: <Calendar size={15} /> },
          { id: 'proposals', label: 'Proposals & Contracts', icon: <FileCheck size={15} /> },
          { id: 'clients', label: 'Booked Clients', icon: <UserCheck size={15} /> },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => {
            const nextTab = tab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients'
            setActiveTab(nextTab)
            localStorage.setItem('luxor_leads_active_tab', nextTab)
          }}
        />
      </div>

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 flex flex-col overflow-visible mt-0">
        {activeTab === 'dashboard' && <LeadsDashboard leads={leads} />}
        {activeTab === 'clients' && <LeadsClientsTab leads={leads} onMovePipelineStage={handleMovePipelineStage} />}
        {activeTab === 'tours' && <LeadsToursTab leads={leads} onMovePipelineStage={handleMovePipelineStage} />}
        {activeTab === 'proposals' && <LeadsProposalsTab leads={leads} onMovePipelineStage={handleMovePipelineStage} />}

        {activeTab === 'pipeline' && (
          viewMode === 'list' ? (
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
                  className="flex items-center gap-1.5 text-zinc-355 hover:text-white transition-colors select-none cursor-pointer"
                >
                  <span>{sortBy === 'name' ? 'Name' : sortBy === 'guests' ? 'Guest Count' : 'Recently Active'}</span>
                  <ChevronDown size={12} className={`text-zinc-550 transition-transform duration-150 ${sortDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {sortDropdownOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={() => setSortDropdownOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute right-0 top-6 z-30 mt-1 w-44 rounded-md border border-[color:var(--portal-border,rgba(202,162,76,0.18))] p-1.5 shadow-2xl shadow-black/35 origin-top-right flex flex-col gap-0.5"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--portal-bg, #080706) 82%, transparent)',
                          backdropFilter: 'blur(24px)',
                          WebkitBackdropFilter: 'blur(24px)'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => { setSortBy('active'); setSortDropdownOpen(false) }}
                          className={`w-full text-left text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded transition-colors cursor-pointer ${
                            sortBy === 'active' || (!sortBy)
                              ? 'bg-[#caa24c]/12 text-[#f1d27a] font-black'
                              : 'text-zinc-550 hover:text-white hover:bg-zinc-900/50'
                          }`}
                        >
                          Recently Active
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSortBy('name'); setSortDropdownOpen(false) }}
                          className={`w-full text-left text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded transition-colors cursor-pointer ${
                            sortBy === 'name'
                              ? 'bg-[#caa24c]/12 text-[#f1d27a] font-black'
                              : 'text-zinc-550 hover:text-white hover:bg-zinc-900/50'
                          }`}
                        >
                          Name
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSortBy('guests'); setSortDropdownOpen(false) }}
                          className={`w-full text-left text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded transition-colors cursor-pointer ${
                            sortBy === 'guests'
                              ? 'bg-[#caa24c]/12 text-[#f1d27a] font-black'
                              : 'text-zinc-550 hover:text-white hover:bg-zinc-900/50'
                          }`}
                        >
                          Guest Count
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          }
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full text-[10px] uppercase font-bold text-zinc-550 tracking-widest select-none">
              <div>
                Showing <span className="text-zinc-350 font-mono">{startIndex + 1}</span> -{' '}
                <span className="text-zinc-350 font-mono">{Math.min(startIndex + 25, totalCount)}</span> of{' '}
                <span className="text-zinc-350 font-mono">{totalCount}</span> leads
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="px-3 py-1.5 rounded bg-zinc-950/85 border border-zinc-900 text-zinc-400 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-zinc-900 transition-all font-black uppercase tracking-wider text-[9px]"
                  >
                    Prev
                  </button>
                  <div className="flex items-center gap-1 font-mono">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => handlePageChange(pageNum)}
                          className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${
                            currentPage === pageNum
                              ? 'bg-[#caa24c]/15 text-[#f1d27a] border-[#caa24c]/30 font-bold'
                              : 'bg-zinc-950/20 text-zinc-550 border-zinc-900/60 hover:text-zinc-355 hover:bg-zinc-900'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="px-3 py-1.5 rounded bg-zinc-950/85 border border-zinc-900 text-zinc-400 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-zinc-900 transition-all font-black uppercase tracking-wider text-[9px]"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          }
        >
          <PortalStickyTable minWidth="1060px">
            <PortalStickyThead>
              <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.15em] bg-[#0c0c0c]/85">
                <th className="px-8 py-3.5">Full Name & Contact</th>
                <th className="px-6 py-3.5">Step</th>
                <th className="px-6 py-3.5">Event Parameters</th>
                <th className="px-6 py-3.5">Intake Date</th>
                <th className="px-6 py-3.5">Source Node</th>
                <th className="px-8 py-3.5 text-right">Engagement</th>
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
                paginatedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-zinc-900/40 transition-colors group">
                    <td className="px-8 py-3">
                      <Link
                        href={`/portal/leads/${lead.id}`}
                        className="flex items-center gap-4 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      >
                        <div className="relative">
                          <PortalContactAvatar
                            name={lead.full_name}
                            size="md"
                            className="group-hover:border-[#caa24c]/50 group-hover:bg-[#caa24c]/20 group-hover:from-transparent group-hover:to-transparent"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/90 leading-tight mb-0.5 group-hover:translate-x-0.5 transition-transform">
                            {lead.full_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[10px] text-zinc-550 font-medium group-hover:text-zinc-400">
                              {lead.email ?? lead.phone ?? `ID: ${lead.id.slice(0, 8)}`}
                            </p>
                            {isGrandOpeningRsvp(lead) ? <GrandOpeningBadge /> : null}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-3 font-mono">
                      <PortalSelect
                        value={getPipelineStage(lead)}
                        onChange={(value) => handleMovePipelineStage(lead.id, value as LuxorPipelineStage)}
                        options={PIPELINE_STAGE_OPTIONS}
                        className="min-w-[170px]"
                      />
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-zinc-355">
                      <div className="font-semibold text-white">{lead.event_type || 'Quinceañera'}</div>
                      <div className="text-zinc-550 text-[10px] mt-0.5">
                        {isGrandOpeningRsvp(lead)
                          ? `${lead.attendee_count || lead.guest_count || 1} attending`
                          : lead.guest_count
                            ? `${lead.guest_count} guests`
                            : 'Guest count needed'}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-start flex-col">
                        <span className="text-xs text-zinc-400 font-medium">{formatDate(lead.created_at)}</span>
                        <span className="text-[9px] text-[#caa24c] font-bold uppercase tracking-tighter mt-0.5">
                          {lead.target_date || 'Date requested'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGrandOpeningRsvp(lead) ? 'text-[#f1d27a]' : 'text-zinc-550'}`}>
                        {formatSourceLabel(lead)}
                      </span>
                    </td>
                    <td className="px-8 py-3 text-right">
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
        <div ref={boardRef} onScroll={handleBoardScroll} className="flex-1 min-h-0 overflow-x-auto portal-scrollbar -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-4 flex gap-4 select-none">
          {PIPELINE_COLUMNS.map((col, colIndex, colArray) => {
            const colLeads = sortedLeads.filter(l => getPipelineStage(l) === col.id)
            return (
              <div key={col.id} className="flex-1 min-w-[280px] max-w-[340px] bg-zinc-950/15 border border-zinc-900/60 rounded-2xl flex flex-col h-full overflow-hidden">
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
                  <span className="text-[9px] font-mono font-bold text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-0.5 rounded-md">
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
                            <PortalContactAvatar
                              name={lead.full_name}
                              className="w-7 h-7 text-[10px] group-hover:border-[#caa24c]/50 group-hover:bg-[#caa24c]/25 transition-all duration-300"
                            />
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
                              <button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })} className="p-1 rounded bg-zinc-900/50 border border-zinc-850 text-zinc-500 hover:text-white transition-colors" title="Call from Luxor browser phone">
                                <Phone size={11} />
                              </button>
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
          <div className="flex-1 min-w-[280px] max-w-[340px] bg-zinc-950/5 border border-zinc-900/40 rounded-2xl flex flex-col h-full overflow-hidden opacity-60 hover:opacity-100 transition-all duration-300">
            <div className="p-4 border-b border-zinc-900/80 bg-[#070707] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.5)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Closed Lost</span>
              </div>
              <span className="text-[9px] font-mono font-bold text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-0.5 rounded-md">
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
                  <div key={lead.id} className="bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] p-4 rounded-xl flex flex-col justify-between min-h-[120px] hover:border-zinc-800/80 transition-all group">
                    <Link href={`/portal/leads/${lead.id}`} className="block">
                      <div className="flex items-center gap-3">
                        <PortalContactAvatar
                          name={lead.full_name}
                          className="w-7 h-7 text-[10px]"
                        />
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
      )
        )}
      </PortalTabTransition>

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
  if (lead.status === 'proposal_sent') return 'proposal'
  if (lead.status === 'booked') return 'contract'
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

// --- SUB-TAB COMPONENTS FOR LEADS & CLIENTS ---

function LeadsDashboard({ leads }: { leads: LuxorInquiry[] }) {
  const newInquiries = leads.filter(l => l.status === 'new').length
  const toursScheduled = leads.filter(l => l.status === 'tour_requested').length
  const toursCompleted = leads.filter(l => l.status === 'tour_confirmed' || l.tour_attendance_status === 'attended').length
  const proposalsSent = leads.filter(l => l.status === 'proposal_sent').length
  const depositsReceived = leads.filter(l => l.status === 'booked').length
  const totalLeads = leads.length
  const conversionRate = totalLeads > 0 ? ((depositsReceived / totalLeads) * 100).toFixed(1) : '0.0'

  // Upcoming tours
  const upcomingTours = leads
    .filter(l => (l.status === 'tour_requested' || l.status === 'tour_confirmed') && l.preferred_tour_date)
    .slice(0, 5)

  // Recent leads
  const recentLeads = [...leads].slice(0, 5)

  // Funnel calculations
  const total = leads.length || 1
  const tourStageCount = leads.filter(l => ['tour_requested', 'tour_confirmed', 'proposal_sent', 'booked'].includes(l.status)).length
  const proposalStageCount = leads.filter(l => ['proposal_sent', 'booked'].includes(l.status)).length
  const bookedStageCount = leads.filter(l => l.status === 'booked').length

  const tourPct = ((tourStageCount / total) * 100).toFixed(0)
  const proposalPct = ((proposalStageCount / total) * 100).toFixed(0)
  const bookedPct = ((bookedStageCount / total) * 100).toFixed(0)

  return (
    <div className="h-full overflow-y-auto portal-scrollbar pr-1 space-y-6 pb-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="New Inquiries" value={newInquiries} subtitle="Awaiting response" tone="blue" />
        <StatsCard label="Tours Scheduled" value={toursScheduled} subtitle="Active bookings" tone="purple" />
        <StatsCard label="Tours Completed" value={toursCompleted} subtitle="Tours held" tone="cyan" />
        <StatsCard label="Proposals Sent" value={proposalsSent} subtitle="Out for signature" tone="gold" />
        <StatsCard label="Deposits Received" value={depositsReceived} subtitle="Booked clients" tone="green" />
        <StatsCard label="Conversion Rate" value={`${conversionRate}%`} subtitle="Lead-to-booking" tone="green" />
      </div>

      {/* Charts & Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Funnel */}
        <div className="luxor-glass-card rounded-2xl p-6 lg:col-span-1 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] mb-6 flex items-center gap-2">
            <TrendingUp size={15} className="text-[#caa24c]" /> Sales Funnel Analysis
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">1. New Inquiries</span>
                <span className="font-mono text-zinc-400">{total} leads (100%)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">2. Tours Booked</span>
                <span className="font-mono text-zinc-400">{tourStageCount} ({tourPct}%)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${tourPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">3. Proposals Out</span>
                <span className="font-mono text-zinc-400">{proposalStageCount} ({proposalPct}%)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${proposalPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">4. Booked Event Days</span>
                <span className="font-mono text-emerald-400">{bookedStageCount} ({bookedPct}%)</span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${bookedPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Tours */}
        <div className="luxor-glass-card rounded-2xl p-6 lg:col-span-2 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] mb-6 flex items-center gap-2">
              <Calendar size={15} className="text-[#caa24c]" /> Upcoming Scheduled Tours
            </h3>
            {upcomingTours.length === 0 ? (
              <p className="text-xs text-zinc-500 font-medium py-4 text-center">No upcoming tours scheduled this week.</p>
            ) : (
              <div className="space-y-4">
                {upcomingTours.map((t) => (
                  <div key={t.id} className="flex items-center justify-between border-b border-[color:var(--portal-border)]/50 pb-3 border-dashed last:border-b-0 last:pb-0">
                    <div>
                      <Link href={`/portal/leads/${t.id}`} className="text-xs font-bold text-white hover:text-[#caa24c] transition-colors">{t.full_name}</Link>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{t.event_type || 'Event'} • {t.guest_count || 'Flexible'} guests</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#caa24c]">{t.preferred_tour_date}</p>
                      <p className="text-[9px] text-zinc-500 mt-0.5">{t.preferred_tour_time || 'Flexible'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-[color:var(--portal-border)]/50 mt-4">
            <Link href="/portal/calendar" className="text-xs font-bold text-[#caa24c] hover:text-[#b0883b] flex items-center gap-1 justify-center">
              View Calendar Schedule <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity / Inquiries List */}
      <div className="luxor-glass-card rounded-2xl p-6 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] mb-6 flex items-between justify-between">
          <span>Recent Lead Submissions</span>
          <span className="text-[9px] font-semibold text-zinc-500 lowercase tracking-normal">last 5 entries</span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--portal-border)] text-zinc-550 font-bold uppercase tracking-wider text-[10px]">
                <th className="pb-3">Client Name</th>
                <th className="pb-3">Event Type</th>
                <th className="pb-3">Intake Date</th>
                <th className="pb-3">Source Channel</th>
                <th className="pb-3 text-right">Pipeline Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/30">
              {recentLeads.map((l) => (
                <tr key={l.id} className="hover:bg-zinc-950/20 transition-colors">
                  <td className="py-4 font-bold text-white">
                    <Link href={`/portal/leads/${l.id}`} className="hover:text-[#caa24c] transition-colors">{l.full_name}</Link>
                    <span className="block text-[10px] text-zinc-500 font-normal font-mono mt-0.5">{l.email || 'No email registered'}</span>
                  </td>
                  <td className="py-4 text-zinc-300 font-medium">{l.event_type || 'Quinceañera'}</td>
                  <td className="py-4 text-zinc-400 font-medium">{formatDate(l.created_at)}</td>
                  <td className="py-4 font-mono font-bold text-[#caa24c]/80 uppercase tracking-widest text-[9px]">{isGrandOpeningRsvp(l) ? 'RSVP' : l.source.replaceAll('_', ' ')}</td>
                  <td className="py-4 text-right">
                    <span className="text-[9px] font-bold uppercase tracking-wider border rounded-md px-2 py-0.5 border-[#caa24c]/25 bg-[#caa24c]/10 text-[#f1d27a]">{l.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatsCard({
  label,
  value,
  subtitle,
  tone = 'blue',
}: {
  label: string
  value: string | number
  subtitle: string
  tone?: 'blue' | 'purple' | 'cyan' | 'gold' | 'green'
}) {
  const styles = {
    blue: 'border-blue-500/10 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/10 bg-purple-500/5 text-purple-400',
    cyan: 'border-cyan-500/10 bg-cyan-500/5 text-cyan-400',
    gold: 'border-[#caa24c]/10 bg-[#caa24c]/5 text-[#f1d27a]',
    green: 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400',
  }

  return (
    <div className="luxor-glass-card rounded-xl p-4 border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] flex flex-col justify-between min-h-[110px]">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        <p className="font-mono text-xl font-bold text-white mt-1.5">{value}</p>
      </div>
      <p className="text-[10px] text-zinc-500 font-medium leading-none mt-3">{subtitle}</p>
    </div>
  )
}

function LeadsClientsTab({ leads, onMovePipelineStage }: { leads: LuxorInquiry[]; onMovePipelineStage: (id: string, stage: LuxorPipelineStage) => void }) {
  const clients = leads.filter(l => l.status === 'booked')
  return (
    <PortalTableCard
      controls={
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Active Booked Clients ({clients.length})</h3>
      }
    >
      <div className="overflow-x-auto">
        <PortalStickyTable minWidth="900px">
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.15em] border-b border-zinc-900 bg-[#0c0c0c]/80">
              <th className="px-8 py-5">Client Name</th>
              <th className="px-6 py-5">Event Type</th>
              <th className="px-6 py-5">Guest Count</th>
              <th className="px-6 py-5">Target Event Date</th>
              <th className="px-8 py-5 text-right">Action</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-zinc-900/30">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-sm text-zinc-500 text-center font-medium">No booked clients in pipeline currently.</td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-950/20 transition-colors">
                  <td className="px-8 py-5">
                    <Link href={`/portal/leads/${c.id}`} className="font-bold text-white hover:text-[#caa24c] transition-colors">{c.full_name}</Link>
                    <p className="text-[10px] text-zinc-550 mt-0.5 font-mono">{c.email || 'No email registered'}</p>
                  </td>
                  <td className="px-6 py-5 text-zinc-350 font-medium">{c.event_type || 'Quinceañera'}</td>
                  <td className="px-6 py-5 text-zinc-500 font-mono text-xs">{c.guest_count || 'Flexible'} guests</td>
                  <td className="px-6 py-5 text-[#caa24c] font-bold font-mono">{c.target_date || 'TBD'}</td>
                  <td className="px-8 py-5 text-right">
                    <Link href={`/portal/leads/${c.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Manage Dossier →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </PortalStickyTable>
      </div>
    </PortalTableCard>
  )
}

function LeadsToursTab({ leads, onMovePipelineStage }: { leads: LuxorInquiry[]; onMovePipelineStage: (id: string, stage: LuxorPipelineStage) => void }) {
  const tours = leads.filter(l => l.status === 'tour_requested' || l.status === 'tour_confirmed')
  return (
    <PortalTableCard
      controls={
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Scheduled Tours ({tours.length})</h3>
      }
    >
      <div className="overflow-x-auto">
        <PortalStickyTable minWidth="900px">
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.15em] border-b border-zinc-900 bg-[#0c0c0c]/80">
              <th className="px-8 py-5">Client Name</th>
              <th className="px-6 py-5">Tour Time Preference</th>
              <th className="px-6 py-5">Event Type</th>
              <th className="px-6 py-5">Lifecycle Step</th>
              <th className="px-8 py-5 text-right">Action</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-zinc-900/30">
            {tours.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-sm text-zinc-500 text-center font-medium">No tours currently scheduled.</td>
              </tr>
            ) : (
              tours.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-950/20 transition-colors">
                  <td className="px-8 py-5">
                    <Link href={`/portal/leads/${t.id}`} className="font-bold text-white hover:text-[#caa24c] transition-colors">{t.full_name}</Link>
                    <p className="text-[10px] text-zinc-550 mt-0.5">{t.email || t.phone}</p>
                  </td>
                  <td className="px-6 py-5">
                    <p className="text-xs font-bold text-[#caa24c]">{t.preferred_tour_date || 'Date Pending'}</p>
                    <p className="text-[10px] text-zinc-550 mt-0.5">{t.preferred_tour_time || 'Time TBD'}</p>
                  </td>
                  <td className="px-6 py-5 text-zinc-350 font-medium">{t.event_type || 'Quinceañera'}</td>
                  <td className="px-6 py-5 font-mono">
                    <PortalSelect
                      value={getPipelineStage(t)}
                      onChange={(val) => onMovePipelineStage(t.id, val as LuxorPipelineStage)}
                      options={PIPELINE_STAGE_OPTIONS}
                    />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <Link href={`/portal/leads/${t.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Manage Tour →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </PortalStickyTable>
      </div>
    </PortalTableCard>
  )
}

function LeadsProposalsTab({ leads, onMovePipelineStage }: { leads: LuxorInquiry[]; onMovePipelineStage: (id: string, stage: LuxorPipelineStage) => void }) {
  const proposals = leads.filter(l => l.status === 'proposal_sent')
  return (
    <PortalTableCard
      controls={
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Sent Proposals ({proposals.length})</h3>
      }
    >
      <div className="overflow-x-auto">
        <PortalStickyTable minWidth="900px">
          <PortalStickyThead>
            <tr className="text-[10px] uppercase font-bold text-zinc-500 tracking-[0.15em] border-b border-zinc-900 bg-[#0c0c0c]/80">
              <th className="px-8 py-5">Client Name</th>
              <th className="px-6 py-5">Event Type</th>
              <th className="px-6 py-5">Guest Count</th>
              <th className="px-6 py-5">Intake Source</th>
              <th className="px-8 py-5 text-right">Action</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-zinc-900/30">
            {proposals.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-sm text-zinc-500 text-center font-medium">No proposals awaiting signature.</td>
              </tr>
            ) : (
              proposals.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-955/20 transition-colors">
                  <td className="px-8 py-5">
                    <Link href={`/portal/leads/${p.id}`} className="font-bold text-white hover:text-[#caa24c] transition-colors">{p.full_name}</Link>
                    <p className="text-[10px] text-zinc-550 mt-0.5 font-mono">{p.email || 'No email'}</p>
                  </td>
                  <td className="px-6 py-5 text-zinc-350 font-medium">{p.event_type || 'Quinceañera'}</td>
                  <td className="px-6 py-5 text-zinc-500 font-mono text-xs">{p.guest_count || 'Flexible'} guests</td>
                  <td className="px-6 py-5 font-mono font-bold uppercase tracking-widest text-[9px] text-[#caa24c]/85">{isGrandOpeningRsvp(p) ? 'RSVP' : p.source.replaceAll('_', ' ')}</td>
                  <td className="px-8 py-5 text-right">
                    <Link href={`/portal/leads/${p.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Review Proposal →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </PortalStickyTable>
      </div>
    </PortalTableCard>
  )
}
