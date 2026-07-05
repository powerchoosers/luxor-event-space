'use client'

import React, { useEffect, useState, use, startTransition } from 'react'
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
} from 'lucide-react'
import { LuxorBooking, LuxorInquiry, LuxorNote, LuxorTask, LuxorInvoice, LuxorInvoiceLineItem } from '@/lib/luxorInquiryTypes'
import { PortalPageFrame, PortalPageHeader, PortalStatusBadge, PortalSelect, PortalDatePicker } from '@/components/portal/PortalUI'

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

  // Status editing state
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Timeline tab filtering
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'notes' | 'comms' | 'system'>('all')

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Fetch lead
      const leadRes = await fetch(`/api/inquiries?id=${id}`)
      if (!leadRes.ok) throw new Error('Failed to fetch lead details.')
      const leadData = await leadRes.json()
      setLead(leadData)

      // Fetch notes
      const notesRes = await fetch(`/api/notes?inquiryId=${id}`)
      if (notesRes.ok) {
        const notesData = await notesRes.json()
        setNotes(notesData)
      }

      // Fetch tasks
      const tasksRes = await fetch(`/api/tasks?inquiryId=${id}`)
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json()
        setTasks(tasksData)
      }

      // Fetch invoices
      const invoicesRes = await fetch(`/api/invoices?inquiryId=${id}`)
      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json()
        setInvoices(invoicesData)
      }

      const bookingsRes = await fetch(`/api/bookings?inquiryId=${id}`)
      if (bookingsRes.ok) {
        const bookingsData = await bookingsRes.json()
        setBookings(bookingsData)
      }
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

  const handleStatusChange = async (newStatus: string) => {
    if (!lead) return
    try {
      setUpdatingStatus(true)
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

  const handleCreateBookingFromLead = async () => {
    if (!lead) return

    const eventDate = window.prompt('Event date for the booking? Use YYYY-MM-DD format.')
    if (!eventDate) return

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiry_id: lead.id,
          client_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          event_type: lead.event_type,
          event_date: eventDate,
          guest_count: lead.guest_count,
          status: 'tentative',
          contract_total: getInvoiceTotal(),
          deposit_required: Math.round(getInvoiceTotal() * 0.25),
          notes: lead.message,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create booking.')
      await handleStatusChange('booked')
      await fetchAllData()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create booking.')
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
        <Link href="/portal/leads" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300 transition-all hover:text-white">
          <ArrowLeft size={12} /> Back to Leads
        </Link>
      </div>
    )
  }

  // Parse chat logs if available in metadata
  const chatMessages = (lead.metadata?.chatMessages as { role: string; content: string }[]) || []
  const isGrandOpeningLead = isGrandOpeningRsvp(lead)

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between">
        <Link href="/portal/leads" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-white">
          <ArrowLeft size={14} /> Back to Leads
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Lead Lifecycle:</span>
          <PortalSelect
            value={lead.status}
            disabled={updatingStatus}
            onChange={handleStatusChange}
            options={[
              { value: 'new', label: 'New Inquiry' },
              { value: 'contacted', label: 'Contacted' },
              { value: 'tour_requested', label: 'Tour Requested' },
              { value: 'tour_confirmed', label: 'Tour Confirmed' },
              { value: 'proposal_sent', label: 'Proposal Sent' },
              { value: 'booked', label: 'Booked (Won)' },
              { value: 'closed_lost', label: 'Closed Lost' }
            ]}
          />
        </div>
      </div>

      <PortalPageHeader
        icon={<User size={18} />}
        title={lead.full_name}
        description={`Event Profile: ${lead.event_type || 'Quinceañera'} • Captured via ${formatSourceLabel(lead)} on ${new Date(lead.created_at).toLocaleDateString()}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800 transition-all">
                <Mail size={14} /> Email client
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-300 hover:bg-zinc-800 transition-all">
                <Phone size={14} /> Call client
              </a>
            )}
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-lg hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all"
            >
              <DollarSign size={14} /> Draft Invoice
            </button>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)] lg:overflow-hidden">
        {/* Main Details and Activity Column */}
        <div className="portal-scrollbar min-h-0 space-y-6 overflow-y-auto pr-1 lg:pr-3" data-client-scroll-column="main">
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

          {/* Detail Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 luxor-soft-enter">
            <DetailItem label="Event Type" value={lead.event_type || 'Quinceañera'} subtext="Spanish ñ spelling active" />
            <DetailItem label="Guest Count" value={lead.guest_count ? `${lead.guest_count} guests` : 'Unspecified'} />
            {isGrandOpeningLead ? (
              <>
                <DetailItem label="RSVP Campaign" value="Grand Opening Showcase" subtext={lead.campaign_key || 'grand opening'} />
                <DetailItem label="Attending Count" value={`${lead.attendee_count || lead.guest_count || 1} attending`} />
                <DetailItem label="News Signup" value={lead.marketing_opt_in ? 'Yes' : 'No'} />
              </>
            ) : null}
            <DetailItem label="Target Date" value={lead.target_date || 'TBD'} />
            <DetailItem label="Preferred Tour Date" value={lead.preferred_tour_date || 'No tour requested'} />
            <DetailItem label="Preferred Tour Time" value={lead.preferred_tour_time || 'N/A'} />
            <DetailItem label="Email" value={lead.email || 'None'} />
            <DetailItem label="Phone" value={lead.phone || 'None'} />
            <DetailItem label="Flow Type" value={lead.flow.replaceAll('_', ' ')} isMono />
            <DetailItem label="Source Node" value={formatSourceLabel(lead)} isMono />
          </div>

          {/* User Message */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-zinc-950/20 p-6 luxor-soft-enter">
            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500 mb-3">
              {isGrandOpeningLead ? 'RSVP Notes Payload' : 'Inquiry Message Payload'}
            </h4>
            <p className="text-sm leading-relaxed text-zinc-300 font-medium italic">
              &ldquo;{lead.message || 'No additional message was submitted.'}&rdquo;
            </p>
          </div>

          {/* Chat transcript replay widget if it exists */}
          {chatMessages.length > 0 && (
            <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-zinc-950/30 overflow-hidden shadow-2xl luxor-soft-enter">
              <div className="bg-zinc-950/90 border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Concierge AI Chat Session Replay</h4>
                <span className="text-[9px] font-bold text-[#caa24c] bg-[#caa24c]/5 border border-[#caa24c]/10 px-2 py-0.5 rounded uppercase">Elena Concierge</span>
              </div>
              <div className="p-6 max-h-[350px] overflow-y-auto space-y-4 portal-scrollbar bg-black/40">
                {chatMessages.map((msg, index) => {
                  const isUser = msg.role === 'user'
                  return (
                    <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs font-medium leading-relaxed ${
                        isUser
                          ? 'bg-[#caa24c]/10 text-white border border-[#caa24c]/20'
                          : 'bg-zinc-900 text-zinc-300 border border-zinc-800/50'
                      }`}>
                        <div className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 mb-1">
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

          {/* Activity Logs & Notes Section */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/20 shadow-xl luxor-soft-enter">
            <div id="client-activity-log" className="scroll-mt-4" />
            <div className="flex flex-col gap-4 mb-6 border-b border-zinc-900 pb-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-white/90 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#caa24c]" />
                Activity Feed & Timeline
              </h3>
              
              <div className="flex border border-zinc-800 rounded-md p-0.5 bg-zinc-950/60 font-semibold text-[9px] tracking-widest uppercase">
                {(['all', 'notes', 'comms', 'system'] as const).map((tab) => {
                  const labelMap = {
                    all: 'All',
                    notes: 'Notes',
                    comms: 'Calls & Emails',
                    system: 'Status Logs',
                  }
                  const isActive = activeFeedTab === tab
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveFeedTab(tab)}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/20'
                          : 'text-zinc-500 hover:text-zinc-350'
                      }`}
                    >
                      {labelMap[tab]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-8 bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl">
              <form onSubmit={handlePostNote} className="space-y-4">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Record call summary, email response details, or general client notes..."
                  className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors leading-relaxed font-sans"
                />
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteType('note')}
                      className={`px-3 py-1.5 rounded-md text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'note'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      General Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('call_log')}
                      className={`px-3 py-1.5 rounded-md text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'call_log'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      Call Log
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('email_log')}
                      className={`px-3 py-1.5 rounded-md text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'email_log'
                          ? 'bg-purple-500/10 text-[#bd6575] border-[#bd6575]/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      Email Thread
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={submittingNote || !noteContent.trim()}
                    className="inline-flex items-center gap-1.5 bg-[#caa24c]/10 text-[#f1d27a] border border-[#caa24c]/30 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-[#caa24c]/20 disabled:opacity-40 transition-all active:scale-95 hover:scale-105"
                  >
                    Post Log <Send size={10} />
                  </button>
                </div>
              </form>
            </div>

            {(() => {
              const filteredNotes = notes.filter((note) => {
                if (activeFeedTab === 'notes') return note.note_type === 'note'
                if (activeFeedTab === 'comms') return note.note_type === 'call_log' || note.note_type === 'email_log'
                if (activeFeedTab === 'system') return note.note_type === 'status_change'
                return true
              })

              return filteredNotes.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-650 italic">
                  No workspace entries match the active filter.
                </div>
              ) : (
                <div className="relative border-l border-zinc-900 pl-6 space-y-6 ml-3">
                  {filteredNotes.map((note) => {
                    let badgeColor = 'bg-zinc-800 text-zinc-400 border-zinc-800/50'
                    let typeLabel = 'System Log'
                    if (note.note_type === 'note') {
                      badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      typeLabel = 'Note'
                    } else if (note.note_type === 'call_log') {
                      badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      typeLabel = 'Call Log'
                    } else if (note.note_type === 'email_log') {
                      badgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      typeLabel = 'Email'
                    } else if (note.note_type === 'status_change') {
                      badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      typeLabel = 'Status'
                    }

                    return (
                      <div key={note.id} className="relative group">
                        <div className="absolute -left-[32px] top-1 h-3 w-3 rounded-full bg-zinc-900 border-2 border-zinc-800 group-hover:border-[#caa24c] transition-all animate-pulse" />
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{note.author}</span>
                          <div className="flex items-center gap-3">
                            <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${badgeColor}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-600">{new Date(note.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-300 font-medium leading-relaxed whitespace-pre-wrap">{note.content}</p>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Sidebar Panel Column */}
        <div className="portal-scrollbar min-h-0 space-y-6 overflow-y-auto pr-1 lg:pr-2" data-client-scroll-column="actions">
          {/* Recommended Client Actions */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl luxor-soft-enter">
            <h3 className="font-semibold text-white/90 mb-5 flex items-center gap-2.5">
              <ClipboardCheck size={16} className="text-zinc-500" />
              Recommended Actions
            </h3>
            <div className="grid gap-2.5">
              <ClientActionButton
                icon={<Calendar size={15} />}
                label="Confirm tour scheduled"
                detail="Move lifecycle to tour confirmed"
                onClick={() => handleStatusChange('tour_confirmed')}
                disabled={updatingStatus || lead.status === 'tour_confirmed'}
              />
              <ClientActionButton
                icon={<NotebookPen size={15} />}
                label="Log a quick call note"
                detail="Jump to the activity feed"
                onClick={() => {
                  setNoteType('call_log')
                  document.getElementById('client-activity-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              />
              <ClientActionButton
                icon={<FileSignature size={15} />}
                label="Mark proposal sent"
                detail="Use after sending pricing"
                onClick={() => handleStatusChange('proposal_sent')}
                disabled={updatingStatus || lead.status === 'proposal_sent'}
              />
              <ClientActionButton
                icon={<ReceiptText size={15} />}
                label="Draft booking invoice"
                detail="Create deposit or event invoice"
                onClick={() => setIsInvoiceModalOpen(true)}
              />
              <ClientActionButton
                icon={<FileSignature size={15} />}
                label="Create booking record"
                detail="Adds this client to booked event calendar"
                onClick={handleCreateBookingFromLead}
              />
            </div>
          </div>

          {/* Tasks List Card */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl luxor-soft-enter">
            <h3 className="font-semibold text-white/90 mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <Briefcase size={16} className="text-zinc-500" />
                Tasks & Checklist
              </span>
              <span className="font-mono text-xs text-zinc-500">{tasks.filter((t) => t.status === 'pending').length} remaining</span>
            </h3>

            {/* Quick Task Add Form */}
            <form onSubmit={handleAddTask} className="mb-6 space-y-3 bg-zinc-950/50 border border-zinc-900 p-3 rounded-lg">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="New follow-up task..."
                className="w-full bg-zinc-950 border border-zinc-900 text-xs text-zinc-300 rounded px-2.5 py-1.5 outline-none focus:border-blue-500"
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
                    { value: 'urgent', label: 'Urgent' }
                  ]}
                />
              </div>
              <button
                type="submit"
                disabled={submittingTask || !taskTitle.trim()}
                className="w-full py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase tracking-widest disabled:opacity-40"
              >
                Add Task
              </button>
            </form>

            {tasks.length === 0 ? (
              <p className="text-center py-4 text-xs text-zinc-600">No follow-up tasks currently assigned.</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto portal-scrollbar">
                {tasks.map((task) => {
                  const isCompleted = task.status === 'completed'
                  let prioColor = 'text-zinc-500 bg-zinc-500/5'
                  if (task.priority === 'high') prioColor = 'text-amber-500 bg-amber-500/5 border-amber-500/10'
                  else if (task.priority === 'urgent') prioColor = 'text-red-500 bg-red-500/5 border-red-500/10 animate-pulse'

                  return (
                    <div key={task.id} className="flex items-start justify-between gap-3 p-3 border border-zinc-900 rounded-lg hover:border-zinc-800 transition-colors">
                      <button
                        onClick={() => handleToggleTask(task)}
                        className="p-0.5 rounded text-zinc-500 hover:text-blue-500 transition-colors mt-0.5"
                      >
                        {isCompleted ? (
                          <CheckCircle2 size={16} className="text-emerald-500" />
                        ) : (
                          <Circle size={16} className="text-zinc-700" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold text-white/95 truncate leading-tight ${isCompleted ? 'line-through text-zinc-600 font-medium' : ''}`}>
                          {task.title}
                        </p>
                        {task.due_date && (
                          <p className="text-[10px] font-mono text-zinc-500 mt-1 flex items-center gap-1">
                            <Clock size={10} /> {new Date(task.due_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${prioColor}`}>
                        {task.priority}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Booking and Contract Card */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl luxor-soft-enter">
            <h3 className="font-semibold text-white/90 mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <FileSignature size={16} className="text-zinc-500" />
                Booking & Contract
              </span>
              <span className="font-mono text-xs text-zinc-500">{bookings.length} records</span>
            </h3>

            {bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-xs leading-5 text-zinc-500">
                No booking record is linked yet. Once this lead becomes a reserved event, the booked event calendar and contract signing flow will use that booking.
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div key={booking.id} className="rounded-xl border border-zinc-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{booking.event_date || 'Event date TBD'}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {(booking.contract_status || 'not_sent').replaceAll('_', ' ')} • ${Number(booking.contract_total || 0).toLocaleString()}
                        </p>
                      </div>
                      <PortalStatusBadge status={booking.status} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendContract(booking.id)}
                      disabled={booking.contract_status === 'signed'}
                      className="mt-4 w-full rounded-lg border border-[#caa24c]/20 bg-[#caa24c]/8 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#f1d27a] hover:bg-[#caa24c]/12 disabled:opacity-45"
                    >
                      {booking.contract_status === 'signed' ? 'Contract Signed' : 'Send Contract'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoices List Card */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl luxor-soft-enter">
            <h3 className="font-semibold text-white/90 mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <FileText size={16} className="text-zinc-500" />
                Invoices & Revenue
              </span>
              <button
                onClick={() => setIsInvoiceModalOpen(true)}
                className="text-[10px] font-black uppercase text-blue-500 tracking-wider flex items-center gap-1 hover:text-blue-400"
              >
                <Plus size={12} /> New Invoice
              </button>
            </h3>

            {invoices.length === 0 ? (
              <p className="text-center py-4 text-xs text-zinc-600">No invoice records generated yet.</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((inv) => (
                  <div key={inv.id} className="p-4 border border-zinc-900 rounded-xl hover:border-zinc-800 transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{inv.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-sm font-mono font-bold text-white mt-1">${inv.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      {inv.due_date && <p className="text-[10px] text-zinc-600 mt-1">Due: {new Date(inv.due_date).toLocaleDateString()}</p>}
                    </div>
                    <PortalStatusBadge status={inv.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
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
    </PortalPageFrame>
  )
}

function ClientDossierLoading() {
  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between">
        <div className="h-4 w-32 luxor-skeleton rounded" />
        <div className="h-8 w-44 luxor-skeleton rounded-lg" />
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

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.95fr)] lg:overflow-hidden">
        <div className="portal-scrollbar min-h-0 space-y-6 overflow-y-auto pr-1 lg:pr-3">
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

        <div className="portal-scrollbar min-h-0 space-y-6 overflow-y-auto pr-1 lg:pr-2">
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

function ClientActionButton({
  icon,
  label,
  detail,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  detail: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-950/55 px-3.5 py-3 text-left transition-all hover:border-[#caa24c]/25 hover:bg-[#caa24c]/5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-zinc-900 disabled:hover:bg-zinc-950/55"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-black/50 text-zinc-500 transition-colors group-hover:text-[#f1d27a]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-zinc-200 group-hover:text-white transition-colors">{label}</span>
        <span className="mt-1 block text-[10px] font-medium leading-4 text-zinc-655">{detail}</span>
      </span>
    </button>
  )
}

function DetailItem({
  label,
  value,
  isMono = false,
  subtext,
}: {
  label: string
  value: string
  isMono?: boolean
  subtext?: string
}) {
  return (
    <div className="luxor-glass-card hover:translate-y-[-2px] p-4 rounded-xl shadow-lg">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-550 mb-2">{label}</div>
      <p className={`text-xs font-bold text-zinc-200 leading-normal ${isMono ? 'font-mono' : ''}`}>
        {value}
      </p>
      {subtext && <p className="text-[9px] text-[#caa24c] mt-1 font-medium italic">{subtext}</p>}
    </div>
  )
}

function isGrandOpeningRsvp(lead: LuxorInquiry) {
  return lead.campaign_key === 'grand_opening_2026_07_25' || lead.flow === 'grand_opening_rsvp' || lead.source === 'grand_opening_rsvp'
}

function formatSourceLabel(lead: LuxorInquiry) {
  return isGrandOpeningRsvp(lead) ? 'Grand Opening RSVP' : lead.source.replaceAll('_', ' ')
}
