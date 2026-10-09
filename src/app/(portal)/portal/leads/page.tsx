'use client'

import React, { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
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
  ListMinus,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List,
  Languages,
  Star,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isLuxorTestInquiry, LuxorInquiry, LuxorInquiryInput, LuxorInquiryStatus, LuxorPipelineStage } from '@/lib/luxorInquiryTypes'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { isLuxorBounceForCurrentAddress } from '@/lib/luxorEmailBounce'
import { compareLuxorScheduledTours, formatLuxorTourDate, getLuxorTourSection, luxorTodayKey, type LuxorTourSection } from '@/lib/luxorTourMetrics'
import { createLuxorTourAttendancePayload } from '@/lib/luxorTourOutcome'

function bouncedAddressMatchesCurrentEmail(lead: LuxorInquiry) {
  const bounce = lead.metadata?.emailBounce
  const address = bounce && typeof bounce === 'object'
    ? String((bounce as Record<string, unknown>).address || '')
    : ''
  return isLuxorBounceForCurrentAddress(lead.email, address)
}
import {
  PortalPageFrame,
  PortalPageHeader,
  PortalAnimatedTabs,
  PortalTabTransition,
  PortalStickyTable,
  PortalStickyThead,
  PortalTableCard,
  PortalCloseButton,
  PortalSelect,
  PortalButton,
  PortalContactAvatar,
  PortalPagination,
  PortalTableSkeleton,
  PortalFilterBar,
  PortalStatusBadge,
  type PortalStatusTone,
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
import FollowUpsTab from '@/components/portal/FollowUpsTab'
import { LuxorCrmRecordCard, LuxorCrmSecondaryAction, luxorCrmStatusTone } from '@/components/portal/LuxorCrmRecordCard'

const INQUIRY_STATUS_OPTIONS: { value: LuxorInquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'tour_requested', label: 'Tour Time Needed' },
  { value: 'tour_confirmed', label: 'Tour Confirmed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'booked', label: 'Booked' },
]

const PIPELINE_COLUMNS: { id: LuxorPipelineStage; label: string; short: string; tone: string; status?: LuxorInquiryStatus }[] = [
  { id: 'newsletter', label: 'Newsletter', short: 'Newsletter', tone: 'blue', status: 'new' },
  { id: 'inquiry', label: 'Inquiry', short: 'Inquiry', tone: 'blue', status: 'new' },
  { id: 'tour', label: 'Tour', short: 'Tour', tone: 'blue', status: 'tour_requested' },
  { id: 'proposal', label: 'Proposal', short: 'Proposal', tone: 'blue', status: 'proposal_sent' },
  { id: 'contract', label: 'Contract', short: 'Contract', tone: 'gold', status: 'booked' },
  { id: 'deposit', label: 'Deposit', short: 'Deposit', tone: 'gold', status: 'booked' },
  { id: 'planning', label: 'Planning', short: 'Planning', tone: 'blue', status: 'booked' },
  { id: 'final_payment', label: 'Final Payment', short: 'Final Payment', tone: 'gold', status: 'booked' },
  { id: 'event', label: 'Event', short: 'Event', tone: 'blue', status: 'booked' },
  { id: 'closing', label: 'Complete', short: 'Complete', tone: 'green', status: 'booked' },
]

const PIPELINE_STAGE_OPTIONS: { value: LuxorPipelineStage; label: string }[] = [
  { value: 'newsletter', label: 'Newsletter' },
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

type LeadSortKey = 'name' | 'stage' | 'event' | 'intake' | 'source'
type ClientSortKey = 'name' | 'event' | 'guests' | 'targetDate'
type SortDirection = 'asc' | 'desc'
type TableSort<Key extends string> = { key: Key; direction: SortDirection }
type ScheduledTourCategory = LuxorTourSection

function getRequestedTourLanguage(lead: LuxorInquiry) {
  const preference = String(lead.metadata?.tourLanguagePreference || '').trim().toLowerCase()
  if (preference === 'es' || preference === 'spanish' || preference === 'español') return 'Spanish'
  if (preference === 'en' || preference === 'english') return 'English'
  return null
}

const DEFAULT_LEAD_SORT: TableSort<LeadSortKey> = { key: 'intake', direction: 'desc' }
const DEFAULT_CLIENT_SORT: TableSort<ClientSortKey> = { key: 'targetDate', direction: 'asc' }

export default function LeadsPage() {
  const { notify } = useToast()
  const [leads, setLeads] = useState<LuxorInquiry[]>([])
  const boardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyTourOutcomeIds, setBusyTourOutcomeIds] = useState<string[]>([])
  const tourOutcomeLocks = useRef(new Set<string>())
  
  // Tab control
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost' | 'followups'>('dashboard')
  
  // View mode toggle
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [contactFilter, setContactFilter] = useState<'all' | 'email' | 'phone' | 'complete' | 'missing'>('all')
  const [leadSort, setLeadSort] = useState<TableSort<LeadSortKey>>(DEFAULT_LEAD_SORT)
  const [clientSort, setClientSort] = useState<TableSort<ClientSortKey>>(DEFAULT_CLIENT_SORT)
  const [currentPage, setCurrentPage] = useState<number>(1)

  // New lead drawer state
  const [isLeadDrawerOpen, setIsLeadDrawerOpen] = useState(false)
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

  const fetchLeads = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/inquiries')
      if (!res.ok) throw new Error('Failed to load inquiries.')
      const data = await res.json()
      setLeads(data)
      return true
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load inquiries.')
      return false
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
      const savedLeadSort = localStorage.getItem('luxor_leads_table_sort')
      const savedClientSort = localStorage.getItem('luxor_clients_table_sort')
      if (savedTab) {
        setActiveTab(savedTab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost' | 'followups')
      }
      if (savedViewMode) {
        setViewMode(savedViewMode as 'list' | 'board')
      }
      if (savedPage) {
        setCurrentPage(parseInt(savedPage, 10))
      }
      try {
        if (savedLeadSort) setLeadSort({ ...DEFAULT_LEAD_SORT, ...JSON.parse(savedLeadSort) })
        if (savedClientSort) setClientSort({ ...DEFAULT_CLIENT_SORT, ...JSON.parse(savedClientSort) })
      } catch {
        // Ignore stale or malformed local preferences and use the defaults.
      }
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const syncViewport = () => {
      setIsMobileViewport(mediaQuery.matches)
      if (mediaQuery.matches) setViewMode('list')
    }
    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
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

      setIsLeadDrawerOpen(false)
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

  const handleTourOutcome = async (lead: LuxorInquiry, attendance: 'attended' | 'no_show') => {
    if (tourOutcomeLocks.current.has(lead.id)) return
    tourOutcomeLocks.current.add(lead.id)
    setBusyTourOutcomeIds((current) => [...current, lead.id])
    try {
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createLuxorTourAttendancePayload({ inquiryId: lead.id, attendance, expectedAttendance: lead.tour_attendance_status || null })),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string; warnings?: string[] }
      if (!response.ok) throw new Error(payload.error || 'Tour outcome could not be saved.')
      const refreshFailed = !await fetchLeads()
      const warnings = [...(payload.warnings ?? [])]
      if (refreshFailed) warnings.push('Reload the page to refresh the tour list.')
      notify({ title: attendance === 'attended' ? 'Tour marked completed' : 'Tour marked no show', description: warnings.length ? warnings.join(' ') : 'The outcome was saved without sending a message.', variant: warnings.length ? 'warning' : 'success' })
    } catch (error) {
      notify({ title: 'Tour outcome could not be confirmed', description: `${error instanceof Error ? error.message : 'Try again.'} Refresh and retrying the same outcome is safe.`, variant: 'error' })
    } finally {
      tourOutcomeLocks.current.delete(lead.id)
      setBusyTourOutcomeIds((current) => current.filter((id) => id !== lead.id))
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
      const stageA = PIPELINE_STAGE_OPTIONS.find((option) => option.value === getPipelineStage(a))?.label || getPipelineStage(a)
      const stageB = PIPELINE_STAGE_OPTIONS.find((option) => option.value === getPipelineStage(b))?.label || getPipelineStage(b)
      let comparison = 0
      switch (leadSort.key) {
        case 'name': comparison = a.full_name.localeCompare(b.full_name); break
        case 'stage': comparison = stageA.localeCompare(stageB); break
        case 'event': comparison = (a.event_type || '').localeCompare(b.event_type || '') || ((a.guest_count || 0) - (b.guest_count || 0)); break
        case 'source': comparison = formatSourceLabel(a).localeCompare(formatSourceLabel(b)); break
        case 'intake': comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break
      }
      return leadSort.direction === 'asc' ? comparison : -comparison
    })
  }, [filteredLeads, leadSort])

  const updateLeadSort = useCallback((key: LeadSortKey) => {
    setLeadSort((current) => {
      const next = { key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' } as TableSort<LeadSortKey>
      localStorage.setItem('luxor_leads_table_sort', JSON.stringify(next))
      return next
    })
    setCurrentPage(1)
    localStorage.setItem('luxor_leads_current_page', '1')
  }, [])

  const updateClientSort = useCallback((key: ClientSortKey, direction?: SortDirection) => {
    setClientSort((current) => {
      const next = { key, direction: direction || (current.key === key && current.direction === 'asc' ? 'desc' : 'asc') } as TableSort<ClientSortKey>
      localStorage.setItem('luxor_clients_table_sort', JSON.stringify(next))
      return next
    })
  }, [])

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
        mobileActionsInline
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {activeTab === 'pipeline' && (
              <>
                <div className="hidden rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-0.5 text-[10px] font-semibold uppercase tracking-widest md:flex">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('list')
                      localStorage.setItem('luxor_leads_view_mode', 'list')
                    }}
                    className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/20'
                        : 'font-bold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    List
                  </button>
                  {!isMobileViewport ? (
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
                          : 'font-bold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      Board
                    </button>
                  ) : null}
                </div>

              </>
            )}
            <PortalButton variant="primary" onClick={() => setIsLeadDrawerOpen(true)}>
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
          { id: 'followups', label: 'Follow Ups', icon: <Phone size={15} /> },
          { id: 'proposals', label: 'Proposals & Contracts', icon: <FileCheck size={15} /> },
          { id: 'clients', label: 'Booked Clients', icon: <UserCheck size={15} /> },
          { id: 'lost', label: 'Closed Lost', icon: <X size={15} />, count: closedLostCount },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => {
            const nextTab = tab as 'dashboard' | 'pipeline' | 'tours' | 'proposals' | 'clients' | 'lost' | 'followups'
            setActiveTab(nextTab)
            localStorage.setItem('luxor_leads_active_tab', nextTab)
          }}
        />
      </div>

      <PortalTabTransition activeKey={activeTab} className="flex-1 min-h-0 flex flex-col overflow-visible mt-0">
        {activeTab === 'dashboard' && <LeadsDashboard leads={leads} loading={loading} />}
        {activeTab === 'clients' && <LeadsClientsTab leads={leads} sort={clientSort} onSort={updateClientSort} onLifecycleAction={openLeadLifecycleAction} />}
        {activeTab === 'lost' && <LeadsLostTab leads={leads} />}
        {activeTab === 'followups' && <FollowUpsTab leads={leads} onLeadsRefresh={async () => { await fetchLeads() }} />}
        {activeTab === 'tours' && <LeadsToursTab leads={leads} onMovePipelineStage={handleMovePipelineStage} onLifecycleAction={openLeadLifecycleAction} onTourOutcome={handleTourOutcome} busyTourOutcomeIds={busyTourOutcomeIds} />}
        {activeTab === 'proposals' && <LeadsProposalsTab leads={leads} onLifecycleAction={openLeadLifecycleAction} />}

        {activeTab === 'pipeline' && (
          viewMode === 'list' || isMobileViewport ? (
        <PortalTableCard
          mobilePageScroll
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
              </div>
            </PortalFilterBar>
          }
          footer={
            <div className="flex w-full flex-col justify-between gap-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)] select-none sm:flex-row sm:items-center">
              <div>
                Showing <span className="font-mono text-[color:var(--portal-text)]">{startIndex + 1}</span> -{' '}
                <span className="font-mono text-[color:var(--portal-text)]">{Math.min(startIndex + 25, totalCount)}</span> of{' '}
                <span className="font-mono text-[color:var(--portal-text)]">{totalCount}</span> leads
              </div>
              {totalPages > 1 && (
                <PortalPagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
              )}
            </div>
          }
        >
          <div className="hidden overflow-x-auto md:block">
          <PortalStickyTable minWidth="1170px">
            <PortalStickyThead>
              <tr className="whitespace-nowrap bg-[color:var(--portal-soft)] text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--portal-muted)]">
                <th className="w-14 px-4 py-3.5 text-center">
                  <PortalBulkHeaderSelector state={bulkSelection.pageSelectionState(pageLeadIds)} onChange={() => bulkSelection.selectPage(pageLeadIds)} />
                </th>
                <SortableHeader label="Full Name & Contact" sortKey="name" sort={leadSort} onSort={updateLeadSort} className="min-w-[255px]" />
                <SortableHeader label="Step" sortKey="stage" sort={leadSort} onSort={updateLeadSort} className="min-w-[190px]" />
                <SortableHeader label="Event Parameters" sortKey="event" sort={leadSort} onSort={updateLeadSort} className="min-w-[185px]" />
                <th scope="col" className="min-w-[120px] whitespace-nowrap px-4 py-3.5">Language</th>
                <SortableHeader label="Intake Date" sortKey="intake" sort={leadSort} onSort={updateLeadSort} className="min-w-[145px]" />
                <SortableHeader label="Source Node" sortKey="source" sort={leadSort} onSort={updateLeadSort} className="min-w-[150px]" />
                <th scope="col" className="min-w-[235px] whitespace-nowrap px-8 py-3.5 text-right">Engagement &amp; Actions</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-[color:var(--portal-border)]">
              {loading ? (
                <PortalTableSkeleton cols={8} rows={6} />
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-8 py-12 text-sm text-red-300">
                    {error}
                  </td>
                </tr>
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-8 py-12 text-sm text-zinc-500">
                    <div className="max-w-xl">
                      <p className="text-base font-semibold text-[color:var(--portal-text)]">No records matching search parameters.</p>
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
                          <p className="mb-0.5 text-sm font-semibold leading-tight text-[color:var(--portal-text)] group-hover:translate-x-0.5 transition-transform">
                            <span className="inline-flex items-center gap-1.5">{lead.full_name}{isMarketingLead(lead) ? <Star className="h-3.5 w-3.5 fill-[#caa24c] text-[#caa24c]" aria-label="Marketing lead" /> : null}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {lead.email ? (
                              <p className="text-[10px] font-medium text-[color:var(--portal-muted)] group-hover:text-[color:var(--portal-text)]">
                                {lead.email}
                              </p>
                            ) : null}
                            {lead.metadata?.emailBounce ? (
                              <span
                                className="inline-flex items-center rounded border border-rose-500/25 bg-rose-500/8 px-1.5 py-0.5 text-[9px] font-semibold text-rose-600 dark:text-rose-300"
                                title={bouncedAddressMatchesCurrentEmail(lead)
                                  ? 'An email to this lead could not be delivered. Open the lead to review the address.'
                                  : 'An earlier email address bounced. Review the current contact details.'}
                              >
                                {bouncedAddressMatchesCurrentEmail(lead) ? 'Email bounced · review address' : 'Earlier email address bounced'}
                              </span>
                            ) : null}
                            {lead.phone ? (
                              <p className="text-[10px] font-medium text-[color:var(--portal-muted)] group-hover:text-[color:var(--portal-text)]">
                                {lead.email ? '• ' : ''}{formatPhoneDisplay(lead.phone)}
                              </p>
                            ) : null}
                            {!lead.email && !lead.phone ? (
                              <p className="text-[10px] font-medium text-[color:var(--portal-muted)] group-hover:text-[color:var(--portal-text)]">
                                ID: {lead.id.slice(0, 8)}
                              </p>
                            ) : null}
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
                    <td className="px-6 py-3 font-mono text-xs text-[color:var(--portal-muted)]">
                      {getPipelineStage(lead) === 'newsletter' ? null : (
                        <>
                          <div className="font-semibold text-[color:var(--portal-text)]">{lead.event_type || 'Quinceañera'}</div>
                          <div className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">
                            {isGrandOpeningRsvp(lead)
                              ? `${lead.attendee_count || lead.guest_count || 1} attending`
                              : lead.guest_count
                                ? `${lead.guest_count} guests`
                                : 'Guest count needed'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getRequestedTourLanguage(lead) === 'Spanish' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-[#caa24c]/30 bg-[#caa24c]/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#a8792f] dark:text-[#f1d27a]">
                          <Languages size={12} /> Spanish
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-[color:var(--portal-muted)]">{getRequestedTourLanguage(lead) || '—'}</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-start flex-col">
                        <span className="text-xs font-medium text-[color:var(--portal-muted)]">{formatDate(lead.created_at)}</span>
                        {getPipelineStage(lead) !== 'newsletter' && lead.target_date ? (
                          <span className="text-[9px] text-[#caa24c] font-bold uppercase tracking-tighter mt-0.5">
                            {lead.target_date}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isGrandOpeningRsvp(lead) ? 'text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}>
                        {formatSourceLabel(lead)}
                      </span>
                    </td>
                    <td className="px-8 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
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
          </div>
          <MobileLeadList
            leads={paginatedLeads}
            startIndex={startIndex}
            selectedIds={bulkSelection}
            onToggle={bulkSelection.toggle}
            onLifecycleAction={openLeadLifecycleAction}
            showPipelineStage
          />
        </PortalTableCard>
      ) : (
        <div ref={boardRef} onScroll={handleBoardScroll} className="flex-1 min-h-0 overflow-x-auto portal-scrollbar -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-4 flex gap-4 select-none">
          {PIPELINE_COLUMNS.map((col, colIndex, colArray) => {
            const colLeads = sortedLeads.filter(l => getPipelineStage(l) === col.id)
            return (
              <div key={col.id} className="portal-card-surface flex-1 min-w-[280px] max-w-[340px] flex flex-col h-full overflow-hidden">
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.tone === 'blue' ? 'bg-sky-600 dark:bg-sky-400' : col.tone === 'purple' ? 'bg-violet-600 dark:bg-violet-400' : col.tone === 'gold' ? 'bg-[#a8792f] dark:bg-[#f1d27a]' : 'bg-emerald-700 dark:bg-emerald-400'}`} aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">{col.short}</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-[color:var(--portal-muted)] bg-[color:var(--portal-soft)] border border-[color:var(--portal-border)] px-2 py-0.5 rounded-md">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-3 flex-1 overflow-y-auto portal-scrollbar space-y-3">
                  {colLeads.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] py-8 text-center text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">
                      No leads
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <LuxorCrmRecordCard
                        key={lead.id}
                        lead={lead}
                        badges={[{ label: PIPELINE_STAGE_OPTIONS.find((option) => option.value === getPipelineStage(lead))?.label || col.label, tone: col.tone as PortalStatusTone }]}
                        subtitle={<>{lead.event_type || 'Quinceañera'} · {lead.target_date || 'Date TBD'} · {isGrandOpeningRsvp(lead) ? `${lead.attendee_count || lead.guest_count || 1} RSVP` : lead.guest_count ? `${lead.guest_count} guests` : 'No count'}</>}
                        contact={lead.email ?? (lead.phone ? formatPhoneDisplay(lead.phone) : 'No contact')}
                        onOpen={() => { window.location.href = `/portal/leads/${lead.id}` }}
                        className="min-h-[140px]"
                        actions={
                          <>
                            <div className="flex gap-1.5" onClick={(event) => event.stopPropagation()}>
                              {lead.email ? <a href={`mailto:${lead.email}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]" title="Send Email" aria-label={`Email ${lead.full_name}`}><Mail size={14} /></a> : null}
                              {lead.phone ? <button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: lead.phone!, contactName: lead.full_name, inquiryId: lead.id })} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)]" title="Call from Luxor browser phone" aria-label={`Call ${lead.full_name}`}><Phone size={14} /></button> : null}
                              {lead.phone ? <Link href={`/portal/leads/${lead.id}?tab=messages`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)]" title="Text client" aria-label={`Text ${lead.full_name}`}><MessageSquare size={14} /></Link> : null}
                            </div>
                            <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              {colIndex > 0 ? <button type="button" onClick={() => handleMovePipelineStage(lead.id, colArray[colIndex - 1].id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)]" title={`Move to ${colArray[colIndex - 1].label}`}><ChevronLeft size={14} /></button> : null}
                              {colIndex < colArray.length - 1 ? <button type="button" onClick={() => handleMovePipelineStage(lead.id, colArray[colIndex + 1].id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--portal-border)] text-[color:var(--portal-muted)]" title={`Move to ${colArray[colIndex + 1].label}`}><ChevronRight size={14} /></button> : null}
                              <LeadLifecycleActionsMenu lead={lead} onAction={(action) => openLeadLifecycleAction(lead, action)} className="!h-9 !w-9" />
                            </div>
                          </>
                        }
                      >
                        {isGrandOpeningRsvp(lead) ? <GrandOpeningBadge /> : null}
                      </LuxorCrmRecordCard>
                    ))
                  )}
                </div>
              </div>
            )
          })}

          {/* Lost Leads Drawer / Collapsed Last Column */}
          <div className="portal-card-surface flex min-w-[280px] max-w-[340px] flex-1 flex-col overflow-hidden opacity-75 transition-opacity duration-300 hover:opacity-100">
            <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[color:var(--portal-muted)]" aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">Closed Lost</span></div>
              <span className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-0.5 font-mono text-[9px] font-bold text-[color:var(--portal-muted)]">{sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').length}</span>
            </div>
            <div className="portal-scrollbar flex-1 space-y-3 overflow-y-auto p-3">
              {sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] py-8 text-center text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">No lost leads</div>
              ) : sortedLeads.filter((lead) => getPipelineStage(lead) === 'closed_lost').map((lead) => (
                <LuxorCrmRecordCard
                  key={lead.id}
                  lead={lead}
                  badges={[{ label: 'Closed Lost', tone: 'neutral' }]}
                  subtitle={<>{isGrandOpeningRsvp(lead) ? `Grand Opening RSVP · ${lead.attendee_count || lead.guest_count || 1} attending` : `${lead.event_type || 'Quinceañera'} · ${lead.guest_count || 0} guests`}</>}
                  contact={<span className="block">{lead.email || 'No email'}{lead.phone ? <span className="mt-0.5 block">{formatPhoneDisplay(lead.phone)}</span> : null}</span>}
                  onOpen={() => { window.location.href = `/portal/leads/${lead.id}` }}
                  className="min-h-[120px]"
                  actions={<Link href={`/portal/leads/${lead.id}`} className="inline-flex min-h-10 items-center text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">View dossier <ExternalLink size={13} className="ml-1" aria-hidden="true" /></Link>}
                />
              ))}
            </div>
          </div>
        </div>
      )
        )}
      </PortalTabTransition>

      <LeadEntryDrawer isOpen={isLeadDrawerOpen} onClose={() => setIsLeadDrawerOpen(false)}>
          <form onSubmit={handleCreateLead} className="flex min-h-full flex-col space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="new-lead-name" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Full name</label>
              <input
                id="new-lead-name"
                type="text"
                required
                data-autofocus="true"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                placeholder="Client name..."
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="new-lead-email" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Email address</label>
                <input
                  id="new-lead-email"
                  type="email"
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-lead-phone" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Phone number</label>
                <input
                  id="new-lead-phone"
                  type="text"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="214-555-0199"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Event type</label>
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
                <label htmlFor="new-lead-guests" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Guest count</label>
                <input
                  id="new-lead-guests"
                  type="number"
                  value={newLeadGuestCount}
                  onChange={(e) => setNewLeadGuestCount(e.target.value)}
                  placeholder="200"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-center text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="new-lead-target-date" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Target month / date</label>
                <input
                  id="new-lead-target-date"
                  type="text"
                  value={newLeadTargetDate}
                  onChange={(e) => setNewLeadTargetDate(e.target.value)}
                  placeholder="Oct 2026"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-lead-message" className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Initial inquiry details / message</label>
              <textarea
                id="new-lead-message"
                value={newLeadMessage}
                onChange={(e) => setNewLeadMessage(e.target.value)}
                placeholder="Include setup, package needs, or specific booking parameters..."
                className="h-28 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#b98a3e] px-4 py-2.5 text-xs font-bold uppercase tracking-widest !text-white shadow-lg shadow-[#8c6529]/20 transition-colors hover:bg-[#a8792f] [&>svg]:!text-white disabled:cursor-not-allowed disabled:bg-[#b98a3e]/45 disabled:!text-white/80"
            >
              <Plus size={14} aria-hidden="true" />
              Add Client Lead
            </button>
          </form>
      </LeadEntryDrawer>

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

