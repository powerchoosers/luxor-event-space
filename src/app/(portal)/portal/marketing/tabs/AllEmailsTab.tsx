'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox,
  Folder,
  ArrowLeft,
  Send,
  Megaphone,
  Star,
  Search,
  RefreshCw,
  Mail,
  Paperclip,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  FilePenLine,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  MoreVertical,
  Download,
  FileText,
  Eye,
  MousePointerClick,
} from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { PortalCloseButton, PortalContactAvatar, PortalPagination, PortalSelect } from '@/components/portal/PortalUI'
import { EmailQueueHealthWidget } from '@/components/portal/EmailQueueHealthWidget'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { decodeHtmlEntities, stripTrackingPixels } from '@/lib/luxorTextUtils'
import { luxorMailDeliveryLabel } from '@/lib/luxorMailDelivery'
import { luxorMailAdditionalFolders, type LuxorMailFolder } from '@/lib/luxorMailFolders'
import type { LuxorMailboxPageRequest, LuxorMailboxPageResult } from '@/lib/luxorMailboxPage'

const EmailPdfPreview = dynamic(() => import('@/components/portal/EmailPdfPreview'), { ssr: false })

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
  attachments?: EmailAttachment[]
  engagement?: {
    openCount: number
    clickCount: number
  }
  direction?: 'incoming' | 'outgoing' | 'campaign'
  folder?: string
  folderName?: string
  folderPath?: string
  category?: string
  isStarred?: boolean
  isRead?: boolean
  deliveryStatus?: string
  legacyMessageId?: string
  deliveryError?: string | null
  threadId?: string
  folderId?: string
}

interface EmailAttachment {
  filename: string
  mimeType?: string
  size?: number
  messageId: string
  attachmentId?: string
  attachmentPath?: string
}

interface EmailThreadData {
  threadId: string
  clientEmail: string
  messages: EmailMessageItem[]
  inquiry: LuxorInquiry | null
  notes: Array<{ id: string; content: string; author: string; created_at: string }>
  bookings: Array<{ id: string; status: string; event_date: string | null; package_name: string | null }>
}

const messageDetailCache = new Map<string, EmailMessageItem>()
const messageDetailRequests = new Map<string, Promise<EmailMessageItem>>()
const threadCache = new Map<string, EmailThreadData>()
const LUXOR_MAILBOXES = new Set(['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com'])

function messageKey(message: EmailMessageItem) {
  return `${message.folder || message.direction || 'email'}:${message.folderId || 'no-folder'}:${message.id}`
}

function detailCacheKey(messageId: string, folderId?: string) {
  return `${folderId || 'no-folder'}:${messageId}`
}

function mailboxParts(value: string) {
  const decodedValue = decodeHtmlEntities(value).replace(/\u00a0/g, ' ').trim()
  if (!decodedValue || /^(?:not provided|n\/?a|none|null|undefined)$/i.test(decodedValue)) return []

  return decodedValue
    .split(/[,;](?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
    .map((part) => {
      const email = part.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || ''
      const embeddedName = part
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, '')
        .replace(/[<>\"']/g, '')
        .trim()
      return { email, embeddedName, raw: part.trim() }
    })
    .filter((part) => part.email || part.raw)
}

function mailboxLabel(value: string, inquiryByEmail: Map<string, LuxorInquiry>, fallback = 'Unknown contact') {
  const parts = mailboxParts(value)
  if (!parts.length) return fallback
  return parts
    .map(({ email, embeddedName, raw }) => {
      if (!email) return raw
      return inquiryByEmail.get(email)?.full_name
        || (LUXOR_MAILBOXES.has(email) ? 'Luxor Event Space' : '')
        || embeddedName
        || email
    })
    .join(', ')
}

function firstMailboxEmail(value: string) {
  return mailboxParts(value).find((part) => part.email)?.email || ''
}

async function requestMessageDetail(messageId: string, folderId?: string) {
  const cacheKey = detailCacheKey(messageId, folderId)
  const cached = messageDetailCache.get(cacheKey)
  if (cached) return cached
  const existing = messageDetailRequests.get(cacheKey)
  if (existing) return existing

  const folderQuery = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
  const request = fetch(`/api/email/messages/${encodeURIComponent(messageId)}${folderQuery}`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}))
        throw new Error(failure.error || 'Unable to load this email. Please try again.')
      }
      const detail = (await response.json()) as EmailMessageItem
      messageDetailCache.set(cacheKey, detail)
      return detail
    })
    .finally(() => {
      messageDetailRequests.delete(cacheKey)
    })

  messageDetailRequests.set(cacheKey, request)
  return request
}

