'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Inbox,
  Send,
  Sparkles,
  Star,
  Search,
  RefreshCw,
  Mail,
  Plus,
  Paperclip,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import { PortalContactAvatar } from '@/components/portal/PortalUI'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'

export interface EmailMessageItem {
  id: string
  subject: string
  from: string
  to: string
  cc?: string
  receivedAt: string | null
  summary: string
  content?: string
  htmlContent?: string | null
  hasAttachment: boolean
  direction?: 'incoming' | 'outgoing' | 'campaign'
  folder?: 'inbox' | 'sent' | 'campaigns'
  category?: string
  isStarred?: boolean
  isRead?: boolean
  threadId?: string
  folderId?: string
}

interface EmailThreadData {
  threadId: string
  clientEmail: string
  messages: EmailMessageItem[]
  inquiry: LuxorInquiry | null
  notes: Array<{ id: string; content: string; author: string; created_at: string }>
  bookings: Array<{ id: string; status: string; event_date: string | null; package_name: string | null }>
}

type ActiveFolder = 'all' | 'inbox' | 'sent' | 'campaigns' | 'starred'
type FilterChip = 'all' | 'unread' | 'incoming' | 'outgoing' | 'campaigns' | 'attachments'

interface AllEmailsTabProps {
  inquiries?: LuxorInquiry[]
}