function LeadEntryDrawer({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const drawerRef = useRef<HTMLElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = React.useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`

    const focusFrame = window.requestAnimationFrame(() => {
      const primaryInput = drawerRef.current?.querySelector<HTMLElement>('[data-autofocus]')
      const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      ;(primaryInput ?? firstFocusable ?? drawerRef.current)?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('[data-portal-popover="true"]')) return
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) {
        event.preventDefault()
        drawerRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
      previouslyFocusedRef.current?.focus()
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex"
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close add client lead panel"
            className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={onClose}
          />
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative z-10 ml-auto flex h-full w-full max-w-[600px] flex-col overflow-hidden border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-[-18px_0_48px_rgba(0,0,0,0.22)] outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-bold uppercase tracking-widest text-[color:var(--portal-text)]">Add new client / lead</h2>
                <p className="mt-1 text-[11px] leading-5 text-[color:var(--portal-muted)]">Capture the client details and the event information you have so far.</p>
              </div>
              <PortalCloseButton onClick={onClose} aria-label="Close add client lead panel" className="shrink-0" />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 portal-scrollbar sm:p-6">
              {children}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
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
    <div className="portal-card-surface px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</p>
        <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}>Live</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl font-bold text-[color:var(--portal-text)]">{value}</p>
        <p className="pb-1 text-right text-[11px] font-medium leading-4 text-[color:var(--portal-muted)]">{detail}</p>
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
  if (isGrandOpeningRsvp(lead)) return 'Grand Opening RSVP'
  if (lead.source === 'newsletter' || lead.flow === 'newsletter_signup' || lead.pipeline_stage === 'newsletter') return 'Newsletter'
  return lead.source.replaceAll('_', ' ')
}

function isMarketingLead(lead: LuxorInquiry) {
  return lead.marketing_opt_in || lead.source === 'newsletter' || lead.metadata?.marketing_lead === true
}

function getPipelineStage(lead: LuxorInquiry): LuxorPipelineStage {
  // Older records can retain their former pipeline step after being marked
  // closed lost. Treat the lead status as authoritative here so they never
  // disappear from the Closed Lost tab, filter, or board column.
  if (lead.status === 'closed_lost' || lead.pipeline_stage === 'closed_lost') return 'closed_lost'
  if (lead.pipeline_stage === 'newsletter') return 'newsletter'
  if (lead.source === 'newsletter' || lead.flow === 'newsletter_signup' || lead.metadata?.submitted_form === 'Newsletter Signup') return 'newsletter'
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
  return formatLuxorTourDate(value)
}

// --- SUB-TAB COMPONENTS FOR LEADS & CLIENTS ---

function LeadsDashboard({ leads, loading }: { leads: LuxorInquiry[]; loading: boolean }) {
  const router = useRouter()
  const businessLeads = leads.filter((lead) => !isLuxorTestInquiry(lead))
  const newInquiries = businessLeads.filter(l => l.status === 'new').length
  const toursScheduled = businessLeads.filter((lead) => ['tour_requested', 'tour_confirmed'].includes(lead.status) && lead.tour_attendance_status !== 'cancelled').length
  const toursCompleted = businessLeads.filter((lead) => lead.tour_attendance_status === 'attended').length
  const proposalsSent = businessLeads.filter(l => l.status === 'proposal_sent').length
  const depositsReceived = businessLeads.filter(l => l.status === 'booked').length
  const totalLeads = businessLeads.length
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
  const total = businessLeads.length || 1
  const tourStageCount = businessLeads.filter(l => ['tour_requested', 'tour_confirmed', 'proposal_sent', 'booked'].includes(l.status)).length
  const proposalStageCount = businessLeads.filter(l => ['proposal_sent', 'booked'].includes(l.status)).length
  const bookedStageCount = businessLeads.filter(l => l.status === 'booked').length

  const tourPct = ((tourStageCount / total) * 100).toFixed(0)
  const proposalPct = ((proposalStageCount / total) * 100).toFixed(0)
  const bookedPct = ((bookedStageCount / total) * 100).toFixed(0)

  return (
    <div className="h-full overflow-y-auto portal-scrollbar pr-1 space-y-6 pb-8">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="New Inquiries" value={newInquiries} subtitle="Awaiting response" tone="blue" />
        <StatsCard label="Tours Scheduled" value={toursScheduled} subtitle="Active bookings" tone="blue" />
        <StatsCard label="Tours Completed" value={toursCompleted} subtitle="Tours held" tone="green" />
        <StatsCard label="Proposals Sent" value={proposalsSent} subtitle="Out for signature" tone="blue" />
        <StatsCard label="Deposits Received" value={depositsReceived} subtitle="Booked clients" tone="green" />
        <StatsCard label="Conversion Rate" value={`${conversionRate}%`} subtitle="Lead-to-booking" tone="neutral" />
      </div>

      {/* Charts & Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Funnel */}
        <div className="portal-card-surface p-6 lg:col-span-1">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)] mb-6 flex items-center gap-2">
            <TrendingUp size={15} className="text-[#caa24c]" /> Sales Funnel Analysis
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">1. New Inquiries</span>
                <span className="font-mono text-zinc-400">{total} leads (100%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                <div className="h-full rounded-full bg-blue-500 w-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">2. Tours Booked</span>
                <span className="font-mono text-[color:var(--portal-muted)]">{tourStageCount} ({tourPct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                <div className="h-full rounded-full bg-sky-600 dark:bg-sky-400" style={{ width: `${tourPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">3. Proposals Out</span>
                <span className="font-mono text-[color:var(--portal-muted)]">{proposalStageCount} ({proposalPct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                <div className="h-full rounded-full bg-sky-600 dark:bg-sky-400" style={{ width: `${proposalPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-[color:var(--portal-text)]">4. Booked Event Days</span>
                <span className="font-mono text-emerald-400">{bookedStageCount} ({bookedPct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
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
                <td className="px-8 py-3 text-right"><PortalStatusBadge status={lead.status} /></td>
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
  tone?: 'blue' | 'purple' | 'gold' | 'green' | 'neutral'
}) {
  const styles = {
    blue: 'border-sky-300 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-500/10',
    purple: 'border-violet-300 bg-violet-50 dark:border-violet-400/30 dark:bg-violet-500/10',
    gold: 'border-[#dfc98f] bg-[#fbf5e7] dark:border-[#caa24c]/35 dark:bg-[#caa24c]/10',
    green: 'border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/10',
    neutral: 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]',
  }

  return (
    <div className={`portal-card-surface flex min-h-[110px] flex-col justify-between p-4 ${styles[tone ?? 'neutral']}`}>
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</p>
        <p className="mt-1.5 font-mono text-xl font-bold text-[color:var(--portal-text)]">{value}</p>
      </div>
      <p className="mt-3 text-[10px] font-medium leading-none text-[color:var(--portal-muted)]">{subtitle}</p>
    </div>
  )
}

function SortableHeader<Key extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string
  sortKey: Key
  sort: TableSort<Key>
  onSort: (key: Key) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`px-6 py-3.5 ${align === 'right' ? 'text-right' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-md py-1 text-inherit transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 ${align === 'right' ? 'justify-end' : ''} ${active ? 'text-[#9a712e] dark:text-[#f1d27a]' : 'hover:text-[color:var(--portal-text)]'}`}
        aria-label={`Sort by ${label} ${active && sort.direction === 'asc' ? 'descending' : 'ascending'}`}
      >
        <span>{label}</span>
        {active ? (sort.direction === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : <span className="text-[color:var(--portal-faint)]" aria-hidden="true">↕</span>}
      </button>
    </th>
  )
}

function LeadsClientsTab({
  leads,
  sort,
  onSort,
  onLifecycleAction,
}: {
  leads: LuxorInquiry[]
  sort: TableSort<ClientSortKey>
  onSort: (key: ClientSortKey, direction?: SortDirection) => void
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
}) {
  const clients = useMemo(() => leads.filter((lead) => lead.status === 'booked').sort((a, b) => {
    let comparison = 0
    switch (sort.key) {
      case 'name': comparison = a.full_name.localeCompare(b.full_name); break
      case 'event': comparison = (a.event_type || '').localeCompare(b.event_type || ''); break
      case 'guests': comparison = (a.guest_count || 0) - (b.guest_count || 0); break
      case 'targetDate': comparison = (a.target_date || '9999-12-31').localeCompare(b.target_date || '9999-12-31'); break
    }
    return sort.direction === 'asc' ? comparison : -comparison
  }), [leads, sort])
  return (
    <PortalTableCard
      mobilePageScroll
      controls={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Active Booked Clients ({clients.length})</h3>
          <div className="w-full sm:w-60">
            <PortalSelect aria-label="Sort booked clients" value={sort.key + ':' + sort.direction} onChange={(value) => { const [key, direction] = value.split(':'); onSort(key as ClientSortKey, direction as SortDirection) }} options={[
              { value: 'name:asc', label: 'Client · A to Z' }, { value: 'name:desc', label: 'Client · Z to A' },
              { value: 'event:asc', label: 'Event · A to Z' }, { value: 'event:desc', label: 'Event · Z to A' },
              { value: 'guests:asc', label: 'Guest count · Low to high' }, { value: 'guests:desc', label: 'Guest count · High to low' },
              { value: 'targetDate:asc', label: 'Event date · Earliest first' }, { value: 'targetDate:desc', label: 'Event date · Latest first' },
            ]} />
          </div>
        </div>
      }
    >
      {clients.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-[color:var(--portal-muted)]">No booked clients in pipeline currently.</div>
      ) : (
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <LuxorCrmRecordCard
              key={client.id}
              lead={client}
              badges={[{ label: 'Booked', tone: 'green' }]}
              subtitle={<>{client.event_type || 'Quinceañera'} · {client.target_date || 'Date TBD'}{client.guest_count ? <> · {client.guest_count} guests</> : <> · Flexible guest count</>}</>}
              contact={client.email || (client.phone ? formatPhoneDisplay(client.phone) : 'No contact details')}
              actions={
                <>
                  <Link href={'/portal/leads/' + client.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white transition-colors hover:bg-[#916825]"><UserCheck size={14} /> Manage Dossier</Link>
                  <LeadLifecycleActionsMenu lead={client} onAction={(action) => onLifecycleAction(client, action)} />
                </>
              }
            >
              <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2"><Phone size={13} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" /><span className="break-all text-[color:var(--portal-text)]">{client.phone ? formatPhoneDisplay(client.phone) : 'No phone captured'}</span></div>
                <div className="flex min-w-0 items-center gap-2"><Languages size={13} className="shrink-0 text-[color:var(--portal-muted)]" aria-hidden="true" /><span className="text-[color:var(--portal-text)]">Tour language: {getRequestedTourLanguage(client) || 'Not specified'}</span></div>
                {isMarketingLead(client) ? <div className="flex items-center gap-2 text-[#8c6529] dark:text-[#f1d27a]"><Star size={13} className="fill-current" aria-hidden="true" />Marketing lead</div> : null}
                <div className="flex items-center justify-between gap-2"><span className="text-[color:var(--portal-muted)]">Booking status</span><span className="font-semibold text-[color:var(--portal-text)]">Active booked client</span></div>
              </div>
              <Link href={'/portal/leads/' + client.id} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#8c6529] hover:text-[#a8792f] dark:text-[#f1d27a]"><Eye size={14} /> View client record</Link>
            </LuxorCrmRecordCard>
          ))}
        </div>
      )}
    </PortalTableCard>
  )
}
function MobileLeadList({
  leads,
  startIndex,
  selectedIds,
  onToggle,
  onLifecycleAction,
  showPipelineStage,
}: {
  leads: LuxorInquiry[]
  startIndex: number
  selectedIds: { isSelected: (id: string) => boolean }
  onToggle: (id: string) => void
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
  showPipelineStage: boolean
}) {
  return (
    <div className="divide-y divide-[color:var(--portal-border)] md:hidden">
      {leads.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-[color:var(--portal-muted)]">No records matching search parameters.</div>
      ) : (
        leads.map((lead, index) => (
          <MobileLeadCard
            key={lead.id}
            lead={lead}
            index={startIndex + index + 1}
            selected={selectedIds.isSelected(lead.id)}
            onToggle={onToggle}
            onLifecycleAction={onLifecycleAction}
            showPipelineStage={showPipelineStage}
          />
        ))
      )}
    </div>
  )
}

function MobileLeadCard({
  lead,
  index,
  selected = false,
  onToggle,
  onLifecycleAction,
  showPipelineStage,
  showStatusBadge = false,
}: {
  lead: LuxorInquiry
  index?: number
  selected?: boolean
  onToggle?: (id: string) => void
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
  showPipelineStage: boolean
  showStatusBadge?: boolean
}) {
  const pipelineStage = getPipelineStage(lead)
  const stageLabel = PIPELINE_STAGE_OPTIONS.find((option) => option.value === pipelineStage)?.label || 'Pipeline'
  const stageTone = (PIPELINE_COLUMNS.find((column) => column.id === pipelineStage)?.tone as PortalStatusTone | undefined) || 'neutral'
  const badges = [
    ...(showStatusBadge ? [{ label: lead.status.replaceAll('_', ' '), tone: luxorCrmStatusTone(lead.status) }] : []),
    ...(showPipelineStage ? [{ label: stageLabel, tone: stageTone }] : []),
  ]

  return (
    <LuxorCrmRecordCard
      lead={lead}
      badges={badges}
      subtitle={pipelineStage !== 'newsletter' ? <>{lead.event_type || 'Quinceañera'} · {lead.target_date || 'Date not set'} · {lead.guest_count || 'Flexible'} guests</> : 'Newsletter contact'}
      contact={<span className="block">{lead.email || 'No email captured'}{lead.phone ? <span className="mt-0.5 block">{formatPhoneDisplay(lead.phone)}</span> : null}</span>}
      onOpen={() => { window.location.href = `/portal/leads/${lead.id}` }}
      selected={selected}
      className="rounded-none border-x-0 border-t-0 p-3 shadow-none sm:p-4"
      actions={<div className="flex w-full items-center justify-between gap-3">
        {onToggle ? <PortalBulkRowSelector checked={selected} index={index || 1} onChange={() => onToggle(lead.id)} label={lead.full_name} /> : <span />}
        <LeadLifecycleActionsMenu lead={lead} onAction={(action) => onLifecycleAction(lead, action)} />
      </div>}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:gap-3">
        {pipelineStage !== 'newsletter' ? <>
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Event</p><p className="mt-1 break-words font-semibold text-[color:var(--portal-text)]">{lead.event_type || 'Quinceañera'}</p></div>
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Date</p><p className="mt-1 break-words font-mono text-[color:var(--portal-muted)]">{lead.target_date || 'Not set'}</p></div>
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Guests</p><p className="mt-1 font-mono text-[color:var(--portal-muted)]">{lead.guest_count || 'Flexible'}</p></div>
        </> : null}
        <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Language</p><p className="mt-1 break-words font-medium text-[color:var(--portal-muted)]">{getRequestedTourLanguage(lead) || 'Not specified'}</p></div>
        {isMarketingLead(lead) ? <div className="flex items-center gap-1.5 text-[#a8792f] dark:text-[#f1d27a]"><Star size={12} className="fill-current" aria-hidden="true" />Marketing lead</div> : null}
      </div>
    </LuxorCrmRecordCard>
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
      {lostLeads.length === 0 ? (
        <div className="px-8 py-16 text-center">
                <X size={22} className="mx-auto text-[color:var(--portal-muted)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No closed-lost opportunities</p>
                <p className="mt-1 text-xs text-[color:var(--portal-muted)]">When an opportunity is closed, its reason and any tour cancellation will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {lostLeads.map((lead) => {
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

            return <LuxorCrmRecordCard
              key={lead.id}
              lead={lead}
              badges={[{ label: 'Closed Lost', tone: 'neutral' }]}
              subtitle={<>{lead.event_type || 'Event'} · {lead.target_date || 'Date not set'}{lead.guest_count ? <> · {lead.guest_count} guests</> : null}</>}
              contact={lead.email || (lead.phone ? formatPhoneDisplay(lead.phone) : 'No contact detail')}
              actions={<Link href={`/portal/leads/${lead.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">View dossier <ExternalLink size={14} aria-hidden="true" /></Link>}
            >
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Closed</p><p className="mt-1 font-medium text-[color:var(--portal-text)]">{formatDate(lead.updated_at || lead.created_at)}</p><p className="mt-1 max-w-[240px] truncate text-[10px] text-[color:var(--portal-muted)]" title={lossReason || undefined}>{lossReason || 'Reason saved in activity'}</p></div>
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-faint)]">Tour</p><p className="mt-1 font-medium text-[color:var(--portal-muted)]">{tourStatus}</p></div>
              </div>
            </LuxorCrmRecordCard>
          })}
        </div>
      )}
    </PortalTableCard>
  )
}

