'use client'

import React, { useEffect, useLayoutEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'
import { LuxorBooking, LuxorBookingStatus, LuxorInquiry, LuxorNote, LuxorTask, LuxorInvoice, LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { PortalPageFrame, PortalStatusBadge, PortalSelect, PortalDatePicker } from '@/components/portal/PortalUI'

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
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'notes' | 'comms' | 'system'>('all')
  const [showInternalSignals, setShowInternalSignals] = useState(false)
  const [showTaskTools, setShowTaskTools] = useState(false)
  const [savingLeadField, setSavingLeadField] = useState<EditableLeadField | null>(null)
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const activeButton = tabButtonRefs.current[activeLeadTab]
      if (!activeButton) return

      setTabIndicator({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      })
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeLeadTab])

  useEffect(() => {
    setShowInternalSignals(false)
    setShowTaskTools(false)
  }, [id])

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
    const currentValue = lead[field]

    if (normalizeComparableValue(currentValue) === normalizeComparableValue(normalizedValue)) {
      return true
    }

    const previousLead = lead
    try {
      setSavingLeadField(field)
      setLead((current) => current ? { ...current, [field]: normalizedValue, updated_at: new Date().toISOString() } : current)

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: normalizedValue }),
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to update lead detail.')
      }

      const updated = payload as LuxorInquiry
      setLead(updated)
      if (field === 'email') {
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

  // Parse chat logs if available in metadata
  const chatMessages = (lead.metadata?.chatMessages as { role: string; content: string }[]) || []
  const isGrandOpeningLead = isGrandOpeningRsvp(lead)
  const latestBooking = getMostRecentBooking(bookings)
  const latestInvoice = invoices[0] ?? null
  const noteEntries: ActivityEntry[] = notes.map((note) => ({
    kind: 'note',
    id: `note-${note.id}`,
    createdAt: note.created_at,
    note,
  }))
  const emailEntries: ActivityEntry[] = emailMessages.map((email) => ({
    kind: 'email',
    id: `email-${email.id || email.direction || email.subject}-${email.receivedAt || email.from}`,
    createdAt: normalizeTimelineDate(email.receivedAt),
    email,
  }))
  const allActivityEntries = [...noteEntries, ...emailEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const activityEntries = allActivityEntries.filter((entry) => {
    if (activeFeedTab === 'notes') return entry.kind === 'note' && entry.note.note_type === 'note'
    if (activeFeedTab === 'comms') {
      return entry.kind === 'email' || (entry.kind === 'note' && (entry.note.note_type === 'call_log' || entry.note.note_type === 'email_log'))
    }
    if (activeFeedTab === 'system') return entry.kind === 'note' && entry.note.note_type === 'status_change'
    return true
  })
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
      value: lead.target_date || 'TBD',
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
      value: lead.preferred_tour_date || 'No tour requested',
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
  const activityCounts = {
    all: noteEntries.length + emailEntries.length,
    notes: notes.filter((note) => note.note_type === 'note').length,
    comms: emailEntries.length + notes.filter((note) => note.note_type === 'call_log' || note.note_type === 'email_log').length,
    system: notes.filter((note) => note.note_type === 'status_change').length,
  }
  const sortedTasks = [...tasks].sort((a, b) => {
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
  const pendingTaskCount = sortedTasks.filter((task) => task.status === 'pending').length
  const sortedBookings = [...bookings].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })
  const sortedInvoices = [...invoices].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    return bTime - aTime
  })
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 font-serif text-2xl text-[#caa24c] shadow-xl shadow-black/10">
                {getInitials(lead.full_name)}
              </div>
              <span className="absolute bottom-0 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[#caa24c]">
                <User size={12} />
              </span>
            </div>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-3xl font-semibold leading-tight text-[color:var(--portal-text)] sm:text-4xl">{lead.full_name}</h1>
                {isGrandOpeningLead ? <Sparkles size={16} className="shrink-0 text-[#caa24c]" /> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[color:var(--portal-muted)]">
                <span>{lead.event_type || 'Quinceañera'}</span>
                <span>{lead.guest_count ? `${lead.guest_count} guests` : 'Guest count open'}</span>
                <span>{lead.target_date || 'Date TBD'}</span>
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> {formatSourceLabel(lead)}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[color:var(--portal-muted)]">
                Captured on {new Date(lead.created_at).toLocaleDateString()}.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35">
                <Mail size={13} /> Email client
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35">
                <Phone size={13} /> Call client
              </a>
            )}
            <button
              type="button"
              onClick={() => setIsInvoiceModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#b98a3e] px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-[#b98a3e]/20 transition-all hover:bg-[#a8792f] active:scale-95"
            >
              <DollarSign size={13} /> Create invoice
            </button>
          </div>
        </div>

        <div className="border-t border-[color:var(--portal-border)] px-5 py-4 lg:px-6">
          <LeadLifecycleRail currentStatus={pendingLifecycleStatus ?? lead.status} isSaving={updatingStatus} />
        </div>
      </section>

      <div
        className="sticky -top-4 z-30 -mt-px overflow-hidden rounded-b-2xl border border-[color:var(--portal-border)] shadow-lg shadow-black/10 backdrop-blur-3xl backdrop-saturate-150 sm:-top-6 lg:-top-8"
        style={{ backgroundColor: 'color-mix(in srgb, var(--portal-bg) 90%, transparent)' }}
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

      <div className={`mt-3 grid gap-6 ${
        activeLeadTab === 'overview' || activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
          ? 'lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]'
          : 'lg:grid-cols-1'
      }`}>
        {activeLeadTab === 'overview' || activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
          <div className="space-y-6">
          {activeLeadTab === 'overview' ? (
            <>
          <div id="lead-overview" className="grid gap-4 scroll-mt-24 md:grid-cols-2">
            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/20 bg-[#caa24c]/10 text-[#a8792f]">
                  <ClipboardCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Next Step</p>
                  <h2 className="mt-2 text-base font-bold text-[color:var(--portal-text)]">{nextBestMove.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{nextBestMove.detail}</p>
                  {recommendedActions[0] ? (
                    <button
                      type="button"
                      onClick={recommendedActions[0].onClick}
                      disabled={recommendedActions[0].disabled}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#b98a3e] px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-[#b98a3e]/20 transition-all hover:bg-[#a8792f] disabled:opacity-50"
                    >
                      {updatingStatus ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        recommendedActions[0].icon
                      )}
                      {updatingStatus ? 'Saving...' : recommendedActions[0].label}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Client Details</p>
                  <h2 className="mt-2 text-base font-bold text-[color:var(--portal-text)]">{lead.full_name}</h2>
                </div>
                <User size={18} className="text-[#a8792f]" />
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
                <div className="flex items-center gap-3 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f]">
                    <MapPin size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Source</p>
                    <p className="mt-1 text-sm font-bold capitalize text-[color:var(--portal-text)]">{formatSourceLabel(lead)}</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {isGrandOpeningLead ? (
            <div className="rounded-2xl border border-[#caa24c]/25 bg-[#caa24c]/8 p-5 shadow-xl shadow-black/20 luxor-soft-enter">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#caa24c]/25 bg-black/35 text-[#f1d27a]">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-[#f1d27a]">Grand Opening RSVP</p>
                    <p className="mt-2 text-sm leading-6 text-[#d7c29a]/78">
                      This person RSVP&apos;d for the Luxor Grand Opening Showcase. Treat this as an event attendance record first, then a future-event lead if they selected an interest.
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-[#caa24c]/25 bg-black/30 px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#f1d27a]">
                  {lead.rsvp_status ? lead.rsvp_status.replaceAll('_', ' ') : 'Attending'}
                </span>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-5 shadow-xl shadow-black/10 luxor-soft-enter">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Event Details</p>
                  <p className="mt-1 text-xs text-zinc-600">Planning fields for the actual event.</p>
                </div>
                <span className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
                  Edit inline
                </span>
              </div>
              <div className="grid gap-x-8 sm:grid-cols-2">
                {eventDetails.map((item) => (
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
              <div className="mt-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">Internal metadata</p>
                    <p className="mt-1 text-xs text-zinc-600">Source, referrer, and capture fields stay tucked away until you need them.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInternalSignals((current) => !current)}
                    className="inline-flex items-center justify-center rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/20 hover:bg-[#caa24c]/10 hover:text-[#a8792f]"
                  >
                    {showInternalSignals ? 'Hide details' : 'Show details'}
                  </button>
                </div>
                {showInternalSignals ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            </div>
          </div>

          {/* User Message */}
          <div className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 luxor-soft-enter" id="lead-message">
            <h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
              {isGrandOpeningLead ? 'RSVP Notes Payload' : 'Inquiry Message Payload'}
            </h4>
            <p className="text-sm leading-relaxed text-zinc-300 font-medium italic">
              &ldquo;{lead.message || 'No additional message was submitted.'}&rdquo;
            </p>
          </div>

          {/* Chat transcript replay widget if it exists */}
          {chatMessages.length > 0 && (
            <div className="nodal-void-card overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl shadow-black/10 luxor-soft-enter">
              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-6 py-4">
                <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[color:var(--portal-muted)]">Concierge AI Chat Session Replay</h4>
                <span className="rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#a8792f]">Elena Concierge</span>
              </div>
              <div className="space-y-5 bg-[color:var(--portal-card)] p-6 portal-scrollbar">
                {chatMessages.map((msg, index) => {
                  const isUser = msg.role === 'user'
                  return (
                    <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs font-medium leading-relaxed shadow-sm ${
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
          ) : null}

          {activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
          <div id="lead-activity" className="nodal-void-card rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-6 shadow-xl luxor-soft-enter scroll-mt-24">
            <div className="mb-6 border-b border-[color:var(--portal-border)] pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/90">
                  <MessageSquare size={16} className="text-[#caa24c]" />
                  Activity Feed & Timeline
                </h3>

                <div className="flex flex-wrap gap-2">
                  {[
                    { tab: 'all', label: 'All', count: activityCounts.all },
                    { tab: 'notes', label: 'Notes', count: activityCounts.notes },
                    { tab: 'comms', label: 'Calls & Emails', count: activityCounts.comms },
                    { tab: 'system', label: 'Status Logs', count: activityCounts.system },
                  ].map((item) => {
                    const isActive = activeFeedTab === item.tab
                    return (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => setActiveFeedTab(item.tab as typeof activeFeedTab)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition-all ${
                          isActive
                            ? 'border-[#caa24c]/20 bg-[#caa24c]/10 text-[#f1d27a]'
                            : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        <span>{item.label}</span>
                        <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[8px] font-black tracking-[0.12em]">
                          {item.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-600">Newest activity first. Notes, calls, emails, and status updates are split into separate filters.</p>
            </div>

            <div className="mb-6 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
              <form onSubmit={handlePostNote} className="space-y-4">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write the recap, then choose how to tag it."
                  className="h-24 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 font-sans text-xs leading-relaxed text-[color:var(--portal-text)] transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/45 focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  {quickNoteTemplates.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      onClick={() => {
                        setNoteType(template.type)
                        setNoteContent(template.value)
                      }}
                      className="rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--portal-muted)] transition-all hover:border-[#caa24c]/25 hover:bg-[#caa24c]/10 hover:text-[#a8792f]"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteType('note')}
                      aria-pressed={noteType === 'note'}
                      className={`rounded-md border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                        noteType === 'note'
                          ? 'border-blue-500/20 bg-blue-500/10 text-blue-400'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('call_log')}
                      aria-pressed={noteType === 'call_log'}
                      className={`rounded-md border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                        noteType === 'call_log'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      Call
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('email_log')}
                      aria-pressed={noteType === 'email_log'}
                      className={`rounded-md border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                        noteType === 'email_log'
                          ? 'border-[#bd6575]/20 bg-purple-500/10 text-[#bd6575]'
                          : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                      }`}
                    >
                      Email
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingNote || !noteContent.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] transition-all hover:bg-[#caa24c]/20 disabled:opacity-40 active:scale-95"
                  >
                    Post Log <Send size={10} />
                  </button>
                </div>
              </form>
            </div>

            {lead.email ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Zoho Email History</p>
                  <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">
                    {loadingEmailMessages
                      ? `Loading messages for ${lead.email}...`
                      : emailThreadError
                        ? emailThreadError
                        : `${emailMessages.length} sent/received message${emailMessages.length === 1 ? '' : 's'} found for ${lead.email}`}
                  </p>
                </div>
                {zohoReconnectRequired ? (
                  <a
                    href="/api/auth/zoho/login?setup=1"
                    className="rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/15"
                  >
                    Reconnect Zoho Search
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => fetchClientEmailThread(lead.email || '')}
                    disabled={loadingEmailMessages}
                    className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/25 hover:text-[#a8792f] disabled:opacity-50"
                  >
                    {loadingEmailMessages ? 'Syncing...' : 'Refresh Email'}
                  </button>
                )}
              </div>
            ) : null}

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
                        <div className="absolute -left-[32px] top-1 h-3 w-3 rounded-full border-2 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] transition-all group-hover:border-[#caa24c]" />
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
                      <div className="absolute -left-[32px] top-1 h-3 w-3 rounded-full border-2 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] animate-pulse transition-all group-hover:border-[#caa24c]" />
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{note.author}</span>
                        <div className="flex items-center gap-3">
                          <span className={`rounded border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${badgeColor}`}>
                            {typeLabel}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-600">{new Date(note.created_at).toLocaleString()}</span>
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
          </div>
        ) : null}

        {/* Sidebar Panel Column */}
        <div className={`space-y-6 ${
          activeLeadTab === 'overview' || activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes'
            ? 'lg:sticky lg:top-8 lg:self-start'
            : ''
        }`}>
          {activeLeadTab === 'overview' || activeLeadTab === 'activity' || activeLeadTab === 'messages' || activeLeadTab === 'notes' ? (
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

      {/* Invoice drafting modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsInvoiceModalOpen(false)} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-zinc-900 bg-[#080706] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
          </div>
        </div>
      )}

      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setIsBookingModalOpen(false)} />
          <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-900 bg-[#080706] shadow-2xl max-h-[90vh]">
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
          </div>
        </div>
      )}
    </PortalPageFrame>
  )
}

function ClientDossierLoading() {
  return (
    <PortalPageFrame className="">
      <div className="shrink-0 flex items-center justify-between">
        <div className="h-4 w-32 luxor-skeleton rounded" />
        <div className="h-8 w-44 luxor-skeleton rounded-lg" />
      </div>

      <div className="sticky top-0 z-20 rounded-2xl border border-zinc-900/80 bg-black/55 px-3 py-3 shadow-xl shadow-black/20 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-7 w-24 luxor-skeleton rounded-full" />
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-zinc-900 bg-black/36 px-4 py-3 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-4">
              <div className="h-3 w-16 luxor-skeleton rounded" />
              <div className="h-4 w-10 luxor-skeleton rounded-full" />
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="h-6 w-28 luxor-skeleton rounded" />
              <div className="h-4 w-20 luxor-skeleton rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <div className="h-10 w-56 luxor-skeleton rounded-lg" />
          <div className="h-4 w-80 max-w-full luxor-skeleton rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-32 luxor-skeleton rounded-lg" />
          <div className="h-9 w-32 luxor-skeleton rounded-lg" />
          <div className="h-9 w-36 luxor-skeleton rounded-lg" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-zinc-900 bg-zinc-950/50 p-4">
                <div className="h-3 w-24 luxor-skeleton rounded" />
                <div className="mt-4 h-4 w-28 luxor-skeleton rounded" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-6">
            <div className="h-3 w-48 luxor-skeleton rounded" />
            <div className="mt-5 h-5 w-3/4 luxor-skeleton rounded" />
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-black/30 p-6">
            <div className="h-4 w-56 luxor-skeleton rounded" />
            <div className="mt-6 grid gap-3">
              <div className="h-16 luxor-skeleton rounded-xl" />
              <div className="h-16 w-5/6 luxor-skeleton rounded-xl" />
              <div className="h-16 w-4/5 luxor-skeleton rounded-xl" />
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-zinc-900 bg-black/40 p-6">
              <div className="h-5 w-44 luxor-skeleton rounded" />
              <div className="mt-6 grid gap-3">
                <div className="h-14 luxor-skeleton rounded-xl" />
                <div className="h-14 luxor-skeleton rounded-xl" />
                <div className="h-14 w-5/6 luxor-skeleton rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalPageFrame>
  )
}

function LeadLifecycleRail({
  currentStatus,
  isSaving = false,
}: {
  currentStatus: LuxorInquiry['status']
  isSaving?: boolean
}) {
  const steps: Array<{ status: LuxorInquiry['status']; label: string; dateLabel: string }> = [
    { status: 'new', label: 'Inquiry', dateLabel: 'Intake' },
    { status: 'contacted', label: 'Contacted', dateLabel: 'Outreach' },
    { status: 'tour_requested', label: 'Tour', dateLabel: 'Schedule' },
    { status: 'tour_confirmed', label: 'Tour Confirmed', dateLabel: 'Confirmed' },
    { status: 'proposal_sent', label: 'Proposal', dateLabel: 'Sent' },
    { status: 'booked', label: 'Booked', dateLabel: 'Deposit' },
  ]
  const currentIndex = currentStatus === 'closed_lost'
    ? -1
    : Math.max(0, steps.findIndex((step) => step.status === currentStatus))

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => {
          const isDone = currentIndex >= index && currentIndex !== -1
          const isCurrent = currentIndex === index
          const segmentFilled = currentIndex > index && currentIndex !== -1
          return (
            <div key={step.status} className="relative min-w-0">
              {index < steps.length - 1 ? (
                <span className="absolute left-[calc(50%+1.2rem)] right-[calc(-50%+1.2rem)] top-4 hidden h-px overflow-hidden bg-[color:var(--portal-border)] xl:block">
                  <span
                    className={`block h-full bg-[#caa24c] transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${segmentFilled ? 'w-full' : 'w-0'}`}
                    style={{ transitionDelay: segmentFilled ? '120ms' : '0ms' }}
                  />
                </span>
              ) : null}
              <div className="relative flex flex-col items-center text-center">
                <span className={`relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border text-[10px] font-black transition-colors duration-300 ${
                  isDone
                    ? 'border-[#caa24c] text-white shadow-lg shadow-[#caa24c]/20'
                    : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)]'
                }`}>
                  <span
                    className={`absolute inset-x-0 bottom-0 bg-[#caa24c] transition-[height] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isDone ? 'h-full' : 'h-0'}`}
                    style={{ transitionDelay: isDone ? `${Math.max(0, index - 1) * 90 + 220}ms` : '0ms' }}
                  />
                  <span className={`relative z-10 transition-opacity duration-200 ${isDone ? 'opacity-0' : 'opacity-100'}`}>
                    {index + 1}
                  </span>
                  <Check
                    size={13}
                    className={`absolute z-10 transition-all duration-200 ${isDone ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                    style={{ transitionDelay: isDone ? `${Math.max(0, index - 1) * 90 + 620}ms` : '0ms' }}
                  />
                </span>
                <span className={`mt-2 truncate text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${isCurrent ? 'text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}>
                  {step.label}{isCurrent && isSaving ? '...' : ''}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold text-[color:var(--portal-faint)]">{step.dateLabel}</span>
              </div>
            </div>
          )
        })}
      </div>
      {currentStatus === 'closed_lost' ? (
        <p className="mt-3 rounded-lg border border-zinc-500/15 bg-zinc-500/5 px-3 py-2 text-xs font-semibold text-[color:var(--portal-muted)]">
          This lead is currently marked closed lost. Re-open it if the client comes back.
        </p>
      ) : null}
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
