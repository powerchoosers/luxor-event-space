'use client'

import React, { useEffect, useState } from 'react'
import {
  Search,
  History,
  Inbox,
  ExternalLink,
  Mail,
  Send
} from 'lucide-react'
import Link from 'next/link'
import { LuxorInquiry, LuxorInquiryStatus, LuxorNote } from '@/lib/luxorInquiryTypes'
import { PortalPageFrame, PortalPageHeader, PortalSelect, PortalStatusBadge, PortalContactAvatar } from '@/components/portal/PortalUI'

const INQUIRY_STATUS_OPTIONS: { value: LuxorInquiryStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'tour_requested', label: 'Tour Requested' },
  { value: 'tour_confirmed', label: 'Tour Confirmed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

type ZohoInboxMessage = {
  id: string
  subject: string
  from: string
  to: string
  cc?: string
  receivedAt: string | null
  summary: string
  hasAttachment: boolean
  direction?: 'incoming' | 'outgoing' | 'matched'
}

export default function CommunicationsPage() {
  const [inquiries, setInquiries] = useState<LuxorInquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  
  // Selected Inquiry Details
  const [notes, setNotes] = useState<LuxorNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [noteContent, setNoteContent] = useState('')
  const [noteType, setNoteType] = useState<'email_log' | 'call_log' | 'note'>('email_log')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [sendFrom, setSendFrom] = useState('hello@luxoratlaspalmas.com')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailContent, setEmailContent] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSendStatus, setEmailSendStatus] = useState<string | null>(null)
  const [emailMessages, setEmailMessages] = useState<ZohoInboxMessage[]>([])
  const [loadingEmailMessages, setLoadingEmailMessages] = useState(false)
  const [emailThreadError, setEmailThreadError] = useState<string | null>(null)
  const [zohoReconnectRequired, setZohoReconnectRequired] = useState(false)

  const selectedInquiry = inquiries.find((i) => i.id === selectedId)

  const fetchInquiries = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/inquiries')
      if (!res.ok) throw new Error('Failed to load inquiries.')

      const data = await res.json()
      setInquiries(data)
      if (data.length > 0) {
        setSelectedId((current) => current ?? data[0].id)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load communication queue.')
    } finally {
      setLoading(false)
    }
  }

  const fetchNotes = async (inqId: string) => {
    try {
      setLoadingNotes(true)
      const res = await fetch(`/api/notes?inquiryId=${inqId}`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingNotes(false)
    }
  }

  const fetchClientEmailThread = async (email: string) => {
    if (!email) {
      setEmailMessages([])
      setEmailThreadError(null)
      return
    }

    try {
      setLoadingEmailMessages(true)
      setEmailThreadError(null)
      setZohoReconnectRequired(false)
      const res = await fetch(`/api/email/inbox?limit=50&email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({})) as {
        mailbox?: string
        messages?: ZohoInboxMessage[]
        error?: string
        reconnectRequired?: boolean
      }
      if (!res.ok) {
        setZohoReconnectRequired(Boolean(data.reconnectRequired))
        throw new Error(data.error || 'Unable to load client email history.')
      }
      setEmailMessages(data.messages || [])
    } catch (err) {
      setEmailMessages([])
      const message = err instanceof Error ? err.message : 'Unable to load client email history.'
      setEmailThreadError(message)
      setZohoReconnectRequired((current) => current || message.includes('reconnected with email search permission'))
    } finally {
      setLoadingEmailMessages(false)
    }
  }

  useEffect(() => {
    fetchInquiries()
  }, [])

  useEffect(() => {
    const email = selectedInquiry?.email || ''
    fetchClientEmailThread(email)

    if (!email) return

    const interval = setInterval(() => fetchClientEmailThread(email), 60000)
    return () => clearInterval(interval)
  }, [selectedInquiry?.email])

  useEffect(() => {
    if (selectedId) {
      fetchNotes(selectedId)
    }
  }, [selectedId])

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedId || !noteContent.trim()) return

    try {
      setSubmittingNote(true)
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: selectedId,
          content: noteContent,
          noteType,
          author: 'Admin Owner',
        }),
      })

      if (res.ok) {
        const newNote = await res.json()
        setNotes((prev) => [...prev, newNote])
        setNoteContent('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedInquiry?.email || !emailSubject.trim() || !emailContent.trim()) return

    try {
      setSendingEmail(true)
      setEmailSendStatus(null)

      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedInquiry.email,
          from: sendFrom,
          fromName: 'Luxor Event Space',
          subject: emailSubject,
          content: emailContent,
        }),
      })

      const result = (await res.json().catch(() => ({}))) as { error?: string; messageId?: string }

      if (!res.ok) {
        throw new Error(result.error ?? 'Failed to send email.')
      }

      const logRes = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: selectedInquiry.id,
          content: `Email sent from ${sendFrom} to ${selectedInquiry.email}\nSubject: ${emailSubject}\n\n${emailContent}`,
          noteType: 'email_log',
          author: 'Admin Owner',
        }),
      })

      if (logRes.ok) {
        const newNote = await logRes.json()
        setNotes((prev) => [...prev, newNote])
      }

      setEmailContent('')
      setEmailSubject('')
      setEmailSendStatus(result.messageId ? `Email sent. Zoho message ID: ${result.messageId}` : 'Email sent through Zoho.')
      await fetchClientEmailThread(selectedInquiry.email)
    } catch (err) {
      setEmailSendStatus(err instanceof Error ? err.message : 'Unable to send email.')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleStatusChange = async (newStatus: LuxorInquiryStatus) => {
    if (!selectedInquiry || selectedInquiry.status === newStatus) return

    try {
      setUpdatingStatus(true)
      setInquiries((prev) =>
        prev.map((inquiry) =>
          inquiry.id === selectedInquiry.id ? { ...inquiry, status: newStatus } : inquiry
        )
      )

      const res = await fetch('/api/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedInquiry.id, status: newStatus, author: 'Portal Owner' }),
      })

      if (!res.ok) {
        throw new Error('Failed to update inquiry status.')
      }

      await fetchNotes(selectedInquiry.id)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to update inquiry status.')
      if (selectedInquiry) {
        setInquiries((prev) =>
          prev.map((inquiry) =>
            inquiry.id === selectedInquiry.id ? { ...inquiry, status: selectedInquiry.status } : inquiry
          )
        )
      }
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Filter queue
  const filteredInquiries = inquiries.filter((inq) => {
    return (
      inq.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inq.email && inq.email.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  })

  // Parse chat logs if available
  const chatMessages = (selectedInquiry?.metadata?.chatMessages as { role: string; content: string }[]) || []

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<Inbox size={18} />}
        title="Communications"
        description="Review client email history, send Zoho replies, and record follow-up notes from one contained workspace."
        actions={
          <div className="rounded-lg border border-zinc-900 bg-black/60 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            {inquiries.length} client email channels
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs font-medium text-red-300">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-12">
        {/* Left Side: Queue */}
        <div className="flex min-h-0 flex-col gap-6 overflow-hidden lg:col-span-4">
          <div className="nodal-void-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-900 bg-black/40 shadow-2xl backdrop-blur-xl">
            <div className="p-5 border-b border-zinc-900/50 flex flex-col gap-4">
              <h3 className="font-semibold text-white/90 flex items-center gap-2">
                <History size={16} className="text-zinc-500" />
                Comms Queue
              </h3>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-650" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search history..."
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-300 font-medium placeholder:text-zinc-700"
                />
              </div>
            </div>

            <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto divide-y divide-zinc-900/30">
              {loading ? (
                <p className="text-center py-6 text-xs text-zinc-650 font-semibold tracking-wider">SYNCING QUEUE...</p>
              ) : error ? (
                <p className="text-center py-6 text-xs text-red-300">{error}</p>
              ) : filteredInquiries.length === 0 ? (
                <p className="text-center py-6 text-xs text-zinc-550">No clients match search parameters.</p>
              ) : (
                filteredInquiries.map((inq) => {
                  const isActive = inq.id === selectedId
                  return (
                    <div
                      key={inq.id}
                      onClick={() => setSelectedId(inq.id)}
                      className={`p-5 flex flex-col gap-2 hover:bg-zinc-900/30 transition-all cursor-pointer group ${
                        isActive ? 'bg-[#caa24c]/5 border-l-2 border-[#caa24c]' : 'border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className={`text-xs font-bold uppercase tracking-widest ${isActive ? 'text-white' : 'text-zinc-350'} group-hover:text-[#f1d27a] transition-colors`}>
                          {inq.full_name}
                        </h4>
                        <span className="text-[9px] font-mono text-zinc-600">
                          {new Date(inq.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-550 group-hover:text-zinc-400">
                        <span className="font-semibold">{inq.event_type || 'Quinceañera'}</span>
                        <PortalStatusBadge status={inq.status} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Conversation Frame */}
        <div className="flex min-h-0 flex-col gap-6 overflow-hidden lg:col-span-8">
          {selectedInquiry ? (
            <div className="nodal-void-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-900 bg-black/50 p-1 shadow-2xl">
              {/* Header */}
              <div className="bg-[#0c0c0c] rounded-t-xl py-3.5 px-6 border-b border-zinc-900 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <PortalContactAvatar name={selectedInquiry.full_name} avatarUrl={selectedInquiry.metadata?.avatar_url as string | null} size="md" />
                  <div>
                    <Link
                      href={`/portal/leads/${selectedInquiry.id}`}
                      className="text-xs font-bold text-white uppercase tracking-widest leading-none hover:text-[#f1d27a] inline-flex items-center gap-1"
                    >
                      {selectedInquiry.full_name} <ExternalLink size={12} className="text-zinc-650" />
                    </Link>
                    <p className="text-[10px] text-zinc-500 font-medium mt-1">
                      {selectedInquiry.email || selectedInquiry.phone || 'No direct contact'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <PortalSelect
                    value={selectedInquiry.status}
                    onChange={(value) => handleStatusChange(value as LuxorInquiryStatus)}
                    options={INQUIRY_STATUS_OPTIONS}
                    className="min-w-[180px]"
                    disabled={updatingStatus}
                  />
                  <PortalStatusBadge status={selectedInquiry.status} />
                </div>
              </div>

              {/* Chat Timeline & Log Feed */}
              <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-transparent to-black/20 p-6 space-y-6">
                <form onSubmit={handleSendEmail} className="rounded-xl border border-[#caa24c]/16 bg-black/35 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Mail size={15} className="text-[#f1d27a]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-450">Send Zoho Email</span>
                    </div>
                    <PortalSelect
                      value={sendFrom}
                      onChange={setSendFrom}
                      className="ml-auto w-[260px]"
                      options={[
                        { value: 'hello@luxoratlaspalmas.com', label: 'hello@luxoratlaspalmas.com' },
                        { value: 'booking@luxoratlaspalmas.com', label: 'booking@luxoratlaspalmas.com' },
                      ]}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                    <input
                      type="email"
                      value={selectedInquiry.email || ''}
                      readOnly
                      className="rounded-md border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs text-zinc-500 outline-none"
                      placeholder="Client has no email"
                    />
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(event) => setEmailSubject(event.target.value)}
                      className="rounded-md border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none focus:border-[#caa24c]"
                      placeholder="Subject"
                    />
                  </div>

                  <textarea
                    value={emailContent}
                    onChange={(event) => setEmailContent(event.target.value)}
                    className="min-h-28 w-full resize-none rounded-md border border-zinc-900 bg-zinc-950 px-3 py-3 text-xs leading-5 text-zinc-300 outline-none focus:border-[#caa24c]"
                    placeholder="Write the message to send through Zoho..."
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-[11px] font-medium ${emailSendStatus?.startsWith('Email sent') ? 'text-emerald-300' : 'text-zinc-500'}`}>
                      {emailSendStatus || (selectedInquiry.email ? `Ready to send to ${selectedInquiry.email}` : 'Add a client email before sending.')}
                    </p>
                    <button
                      type="submit"
                      disabled={sendingEmail || !selectedInquiry.email || !emailSubject.trim() || !emailContent.trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-[#caa24c] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#f1d27a] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send size={13} />
                      {sendingEmail ? 'Sending' : 'Send Email'}
                    </button>
                  </div>
                </form>

                <div className="rounded-xl border border-zinc-900 bg-black/30 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Mail size={15} className="text-[#f1d27a]" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-450">Client Email History</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-600">
                      {selectedInquiry.email || 'No client email'}
                    </span>
                  </div>

                  {!selectedInquiry.email ? (
                    <p className="text-xs text-zinc-600 italic">Add a client email address to see their sent and received Zoho messages.</p>
                  ) : loadingEmailMessages && emailMessages.length === 0 ? (
                    <p className="text-xs text-zinc-650 italic">Loading emails for {selectedInquiry.email}...</p>
                  ) : emailThreadError ? (
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                      <p className="text-xs leading-5 text-rose-300">{emailThreadError}</p>
                      {zohoReconnectRequired ? (
                        <a
                          href="/api/auth/zoho/login?setup=1"
                          className="mt-3 inline-flex rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-200 transition-colors hover:bg-rose-500/15"
                        >
                          Reconnect Zoho Search
                        </a>
                      ) : null}
                    </div>
                  ) : emailMessages.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic">No Zoho messages found yet for this email address.</p>
                  ) : (
                    <div className="space-y-2">
                      {emailMessages.map((message) => (
                        <div key={message.id || `${message.from}-${message.subject}`} className="rounded-lg border border-zinc-900 bg-zinc-950/70 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className={`shrink-0 rounded border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                  message.direction === 'outgoing'
                                    ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
                                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                }`}>
                                  {message.direction === 'outgoing' ? 'Sent' : 'Received'}
                                </span>
                                <p className="truncate text-xs font-bold text-zinc-200">{message.subject}</p>
                              </div>
                              <p className="mt-1 truncate text-[10px] text-zinc-500">
                                From {message.from || 'Unknown'} {message.to ? `to ${message.to}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 text-[9px] font-mono text-zinc-600">
                              {formatZohoMessageDate(message.receivedAt)}
                            </span>
                          </div>
                          {message.summary ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-zinc-400">{message.summary}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Concierge Replay */}
                {chatMessages.length > 0 && (
                  <div className="space-y-4 border-b border-zinc-900/60 pb-6">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-zinc-550">
                      <span>Interactive Chat Transcript Log</span>
                      <span className="text-[#caa24c]">Elena Concierge Widget</span>
                    </div>
                    {chatMessages.map((msg, index) => {
                      const isUser = msg.role === 'user'
                      return (
                        <div key={index} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-[#caa24c]/10 text-white border border-[#caa24c]/20'
                              : 'bg-zinc-900 text-zinc-300 border border-zinc-850'
                          }`}>
                            <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block mb-1">
                              {isUser ? 'Client' : 'Concierge'}
                            </span>
                            {msg.content}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Internal Comms Log Feed */}
                <div className="space-y-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-550 mb-4">
                    Owner Follow-Up Notes
                  </div>

                  {loadingNotes ? (
                    <p className="text-xs text-zinc-650 italic text-center">Syncing history...</p>
                  ) : notes.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic text-center">No owner follow-up logs recorded.</p>
                  ) : (
                    <div className="relative border-l border-zinc-900 pl-6 space-y-6 ml-3">
                      {notes.map((note) => {
                        let typeColor = 'bg-zinc-900 text-zinc-450 border-zinc-800'
                        let typeLabel = 'Note'
                        if (note.note_type === 'call_log') {
                          typeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          typeLabel = 'Call Log'
                        } else if (note.note_type === 'email_log') {
                          typeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          typeLabel = 'Email Log'
                        } else if (note.note_type === 'status_change') {
                          typeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          typeLabel = 'Status Change'
                        }

                        return (
                          <div key={note.id} className="relative">
                            <div className="absolute -left-[32px] top-1 h-3 w-3 rounded-full bg-zinc-950 border-2 border-zinc-850" />
                            <div className="flex items-center justify-between gap-3 flex-wrap text-[10px] font-bold uppercase tracking-wider text-zinc-550 mb-1.5">
                              <span>{note.author}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] font-bold tracking-widest px-2 py-0.5 rounded border ${typeColor}`}>{typeLabel}</span>
                                <span className="text-[9px] font-mono text-zinc-600">{new Date(note.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-300 font-medium whitespace-pre-wrap leading-relaxed">{note.content}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Note Logging Form */}
              <div className="p-5 border-t border-zinc-900 bg-[#0c0c0c] rounded-b-xl">
                <form onSubmit={handlePostNote} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteType('email_log')}
                      className={`px-3 py-1 rounded text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'email_log'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      Log Email Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('call_log')}
                      className={`px-3 py-1 rounded text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'call_log'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      Log Call Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType('note')}
                      className={`px-3 py-1 rounded text-[9px] uppercase font-bold tracking-widest border transition-all ${
                        noteType === 'note'
                          ? 'bg-[#caa24c]/10 text-[#f1d27a] border-[#caa24c]/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      General Note
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Type the follow-up details to record, such as proposal sent manually or call outcome..."
                      className="flex-1 bg-zinc-950 border border-zinc-900 text-xs text-zinc-300 rounded px-3 py-2 outline-none focus:border-[#caa24c]"
                    />
                    <button
                      type="submit"
                      disabled={submittingNote || !noteContent.trim()}
                      className="bg-[#caa24c] hover:bg-[#f1d27a] text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest disabled:opacity-40"
                    >
                      Record Log
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center border border-zinc-900 rounded-2xl bg-black/40 text-xs text-zinc-650 font-bold uppercase tracking-wider">
              No Client Inquiries Available
            </div>
          )}
        </div>
      </div>
    </PortalPageFrame>
  )
}

function formatZohoMessageDate(value: string | null) {
  if (!value) return 'No date'

  const numericValue = Number(value)
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