function LeadsToursTab({
  leads,
  onMovePipelineStage,
  onLifecycleAction,
  onTourOutcome,
  busyTourOutcomeIds,
}: {
  leads: LuxorInquiry[]
  onMovePipelineStage: (id: string, stage: LuxorPipelineStage) => void
  onLifecycleAction: (lead: LuxorInquiry, action: LeadLifecycleAction) => void
  onTourOutcome: (lead: LuxorInquiry, attendance: 'attended' | 'no_show') => void
  busyTourOutcomeIds: string[]
}) {
  type TourView = 'all' | TourCategory
  type TourViewMode = 'cards' | 'list'
  type TourSortKey = 'client' | 'date' | 'event' | 'stage'
  type TourCategory = ScheduledTourCategory

  const [view, setView] = useState<TourView>(() => {
    if (typeof window === 'undefined') return 'all'
    const saved = window.localStorage.getItem('luxor_leads_tours_view')
    return saved === 'past' ? 'needs_outcome' : saved && ['all', 'today', 'upcoming', 'completed', 'no_shows', 'needs_outcome', 'needs_schedule', 'cancelled'].includes(saved) ? saved as TourView : 'all'
  })
  const [viewMode, setViewMode] = useState<TourViewMode>(() => {
    if (typeof window === 'undefined') return 'cards'
    const saved = window.localStorage.getItem('luxor_leads_tours_view_mode')
    return saved && ['cards', 'list'].includes(saved) ? saved as TourViewMode : 'cards'
  })
  const [sort, setSort] = useState<TableSort<TourSortKey>>(() => {
    if (typeof window === 'undefined') return { key: 'date', direction: 'asc' }
    const saved = window.localStorage.getItem('luxor_leads_tours_sort')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as TableSort<TourSortKey>
        if (['client', 'date', 'event', 'stage'].includes(parsed.key) && ['asc', 'desc'].includes(parsed.direction)) return parsed
      } catch {
        // Ignore malformed browser preferences and retain the default.
      }
    }
    return { key: 'date', direction: 'asc' }
  })
  const [currentPage, setCurrentPage] = useState(1)

  const saveView = (nextView: TourView) => {
    setView(nextView)
    setCurrentPage(1)
    window.localStorage.setItem('luxor_leads_tours_view', nextView)
  }

  const saveViewMode = (nextMode: TourViewMode) => {
    setViewMode(nextMode)
    window.localStorage.setItem('luxor_leads_tours_view_mode', nextMode)
  }

  const handleSort = (key: TourSortKey, direction?: SortDirection) => {
    const nextSort = direction
      ? { key, direction }
      : sort.key === key
        ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } as TableSort<TourSortKey>
        : { key, direction: 'asc' } as TableSort<TourSortKey>
    setSort(nextSort)
    setCurrentPage(1)
    window.localStorage.setItem('luxor_leads_tours_sort', JSON.stringify(nextSort))
  }

  const [todayKey, setTodayKey] = useState(() => luxorTodayKey())
  const tours = leads.filter((lead) => getLuxorTourSection(lead, todayKey) !== null)

  useEffect(() => {
    const refreshToday = () => {
      setTodayKey(luxorTodayKey())
    }
    const timer = window.setInterval(refreshToday, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const grouped = useMemo(() => {
    const result: Record<TourCategory, LuxorInquiry[]> = { today: [], upcoming: [], completed: [], no_shows: [], needs_outcome: [], needs_schedule: [], cancelled: [] }
    tours.forEach((tour) => {
      const category = getLuxorTourSection(tour, todayKey)
      if (category) result[category].push(tour)
    })
    const compare = (a: LuxorInquiry, b: LuxorInquiry) => {
      const values: Record<TourSortKey, number> = {
        client: a.full_name.localeCompare(b.full_name),
        date: compareLuxorScheduledTours(a, b, 'asc'),
        event: (a.event_type || '').localeCompare(b.event_type || ''),
        stage: getPipelineStage(a).localeCompare(getPipelineStage(b)),
      }
      const value = values[sort.key]
      return sort.direction === 'asc' ? value : -value
    }
    Object.entries(result).forEach(([category, items]) => {
      const defaultDirection = ['completed', 'no_shows', 'needs_outcome', 'needs_schedule', 'cancelled'].includes(category) ? 'desc' : 'asc'
      items.sort(sort.key === 'date' ? (a, b) => compareLuxorScheduledTours(a, b, defaultDirection) : compare)
    })
    return result
  }, [sort, todayKey, tours])

  const categoryLabels: Record<TourCategory, string> = { today: 'Today', upcoming: 'Upcoming', completed: 'Completed', no_shows: 'No Shows', needs_outcome: 'Needs Outcome', needs_schedule: 'Needs Schedule', cancelled: 'Cancelled' }
  const categoryOrder: TourCategory[] = ['today', 'upcoming', 'completed', 'no_shows', 'needs_outcome', 'needs_schedule', 'cancelled']
  const visibleTours = view === 'all' ? categoryOrder.flatMap((category) => grouped[category]) : grouped[view]
  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(visibleTours.length / pageSize))
  const activePage = Math.min(currentPage, totalPages)
  const pageTours = visibleTours.slice((activePage - 1) * pageSize, activePage * pageSize)
  const firstShown = visibleTours.length === 0 ? 0 : (activePage - 1) * pageSize + 1
  const lastShown = Math.min(activePage * pageSize, visibleTours.length)
  const listFooter = viewMode === 'list' ? (
    <div className="flex w-full items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">
      <span>{visibleTours.length ? `Showing ${firstShown}–${lastShown} of ${visibleTours.length} tours` : 'No tours to show'}</span>
      <PortalPagination currentPage={activePage} totalPages={totalPages} onPageChange={setCurrentPage} />
    </div>
  ) : null

  const tourStatusTones: Record<TourCategory, PortalStatusTone> = {
    today: 'blue', upcoming: 'gold', completed: 'green', no_shows: 'red',
    needs_outcome: 'gold', needs_schedule: 'neutral', cancelled: 'neutral',
  }
  const renderTourCard = (tour: LuxorInquiry) => {
    const category = getLuxorTourSection(tour, todayKey) ?? 'needs_schedule'
    const statusLabel = category === 'no_shows' ? 'No Show' : categoryLabels[category]
    return (
      <LuxorCrmRecordCard
        key={tour.id}
        lead={tour}
        badges={[{ label: statusLabel, tone: tourStatusTones[category], warning: category === 'needs_outcome' }]}
        subtitle={<>{tour.event_type || 'Quinceañera'} · {tour.target_date || 'Event date not set'}{tour.guest_count ? <> · {tour.guest_count} guests</> : null}</>}
        contact={tour.email || (tour.phone ? formatPhoneDisplay(tour.phone) : 'No contact details')}
        className={category === 'no_shows' ? 'border-rose-300 dark:border-rose-400/40' : ''}
        actions={
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <PortalSelect className="w-full sm:w-auto" value={getPipelineStage(tour)} onChange={(value) => onMovePipelineStage(tour.id, value as LuxorPipelineStage)} options={PIPELINE_STAGE_OPTIONS} />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <Link href={'/portal/leads/' + tour.id + '?stage=tour'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white transition-colors hover:bg-[#916825]"><Calendar size={14} /> Manage Tour</Link>
              <Link href={'/portal/leads/' + tour.id} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]"><Eye size={14} /> View</Link>
              <LeadLifecycleActionsMenu lead={tour} onAction={(action) => onLifecycleAction(tour, action)} />
            </div>
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">Tour time</p><p className="mt-1 text-sm font-semibold text-[color:var(--portal-text)]">{tour.preferred_tour_date ? formatTourDate(tour.preferred_tour_date) : 'Date Pending'}</p><p className="text-xs text-[color:var(--portal-muted)]">{tour.preferred_tour_time || 'Time TBD'} · Central</p></div>
          {tour.tour_attendance_status !== 'cancelled' && tour.tour_attendance_status !== 'attended' ? (
            <div className="flex flex-wrap gap-2">
              <LuxorCrmSecondaryAction disabled={busyTourOutcomeIds.includes(tour.id)} onClick={() => onTourOutcome(tour, 'attended')}>{busyTourOutcomeIds.includes(tour.id) ? 'Saving…' : tour.tour_attendance_status === 'no_show' ? 'Correct to Completed' : 'Mark Completed'}</LuxorCrmSecondaryAction>
              {!['attended', 'no_show'].includes(tour.tour_attendance_status || '') ? <LuxorCrmSecondaryAction disabled={busyTourOutcomeIds.includes(tour.id)} onClick={() => onTourOutcome(tour, 'no_show')}>{busyTourOutcomeIds.includes(tour.id) ? 'Saving…' : 'Mark No Show'}</LuxorCrmSecondaryAction> : null}
            </div>
          ) : null}
        </div>
      </LuxorCrmRecordCard>
    )
  }

  return (
    <PortalTableCard
      controls={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Scheduled Tours ({tours.length})</h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex max-w-full flex-wrap items-center justify-start gap-1 rounded-lg border border-[color:var(--portal-border)] p-1 sm:justify-end" role="tablist" aria-label="Tour date filter">
              {(['all', 'today', 'upcoming', 'completed', 'no_shows', 'needs_outcome', 'needs_schedule', 'cancelled'] as TourView[]).map((option) => <button key={option} type="button" role="tab" aria-selected={view === option} onClick={() => saveView(option)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${view === option ? 'bg-[#caa24c]/15 text-[#9a712e] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>{option === 'all' ? 'All' : `${categoryLabels[option]} (${grouped[option].length})`}</button>)}
            </div>
            {viewMode === 'list' ? <div className="w-full sm:w-56"><PortalSelect value={sort.key + ':' + sort.direction} onChange={(value) => { const [key, direction] = value.split(':'); handleSort(key as TourSortKey, direction as SortDirection) }} aria-label="Sort tours" options={[
              { value: 'date:asc', label: 'Tour time · Earliest first' }, { value: 'date:desc', label: 'Tour time · Latest first' },
              { value: 'client:asc', label: 'Client · A to Z' }, { value: 'client:desc', label: 'Client · Z to A' },
              { value: 'event:asc', label: 'Event · A to Z' }, { value: 'event:desc', label: 'Event · Z to A' },
              { value: 'stage:asc', label: 'Lifecycle · A to Z' }, { value: 'stage:desc', label: 'Lifecycle · Z to A' },
            ]} /></div> : null}
            <div className="flex items-center rounded-lg border border-[color:var(--portal-border)] p-1" aria-label="Tour view mode">
              <button type="button" aria-pressed={viewMode === 'cards'} aria-label="Card view" onClick={() => saveViewMode('cards')} className={`rounded-md p-1.5 ${viewMode === 'cards' ? 'bg-[#caa24c]/15 text-[#9a712e] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}><LayoutGrid size={15} /></button>
              <button type="button" aria-pressed={viewMode === 'list'} aria-label="List view" onClick={() => saveViewMode('list')} className={`rounded-md p-1.5 ${viewMode === 'list' ? 'bg-[#caa24c]/15 text-[#9a712e] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}><List size={15} /></button>
            </div>
          </div>
        </div>
      }
      footer={listFooter}
    >
      {viewMode === 'cards' ? (
        <div className="space-y-7 overflow-y-auto p-4 sm:p-6">
          {(view === 'all' ? categoryOrder : [view]).map((category) => (
            <section key={category} aria-labelledby={'tour-' + category + '-heading'}>
              <div className="mb-3 flex items-center gap-3"><h4 id={'tour-' + category + '-heading'} className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">{categoryLabels[category]}</h4><span className="text-[10px] text-[color:var(--portal-muted)]">{grouped[category].length}</span></div>
              {grouped[category].length === 0 ? <p className="rounded-lg border border-dashed border-[color:var(--portal-border)] px-4 py-6 text-center text-sm text-[color:var(--portal-muted)]">No tours in this category.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{grouped[category].map(renderTourCard)}</div>}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-5 overflow-y-auto p-4 sm:p-6">
          {view === 'all' ? categoryOrder.map((category) => {
            const records = pageTours.filter((tour) => getLuxorTourSection(tour, todayKey) === category)
            return records.length ? <section key={category} aria-label={categoryLabels[category]}><h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{categoryLabels[category]}</h4><div className="space-y-3">{records.map(renderTourCard)}</div></section> : null
          }) : pageTours.length ? pageTours.map(renderTourCard) : <p className="rounded-lg border border-dashed border-[color:var(--portal-border)] px-4 py-10 text-center text-sm text-[color:var(--portal-muted)]">No tours in this category.</p>}
        </div>
      )}
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
  const proposals = leads.filter((lead) => lead.status === 'proposal_sent')
  return (
    <PortalTableCard controls={<h3 className="text-xs font-black uppercase tracking-[0.2em] text-[color:var(--portal-text)]">Sent Proposals ({proposals.length})</h3>}>
      {proposals.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-[color:var(--portal-muted)]">No proposals awaiting signature.</div>
      ) : (
        <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {proposals.map((lead) => (
            <LuxorCrmRecordCard
              key={lead.id}
              lead={lead}
              badges={[{ label: 'Sent', tone: luxorCrmStatusTone('sent') }]}
              subtitle={<>{lead.event_type || 'Quinceañera'} · {lead.target_date || 'Date not set'}{lead.guest_count ? <> · {lead.guest_count} guests</> : null}</>}
              contact={lead.email || 'No email registered'}
              actions={
                <>
                  <Link href={'/portal/leads/' + lead.id + '?stage=proposal'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#a8792f] px-4 text-xs font-bold text-white transition-colors hover:bg-[#916825]"><FileCheck size={14} /> Review Proposal</Link>
                  <LeadLifecycleActionsMenu lead={lead} onAction={(action) => onLifecycleAction(lead, action)} />
                </>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[color:var(--portal-muted)]">Intake source</span>
                <span className="font-semibold text-[color:var(--portal-text)]">{isGrandOpeningRsvp(lead) ? 'RSVP' : lead.source.replaceAll('_', ' ')}</span>
              </div>
              <Link href={'/portal/leads/' + lead.id} className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#8c6529] hover:text-[#a8792f] dark:text-[#f1d27a]"><Eye size={14} /> View lead record</Link>
            </LuxorCrmRecordCard>
          ))}
        </div>
      )}
    </PortalTableCard>
  )
}