async function requestMailbox(input: LuxorMailboxPageRequest, signal: AbortSignal) {
  const response = await fetch('/api/email/mailbox', { method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to load mailbox page.')
  return data as LuxorMailboxPageResult<EmailMessageItem>
}

type ActiveFolder = string

const PANEL_TRANSITION = { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const }

interface AllEmailsTabProps {
  inquiries?: LuxorInquiry[]
  initialMessageId?: string
  onReaderOpenChange?: (open: boolean) => void
  mailboxEmail?: string
  mailboxName?: string
}

export function AllEmailsTab({ inquiries = [], initialMessageId, onReaderOpenChange, mailboxEmail, mailboxName }: AllEmailsTabProps) {
  const reduceMotion = useReducedMotion()
  const appliedInitialMessageId = useRef<string | null>(null)
  const replyComposerRef = useRef<HTMLDivElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  const readerMenuRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<EmailMessageItem[]>([])
  const [folderCatalog, setFolderCatalog] = useState<LuxorMailFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Active navigation & filters
  const [activeFolder, changeActiveFolder] = useState<ActiveFolder>('inbox')
  const [searchQuery, changeSearchQuery] = useState('')

  // Pagination
  const PAGE_SIZE = 25
  const [currentPage, setCurrentPage] = useState(1)
  const setActiveFolder = (folder: string) => { changeActiveFolder(folder); setCurrentPage(1) }
  const setSearchQuery = (query: string) => { changeSearchQuery(query); setCurrentPage(1) }

  // Selected email detail state
  const [selectedId, setSelectedId] = useState<string | null>(initialMessageId || null)
  const [selectedMessageKey, setSelectedMessageKey] = useState<string | null>(null)
  const [messageDetail, setMessageDetail] = useState<EmailMessageItem | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const [readRequestedId, setReadRequestedId] = useState<string | null>(initialMessageId || null)
  const [savingReadId, setSavingReadId] = useState<string | null>(null)
  const [readStateError, setReadStateError] = useState<{ id: string; message: string } | null>(null)
  const [compactReaderOpen, setCompactReaderOpen] = useState(Boolean(initialMessageId))
  const [thread, setThread] = useState<EmailThreadData | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [threadRetryKey, setThreadRetryKey] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [replyInstruction, setReplyInstruction] = useState('')
  const [draftingReply, setDraftingReply] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)
  const replyDelivery = useRef<{ fingerprint: string; key: string } | null>(null)
  const [replyStatus, setReplyStatus] = useState<string | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)

  // Reader pane controls
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [viewportWidth, setViewportWidth] = useState<'full' | 'tablet' | 'mobile'>('full')
  const [blockExternalImages, setBlockExternalImages] = useState(false)
  const [folderPaneOpen, setFolderPaneOpen] = useState(true)
  const [readerExpanded, setReaderExpanded] = useState(false)
  const [readerMenuOpen, setReaderMenuOpen] = useState(false)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<(EmailAttachment & { url: string; mimeType: string }) | null>(null)

  // Starred items tracking (persisted in local state)
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set())
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [portalTheme, setPortalTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    onReaderOpenChange?.(compactReaderOpen)
  }, [compactReaderOpen, onReaderOpenChange])

  useEffect(() => {
    const syncTheme = () => setPortalTheme(document.body.dataset.portalTheme === 'light' ? 'light' : 'dark')
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-portal-theme'] })
    return () => observer.disconnect()
  }, [])

  const pageSnapshot = useRef<{ key: string; value: string | null }>({ key: '', value: null })
  const pageRequest = useRef<AbortController | null>(null)
  const [pageResult, setPageResult] = useState<LuxorMailboxPageResult<EmailMessageItem> | null>(null)
  const loadEmails = useCallback(async (force = false) => {
    pageRequest.current?.abort()
    const controller = new AbortController()
    pageRequest.current = controller
    const key = JSON.stringify([activeFolder, searchQuery.trim(), mailboxEmail || ''])
    if (force || pageSnapshot.current.key !== key) pageSnapshot.current = { key, value: null }
    setLoading(true)
    setError(null)
    try {
      const result = await requestMailbox({ folder: activeFolder, query: searchQuery, page: currentPage,
        pageSize: PAGE_SIZE, snapshot: pageSnapshot.current.value, starred: [...starredIds], email: mailboxEmail }, controller.signal)
      if (controller.signal.aborted) return
      pageSnapshot.current = { key, value: result.snapshot }
      setPageResult(result)
      setMessages(result.messages)
      setFolderCatalog(result.folders)
      if (result.page !== currentPage) setCurrentPage(result.page)
      const latest = new Map(result.messages.map(message => [message.id, message]))
      const updateState = (detail: EmailMessageItem) => {
        const summary = latest.get(detail.id)
        return summary && detail.id.startsWith('mail-')
          ? { ...detail, isRead: summary.isRead, deliveryStatus: summary.deliveryStatus, deliveryError: summary.deliveryError }
          : detail
      }
      for (const [cacheKey, detail] of messageDetailCache) messageDetailCache.set(cacheKey, updateState(detail))
      setMessageDetail(current => current ? updateState(current) : current)
    } catch {
      if (!controller.signal.aborted) setError('The mailbox could not load this page. Please retry.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [activeFolder, searchQuery, currentPage, starredIds, mailboxEmail])

  useEffect(() => {
    // Search is server-side across all saved mail; debounce typing and abort
    // obsolete page requests so a slow response cannot replace newer results.
    const timer = window.setTimeout(() => { void loadEmails() }, 200)
    return () => { window.clearTimeout(timer); pageRequest.current?.abort() }
  }, [loadEmails])

  useEffect(() => {
    if (initialMessageId && appliedInitialMessageId.current !== initialMessageId) {
      appliedInitialMessageId.current = initialMessageId
      setSelectedId(initialMessageId)
      setReadRequestedId(initialMessageId)
      return
    }
    // Preserve an open reader when paging. Deep links can load directly even
    // when the requested message is far outside the first page.
    if (selectedId || loading) return
    const target = messages[0]
    if (target) { setSelectedId(target.id); setSelectedMessageKey(messageKey(target)) }
  }, [initialMessageId, loading, messages, selectedId])

  const selectedSummary = messages.find((message) => messageKey(message) === selectedMessageKey)
    || messages.find((message) => message.id === selectedId)
    || (messageDetail?.id === selectedId ? messageDetail : undefined)
  const selectedFolderId = selectedSummary?.folderId

  const inquiryByEmail = useMemo(() => {
    const entries = new Map<string, LuxorInquiry>()
    inquiries.forEach((inquiry) => {
      const email = inquiry.email?.trim().toLowerCase()
      if (email) entries.set(email, inquiry)
    })
    return entries
  }, [inquiries])

  const persistReadState = useCallback(async (id: string, isRead: boolean) => {
    setSavingReadId(id)
    setReadStateError(null)
    try {
      const response = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isRead }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Read state could not be saved.')
      const apply = (message: EmailMessageItem) => message.id === id ? { ...message, isRead: result.isRead } : message
      setMessages((current) => current.map(apply))
      setMessageDetail((current) => current ? apply(current) : current)
      for (const [key, detail] of messageDetailCache) if (detail.id === id) messageDetailCache.set(key, apply(detail))
    } catch (error) {
      setReadStateError({ id, message: error instanceof Error ? error.message : 'Read state could not be saved.' })
    } finally {
      setSavingReadId((current) => current === id ? null : current)
    }
  }, [])

  // Fetch full message detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setMessageDetail(null)
      return
    }

    let isCurrent = true
    const fetchDetail = async () => {
      const cacheKey = detailCacheKey(selectedId, selectedFolderId)
      const cached = messageDetailCache.get(cacheKey)
      setMessageDetail(cached || null)
      setDetailError(null)
      setLoadingDetail(!cached)
      try {
        const detail = await requestMessageDetail(selectedId, selectedFolderId)
        if (isCurrent) {
          setMessageDetail(detail)
          if (detail.id !== selectedId && readRequestedId === selectedId) {
            setSelectedId(detail.id)
            setReadRequestedId(detail.id)
            setSelectedMessageKey(messageKey(detail))
          }
          if (!selectedId.startsWith('mail-')) setReadIds((prev) => new Set(prev).add(selectedId))
          // Only an explicit open/deep link marks archived mail read. Selecting
          // the first list item while the mobile reader is hidden must not.
          if (readRequestedId === selectedId && selectedId.startsWith('mail-') && detail.direction === 'incoming') {
            void persistReadState(selectedId, true)
          }
        }
      } catch (err) {
        const fallback = messageDetailCache.get(cacheKey) || null
        if (fallback) {
          console.warn('Full email body is unavailable; showing a retryable error.', err)
        } else {
          console.error('Error loading email message detail:', err)
        }
        if (isCurrent) {
          setMessageDetail(null)
          setDetailError(err instanceof Error ? err.message : 'Unable to load this email.')
        }
      } finally {
        if (isCurrent) setLoadingDetail(false)
      }
    }

    void fetchDetail()
    return () => {
      isCurrent = false
    }
  }, [selectedId, selectedFolderId, selectedMessageKey, readRequestedId, detailRetry, persistReadState])

  useEffect(() => {
    const threadId = messageDetail?.threadId
    if (!replyOpen || !threadId || messageDetail?.direction === 'campaign') {
      setThread(null)
      setThreadError(null)
      return
    }
    let current = true
    const cached = threadCache.get(threadId)
    if (cached) setThread(cached)
    setLoadingThread(!cached)
    setThreadError(null)
    setReplyStatus(null)
    const controller = new AbortController()
    const loadThread = async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = await fetch(`/api/email/threads/${encodeURIComponent(threadId)}`, {
            cache: 'no-store',
            signal: controller.signal,
          })
          const data = await response.json() as EmailThreadData & { error?: string }
          if (response.ok) {
            if (current) {
              threadCache.set(threadId, data)
              setThread(data)
            }
            return
          }

          if (response.status === 503 && attempt < 2) {
            const retryAfter = Number.parseFloat(response.headers.get('retry-after') || '')
            const delay = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 30_000) : 5_000 * (attempt + 1)
            await new Promise<void>((resolve, reject) => {
              const timer = window.setTimeout(resolve, delay)
              controller.signal.addEventListener('abort', () => {
                window.clearTimeout(timer)
                reject(new DOMException('Aborted', 'AbortError'))
              }, { once: true })
            })
            continue
          }

          throw new Error(data.error || 'Unable to load conversation.')
        }
      } catch (error) {
        if (controller.signal.aborted) return
        console.error(error)
        if (current) setThreadError(error instanceof Error ? error.message : 'Unable to load the rest of this conversation.')
        if (current && !cached) setThread(null)
      } finally {
        if (current) setLoadingThread(false)
      }
    }
    void loadThread()
    return () => {
      current = false
      controller.abort()
    }
  }, [messageDetail?.threadId, messageDetail?.direction, replyOpen, threadRetryKey])

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
    if (!replyTo?.id || !replyText.trim() || sendingReply) return
    const fingerprint = JSON.stringify({ messageId: replyTo.id, content: replyText })
    if (replyDelivery.current?.fingerprint !== fingerprint) replyDelivery.current = { fingerprint, key: crypto.randomUUID() }
    setSendingReply(true)
    setReplyStatus(null)
    try {
      const response = await fetch(`/api/email/messages/${encodeURIComponent(replyTo.id)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: replyText,
          deliveryKey: replyDelivery.current.key,
          folderId: replyTo.folderId || null,
          inquiryId: thread?.inquiry?.id || currentInquiry?.id || null,
        }),
      })
      const data = await response.json() as { error?: string; message?: EmailMessageItem }
      if (!response.ok) throw new Error(data.error || 'Reply could not be sent.')
      if (data.message) {
        const sentMessage = data.message
        setThread((current) => {
          if (!current) return current
          const next = {
            ...current,
            messages: [...current.messages.filter((message) => message.id !== sentMessage.id), sentMessage],
          }
          threadCache.set(current.threadId, next)
          return next
        })
        void loadEmails(true)
        messageDetailCache.set(detailCacheKey(sentMessage.id, sentMessage.folderId), sentMessage)
      }
      setReplyText('')
      replyDelivery.current = null
      setReplyInstruction('')
      setReplyStatus(null)
      setReplyOpen(false)
    } catch (error) {
      setReplyStatus(error instanceof Error ? error.message : 'Reply could not be sent.')
    } finally {
      setSendingReply(false)
    }
  }

  useEffect(() => {
    if (!replyOpen) return
    const frame = window.requestAnimationFrame(() => {
      const scrollPane = threadScrollRef.current
      scrollPane?.scrollTo({
        top: scrollPane.scrollHeight,
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [replyOpen, reduceMotion])

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

  const totalItems = pageResult?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const pagedMessages = messages

  // Matched inquiry for currently selected email
  const currentInquiry = useMemo(() => {
    if (thread?.inquiry) return thread.inquiry
    if (!messageDetail) return null
    const targetEmail = firstMailboxEmail(messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to)
    return inquiryByEmail.get(targetEmail) || null
  }, [messageDetail, inquiryByEmail, thread?.inquiry])

  const stats = pageResult?.stats || { total: 0, inboxCount: 0, sentCount: 0, campaignCount: 0, starredCount: 0 }
  const additionalFolders = useMemo(() => luxorMailAdditionalFolders(folderCatalog, []).map(folder => ({
    ...folder, count: pageResult?.folderCounts[folder.value] || 0,
  })), [folderCatalog, pageResult])
  const folderOptions = [
    { value: 'inbox', label: 'Inbox' }, { value: 'sent', label: 'Sent & outbox' },
    { value: 'all', label: 'All Mail' }, { value: 'campaigns', label: 'Campaign Blasts' },
    { value: 'starred', label: 'Starred' }, ...additionalFolders,
  ]
  const activeFolderLabel = folderOptions.find((folder) => folder.value === activeFolder)?.label || 'Imported folder'

  // Print selected email
  const handlePrint = () => {
    window.print()
  }

  const openAttachmentPreview = async (attachment: EmailAttachment, message: EmailMessageItem) => {
    const reference = attachment.attachmentId || attachment.attachmentPath
    if (!reference) return
    setOpeningAttachment(reference)
    try {
      const params = new URLSearchParams({
        attachmentId: attachment.attachmentId || '',
        attachmentPath: attachment.attachmentPath || '',
        folderId: message.folderId || '',
        filename: attachment.filename,
      })
      const response = await fetch(`/api/email/attachments/${encodeURIComponent(message.id)}?${params.toString()}`)
      if (!response.ok) throw new Error('The attachment could not be opened.')
      const contentType = response.headers.get('content-type') || attachment.mimeType || 'application/octet-stream'
      const bytes = await response.arrayBuffer()
      const url = URL.createObjectURL(new Blob([bytes], { type: contentType }))
      setPreviewAttachment({ ...attachment, mimeType: contentType, url })
    } catch (error) {
      console.error('Error opening email attachment:', error)
    } finally {
      setOpeningAttachment(null)
    }
  }

  const closeAttachmentPreview = () => {
    setPreviewAttachment((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }

  useEffect(() => {
    if (!readerMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (readerMenuRef.current && !readerMenuRef.current.contains(event.target as Node)) {
        setReaderMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReaderMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [readerMenuOpen])

  const selectMessage = (message: EmailMessageItem) => {
    const cached = messageDetailCache.get(detailCacheKey(message.id, message.folderId))
    setSelectedId(message.id)
    setReadRequestedId(message.id)
    setReadStateError(null)
    setSelectedMessageKey(messageKey(message))
    setMessageDetail(cached || null)
    setLoadingDetail(!cached)
    setDetailError(null)
    setCompactReaderOpen(true)
    setThread(message.threadId ? threadCache.get(message.threadId) || null : null)
    setThreadError(null)
    setReplyOpen(false)
    setReaderMenuOpen(false)
    setReplyText('')
    setReplyInstruction('')
    setReplyStatus(null)
  }

  const selectedCcLabel = messageDetail?.cc ? mailboxLabel(messageDetail.cc, inquiryByEmail, '') : ''

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className={compactReaderOpen ? 'hidden xl:block' : ''}>
        <EmailQueueHealthWidget />
      </div>
      <div className="portal-surface flex min-h-0 flex-1 w-full overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] font-sans text-[color:var(--portal-text)] shadow-sm sm:rounded-2xl">
      {/* PANE 1: Mailbox Folders & Navigation */}
      <AnimatePresence initial={false}>
      {folderPaneOpen && !readerExpanded && <motion.div
        key="mailbox-folders"
        initial={{ width: 0, opacity: 0, x: -12 }}
        animate={{ width: 'var(--folder-pane-width)', opacity: 1, x: 0 }}
        exit={{ width: 0, opacity: 0, x: -12 }}
        transition={PANEL_TRANSITION}
        className="w-52 [--folder-pane-width:13rem] shrink-0 border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 flex-col overflow-hidden hidden xl:flex rounded-l-2xl"
      >
        {/* Scrollable folder list area */}
        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar p-4">
          {/* Mailbox Navigation List */}
          <div className="space-y-1">
            <div className="mb-2 flex items-center justify-between gap-3 px-3">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-faint)]">Mailboxes</p>
              <button
                type="button"
                onClick={() => setFolderPaneOpen(false)}
                className="rounded-lg bg-transparent p-1.5 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
                title="Collapse mailbox folders"
                aria-label="Collapse mailbox folders"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
            
            <FolderNavItem
              icon={<Inbox size={15} />}
              label="Inbox"
              count={stats.inboxCount}
              active={activeFolder === 'inbox'}
              onClick={() => setActiveFolder('inbox')}
            />
            <FolderNavItem
              icon={<Send size={15} />}
              label="Sent & outbox"
              count={stats.sentCount}
              active={activeFolder === 'sent'}
              onClick={() => setActiveFolder('sent')}
            />
            <FolderNavItem
              icon={<Mail size={15} />}
              label="All Mail"
              count={stats.total}
              active={activeFolder === 'all'}
              onClick={() => setActiveFolder('all')}
            />
            <FolderNavItem
              icon={<Megaphone size={15} />}
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
            {additionalFolders.map((folder) => (
              <FolderNavItem key={folder.value} icon={<Folder size={15} />} label={folder.label}
                count={folder.count} active={activeFolder === folder.value}
                onClick={() => setActiveFolder(folder.value)} />
            ))}
          </div>
        </div>

        {/* Pinned Sync & Mailbox Footer */}
        <div className="shrink-0 p-4 pt-3 border-t border-[color:var(--portal-border)] space-y-3">
          <div className="flex items-center justify-between text-[10px] font-mono text-[color:var(--portal-muted)]">
            <span>Mailbox</span>
            <button
              type="button"
              onClick={() => void loadEmails(true)}
              disabled={loading}
              className="p-1 text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] transition-colors"
              title="Refresh messages"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 p-2.5 text-[10px]">
            <p className="font-bold text-[color:var(--portal-text)] truncate">{mailboxEmail || 'booking@luxoratlaspalmas.com'}</p>
            <p className="text-[color:var(--portal-muted)] font-mono text-[9px] mt-0.5">
              {loading ? 'Loading mailbox…' : error ? 'Mailbox refresh needs attention' : `${mailboxName || 'Saved mailbox'} · Supabase`}
            </p>
          </div>
        </div>
      </motion.div>}
      </AnimatePresence>

      {/* PANE 2: Message Threads List */}
      <AnimatePresence initial={false}>
      {!readerExpanded && <motion.div
        key="message-list"
        initial={{ width: 0, opacity: 0, x: -12 }}
        animate={{ width: 'var(--message-list-width)', opacity: 1, x: 0 }}
        exit={{ width: 0, opacity: 0, x: -12 }}
        transition={PANEL_TRANSITION}
        className={`min-h-0 min-w-0 w-full [--message-list-width:100%] lg:w-80 lg:[--message-list-width:20rem] xl:w-96 xl:[--message-list-width:24rem] shrink-0 lg:border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/20 flex-col overflow-hidden ${compactReaderOpen ? 'hidden lg:flex' : 'flex'}`}
      >
        {/* Search & Header */}
        <div className="p-4 border-b border-[color:var(--portal-border)] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 text-xs font-bold text-[color:var(--portal-text)] uppercase tracking-widest flex items-center gap-2">
              {!folderPaneOpen && (
                <button
                  type="button"
                  onClick={() => setFolderPaneOpen(true)}
                  className="hidden xl:inline-flex shrink-0 rounded-lg bg-transparent p-1.5 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] transition-colors"
                  title="Show mailbox folders"
                  aria-label="Show mailbox folders"
                >
                  <PanelLeftOpen size={14} />
                </button>
              )}
              <Inbox size={15} className="text-[#caa24c]" />
              <span className="truncate" title={activeFolderLabel}>{activeFolderLabel}</span>
            </h3>
            <span className="text-[10px] font-mono text-[color:var(--portal-muted)]">{totalItems.toLocaleString()} items</span>
          </div>

          <div className="xl:hidden">
            <PortalSelect
              value={activeFolder}
              onChange={(value) => { setActiveFolder(value as ActiveFolder); setCurrentPage(1) }}
              options={folderOptions}
              buttonClassName="min-h-10 text-xs"
            />
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
            <input
              type="text"
              value={searchQuery}
              maxLength={200}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject, sender, text..."
              className="w-full bg-[color:var(--portal-card)] border border-[color:var(--portal-border)] rounded-xl pl-9 pr-4 py-2 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50 placeholder:text-[color:var(--portal-faint)]"
            />
          </div>

        </div>

        <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar divide-y divide-[color:var(--portal-border)]">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-28 rounded luxor-skeleton" />
                    <div className="h-2.5 w-12 rounded luxor-skeleton" />
                  </div>
                  <div className="h-3.5 w-48 rounded luxor-skeleton" />
                  <div className="h-2.5 w-full rounded luxor-skeleton" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-xs text-rose-400 leading-relaxed">{error}</p>
              <button type="button" onClick={() => void loadEmails()} className="mt-3 min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-xs text-[color:var(--portal-text)]">Retry page</button>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 px-6 text-center text-xs text-[color:var(--portal-muted)]">
              No emails match the selected filters or search terms.
            </div>
          ) : (
            pagedMessages.map((msg) => {
              const isSelected = messageKey(msg) === selectedMessageKey
              const isStarred = starredIds.has(msg.id)
              const isRead = Boolean(msg.isRead) || readIds.has(msg.id) || msg.direction !== 'incoming'

              return (
                <div
                  key={messageKey(msg)}
                  onClick={() => selectMessage(msg)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectMessage(msg)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${decodeHtmlEntities(msg.subject) || 'email'}`}
                  aria-current={isSelected ? 'true' : undefined}
                  data-read={isRead ? 'true' : 'false'}
                  className={`p-4 flex flex-col gap-2 transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'bg-[#caa24c]/10 border-l-2 border-[#caa24c]'
                      : 'border-l-2 border-transparent hover:bg-[color:var(--portal-soft)]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <DirectionBadge direction={msg.direction} />
                      {!isRead && <span className="sr-only">Unread</span>}
                      <p className={`truncate text-xs font-bold ${isSelected ? 'text-[#a8792f] dark:text-[#f1d27a]' : isRead ? 'text-[color:var(--portal-muted)]' : 'text-[color:var(--portal-text)]'}`}>
                        {msg.direction === 'outgoing' ? `To: ${mailboxLabel(msg.to, inquiryByEmail)}` : mailboxLabel(msg.from, inquiryByEmail)}
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
                    {decodeHtmlEntities(msg.subject) || '(No Subject)'}
                  </h4>

                  {/* Snippet Preview */}
                  <p className="text-[11px] text-[color:var(--portal-muted)] line-clamp-2 leading-relaxed">
                    {decodeHtmlEntities(msg.summary) || 'No preview available.'}
                  </p>

                  {/* Indicators */}
                  {msg.direction === 'outgoing' && msg.deliveryStatus && (
                    <p className="text-[10px] text-[color:var(--portal-muted)]">{luxorMailDeliveryLabel(msg.deliveryStatus)}</p>
                  )}
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

        {/* Pinned Pagination Bar */}
        {totalPages > 1 && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
            <span className="shrink-0 whitespace-nowrap text-[10px] font-mono text-[color:var(--portal-muted)]">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems.toLocaleString()}
            </span>
            <PortalPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </motion.div>}
      </AnimatePresence>

      {/* PANE 3: Mainstream Email Detail & Isolated Viewer */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--portal-card)] flex-col ${compactReaderOpen ? 'flex' : 'hidden lg:flex'}`}>
        <div className="shrink-0 border-b border-[color:var(--portal-border)] px-2 py-1.5 lg:hidden">
          <button type="button" onClick={() => { setCompactReaderOpen(false); setReaderExpanded(false); setReaderMenuOpen(false) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
            <ArrowLeft size={18} /> Back to inbox
          </button>
        </div>
        <AnimatePresence mode="wait" initial={false}>
        {detailError ? (
          <motion.div key={`error:${selectedId}`} role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <Mail size={28} className="text-[color:var(--portal-muted)]" />
            <h2 className="font-semibold text-[color:var(--portal-text)]">Email body unavailable</h2>
            <p className="max-w-md text-sm text-[color:var(--portal-muted)]">{detailError}</p>
            <button type="button" onClick={() => setDetailRetry((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-4 text-sm hover:bg-[color:var(--portal-soft)]"><RefreshCw size={15} /> Retry loading email</button>
          </motion.div>
        ) : loadingDetail ? (
          <motion.div
            key={`loading:${selectedMessageKey || selectedId || 'email'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16 }}
            className="flex-1 flex flex-col p-8 space-y-6"
            aria-label="Loading email"
          >
            <div className="space-y-3 border-b border-[color:var(--portal-border)] pb-6">
              <div className="h-6 w-3/4 rounded-lg luxor-skeleton" />
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full luxor-skeleton" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-3.5 w-36 rounded luxor-skeleton" />
                  <div className="h-2.5 w-48 rounded luxor-skeleton" />
                </div>
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <div className="h-3.5 w-full rounded luxor-skeleton" />
              <div className="h-3.5 w-11/12 rounded luxor-skeleton" />
              <div className="h-3.5 w-4/5 rounded luxor-skeleton" />
              <div className="h-3.5 w-full rounded luxor-skeleton" />
            </div>
          </motion.div>
        ) : selectedId && messageDetail ? (
          <motion.div
            key={selectedMessageKey || detailCacheKey(messageDetail.id, messageDetail.folderId)}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Email Header Bar */}
            <div className="shrink-0 space-y-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/30 px-4 pb-3 pt-2 sm:space-y-4 sm:p-6">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DirectionBadge direction={messageDetail.direction} />
                    {messageDetail.direction === 'outgoing' && messageDetail.deliveryStatus && (
                      <span className="text-[10px] text-[color:var(--portal-muted)]">{luxorMailDeliveryLabel(messageDetail.deliveryStatus)}</span>
                    )}
                    {messageDetail.category && (
                      <span className="text-[9px] font-mono uppercase bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] px-2 py-0.5 rounded border border-[color:var(--portal-border)]">
                        {messageDetail.category}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-bold leading-snug text-[color:var(--portal-text)] sm:text-lg sm:leading-tight">{decodeHtmlEntities(messageDetail.subject)}</h2>
                  {messageDetail.folderPath && (
                    <p className="mt-1 break-words text-xs text-[color:var(--portal-muted)]">Folder: {messageDetail.folderPath}</p>
                  )}
                </div>

                {/* Main Action Buttons */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setReplyOpen(true)}
                    className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-[#caa24c] text-xs font-bold uppercase tracking-widest text-white shadow-xs transition-all hover:bg-[#d4b060] sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2"
                    aria-label="Reply to email"
                  >
                    <Send size={14} /> <span className="hidden sm:inline">Reply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReaderMenuOpen(false)
                      setReaderExpanded((expanded) => !expanded)
                    }}
                    className="hidden lg:inline-flex rounded-xl bg-transparent p-2 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 cursor-pointer"
                    title={readerExpanded ? 'Restore message list' : 'Expand email reader'}
                    aria-label={readerExpanded ? 'Restore message list' : 'Expand email reader'}
                  >
                    {readerExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                  <div ref={readerMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setReaderMenuOpen((open) => !open)}
                      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-transparent text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
                      title="More email actions"
                      aria-label="More email actions"
                      aria-expanded={readerMenuOpen}
                      aria-haspopup="menu"
                    >
                      <MoreVertical size={14} />
                    </button>

                    <AnimatePresence initial={false}>
                      {readerMenuOpen && (
                        <motion.div
                          role="menu"
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.985 }}
                          transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: [0.23, 1, 0.32, 1] }}
                          className="absolute right-0 top-11 z-30 w-64 origin-top-right rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 text-[10px] shadow-2xl backdrop-blur-xl"
                        >
                          <div className="border-b border-[color:var(--portal-border)] px-2.5 pb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">
                            Message actions
                          </div>
                          {messageDetail.id.startsWith('mail-') && messageDetail.direction === 'incoming' && (
                            <button type="button" role="menuitem" disabled={savingReadId === messageDetail.id}
                              onClick={() => {
                                setReadRequestedId(null)
                                setReaderMenuOpen(false)
                                void persistReadState(messageDetail.id, !messageDetail.isRead)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-50">
                              <Mail size={13} /> {messageDetail.isRead ? 'Mark as unread' : 'Mark as read'}
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(event) => {
                              toggleStar(messageDetail.id, event)
                              setReaderMenuOpen(false)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
                          >
                            <Star size={13} className={starredIds.has(messageDetail.id) ? 'fill-[#caa24c] text-[#caa24c]' : ''} />
                            {starredIds.has(messageDetail.id) ? 'Remove star' : 'Star message'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              handlePrint()
                              setReaderMenuOpen(false)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"
                          >
                            <Printer size={13} />
                            Print email
                          </button>

                          <div className="my-1.5 border-t border-[color:var(--portal-border)]" />
                          <div className="px-2.5 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">
                            Message view
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setViewMode('html'); setReaderMenuOpen(false) }}
                              className={`rounded-lg px-2.5 py-2 text-left font-bold uppercase tracking-wider transition-colors ${viewMode === 'html' ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
                            >
                              HTML view
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setViewMode('text'); setReaderMenuOpen(false) }}
                              className={`rounded-lg px-2.5 py-2 text-left font-bold uppercase tracking-wider transition-colors ${viewMode === 'text' ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
                            >
                              Plain text
                            </button>
                          </div>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setBlockExternalImages((blocked) => !blocked); setReaderMenuOpen(false) }}
                            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-mono transition-colors ${blockExternalImages ? 'bg-amber-500/10 text-amber-500' : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'}`}
                          >
                            {blockExternalImages ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                            {blockExternalImages ? 'Images blocked' : 'Images safe'}
                          </button>

                          <div className="my-1.5 border-t border-[color:var(--portal-border)]" />
                          <div className="px-2.5 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-faint)]">
                            Preview width
                          </div>
                          <div className="flex items-center gap-1 rounded-lg bg-[color:var(--portal-soft)] p-1">
                            {([
                              ['full', Monitor, 'Full width'],
                              ['tablet', Tablet, 'Tablet preview'],
                              ['mobile', Smartphone, 'Mobile preview'],
                            ] as const).map(([width, Icon, label]) => (
                              <button
                                key={width}
                                type="button"
                                role="menuitem"
                                onClick={() => { setViewportWidth(width); setReaderMenuOpen(false) }}
                                className={`flex flex-1 items-center justify-center rounded-md p-1.5 transition-colors ${viewportWidth === width ? 'bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-xs' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
                                title={label}
                                aria-label={label}
                              >
                                <Icon size={13} />
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Sender / Recipient & Matched Lead Row */}
              {readStateError?.id === messageDetail.id && (
                <p role="alert" className="text-xs text-[color:var(--portal-text)]">{readStateError.message} Use “More email actions” to retry.</p>
              )}
              {messageDetail.deliveryError && (
                <p role="status" className="text-xs text-[color:var(--portal-text)]">{messageDetail.deliveryError}</p>
              )}
              <div className="flex items-start justify-between gap-3 border-t border-[color:var(--portal-border)] pt-3 sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <PortalContactAvatar name={mailboxLabel(messageDetail.from, inquiryByEmail)} size="md" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-xs font-bold text-[color:var(--portal-text)]" title={messageDetail.from}>{mailboxLabel(messageDetail.from, inquiryByEmail)}</p>
                      {currentInquiry && (
                        <Link
                          href={`/portal/leads/${currentInquiry.id}`}
                          className="hidden items-center gap-1 rounded border border-[#caa24c]/20 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#a8792f] hover:bg-[#caa24c]/20 dark:text-[#f1d27a] sm:inline-flex"
                        >
                          View Lead File <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-[color:var(--portal-muted)] sm:text-[10px]">
                      To: {mailboxLabel(messageDetail.to, inquiryByEmail, 'Client')} {selectedCcLabel ? `| CC: ${selectedCcLabel}` : ''}
                    </p>
                  </div>
                </div>

                <div className="max-w-24 shrink-0 text-right font-mono text-[9px] leading-4 text-[color:var(--portal-muted)] sm:max-w-none sm:text-[10px]">
                  <p>{formatEmailDateDetailed(messageDetail.receivedAt)}</p>
                </div>
              </div>

            </div>

            {/* Scrollable email thread — grows to fill, reply pinned below */}
            <div ref={threadScrollRef} data-email-thread-scroll className="portal-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-[color:var(--portal-soft)]/20 p-2 [overflow-anchor:none] sm:p-4 lg:p-5">
              <div className={`mx-auto w-full space-y-3 transition-all duration-300 ${viewportWidth === 'mobile' ? 'max-w-[375px]' : viewportWidth === 'tablet' ? 'max-w-[768px]' : 'max-w-5xl'}`}>
                {loadingThread && !thread && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/8 px-3 py-2 text-[10px] text-[color:var(--portal-muted)]">
                    <Loader2 size={12} className="animate-spin text-[#caa24c]" />
                    Loading earlier messages in the background. This email is ready now.
                  </div>
                )}
                {threadError && !loadingThread && !thread && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">
                    <span className="truncate">This email is available, but the rest of the conversation could not load.</span>
                    <button
                      type="button"
                      onClick={() => setThreadRetryKey((key) => key + 1)}
                      className="shrink-0 font-bold uppercase tracking-wider hover:underline"
                    >
                      Retry thread
                    </button>
                  </div>
                )}
                {(thread?.messages?.length ? thread.messages : [messageDetail]).map((message, index, all) => (
                  <ThreadMessage
                    key={`${messageKey(message)}:${index}:${message.id === selectedId || index === all.length - 1 ? 'open' : 'closed'}`}
                    message={message}
                    expanded={message.id === selectedId || index === all.length - 1}
                    viewMode={viewMode}
                    blockExternalImages={blockExternalImages}
                    portalTheme={portalTheme}
                    inquiryByEmail={inquiryByEmail}
                    onOpenAttachment={openAttachmentPreview}
                    openingAttachment={openingAttachment}
                  />
                ))}

                <AnimatePresence initial={false}>
                  {messageDetail.direction !== 'campaign' && replyOpen && (
                    <motion.div
                      ref={replyComposerRef}
                      key="inline-thread-reply"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                      transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
                      className="overflow-hidden rounded-2xl border border-[#caa24c]/25 bg-[color:var(--portal-card)] shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[#caa24c]/6 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#caa24c] text-white"><Send size={12} className="text-white" /></span>
                          <div>
                            <p className="text-xs font-bold text-[color:var(--portal-text)]">Reply to {currentInquiry?.full_name || mailboxLabel(thread?.clientEmail || (messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to), inquiryByEmail)}</p>
                            <p className="mt-0.5 text-[9px] text-[color:var(--portal-muted)]">Your reply will become the newest message in this conversation.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {currentInquiry && (
                            <Link href={`/portal/leads/${currentInquiry.id}`} className="text-[9px] font-bold uppercase tracking-wider text-[#a8792f] hover:underline dark:text-[#f1d27a]">
                              View client file
                            </Link>
                          )}
                          <button type="button" onClick={() => setReplyOpen(false)} className="rounded-lg p-1.5 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]" aria-label="Close reply composer">
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            value={replyInstruction}
                            onChange={(event) => setReplyInstruction(event.target.value)}
                            placeholder="Optional direction for Elena..."
                            className="min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50"
                          />
                          <button
                            type="button"
                            onClick={() => void draftWithElena()}
                            disabled={draftingReply || loadingThread}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] hover:bg-[#caa24c]/20 disabled:opacity-50 dark:text-[#f1d27a]"
                          >
                            {draftingReply ? <Loader2 size={13} className="animate-spin" /> : <FilePenLine size={13} />}
                            Draft with Elena
                          </button>
                        </div>
                        <textarea
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          rows={5}
                          autoFocus
                          placeholder="Write your reply..."
                          className="w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="min-h-4 text-[10px] text-[color:var(--portal-muted)]">{replyStatus}</p>
                          <button
                            type="button"
                            onClick={() => void sendInlineReply()}
                            disabled={sendingReply || !replyText.trim()}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#caa24c] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-sm transition-colors hover:bg-[#d4b060] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {sendingReply ? 'Sending' : 'Send reply'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </motion.div>
        ) : (
          <motion.div
            key="empty-email-reader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.08 : 0.16 }}
            className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3"
          >
            <Mail size={36} className="text-[color:var(--portal-faint)]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Select an email to view full content</p>
          </motion.div>
        )}
        </AnimatePresence>

        <AnimatePresence>
          {previewAttachment && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAttachmentPreview}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={`${previewAttachment.filename} preview`}
                className="flex h-[min(88vh,760px)] w-[min(94vw,1100px)] flex-col overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/55 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{previewAttachment.filename}</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[color:var(--portal-muted)]">Attachment preview</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewAttachment.url}
                      download={previewAttachment.filename}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/35 hover:text-[#a8792f]"
                    >
                      <Download size={12} /> Download
                    </a>
                    <PortalCloseButton onClick={closeAttachmentPreview} aria-label="Close attachment preview" size={15} />
                  </div>
                </div>
                <div className="min-h-0 flex-1 bg-white">
                  {previewAttachment.mimeType.startsWith('application/pdf') || /\.pdf$/i.test(previewAttachment.filename) ? (
                    <EmailPdfPreview key={previewAttachment.url} url={previewAttachment.url} />
                  ) : previewAttachment.mimeType.startsWith('image/') ? (
                    <div className="flex h-full items-center justify-center bg-zinc-950 p-5">
                      <img src={previewAttachment.url} alt={previewAttachment.filename} className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <iframe src={previewAttachment.url} title={previewAttachment.filename} className="h-full w-full border-0" />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </div>
)
}

function ThreadMessage({
  message,
  expanded: initiallyExpanded,
  viewMode,
  blockExternalImages,
  portalTheme,
  inquiryByEmail,
  onOpenAttachment,
  openingAttachment,
}: {
  message: EmailMessageItem
  expanded: boolean
  viewMode: 'html' | 'text'
  blockExternalImages: boolean
  portalTheme: 'light' | 'dark'
  inquiryByEmail: Map<string, LuxorInquiry>
  onOpenAttachment: (attachment: EmailAttachment, message: EmailMessageItem) => void
  openingAttachment: string | null
}) {
  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [frameHeight, setFrameHeight] = useState(260)
  const frameObserverRef = useRef<ResizeObserver | null>(null)
  const frameInteractionCleanupRef = useRef<(() => void) | null>(null)
  const html = useMemo(() => buildMessageDocument(message, blockExternalImages, portalTheme), [message, blockExternalImages, portalTheme])
  const ccLabel = message.cc ? mailboxLabel(message.cc, inquiryByEmail, '') : ''

  const resizeFrame = (frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document) return
    const updateHeight = () => {
      const height = Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0,
        220,
      )
      setFrameHeight(height + 8)
    }

    frameObserverRef.current?.disconnect()
    frameInteractionCleanupRef.current?.()
    const observer = new ResizeObserver(updateHeight)
    if (document.documentElement) observer.observe(document.documentElement)
    if (document.body) observer.observe(document.body)
    frameObserverRef.current = observer
    updateHeight()
    window.requestAnimationFrame(updateHeight)
    void document.fonts?.ready.then(updateHeight)

    const scrollContainer = frame.closest<HTMLElement>('[data-email-thread-scroll]')
    if (scrollContainer) {
      let lastTouchY: number | null = null
      const handOffWheel = (event: WheelEvent) => {
        scrollContainer.scrollTop += event.deltaY
        event.preventDefault()
      }
      const beginTouch = (event: TouchEvent) => {
        lastTouchY = event.touches[0]?.clientY ?? null
      }
      const handOffTouch = (event: TouchEvent) => {
        const nextTouchY = event.touches[0]?.clientY
        if (lastTouchY === null || nextTouchY === undefined) return
        scrollContainer.scrollTop += lastTouchY - nextTouchY
        lastTouchY = nextTouchY
        event.preventDefault()
      }
      const endTouch = () => { lastTouchY = null }

      document.addEventListener('wheel', handOffWheel, { passive: false })
      document.addEventListener('touchstart', beginTouch, { passive: true })
      document.addEventListener('touchmove', handOffTouch, { passive: false })
      document.addEventListener('touchend', endTouch, { passive: true })
      document.addEventListener('touchcancel', endTouch, { passive: true })
      frameInteractionCleanupRef.current = () => {
        document.removeEventListener('wheel', handOffWheel)
        document.removeEventListener('touchstart', beginTouch)
        document.removeEventListener('touchmove', handOffTouch)
        document.removeEventListener('touchend', endTouch)
        document.removeEventListener('touchcancel', endTouch)
      }
    }
  }

  useEffect(() => () => {
    frameObserverRef.current?.disconnect()
    frameInteractionCleanupRef.current?.()
  }, [])

  return (
    <article className={`overflow-hidden rounded-xl border transition-colors sm:rounded-2xl ${expanded ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-md' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/80 hover:bg-[color:var(--portal-card)]'}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full cursor-pointer items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-4">
        <PortalContactAvatar name={mailboxLabel(message.from, inquiryByEmail)} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-bold text-[color:var(--portal-text)]">{message.direction === 'outgoing' ? `Luxor to ${mailboxLabel(message.to, inquiryByEmail)}` : mailboxLabel(message.from, inquiryByEmail)}</p>
            <div className="flex shrink-0 items-center gap-2">
              <EngagementIndicators engagement={message.engagement} />
              <p className="text-[9px] font-mono text-[color:var(--portal-muted)]">{formatEmailDateDetailed(message.receivedAt)}</p>
            </div>
          </div>
          <p className="mt-1 truncate text-[10px] text-[color:var(--portal-muted)]">{expanded ? `To ${mailboxLabel(message.to, inquiryByEmail, 'Client')}${ccLabel ? ` · CC ${ccLabel}` : ''}` : decodeHtmlEntities(message.summary || message.subject)}</p>
        </div>
      </button>
      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          layout="size"
          initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="overflow-hidden border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"
          style={{ willChange: 'height, opacity' }}
        >
          {viewMode === 'html' ? (
            <iframe
              key={`${messageKey(message)}:${blockExternalImages ? 'images-blocked' : 'images-visible'}`}
              srcDoc={html}
              title={`${decodeHtmlEntities(message.subject)} — ${message.id}`}
              className="w-full border-0 bg-transparent"
              style={{ height: frameHeight }}
              scrolling="no"
              onLoad={(event) => resizeFrame(event.currentTarget)}
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            />
          ) : (
            <div className="min-h-36 whitespace-pre-wrap bg-white p-4 font-mono text-xs leading-relaxed text-zinc-800 sm:p-6">
              {message.content || message.summary || 'No message body available.'}
            </div>
          )}
          {message.attachments?.length ? (
            <div className="border-t border-[color:var(--portal-border)] p-4">
              <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[color:var(--portal-muted)]">
                <Paperclip size={12} /> Attachments ({message.attachments.length})
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {message.attachments.map((attachment, index) => {
                  const reference = attachment.attachmentId || attachment.attachmentPath || ''
                  return (
                    <button
                      key={`${attachment.filename}-${index}`}
                      type="button"
                      onClick={() => onOpenAttachment(attachment, message)}
                      disabled={!reference || openingAttachment === reference}
                      className="group flex min-w-0 items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/70 px-3 py-2.5 text-left transition-colors hover:border-[#caa24c]/35 hover:bg-[#caa24c]/8 disabled:cursor-wait disabled:opacity-60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] group-hover:text-[#a8792f]">
                        {openingAttachment === reference ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold text-[color:var(--portal-text)]">{attachment.filename}</span>
                        <span className="mt-0.5 block text-[9px] text-[color:var(--portal-muted)]">{attachment.size ? `${Math.ceil(attachment.size / 1024)} KB` : 'Open preview'}</span>
                      </span>
                      <Download size={13} className="shrink-0 text-[color:var(--portal-faint)] transition-colors group-hover:text-[#a8792f]" />
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </motion.div>
      )}
      </AnimatePresence>
    </article>
  )
}

function EngagementIndicators({ engagement }: { engagement?: EmailMessageItem['engagement'] }) {
  if (!engagement) return null
  return (
    <div className="flex items-center gap-1.5 text-[color:var(--portal-faint)]" aria-label={`${engagement.openCount} opens, ${engagement.clickCount} clicks`}>
      <span className="inline-flex items-center gap-0.5" title={`${engagement.openCount} opens`}>
        <Eye size={11} strokeWidth={1.8} />
        <span className="font-mono text-[8px]">{engagement.openCount}</span>
      </span>
      <span className="inline-flex items-center gap-0.5" title={`${engagement.clickCount} clicks`}>
        <MousePointerClick size={11} strokeWidth={1.8} />
        <span className="font-mono text-[8px]">{engagement.clickCount}</span>
      </span>
    </div>
  )
}

function buildMessageDocument(message: EmailMessageItem, blockExternalImages: boolean, portalTheme: 'light' | 'dark') {
  let content = stripTrackingPixels(message.htmlContent || message.content || `<p>${escapeHtml(message.summary || 'No message body available.')}</p>`)
  if (blockExternalImages) {
    content = content.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '<div style="border:1px dashed #a1a1aa;padding:8px;font-size:11px;color:#71717a;text-align:center">[External image blocked]</div>')
  }
  const pageBackground = portalTheme === 'light' ? '#ffffff' : '#0c0b0a'
  const pageText = portalTheme === 'light' ? '#18181b' : '#eee9df'
  const quoteText = portalTheme === 'light' ? '#52525b' : '#b8b0a3'
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{width:100%;max-width:100%;overflow:hidden}*{box-sizing:border-box;max-width:100%}body{width:100%;max-width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;color:${pageText};background:${pageBackground};font-size:14px;line-height:1.6;overflow:hidden;overflow-wrap:anywhere}img{max-width:100%!important;height:auto!important}a{color:#a8792f}blockquote{border-left:3px solid #caa24c;margin:12px 0;padding-left:12px;color:${quoteText}}table{width:100%!important;max-width:100%!important}td,th{max-width:100%!important}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:768px){body{padding:16px;font-size:15px;line-height:1.55}}</style></head><body>${content}</body></html>`
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
      aria-pressed={active}
      title={label}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all cursor-pointer ${
        active
          ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a] border border-[#caa24c]/30'
          : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`shrink-0 ${active ? 'text-[#caa24c]' : 'text-[color:var(--portal-muted)]'}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <span className={`text-[10px] font-mono rounded-full px-2 py-0.5 ${active ? 'bg-[#caa24c]/20 text-[#a8792f] dark:text-[#f1d27a]' : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] border border-[color:var(--portal-border)]'}`}>
        {count}
      </span>
    </button>
  )
}

function DirectionBadge({ direction }: { direction?: 'incoming' | 'outgoing' | 'campaign' }) {
  return (
    <span className="shrink-0 rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[color:var(--portal-muted)]">
      {direction === 'incoming' ? 'Received' : direction === 'campaign' ? 'Blast' : 'Outgoing'}
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
