'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react'
import {
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mail,
  MessageSquare,
  Phone,
  Calendar,
  MoreHorizontal,
  Sparkles,
  X,
  TrendingUp,
  UserCheck,
  FileCheck,
  Trash2,
  ArrowRightLeft,
  ListPlus,
  ListMinus
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus, LuxorPipelineStage } from '@/lib/luxorInquiryTypes'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
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
  PortalContactAvatar,
  PortalPagination,
  PortalTableSkeleton,
  PortalFilterBar,
} from '@/components/portal/PortalUI'
import {
  LeadLifecycleActionSheet,
  LeadLifecycleActionsMenu,
  type LeadLifecycleAction,
} from '@/components/portal/LeadLifecycleActionSheet'
import {
  PortalBulkActionDeck,
  PortalBulkChoiceDialog,
  PortalBulkConfirmDialog,
  PortalBulkHeaderSelector,
  PortalBulkListDialog,
  PortalBulkRowSelector,
  usePortalBulkSelection,
} from '@/components/portal/PortalBulkSelection'
import { useToast } from '@/components/portal/ToastProvider'

const INQUIRY_STATUS_OPTIONS: { value: LuxorInquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'tour_requested', label: 'Tour Requested' },
  { value: 'tour_confirmed', label: 'Tour Confirmed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'booked', label: 'Booked' },
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
  const { notify } = useToast()
  const [leads, setLeads] = useState<LuxorInquiry[]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost'>('dashboard')
  
  // View mode toggle
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [contactFilter, setContactFilter] = useState<'all' | 'email' | 'phone' | 'complete' | 'missing'>('all')
  const [sortBy, setSortBy] = useState<'active' | 'name' | 'guests'>('active')
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
  const bulkSelection = usePortalBulkSelection<string>()
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<LuxorInquiryStatus>('contacted')
  const [bulkListMode, setBulkListMode] = useState<'add' | 'remove' | null>(null)
  const [marketingListNames, setMarketingListNames] = useState<string[]>([])
  const [lifecycleLead, setLifecycleLead] = useState<LuxorInquiry | null>(null)
  const [lifecycleAction, setLifecycleAction] = useState<LeadLifecycleAction | null>(null)

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
        setActiveTab(savedTab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost')
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

  const openLeadLifecycleAction = (lead: LuxorInquiry, action: LeadLifecycleAction) => {
    setLifecycleLead(lead)
    setLifecycleAction(action)
  }

  const handleLeadLifecycleCompleted = ({ lead: updatedLead, calendarWarning }: { lead: LuxorInquiry; calendarWarning?: string }) => {
    setLeads((current) => current.map((lead) => (
      lead.id === updatedLead.id
        ? { ...lead, ...updatedLead, metadata: { ...lead.metadata, ...updatedLead.metadata } }
        : lead
    )))
    setLifecycleAction(null)
    setLifecycleLead(null)
    if (calendarWarning) {
      notify({
        title: 'Calendar invite still needs attention',
        description: calendarWarning,
        variant: 'warning',
        durationMs: 0,
      })
    }
    void fetchLeads()
  }

  const handleMoveStatus = async (leadId: string, newStatus: LuxorInquiryStatus) => {
    if (newStatus === 'closed_lost') {
      const lead = leads.find((item) => item.id === leadId)
      if (lead) openLeadLifecycleAction(lead, 'deal-lost')
      return
    }
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
    if (newStage === 'closed_lost') {
      const lead = leads.find((item) => item.id === leadId)
      if (lead) openLeadLifecycleAction(lead, 'deal-lost')
      return
    }
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

  // Filter & Sort Inquiries (Memoized for high performance)
  const filteredLeads = useMemo(() => {
    const term = deferredSearchTerm.toLowerCase().trim()
    return leads.filter((lead) => {
      const matchesSearch =
        !term ||
        lead.full_name.toLowerCase().includes(term) ||
        (lead.email && lead.email.toLowerCase().includes(term)) ||
        (lead.phone && lead.phone.includes(term))

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'grand_opening' ? isGrandOpeningRsvp(lead) : getPipelineStage(lead) === statusFilter)

      const matchesEventType = eventTypeFilter === 'all' || lead.event_type === eventTypeFilter
      const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter
      const matchesContact =
        contactFilter === 'all' ||
        (contactFilter === 'email' && Boolean(lead.email)) ||
        (contactFilter === 'phone' && Boolean(lead.phone)) ||
        (contactFilter === 'complete' && Boolean(lead.email && lead.phone)) ||
        (contactFilter === 'missing' && !lead.email && !lead.phone)

      return matchesSearch && matchesStatus && matchesEventType && matchesSource && matchesContact
    })
  }, [contactFilter, deferredSearchTerm, eventTypeFilter, leads, sourceFilter, statusFilter])

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      if (sortBy === 'name') {
        return a.full_name.localeCompare(b.full_name)
      }
      if (sortBy === 'guests') {
        return (b.guest_count || 0) - (a.guest_count || 0)
      }
      // Default: recently active (created_at desc)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [filteredLeads, sortBy])

  // Computed Metrics
  const totalCount = sortedLeads.length
  const newLeadsCount = useMemo(() => leads.filter((l) => l.status === 'new').length, [leads])
  const closedLostCount = useMemo(() => leads.filter((lead) => getPipelineStage(lead) === 'closed_lost').length, [leads])

  // Pagination Calculations
  const totalPages = Math.ceil(totalCount / 25)
  const startIndex = (currentPage - 1) * 25
  const paginatedLeads = useMemo(() => sortedLeads.slice(startIndex, startIndex + 25), [sortedLeads, startIndex])
  const pageLeadIds = useMemo(() => paginatedLeads.map((lead) => lead.id), [paginatedLeads])
  const matchingLeadIds = useMemo(() => sortedLeads.map((lead) => lead.id), [sortedLeads])
  const bulkSelectedCount = bulkSelection.selectedCount(matchingLeadIds.length)

  const runLeadBulkAction = useCallback(async (action: 'set_status' | 'delete', value?: LuxorInquiryStatus) => {
    const ids = bulkSelection.resolveIds(matchingLeadIds)
    if (!ids.length) return
    setBulkBusy(action === 'set_status' ? (value || action) : action)
    try {
      const response = await fetch('/api/portal/bulk-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'inquiries', action, ids, value }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; warning?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to update the selected leads.')
      if (action === 'delete') setLeads((current) => current.filter((lead) => !ids.includes(lead.id)))
      else if (value) setLeads((current) => current.map((lead) => ids.includes(lead.id) ? { ...lead, status: value, pipeline_stage: stageForBulkStatus(value) } : lead))
      bulkSelection.clear()
      setConfirmBulkDelete(false)
      if (payload.warning) alert(payload.warning)
    } catch (bulkError) {
      alert(bulkError instanceof Error ? bulkError.message : 'The bulk action failed.')
      void fetchLeads()
    } finally {
      setBulkBusy(null)
    }
  }, [bulkSelection, fetchLeads, matchingLeadIds])

  const openBulkList = useCallback(async (mode: 'add' | 'remove') => {
    setBulkListMode(mode)
    try {
      const response = await fetch('/api/marketing/lists', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { lists?: Array<{ name: string }> }
      if (response.ok) setMarketingListNames((payload.lists || []).map((list) => list.name).sort())
    } catch {
      // Adding can still create a new list if the saved list lookup fails.
    }
  }, [])

  const runMarketingListAction = useCallback(async (listName: string) => {
    if (!bulkListMode) return
    const ids = bulkSelection.resolveIds(matchingLeadIds)
    const selected = leads.filter((lead) => ids.includes(lead.id) && lead.email)
    if (!selected.length) return alert('None of the selected leads has an email address.')
    setBulkBusy(`list-${bulkListMode}`)
    try {
      const response = await fetch('/api/marketing/lists', {
        method: bulkListMode === 'add' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkListMode === 'add'
          ? {
              listName,
              recipients: selected.map((lead) => ({
                email: lead.email,
                name: lead.full_name,
                source: lead.source,
                metadata: { phone: lead.phone, event_type: lead.event_type },
              })),
            }
          : { listName, emails: selected.map((lead) => lead.email) }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; added?: number; removed?: number; skippedSuppressed?: number }
      if (!response.ok) throw new Error(payload.error || 'Unable to update the marketing list.')
      const affected = bulkListMode === 'add' ? payload.added || 0 : payload.removed || 0
      const skipped = payload.skippedSuppressed || 0
      alert(`${affected} ${affected === 1 ? 'contact was' : 'contacts were'} ${bulkListMode === 'add' ? 'added to' : 'removed from'} ${listName}.${skipped ? ` ${skipped} suppressed ${skipped === 1 ? 'address was' : 'addresses were'} skipped.` : ''}`)
      bulkSelection.clear()
      setBulkListMode(null)
    } catch (listError) {
      alert(listError instanceof Error ? listError.message : 'Unable to update the marketing list.')
    } finally {
      setBulkBusy(null)
    }
  }, [bulkListMode, bulkSelection, leads, matchingLeadIds])

  // Ensure current page bounds stay valid when filters change
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
    localStorage.setItem('luxor_leads_current_page', String(page))
  }, [])

  const grandOpeningCount = useMemo(() => leads.filter(isGrandOpeningRsvp).length, [leads])
  const missingContact = useMemo(() => leads.filter((l) => !l.email && !l.phone).length, [leads])
  const eventTypeOptions = useMemo(() => [
    { value: 'all', label: 'All event types' },
    ...Array.from(new Set(leads.map((lead) => lead.event_type).filter((value): value is string => Boolean(value))))
      .sort()
      .map((value) => ({ value, label: value })),
  ], [leads])
  const sourceOptions = useMemo(() => [
    { value: 'all', label: 'All lead sources' },
    ...Array.from(new Set(leads.map((lead) => lead.source).filter((value): value is string => Boolean(value))))
      .sort()
      .map((value) => ({ value, label: value.replaceAll('_', ' ') })),
  ], [leads])
  const activeLeadFilters = [
    ...(statusFilter !== 'all' ? [{
      id: 'stage',
      label: statusFilter === 'grand_opening' ? 'Grand Opening RSVP' : `Step: ${PIPELINE_STAGE_OPTIONS.find((option) => option.value === statusFilter)?.label || statusFilter}`,
      onRemove: () => setStatusFilter('all'),
    }] : []),
    ...(eventTypeFilter !== 'all' ? [{ id: 'event', label: `Event: ${eventTypeFilter}`, onRemove: () => setEventTypeFilter('all') }] : []),
    ...(sourceFilter !== 'all' ? [{ id: 'source', label: `Source: ${sourceOptions.find((option) => option.value === sourceFilter)?.label || sourceFilter}`, onRemove: () => setSourceFilter('all') }] : []),
    ...(contactFilter !== 'all' ? [{
      id: 'contact',
      label: `Contact: ${contactFilter === 'complete' ? 'email + phone' : contactFilter === 'missing' ? 'missing details' : `has ${contactFilter}`}`,
      onRemove: () => setContactFilter('all'),
    }] : []),
  ]

  return (
    <PortalPageFrame className="flex-1 min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<Users size={18} />}
        title="Leads & Clients"
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
                      setSearchTerm('')
                      setStatusFilter('all')
                      setEventTypeFilter('all')
                      setSourceFilter('all')
                      setContactFilter('all')
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
          { id: 'lost', label: 'Closed Lost', icon: <X size={15} />, count: closedLostCount },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => {
            const nextTab = tab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost'
            setActiveTab(nextTab)
            localStorage.setItem('luxor_leads_active_tab', nextTab)
          }}
        />
      </div>

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 flex flex-col overflow-visible mt-0">
        {activeTab === 'dashboard' && <LeadsDashboard leads={leads} loading={loading} />}
        {activeTab === 'clients' && <LeadsClientsTab leads={leads} onLifecycleAction={openLeadLifecycleAction} />}
        {activeTab === 'lost' && <LeadsLostTab leads={leads} />}
        {activeTab === 'tours' && <LeadsToursTab leads={leads} onMovePipelineStage={handleMovePipelineStage} onLifecycleAction={openLeadLifecycleAction} />}
        {activeTab === 'proposals' && <LeadsProposalsTab leads={leads} onLifecycleAction={openLeadLifecycleAction} />}

        {activeTab === 'pipeline' && (
          viewMode === 'list' ? (
        <PortalTableCard
          controls={
            <PortalFilterBar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Search name, email, or phone"
              resultLabel={`${totalCount.toLocaleString()} ${totalCount === 1 ? 'lead' : 'leads'}`}
              activeFilters={activeLeadFilters}
              onClearFilters={() => {
                setStatusFilter('all')
                setEventTypeFilter('all')
                setSourceFilter('all')
                setContactFilter('all')
              }}
            >
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <PortalSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  className="w-full"
                  options={[
                    { value: 'all', label: 'All pipeline steps' },
                    { value: 'grand_opening', label: 'Grand Opening RSVP' },
                    ...PIPELINE_STAGE_OPTIONS.map((option) => option.value === 'closed_lost'
                      ? { ...option, label: `Closed Lost (${closedLostCount})` }
                      : option),
                  ]}
                />
                <PortalSelect value={eventTypeFilter} onChange={setEventTypeFilter} className="w-full" options={eventTypeOptions} />
                <PortalSelect value={sourceFilter} onChange={setSourceFilter} className="w-full capitalize" options={sourceOptions} />
                <PortalSelect
                  value={contactFilter}
                  onChange={(value) => setContactFilter(value as typeof contactFilter)}
                  className="w-full"
                  options={[
                    { value: 'all', label: 'Any contact details' },
                    { value: 'complete', label: 'Email + phone' },
                    { value: 'email', label: 'Has email' },
                    { value: 'phone', label: 'Has phone' },
                    { value: 'missing', label: 'Missing contact details' },
                  ]}
                />
                <PortalSelect
                  value={sortBy}
                  onChange={(value) => setSortBy(value as typeof sortBy)}
                  className="w-full"
                  options={[
                    { value: 'active', label: 'Sort: Recently active' },
                    { value: 'name', label: 'Sort: Name' },
                    { value: 'guests', label: 'Sort: Guest count' },
                  ]}
                />
              </div>
            </PortalFilterBar>
          }
          footer={
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full text-[10px] uppercase font-bold text-zinc-550 tracking-widest select-none">
              <div>
                Showing <span className="text-zinc-350 font-mono">{startIndex + 1}</span> -{' '}
                <span className="text-zinc-350 font-mono">{Math.min(startIndex + 25, totalCount)}</span> of{' '}
                <span className="text-zinc-350 font-mono">{totalCount}</span> leads
              </div>
              {totalPages > 1 && (
                <PortalPagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
              )}
            </div>
          }
        >
          <PortalStickyTable minWidth="1060px">
            <PortalStickyThead>
              <tr className="bg-[color:var(--portal-soft)] text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">
                <th className="w-14 px-4 py-3.5 text-center">
                  <PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(pageLeadIds)} onChange={() => bulkSelection.selectPage(pageLeadIds)} />
                </th>
                <th className="px-4 py-3.5">Full Name & Contact</th>
                <th className="px-6 py-3.5">Step</th>
                <th className="px-6 py-3.5">Event Parameters</th>
                <th className="px-6 py-3.5">Intake Date</th>
                <th className="px-6 py-3.5">Source Node</th>
                <th className="px-8 py-3.5 text-right">Engagement & Actions</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-[color:var(--portal-border)]">
              {loading ? (
                <PortalTableSkeleton cols={7} rows={6} />
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-sm text-red-300">
                    {error}
                  </td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-12 text-sm text-zinc-500">
                    <div className="max-w-xl">
                      <p className="text-base font-semibold text-zinc-300">No records matching search parameters.</p>
                      <p className="mt-2 leading-6">Try broadening your search term or selecting another lifecycle status filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead, rowIndex) => (
                  <tr key={lead.id} className={`group transition-colors hover:bg-[#caa24c]/7 ${bulkSelection.isSelected(lead.id) ? 'bg-[#caa24c]/5' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <PortalBulkRowSelector checked={bulkSelection.isSelected(lead.id)} index={startIndex + rowIndex + 1} onChange={() => bulkSelection.toggle(lead.id)} label={lead.full_name} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/portal/leads/${lead.id}`}
                        className="flex items-center gap-4 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      >
                        <div className="relative">
                          <PortalContactAvatar
                            name={lead.full_name}
                            avatarUrl={lead.metadata?.avatar_url as string | null}
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
                              {lead.email ?? (lead.phone ? formatPhoneDisplay(lead.phone) : `ID: ${lead.id.slice(0, 8)}`)}
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
                      <div className="flex items-center justify-end gap-2 opacity-100 transition-all duration-300 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:translate-x-4 sm:group-hover:translate-x-0 sm:group-focus-within:translate-x-0">
                        {lead.phone ? (
                          <button
                            type="button"
                            onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })}
                            className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-[color:var(--portal-muted)] transition-all hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
                            title={`Call ${formatPhoneDisplay(lead.phone)}`}
                          >
                            <Phone size={14} />
                          </button>
                        ) : null}
                        {lead.phone ? (
                          <Link href={`/portal/leads/${lead.id}?tab=messages`} className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/35 hover:bg-[#caa24c]/10 hover:text-[#a8792f]" title="Text client">
                            <MessageSquare size={14} />
                          </Link>
                        ) : null}
                        <Link
                          href={`/portal/leads/${lead.id}`}
                          className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/35 hover:bg-[#caa24c]/10 hover:text-[color:var(--portal-text)]"
                          title="Open Dossier"
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <LeadLifecycleActionsMenu
                          lead={lead}
                          onAction={(action) => openLeadLifecycleAction(lead, action)}
                        />
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
                              avatarUrl={lead.metadata?.avatar_url as string | null}
                              className="w-7 h-7 text-[10px] group-hover:border-[#caa24c]/50 group-hover:bg-[#caa24c]/25 transition-all duration-300"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold text-white/90 group-hover:text-blue-400 transition-colors block truncate leading-none mb-1 group-hover:translate-x-0.5 transition-transform">
                                {lead.full_name}
                              </span>
                              <p className="text-[9px] text-zinc-500 truncate font-mono">
                                {lead.email ?? (lead.phone ? formatPhoneDisplay(lead.phone) : 'No contact')}
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
                            {lead.phone && (
                              <Link href={`/portal/leads/${lead.id}?tab=messages`} className="p-1 rounded bg-zinc-900/50 border border-zinc-850 text-zinc-500 hover:text-[#caa24c] transition-colors" title="Text client">
                                <MessageSquare size={11} />
                              </Link>
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
                            <LeadLifecycleActionsMenu
                              lead={lead}
                              onAction={(action) => openLeadLifecycleAction(lead, action)}
                              className="h-7 w-7 border-zinc-850 bg-zinc-900/60 [&>svg]:h-3.5 [&>svg]:w-3.5"
                            />
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
                {sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').length}
              </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto portal-scrollbar space-y-3">
              {sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').length === 0 ? (
                <div className="border border-dashed border-zinc-900/40 rounded-xl py-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-700">
                  No lost leads
                </div>
              ) : (
                sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').map((lead) => (
                  <div key={lead.id} className="bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] p-4 rounded-xl flex flex-col justify-between min-h-[120px] hover:border-zinc-800/80 transition-all group">
                    <Link href={`/portal/leads/${lead.id}`} className="block">
                      <div className="flex items-center gap-3">
                        <PortalContactAvatar
                          name={lead.full_name}
                          avatarUrl={lead.metadata?.avatar_url as string | null}
                          className="w-7 h-7 text-[10px]"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-zinc-400 group-hover:text-blue-500 block truncate leading-none mb-1">
                            {lead.full_name}
                          </span>
                          <p className="text-[9px] text-zinc-600 truncate font-mono">{lead.email ?? (lead.phone ? formatPhoneDisplay(lead.phone) : 'No contact')}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-650 mt-2 font-medium">
                        {isGrandOpeningRsvp(lead)
                          ? `Grand Opening RSVP • ${lead.attendee_count || lead.guest_count || 1} attending`
                          : `${lead.event_type || 'Quinceañera'} • ${lead.guest_count || 0} guests`}
                      </p>
                    </Link>

                    <div className="flex justify-end pt-3 mt-3 border-t border-zinc-900/20">
                      <Link
                        href={`/portal/leads/${lead.id}`}
                        className="text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]"
                      >
                        View dossier
                      </Link>
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

      <PortalBulkActionDeck
        selectedCount={bulkSelectedCount}
        pageCount={pageLeadIds.length}
        totalCount={matchingLeadIds.length}
        allMatching={bulkSelection.allMatching}
        busyAction={bulkBusy}
        noun="lead"
        onSelectAll={bulkSelection.selectAllMatching}
        onClear={bulkSelection.clear}
        onAction={(action) => {
          if (action === 'status') setBulkStatusOpen(true)
          if (action === 'add-list') void openBulkList('add')
          if (action === 'remove-list') void openBulkList('remove')
          if (action === 'delete') setConfirmBulkDelete(true)
        }}
        actions={[
          { id: 'status', label: 'Change status', icon: <ArrowRightLeft size={13} /> },
          { id: 'add-list', label: 'Add to list', icon: <ListPlus size={13} /> },
          { id: 'remove-list', label: 'Remove from list', icon: <ListMinus size={13} /> },
          { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, tone: 'danger' },
        ]}
      />
      <PortalBulkChoiceDialog
        open={bulkStatusOpen}
        title="Change lead status"
        description={`Update ${bulkSelectedCount} selected ${bulkSelectedCount === 1 ? 'lead' : 'leads'} together.`}
        label="New status"
        value={bulkStatus}
        options={INQUIRY_STATUS_OPTIONS}
        confirmLabel="Update leads"
        busy={Boolean(bulkBusy)}
        onValueChange={(value) => setBulkStatus(value as LuxorInquiryStatus)}
        onConfirm={() => {
          if (bulkStatus === 'closed_lost') return
          setBulkStatusOpen(false)
          void runLeadBulkAction('set_status', bulkStatus)
        }}
        onClose={() => setBulkStatusOpen(false)}
      />
      <PortalBulkListDialog
        open={bulkListMode !== null}
        mode={bulkListMode || 'add'}
        selectedCount={bulkSelectedCount}
        listNames={marketingListNames}
        busy={bulkBusy?.startsWith('list-') || false}
        onConfirm={(listName) => void runMarketingListAction(listName)}
        onClose={() => setBulkListMode(null)}
      />
      <PortalBulkConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulkSelectedCount} selected lead${bulkSelectedCount === 1 ? '' : 's'}?`}
        description="This permanently removes the lead records plus their notes and tasks. Linked invoices, calls, messages, bookings, and payments are preserved but detached from the deleted leads."
        confirmLabel="Delete selected leads"
        busy={bulkBusy === 'delete'}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => void runLeadBulkAction('delete')}
      />
      <LeadLifecycleActionSheet
        lead={lifecycleLead}
        action={lifecycleAction}
        onClose={() => {
          setLifecycleAction(null)
          setLifecycleLead(null)
        }}
        onCompleted={handleLeadLifecycleCompleted}
      />
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
  // Older records can retain their former pipeline step after being marked
  // closed lost. Treat the lead status as authoritative here so they never
  // disappear from the Closed Lost tab, filter, or board column.
  if (lead.status === 'closed_lost' || lead.pipeline_stage === 'closed_lost') return 'closed_lost'
  if (lead.pipeline_stage) return lead.pipeline_stage
  if (lead.status === 'tour_requested' || lead.status === 'tour_confirmed') return 'tour'
  if (lead.status === 'proposal_sent') return 'proposal'
  if (lead.status === 'booked') return 'contract'
  return 'inquiry'
}

function stageForBulkStatus(status: LuxorInquiryStatus): LuxorPipelineStage {
  if (status === 'tour_requested' || status === 'tour_confirmed') return 'tour'
  if (status === 'proposal_sent') return 'proposal'
  if (status === 'booked') return 'contract'
  if (status === 'closed_lost') return 'closed_lost'
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

function formatTourDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

// --- SUB-TAB COMPONENTS FOR LEADS & CLIENTS ---

function LeadsDashboard({ leads, loading }: { leads: LuxorInquiry[]; loading: boolean }) {
  const router = useRouter()
  const newInquiries = leads.filter(l => l.status === 'new').length
  const toursScheduled = leads.filter((lead) => lead.status === 'tour_requested' && lead.tour_attendance_status !== 'cancelled').length
  const toursCompleted = leads.filter((lead) => (lead.status === 'tour_confirmed' || lead.tour_attendance_status === 'attended') && lead.tour_attendance_status !== 'cancelled').length
  const proposalsSent = leads.filter(l => l.status === 'proposal_sent').length
  const depositsReceived = leads.filter(l => l.status === 'booked').length
  const totalLeads = leads.length
  const conversionRate = totalLeads > 0 ? ((depositsReceived / totalLeads) * 100).toFixed(1) : '0.0'

  // Upcoming tours
  const upcomingTours = leads
    .filter((lead) => (
      (lead.status === 'tour_requested' || lead.status === 'tour_confirmed')
      && lead.preferred_tour_date
      && !['cancelled', 'attended', 'no_show'].includes(lead.tour_attendance_status || '')
    ))
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
        <PortalTableCard
          className="lg:col-span-2"
          controls={
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] flex items-center gap-2">
                <Calendar size={15} className="text-[#caa24c]" /> Upcoming Scheduled Tours
              </h3>
              <Link href="/portal/calendar" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] transition-colors hover:text-[#caa24c]">
                View Calendar <ChevronRight size={13} />
              </Link>
            </div>
          }
        >
          <PortalStickyTable minWidth="560px">
            <PortalStickyThead>
              <tr className="bg-[color:var(--portal-soft)] text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">
                <th className="px-6 py-3.5">Client</th>
                <th className="px-4 py-3.5">Event</th>
                <th className="px-6 py-3.5 text-right">Date &amp; Time</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-[color:var(--portal-border)]">
              {upcomingTours.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-10 text-center text-xs text-[color:var(--portal-muted)]">No upcoming tours scheduled this week.</td></tr>
              ) : upcomingTours.map((tour) => (
                <tr
                  key={tour.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${tour.full_name}`}
                  onClick={() => router.push(`/portal/leads/${tour.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      router.push(`/portal/leads/${tour.id}`)
                    }
                  }}
                  className="group cursor-pointer transition-colors hover:bg-[#caa24c]/7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]/60"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <PortalContactAvatar
                        name={tour.full_name}
                        size="md"
                        className="group-hover:border-[#caa24c]/50 group-hover:bg-[#caa24c]/20 group-hover:from-transparent group-hover:to-transparent"
                      />
                      <p className="text-sm font-semibold leading-tight text-[color:var(--portal-text)] transition-transform group-hover:translate-x-0.5">{tour.full_name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-[color:var(--portal-text)]">
                    {tour.event_type || 'Event'} <span className="text-[color:var(--portal-muted)]">• {tour.guest_count || 'Flexible'} guests</span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <p className="text-xs font-semibold text-[color:var(--portal-text)]">{formatTourDate(tour.preferred_tour_date || '')}</p>
                    <p className="mt-0.5 text-[10px] font-medium text-[color:var(--portal-muted)]">{tour.preferred_tour_time || 'Flexible'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </PortalStickyTable>
        </PortalTableCard>
      </div>

      {/* Recent Activity / Inquiries List */}
      <PortalTableCard
        controls={
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Recent Lead Submissions</h3>
            <span className="text-[9px] font-semibold text-[color:var(--portal-muted)]">Last 5 entries</span>
          </div>
        }
      >
        <PortalStickyTable minWidth="960px">
          <PortalStickyThead>
            <tr className="bg-[color:var(--portal-soft)] text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">
              <th className="px-8 py-3.5">Full Name &amp; Contact</th>
              <th className="px-6 py-3.5">Event Type</th>
              <th className="px-6 py-3.5">Intake Date</th>
              <th className="px-6 py-3.5">Source Node</th>
              <th className="px-8 py-3.5 text-right">Pipeline Status</th>
            </tr>
          </PortalStickyThead>
          <tbody className="divide-y divide-[color:var(--portal-border)]">
            {loading ? (
              <PortalTableSkeleton cols={5} rows={5} />
            ) : recentLeads.length === 0 ? (
              <tr><td colSpan={5} className="px-8 py-12 text-center text-sm text-[color:var(--portal-muted)]">No recent lead submissions.</td></tr>
            ) : recentLeads.map((lead) => (
              <tr key={lead.id} className="group transition-colors hover:bg-[#caa24c]/7">
                <td className="px-8 py-3">
                  <Link href={`/portal/leads/${lead.id}`} className="flex items-center gap-4 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/60">
                    <PortalContactAvatar name={lead.full_name} avatarUrl={lead.metadata?.avatar_url as string | null} size="md" className="group-hover:border-[#caa24c]/50 group-hover:bg-[#caa24c]/20 group-hover:from-transparent group-hover:to-transparent" />
                    <div>
                      <p className="mb-0.5 text-sm font-semibold leading-tight text-[color:var(--portal-text)] transition-transform group-hover:translate-x-0.5">{lead.full_name}</p>
                      <p className="text-[10px] font-medium text-[color:var(--portal-muted)] group-hover:text-[color:var(--portal-text)]">{lead.email || 'No email registered'}</p>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-3 text-sm font-medium text-[color:var(--portal-text)]">{lead.event_type || 'Quinceañera'}</td>
                <td className="px-6 py-3 text-xs font-medium text-[color:var(--portal-muted)]">{formatDate(lead.created_at)}</td>
                <td className="px-6 py-3 font-mono text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/80">{formatSourceLabel(lead)}</td>
                <td className="px-8 py-3 text-right"><span className="rounded-md border border-[#caa24c]/25 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#f1d27a]">{lead.status}</span></td>
              </tr>
            ))}
          </tbody>
        </PortalStickyTable>
      </PortalTableCard>
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

function LeadsClientsTab({
  leads,
  onLifecycleAction,
}: {
  leads: LuxorInquiry[]
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
}) {
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
                    <div className="flex items-center justify-end gap-2">
                    <Link href={`/portal/leads/${c.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Manage Dossier →</Link>
                      <LeadLifecycleActionsMenu lead={c} onAction={(action) => onLifecycleAction(c, action)} />
                    </div>
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

function LeadsLostTab({ leads }: { leads: LuxorInquiry[] }) {
  const lostLeads = useMemo(
    () => leads
      .filter((lead) => getPipelineStage(lead) === 'closed_lost')
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()),
    [leads],
  )

  return (
    <PortalTableCard
      controls={
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Closed Lost</h3>
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">A clear record of opportunities that were closed, without reopening them by accident.</p>
          </div>
          <span className="w-fit rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 font-mono text-[10px] font-bold text-[color:var(--portal-muted)]">
            {lostLeads.length} {lostLeads.length === 1 ? 'record' : 'records'}
          </span>
        </div>
      }
    >
      <PortalStickyTable minWidth="880px">
        <PortalStickyThead>
          <tr className="bg-[color:var(--portal-soft)] text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">
            <th className="px-6 py-4">Client</th>
            <th className="px-6 py-4">Event</th>
            <th className="px-6 py-4">Closed</th>
            <th className="px-6 py-4">Tour</th>
            <th className="px-6 py-4 text-right">Record</th>
          </tr>
        </PortalStickyThead>
        <tbody className="divide-y divide-[color:var(--portal-border)]">
          {lostLeads.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-8 py-16 text-center">
                <X size={22} className="mx-auto text-[color:var(--portal-muted)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No closed-lost opportunities</p>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">When an opportunity is closed, its reason and any tour cancellation will appear here.</p>
              </td>
            </tr>
          ) : lostLeads.map((lead) => {
            const dealLost = lead.metadata?.dealLost
            const dealLostRecord = dealLost && typeof dealLost === 'object' && !Array.isArray(dealLost)
              ? dealLost as Record<string, unknown>
              : null
            const lossReason = typeof dealLostRecord?.reason === 'string'
              ? dealLostRecord.reason
              : typeof lead.metadata?.deal_lost_reason === 'string'
                ? lead.metadata.deal_lost_reason
                : typeof lead.metadata?.loss_reason === 'string'
                  ? lead.metadata.loss_reason
                  : null
            const tourStatus = lead.tour_attendance_status === 'cancelled'
              ? 'Cancelled'
              : lead.preferred_tour_date
                ? 'Kept on record'
                : 'Not scheduled'

            return (
              <tr key={lead.id} className="group transition-colors hover:bg-[#caa24c]/[0.045]">
                <td className="px-6 py-4">
                  <Link href={`/portal/leads/${lead.id}`} className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45">
                    <PortalContactAvatar name={lead.full_name} avatarUrl={lead.metadata?.avatar_url as string | null} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[color:var(--portal-text)] group-hover:text-[#a8792f] dark:group-hover:text-[#f1d27a]">{lead.full_name}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-[color:var(--portal-muted)]">{lead.email || (lead.phone ? formatPhoneDisplay(lead.phone) : 'No contact detail')}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs font-semibold text-[color:var(--portal-text)]">{lead.event_type || 'Event'}</p>
                  <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{lead.target_date || 'Date not set'}{lead.guest_count ? ` · ${lead.guest_count} guests` : ''}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs font-medium text-[color:var(--portal-text)]">{formatDate(lead.updated_at || lead.created_at)}</p>
                  <p className="mt-1 max-w-[240px] truncate text-[10px] text-[color:var(--portal-muted)]" title={lossReason || undefined}>{lossReason || 'Reason saved in activity'}</p>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-[color:var(--portal-muted)]">{tourStatus}</td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/portal/leads/${lead.id}`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#a8792f] transition-colors hover:bg-[#caa24c]/10 dark:text-[#f1d27a]">
                    View dossier <ExternalLink size={12} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </PortalStickyTable>
    </PortalTableCard>
  )
}

function LeadsToursTab({
  leads,
  onMovePipelineStage,
  onLifecycleAction,
}: {
  leads: LuxorInquiry[]
  onMovePipelineStage: (id: string, stage: LuxorPipelineStage) => void
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
}) {
  const tours = leads.filter((lead) => (
    (lead.status === 'tour_requested' || lead.status === 'tour_confirmed')
    && !['cancelled', 'attended', 'no_show'].includes(lead.tour_attendance_status || '')
  ))
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
                    <div className="flex items-center justify-end gap-2">
                    <Link href={`/portal/leads/${t.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Manage Tour →</Link>
                      <LeadLifecycleActionsMenu lead={t} onAction={(action) => onLifecycleAction(t, action)} />
                    </div>
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

function LeadsProposalsTab({
  leads,
  onLifecycleAction,
}: {
  leads: LuxorInquiry[]
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
}) {
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
                    <div className="flex items-center justify-end gap-2">
                    <Link href={`/portal/leads/${p.id}`} className="text-xs font-bold text-[#caa24c] hover:underline">Review Proposal →</Link>
                      <LeadLifecycleActionsMenu lead={p} onAction={(action) => onLifecycleAction(p, action)} />
                    </div>
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
