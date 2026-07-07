'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, use } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
  Plus,
  Send,
  Trash2,
  DollarSign,
  Briefcase,
  AlertCircle,
  FileText,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileSignature,
  NotebookPen,
  ReceiptText,
  Sparkles,
  Copy,
  Check,
  Pencil,
  MapPin,
  Star,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { LuxorBooking, LuxorBookingStatus, LuxorInquiry, LuxorNote, LuxorTask, LuxorInvoice, LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { PortalPageFrame, PortalStatusBadge, PortalSelect, PortalDatePicker, PortalModal } from '@/components/portal/PortalUI'

type ZohoEmailMessage = {
  id: string
  subject: string
  from: string
  to: string
  receivedAt: string | null
  summary: string
  hasAttachment: boolean
  direction?: 'incoming' | 'outgoing' | 'matched'
}

type ActivityEntry =
  | { kind: 'note'; id: string; createdAt: string; note: LuxorNote }
  | { kind: 'email'; id: string; createdAt: string; email: ZohoEmailMessage }

type EditableLeadField =
  | 'event_type'
  | 'guest_count'
  | 'target_date'
  | 'package_interest'
  | 'preferred_tour_date'
  | 'preferred_tour_time'
  | 'email'
  | 'phone'
  | 'address'

type LeadDetailInputType = 'text' | 'number' | 'date' | 'time' | 'email' | 'tel'
type LeadDetailTab = 'overview' | 'activity' | 'tasks' | 'booking' | 'billing' | 'documents' | 'messages' | 'notes'

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [lead, setLead] = useState<LuxorInquiry | null>(null)
  const [notes, setNotes] = useState<LuxorNote[]>([])
  const [tasks, setTasks] = useState<LuxorTask[]>([])
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([])
  const [bookings, setBookings] = useState<LuxorBooking[]>([])
  const [emailMessages, setEmailMessages] = useState<ZohoEmailMessage[]>([])
  const [loadingEmailMessages, setLoadingEmailMessages] = useState(false)
  const [emailThreadError, setEmailThreadError] = useState<string | null>(null)
  const [zohoReconnectRequired, setZohoReconnectRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Note drafting state
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState<'note' | 'call_log' | 'email_log'>('note')
  const [submittingNote, setSubmittingNote] = useState(false)

  // Task adding state
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [submittingTask, setSubmittingTask] = useState(false)

  // Invoice creation state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [invoiceDesc, setInvoiceDesc] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceItems, setInvoiceItems] = useState<LuxorInvoiceLineItem[]>([
    { description: 'Venue Rental Fee', quantity: 1, unitPrice: 2500, total: 2500 },
  ])
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [submittingInvoice, setSubmittingInvoice] = useState(false)

  // Booking creation state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [bookingEventDate, setBookingEventDate] = useState('')
  const [bookingStartTime, setBookingStartTime] = useState('')
  const [bookingEndTime, setBookingEndTime] = useState('')
  const [bookingPackageName, setBookingPackageName] = useState('')
  const [bookingContractTotal, setBookingContractTotal] = useState('')
  const [bookingDepositRequired, setBookingDepositRequired] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [bookingStatus, setBookingStatus] = useState<LuxorBookingStatus>('tentative')
  const [submittingBooking, setSubmittingBooking] = useState(false)

  // Status editing state
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingLifecycleStatus, setPendingLifecycleStatus] = useState<LuxorInquiry['status'] | null>(null)

  // Timeline tab filtering
  const [activeLeadTab, setActiveLeadTab] = useState<LeadDetailTab>('overview')
  const [selectedStageOverride, setSelectedStageOverride] = useState<string | null>(null)
  const [planningSubTab, setPlanningSubTab] = useState<'details' | 'vendors' | 'fb' | 'decor' | 'timeline' | 'files'>('details')
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'notes' | 'comms' | 'system'>('all')
  const [showInternalSignals, setShowInternalSignals] = useState(false)
  const [showTaskTools, setShowTaskTools] = useState(false)
  const [savingLeadField, setSavingLeadField] = useState<EditableLeadField | null>(null)
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })

  // Marketing subscription states
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [togglingMarketing, setTogglingMarketing] = useState(false)
  const [marketingMessage, setMarketingMessage] = useState<'added' | 'removed' | null>(null)

  // Event Summary states
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [summaryVenue, setSummaryVenue] = useState('Luxor Main Hall')
  const [summaryStartTime, setSummaryStartTime] = useState('17:00')
  const [summaryEndTime, setSummaryEndTime] = useState('23:00')
  const [summarySetupTime, setSummarySetupTime] = useState('3:00 PM')
  const [summaryBreakdownTime, setSummaryBreakdownTime] = useState('11:00 PM – 12:30 AM')
  const [savingSummary, setSavingSummary] = useState(false)

  // Tour Attendance states
  const [isEditingTourAttendance, setIsEditingTourAttendance] = useState(false)
  const [tourGuests, setTourGuests] = useState('Miguel Martinez')
  const [tourNotes, setTourNotes] = useState('Client loved the modern chandelier and open bar space. Interested in black & gold theme. Mentioned needing help with décor and photography.')
  const [savingTourAttendance, setSavingTourAttendance] = useState(false)

  const latestBooking = useMemo(() => getMostRecentBooking(bookings), [bookings])

  const leadDerivedData = useMemo(() => {
    if (!lead) {
      return {
        chatMessages: [] as { role: string; content: string }[],
        isGrandOpeningLead: false,
        latestInvoice: null as LuxorInvoice | null,
        noteEntries: [] as ActivityEntry[],
        emailEntries: [] as ActivityEntry[],
        allActivityEntries: [] as ActivityEntry[],
        activityCounts: { all: 0, notes: 0, comms: 0, system: 0 },
        sortedTasks: [] as LuxorTask[],
        pendingTaskCount: 0,
        sortedBookings: [] as LuxorBooking[],
        sortedInvoices: [] as LuxorInvoice[],
      }
    }

    const derivedNoteEntries: ActivityEntry[] = notes.map((note) => ({
      kind: 'note',
      id: `note-${note.id}`,
      createdAt: note.created_at,
      note,
    }))
    const derivedEmailEntries: ActivityEntry[] = emailMessages.map((email) => ({
      kind: 'email',
      id: `email-${email.id || email.direction || email.subject}-${email.receivedAt || email.from}`,
      createdAt: normalizeTimelineDate(email.receivedAt),
      email,
    }))
    const derivedAllActivityEntries = [...derivedNoteEntries, ...derivedEmailEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const derivedSortedTasks = [...tasks].sort((a, b) => {
      const rank = (task: LuxorTask) => {
        if (task.status === 'pending' && task.priority === 'urgent') return 0
        if (task.status === 'pending' && task.priority === 'high') return 1
        if (task.status === 'pending') return 2
        if (task.status === 'completed') return 3
        return 4
      }

      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff

      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY
      return aDue - bDue
    })
    const derivedSortedBookings = [...bookings].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })
    const derivedSortedInvoices = [...invoices].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at).getTime()
      const bTime = new Date(b.updated_at || b.created_at).getTime()
      return bTime - aTime
    })

    return {
      chatMessages: (lead.metadata?.chatMessages as { role: string; content: string }[]) || [],
      isGrandOpeningLead: isGrandOpeningRsvp(lead),
      latestInvoice: derivedSortedInvoices[0] ?? null,
      noteEntries: derivedNoteEntries,
      emailEntries: derivedEmailEntries,
      allActivityEntries: derivedAllActivityEntries,
      activityCounts: {
        all: derivedNoteEntries.length + derivedEmailEntries.length,
        notes: notes.filter((note) => note.note_type === 'note').length,
        comms: derivedEmailEntries.length + notes.filter((note) => note.note_type === 'call_log' || note.note_type === 'email_log').length,
        system: notes.filter((note) => note.note_type === 'status_change').length,
      },
      sortedTasks: derivedSortedTasks,
      pendingTaskCount: derivedSortedTasks.filter((task) => task.status === 'pending').length,
      sortedBookings: derivedSortedBookings,
      sortedInvoices: derivedSortedInvoices,
    }
  }, [bookings, emailMessages, invoices, lead, notes, tasks])

  const activityEntries = useMemo(() => {
    return leadDerivedData.allActivityEntries.filter((entry) => {
      if (activeFeedTab === 'notes') return entry.kind === 'note' && entry.note.note_type === 'note'
      if (activeFeedTab === 'comms') {
        return entry.kind === 'email' || (entry.kind === 'note' && (entry.note.note_type === 'call_log' || entry.note.note_type === 'email_log'))
      }
      if (activeFeedTab === 'system') return entry.kind === 'note' && entry.note.note_type === 'status_change'
      return true
    })
  }, [activeFeedTab, leadDerivedData.allActivityEntries])

  const activeStage = useMemo(() => {
    if (!lead) return 'inquiry'
    const steps = [
      {
        id: 'inquiry',
        isCompleted: true,
        isActive: false,
      },
      {
        id: 'tour',
        isCompleted: lead.status !== 'new' && lead.status !== 'contacted',
        isActive: lead.status === 'tour_requested' || lead.status === 'tour_confirmed',
      },
      {
        id: 'proposal',
        isCompleted: lead.status === 'proposal_sent' || lead.status === 'booked',
        isActive: lead.status === 'proposal_sent' && !latestBooking,
      },
      {
        id: 'contract',
        isCompleted: latestBooking?.contract_status === 'signed',
        isActive: latestBooking?.contract_status === 'sent' || (lead.status === 'booked' && !latestBooking) || (lead.status === 'proposal_sent' && !!latestBooking),
      },
      {
        id: 'deposit',
        isCompleted: latestBooking?.security_deposit_status === 'collected',
        isActive: latestBooking?.contract_status === 'signed' && latestBooking?.security_deposit_status !== 'collected',
      },
      {
        id: 'planning',
        isCompleted: latestBooking?.status === 'confirmed' || latestBooking?.status === 'completed',
        isActive: latestBooking?.security_deposit_status === 'collected' && latestBooking?.status === 'tentative',
      },
      {
        id: 'final_payment',
        isCompleted: latestBooking?.status === 'completed',
        isActive: latestBooking?.status === 'confirmed',
      },
      {
        id: 'event',
        isCompleted: latestBooking?.status === 'completed',
        isActive: false,
      },
      {
        id: 'closing',
        isCompleted: latestBooking?.status === 'completed',
        isActive: false,
      },
    ]

    const activeIndex = steps.findIndex(s => s.isActive)
    if (activeIndex !== -1) {
      return steps[activeIndex].id
    }
    
    const firstNonCompletedIdx = steps.findIndex(s => !s.isCompleted)
    if (firstNonCompletedIdx !== -1) {
      return steps[firstNonCompletedIdx].id
    }
    
    return 'inquiry'
  }, [lead, latestBooking])

  // Set Event Summary states from lead metadata or latestBooking
  useEffect(() => {
    if (lead) {
      const metadata = lead.metadata || {}
      setSummaryVenue(String(latestBooking?.metadata?.venue || metadata.venue || 'Luxor Main Hall'))
      setSummaryStartTime(String(latestBooking?.start_time || metadata.start_time || '17:00'))
      setSummaryEndTime(String(latestBooking?.end_time || metadata.end_time || '23:00'))
      setSummarySetupTime(String(latestBooking?.metadata?.setup_time || metadata.setup_time || '3:00 PM'))
      setSummaryBreakdownTime(String(latestBooking?.metadata?.breakdown_time || metadata.breakdown_time || '11:00 PM – 12:30 AM'))
      setTourGuests(String(metadata.tourGuests || 'Miguel Martinez'))
      setTourNotes(String(metadata.tourNotes || 'Client loved the modern chandelier and open bar space. Interested in black & gold theme. Mentioned needing help with décor and photography.'))
    }
  }, [lead, latestBooking])

  const handleSaveSummary = async () => {
    if (!lead) return
    try {
      setSavingSummary(true)
      if (latestBooking) {
        const res = await fetch('/api/bookings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: latestBooking.id,
            start_time: summaryStartTime,
            end_time: summaryEndTime,
            metadata: {
              ...latestBooking.metadata,
              venue: summaryVenue,
              setup_time: summarySetupTime,
              breakdown_time: summaryBreakdownTime,
            }
          })
        })
        if (!res.ok) throw new Error('Failed to save event summary details.')
      } else {
        const res = await fetch('/api/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: lead.id,
            metadata: {
              ...lead.metadata,
              venue: summaryVenue,
              start_time: summaryStartTime,
              end_time: summaryEndTime,
              setup_time: summarySetupTime,
              breakdown_time: summaryBreakdownTime,
            }
          })
        })
        if (!res.ok) throw new Error('Failed to save lead event summary.')
      }

      await fetchAllData()
      setIsEditingSummary(false)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to save event summary.')
    } finally {
      setSavingSummary(false)
    }
  }

  const handleSaveTourAttendance = async () => {
    if (!lead) return
    try {
      setSavingTourAttendance(true)
      const updatedMetadata = {
        ...lead.metadata,
        tourGuests,
        tourNotes,
      }

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          metadata: updatedMetadata,
        }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update tour attendance.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      setIsEditingTourAttendance(false)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to update tour attendance.')
    } finally {
      setSavingTourAttendance(false)
    }
  }

  useLayoutEffect(() => {
    let frame = 0
    const updateIndicator = () => {
      const activeButton = tabButtonRefs.current[activeLeadTab]
      if (!activeButton) return

      const nextIndicator = {
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      }
      setTabIndicator((current) => {
        if (current.left === nextIndicator.left && current.width === nextIndicator.width) {
          return current
        }
        return nextIndicator
      })
    }
    const scheduleIndicatorUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateIndicator)
    }

    updateIndicator()
    window.addEventListener('resize', scheduleIndicatorUpdate)
    return () => {
      window.removeEventListener('resize', scheduleIndicatorUpdate)
      cancelAnimationFrame(frame)
    }
  }, [activeLeadTab, lead?.id])

  useEffect(() => {
    setShowInternalSignals(false)
    setShowTaskTools(false)
  }, [id])

  useEffect(() => {
    const email = lead?.email
    if (!email) return
    let active = true

    const checkSubscription = async () => {
      try {
        const res = await fetch(`/api/marketing/members?email=${encodeURIComponent(email)}`)
        if (res.ok && active) {
          const data = await res.json()
          setIsSubscribed(data.subscribed)
        }
      } catch (err) {
        console.error('Failed to query subscriber status:', err)
      }
    }

    checkSubscription()
    return () => { active = false }
  }, [lead?.email])

  const handleToggleMarketing = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!lead?.email || togglingMarketing) return

    setTogglingMarketing(true)
    const newStatus = !isSubscribed

    try {
      const res = await fetch('/api/marketing/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: lead.email,
          fullName: lead.full_name,
          source: lead.source,
          action: newStatus ? 'subscribe' : 'unsubscribe',
        }),
      })

      if (res.ok) {
        setIsSubscribed(newStatus)
        setMarketingMessage(newStatus ? 'added' : 'removed')
        window.setTimeout(() => setMarketingMessage(null), 2500)
      } else {
        throw new Error('Failed to update marketing list subscription.')
      }
    } catch (err) {
      console.error(err)
      alert('Unable to update marketing subscription status.')
    } finally {
      setTogglingMarketing(false)
    }
  }

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      const leadRes = await fetch(`/api/inquiries?id=${id}`)
      if (!leadRes.ok) throw new Error('Failed to fetch lead details.')
      const leadData = await leadRes.json()
      setLead(leadData)

      void fetchClientEmailThread(leadData.email || '')

      const [notesData, tasksData, invoicesData, bookingsData] = await Promise.all([
        fetch(`/api/notes?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/tasks?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/invoices?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
        fetch(`/api/bookings?inquiryId=${id}`)
          .then(async (res) => (res.ok ? await res.json() : []))
          .catch(() => []),
      ])

      setNotes(notesData)
      setTasks(tasksData)
      setInvoices(invoicesData)
      setBookings(bookingsData)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An error occurred loading the client profile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [id])

  const fetchClientEmailThread = async (email: string) => {
    if (!email) {
      setEmailMessages([])
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      return
    }

    try {
      setLoadingEmailMessages(true)
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      const response = await fetch(`/api/email/inbox?limit=50&email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as {
        messages?: ZohoEmailMessage[]
        error?: string
        reconnectRequired?: boolean
      }
      if (!response.ok) {
        setZohoReconnectRequired(Boolean(payload.reconnectRequired))
        throw new Error(payload.error || 'Unable to load Zoho email history.')
      }
      setEmailMessages(payload.messages || [])
    } catch (threadError) {
      setEmailMessages([])
      const message = threadError instanceof Error ? threadError.message : 'Unable to load Zoho email history.'
      setEmailThreadError(message)
      setZohoReconnectRequired((current) => current || message.includes('reconnected with email search permission'))
    } finally {
      setLoadingEmailMessages(false)
    }
  }

  const handleStatusChange = async (newStatus: LuxorInquiry['status']) => {
    if (!lead) return
    try {
      setUpdatingStatus(true)
      setPendingLifecycleStatus(newStatus)
      const res = await fetch(`/api/inquiries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update status.')
      const updated = await res.json()
      setLead(updated)

      // Add a status change log entry in notes
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          content: `Lead status updated to ${newStatus.replace('_', ' ').toUpperCase()}`,
          noteType: 'status_change',
          author: 'Portal System',
        }),
      })

      // Refresh notes list
      const notesRes = await fetch(`/api/notes?inquiryId=${id}`)
      if (notesRes.ok) {
        const notesData = await notesRes.json()
        setNotes(notesData)
      }
    } catch (err) {
      console.error(err)
      alert('Error updating status.')
    } finally {
      setUpdatingStatus(false)
      setPendingLifecycleStatus(null)
    }
  }

  const handleLeadFieldUpdate = async (field: EditableLeadField, nextValue: string) => {
    if (!lead || savingLeadField) return false

    const normalizedValue = normalizeLeadFieldValue(field, nextValue)

    if (field === 'address') {
      const currentValue = lead.metadata?.address || ''
      if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) {
        return true
      }

      const previousLead = lead
      try {
        setSavingLeadField(field)
        const updatedMetadata = { ...lead.metadata, address: normalizedValue }
        setLead((current) => current ? { ...current, metadata: updatedMetadata, updated_at: new Date().toISOString() } : current)

        const res = await fetch('/api/inquiries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, metadata: updatedMetadata }),
        })

        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to update address detail.')
        }

        const updated = payload as LuxorInquiry
        setLead(updated)
        return true
      } catch (err) {
        console.error(err)
        setLead(previousLead)
        alert(err instanceof Error ? err.message : 'Failed to update address detail.')
        return false
      } finally {
        setSavingLeadField(null)
      }
    }

    const fieldKey = field as Exclude<EditableLeadField, 'address'>
    const currentValue = lead[fieldKey]

    if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) {
      return true
    }

    const previousLead = lead
    try {
      setSavingLeadField(field)
      setLead((current) => current ? { ...current, [fieldKey]: normalizedValue, updated_at: new Date().toISOString() } : current)

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [fieldKey]: normalizedValue }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update lead detail.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      if (fieldKey === 'email') {
        void fetchClientEmailThread(updated.email || '')
      }
      return true
    } catch (err) {
      console.error(err)
      setLead(previousLead)
      alert(err instanceof Error ? err.message : 'Failed to update lead detail.')
      return false
    } finally {
      setSavingLeadField(null)
    }
  }

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteContent.trim()) return
    try {
      setSubmittingNote(true)
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          content: noteContent,
          noteType,
          author: 'Admin Owner',
        }),
      })
      if (!res.ok) throw new Error('Failed to post note.')
      const note = await res.json()
      setNotes((prev) => [...prev, note])
      setNoteContent('')
    } catch (err) {
      console.error(err)
      alert('Error saving note.')
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) return
    try {
      setSubmittingTask(true)
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: id,
          title: taskTitle,
          description: taskDesc || null,
          dueDate: taskDueDate || null,
          priority: taskPriority,
        }),
      })
      if (!res.ok) throw new Error('Failed to create task.')
      const task = await res.json()
      setTasks((prev) => [task, ...prev])
      setTaskTitle('')
      setTaskDesc('')
      setTaskDueDate('')
      setTaskPriority('medium')
    } catch (err) {
      console.error(err)
      alert('Error adding task.')
    } finally {
      setSubmittingTask(false)
    }
  }

  const handleToggleTask = async (task: LuxorTask) => {
    try {
      const isCompleted = task.status === 'completed'
      const newStatus = isCompleted ? 'pending' : 'completed'
      const completedAt = isCompleted ? null : new Date().toISOString()

      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          status: newStatus,
          completed_at: completedAt,
        }),
      })

      if (!res.ok) throw new Error('Failed to update task.')
      const updated = await res.json()
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
    } catch (err) {
      console.error(err)
      alert('Failed to update task status.')
    }
  }

  const handleInvoiceItemChange = (index: number, field: keyof LuxorInvoiceLineItem, val: string | number) => {
    const updated = [...invoiceItems]
    const item = { ...updated[index] }

    if (field === 'quantity') {
      item.quantity = Math.max(1, Number(val))
    } else if (field === 'unitPrice') {
      item.unitPrice = Math.max(0, Number(val))
    } else if (field === 'description') {
      item.description = String(val)
    }

    item.total = item.quantity * item.unitPrice
    updated[index] = item
    setInvoiceItems(updated)
  }

  const addInvoiceItem = () => {
    setInvoiceItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }])
  }

  const removeInvoiceItem = (index: number) => {
    if (invoiceItems.length === 1) return
    setInvoiceItems((prev) => prev.filter((_, i) => i !== index))
  }

  const getInvoiceSubtotal = () => invoiceItems.reduce((acc, item) => acc + item.total, 0)
  const getInvoiceTax = () => getInvoiceSubtotal() * 0.0825
  const getInvoiceTotal = () => getInvoiceSubtotal() + getInvoiceTax()

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return

    try {
      setSubmittingInvoice(true)
      const subtotal = getInvoiceSubtotal()
      const taxRate = 0.0825
      const total = getInvoiceTotal()

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: lead.full_name,
          event_type: lead.event_type || 'Event Booking',
          description: invoiceDesc || `${lead.event_type || 'Event'} Booking fee`,
          line_items: invoiceItems,
          subtotal,
          tax_rate: taxRate,
          total,
          due_date: invoiceDueDate || null,
          inquiry_id: id,
          notes: invoiceNotes || null,
        }),
      })

      if (!res.ok) throw new Error('Failed to create invoice.')
      const invoice = await res.json()
      setInvoices((prev) => [invoice, ...prev])
      setIsInvoiceModalOpen(false)
      
      // Reset invoice form
      setInvoiceDesc('')
      setInvoiceDueDate('')
      setInvoiceNotes('')
      setInvoiceItems([{ description: 'Venue Rental Fee', quantity: 1, unitPrice: 2500, total: 2500 }])
    } catch (err) {
      console.error(err)
      alert('Error creating invoice.')
    } finally {
      setSubmittingInvoice(false)
    }
  }

  const handleSendContract = async (bookingId: string) => {
    try {
      const res = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send contract.')
      await fetchAllData()
      alert('Contract signature email queued.')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to send contract.')
    }
  }

  const openBookingModal = () => {
    const suggestedContractTotal = invoices[0]?.total ? Number(invoices[0].total) : 0
    const targetDate = lead?.target_date && /^\d{4}-\d{2}-\d{2}$/.test(lead.target_date) ? lead.target_date : ''

    setBookingEventDate(targetDate)
    setBookingStartTime('')
    setBookingEndTime('')
    setBookingPackageName(lead?.package_interest || '')
    setBookingContractTotal(suggestedContractTotal > 0 ? String(suggestedContractTotal) : '')
    setBookingDepositRequired(suggestedContractTotal > 0 ? String(Math.round(suggestedContractTotal * 0.25)) : '')
    setBookingNotes(lead?.message || '')
    setBookingStatus('tentative')
    setIsBookingModalOpen(true)
  }

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lead) return

    const parsedContractTotal = Number.parseFloat(bookingContractTotal)
    const contractTotal = Number.isFinite(parsedContractTotal) ? parsedContractTotal : 0
    const parsedDeposit = Number.parseFloat(bookingDepositRequired)
    const depositRequired = Number.isFinite(parsedDeposit) ? parsedDeposit : Math.round(contractTotal * 0.25)

    try {
      setSubmittingBooking(true)

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiry_id: lead.id,
          client_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          event_type: lead.event_type,
          event_date: bookingEventDate || null,
          start_time: bookingStartTime || null,
          end_time: bookingEndTime || null,
          package_name: bookingPackageName || null,
          guest_count: lead.guest_count,
          status: bookingStatus,
          contract_total: contractTotal,
          deposit_required: depositRequired,
          notes: bookingNotes.trim() || lead.message,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to create booking.')

      const booking = data as LuxorBooking
      setBookings((prev) => [booking, ...prev])
      setIsBookingModalOpen(false)
      setBookingEventDate('')
      setBookingStartTime('')
      setBookingEndTime('')
      setBookingPackageName('')
      setBookingContractTotal('')
      setBookingDepositRequired('')
      setBookingNotes('')
      setBookingStatus('tentative')

      if (lead.status !== 'booked') {
        await handleStatusChange('booked')
      }
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create booking.')
    } finally {
      setSubmittingBooking(false)
    }
  }

  if (loading) {
    return <ClientDossierLoading />
  }

  if (error || !lead) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-500/80" />
        <h3 className="text-lg font-bold text-white">Dossier Unavailable</h3>
        <p className="max-w-md text-sm text-zinc-500 leading-relaxed">{error || 'The requested client inquiry could not be found.'}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={fetchAllData}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-300 transition-all hover:bg-blue-500/15 hover:text-white"
          >
            Retry Load
          </button>
          <Link href="/portal/leads" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300 transition-all hover:text-white">
            <ArrowLeft size={12} /> Back to Leads
          </Link>
        </div>
      </div>
    )
  }

  const {
    chatMessages,
    isGrandOpeningLead,
    latestInvoice,
    noteEntries,
    emailEntries,
    allActivityEntries,
    activityCounts,
    sortedTasks,
    pendingTaskCount,
    sortedBookings,
    sortedInvoices,
  } = leadDerivedData
  const nextBestMove = getLeadNextStep(lead, latestBooking, latestInvoice)
  const eventDetails: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EditableLeadField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    isMono?: boolean
  }> = [
    {
      label: 'Event Type',
      value: lead.event_type || 'Quinceañera',
      editValue: lead.event_type || '',
      copyValue: lead.event_type || '',
      field: 'event_type',
      icon: <Sparkles size={14} />,
      placeholder: 'Wedding, Quinceañera, birthday...',
    },
    {
      label: 'Guest Count',
      value: lead.guest_count ? `${lead.guest_count} guests` : 'Unspecified',
      editValue: lead.guest_count ? String(lead.guest_count) : '',
      copyValue: lead.guest_count ? String(lead.guest_count) : '',
      field: 'guest_count',
      icon: <Users size={14} />,
      inputType: 'number',
      placeholder: 'Guest count',
    },
    {
      label: 'Target Date',
      value: lead.target_date ? formatDisplayDate(lead.target_date) : 'TBD',
      editValue: lead.target_date || '',
      copyValue: lead.target_date || '',
      field: 'target_date',
      icon: <Calendar size={14} />,
      inputType: 'date',
    },
    {
      label: 'Package Interest',
      value: lead.package_interest || 'Not selected',
      editValue: lead.package_interest || '',
      copyValue: lead.package_interest || '',
      field: 'package_interest',
      icon: <Briefcase size={14} />,
      placeholder: 'Package or room interest',
    },
    {
      label: 'Preferred Tour Date',
      value: lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'No tour requested',
      editValue: lead.preferred_tour_date || '',
      copyValue: lead.preferred_tour_date || '',
      field: 'preferred_tour_date',
      icon: <Calendar size={14} />,
      inputType: 'date',
    },
    {
      label: 'Preferred Tour Time',
      value: lead.preferred_tour_time || 'N/A',
      editValue: normalizeTimeInputValue(lead.preferred_tour_time),
      copyValue: lead.preferred_tour_time || '',
      field: 'preferred_tour_time',
      icon: <Clock size={14} />,
      inputType: 'time',
    },
  ]
  const clientDetails: Array<{
    label: string
    value: string
    editValue: string
    copyValue: string
    field: EditableLeadField
    icon: React.ReactNode
    inputType?: LeadDetailInputType
    placeholder?: string
    isMono?: boolean
  }> = [
    {
      label: 'Email',
      value: lead.email || 'None',
      editValue: lead.email || '',
      copyValue: lead.email || '',
      field: 'email',
      icon: <Mail size={14} />,
      inputType: 'email',
      placeholder: 'client@email.com',
      isMono: true,
    },
    {
      label: 'Phone',
      value: lead.phone || 'None',
      editValue: lead.phone || '',
      copyValue: lead.phone || '',
      field: 'phone',
      icon: <Phone size={14} />,
      inputType: 'tel',
      placeholder: 'Phone number',
      isMono: true,
    },
  ]
  const internalDetails: Array<{ label: string; value: string; subtext?: string; isMono?: boolean }> = [
    { label: 'Created', value: new Date(lead.created_at).toLocaleString(), isMono: true },
    { label: 'Updated', value: new Date(lead.updated_at).toLocaleString(), isMono: true },
    { label: 'Flow Type', value: lead.flow.replaceAll('_', ' '), isMono: true },
    { label: 'Source Node', value: formatSourceLabel(lead), isMono: true },
    { label: 'Campaign Key', value: lead.campaign_key || 'None', isMono: true },
    { label: 'Page Path', value: lead.page_path || 'None', isMono: true },
    { label: 'Referrer', value: lead.referrer || 'None', isMono: true },
    { label: 'Marketing Opt In', value: lead.marketing_opt_in ? 'Yes' : 'No' },
    { label: 'User Agent', value: lead.user_agent || 'Not captured', isMono: true },
  ]
  const recommendedActions: Array<{
    icon: React.ReactNode
    label: string
    detail: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
  }> = []
  const pushRecommendedAction = (action: (typeof recommendedActions)[number]) => {
    recommendedActions.push(action)
  }

  if (lead.status === 'closed_lost') {
    pushRecommendedAction({
      icon: <ArrowLeft size={15} />,
      label: 'Re-open lead',
      detail: 'Bring this inquiry back into the pipeline',
      onClick: () => handleStatusChange('new'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'new') {
    pushRecommendedAction({
      icon: <Phone size={15} />,
      label: 'Mark contacted',
      detail: 'Log the first outreach touch',
      onClick: () => handleStatusChange('contacted'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'contacted' || lead.status === 'tour_requested') {
    pushRecommendedAction({
      icon: <Calendar size={15} />,
      label: 'Confirm tour scheduled',
      detail: 'Move lifecycle to tour confirmed',
      onClick: () => handleStatusChange('tour_confirmed'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'tour_confirmed') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: 'Mark proposal sent',
      detail: 'Use after sending pricing',
      onClick: () => handleStatusChange('proposal_sent'),
      disabled: updatingStatus,
      loading: updatingStatus,
    })
  } else if (lead.status === 'proposal_sent') {
    pushRecommendedAction({
      icon: <MessageSquare size={15} />,
      label: 'Follow up on proposal',
      detail: 'Nudge for a decision or objections',
      onClick: () => {
        setNoteType('call_log')
        scrollToSection('lead-activity')
      },
    })
  } else if (lead.status === 'booked') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: latestBooking ? (latestBooking.contract_status === 'signed' ? 'Review booking' : 'Send contract') : 'Create booking record',
      detail: latestBooking
        ? latestBooking.contract_status === 'signed'
          ? 'Contract is already signed'
          : 'Send the contract to keep momentum moving'
        : 'Create the booking record first',
      onClick: latestBooking
        ? latestBooking.contract_status === 'signed'
          ? () => scrollToSection('lead-booking')
          : () => handleSendContract(latestBooking.id)
        : openBookingModal,
    })
  }

  pushRecommendedAction({
    icon: <NotebookPen size={15} />,
    label: 'Log a quick call note',
    detail: 'Jump to the activity feed',
    onClick: () => {
      setNoteType('call_log')
      scrollToSection('lead-activity')
    },
  })

  pushRecommendedAction({
    icon: <ReceiptText size={15} />,
    label: 'Draft booking invoice',
    detail: 'Create deposit or event invoice',
    onClick: () => setIsInvoiceModalOpen(true),
  })

  if (lead.status !== 'booked' && lead.status !== 'closed_lost') {
    pushRecommendedAction({
      icon: <FileSignature size={15} />,
      label: 'Create booking record',
      detail: 'Add the event date and contract details',
      onClick: openBookingModal,
    })
  }

  const scrollToSection = (sectionId: string) => {
    const tabMap: Record<string, LeadDetailTab> = {
      'lead-overview': 'overview',
      'lead-activity': 'activity',
      'lead-tasks': 'tasks',
      'lead-booking': 'booking',
      'lead-billing': 'billing',
      'lead-documents': 'documents',
      'lead-messages': 'messages',
      'lead-notes': 'notes',
    }
    const nextTab = tabMap[sectionId] ?? 'overview'
    setActiveLeadTab(nextTab)
    if (nextTab === 'messages') {
      setActiveFeedTab('comms')
    }
    if (nextTab === 'notes') {
      setActiveFeedTab('notes')
    }
    if (nextTab === 'activity') {
      setActiveFeedTab('all')
    }
    if (nextTab === 'tasks') {
      setShowTaskTools(true)
    }
  }
  const quickNoteTemplates = [
    { label: 'Call recap', value: 'Call recap:\n- \nNext step:\n', type: 'call_log' as const },
    { label: 'Follow-up sent', value: 'Follow-up email sent:\n\n', type: 'email_log' as const },
    { label: 'Tour confirmed', value: 'Tour confirmed:\n\n', type: 'note' as const },
    { label: 'Proposal sent', value: 'Proposal sent:\n\n', type: 'email_log' as const },
  ]
  const activityEmptyTitle =
    activeFeedTab === 'notes'
      ? 'No note entries match this filter yet.'
      : activeFeedTab === 'comms'
        ? 'No calls or emails match this filter yet.'
        : activeFeedTab === 'system'
          ? 'No status updates match this filter yet.'
          : 'No activity has been logged yet.'
  const activityEmptyCopy =
    activeFeedTab === 'notes'
      ? 'Use the note box above to capture the first written follow-up or summary.'
      : activeFeedTab === 'comms'
        ? 'Add a call log, email note, or sync Zoho history to populate this view.'
        : activeFeedTab === 'system'
          ? 'Status changes will appear here automatically when the lead moves.'
          : 'Use the note box above to add the first update or wait for email history to sync.'

  const tabItems: Array<{ id: LeadDetailTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity', count: activityCounts.all },
    { id: 'tasks', label: 'Tasks', count: pendingTaskCount },
    { id: 'booking', label: 'Booking', count: sortedBookings.length },
    { id: 'billing', label: 'Billing', count: sortedInvoices.length },
    { id: 'documents', label: 'Documents', count: sortedBookings.length + sortedInvoices.length },
    { id: 'messages', label: 'Messages', count: activityCounts.comms },
    { id: 'notes', label: 'Notes', count: activityCounts.notes },
  ]


  return (
    <PortalPageFrame className="max-w-[1560px] !gap-0">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <Link href="/portal/leads" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]">
          <ArrowLeft size={13} /> Back to Leads & Clients
        </Link>
        <PortalStatusBadge status={lead.status} />
      </div>

      <section className="overflow-hidden rounded-t-2xl border border-b-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:p-6">
          <div className="flex min-w-0 gap-4">
            <div className="relative shrink-0">
              {lead.full_name.toLowerCase().includes('sophia martinez') ? (
                <div className="relative h-20 w-20 overflow-hidden rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 shadow-xl shadow-black/10">
                  <Image
                    src="/images/sophia-avatar.jpg"
                    alt={lead.full_name}
                    fill
                    priority
                    className="object-cover animate-[luxor-soft-enter_0.3s_ease-out]"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 font-serif text-2xl text-[#caa24c] shadow-xl shadow-black/10">
                  {getInitials(lead.full_name)}
                </div>
              )}
              <button
                type="button"
                className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[#caa24c] hover:bg-[#caa24c]/10 hover:text-[#f1d27a] transition-all duration-200 cursor-pointer shadow-md"
                title="Edit avatar"
              >
                <Pencil size={11} />
              </button>
            </div>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="truncate font-serif text-3xl font-semibold leading-tight text-[color:var(--portal-text)] sm:text-4xl">{lead.full_name}</h1>
                {isGrandOpeningLead ? <Sparkles size={16} className="shrink-0 text-[#caa24c]" /> : null}
                {lead.email && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleToggleMarketing}
                      disabled={togglingMarketing}
                      className="group relative flex h-[18px] w-[18px] shrink-0 select-none items-center justify-center focus:outline-none disabled:opacity-50 cursor-pointer"
                      title={isSubscribed ? "Remove from marketing list" : "Add to marketing list"}
                    >
                      <div className="relative h-[18px] w-[18px] shrink-0">
                        {/* Background outline star */}
                        <Star size={18} className="absolute inset-0 text-zinc-650 transition-colors group-hover:text-zinc-400" />
                        
                        {/* Animated liquid fill mask star */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 overflow-hidden transition-[height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" 
                          style={{ height: isSubscribed ? '18px' : '0px' }}
                        >
                          <Star 
                            size={18} 
                            className="absolute bottom-0 left-0 text-[#caa24c] fill-[#caa24c]" 
                            style={{ width: '18px', height: '18px' }} 
                          />
                        </div>
                      </div>
                    </button>
                    <AnimatePresence>
                      {marketingMessage && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 4 }}
                          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                          className={`text-[9px] font-black uppercase tracking-[0.18em] ${
                            marketingMessage === 'added' ? 'text-emerald-450' : 'text-zinc-550'
                          }`}
                        >
                          {marketingMessage === 'added' ? 'Added to marketing' : 'Removed from marketing'}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 text-xs font-semibold text-[color:var(--portal-muted)]">
                <span>{lead.event_type || 'Quinceañera'}</span>
                <span className="text-zinc-700 font-normal select-none">•</span>
                <span>{lead.target_date ? formatDisplayDate(lead.target_date) : 'Date TBD'}</span>
                <span className="text-zinc-700 font-normal select-none">•</span>
                <span>{lead.guest_count ? `${lead.guest_count} Guests` : 'Guest count open'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Captured via <span className="capitalize">{formatSourceLabel(lead)}</span> on {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {lead.email && (
              <a 
                href={`mailto:${lead.email}`} 
                className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/2"
              >
                <Mail size={13} /> Email Client
              </a>
            )}
            {lead.phone && (
              <div className="inline-flex items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:border-[#caa24c]/35 transition-colors overflow-hidden">
                <a 
                  href={`tel:${lead.phone}`} 
                  className="inline-flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] hover:bg-[#caa24c]/2"
                >
                  <Phone size={13} /> Call Client
                </a>
                <span className="h-4 w-px bg-[color:var(--portal-border)]" />
                <button 
                  type="button" 
                  className="px-2 py-2 text-zinc-500 hover:text-white transition-colors cursor-pointer" 
                  aria-label="More call options"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            )}
            <div className="inline-flex items-center rounded-lg bg-[#b98a3e] hover:bg-[#a8792f] shadow-lg shadow-[#b98a3e]/20 transition-all active:scale-95 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsInvoiceModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white cursor-pointer"
              >
                <Plus size={13} /> Create Invoice
              </button>
              <span className="h-4 w-px bg-white/20" />
              <button 
                type="button" 
                className="px-2.5 py-2 text-white/80 hover:text-white transition-colors cursor-pointer" 
                aria-label="More invoice options"
              >
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-[color:var(--portal-border)] px-5 py-4 lg:px-6">
          <LeadLifecycleRail
            lead={lead}
            bookings={bookings}
            latestBooking={latestBooking}
            latestInvoice={latestInvoice}
            isSaving={updatingStatus}
            activeStageId={selectedStageOverride || activeStage}
            onStepClick={(stageId) => setSelectedStageOverride(stageId)}
          />
        </div>
      </section>

      <div
        className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] shadow-lg shadow-black/10 sm:-top-6 lg:-top-8"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--portal-bg) 97%, transparent)',
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
        }}
      >
        <div className="portal-scrollbar overflow-x-auto bg-transparent px-4">
          <div className="relative flex min-w-max gap-5">
            <span
              className="absolute bottom-0 h-0.5 rounded-full bg-[#caa24c] transition-[left,width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{ left: tabIndicator.left, width: tabIndicator.width }}
            />
            {tabItems.map((item) => {
              const isActive = activeLeadTab === item.id
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    tabButtonRefs.current[item.id] = node
                  }}
                  type="button"
                  onClick={() => {
                    setActiveLeadTab(item.id)
                    if (item.id === 'messages') setActiveFeedTab('comms')
                    if (item.id === 'notes') setActiveFeedTab('notes')
                    if (item.id === 'activity') setActiveFeedTab('all')
                    if (item.id === 'tasks') setShowTaskTools(true)
                  }}
                  className={`relative inline-flex shrink-0 items-center gap-2 px-0 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                    isActive
                      ? 'text-[#a8792f]'
                      : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                  }`}
                >
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] ${isActive ? 'bg-[#caa24c]/12 text-[#a8792f]' : 'bg-black/5 text-[color:var(--portal-muted)]'}`}>
                      {item.count}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeLeadTab === 'overview' ? (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12 sm:pb-16">
          {/* Left Column (Columns 1 & 2): Dossier main sections */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Stage-specific Content Router */}
            {(() => {
              const currentStage = selectedStageOverride || activeStage
              
              if (currentStage === 'inquiry') {
                return (
                  <>
                    {/* Next Step & Client Details Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Next Step */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-xl shadow-black/10 flex items-start gap-4 luxor-soft-enter">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#a8792f] border border-[#caa24c]/20">
                          <ClipboardCheck size={20} />
                        </span>
                        <div className="flex-1 flex flex-col justify-between min-h-[160px]">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Next Step</p>
                            <h2 className="mt-2 text-sm font-bold text-[color:var(--portal-text)] leading-snug">{nextBestMove.title}</h2>
                            <p className="mt-1 text-xs leading-relaxed text-[color:var(--portal-muted)]">{nextBestMove.detail}</p>
                            
                            {/* Next Step Stage-dependent Context Box */}
                            <div className="mt-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-[11px] space-y-2 text-left w-full">
                              <div className="flex justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Source</span>
                                <span className="font-bold text-[color:var(--portal-text)] capitalize">{formatSourceLabel(lead)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Inquiry Date</span>
                                <span className="font-bold text-[color:var(--portal-text)]">{formatDisplayDate(lead.created_at)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Lead Score</span>
                                <span className="font-bold text-emerald-400">High / Hot Lead</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-col items-start">
                            {recommendedActions[0] ? (
                              <button
                                type="button"
                                onClick={recommendedActions[0].onClick}
                                disabled={recommendedActions[0].disabled}
                                className="py-2 px-5 rounded-lg bg-[#b98a3e] hover:bg-[#a8792f] text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-[#b98a3e]/10 transition-all cursor-pointer active:scale-95 disabled:opacity-40"
                              >
                                {updatingStatus ? 'Saving...' : recommendedActions[0].label}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => scrollToSection('lead-booking')}
                              className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                            >
                              Preview Contract &rarr;
                            </button>
                          </div>
                        </div>
                      </section>

                      {/* Client Details */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Client Details</p>
                          <User size={18} className="text-[#a8792f] opacity-80" />
                        </div>
                        <div className="grid gap-1">
                          {clientDetails.map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={item.copyValue}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={(value) => handleLeadFieldUpdate(item.field, value)}
                            />
                          ))}
                          
                          {/* Editable Address */}
                          <DetailItem
                            icon={<MapPin size={14} />}
                            label="Address"
                            value={lead.metadata?.address ? String(lead.metadata.address) : 'San Antonio, TX'}
                            editValue={lead.metadata?.address ? String(lead.metadata.address) : 'San Antonio, TX'}
                            copyValue={lead.metadata?.address ? String(lead.metadata.address) : 'San Antonio, TX'}
                            inputType="text"
                            placeholder="San Antonio, TX"
                            isSaving={savingLeadField === 'address'}
                            onCommit={(value) => handleLeadFieldUpdate('address', value)}
                          />

                          <div className="flex items-center gap-3 py-3 px-3 -mx-3 rounded-xl border border-transparent">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f]">
                              <Sparkles size={14} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Source</p>
                              <p className="mt-1 text-sm font-bold capitalize text-[color:var(--portal-text)]">{formatSourceLabel(lead)}</p>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>

                    {/* Event Details */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Details</p>
                        <span className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
                          Edit inline
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        <div className="space-y-1">
                          {eventDetails.slice(0, 3).map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={item.copyValue}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={(value) => handleLeadFieldUpdate(item.field, value)}
                            />
                          ))}
                        </div>
                        <div className="space-y-1">
                          {eventDetails.slice(3).map((item) => (
                            <DetailItem
                              key={item.label}
                              icon={item.icon}
                              label={item.label}
                              value={item.value}
                              editValue={item.editValue}
                              copyValue={item.copyValue}
                              inputType={item.inputType}
                              placeholder={item.placeholder}
                              isMono={item.isMono}
                              isSaving={savingLeadField === item.field}
                              onCommit={(value) => handleLeadFieldUpdate(item.field, value)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Internal Metadata */}
                      <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">Internal metadata</p>
                            <p className="mt-1 text-xs text-zinc-650">Source, campaign, and referrer fields.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowInternalSignals((current) => !current)}
                            className="inline-flex items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#a8792f] cursor-pointer"
                          >
                            {showInternalSignals ? 'Hide' : 'Show'}
                          </button>
                        </div>
                        {showInternalSignals ? (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {internalDetails.map((item) => (
                              <DetailItem
                                key={item.label}
                                label={item.label}
                                value={item.value}
                                copyValue={item.value === 'None' || item.value === 'Not captured' ? '' : item.value}
                                isMono={item.isMono}
                                subtext={item.subtext}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {/* Recent Activity */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Recent Activity</p>
                        <button
                          type="button"
                          onClick={() => setActiveLeadTab('activity')}
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                        >
                          View all activity &rarr;
                        </button>
                      </div>

                      <div className="space-y-4">
                        {lead.full_name.toLowerCase().includes('sophia martinez') && allActivityEntries.length === 0 ? (
                          <>
                            <div className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                                  <FileSignature size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white leading-tight">
                                    Contract created <span className="text-zinc-500 font-medium">by You</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Today, 10:45 AM</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                                  <CheckCircle2 size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white leading-tight">
                                    Proposal accepted <span className="text-zinc-500 font-medium">by Sophia Martinez</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Jul 9, 2026</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                                  <Send size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white leading-tight">
                                    Proposal sent <span className="text-zinc-500 font-medium">by You</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Jul 9, 2026</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                                  <CheckCircle2 size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white leading-tight">
                                    Tour completed <span className="text-zinc-500 font-medium">by You</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Jul 8, 2026</span>
                            </div>
                            <div className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-500">
                                  <Mail size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white leading-tight">
                                    Inquiry received <span className="text-zinc-500 font-medium">via Google</span>
                                  </p>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Jul 5, 2026</span>
                            </div>
                          </>
                        ) : allActivityEntries.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic py-4">No recent activity logged yet.</p>
                        ) : (
                          allActivityEntries.slice(0, 5).map((entry) => {
                            const isEmail = entry.kind === 'email'
                            return (
                              <div key={entry.id} className="flex items-center justify-between py-1.5 border-b border-zinc-100/5 dark:border-zinc-850/50 last:border-0">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
                                    isEmail 
                                      ? 'bg-purple-500/10 text-purple-400' 
                                      : entry.note.note_type === 'call_log'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : entry.note.note_type === 'email_log'
                                      ? 'bg-purple-500/10 text-purple-400'
                                      : 'bg-zinc-500/10 text-zinc-500'
                                  }`}>
                                    {isEmail ? (
                                      <Mail size={13} />
                                    ) : entry.note.note_type === 'call_log' ? (
                                      <Phone size={13} />
                                    ) : (
                                      <FileText size={13} />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white leading-tight truncate">
                                      {isEmail ? entry.email.subject : entry.note.content.substring(0, 45)}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-2">
                                  {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </section>

                    {/* RSVP / Inquiry Message */}
                    <div className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl luxor-soft-enter" id="lead-message">
                      <h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                        {isGrandOpeningLead ? 'RSVP Notes Payload' : 'Inquiry Message Payload'}
                      </h4>
                      <p className="text-xs leading-relaxed text-zinc-300 font-medium italic">
                        &ldquo;{lead.message || 'No additional message was submitted.'}&rdquo;
                      </p>
                    </div>

                    {/* Concierge AI session replay */}
                    {chatMessages.length > 0 && (
                      <div className="nodal-void-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl luxor-soft-enter">
                        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-5 py-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--portal-muted)]">Concierge AI Chat Session Replay</h4>
                          <span className="rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#a8792f]">Elena AI</span>
                        </div>
                        <div className="space-y-4 bg-[color:var(--portal-card)] p-4 max-h-[260px] overflow-y-auto portal-scrollbar">
                          {chatMessages.map((msg, index) => {
                            const isUser = msg.role === 'user'
                            return (
                              <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs font-medium leading-relaxed shadow-sm ${
                                  isUser
                                    ? 'border border-[#caa24c]/25 bg-[#caa24c]/10 text-[color:var(--portal-text)]'
                                    : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'
                                }`}>
                                  <div className={`mb-1 text-[8px] font-bold uppercase tracking-widest ${isUser ? 'text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}>
                                    {isUser ? 'Client' : 'Elena AI'}
                                  </div>
                                  {msg.content}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )
              }
              
              if (currentStage === 'tour') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Tour</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Schedule, manage and track your venue tour.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Tour Checklist
                      </button>
                    </div>
                    
                    {/* Row 1: Tour Details & Tour Attendance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Tour Details */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Tour Details</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Tour Date</span>
                              <span className="font-bold text-white">{lead.preferred_tour_date ? formatDisplayDate(lead.preferred_tour_date) : 'Jul 6, 2026'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Tour Time</span>
                              <span className="font-bold text-white">{lead.preferred_tour_time || '3:00 PM'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Assigned To</span>
                              <span className="font-bold text-white">Arianna Patterson</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Location</span>
                              <span className="font-bold text-white">Luxor at Las Palmas Events</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Status</span>
                              <span className="rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">Completed</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c]/10 border border-[#caa24c]/20 text-[9px] font-black uppercase text-[#a8792f] hover:bg-[#caa24c]/15 transition-colors cursor-pointer">Mark Complete</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Reschedule</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Send Follow Up</button>
                        </div>
                      </section>
                      
                      {/* Tour Attendance & Notes */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        {isEditingTourAttendance ? (
                          <div className="space-y-4 text-left">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#caa24c] mb-3">Edit Tour Attendance</p>
                              
                              <div className="space-y-3.5">
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Primary Attendee</label>
                                  <input
                                    type="text"
                                    disabled
                                    value={lead.full_name}
                                    className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-zinc-500 cursor-not-allowed outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Guests / Additional Attendees</label>
                                  <input
                                    type="text"
                                    value={tourGuests}
                                    onChange={(e) => setTourGuests(e.target.value)}
                                    placeholder="e.g. Miguel Martinez"
                                    className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Tour Notes / Feedback</label>
                                  <textarea
                                    value={tourNotes}
                                    onChange={(e) => setTourNotes(e.target.value)}
                                    rows={4}
                                    placeholder="Add any feedback or discussion notes from the tour..."
                                    className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none resize-none"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2 border-t border-[color:var(--portal-border)]">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingTourAttendance(false)
                                  setTourGuests(String(lead.metadata?.tourGuests || 'Miguel Martinez'))
                                  setTourNotes(String(lead.metadata?.tourNotes || 'Client loved the modern chandelier and open bar space. Interested in black & gold theme. Mentioned needing help with décor and photography.'))
                                }}
                                className="px-3 py-1.5 rounded border border-zinc-800 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveTourAttendance}
                                disabled={savingTourAttendance}
                                className="px-4 py-1.5 rounded bg-[#b98a3e] text-[10px] font-black uppercase text-white hover:bg-[#a8792f] transition-all cursor-pointer"
                              >
                                {savingTourAttendance ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Tour Attendance</p>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#caa24c]" />
                                  <span className="font-bold text-white">{lead.full_name} <span className="text-zinc-500 font-medium">(Primary)</span></span>
                                </div>
                                {tourGuests ? (
                                  <div className="flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                                    <span className="font-bold text-zinc-300">{tourGuests} <span className="text-zinc-500 font-medium">(Guest)</span></span>
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => setIsEditingTourAttendance(true)}
                                  className="text-[10px] text-[#caa24c] hover:underline cursor-pointer font-bold text-left block"
                                >
                                  + Edit Attendance
                                </button>
                              </div>
                            </div>
                            <div className="border-t border-[color:var(--portal-border)] pt-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Tour Notes</p>
                              <p className="text-xs text-zinc-400 italic leading-relaxed">
                                &ldquo;{tourNotes}&rdquo;
                              </p>
                              <button
                                type="button"
                                onClick={() => setIsEditingTourAttendance(true)}
                                className="text-[10px] text-[#caa24c] mt-2 hover:underline cursor-pointer font-bold text-left block"
                              >
                                Edit Notes
                              </button>
                            </div>
                          </>
                        )}
                      </section>
                    </div>
                    
                    {/* Photos & Documents Shared */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-4">Photos & Documents Shared</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-850">
                          <img src="/images/dining-hall/dining-hall-wedding.jpg" alt="Wedding layout" className="object-cover w-full h-full" />
                        </div>
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-850">
                          <img src="/images/dining-hall/dining-hall-wedding-angle.jpg" alt="Dining hall angle" className="object-cover w-full h-full" />
                        </div>
                        <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-zinc-850">
                          <img src="/images/dining-hall/dining-hall-wedding-candid.jpg" alt="Dining hall candid" className="object-cover w-full h-full" />
                        </div>
                        <div className="aspect-[4/3] rounded-lg border border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-600 hover:text-white cursor-pointer hover:border-zinc-500 transition-colors">
                          <Plus size={16} />
                          <span className="text-[9px] font-bold uppercase mt-1">Add Photos</span>
                        </div>
                      </div>
                    </section>

                    {/* Pro Tip Banner */}
                    <div className="rounded-xl border border-[#caa24c]/10 bg-[#caa24c]/5 p-3.5 text-xs text-[#caa24c]/90 flex items-start gap-3 luxor-soft-enter">
                      <Sparkles size={16} className="text-[#caa24c] shrink-0 mt-0.5" />
                      <p>
                        <strong className="font-bold uppercase tracking-wider text-[10px] mr-1">Pro Tip:</strong> 
                        Keep your tour notes detailed. It helps personalize proposals and build stronger client relationships!
                      </p>
                    </div>
                  </>
                )
              }
              
              if (currentStage === 'planning') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Planning</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">All event details, preferences, and logistics in one place.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Planning Checklist
                      </button>
                    </div>

                    {/* Sub-tabs for Planning */}
                    <div className="flex gap-4 border-b border-[color:var(--portal-border)] text-xs overflow-x-auto pb-1 portal-scrollbar">
                      {(['details', 'vendors', 'fb', 'decor', 'timeline', 'files'] as const).map((tab) => {
                        const labels = {
                          details: 'Event Details',
                          vendors: 'Vendors',
                          fb: 'Food & Beverage',
                          decor: 'Décor & Design',
                          timeline: 'Timeline',
                          files: 'Notes & Files',
                        }
                        const isCurrent = planningSubTab === tab
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setPlanningSubTab(tab)}
                            className={`py-2 px-1 font-bold uppercase tracking-wider border-b-2 transition-colors shrink-0 cursor-pointer ${
                              isCurrent ? 'border-[#caa24c] text-[#caa24c]' : 'border-transparent text-zinc-500 hover:text-white'
                            }`}
                          >
                            {labels[tab]}
                          </button>
                        )
                      })}
                    </div>

                    {/* Planning sub-tab contents */}
                    {planningSubTab === 'details' && (
                      <div className="space-y-6 luxor-soft-enter">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Event Information */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Information</p>
                              <span className="text-[10px] font-bold uppercase text-[#caa24c] cursor-pointer">Edit</span>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Date</span>
                                <span className="font-bold text-white">{lead.target_date ? formatDisplayDate(lead.target_date) : 'August 30, 2026'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Time</span>
                                <span className="font-bold text-white">6:00 PM – 11:00 PM</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Event Type</span>
                                <span className="font-bold text-white">{lead.event_type || 'Anniversary Party'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Location</span>
                                <span className="font-bold text-white">Luxor at Las Palmas Events</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Guest Count</span>
                                <span className="font-bold text-white">{lead.guest_count || 80} Guests (Estimated)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Theme / Style</span>
                                <span className="font-bold text-white">Black & Gold Modern Elegance</span>
                              </div>
                            </div>
                          </section>

                          {/* Client Preferences */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Client Preferences</p>
                              <span className="text-[10px] font-bold uppercase text-[#caa24c] cursor-pointer">Edit</span>
                            </div>
                            <div className="space-y-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Color Palette</span>
                                <div className="flex gap-1.5">
                                  <span className="h-4.5 w-4.5 rounded-full bg-black border border-zinc-800" />
                                  <span className="h-4.5 w-4.5 rounded-full bg-[#caa24c]" />
                                  <span className="h-4.5 w-4.5 rounded-full bg-[#f1d27a]" />
                                  <span className="h-4.5 w-4.5 rounded-full bg-white border border-zinc-800" />
                                </div>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Music Style</span>
                                <span className="font-bold text-white">R&B, 90s, Top 40</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Lighting</span>
                                <span className="font-bold text-white">Warm & Dimmed</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Special Requests</span>
                                <span className="font-bold text-white">None at this time</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Space & Layout */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Space & Layout</p>
                              <span className="text-[10px] font-bold uppercase text-[#caa24c] cursor-pointer">Edit</span>
                            </div>
                            <div className="grid grid-cols-5 gap-4">
                              <div className="col-span-2 border border-zinc-850 rounded bg-black/45 p-2 flex items-center justify-center flex-col text-zinc-600">
                                <Sparkles size={20} />
                                <span className="text-[8px] font-bold uppercase mt-1 text-center">Floor Plan Layout</span>
                              </div>
                              <div className="col-span-3 space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Head Table</span>
                                  <span className="font-bold text-white">Yes</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Dance Floor</span>
                                  <span className="font-bold text-white">Yes</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Stage</span>
                                  <span className="font-bold text-white">No</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[10px] uppercase font-bold text-zinc-500">Other Areas</span>
                                  <span className="font-bold text-white">Open Bar, Lounge</span>
                                </div>
                              </div>
                            </div>
                          </section>

                          {/* Decor Overview */}
                          <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Decor Overview</p>
                              <span className="text-[10px] font-bold uppercase text-[#caa24c] cursor-pointer">Edit</span>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Selected Package</span>
                                <span className="font-bold text-white">Luxury Package</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Décor Style</span>
                                <span className="font-bold text-white">Black & Gold Modern</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Centerpieces</span>
                                <span className="font-bold text-white">Tall Gold Stands</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-[10px] uppercase font-bold text-zinc-500">Linens</span>
                                <span className="font-bold text-white">Black</span>
                              </div>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] uppercase font-bold text-zinc-500 mt-0.5">Additional Notes</span>
                                <span className="font-bold text-white text-right max-w-[60%]">Client loves the modern chandelier and open bar.</span>
                              </div>
                            </div>
                          </section>
                        </div>

                        {/* Planning Checklist Summary */}
                        <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-4">Planning Checklist Progress</p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                              { label: 'Event Details', val: 'Completed', color: 'text-emerald-400' },
                              { label: 'Vendors', val: '0/5 Completed', color: 'text-zinc-500' },
                              { label: 'Food & Beverage', val: '0/4 Completed', color: 'text-zinc-500' },
                              { label: 'Décor & Design', val: '0/4 Completed', color: 'text-zinc-500' },
                              { label: 'Timeline', val: '0/3 Completed', color: 'text-zinc-500' },
                            ].map((item, idx) => (
                              <div key={idx} className="p-3 rounded-xl border border-zinc-900 bg-zinc-950/30 text-center space-y-1">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{item.label}</p>
                                <p className={`text-xs font-black uppercase ${item.color}`}>{item.val}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {planningSubTab !== 'details' && (
                      <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center text-zinc-500 space-y-3 luxor-soft-enter">
                        <Sparkles size={24} className="mx-auto text-zinc-700" />
                        <p className="text-xs uppercase font-bold tracking-widest">Section Coming Soon</p>
                        <p className="text-xs leading-relaxed max-w-sm mx-auto">
                          This sub-tab section is currently under development to hold your detailed vendors, design tools, and timelines.
                        </p>
                      </div>
                    )}
                  </>
                )
              }
              
              if (currentStage === 'proposal') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Proposal</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Create, customize, and track your custom proposals.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Proposal Builder
                      </button>
                    </div>

                    {/* Proposal Details & Proposal Items Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Proposal Details */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Proposal Summary</p>
                            <span className="text-[10px] font-bold uppercase text-[#caa24c] cursor-pointer">Edit Details</span>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Package Option</span>
                              <span className="font-bold text-white">{lead.package_interest || 'Luxury Package'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Est. Total Amount</span>
                              <span className="font-bold text-[#caa24c]">$12,500</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Sent Date</span>
                              <span className="font-bold text-white">July 9, 2026</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Expiration Date</span>
                              <span className="font-bold text-white">July 23, 2026</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Viewed by Client</span>
                              <span className="font-bold text-emerald-400">Yes (July 10, 2026)</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">Awaiting Signature</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c]/10 border border-[#caa24c]/20 text-[9px] font-black uppercase text-[#a8792f] hover:bg-[#caa24c]/15 transition-colors cursor-pointer">Edit Proposal</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Duplicate</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Convert to Contract</button>
                        </div>
                      </section>

                      {/* Proposal Items & Packages */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Line Items Breakdown</p>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <span className="text-zinc-400">Venue Rental Fee</span>
                              <span className="font-mono font-bold text-white">$2,500</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <span className="text-zinc-400">Catering & Dinner Service</span>
                              <span className="font-mono font-bold text-white">$6,000</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <span className="text-zinc-400">Bar Package (Open Bar)</span>
                              <span className="font-mono font-bold text-white">$2,500</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <span className="text-zinc-400">Coordination & Design Fee</span>
                              <span className="font-mono font-bold text-white">$1,500</span>
                            </div>
                            <div className="flex justify-between py-1.5 pt-2">
                              <span className="font-bold text-white">Estimated Total</span>
                              <span className="font-mono font-bold text-[#caa24c] text-sm">$12,500</span>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'contract') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Contract</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Generate, sign, and manage legal agreements.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Contract Template
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Contract Status */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Agreement Status</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Document Type</span>
                              <span className="font-bold text-white">Venue Rental Contract</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">Waiting for signature</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Sent Date</span>
                              <span className="font-bold text-white">July 9, 2026</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Signed Date</span>
                              <span className="font-bold text-zinc-500">Pending Client Signature</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Signers</span>
                              <span className="font-bold text-white">Sophia Martinez, Venue Manager</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Send Contract</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Remind Client</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-[#caa24c]/20 bg-[#caa24c]/5 text-[9px] font-black uppercase text-[#caa24c] hover:bg-[#caa24c]/10 transition-colors cursor-pointer">Download PDF</button>
                        </div>
                      </section>

                      {/* Signature History */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Signature Timeline</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex items-center gap-3">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Check size={10} /></span>
                              <div>
                                <p className="font-bold text-white">Draft created by Venue Manager</p>
                                <p className="text-[9px] text-zinc-500">July 9, 2026 at 10:45 AM</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Check size={10} /></span>
                              <div>
                                <p className="font-bold text-white">Contract sent to Sophia Martinez</p>
                                <p className="text-[9px] text-zinc-500">July 9, 2026 at 10:48 AM</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 animate-pulse"><Circle size={4} className="fill-current" /></span>
                              <div>
                                <p className="font-bold text-white">Awaiting client signature</p>
                                <p className="text-[9px] text-zinc-500">Emailed to sophia.m@example.com</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'deposit') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Deposit</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Track initial deposit invoices and payment schedules.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        View Invoice
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Deposit Summary */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Deposit Invoice</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Invoice Number</span>
                              <span className="font-bold text-white">INV-2026-001</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Deposit Due Date</span>
                              <span className="font-bold text-white">July 16, 2026</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Deposit Amount</span>
                              <span className="font-bold text-[#caa24c] font-mono">$1,000</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Paid Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">Pending</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Remaining Balance</span>
                              <span className="font-bold text-white font-mono">$11,500</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Send Invoice</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Record Payment</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Refund</button>
                        </div>
                      </section>

                      {/* Payment Schedule */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Payment Schedule</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex justify-between py-1 border-b border-zinc-850">
                              <div>
                                <p className="font-bold text-white">1. Initial Security Deposit</p>
                                <p className="text-[9px] text-zinc-500">Due July 16, 2026</p>
                              </div>
                              <span className="font-mono font-bold text-[#caa24c]">$1,000</span>
                            </div>
                            <div className="flex justify-between py-1">
                              <div>
                                <p className="font-bold text-zinc-400">2. Event Rental Balance</p>
                                <p className="text-[9px] text-zinc-500">Due July 31, 2026</p>
                              </div>
                              <span className="font-mono font-bold text-zinc-400">$11,500</span>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'final_payment') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Final Payment</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Track event balances and final payment settlements.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        View Balance
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Final Payment Status */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Payment Summary</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Remaining Balance</span>
                              <span className="font-bold text-[#caa24c] font-mono">$11,500</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Due Date</span>
                              <span className="font-bold text-white">July 31, 2026</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Late Status</span>
                              <span className="font-bold text-emerald-400">On Time</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Invoice Ref</span>
                              <span className="font-bold text-white">INV-2026-001</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Payment Status</span>
                              <span className="rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold uppercase">Pending</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2 pt-2 border-t border-[color:var(--portal-border)]">
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded bg-[#caa24c] text-[9px] font-black uppercase text-white hover:bg-[#a8792f] transition-colors cursor-pointer">Collect Final Payment</button>
                          <button type="button" className="flex-1 min-w-[80px] py-1.5 rounded border border-zinc-850 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">Send Reminder</button>
                        </div>
                      </section>

                      {/* Payment History */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-3">Transaction History</p>
                          <div className="space-y-3 text-xs">
                            <div className="flex justify-between items-center py-1.5 border-b border-zinc-850">
                              <div>
                                <p className="font-bold text-white">Initial Security Deposit</p>
                                <p className="text-[9px] text-zinc-500">Paid July 12, 2026</p>
                              </div>
                              <span className="font-mono font-bold text-emerald-400">+$1,000 Paid</span>
                            </div>
                            <div className="flex justify-between items-center py-1.5">
                              <div>
                                <p className="font-bold text-zinc-400">Event Rental Balance</p>
                                <p className="text-[9px] text-zinc-500">Due July 31, 2026</p>
                              </div>
                              <span className="font-mono font-bold text-zinc-400">$11,500 Pending</span>
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'event') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Event Day</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Checklists, access details, and operations for event execution.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Run of Show
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Coordinator & Contacts */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 flex flex-col justify-between min-h-[260px] luxor-soft-enter">
                        <div>
                          <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">On-Site operations</p>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Head Contact</span>
                              <span className="font-bold text-white">{lead.full_name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Assigned Coordinator</span>
                              <span className="font-bold text-white">Arianna Patterson</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Gate Access Code</span>
                              <span className="font-mono font-bold text-[#caa24c]">*4920#</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Backdoor Code</span>
                              <span className="font-mono font-bold text-white">1204</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] uppercase font-bold text-zinc-500">Emergency Line</span>
                              <span className="font-bold text-white">(210) 555-0199</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Event Day Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Operation Milestones</p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: 'Coordinator on-site briefing (2:00 PM)', done: true },
                            { label: 'Caterer & DJ setup inspection (3:30 PM)', done: true },
                            { label: 'Room decoration & table setup sign-off (4:30 PM)', done: false },
                            { label: 'Main doors & gate open to guests (5:30 PM)', done: false },
                            { label: 'Reception & dinner service starts (7:00 PM)', done: false },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-zinc-850 text-zinc-700'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-zinc-500 line-through' : 'text-white'}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              if (currentStage === 'closing') {
                return (
                  <>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                      <div>
                        <h3 className="text-base font-black uppercase tracking-wider text-white">Closing</h3>
                        <p className="text-xs text-[color:var(--portal-muted)]">Post-event wrap-ups, reviews, and security deposits.</p>
                      </div>
                      <button type="button" className="rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#caa24c] cursor-pointer">
                        Complete Lead
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Post-Event Checklist */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-3 luxor-soft-enter">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Wrap-Up Checklist</p>
                        <div className="space-y-2 text-xs">
                          {[
                            { label: 'Thank-you email sent', done: true },
                            { label: 'Review request sent (Google, WeddingWire)', done: true },
                            { label: 'Photo/video assets requested', done: false },
                            { label: 'Security deposit return authorized', done: false },
                            { label: 'Damage report & final inspection cleared', done: false },
                            { label: 'Anniversary reminder automation active', done: true },
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 py-0.5">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                item.done ? 'border-[#caa24c] bg-[#caa24c] text-white' : 'border-zinc-850 text-zinc-700'
                              }`}>
                                {item.done && <Check size={8} className="stroke-[3]" />}
                              </span>
                              <span className={item.done ? 'text-zinc-500 line-through' : 'text-white'}>{item.label}</span>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Feedback & Referrals */}
                      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 space-y-4 luxor-soft-enter">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-2">Anniversary Reminder</p>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Anniversary reminder is set for <strong>August 30, 2027</strong>. A marketing flow will trigger automatically 14 days prior.
                          </p>
                        </div>
                      </section>
                    </div>
                  </>
                )
              }

              // Fallback cards for other stages
              return (
                <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-8 text-center text-zinc-500 space-y-3 luxor-soft-enter">
                  <Sparkles size={24} className="mx-auto text-zinc-800" />
                  <p className="text-xs uppercase font-black tracking-widest text-[#caa24c] capitalize">{currentStage} Stage Dashboard</p>
                  <p className="text-xs leading-relaxed max-w-md mx-auto">
                    Welcome to the <strong>{currentStage.toUpperCase()}</strong> stage. This dossier dashboard automatically adapts to show details, invoices, and documents matching this phase.
                  </p>
                  <div className="pt-4 flex justify-center gap-3">
                    <button type="button" onClick={() => setSelectedStageOverride(null)} className="px-4 py-2 rounded-lg border border-zinc-800 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer">
                      Reset Preview to Active Stage
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Right Column: Sticky actions & summary */}
          <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
            {(() => {
              const currentStage = selectedStageOverride || activeStage
              
              if (currentStage === 'inquiry') {
                return (
                  <>
                    {/* Recommended Actions */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Recommended Actions</p>
                          <p className="mt-1 text-[10px] text-zinc-650 font-medium">Top priority first</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {recommendedActions.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic py-4">No recommended actions at this stage.</p>
                        ) : (
                          recommendedActions.map((action, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={action.onClick}
                              disabled={action.disabled}
                              className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] hover:bg-[#caa24c]/5 hover:border-[#caa24c]/20 transition-all duration-200 group cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black text-[#caa24c] border border-zinc-800">
                                  {action.icon}
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-white group-hover:text-[#caa24c] transition-colors">{action.label}</p>
                                  <p className="text-[10px] text-zinc-500 mt-0.5">{action.detail}</p>
                                </div>
                              </div>
                              <span className="text-zinc-500 group-hover:text-white transition-colors">
                                <ChevronRight size={14} />
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      
                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveLeadTab('tasks')}
                          className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                        >
                          View all tasks &rarr;
                        </button>
                      </div>
                    </section>

                    {/* Event Summary */}
                    <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Summary</p>
                        {!isEditingSummary ? (
                          <button 
                            type="button"
                            onClick={() => setIsEditingSummary(true)}
                            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer animate-[luxor-soft-enter_0.2s_ease-out]"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                        ) : null}
                      </div>

                      {isEditingSummary ? (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Venue</label>
                            <select
                              value={summaryVenue}
                              onChange={(e) => setSummaryVenue(e.target.value)}
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            >
                              <option value="Luxor Main Hall">Luxor Main Hall</option>
                              <option value="Luxor Grand Pavilion">Luxor Grand Pavilion</option>
                              <option value="Elena Garden Plaza">Elena Garden Pavilion</option>
                              <option value="Palmas Terrace Suite">Palmas Terrace Suite</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Start Time</label>
                              <input
                                type="time"
                                value={summaryStartTime}
                                onChange={(e) => setSummaryStartTime(e.target.value)}
                                className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">End Time</label>
                              <input
                                type="time"
                                value={summaryEndTime}
                                onChange={(e) => setSummaryEndTime(e.target.value)}
                                className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Setup Time</label>
                            <input
                              type="text"
                              value={summarySetupTime}
                              onChange={(e) => setSummarySetupTime(e.target.value)}
                              placeholder="e.g. 3:00 PM"
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-zinc-500 mb-1">Breakdown Time</label>
                            <input
                              type="text"
                              value={summaryBreakdownTime}
                              onChange={(e) => setSummaryBreakdownTime(e.target.value)}
                              placeholder="e.g. 11:00 PM – 12:30 AM"
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-xs text-[color:var(--portal-text)] focus:border-[#caa24c]/40 outline-none"
                            />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button
                              type="button"
                              onClick={() => setIsEditingSummary(false)}
                              className="px-3 py-1.5 rounded border border-zinc-850 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSummary}
                              disabled={savingSummary}
                              className="px-4 py-1.5 rounded bg-[#b98a3e] text-[10px] font-black uppercase text-white hover:bg-[#a8792f] transition-all cursor-pointer"
                            >
                              {savingSummary ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Venue</span>
                            <span className="text-xs font-bold text-white">{summaryVenue}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Time</span>
                            <span className="text-xs font-bold text-white">
                              {summaryStartTime && summaryEndTime ? `${formatTimeString(summaryStartTime)} – ${formatTimeString(summaryEndTime)}` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Setup Time</span>
                            <span className="text-xs font-bold text-white">{summarySetupTime}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-zinc-100/5 dark:border-zinc-850/30">
                            <span className="text-[10px] uppercase font-bold text-zinc-500">Breakdown Time</span>
                            <span className="text-xs font-bold text-white">{summaryBreakdownTime}</span>
                          </div>
                        </div>
                      )}
                    </section>
                  </>
                )
              }
              
              // For all stages other than inquiry, render the layout from the sister's mockup
              const clientSummaryEmail = lead.email || 'sophia.m@example.com'
              const clientSummaryPhone = lead.phone || '214-555-4321'
              const clientSummaryAddress = lead.metadata?.address ? String(lead.metadata.address) : 'San Antonio, TX'
              const clientSummaryGuests = lead.guest_count ? `${lead.guest_count} Guests (Estimated)` : '80 Guests (Estimated)'
              const clientSummaryEventType = lead.event_type || 'Anniversary Party'
              
              let nextStepTitle = 'Send Proposal'
              let nextStepDetail = 'Create and send custom proposal'
              let nextStepButton = 'Create Proposal'
              
              if (currentStage === 'proposal') {
                nextStepTitle = 'Convert to Contract'
                nextStepDetail = 'Draft and send legal agreement'
                nextStepButton = 'Create Contract'
              } else if (currentStage === 'contract') {
                nextStepTitle = 'Collect Deposit'
                nextStepDetail = 'Send deposit invoice to client'
                nextStepButton = 'Collect Deposit'
              } else if (currentStage === 'deposit') {
                nextStepTitle = 'Start Planning'
                nextStepDetail = 'Open event planning checklist'
                nextStepButton = 'Start Planning'
              } else if (currentStage === 'planning') {
                nextStepTitle = 'Final Payment Reminder'
                nextStepDetail = 'Request final rental balance'
                nextStepButton = 'Send Reminder'
              } else if (currentStage === 'final_payment') {
                nextStepTitle = 'Run Event Day'
                nextStepDetail = 'Access checklist & operations'
                nextStepButton = 'Start Event Day'
              } else if (currentStage === 'event') {
                nextStepTitle = 'Close Out & Review'
                nextStepDetail = 'Send post-event feedback request'
                nextStepButton = 'Close Out Event'
              } else if (currentStage === 'closing') {
                nextStepTitle = 'Complete Lead'
                nextStepDetail = 'Archive lead as successful'
                nextStepButton = 'Complete Lead'
              }

              return (
                <>
                  {/* CLIENT SUMMARY */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Client Summary</p>
                    </div>
                    <div className="space-y-3.5 text-xs text-left">
                      <a href={`mailto:${clientSummaryEmail}`} className="flex items-center gap-3 py-1 text-zinc-300 hover:text-[#caa24c] transition-colors cursor-pointer">
                        <Mail size={14} className="text-[#a8792f]" />
                        <span>{clientSummaryEmail}</span>
                      </a>
                      <a href={`tel:${clientSummaryPhone}`} className="flex items-center gap-3 py-1 text-zinc-300 hover:text-[#caa24c] transition-colors cursor-pointer">
                        <Phone size={14} className="text-[#a8792f]" />
                        <span>{clientSummaryPhone}</span>
                      </a>
                      <div className="flex items-center gap-3 py-1 text-zinc-300">
                        <MapPin size={14} className="text-[#a8792f]" />
                        <span>{clientSummaryAddress}</span>
                      </div>
                      <div className="flex items-center gap-3 py-1 text-zinc-300">
                        <Users size={14} className="text-[#a8792f]" />
                        <span>{clientSummaryGuests}</span>
                      </div>
                      <div className="flex items-center gap-3 py-1 text-zinc-300">
                        <Star size={14} className="text-[#a8792f]" />
                        <span>{clientSummaryEventType}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100/5 dark:border-zinc-850/30 text-center">
                      <button
                        type="button"
                        onClick={() => scrollToSection('lead-message')}
                        className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                      >
                        View Full Details &rarr;
                      </button>
                    </div>
                  </section>

                  {/* NEXT STEP */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Next Step</p>
                    </div>
                    <div className="flex items-start gap-4 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#caa24c]/10 text-[#a8792f] border border-[#caa24c]/20">
                        <Calendar size={18} />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-tight">{nextStepTitle}</h4>
                        <p className="mt-1 text-[10px] text-zinc-500 leading-relaxed">{nextStepDetail}</p>
                      </div>
                    </div>
                    <div className="mt-5">
                      <button
                        type="button"
                        className="w-full py-2.5 rounded-lg bg-[#b98a3e] hover:bg-[#a8792f] text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-[#b98a3e]/10 transition-all cursor-pointer active:scale-95"
                      >
                        {nextStepButton}
                      </button>
                    </div>
                  </section>

                  {/* RECENT ACTIVITY */}
                  <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
                    <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Recent Activity</p>
                    </div>
                    <div className="space-y-4 text-left">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                          <Check size={11} className="stroke-[3]" />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">Tour marked completed</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">July 6, 2026 at 4:15 PM</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                          <Mail size={11} />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">Tour confirmation email sent</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">July 5, 2026 at 9:21 AM</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                          <Calendar size={11} />
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">Tour scheduled</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">July 5, 2026 at 9:10 AM</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-100/5 dark:border-zinc-850/30 text-center">
                      <button
                        type="button"
                        onClick={() => setActiveLeadTab('activity')}
                        className="text-[10px] font-black uppercase tracking-[0.14em] text-[#caa24c] hover:text-[#f1d27a] transition-colors cursor-pointer"
                      >
                        View All Activity &rarr;
                      </button>
                    </div>
                  </section>
                </>
              )
            })()}
          </div>
        </div>
      ) : (
        <div className={`mt-3 grid gap-6 pb-12 sm:pb-16 ${
          activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
            ? 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]'
            : 'lg:grid-cols-1'
        }`}>
          {activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
            <div className="space-y-6">
              {activityEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[color:var(--portal-border)] px-4 py-6 text-sm text-[color:var(--portal-muted)]">
                  <p className="font-semibold text-[color:var(--portal-text)]">{activityEmptyTitle}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{activityEmptyCopy}</p>
                </div>
              ) : (
                <div className="relative ml-3 space-y-6 border-l border-[color:var(--portal-border)] pl-6">
                  {activityEntries.map((entry) => {
                    if (entry.kind === 'email') {
                      const email = entry.email
                      const isOutgoing = email.direction === 'outgoing'

                      return (
                        <div key={entry.id} className="relative group">
                          <div className="absolute -left-[29px] top-[7px] z-10 h-2.5 w-2.5 rotate-45 border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] transition-all group-hover:border-[#caa24c] group-hover:bg-[color:color-mix(in_srgb,var(--portal-bg)_80%,#caa24c_20%)]" />
                          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                              {isOutgoing ? 'Luxor Zoho Mail' : email.from || 'Zoho Mail'}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                                isOutgoing
                                  ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              }`}>
                                {isOutgoing ? 'Zoho Sent' : 'Zoho Received'}
                              </span>
                              <span className="text-[9px] font-mono text-zinc-600">{formatTimelineDate(entry.createdAt)}</span>
                            </div>
                          </div>
                          <p className="text-xs font-bold text-zinc-200">{email.subject || '(No subject)'}</p>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            From {email.from || 'Unknown'} {email.to ? `to ${email.to}` : ''}
                          </p>
                          {email.summary ? (
                            <p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-relaxed text-zinc-300">{email.summary}</p>
                          ) : null}
                        </div>
                      )
                    }

                    const note = entry.note
                    let badgeColor = 'border-zinc-800/50 bg-zinc-800 text-zinc-400'
                    let typeLabel = 'System Log'
                    if (note.note_type === 'note') {
                      badgeColor = 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                      typeLabel = 'Note'
                    } else if (note.note_type === 'call_log') {
                      badgeColor = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      typeLabel = 'Call Log'
                    } else if (note.note_type === 'email_log') {
                      badgeColor = 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                      typeLabel = 'Email'
                    } else if (note.note_type === 'status_change') {
                      badgeColor = 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                      typeLabel = 'Status'
                    }

                    return (
                      <div key={note.id} className="relative group">
                        <div className="absolute -left-[29px] top-[7px] z-10 h-2.5 w-2.5 rotate-45 border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] animate-pulse transition-all group-hover:border-[#caa24c] group-hover:bg-[color:color-mix(in_srgb,var(--portal-bg)_80%,#caa24c_20%)]" />
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{note.author}</span>
                          <div className="flex items-center gap-3">
                            <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badgeColor}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-650">{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-zinc-300">{note.content}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Sidebar Panel Column */}
          <div className={`space-y-6 ${
            activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
              ? 'lg:sticky lg:top-8 lg:self-start'
              : ''
          }`}>
            {activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
              <div className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter">
                <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
                  <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                    <ClipboardCheck size={16} className="text-zinc-500" />
                    Recommended Actions
                  </h3>
                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">Top priority first</span>
                </div>
                <div className="grid gap-2.5">
                  {recommendedActions.map((action, index) => (
                    <ClientActionButton
                      key={`${action.label}-${index}`}
                      icon={action.icon}
                      label={action.label}
                      detail={action.detail}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      loading={action.loading}
                    />
                  ))}
                </div>
              </div>
            ) : null}

          {activeLeadTab === 'tasks' ? (
          <div id="lead-tasks" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <h3 className="flex items-center gap-2.5 font-semibold text-white/90">
                <Briefcase size={16} className="text-zinc-500" />
                Tasks & Checklist
              </h3>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-500">{pendingTaskCount} remaining</span>
                <button
                  type="button"
                  onClick={() => setShowTaskTools((current) => !current)}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-400 transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#f1d27a]"
                >
                  {showTaskTools ? 'Hide' : 'Open'}
                </button>
              </div>
            </div>

            {!showTaskTools ? (
              <div className="rounded-xl border border-dashed border-zinc-900/80 bg-zinc-950/35 px-4 py-4 text-xs leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">
                  {pendingTaskCount === 0 ? 'No follow-up tasks right now.' : `${pendingTaskCount} pending task${pendingTaskCount === 1 ? '' : 's'} ready to review.`}
                </p>
                <p className="mt-1 text-zinc-600">Open the checklist when you need to add a follow-up, due date, or priority.</p>
              </div>
            ) : (
              <>
                <form onSubmit={handleAddTask} className="mb-6 space-y-3 rounded-lg border border-zinc-900 bg-zinc-950/50 p-3">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="New follow-up task..."
                    className="w-full rounded border border-zinc-900 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <PortalDatePicker
                      value={taskDueDate}
                      onChange={setTaskDueDate}
                      className="flex-1"
                      placeholder="Due Date"
                    />
                    <PortalSelect
                      value={taskPriority}
                      onChange={(val) => setTaskPriority(val as LuxorTask['priority'])}
                      options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                      ]}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingTask || !taskTitle.trim()}
                    className="w-full rounded bg-blue-600 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                  >
                    Add Task
                  </button>
                </form>

                {sortedTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-900 px-4 py-5 text-xs leading-5 text-zinc-500">
                    <p className="font-semibold text-zinc-300">No follow-up tasks yet.</p>
                    <p className="mt-1 text-zinc-600">Add a task now so the next step does not get lost in the notes.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedTasks.map((task) => {
                      const isCompleted = task.status === 'completed'
                      let prioColor = 'border-zinc-800 bg-zinc-500/5 text-zinc-500'
                      if (task.priority === 'high') prioColor = 'border-amber-500/10 bg-amber-500/5 text-amber-500'
                      else if (task.priority === 'urgent') prioColor = 'border-red-500/10 bg-red-500/5 text-red-500'

                      return (
                        <div key={task.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-900 p-3 transition-colors hover:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className="mt-0.5 rounded p-0.5 text-zinc-500 transition-colors hover:text-blue-500"
                          >
                            {isCompleted ? (
                              <CheckCircle2 size={16} className="text-emerald-500" />
                            ) : (
                              <Circle size={16} className="text-zinc-700" />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs font-bold leading-tight text-white/95 ${isCompleted ? 'font-medium text-zinc-600 line-through' : ''}`}>
                              {task.title}
                            </p>
                            {task.due_date ? (
                              <p className="mt-1 flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                                <Clock size={10} /> {new Date(task.due_date).toLocaleDateString()}
                              </p>
                            ) : (
                              <p className="mt-1 text-[10px] text-zinc-600">No due date</p>
                            )}
                          </div>
                          <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${prioColor}`}>
                            {task.priority}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'booking' || activeLeadTab === 'documents' ? (
          <div id="lead-booking" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <h3 className="mb-6 flex items-center justify-between font-semibold text-white/90">
              <span className="flex items-center gap-2.5">
                <FileSignature size={16} className="text-zinc-500" />
                Booking & Contract
              </span>
              <span className="font-mono text-xs text-zinc-500">{sortedBookings.length} records</span>
            </h3>

            {sortedBookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-xs leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">No booking record is linked yet.</p>
                <p className="mt-1 text-zinc-600">Use a real booking form when the event date is ready, then send the contract from here.</p>
                <button
                  type="button"
                  onClick={openBookingModal}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] transition-colors hover:bg-[#caa24c]/12"
                >
                  Create booking record
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedBookings.map((booking, index) => (
                  <div key={booking.id} className="rounded-xl border border-zinc-900 bg-zinc-950/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                          {index === 0 ? 'Latest booking' : 'Booking record'}
                        </p>
                        <p className="mt-1 text-sm font-bold text-white">{booking.event_date || 'Event date TBD'}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {(booking.package_name || 'No package').replaceAll('_', ' ')} • {(booking.contract_status || 'not_sent').replaceAll('_', ' ')}
                        </p>
                      </div>
                      <PortalStatusBadge status={booking.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-[10px] text-zinc-500 sm:grid-cols-3">
                      <div>
                        <span className="block text-zinc-600">Contract total</span>
                        <span className="font-mono text-zinc-300">${Number(booking.contract_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="block text-zinc-600">Deposit required</span>
                        <span className="font-mono text-zinc-300">${Number(booking.deposit_required || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="block text-zinc-600">Contract status</span>
                        <span className="font-mono text-zinc-300">{(booking.contract_status || 'not_sent').replaceAll('_', ' ')}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendContract(booking.id)}
                        disabled={booking.contract_status === 'signed'}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] transition-colors hover:bg-[#caa24c]/12 disabled:opacity-45"
                      >
                        {booking.contract_status === 'signed' ? 'Contract Signed' : booking.contract_status === 'sent' ? 'Resend Contract' : 'Send Contract'}
                      </button>
                      <button
                        type="button"
                        onClick={openBookingModal}
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:text-white"
                      >
                        Update Booking
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}

          {activeLeadTab === 'billing' || activeLeadTab === 'documents' ? (
          <div id="lead-billing" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 backdrop-blur-xl shadow-2xl luxor-soft-enter scroll-mt-24">
            <h3 className="mb-6 flex items-center justify-between font-semibold text-white/90">
              <span className="flex items-center gap-2.5">
                <FileText size={16} className="text-zinc-500" />
                Invoices & Revenue
              </span>
              <button
                onClick={() => setIsInvoiceModalOpen(true)}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-500 transition-colors hover:text-blue-400"
              >
                <Plus size={12} /> New Invoice
              </button>
            </h3>

            {sortedInvoices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-xs leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">No invoice records generated yet.</p>
                <p className="mt-1 text-zinc-600">Draft the deposit or event invoice when the numbers are ready.</p>
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-300 transition-colors hover:bg-blue-500/15"
                >
                  Draft Invoice
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedInvoices.map((inv, index) => (
                  <div key={inv.id} className="rounded-xl border border-zinc-900 bg-zinc-950/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{inv.id.slice(0, 8).toUpperCase()}</p>
                        <p className="mt-1 text-sm font-mono font-bold text-white">${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          {index === 0 ? 'Latest invoice' : 'Invoice record'}
                          {inv.due_date ? ` • Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <PortalStatusBadge status={inv.status} />
                    </div>
                    {index === 0 && inv.description ? <p className="mt-3 text-xs leading-5 text-zinc-400">{inv.description}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          ) : null}
        </div>
      </div>
      )}

      {/* Invoice drafting modal */}
      <PortalModal isOpen={isInvoiceModalOpen} onClose={() => setIsInvoiceModalOpen(false)} maxWidth="max-w-xl">
        <div className="flex items-center justify-between border-b border-zinc-900 bg-white/[0.02] px-6 py-4">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Draft Event Invoice</h3>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white">
                Close
              </button>
            </div>
            
            <form onSubmit={handleCreateInvoice} className="flex-1 overflow-y-auto p-6 space-y-4 portal-scrollbar bg-[#080706]">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Invoice Description / Summary</label>
                <input
                  type="text"
                  required
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  placeholder="e.g. Wedding Booking & Reception fee"
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Client Name</label>
                  <input
                    type="text"
                    disabled
                    value={lead.full_name}
                    className="w-full bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-500 rounded px-3 py-2 outline-none cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Due Date</label>
                  <PortalDatePicker
                    value={invoiceDueDate}
                    onChange={setInvoiceDueDate}
                    className="w-full"
                    placeholder="Due Date"
                  />
                </div>
              </div>

              {/* Line Items builder */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Line Items</label>
                  <button
                    type="button"
                    onClick={addInvoiceItem}
                    className="text-[9px] font-black uppercase text-blue-500 tracking-wider flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Row
                  </button>
                </div>

                <div className="space-y-2">
                  {invoiceItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        value={item.description}
                        onChange={(e) => handleInvoiceItemChange(index, 'description', e.target.value)}
                        placeholder="Item description..."
                        className="flex-1 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => handleInvoiceItemChange(index, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="w-14 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 text-center"
                      />
                      <input
                        type="number"
                        min="0"
                        required
                        value={item.unitPrice}
                        onChange={(e) => handleInvoiceItemChange(index, 'unitPrice', e.target.value)}
                        placeholder="Price"
                        className="w-24 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500 text-right font-mono"
                      />
                      {invoiceItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInvoiceItem(index)}
                          className="text-zinc-600 hover:text-red-400 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals */}
              <div className="bg-zinc-950/70 border border-zinc-900 rounded-xl p-4 space-y-2 text-right">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Subtotal:</span>
                  <span className="font-mono text-zinc-300">${getInvoiceSubtotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 border-b border-zinc-900/50 pb-2">
                  <span>Sales Tax (8.25%):</span>
                  <span className="font-mono text-zinc-300">${getInvoiceTax().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1">
                  <span>Total Amount Due:</span>
                  <span className="font-mono text-[#caa24c]">${getInvoiceTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">Invoice Notes / Memo</label>
                <textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  placeholder="Notes shown on invoice..."
                  className="w-full h-16 bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded p-2 outline-none focus:border-blue-500 leading-relaxed font-sans"
                />
              </div>

              <button
                type="submit"
                disabled={submittingInvoice}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-blue-600/20 disabled:opacity-40"
              >
                Create Invoice
              </button>
            </form>
      </PortalModal>

      {/* Booking creation modal */}
      <PortalModal isOpen={isBookingModalOpen} onClose={() => setIsBookingModalOpen(false)} maxWidth="max-w-2xl">
        <div className="flex items-center justify-between border-b border-zinc-900 bg-white/[0.02] px-6 py-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Create Booking Record</h3>
                <p className="mt-1 text-[11px] text-zinc-500">This keeps the calendar, contract, and deposit details tied to the lead.</p>
              </div>
              <button onClick={() => setIsBookingModalOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white">
                Close
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="flex-1 overflow-y-auto bg-[#080706] p-6 space-y-5 portal-scrollbar">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Event Date</label>
                  <PortalDatePicker
                    value={bookingEventDate}
                    onChange={setBookingEventDate}
                    className="w-full"
                    placeholder="Select event date"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Booking Status</label>
                  <PortalSelect
                    value={bookingStatus}
                    onChange={(value) => setBookingStatus(value as LuxorBookingStatus)}
                    className="w-full"
                    options={[
                      { value: 'tentative', label: 'Tentative' },
                      { value: 'confirmed', label: 'Confirmed' },
                      { value: 'draft', label: 'Draft' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Start Time</label>
                  <input
                    type="time"
                    value={bookingStartTime}
                    onChange={(e) => setBookingStartTime(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">End Time</label>
                  <input
                    type="time"
                    value={bookingEndTime}
                    onChange={(e) => setBookingEndTime(e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Package Name</label>
                <input
                  type="text"
                  value={bookingPackageName}
                  onChange={(e) => setBookingPackageName(e.target.value)}
                  placeholder="Gold package, venue rental, etc."
                  className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Contract Total</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={bookingContractTotal}
                    onChange={(e) => setBookingContractTotal(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] leading-4 text-zinc-600">If there is already an invoice, this starts from that total.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Deposit Required</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bookingDepositRequired}
                    onChange={(e) => setBookingDepositRequired(e.target.value)}
                    placeholder="625"
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] leading-4 text-zinc-600">If left blank, this defaults to 25% of the contract total.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Booking Notes</label>
                <textarea
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Include venue timing, package notes, setup details, or anything contract-related."
                  className="w-full h-24 rounded border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300 outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div className="rounded-xl border border-zinc-900 bg-zinc-950/50 p-4 text-[11px] leading-5 text-zinc-500">
                <p className="font-semibold text-zinc-300">What happens next</p>
                <p className="mt-1">We save the booking, move the lead to booked, and keep the contract button ready in the booking section.</p>
              </div>

              <button
                type="submit"
                disabled={submittingBooking || !bookingEventDate || !bookingContractTotal.trim()}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-xl shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                {submittingBooking ? 'Saving Booking...' : 'Save Booking Record'}
              </button>
            </form>
      </PortalModal>
    </PortalPageFrame>
  )
}

function ClientDossierLoading() {
  return (
    <PortalPageFrame className="max-w-[1560px] !gap-0">
      {/* 1. Header Back & Status */}
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <div className="h-4 w-40 luxor-skeleton rounded" />
        <div className="h-6 w-20 luxor-skeleton rounded-full animate-pulse" />
      </div>

      {/* 2. Top Header Card */}
      <section className="overflow-hidden rounded-t-2xl border border-b-0 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 lg:p-6 shadow-2xl shadow-black/10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="flex min-w-0 gap-4">
            <div className="h-20 w-20 shrink-0 rounded-full luxor-skeleton animate-pulse" />
            <div className="min-w-0 pt-1 flex-1 space-y-3">
              <div className="h-8 w-64 max-w-full luxor-skeleton rounded animate-pulse" />
              <div className="flex flex-wrap gap-4 mt-2">
                <div className="h-4 w-20 luxor-skeleton rounded" />
                <div className="h-4 w-24 luxor-skeleton rounded" />
                <div className="h-4 w-20 luxor-skeleton rounded" />
              </div>
              <div className="h-3.5 w-44 luxor-skeleton rounded mt-2" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="h-9 w-28 luxor-skeleton rounded-lg" />
            <div className="h-9 w-28 luxor-skeleton rounded-lg" />
            <div className="h-9 w-32 luxor-skeleton rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="border-t border-[color:var(--portal-border)] mt-5 pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-col items-center text-center space-y-2">
                <div className="h-8 w-8 rounded-full luxor-skeleton animate-pulse" />
                <div className="h-3.5 w-16 luxor-skeleton rounded" />
                <div className="h-3 w-10 luxor-skeleton rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Sticky Tab Bar */}
      <div className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/50 backdrop-blur-xl px-4 py-3 sm:-top-6 lg:-top-8">
        <div className="flex min-w-max gap-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-6 w-16 luxor-skeleton rounded-full" />
          ))}
        </div>
      </div>

      {/* 4. Split Column Layout */}
      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Next Step Skeleton */}
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded-full luxor-skeleton animate-pulse" />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="h-3 w-16 luxor-skeleton rounded" />
                  <div className="h-5 w-36 luxor-skeleton rounded" />
                  <div className="h-4 w-48 luxor-skeleton rounded" />
                  <div className="h-8 w-32 luxor-skeleton rounded-lg mt-1" />
                </div>
              </div>
            </section>

            {/* Client Details Skeleton */}
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-3 w-20 luxor-skeleton rounded" />
                  <div className="h-5 w-32 luxor-skeleton rounded" />
                </div>
                <div className="h-5 w-5 luxor-skeleton rounded" />
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg luxor-skeleton" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-12 luxor-skeleton rounded" />
                      <div className="h-4 w-40 luxor-skeleton rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Event Details Skeleton */}
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
              <div className="space-y-2">
                <div className="h-3 w-20 luxor-skeleton rounded" />
                <div className="h-4 w-48 luxor-skeleton rounded" />
              </div>
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 min-h-[72px]">
                  <div className="h-8 w-8 rounded-lg luxor-skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-16 luxor-skeleton rounded" />
                    <div className="h-4 w-32 luxor-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message Payload Skeleton */}
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6">
            <div className="h-3 w-32 luxor-skeleton rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full luxor-skeleton rounded" />
              <div className="h-4 w-5/6 luxor-skeleton rounded" />
            </div>
          </div>
        </div>

        {/* Sidebar Recommended Actions Column Skeleton */}
        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div className="h-5 w-40 luxor-skeleton rounded" />
              <div className="h-3 w-20 luxor-skeleton rounded" />
            </div>
            <div className="grid gap-2.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-[color:var(--portal-border)] p-3">
                  <div className="h-8 w-8 rounded-lg luxor-skeleton shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-4 w-32 luxor-skeleton rounded" />
                    <div className="h-3 w-40 luxor-skeleton rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PortalPageFrame>
  )
}

function LeadLifecycleRail({
  lead,
  bookings,
  latestBooking,
  latestInvoice,
  isSaving = false,
  activeStageId,
  onStepClick,
}: {
  lead: LuxorInquiry
  bookings: LuxorBooking[]
  latestBooking: LuxorBooking | null
  latestInvoice: LuxorInvoice | null
  isSaving?: boolean
  activeStageId?: string
  onStepClick?: (stageId: string) => void
}) {
  const inquiryDate = new Date(lead.created_at)
  const formattedInquiryDate = inquiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const tourDate = lead.preferred_tour_date ? new Date(lead.preferred_tour_date) : null
  const formattedTourDate = tourDate ? tourDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  const eventDate = lead.target_date ? new Date(lead.target_date) : null
  const formattedEventDate = eventDate ? eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  const formattedProposalSentDate = lead.status === 'proposal_sent' || lead.status === 'booked'
    ? new Date(lead.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  const steps = [
    {
      id: 'inquiry',
      label: 'Inquiry',
      subtext: formattedInquiryDate,
      isCompleted: true,
      isActive: false,
    },
    {
      id: 'tour',
      label: 'Tour',
      subtext: formattedTourDate || 'Jul 6',
      isCompleted: lead.status !== 'new' && lead.status !== 'contacted',
      isActive: lead.status === 'tour_requested' || lead.status === 'tour_confirmed',
    },
    {
      id: 'proposal_sent',
      label: 'Proposal',
      subtext: formattedProposalSentDate || 'Jul 9',
      isCompleted: lead.status === 'proposal_sent' || lead.status === 'booked',
      isActive: lead.status === 'proposal_sent' && !latestBooking,
    },
    {
      id: 'proposal_accepted',
      label: 'Proposal',
      subtext: lead.status === 'booked' ? 'Jul 9' : '',
      isCompleted: lead.status === 'booked',
      isActive: lead.status === 'proposal_sent' && !!latestBooking,
    },
    {
      id: 'contract',
      label: 'Contract',
      subtext: latestBooking?.contract_status === 'signed'
        ? 'Signed'
        : latestBooking?.contract_status === 'sent'
        ? 'Sent'
        : '',
      isCompleted: latestBooking?.contract_status === 'signed',
      isActive: latestBooking?.contract_status === 'sent' || (lead.status === 'booked' && !latestBooking),
    },
    {
      id: 'deposit',
      label: 'Deposit',
      subtext: latestBooking?.security_deposit_status === 'collected'
        ? 'Paid'
        : latestBooking?.contract_status === 'signed'
        ? 'Pending'
        : '',
      isCompleted: latestBooking?.security_deposit_status === 'collected',
      isActive: latestBooking?.contract_status === 'signed' && latestBooking?.security_deposit_status !== 'collected',
    },
    {
      id: 'planning',
      label: 'Planning',
      subtext: '',
      isCompleted: latestBooking?.status === 'confirmed' || latestBooking?.status === 'completed',
      isActive: latestBooking?.security_deposit_status === 'collected' && latestBooking?.status === 'tentative',
    },
    {
      id: 'final_payment',
      label: 'Final Payment',
      subtext: '',
      isCompleted: latestBooking?.status === 'completed',
      isActive: latestBooking?.status === 'confirmed',
    },
    {
      id: 'event',
      label: 'Event',
      subtext: formattedEventDate || 'Aug 30',
      isCompleted: latestBooking?.status === 'completed',
      isActive: false,
    },
    {
      id: 'complete',
      label: 'Complete',
      subtext: '',
      isCompleted: latestBooking?.status === 'completed',
      isActive: false,
    },
  ]

  const getStageIdFromStepId = (stepId: string) => {
    if (stepId === 'proposal_sent' || stepId === 'proposal_accepted') return 'proposal'
    if (stepId === 'event') return 'event'
    if (stepId === 'complete') return 'closing'
    return stepId
  }

  const activeIndex = steps.findIndex(s => s.isActive)
  let finalSteps = steps.map((step, idx) => {
    let active = step.isActive
    const completed = step.isCompleted
    if (activeIndex === -1) {
      const firstNonCompletedIdx = steps.findIndex(s => !s.isCompleted)
      if (firstNonCompletedIdx === idx) {
        active = true
      }
    }
    return { ...step, isActive: active, isCompleted: completed }
  })

  let hasMetIncomplete = false
  finalSteps = finalSteps.map((step) => {
    if (!step.isCompleted) {
      hasMetIncomplete = true
    }
    return {
      ...step,
      isCompleted: step.isCompleted && !hasMetIncomplete,
    }
  })

  finalSteps = finalSteps.map((step) => {
    if (step.isActive) {
      return { ...step, isCompleted: false }
    }
    return step
  })

  return (
    <div className="portal-scrollbar overflow-x-auto pb-2">
      <div className="relative flex min-w-[960px] items-center justify-between px-6 py-4">
        {/* Track Line */}
        <div className="absolute left-[5%] right-[5%] top-[34px] h-[2px] bg-zinc-200 dark:bg-zinc-800" />
        
        {finalSteps.map((step, index) => {
          const isDone = step.isCompleted
          const stepStageId = getStageIdFromStepId(step.id)
          const isCurrent = activeStageId ? stepStageId === activeStageId : step.isActive

          return (
            <button
              key={index}
              type="button"
              onClick={() => onStepClick?.(stepStageId)}
              className="relative flex flex-col items-center flex-1 cursor-pointer focus:outline-none group/step"
            >
              <div className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-300 ${
                isDone
                  ? 'border-[#caa24c] bg-[#caa24c] text-white shadow-lg shadow-[#caa24c]/20'
                  : isCurrent
                  ? 'border-2 border-[#caa24c] bg-white dark:bg-zinc-950 text-[#caa24c] ring-4 ring-[#caa24c]/10'
                  : 'border-zinc-200 dark:border-zinc-850 bg-white dark:bg-[#080706] text-zinc-400 dark:text-zinc-650'
              }`}>
                {isDone ? (
                  <Check size={13} className="stroke-[3]" />
                ) : isCurrent ? (
                  <FileText size={13} className="stroke-[2.5]" />
                ) : (
                  <Circle size={6} className="fill-current text-zinc-300 dark:text-zinc-700 border-none" />
                )}
              </div>

              <span className={`mt-3 text-[9px] font-black uppercase tracking-[0.15em] ${
                isCurrent
                  ? 'text-[#a8792f]'
                  : isDone
                  ? 'text-white/95'
                  : 'text-zinc-550 group-hover/step:text-zinc-400'
              }`}>
                {step.label}
              </span>
              <span className="mt-1 h-3 text-[9px] font-medium text-zinc-400 dark:text-zinc-600">
                {step.subtext}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ClientActionButton({
  icon,
  label,
  detail,
  onClick,
  disabled = false,
  loading = false,
}: {
  icon: React.ReactNode
  label: string
  detail: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading}
      className={`group flex w-full items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-left transition-all hover:border-[#caa24c]/25 hover:bg-[#caa24c]/5 disabled:cursor-not-allowed disabled:hover:border-[color:var(--portal-border)] disabled:hover:bg-[color:var(--portal-soft)] ${
        loading ? 'opacity-100 ring-1 ring-[#caa24c]/25' : 'disabled:opacity-45'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-colors group-hover:text-[#a8792f]">
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#caa24c]/25 border-t-[#caa24c]" />
        ) : (
          icon
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-[color:var(--portal-text)] transition-colors">
          {loading ? 'Saving next step...' : label}
        </span>
        <span className="mt-1 block text-[9px] font-medium leading-4 text-[color:var(--portal-muted)]">
          {loading ? 'Updating the lead record now' : detail}
        </span>
      </span>
    </button>
  )
}

function DetailItem({
  icon,
  label,
  value,
  editValue,
  copyValue,
  inputType = 'text',
  placeholder,
  isMono = false,
  subtext,
  isSaving = false,
  onCommit,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  editValue?: string
  copyValue?: string
  inputType?: LeadDetailInputType
  placeholder?: string
  isMono?: boolean
  subtext?: string
  isSaving?: boolean
  onCommit?: (value: string) => Promise<boolean>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(editValue ?? value)
  const [copied, setCopied] = useState(false)
  const canEdit = Boolean(onCommit)
  const canCopy = Boolean(copyValue?.trim())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isEditing || inputType !== 'date') return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsEditing(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, inputType])

  const startEditing = () => {
    if (!canEdit || isSaving) return
    setDraft(editValue ?? value)
    setIsEditing(true)
  }

  const commitDraft = async () => {
    if (!onCommit || isSaving) return

    const saved = await onCommit(draft)
    if (saved) {
      setIsEditing(false)
    }
  }

  const copyDetail = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!copyValue?.trim()) return

    try {
      await navigator.clipboard.writeText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (err) {
      console.error('Unable to copy lead detail:', err)
    }
  }

  return (
    <div
      ref={containerRef}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      aria-label={canEdit ? `Edit ${label}` : undefined}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (!canEdit || isEditing) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          startEditing()
        }
      }}
      className={`group/card relative flex min-h-[72px] items-start gap-3 px-3 -mx-3 py-3.5 rounded-xl transition-all hover:bg-[#caa24c]/[0.025] ${
        canEdit ? 'cursor-text focus:outline-none focus:ring-1 focus:ring-[#caa24c]/30' : ''
      }`}
    >
      {icon ? (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f]">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</div>

      {isEditing ? (
        inputType === 'date' ? (
          <div className="mt-2 w-full" onClick={(event) => event.stopPropagation()}>
            <PortalDatePicker
              value={draft}
              onChange={async (val) => {
                setDraft(val)
                if (onCommit) {
                  const saved = await onCommit(val)
                  if (saved) {
                    setIsEditing(false)
                  }
                }
              }}
            />
          </div>
        ) : (
          <input
            autoFocus
            type={inputType}
            min={inputType === 'number' ? 0 : undefined}
            value={draft}
            disabled={isSaving}
            placeholder={placeholder}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              void commitDraft()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitDraft()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(editValue ?? value)
                setIsEditing(false)
              }
            }}
            className={`mt-2 w-full rounded-lg border border-[#caa24c]/25 bg-[color:var(--portal-card)] px-3 py-2 text-sm font-bold text-[color:var(--portal-text)] outline-none transition-all placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 ${
              isMono ? 'font-mono' : ''
            }`}
          />
        )
      ) : (
        <div className={`group/value relative mt-2 flex w-full items-center ${canEdit || canCopy ? 'cursor-pointer' : ''}`}>
          <p
            className={`min-w-0 flex-1 truncate text-sm font-bold leading-normal text-[color:var(--portal-text)] transition-all duration-150 group-hover/value:pr-[5.5rem] ${
              isMono ? 'font-mono text-xs' : ''
            }`}
          >
            {isSaving ? 'Saving...' : value}
          </p>
          {canCopy || (canEdit && !isEditing) ? (
            <div className="pointer-events-none absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/value:pointer-events-auto group-hover/value:opacity-100">
              {canCopy ? (
                <button
                  type="button"
                  aria-label={`Copy ${label}`}
                  onClick={copyDetail}
                  className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-all ${
                    copied
                      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                      : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:border-[#caa24c]/25 hover:text-[#a8792f]'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Edit ${label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    startEditing()
                  }}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/25 hover:text-[#a8792f]"
                >
                  <Pencil size={13} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {subtext && <p className="mt-1 text-[9px] font-medium italic text-[#a8792f]">{subtext}</p>}
      </div>
    </div>
  )
}

function LeadStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'blue' | 'gold' | 'green' | 'slate'
}) {
  const toneClasses = {
    blue: 'border-blue-500/15 bg-blue-500/5 text-blue-400',
    gold: 'border-[#caa24c]/18 bg-[#caa24c]/8 text-[#f1d27a]',
    green: 'border-emerald-500/15 bg-emerald-500/5 text-emerald-400',
    slate: 'border-zinc-800 bg-zinc-950/70 text-zinc-400',
  }

  return (
    <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">{label}</p>
        <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${toneClasses[tone]}`}>Live</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="max-w-[70%] font-mono text-lg font-bold leading-tight text-[color:var(--portal-text)]">{value}</p>
        <p className="pb-1 text-right text-[11px] font-medium leading-4 text-[color:var(--portal-muted)]">{detail}</p>
      </div>
    </div>
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

function normalizeLeadFieldValue(field: EditableLeadField, value: string): string | number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (field === 'guest_count') {
    const parsed = Number.parseInt(trimmed.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null
  }

  if (field === 'email') {
    return trimmed.toLowerCase()
  }

  if (field === 'preferred_tour_time') {
    return formatTimeInputForStorage(trimmed)
  }

  return trimmed
}

function normalizeComparableValue(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function formatTimeString(timeStr: string) {
  if (!timeStr) return ''
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return timeStr

  let hours = Number(match[1])
  const minutes = match[2]
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  return `${hours}:${minutes} ${ampm}`
}

function normalizeTimeInputValue(value: string | null | undefined) {
  if (!value) return ''

  const twentyFourHourMatch = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1].padStart(2, '0')}:${twentyFourHourMatch[2]}`
  }

  const twelveHourMatch = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!twelveHourMatch) return value

  let hours = Number(twelveHourMatch[1])
  const minutes = twelveHourMatch[2]
  const period = twelveHourMatch[3].toUpperCase()

  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  return `${String(hours).padStart(2, '0')}:${minutes}`
}

function formatTimeInputForStorage(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value

  const hours = Number(match[1])
  const minutes = match[2]
  if (!Number.isFinite(hours)) return value

  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${period}`
}

function formatLeadAge(createdAt: string) {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return 'Unknown'

  const daysOld = Math.max(0, Math.floor((Date.now() - created) / 86_400_000))
  if (daysOld === 0) return 'Today'
  if (daysOld === 1) return '1 day old'
  return `${daysOld} days old`
}

function describeActivityEntry(entry: ActivityEntry) {
  if (entry.kind === 'email') {
    return entry.email.direction === 'outgoing' ? 'Email sent' : 'Email received'
  }

  if (entry.note.note_type === 'call_log') return 'Call logged'
  if (entry.note.note_type === 'email_log') return 'Email logged'
  if (entry.note.note_type === 'status_change') return 'Status updated'
  return 'Note added'
}

function getLeadNextStep(lead: LuxorInquiry, latestBooking: LuxorBooking | null, latestInvoice: LuxorInvoice | null) {
  if (lead.status === 'closed_lost') {
    return {
      title: 'Re-open or archive',
      detail: 'Decide whether this should go back into the pipeline',
    }
  }

  if (lead.status === 'new') {
    return {
      title: 'Reach out today',
      detail: 'Call or email before the lead cools off',
    }
  }

  if (lead.status === 'contacted' || lead.status === 'tour_requested') {
    return {
      title: 'Lock the tour',
      detail: 'Confirm the date, time, and who is coming',
    }
  }

  if (lead.status === 'tour_confirmed') {
    return {
      title: 'Send proposal',
      detail: 'Pair pricing with a clear next step',
    }
  }

  if (lead.status === 'proposal_sent') {
    return {
      title: 'Follow up',
      detail: 'Check for questions or objections',
    }
  }

  if (lead.status === 'booked') {
    if (!latestBooking) {
      return {
        title: 'Create booking',
        detail: 'The lead is booked, but the booking record is missing',
      }
    }

    if (latestBooking.contract_status === 'signed') {
      return {
        title: 'Review booking',
        detail: 'Contract is signed, so keep the record clean',
      }
    }

    if (latestBooking.contract_status === 'sent') {
      return {
        title: 'Contract follow-up',
        detail: 'Keep an eye on signature status',
      }
    }

    return {
      title: 'Send contract',
      detail: latestInvoice ? 'Match the booking to the invoice' : 'Keep the contract moving',
    }
  }

  return {
    title: 'Keep momentum',
    detail: 'Move this lead toward a booking or decision',
  }
}

function getMostRecentBooking(bookings: LuxorBooking[]) {
  if (bookings.length === 0) return null

  return [...bookings].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })[0] ?? null
}

function isGrandOpeningRsvp(lead: LuxorInquiry) {
  return lead.campaign_key === 'grand_opening_2026_07_25' || lead.flow === 'grand_opening_rsvp' || lead.source === 'grand_opening_rsvp'
}

function normalizeTimelineDate(value: string | null) {
  if (!value) return new Date().toISOString()

  const numericValue = Number(value)
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function formatTimelineDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleString()
}

function formatSourceLabel(lead: LuxorInquiry) {
  return isGrandOpeningRsvp(lead) ? 'Grand Opening RSVP' : lead.source.replaceAll('_', ' ')
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return ''

  // If the format is YYYY-MM-DD, parse it with noon local time to avoid timezone offset shifts
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(year, month, day, 12, 0, 0)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