export function AllEmailsTab({ inquiries = [] }: AllEmailsTabProps) {
  const [messages, setMessages] = useState<EmailMessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reconnectRequired, setReconnectRequired] = useState(false)

  // Active navigation & filters
  const [activeFolder, setActiveFolder] = useState<ActiveFolder>('all')
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy] = useState<'newest' | 'oldest'>('newest')

  // Selected email detail state
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messageDetail, setMessageDetail] = useState<EmailMessageItem | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [thread, setThread] = useState<EmailThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyInstruction, setReplyInstruction] = useState('')
  const [draftingReply, setDraftingReply] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const [replyStatus, setReplyStatus] = useState<string | null>(null)

  // Reader pane controls
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [viewportWidth, setViewportWidth] = useState<'full' | 'tablet' | 'mobile'>('full')
  const [blockExternalImages, setBlockExternalImages] = useState(false)

  // Starred items tracking (persisted in local state)
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set())
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())

  // Load emails list from API
  const loadEmails = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReconnectRequired(false)
    try {
      const folderParam = activeFolder === 'starred' ? 'all' : activeFolder
      const res = await fetch(`/api/email/inbox?limit=100&folder=${folderParam}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as {
        messages?: EmailMessageItem[]
        error?: string
        reconnectRequired?: boolean
      }

      if (!res.ok) {
        setReconnectRequired(Boolean(data.reconnectRequired))
        throw new Error(data.error || 'Failed to load email inbox.')
      }

      const list = data.messages || []
      setMessages(list)
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to load email client messages.')
    } finally {
      setLoading(false)
    }
  }, [activeFolder, selectedId])

  useEffect(() => {
    void loadEmails()
  }, [loadEmails])

  // Fetch full message detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setMessageDetail(null)
      return
    }

    let isCurrent = true
    const fetchDetail = async () => {
      setLoadingDetail(true)
      try {
        const summary = messages.find((message) => message.id === selectedId)
        const folderQuery = summary?.folderId ? `?folderId=${encodeURIComponent(summary.folderId)}` : ''
        const res = await fetch(`/api/email/messages/${encodeURIComponent(selectedId)}${folderQuery}`, { cache: 'no-store' })
        if (res.ok) {
          const detail = (await res.json()) as EmailMessageItem
          if (isCurrent) {
            setMessageDetail(detail)
            setReadIds((prev) => new Set(prev).add(selectedId))
          }
        } else {
          // Fallback to item in list
          const fallback = messages.find((m) => m.id === selectedId) || null
          if (isCurrent) setMessageDetail(fallback)
        }
      } catch (err) {
        console.error('Error loading email message detail:', err)
        const fallback = messages.find((m) => m.id === selectedId) || null
        if (isCurrent) setMessageDetail(fallback)
      } finally {
        if (isCurrent) setLoadingDetail(false)
      }
    }

    void fetchDetail()
    return () => {
      isCurrent = false
    }
  }, [selectedId, messages])

  useEffect(() => {
    const threadId = messageDetail?.threadId
    if (!threadId || messageDetail?.direction === 'campaign') {
      setThread(null)
      return
    }
    let current = true
    setLoadingThread(true)
    setReplyStatus(null)
    fetch(`/api/email/threads/${encodeURIComponent(threadId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as EmailThreadData & { error?: string }
        if (!response.ok) throw new Error(data.error || 'Unable to load conversation.')
        if (current) setThread(data)
      })
      .catch((error) => {
        console.error(error)
        if (current) setThread(null)
      })
      .finally(() => { if (current) setLoadingThread(false) })
    return () => { current = false }
  }, [messageDetail?.threadId, messageDetail?.direction])

  const draftWithElena = async () => {
    if (!thread?.threadId) return
    setDraftingReply(true)
    setReplyStatus(null)
    try {
      const response = await fetch(`/api/email/threads/${encodeURIComponent(thread.threadId)}/elena-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: replyInstruction }),
      })
      const data = await response.json() as { draft?: string; error?: string }
      if (!response.ok || !data.draft) throw new Error(data.error || 'Elena could not draft a reply.')
      setReplyText(data.draft)
      setReplyStatus('Elena drafted this from the full conversation and client record. Review it before sending.')
    } catch (error) {
      setReplyStatus(error instanceof Error ? error.message : 'Elena could not draft a reply.')
    } finally {
      setDraftingReply(false)
    }
  }

  const sendInlineReply = async () => {
    const replyTo = [...(thread?.messages || [])].reverse().find((message) => message.direction === 'incoming') || messageDetail
    if (!replyTo?.id || !replyText.trim()) return
    setSendingReply(true)
    setReplyStatus(null)
    try {
      const response = await fetch(`/api/email/messages/${encodeURIComponent(replyTo.id)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyText, inquiryId: thread?.inquiry?.id || currentInquiry?.id || null }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Reply could not be sent.')
      setReplyText('')
      setReplyInstruction('')
      setReplyStatus('Reply sent and added to the client activity log.')
      await loadEmails()
    } catch (error) {
      setReplyStatus(error instanceof Error ? error.message : 'Reply could not be sent.')
    } finally {
      setSendingReply(false)
    }
  }

  // Toggle star status
  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setStarredIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Open global compose drawer pre-filled
  const triggerCompose = (lead?: LuxorInquiry, toEmail?: string, replySubject?: string) => {
    window.dispatchEvent(
      new CustomEvent('luxor-compose-email', {
        detail: {
          lead: lead || null,
          email: toEmail || '',
          subject: replySubject || '',
        },
      })
    )
  }

  // Derive filtered message list
  const filteredMessages = useMemo(() => {
    return messages
      .filter((msg) => {
        // Folder filter
        if (activeFolder === 'inbox' && msg.direction === 'outgoing') return false
        if (activeFolder === 'sent' && msg.direction === 'incoming') return false
        if (activeFolder === 'campaigns' && msg.direction !== 'campaign') return false
        if (activeFolder === 'starred' && !starredIds.has(msg.id)) return false

        // Quick filter chips
        if (activeFilter === 'unread' && readIds.has(msg.id)) return false
        if (activeFilter === 'incoming' && msg.direction !== 'incoming') return false
        if (activeFilter === 'outgoing' && msg.direction !== 'outgoing') return false
        if (activeFilter === 'campaigns' && msg.direction !== 'campaign') return false
        if (activeFilter === 'attachments' && !msg.hasAttachment) return false

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchSubject = msg.subject.toLowerCase().includes(q)
          const matchFrom = msg.from.toLowerCase().includes(q)
          const matchTo = msg.to.toLowerCase().includes(q)
          const matchSummary = msg.summary.toLowerCase().includes(q)
          return matchSubject || matchFrom || matchTo || matchSummary
        }

        return true
      })
      .sort((a, b) => {
        const timeA = a.receivedAt ? new Date(a.receivedAt).getTime() : 0
        const timeB = b.receivedAt ? new Date(b.receivedAt).getTime() : 0
        return sortBy === 'newest' ? timeB - timeA : timeA - timeB
      })
  }, [messages, activeFolder, activeFilter, searchQuery, sortBy, starredIds, readIds])

  // Matched inquiry for currently selected email
  const currentInquiry = useMemo(() => {
    if (thread?.inquiry) return thread.inquiry
    if (!messageDetail) return null
    const targetEmail = (messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to).toLowerCase()
    return (
      inquiries.find((inq) => inq.email && targetEmail.includes(inq.email.toLowerCase())) || null
    )
  }, [messageDetail, inquiries, thread?.inquiry])

  // Count stats
  const stats = useMemo(() => {
    const total = messages.length
    const inboxCount = messages.filter((m) => m.direction === 'incoming').length
    const sentCount = messages.filter((m) => m.direction === 'outgoing').length
    const campaignCount = messages.filter((m) => m.direction === 'campaign').length
    const starredCount = messages.filter((m) => starredIds.has(m.id)).length
    return { total, inboxCount, sentCount, campaignCount, starredCount }
  }, [messages, starredIds])

  // Print selected email
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl backdrop-blur-xl font-sans text-[color:var(--portal-text)]">
      {/* PANE 1: Mailbox Folders & Navigation */}
      <div className="w-64 shrink-0 border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 p-4 flex flex-col justify-between hidden md:flex">
        <div className="space-y-6">
          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => triggerCompose()}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#caa24c] hover:bg-[#d4b060] px-4 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-md transition-all cursor-pointer"
          >
            <Plus size={16} className="stroke-[2.5]" />
            Compose Email
          </button>

          {/* Mailbox Navigation List */}
          <div className="space-y-1">
            <p className="px-3 text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-faint)] mb-2">Mailboxes</p>
            
            <FolderNavItem
              icon={<Mail size={15} />}
              label="All Mail"
              count={stats.total}
              active={activeFolder === 'all'}
              onClick={() => setActiveFolder('all')}
            />
            <FolderNavItem
              icon={<Inbox size={15} />}
              label="Inbox"
              count={stats.inboxCount}
              active={activeFolder === 'inbox'}
              onClick={() => setActiveFolder('inbox')}
            />
            <FolderNavItem
              icon={<Send size={15} />}
              label="Sent Items"
              count={stats.sentCount}
              active={activeFolder === 'sent'}
              onClick={() => setActiveFolder('sent')}
            />
            <FolderNavItem
              icon={<Sparkles size={15} />}
              label="Campaign Blasts"
              count={stats.campaignCount}
              active={activeFolder === 'campaigns'}
              onClick={() => setActiveFolder('campaigns')}
            />
            <FolderNavItem
              icon={<Star size={15} />}
              label="Starred"
              count={stats.starredCount}
              active={activeFolder === 'starred'}
              onClick={() => setActiveFolder('starred')}
            />
          </div>
        </div>

        {/* Sync & Mailbox Footer */}
        <div className="pt-4 border-t border-[color:var(--portal-border)] space-y-3">
          <div className="flex items-center justify-between text-[10px] font-mono text-[color:var(--portal-muted)]">
            <span>Zoho & Supabase Sync</span>
            <button
              type="button"
              onClick={() => loadEmails()}
              disabled={loading}
              className="p-1 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors"
              title="Refresh messages"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 p-2.5 text-[10px]">
            <p className="font-bold text-[color:var(--portal-text)] truncate">booking@luxoratlaspalmas.com</p>
            <p className="text-emerald-500 font-mono text-[9px] mt-0.5 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active Connection
            </p>
          </div>
        </div>
      </div>

      {/* PANE 2: Message Threads List */}
      <div className="w-full md:w-80 lg:w-96 shrink-0 border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/20 flex flex-col min-h-0">
        {/* Search & Header */}
        <div className="p-4 border-b border-[color:var(--portal-border)] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[color:var(--portal-text)] uppercase tracking-widest flex items-center gap-2">
              <Inbox size={15} className="text-[#caa24c]" />
              {activeFolder === 'all' && 'All Messages'}
              {activeFolder === 'inbox' && 'Inbox Messages'}
              {activeFolder === 'sent' && 'Sent Correspondence'}
              {activeFolder === 'campaigns' && 'Campaign Blasts'}
              {activeFolder === 'starred' && 'Starred Messages'}
            </h3>
            <span className="text-[10px] font-mono text-[color:var(--portal-muted)]">{filteredMessages.length} items</span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, sender, text..."
              className="w-full bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
            />
          </div>

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto portal-scrollbar pb-1">
            <FilterChipItem label="All" active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
            <FilterChipItem label="Incoming" active={activeFilter === 'incoming'} onClick={() => setActiveFilter('incoming')} />
            <FilterChipItem label="Outgoing" active={activeFilter === 'outgoing'} onClick={() => setActiveFilter('outgoing')} />
            <FilterChipItem label="Campaigns" active={activeFilter === 'campaigns'} onClick={() => setActiveFilter('campaigns')} />
          </div>
        </div>

        {/* Message Item Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar divide-y divide-[color:var(--portal-border)]">
          {loading && messages.length === 0 ? (
            <div className="py-12 text-center text-xs text-[color:var(--portal-muted)] font-mono animate-pulse">
              SYNCING EMAIL STREAM...
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-xs text-rose-400 leading-relaxed">{error}</p>
              {reconnectRequired && (
                <a
                  href="/api/auth/zoho/login?setup=1"
                  className="mt-3 inline-flex rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-400 hover:bg-rose-500/20"
                >
                  Reconnect Zoho Permission
                </a>
              )}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-[color:var(--portal-muted)]">
              No emails match the selected filters or search terms.
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isSelected = msg.id === selectedId
              const isStarred = starredIds.has(msg.id)
              const isRead = readIds.has(msg.id)

              return (
                <div
                  key={msg.id}
                  onClick={() => setSelectedId(msg.id)}
                  className={`p-4 flex flex-col gap-2 transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-[#caa24c]/10 border-l-2 border-[#caa24c]'
                      : 'border-l-2 border-transparent hover:bg-[color:var(--portal-soft)]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <DirectionBadge direction={msg.direction} />
                      <p className={`truncate text-xs font-bold ${isSelected ? 'text-[#a8792f] dark:text-[#f1d27a]' : isRead ? 'text-[color:var(--portal-muted)]' : 'text-[color:var(--portal-text)]'}`}>
                        {msg.direction === 'outgoing' ? `To: ${msg.to || 'Client'}` : msg.from || 'Unknown Sender'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => toggleStar(msg.id, e)}
                        className={`p-1 transition-colors ${isStarred ? 'text-[#caa24c]' : 'text-[color:var(--portal-faint)] hover:text-[color:var(--portal-muted)]'}`}
                      >
                        <Star size={13} className={isStarred ? 'fill-[#caa24c]' : ''} />
                      </button>
                      <span className="text-[9px] font-mono text-[color:var(--portal-faint)]">
                        {formatEmailDate(msg.receivedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Subject Line */}
                  <h4 className={`text-xs truncate font-medium ${isSelected ? 'text-[color:var(--portal-text)] font-bold' : 'text-[color:var(--portal-text)]'}`}>
                    {msg.subject || '(No Subject)'}
                  </h4>

                  {/* Snippet Preview */}
                  <p className="text-[11px] text-[color:var(--portal-muted)] line-clamp-2 leading-relaxed">
                    {msg.summary || 'No preview available.'}
                  </p>

                  {/* Indicators */}
                  {msg.hasAttachment && (
                    <div className="flex items-center gap-1 text-[9px] font-mono text-[color:var(--portal-muted)] mt-1">
                      <Paperclip size={11} /> Has attachments
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* PANE 3: Mainstream Email Detail & Isolated Viewer */}
      <div className="flex-1 min-h-0 bg-[color:var(--portal-card)] flex flex-col hidden lg:flex">
        {selectedId && messageDetail ? (
          <>
            {/* Email Header Bar */}
            <div className="p-6 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DirectionBadge direction={messageDetail.direction} />
                    {messageDetail.category && (
                      <span className="text-[9px] font-mono uppercase bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] px-2 py-0.5 rounded border border-[color:var(--portal-border)]">
                        {messageDetail.category}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-[color:var(--portal-text)] leading-tight">{messageDetail.subject}</h2>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      triggerCompose(
                        currentInquiry || undefined,
                        messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to,
                        `Re: ${messageDetail.subject}`
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#d4b060] transition-all cursor-pointer shadow-xs"
                  >
                    <Send size={13} /> Reply
                  </button>
                  <button
                    type="button"
                    onClick={(e) => toggleStar(messageDetail.id, e)}
                    className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                    title="Star message"
                  >
                    <Star size={14} className={starredIds.has(messageDetail.id) ? 'fill-[#caa24c] text-[#caa24c]' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                    title="Print Email"
                  >
                    <Printer size={14} />
                  </button>
                </div>
              </div>

              {/* Sender / Recipient & Matched Lead Row */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-[color:var(--portal-border)]">
                <div className="flex items-center gap-3">
                  <PortalContactAvatar name={messageDetail.from} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-[color:var(--portal-text)]">{messageDetail.from}</p>
                      {currentInquiry && (
                        <Link
                          href={`/portal/leads/${currentInquiry.id}`}
                          className="inline-flex items-center gap-1 rounded bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/20 hover:bg-[#caa24c]/20"
                        >
                          View Lead File <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-[color:var(--portal-muted)] mt-0.5">
                      To: {messageDetail.to} {messageDetail.cc ? `| CC: ${messageDetail.cc}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-[10px] text-[color:var(--portal-muted)]">
                  <p>{formatEmailDateDetailed(messageDetail.receivedAt)}</p>
                </div>
              </div>

              {/* Reader Controls Toolbar */}
              <div className="flex items-center justify-between gap-3 pt-2 text-[10px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('html')}
                    className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      viewMode === 'html' ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/30' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    HTML View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('text')}
                    className={`px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      viewMode === 'text' ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/30' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    Plain Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockExternalImages(!blockExternalImages)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono transition-colors cursor-pointer ${
                      blockExternalImages ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                    }`}
                  >
                    {blockExternalImages ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                    {blockExternalImages ? 'Images Blocked' : 'Images Safe'}
                  </button>
                </div>

                {/* Device Viewport Preview Mode */}
                <div className="flex items-center gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
                  <button
                    type="button"
                    onClick={() => setViewportWidth('full')}
                    className={`p-1.5 rounded cursor-pointer ${viewportWidth === 'full' ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                    title="Full Width View"
                  >
                    <Monitor size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportWidth('tablet')}
                    className={`p-1.5 rounded cursor-pointer ${viewportWidth === 'tablet' ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                    title="Tablet Preview (768px)"
                  >
                    <Tablet size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportWidth('mobile')}
                    className={`p-1.5 rounded cursor-pointer ${viewportWidth === 'mobile' ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                    title="Mobile Preview (375px)"
                  >
                    <Smartphone size={13} />
                  </button>
                </div>
              </div>
            </div>

            {/* Gmail-style conversation stream and inline reply */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 portal-scrollbar bg-[color:var(--portal-soft)]/20">
              <div className={`mx-auto w-full space-y-3 transition-all duration-300 ${viewportWidth === 'mobile' ? 'max-w-[375px]' : viewportWidth === 'tablet' ? 'max-w-[768px]' : 'max-w-5xl'}`}>
                {(loadingDetail || loadingThread) ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-12 text-[color:var(--portal-muted)] font-mono text-xs">
                    <Loader2 size={15} className="animate-spin" /> LOADING FULL CONVERSATION...
                  </div>
                ) : (
                  (thread?.messages?.length ? thread.messages : [messageDetail]).map((message, index, all) => (
                    <ThreadMessage
                      key={message.id}
                      message={message}
                      expanded={message.id === selectedId || index === all.length - 1}
                      viewMode={viewMode}
                      blockExternalImages={blockExternalImages}
                    />
                  ))
                )}

                {messageDetail.direction !== 'campaign' && (
                  <div className="rounded-2xl border border-[#caa24c]/30 bg-[color:var(--portal-card)] p-5 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-[color:var(--portal-text)]">Reply in this conversation</p>
                        <p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">
                          To {thread?.clientEmail || (messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to)}
                          {thread?.messages?.length ? ` · ${thread.messages.length} messages in thread` : ''}
                        </p>
                      </div>
                      {currentInquiry && (
                        <Link href={`/portal/leads/${currentInquiry.id}`} className="text-[10px] font-bold uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] hover:underline">
                          {currentInquiry.full_name} · View client file
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={replyInstruction}
                        onChange={(event) => setReplyInstruction(event.target.value)}
                        placeholder="Optional note for Elena: confirm the tour and ask about guest count..."
                        className="min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
                      />
                      <button
                        type="button"
                        onClick={() => void draftWithElena()}
                        disabled={draftingReply || loadingThread}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a] hover:bg-[#caa24c]/20 cursor-pointer disabled:opacity-50"
                      >
                        {draftingReply ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        Draft with Elena
                      </button>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      rows={6}
                      placeholder="Write your reply here, or ask Elena to draft it from the full email chain and client history."
                      className="w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className={`text-[10px] ${replyStatus?.startsWith('Reply sent') ? 'text-emerald-500 font-medium' : 'text-[color:var(--portal-muted)]'}`}>{replyStatus}</p>
                      <button
                        type="button"
                        onClick={() => void sendInlineReply()}
                        disabled={sendingReply || !replyText.trim()}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#d4b060] transition-all cursor-pointer shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sendingReply ? <Loader2 size={14} className="animate-spin" /> : replyStatus?.startsWith('Reply sent') ? <Check size={14} /> : <Send size={14} />}
                        Send reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <Mail size={36} className="text-[color:var(--portal-faint)]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Select an email to view full content</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadMessage({
  message,
  expanded: initiallyExpanded,
  viewMode,
  blockExternalImages,
}: {
  message: EmailMessageItem
  expanded: boolean
  viewMode: 'html' | 'text'
  blockExternalImages: boolean
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const html = useMemo(() => buildMessageDocument(message, blockExternalImages), [message, blockExternalImages])

  return (
    <article className={`overflow-hidden rounded-2xl border transition-colors ${expanded ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-md' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/80 hover:bg-[color:var(--portal-card)]'}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-3 p-4 text-left cursor-pointer">
        <PortalContactAvatar name={message.from} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{message.direction === 'outgoing' ? `Luxor to ${message.to}` : message.from}</p>
            <p className="shrink-0 text-[9px] font-mono text-[color:var(--portal-muted)]">{formatEmailDateDetailed(message.receivedAt)}</p>
          </div>
          <p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{expanded ? `To ${message.to}${message.cc ? ` · CC ${message.cc}` : ''}` : message.summary || message.subject}</p>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[color:var(--portal-border)] bg-white">
          {viewMode === 'html' ? (
            <iframe
              srcDoc={html}
              title={`${message.subject} — ${message.id}`}
              className="h-[420px] w-full border-0"
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            />
          ) : (
            <div className="min-h-36 whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed text-zinc-800 bg-white">
              {message.content || message.summary || 'No message body available.'}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function buildMessageDocument(message: EmailMessageItem, blockExternalImages: boolean) {
  let content = message.htmlContent || message.content || `<p>${escapeHtml(message.summary || 'No message body available.')}</p>`
  if (blockExternalImages) {
    content = content.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '<div style="border:1px dashed #a1a1aa;padding:8px;font-size:11px;color:#71717a;text-align:center">[External image blocked]</div>')
  }
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;color:#18181b;background:#fff;font-size:14px;line-height:1.6;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#8a6426}blockquote{border-left:3px solid #caa24c;margin:12px 0;padding-left:12px;color:#52525b}table{max-width:100%}</style></head><body>${content}</body></html>`
}

function FolderNavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all cursor-pointer ${
        active
          ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/30'
          : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={active ? 'text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}>{icon}</span>
        <span>{label}</span>
      </div>
      <span className={`text-[10px] font-mono rounded-full px-2 py-0.5 ${active ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] border border-[color:var(--portal-border)]'}`}>
        {count}
      </span>
    </button>
  )
}

function FilterChipItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
        active
          ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/40 font-bold'
          : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] border border-[color:var(--portal-border)]'
      }`}
    >
      {label}
    </button>
  )
}

function DirectionBadge({ direction }: { direction?: 'incoming' | 'outgoing' | 'campaign' }) {
  if (direction === 'incoming') {
    return (
      <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300">
        Received
      </span>
    )
  }
  if (direction === 'campaign') {
    return (
      <span className="shrink-0 rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-purple-300">
        Blast
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-blue-300">
      Sent
    </span>
  )
}

function formatEmailDate(val: string | null) {
  if (!val) return ''
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return ''
  const isToday = new Date().toDateString() === d.toDateString()
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatEmailDateDetailed(val: string | null) {
  if (!val) return 'No Date'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return 'No Date'
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeHtml(str: string) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
