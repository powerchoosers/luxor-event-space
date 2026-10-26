'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  Folder,
  ArrowLeft,
  ArrowUp,
  Send,
  Reply,
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
  Menu,
  SquarePen,
  Maximize2,
  Minimize2,
  MoreVertical,
  Download,
  FileText,
  Eye,
  MousePointerClick,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { PortalCloseButton, PortalContactAvatar, PortalSkeleton, PortalSkeletonTransition } from '@/components/portal/PortalUI'
import { EmailRichTextEditor } from '@/components/portal/EmailRichTextEditor'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import type { LuxorSharedMailbox } from '@/lib/luxorSharedMailboxes'
import { decodeHtmlEntities, stripTrackingPixels } from '@/lib/luxorTextUtils'
import { luxorMailDeliveryLabel } from '@/lib/luxorMailDelivery'
import { luxorMailAdditionalFolders, type LuxorMailFolder } from '@/lib/luxorMailFolders'
import type { LuxorMailboxPageRequest, LuxorMailboxPageResult } from '@/lib/luxorMailboxPage'

const EmailPdfPreview = dynamic(() => import('@/components/portal/EmailPdfPreview'), { ssr: false })
const EMAIL_READER_MOBILE_QUERY = '(max-width: 1023px)'

function subscribeToEmailReaderMobileLayout(callback: () => void) {
  const mediaQuery = window.matchMedia(EMAIL_READER_MOBILE_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getEmailReaderMobileLayoutSnapshot() {
  return window.matchMedia(EMAIL_READER_MOBILE_QUERY).matches
}

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

function supportsDurableStar(messageId: string) {
  return /^mail-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)
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

const MAILBOX_PAGE_SIZE = 20

interface AllEmailsTabProps {
  inquiries?: LuxorInquiry[]
  initialMessageId?: string
  mailboxEmail?: string
  mailboxName?: string
  sharedMailboxes: LuxorSharedMailbox[]
  activeMailboxKey: string
  onReaderOpenChange: (open: boolean) => void
  mailboxDrawerOpen: boolean
  onMailboxDrawerOpenChange: (open: boolean) => void
  onMailboxChange: (key: string) => void
}

export function AllEmailsTab({ inquiries = [], initialMessageId, mailboxEmail, mailboxName,
  sharedMailboxes, activeMailboxKey, onReaderOpenChange, mailboxDrawerOpen, onMailboxDrawerOpenChange, onMailboxChange }: AllEmailsTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobileReader = useSyncExternalStore(
    subscribeToEmailReaderMobileLayout,
    getEmailReaderMobileLayoutSnapshot,
    () => false,
  )
  const reduceMotion = useReducedMotion()
  const appliedInitialMessageId = useRef<string | null>(null)
  const replyComposerRef = useRef<HTMLDivElement | null>(null)
  const [mobileReplyAnchor, setMobileReplyAnchor] = useState<HTMLDivElement | null>(null)
  const mobileReplyPortalRef = useRef<HTMLDivElement | null>(null)
  const mobileReplyTriggerRef = useRef<HTMLButtonElement | null>(null)
  const threadScrollRef = useRef<HTMLDivElement | null>(null)
  const readerMenuRef = useRef<HTMLDivElement | null>(null)
  const mailboxListRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<EmailMessageItem[]>([])
  const messagesRef = useRef<EmailMessageItem[]>([])
  const [folderCatalog, setFolderCatalog] = useState<LuxorMailFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  // Active navigation & filters
  const [activeFolder, changeActiveFolder] = useState<ActiveFolder>(() => searchParams?.get('folder') || 'inbox')
  const [searchQuery, changeSearchQuery] = useState(() => searchParams?.get('q') || '')

  // Selected email detail state
  const [selectedId, setSelectedId] = useState<string | null>(initialMessageId || null)
  const readerOpenedFromList = useRef(false)
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
  const [replyPromptOpen, setReplyPromptOpen] = useState(false)
  const [replyModalPresent, setReplyModalPresent] = useState(false)
  const [replyDraftLoadedKey, setReplyDraftLoadedKey] = useState<string | null>(null)
  const [mobileReplyBounds, setMobileReplyBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [replyViewport, setReplyViewport] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const replyDraftStorageKey = selectedId
    ? `luxor-email-reply-draft:v1:${encodeURIComponent(activeMailboxKey)}:${encodeURIComponent(selectedId)}`
    : null
  const [replyPreviewOpen, setReplyPreviewOpen] = useState(false)
  const hasUnsentReply = Boolean(replyText.trim() || replyInstruction.trim())

  const syncReplyBounds = useCallback(() => {
    if (!mobileReplyAnchor) return
    const bounds = mobileReplyAnchor.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const visualViewport = window.visualViewport
    const nextBounds = { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
    setMobileReplyBounds((current) => current && current.top === nextBounds.top && current.left === nextBounds.left && current.width === nextBounds.width && current.height === nextBounds.height ? current : nextBounds)
    const nextViewport = {
      top: visualViewport?.offsetTop || 0,
      left: visualViewport?.offsetLeft || 0,
      width: visualViewport?.width || window.innerWidth,
      height: visualViewport?.height || window.innerHeight,
    }
    setReplyViewport((current) => current.top === nextViewport.top && current.left === nextViewport.left && current.width === nextViewport.width && current.height === nextViewport.height ? current : nextViewport)
  }, [mobileReplyAnchor])

  useEffect(() => {
    if (!replyModalPresent || !isMobileReader) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const background = document.querySelector<HTMLElement>('main.portal-main')
    const previousInert = background?.inert || false
    if (background) background.inert = true
    const handleReplyKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sendingReply) {
        event.preventDefault()
        setReplyOpen(false)
      }
      if (event.key !== 'Tab') return
      const panel = mobileReplyPortalRef.current
      if (!panel) return
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', handleReplyKeys)
    return () => {
      document.body.style.overflow = previousOverflow
      if (background) background.inert = previousInert
      document.removeEventListener('keydown', handleReplyKeys)
    }
  }, [replyModalPresent, isMobileReader, sendingReply])

  useEffect(() => {
    if (!isMobileReader || !mobileReplyAnchor) return
    const visualViewport = window.visualViewport
    syncReplyBounds()
    const observer = new ResizeObserver(syncReplyBounds)
    observer.observe(mobileReplyAnchor)
    visualViewport?.addEventListener('resize', syncReplyBounds)
    visualViewport?.addEventListener('scroll', syncReplyBounds)
    window.addEventListener('resize', syncReplyBounds)
    return () => {
      visualViewport?.removeEventListener('resize', syncReplyBounds)
      visualViewport?.removeEventListener('scroll', syncReplyBounds)
      window.removeEventListener('resize', syncReplyBounds)
      observer.disconnect()
    }
  }, [isMobileReader, mobileReplyAnchor, syncReplyBounds])

  useEffect(() => {
    if (!replyDraftStorageKey) {
      setReplyDraftLoadedKey(null)
      return
    }
    setReplyDraftLoadedKey(null)
    try {
      const savedDraft = window.localStorage.getItem(replyDraftStorageKey)
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft) as { replyText?: unknown; replyInstruction?: unknown }
        setReplyText(typeof parsed.replyText === 'string' ? parsed.replyText : '')
        setReplyInstruction(typeof parsed.replyInstruction === 'string' ? parsed.replyInstruction : '')
      } else {
        setReplyText('')
        setReplyInstruction('')
      }
    } catch {
      setReplyText('')
      setReplyInstruction('')
    }
    setReplyDraftLoadedKey(replyDraftStorageKey)
  }, [replyDraftStorageKey])

  useEffect(() => {
    if (!replyDraftStorageKey || replyDraftLoadedKey !== replyDraftStorageKey) return
    try {
      if (!replyText.trim() && !replyInstruction.trim()) {
        window.localStorage.removeItem(replyDraftStorageKey)
        return
      }
      window.localStorage.setItem(replyDraftStorageKey, JSON.stringify({ replyText, replyInstruction }))
    } catch {
      // Keep the in-memory draft available if browser storage is unavailable.
    }
  }, [replyDraftStorageKey, replyDraftLoadedKey, replyText, replyInstruction])

  // Reader pane controls
  const [viewMode, setViewMode] = useState<'html' | 'text'>('html')
  const [viewportWidth, setViewportWidth] = useState<'full' | 'tablet' | 'mobile'>('full')
  const [blockExternalImages, setBlockExternalImages] = useState(false)
  const mailboxDrawerRef = useRef<HTMLElement | null>(null)
  const [readerExpanded, setReaderExpanded] = useState(false)
  const [readerMenuOpen, setReaderMenuOpen] = useState(false)
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<(EmailAttachment & { url: string; mimeType: string }) | null>(null)

  // Star state is loaded from the server-side, per-portal-user mapping table.
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set())
  const [savingStarIds, setSavingStarIds] = useState<Set<string>>(() => new Set())
  const [starErrors, setStarErrors] = useState<Record<string, string>>({})
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    onReaderOpenChange(Boolean(initialMessageId || compactReaderOpen))
  }, [compactReaderOpen, initialMessageId, onReaderOpenChange])

  useEffect(() => {
    if (!mailboxDrawerOpen) return

    // On desktop, the drawer is an inline collapsible sidebar, not a modal dialog.
    // Allow pressing Escape to close it, but do NOT trap focus or steal focus away from the email list/reading pane.
    if (!isMobileReader) {
      const handleDesktopKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onMailboxDrawerOpenChange(false)
        }
      }
      document.addEventListener('keydown', handleDesktopKeyDown)
      return () => document.removeEventListener('keydown', handleDesktopKeyDown)
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = mailboxDrawerRef.current
    const close = () => onMailboxDrawerOpenChange(false)
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []).filter((element) => element.getClientRects().length > 0)

    window.requestAnimationFrame(() => (focusable()[0] || dialog)?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); dialog?.focus(); return }
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus()
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus()
      }
    }
    const handleFocus = (event: FocusEvent) => {
      if (!dialog || !(event.target instanceof Node) || dialog.contains(event.target)) return
      (focusable()[0] || dialog).focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocus)
      window.requestAnimationFrame(() => {
        previousFocus?.focus()
      })
    }
  }, [mailboxDrawerOpen, isMobileReader, onMailboxDrawerOpenChange])

  const pageSnapshot = useRef<{ key: string; value: string | null }>({ key: '', value: null })
  const activePage = useRef(0)
  const mailboxRequest = useRef<{ key: string; page: number; controller: AbortController } | null>(null)
  const mailboxKey = JSON.stringify([activeFolder, searchQuery.trim(), mailboxEmail || ''])
  const mailboxKeyRef = useRef(mailboxKey)
  mailboxKeyRef.current = mailboxKey
  const [pageResult, setPageResult] = useState<LuxorMailboxPageResult<EmailMessageItem> | null>(null)

  const resetMailboxPages = useCallback(() => {
    mailboxRequest.current?.controller.abort()
    mailboxRequest.current = null
    pageSnapshot.current = { key: '', value: null }
    activePage.current = 0
    messagesRef.current = []
    mailboxListRef.current?.scrollTo({ top: 0 })
    setMessages([])
    setPageResult(null)
    setHasMore(true)
    setLoadMoreError(null)
    setError(null)
    setLoading(true)
    setLoadingMore(false)
  }, [])

  const updateListContextUrl = (folder: string, query: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (folder === 'inbox') params.delete('folder')
    else params.set('folder', folder)
    if (query) params.set('q', query)
    else params.delete('q')
    params.delete('listScroll')
    const href = params.toString() ? `/portal/emails?${params.toString()}` : '/portal/emails'
    window.history.replaceState(null, '', href)
  }

  const routeFolder = searchParams?.get('folder') || 'inbox'
  const routeSearchQuery = searchParams?.get('q') || ''
  const routeContextKey = JSON.stringify([routeFolder, routeSearchQuery])
  const lastRouteContextKey = useRef(routeContextKey)

  useEffect(() => {
    if (lastRouteContextKey.current === routeContextKey) return
    lastRouteContextKey.current = routeContextKey
    if (routeFolder === activeFolder && routeSearchQuery === searchQuery) return
    resetMailboxPages()
    changeActiveFolder(routeFolder)
    changeSearchQuery(routeSearchQuery)
  }, [activeFolder, resetMailboxPages, routeContextKey, routeFolder, routeSearchQuery, searchQuery])

  const setActiveFolder = (folder: string) => {
    if (folder === activeFolder) return
    resetMailboxPages()
    changeActiveFolder(folder)
    updateListContextUrl(folder, searchQuery)
  }

  const setSearchQuery = (query: string) => {
    if (query === searchQuery) return
    resetMailboxPages()
    changeSearchQuery(query)
    updateListContextUrl(activeFolder, query)
  }

  const loadEmails = useCallback(async (force = false) => {
    const key = JSON.stringify([activeFolder, searchQuery.trim(), mailboxEmail || ''])
    const previousPageCount = pageSnapshot.current.key === key ? Math.max(1, activePage.current) : 1
    const pagesToLoad = force ? previousPageCount : 1
    const queryChanged = pageSnapshot.current.key !== key
    mailboxRequest.current?.controller.abort()
    const controller = new AbortController()
    const request = { key, page: 1, controller }
    mailboxRequest.current = request
    if (queryChanged) {
      pageSnapshot.current = { key, value: null }
      activePage.current = 0
      messagesRef.current = []
      setMessages([])
      setPageResult(null)
      setHasMore(true)
      setLoadMoreError(null)
    } else if (force) {
      pageSnapshot.current = { key, value: null }
    }
    setLoading(true)
    setError(null)
    try {
      let snapshot: string | null = null
      let result: LuxorMailboxPageResult<EmailMessageItem> | null = null
      const refreshedMessages = new Map<string, EmailMessageItem>()
      for (let page = 1; page <= pagesToLoad; page += 1) {
        result = await requestMailbox({ folder: activeFolder, query: searchQuery, page,
          pageSize: MAILBOX_PAGE_SIZE, snapshot, starred: [], email: mailboxEmail }, controller.signal)
        if (controller.signal.aborted || mailboxRequest.current !== request) return
        if (page === 1) snapshot = result.snapshot
        result.messages.forEach((message) => refreshedMessages.set(messageKey(message), message))
        if (result.messages.length === 0 || result.page * MAILBOX_PAGE_SIZE >= result.total) break
      }
      if (controller.signal.aborted || mailboxRequest.current !== request || !result) return
      const nextMessages = [...refreshedMessages.values()]
      pageSnapshot.current = { key, value: snapshot }
      activePage.current = result.page
      setPageResult(result)
      messagesRef.current = nextMessages
      setMessages(nextMessages)
      setStarredIds(new Set(result.starredIds || nextMessages.filter((message) => message.isStarred).map((message) => message.id)))
      setFolderCatalog(result.folders)
      setHasMore(result.messages.length > 0 && result.page * MAILBOX_PAGE_SIZE < result.total)
      setLoadMoreError(null)
      const latest = new Map(nextMessages.map(message => [message.id, message]))
      const updateState = (detail: EmailMessageItem) => {
        const summary = latest.get(detail.id)
        return summary && detail.id.startsWith('mail-')
          ? { ...detail, isRead: summary.isRead, deliveryStatus: summary.deliveryStatus, deliveryError: summary.deliveryError }
          : detail
      }
      for (const [cacheKey, detail] of messageDetailCache) messageDetailCache.set(cacheKey, updateState(detail))
      setMessageDetail(current => current ? updateState(current) : current)
    } catch (requestError) {
      if (!controller.signal.aborted && mailboxRequest.current === request) {
        setError(requestError instanceof Error ? requestError.message : 'The mailbox could not load this page. Please retry.')
      }
    } finally {
      if (mailboxRequest.current === request) {
        mailboxRequest.current = null
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [activeFolder, searchQuery, mailboxEmail])

  const loadNextPage = useCallback(async () => {
    const key = JSON.stringify([activeFolder, searchQuery.trim(), mailboxEmail || ''])
    if (!hasMore || loading || loadingMore || mailboxRequest.current || pageSnapshot.current.key !== key || !pageSnapshot.current.value) return
    const page = activePage.current + 1
    const controller = new AbortController()
    const request = { key, page, controller }
    mailboxRequest.current = request
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const result = await requestMailbox({ folder: activeFolder, query: searchQuery, page,
        pageSize: MAILBOX_PAGE_SIZE, snapshot: pageSnapshot.current.value, starred: [], email: mailboxEmail }, controller.signal)
      if (controller.signal.aborted || mailboxRequest.current !== request || mailboxKeyRef.current !== key) return
      const known = new Set(messagesRef.current.map(messageKey))
      const appended = result.messages.filter((message) => !known.has(messageKey(message)))
      const nextMessages = [...messagesRef.current, ...appended]
      messagesRef.current = nextMessages
      setMessages(nextMessages)
      setPageResult(result)
      setStarredIds(new Set(result.starredIds || nextMessages.filter((message) => message.isStarred).map((message) => message.id)))
      setFolderCatalog(result.folders)
      activePage.current = result.page
      pageSnapshot.current = { key, value: result.snapshot }
      setHasMore(result.messages.length > 0 && result.page * MAILBOX_PAGE_SIZE < result.total)
      const latest = new Map(nextMessages.map((message) => [message.id, message]))
      const updateState = (detail: EmailMessageItem) => {
        const summary = latest.get(detail.id)
        return summary && detail.id.startsWith('mail-')
          ? { ...detail, isRead: summary.isRead, deliveryStatus: summary.deliveryStatus, deliveryError: summary.deliveryError }
          : detail
      }
      for (const [cacheKey, detail] of messageDetailCache) messageDetailCache.set(cacheKey, updateState(detail))
      setMessageDetail((current) => current ? updateState(current) : current)
    } catch (requestError) {
      if (!controller.signal.aborted && mailboxRequest.current === request) {
        setLoadMoreError(requestError instanceof Error ? requestError.message : 'More messages could not load. Please retry.')
      }
    } finally {
      if (mailboxRequest.current === request) {
        mailboxRequest.current = null
        setLoadingMore(false)
      }
    }
  }, [activeFolder, searchQuery, mailboxEmail, hasMore, loading, loadingMore])

  useEffect(() => {
    // Search is server-side across all saved mail; debounce typing and abort
    // obsolete page requests so a slow response cannot replace newer results.
    const timer = window.setTimeout(() => { void loadEmails() }, 200)
    return () => {
      window.clearTimeout(timer)
      mailboxRequest.current?.controller.abort()
    }
  }, [loadEmails])

  useEffect(() => {
    const root = mailboxListRef.current
    const sentinel = root?.querySelector<HTMLElement>('[data-mailbox-list-end]')
    if (!root || !sentinel || !hasMore || loading || loadingMore || loadMoreError || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNextPage()
    }, { root, rootMargin: '280px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingMore, loadMoreError, messages.length, loadNextPage])

  const savedListScrollParam = searchParams?.get('listScroll') || ''
  useEffect(() => {
    const savedScroll = Number(savedListScrollParam || 0)
    const list = mailboxListRef.current
    if (compactReaderOpen || loading || !list || !Number.isFinite(savedScroll) || savedScroll <= 0) return
    list.scrollTo({ top: savedScroll })
  }, [compactReaderOpen, loading, savedListScrollParam])

  useEffect(() => {
    const nextInitialMessageId = initialMessageId || null
    if (appliedInitialMessageId.current !== nextInitialMessageId) {
      const previousInitialMessageId = appliedInitialMessageId.current
      appliedInitialMessageId.current = nextInitialMessageId
      if (!nextInitialMessageId) {
        if (previousInitialMessageId) {
          setSelectedId(null)
          setSelectedMessageKey(null)
          setMessageDetail(null)
          setCompactReaderOpen(false)
          setReaderExpanded(false)
        }
        return
      }
      const target = messages.find((message) => message.id === nextInitialMessageId)
      setSelectedId(nextInitialMessageId)
      setReadRequestedId(nextInitialMessageId)
      if (target) setSelectedMessageKey(messageKey(target))
      setCompactReaderOpen(true)
      return
    }
    // Preserve an open reader when paging. Deep links can load directly even
    // when the requested message is far outside the first page.
    if (selectedId || loading) return
    const target = messages[0]
    if (target) { setSelectedId(target.id); setSelectedMessageKey(messageKey(target)) }
  }, [initialMessageId, loading, messages, selectedId])

  const selectedMailboxSummary = messages.find((message) => messageKey(message) === selectedMessageKey)
    || messages.find((message) => message.id === selectedId)
  // Detail loading must not change its own folder dependency as it clears/repopulates the detail.
  const selectedFolderId = selectedMailboxSummary?.folderId

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
      setMessages((current) => {
        const next = current.map(apply)
        messagesRef.current = next
        return next
      })
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
      setReplyText(plainTextToEmailHtml(data.draft))
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
      if (replyDraftStorageKey) {
        try { window.localStorage.removeItem(replyDraftStorageKey) } catch { /* The sent reply remains cleared in memory. */ }
      }
      setReplyOpen(false)
      setReplyPreviewOpen(false)
    } catch (error) {
      setReplyStatus(error instanceof Error ? error.message : 'Reply could not be sent.')
    } finally {
      setSendingReply(false)
    }
  }

  useEffect(() => {
    if (!replyOpen || isMobileReader) return
    const frame = window.requestAnimationFrame(() => {
      const scrollPane = threadScrollRef.current
      scrollPane?.scrollTo({
        top: scrollPane.scrollHeight,
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [replyOpen, isMobileReader, reduceMotion])

  useEffect(() => {
    if (!hasUnsentReply) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [hasUnsentReply])

  // Persist stars only for canonical archived mail IDs. Synthetic event, job,
  // and campaign rows intentionally do not expose a non-durable star action.
  const toggleStar = async (id: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    if (e) e.stopPropagation()
    if (!supportsDurableStar(id) || savingStarIds.has(id)) return
    const wasStarred = starredIds.has(id)
    const desiredState = !wasStarred
    setStarErrors((current) => { const next = { ...current }; delete next[id]; return next })
    setSavingStarIds((current) => new Set(current).add(id))
    setStarredIds((current) => {
      const next = new Set(current)
      if (desiredState) next.add(id)
      else next.delete(id)
      return next
    })
    try {
      const response = await fetch(`/api/email/messages/${encodeURIComponent(id)}/star`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: desiredState, email: mailboxEmail || undefined }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; isStarred?: boolean }
      if (!response.ok) throw new Error(result.error || 'The message star could not be saved.')
      setStarredIds((current) => {
        const next = new Set(current)
        if (result.isStarred === true) next.add(id)
        else next.delete(id)
        return next
      })
      const savedStarred = result.isStarred === true
      const starCountDelta = Number(savedStarred) - Number(wasStarred)
      if (activeFolder === 'starred' && !savedStarred) {
        const nextMessages = messagesRef.current.filter((message) => message.id !== id)
        messagesRef.current = nextMessages
        setMessages(nextMessages)
        // Starred pages use offsets over a live, mutable set of star IDs.
        // Removing one row shifts every later offset, so reload the already
        // visible page depth with a fresh snapshot before allowing pagination.
        void loadEmails(true)
      }
      setPageResult((current) => current ? {
        ...current,
        stats: {
          ...current.stats,
          starredCount: Math.max(0, current.stats.starredCount + starCountDelta),
        },
        folderCounts: activeFolder === 'starred' && !savedStarred
          ? { ...current.folderCounts, starred: Math.max(0, (current.folderCounts.starred ?? current.total) - 1) }
          : current.folderCounts,
        ...(activeFolder === 'starred' && !savedStarred ? { total: Math.max(0, current.total - 1) } : {}),
      } : current)
    } catch (error) {
      setStarredIds((current) => {
        const next = new Set(current)
        if (wasStarred) next.add(id)
        else next.delete(id)
        return next
      })
      setStarErrors((current) => ({ ...current, [id]: error instanceof Error ? error.message : 'The message star could not be saved.' }))
    } finally {
      setSavingStarIds((current) => { const next = new Set(current); next.delete(id); return next })
    }
  }

  const totalItems = pageResult?.total || 0

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
  const folderCount = (folder: { value: string; count?: number }) => folder.value === 'inbox' ? stats.inboxCount
    : folder.value === 'sent' ? stats.sentCount
      : folder.value === 'all' ? stats.total
        : folder.value === 'campaigns' ? stats.campaignCount
          : folder.value === 'starred' ? stats.starredCount
            : pageResult?.folderCounts[folder.value] ?? folder.count ?? 0
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

  const canLeaveReplyDraft = (destination: string) => {
    if (sendingReply) {
      window.alert('Please wait for the reply to finish sending before leaving this email.')
      return false
    }
    return !hasUnsentReply || window.confirm(`Discard your unsent reply and ${destination}?`)
  }

  const collapseReplyComposer = () => {
    setReplyOpen(false)
    setReplyPreviewOpen(false)
  }

  const selectMessage = (message: EmailMessageItem) => {
    const nextMessageKey = messageKey(message)
    const isSameMessage = nextMessageKey === selectedMessageKey
    if (!isSameMessage && !canLeaveReplyDraft('open a different email')) return

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
    setReplyPreviewOpen(false)
    setReaderMenuOpen(false)
    if (!isSameMessage) {
      setReplyText('')
      setReplyInstruction('')
      setReplyStatus(null)
    }
    const currentMessageId = searchParams?.get('messageId') || ''
    if (!currentMessageId) readerOpenedFromList.current = true
    if (currentMessageId !== message.id) {
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (activeFolder === 'inbox') params.delete('folder')
      else params.set('folder', activeFolder)
      if (searchQuery) params.set('q', searchQuery)
      else params.delete('q')
      params.set('listScroll', String(Math.round(mailboxListRef.current?.scrollTop || 0)))
      params.set('messageId', message.id)
      const href = `/portal/emails?${params.toString()}`
      if (currentMessageId) router.replace(href, { scroll: false })
      else router.push(href, { scroll: false })
    }
  }

  const closeReader = () => {
    if (!canLeaveReplyDraft('return to the email list')) return
    setReplyOpen(false)
    setReplyPreviewOpen(false)
    setReplyText('')
    setReplyInstruction('')
    setReplyStatus(null)
    if (replyDraftStorageKey) {
      try { window.localStorage.removeItem(replyDraftStorageKey) } catch { /* Keep the close action available if storage is unavailable. */ }
    }
    if (readerOpenedFromList.current && searchParams?.get('messageId')) {
      router.back()
      return
    }
    setCompactReaderOpen(false)
    setReaderExpanded(false)
    setReaderMenuOpen(false)
    readerOpenedFromList.current = false
    if (searchParams?.get('messageId')) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('messageId')
      router.replace(params.toString() ? `/portal/emails?${params.toString()}` : '/portal/emails', { scroll: false })
    }
  }

  const selectedCcLabel = messageDetail?.cc ? mailboxLabel(messageDetail.cc, inquiryByEmail, '') : ''
  const renderReplyComposerContent = (mobile: boolean) => mobile ? (
    <>
      <header className="flex min-h-14 shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4">
        <PortalCloseButton onClick={collapseReplyComposer} disabled={sendingReply} aria-label="Close reply and keep draft" />
        <p className="sr-only">Reply to {thread?.clientEmail || (messageDetail?.direction === 'incoming' ? firstMailboxEmail(messageDetail.from) : firstMailboxEmail(messageDetail?.to || ''))}</p>
        <button type="button" onClick={() => void sendInlineReply()} disabled={sendingReply || !replyText.trim()} aria-label={sendingReply ? 'Sending reply' : 'Send reply'} title="Send reply" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#caa24c] text-white shadow-sm transition-colors hover:bg-[#b98a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-card)] disabled:cursor-not-allowed disabled:opacity-50">
          {sendingReply ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
        </button>
      </header>
      <div className="flex min-h-0 flex-1 px-2" onPointerDown={() => setReplyPromptOpen(false)} onFocusCapture={() => setReplyPromptOpen(false)}>
        <EmailRichTextEditor value={replyText} onChange={setReplyText} placeholder="Write your message…" ariaLabel="Write your reply" autoFocus hideToolbar focusMode />
      </div>
      <div className="shrink-0 bg-[color:var(--portal-card)] px-4 pb-3 pt-2">
        <AnimatePresence initial={false}>
          {replyPromptOpen && <motion.div
            key="reply-elena-prompt"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="relative rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-3 shadow-sm transition-colors focus-within:border-[#caa24c]/55 focus-within:ring-2 focus-within:ring-[#caa24c]/10">
              <label htmlFor="mobile-reply-instruction" className="sr-only">Direction for Elena</label>
              <textarea id="mobile-reply-instruction" value={replyInstruction} onChange={(event) => setReplyInstruction(event.target.value)} placeholder="Ask Elena to draft a reply…" rows={2} className="portal-input-transparent min-h-16 max-h-32 w-full resize-none border-0 bg-transparent pr-6 text-sm leading-6 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)]" />
              <button type="button" onClick={() => setReplyPromptOpen(false)} aria-label="Hide Elena prompt" title="Hide prompt" className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-faint)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><X size={14} /></button>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--portal-muted)]"><FilePenLine size={13} /> Elena</span>
                <button type="button" onClick={() => void draftWithElena()} disabled={draftingReply || loadingThread} aria-label={draftingReply ? 'Elena is drafting' : 'Generate reply with Elena'} title="Generate reply" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#caa24c] text-white transition-colors hover:bg-[#b98a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--portal-bg)] disabled:cursor-wait disabled:opacity-50">
                  {draftingReply ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          </motion.div>}
        </AnimatePresence>
        {!replyPromptOpen && <button type="button" onClick={() => setReplyPromptOpen(true)} aria-expanded={false} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
          <FilePenLine size={15} /> Write with Elena
        </button>}
        {replyStatus ? <p role="status" aria-live="polite" className="pb-2 text-xs leading-4 text-[color:var(--portal-muted)]">{replyStatus}</p> : null}
      </div>
    </>
  ) : (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] px-3 py-2.5 sm:px-4">
        <p className="min-w-0 truncate text-xs font-semibold text-[color:var(--portal-text)]">To: {currentInquiry?.full_name || mailboxLabel(thread?.clientEmail || (messageDetail?.direction === 'incoming' ? messageDetail.from : messageDetail?.to || ''), inquiryByEmail)} <span className="font-normal text-[color:var(--portal-muted)]">{thread?.clientEmail || (messageDetail?.direction === 'incoming' ? firstMailboxEmail(messageDetail.from) : firstMailboxEmail(messageDetail?.to || ''))}</span></p>
        <div className="flex shrink-0 items-center gap-3">
          {currentInquiry && (
            <Link href={`/portal/leads/${currentInquiry.id}`} className={`${mobile ? 'hidden sm:inline-flex' : ''} text-[9px] font-bold uppercase tracking-wider text-[#a8792f] hover:underline dark:text-[#f1d27a]`}>
              View client file
            </Link>
          )}
          <button
            type="button"
            onClick={collapseReplyComposer}
            disabled={sendingReply}
            className={mobile
              ? 'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 disabled:cursor-wait disabled:opacity-50'
              : 'rounded-lg p-1.5 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 disabled:cursor-wait disabled:opacity-50'}
            aria-label="Collapse reply composer and keep draft"
            title="Collapse reply composer and keep draft"
          >
            {mobile ? <span className="text-[11px] font-medium">Cancel</span> : null}
            <X size={14} />
          </button>
        </div>
      </div>

      <div className={mobile
        ? 'flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain p-3 portal-scrollbar'
        : 'flex min-h-[360px] flex-col gap-2.5 p-3 sm:min-h-[400px] sm:p-4'}>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <input
            value={replyInstruction}
            onChange={(event) => setReplyInstruction(event.target.value)}
            placeholder="Optional direction for Elena"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50"
          />
          <button
            type="button"
            onClick={() => void draftWithElena()}
            disabled={draftingReply || loadingThread}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-medium text-[#a8792f] hover:bg-[color:var(--portal-soft)] disabled:opacity-50 dark:text-[#f1d27a]"
          >
            {draftingReply ? <Loader2 size={13} className="animate-spin" /> : <FilePenLine size={13} />}
            Draft with Elena
          </button>
        </div>
        {replyPreviewOpen ? (
          <iframe
            title="Reply preview"
            srcDoc={buildEmailReplyPreviewDocument(replyText)}
            sandbox="allow-popups"
            className={`${mobile ? 'min-h-[8rem]' : 'min-h-[11rem]'} flex-1 rounded-lg border border-[color:var(--portal-border)] bg-white`}
          />
        ) : (
          <EmailRichTextEditor
            value={replyText}
            onChange={setReplyText}
            autoFocus
            placeholder="Write your message…"
            ariaLabel="Write your reply"
            className="min-h-[280px]"
          />
        )}
        <div className={mobile ? "sticky bottom-0 -mx-3 -mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 px-3 py-2 backdrop-blur" : "flex shrink-0 flex-wrap items-center justify-between gap-3"}>
          <p role={replyStatus ? 'status' : undefined} className="min-h-4 min-w-0 flex-1 text-[10px] text-[color:var(--portal-muted)]">{replyStatus}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setReplyPreviewOpen((open) => !open)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
              <Eye size={14} /> {replyPreviewOpen ? 'Back to editor' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => void sendInlineReply()}
              disabled={sendingReply || !replyText.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#caa24c] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#b98a3d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sendingReply ? 'Sending' : 'Send reply'}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  const renderMailboxNav = (mobile: boolean) => (
    <div className={mobile ? "flex h-full flex-col" : "flex h-full min-h-0 w-60 xl:w-64 min-w-[15rem] xl:min-w-[16rem] flex-col"}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="min-w-0">
          <p id={mobile ? "mailbox-drawer-title-mobile" : "mailbox-drawer-title"} className="font-serif text-base tracking-[0.2em] text-[#a8792f] dark:text-[#f1d27a]">LUXOR</p>
          <p className="mt-0.5 truncate text-[11px] text-[color:var(--portal-muted)]" title={mailboxEmail || 'booking@luxoratlaspalmas.com'}>
            {mailboxName ? `${mailboxName} · ${mailboxEmail}` : mailboxEmail || 'booking@luxoratlaspalmas.com'}
          </p>
        </div>
        <PortalCloseButton onClick={() => onMailboxDrawerOpenChange(false)} aria-label="Close mailbox navigation" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto portal-scrollbar p-3 sm:p-4">
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[color:var(--portal-faint)]">Mailboxes</p>
        <div className="space-y-1">
          <DrawerNavItem
            icon={<Mail size={16} />}
            label="All email"
            active={activeMailboxKey === 'all'}
            onClick={() => {
              onMailboxChange('all')
              if (mobile) onMailboxDrawerOpenChange(false)
            }}
          />
          {sharedMailboxes.map((mailbox) => (
            <DrawerNavItem
              key={mailbox.key}
              icon={<Mail size={16} />}
              label={mailbox.label}
              detail={mailbox.address}
              active={activeMailboxKey === mailbox.key}
              onClick={() => {
                onMailboxChange(mailbox.key)
                if (mobile) onMailboxDrawerOpenChange(false)
              }}
            />
          ))}
        </div>
        <div className="my-3 sm:my-4 border-t border-[color:var(--portal-border)]" />
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-[color:var(--portal-faint)]">Folders</p>
        <div className="space-y-1">
          {folderOptions.map((folder) => (
            <DrawerNavItem
              key={folder.value}
              icon={folder.value === 'starred' ? <Star size={16} /> : folder.value === 'campaigns' ? <Megaphone size={16} /> : <Folder size={16} />}
              label={folder.label}
              count={folderCount(folder)}
              active={activeFolder === folder.value}
              onClick={() => {
                setActiveFolder(folder.value)
                if (mobile) onMailboxDrawerOpenChange(false)
              }}
            />
          ))}
        </div>
        <div className="my-3 sm:my-4 border-t border-[color:var(--portal-border)]" />
        <Link
          href="/portal/email-tools"
          onClick={() => onMailboxDrawerOpenChange(false)}
          className="flex min-h-10 sm:min-h-11 items-center gap-3 rounded-xl px-3 text-xs sm:text-sm font-medium text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
        >
          <FileText size={16} className="text-[#a8792f] dark:text-[#f1d27a]" /> Email Tools
        </Link>
      </div>
    </div>
  )

  return (
    <>
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <AnimatePresence initial={false}>
      {mailboxDrawerOpen && isMobileReader && (
        <motion.button
          key="mailbox-drawer-backdrop"
          type="button"
          aria-label="Close mailbox navigation"
          onClick={() => onMailboxDrawerOpenChange(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          className="absolute inset-0 z-40 cursor-default bg-black/40 lg:hidden"
        />
      )}
      {mailboxDrawerOpen && isMobileReader && (
        <motion.aside
          key="mailbox-drawer-mobile"
          ref={mailboxDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mailbox-drawer-title-mobile"
          tabIndex={-1}
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
          className="portal-overlay-surface absolute inset-y-0 left-0 z-50 flex w-full flex-col overflow-y-auto border-r border-[color:var(--portal-border)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl lg:hidden"
        >
          {renderMailboxNav(true)}
        </motion.aside>
      )}
      </AnimatePresence>
      {!compactReaderOpen ? <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-2 lg:hidden">
        <button
          type="button"
          onClick={() => onMailboxDrawerOpenChange(true)}
          aria-label="Open mailbox navigation"
          title="Open mailbox navigation"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color:var(--portal-border)] text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]"
        >
          <Menu size={19} aria-hidden="true" />
        </button>
        <div className="relative min-w-0 flex-1">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
          <input
            type="search"
            aria-label="Search saved email"
            value={searchQuery}
            maxLength={200}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search mail"
            className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 pl-10 pr-3 text-base text-[color:var(--portal-text)] outline-none transition-colors focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15 placeholder:text-[color:var(--portal-faint)]"
          />
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email'))}
          aria-label="Compose email"
          title="Compose email"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#caa24c] text-white transition-colors hover:bg-[#b98a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] focus-visible:ring-offset-2"
        >
          <SquarePen size={19} aria-hidden="true" />
        </button>
      </div> : null}
      <div className="flex min-h-0 flex-1 w-full overflow-hidden rounded-none border-x border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] font-sans text-[color:var(--portal-text)] shadow-none lg:rounded-2xl lg:border lg:shadow-sm">
      {/* PANE 1: Mailbox Navigation (Desktop collapsible column) */}
      <AnimatePresence initial={false}>
      {mailboxDrawerOpen && !readerExpanded && (
        <motion.aside
          key="mailbox-nav-desktop"
          role="region"
          aria-label="Mailbox navigation"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'var(--mailbox-nav-width)', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="hidden lg:flex min-h-0 shrink-0 w-60 [--mailbox-nav-width:15rem] xl:w-64 xl:[--mailbox-nav-width:16rem] border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/20 flex-col overflow-hidden"
        >
          {renderMailboxNav(false)}
        </motion.aside>
      )}
      </AnimatePresence>
      {/* PANE 2: Message Threads List */}
      <AnimatePresence initial={false}>
      {!readerExpanded && <motion.div
        key="message-list"
        initial={{ width: 0, opacity: 0, x: -12 }}
        animate={{ width: 'var(--message-list-width)', opacity: 1, x: 0 }}
        exit={{ width: 0, opacity: 0, x: -12 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
        className={`min-h-0 min-w-0 w-full [--message-list-width:100%] lg:w-80 lg:[--message-list-width:20rem] xl:w-96 xl:[--message-list-width:24rem] shrink-0 lg:border-r border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/20 flex-col overflow-hidden ${compactReaderOpen ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2.5 sm:px-4">
          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => onMailboxDrawerOpenChange(!mailboxDrawerOpen)}
              aria-label={mailboxDrawerOpen ? "Close mailbox navigation" : "Open mailbox navigation"}
              title={mailboxDrawerOpen ? "Close mailbox navigation" : "Open mailbox navigation"}
              aria-expanded={mailboxDrawerOpen}
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ${
                mailboxDrawerOpen
                  ? 'border-[#caa24c]/40 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]'
                  : 'border-[color:var(--portal-border)] text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-faint)]" />
              <input
                type="search"
                aria-label="Search saved email"
                value={searchQuery}
                maxLength={200}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search mail"
                className="min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 pl-10 pr-3 text-base text-[color:var(--portal-text)] outline-none transition-colors focus:border-[#caa24c]/55 focus:ring-2 focus:ring-[#caa24c]/15 placeholder:text-[color:var(--portal-faint)]"
              />
            </div>
          </div>
          <div className="mt-2 flex min-h-9 items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <h3 className="truncate text-sm font-semibold text-[color:var(--portal-text)]" title={activeFolderLabel}>{activeFolderLabel}</h3>
              <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">{totalItems.toLocaleString()}</span>
            </div>
            <button type="button" onClick={() => void loadEmails(true)} disabled={loading || loadingMore} aria-label="Refresh messages" title="Refresh messages"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div ref={mailboxListRef} aria-busy={loading || loadingMore} className="min-h-0 flex-1 overflow-y-auto overscroll-contain portal-scrollbar divide-y divide-[color:var(--portal-border)]">
          <PortalSkeletonTransition
            loading={loading && messages.length === 0}
            skeleton={
              <div className="divide-y divide-[color:var(--portal-border)]" aria-label="Loading messages">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:px-4 min-h-[4.75rem]">
                    <div className="flex min-w-0 items-center gap-3 pr-1">
                      <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <PortalSkeleton className="h-3.5 w-36 rounded" />
                          <PortalSkeleton className="h-2.5 w-14 rounded" />
                        </div>
                        <PortalSkeleton className="h-3.5 w-3/4 rounded" />
                        <PortalSkeleton className="h-3 w-full rounded" />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <PortalSkeleton className="h-10 w-10 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            {error && messages.length === 0 ? (
              <div role="alert" className="p-6 text-center">
                <p className="text-sm leading-relaxed text-rose-500 dark:text-rose-300">{error}</p>
                <button type="button" onClick={() => void loadEmails()} className="mt-3 min-h-11 rounded-lg border border-[color:var(--portal-border)] px-4 text-sm text-[color:var(--portal-text)]">Retry messages</button>
              </div>
            ) : messages.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[color:var(--portal-muted)]">
                No emails match the selected folder or search.
              </div>
            ) : (
              messages.map((msg) => {
                const isSelected = messageKey(msg) === selectedMessageKey
                const isStarred = starredIds.has(msg.id)
                const isRead = Boolean(msg.isRead) || readIds.has(msg.id) || msg.direction !== 'incoming'
                const sender = msg.direction === 'outgoing' ? `To: ${mailboxLabel(msg.to, inquiryByEmail)}` : mailboxLabel(msg.from, inquiryByEmail)
                const subject = decodeHtmlEntities(msg.subject) || '(No subject)'
                const isCanonical = supportsDurableStar(msg.id)
                const isOpenable = !msg.id.startsWith('event-')
                const primaryRow = (
                  <>
                    <PortalContactAvatar name={sender} size="lg" className="shrink-0 text-base" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {!isRead ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#caa24c]" /> : <span className="h-2 w-2 shrink-0" />}
                        {!isRead ? <span className="sr-only">Unread</span> : null}
                        <span className={`min-w-0 flex-1 truncate text-[18px] leading-6 lg:text-sm ${isRead ? 'font-medium text-[color:var(--portal-muted)]' : 'font-bold text-[color:var(--portal-text)]'}`}>{sender}</span>
                        <time className="shrink-0 whitespace-nowrap text-sm tabular-nums leading-5 text-[color:var(--portal-muted)] lg:text-xs">{formatEmailDate(msg.receivedAt)}</time>
                      </span>
                      <span className={`mt-0.5 block truncate text-[18px] leading-6 lg:text-sm ${isSelected ? 'font-semibold text-[color:var(--portal-text)]' : 'font-medium text-[color:var(--portal-text)]'}`}>{subject}</span>
                      <span className="mt-0.5 block truncate text-base leading-5 text-[color:var(--portal-muted)] lg:text-xs">{decodeHtmlEntities(msg.summary) || 'No preview available.'}</span>
                      {msg.direction === 'outgoing' && msg.deliveryStatus ? <span className="mt-1 inline-flex text-[10px] text-[color:var(--portal-muted)]">{luxorMailDeliveryLabel(msg.deliveryStatus)}</span> : null}
                    </span>
                  </>
                )

                return (
                  <article key={messageKey(msg)} data-read={isRead ? 'true' : 'false'}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 transition-colors sm:px-4 ${isSelected ? 'bg-[#caa24c]/[0.08] shadow-[inset_3px_0_0_#caa24c]' : 'hover:bg-[color:var(--portal-soft)]/55'}`}>
                    {isOpenable ? <button type="button" onClick={() => selectMessage(msg)} aria-label={`Open conversation: ${subject}`}
                      aria-current={isSelected ? 'true' : undefined}
                      className="flex min-h-[4.75rem] min-w-0 items-center gap-3 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#caa24c]">{primaryRow}</button>
                      : <div aria-label={`${subject}, message details unavailable`} className="flex min-h-[4.75rem] min-w-0 items-center gap-3 pr-1 text-left">{primaryRow}</div>}
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      {isCanonical ? <button type="button" onClick={(event) => void toggleStar(msg.id, event)} disabled={savingStarIds.has(msg.id)}
                        aria-label={isStarred ? 'Remove star' : 'Star message'} aria-pressed={isStarred}
                        aria-describedby={starErrors[msg.id] ? `star-error-${msg.id}` : undefined}
                        title={starErrors[msg.id] || (isStarred ? 'Remove star' : 'Star message')}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] disabled:cursor-wait disabled:opacity-50 ${isStarred ? 'text-[#b18432]' : 'text-[color:var(--portal-faint)] hover:bg-[color:var(--portal-card)] hover:text-[#a8792f]'}`}>
                        <Star size={15} className={isStarred ? 'fill-[#caa24c] text-[#a8792f]' : ''} />
                      </button> : <span className="h-10 w-10" aria-hidden="true" />}
                      {msg.hasAttachment ? <span title="Has attachment" aria-label="Has attachment" className="text-[color:var(--portal-muted)]"><Paperclip size={12} /></span> : null}
                      {starErrors[msg.id] ? <span id={`star-error-${msg.id}`} role="status" className="sr-only">{starErrors[msg.id]}</span> : null}
                    </div>
                  </article>
                )
              })
            )}
          </PortalSkeletonTransition>
          {error && messages.length > 0 ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/45 px-4 py-3 text-sm text-[color:var(--portal-muted)]">
              <span>{error}</span>
              <button type="button" onClick={() => void loadEmails(true)} className="min-h-10 shrink-0 rounded-lg border border-[color:var(--portal-border)] px-3 font-medium text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">Retry refresh</button>
            </div>
          ) : null}
          {loadingMore ? (
            <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-[color:var(--portal-muted)]">
              <Loader2 size={15} className="animate-spin text-[#a8792f] dark:text-[#f1d27a]" /> Loading more messages
            </div>
          ) : null}
          {loadMoreError ? (
            <div role="alert" className="flex flex-wrap items-center justify-center gap-3 px-4 py-4 text-sm text-[color:var(--portal-muted)]">
              <span>{loadMoreError}</span>
              <button type="button" onClick={() => void loadNextPage()} className="min-h-10 rounded-lg border border-[color:var(--portal-border)] px-3 font-medium text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]">Retry</button>
            </div>
          ) : null}
          {!loading && !loadingMore && !hasMore && messages.length > 0 ? (
            <p role="status" className="px-4 py-4 text-center text-xs text-[color:var(--portal-muted)]">You’re all caught up.</p>
          ) : null}
          <div data-mailbox-list-end className="h-px w-full" aria-hidden="true" />
        </div>

      </motion.div>}
      </AnimatePresence>

      {/* PANE 3: Mainstream Email Detail & Isolated Viewer */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-hidden bg-[color:var(--portal-card)] flex-col ${compactReaderOpen ? 'flex' : 'hidden lg:flex'}`}>
        <div className="flex min-h-11 shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2 py-1.5 sm:px-4">
          <button type="button" onClick={closeReader} aria-label="Back to email list" title="Back to email list" className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ${readerExpanded ? '' : 'lg:hidden'}`}>
            <ArrowLeft size={17} aria-hidden="true" /> <span className={readerExpanded ? 'hidden lg:inline' : 'hidden'}>Back to list</span>
          </button>
          {selectedId && messageDetail ? (
            <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--portal-text)] sm:text-sm lg:text-base" title={decodeHtmlEntities(messageDetail.subject)}>
              {decodeHtmlEntities(messageDetail.subject)}
            </h2>
          ) : selectedId && loadingDetail ? (
            <PortalSkeleton className="h-3.5 w-2/5 min-w-24 rounded sm:h-4" />
          ) : null}
          <div className="flex min-w-0 items-center gap-1">
            <span className="max-w-28 truncate pr-1 text-[10px] text-[color:var(--portal-muted)] sm:hidden">{mailboxName || 'Luxor Email'}</span>
            {selectedId && messageDetail ? (
                <div className="flex shrink-0 items-center gap-1">
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
                          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[70] max-h-[min(68dvh,520px)] overflow-y-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-xs shadow-2xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-11 lg:max-h-[min(72dvh,580px)] lg:w-72 lg:origin-top-right lg:rounded-xl lg:p-1.5 lg:text-[10px]"
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
                          {supportsDurableStar(messageDetail.id) ? <button
                            type="button"
                            role="menuitem"
                            disabled={savingStarIds.has(messageDetail.id)}
                            aria-pressed={starredIds.has(messageDetail.id)}
                            onClick={(event) => {
                              void toggleStar(messageDetail.id, event)
                              setReaderMenuOpen(false)
                            }}
                            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:cursor-wait disabled:opacity-50"
                          >
                            <Star size={13} className={starredIds.has(messageDetail.id) ? 'fill-[#caa24c] text-[#caa24c]' : ''} />
                            {starredIds.has(messageDetail.id) ? 'Remove star' : 'Star message'}
                          </button> : null}
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
            ) : null}
          </div>
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
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(6px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: isMobileReader ? 0 : reduceMotion ? 0.08 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 flex-1 flex-col"
            aria-label="Loading email"
          >
            <div className="shrink-0 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 pb-2 pt-2 sm:px-6 sm:pb-3 sm:pt-3">
              <div className="flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <PortalSkeleton className="h-11 w-11 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <PortalSkeleton className="h-3.5 w-36 max-w-full rounded" />
                    <PortalSkeleton className="h-2.5 w-48 max-w-full rounded" />
                  </div>
                </div>
                <PortalSkeleton className="h-3 w-28 max-w-[35%] shrink-0 rounded" />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
              <PortalSkeleton className="h-3.5 w-full rounded" />
              <PortalSkeleton className="h-3.5 w-11/12 rounded" />
              <PortalSkeleton className="h-3.5 w-4/5 rounded" />
              <PortalSkeleton className="h-3.5 w-full rounded" />
              <div className="pt-4 space-y-3">
                <PortalSkeleton className="h-3.5 w-full rounded" />
                <PortalSkeleton className="h-3.5 w-3/4 rounded" />
                <PortalSkeleton className="h-3.5 w-5/6 rounded" />
                <PortalSkeleton className="h-3.5 w-2/3 rounded" />
              </div>
            </div>
          </motion.div>
        ) : selectedId && messageDetail ? (
          <motion.div
            key={selectedMessageKey || detailCacheKey(messageDetail.id, messageDetail.folderId)}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(8px)' }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: isMobileReader ? 0 : reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={(definition) => {
              syncReplyBounds()
              if (definition === 'animate' && typeof document !== 'undefined') {
                const el = document.querySelector('[data-email-detail-container="true"]') as HTMLElement | null
                if (el) el.style.filter = 'none'
              }
            }}
            data-email-detail-container="true"
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Email Header Bar */}
            <div className="shrink-0 space-y-1 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 pb-2 pt-2 sm:px-6 sm:pb-3 sm:pt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {messageDetail.direction === 'outgoing' && messageDetail.deliveryStatus ? (
                    <p className="mt-1 text-[11px] text-[color:var(--portal-muted)]">{luxorMailDeliveryLabel(messageDetail.deliveryStatus)}</p>
                  ) : null}
                  {messageDetail.folderPath && (
                    <p className="mt-1 truncate text-[11px] text-[color:var(--portal-muted)]">Folder: {messageDetail.folderPath}</p>
                  )}
                </div>


              </div>

              {/* Sender / Recipient & Matched Lead Row */}
              {readStateError?.id === messageDetail.id && (
                <p role="alert" className="text-xs text-[color:var(--portal-text)]">{readStateError.message} Use “More email actions” to retry.</p>
              )}
              {messageDetail.deliveryError && (
                <p role="status" className="text-xs text-[color:var(--portal-text)]">{messageDetail.deliveryError}</p>
              )}
              <div className="flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <PortalContactAvatar name={mailboxLabel(messageDetail.from, inquiryByEmail)} size="lg" className="!h-11 !w-11" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-[color:var(--portal-text)]" title={messageDetail.from}>{mailboxLabel(messageDetail.from, inquiryByEmail)}</p>
                      {currentInquiry && (
                        <Link
                          href={`/portal/leads/${currentInquiry.id}`}
                          className="hidden items-center gap-1 text-[10px] font-medium text-[#a8792f] hover:underline sm:inline-flex"
                        >
                          View Lead File <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[color:var(--portal-muted)]">
                      To: {mailboxLabel(messageDetail.to, inquiryByEmail, 'Client')} {selectedCcLabel ? `| CC: ${selectedCcLabel}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="max-w-32 text-right text-[10px] leading-4 text-[color:var(--portal-muted)] sm:max-w-none sm:text-[11px]">
                    <p>{formatEmailDateDetailed(messageDetail.receivedAt)}</p>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex min-h-0 flex-1 flex-col">
            {/* Scrollable email thread — grows to fill, reply pinned below */}
            <div ref={threadScrollRef} data-email-thread-scroll className="portal-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-[color:var(--portal-bg)] p-2 [overflow-anchor:none] sm:px-6 sm:py-4 lg:px-8">
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
                {(thread?.messages || []).filter((message) => message.id !== messageDetail.id).map((message, index) => (
                  <ThreadMessage
                    key={`${messageKey(message)}:${index}:closed`}
                    message={message}
                    expanded={false}
                    viewMode={viewMode}
                    blockExternalImages={blockExternalImages}
                    inquiryByEmail={inquiryByEmail}
                    onOpenAttachment={openAttachmentPreview}
                    openingAttachment={openingAttachment}
                  />
                ))}
                <ThreadMessage
                  key={`selected:${messageKey(messageDetail)}`}
                  message={messageDetail}
                  expanded
                  currentMessage
                  viewMode={viewMode}
                  blockExternalImages={blockExternalImages}
                  inquiryByEmail={inquiryByEmail}
                  onOpenAttachment={openAttachmentPreview}
                  openingAttachment={openingAttachment}
                />

                <AnimatePresence initial={false}>
                  {!isMobileReader && messageDetail.direction !== 'campaign' && replyOpen && (
                    <motion.div
                      ref={replyComposerRef}
                      key="inline-thread-reply"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
                      transition={{ duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
                      className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm"
                    >
                      {renderReplyComposerContent(false)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {messageDetail.direction !== 'campaign' && (isMobileReader || !replyOpen) ? <div
              className="shrink-0 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 sm:px-6"
            >
              {isMobileReader ? (
                <div ref={setMobileReplyAnchor} className="h-11 w-full" aria-hidden="true" />
              ) : (
                <button type="button" onClick={() => setReplyOpen(true)} aria-label="Open reply editor" className="flex min-h-11 w-full items-center gap-3 rounded-full border border-[color:var(--portal-border)] dark:border-[#caa24c]/25 bg-[color:var(--portal-card)] px-3 text-left text-sm text-[color:var(--portal-muted)] shadow-sm hover:border-[#caa24c]/40 dark:hover:border-[#caa24c]/45 hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40">
                  <Reply size={17} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">Reply to {currentInquiry?.full_name || mailboxLabel(thread?.clientEmail || (messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to), inquiryByEmail)}…</span>
                  <Send size={17} className="shrink-0 text-[#caa24c]" />
                </button>
              )}
            </div> : null}
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
                    <PortalCloseButton onClick={closeAttachmentPreview} aria-label="Close attachment preview" />
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
    {isMobileReader && compactReaderOpen && mobileReplyAnchor && messageDetail && messageDetail.direction !== 'campaign' && mobileReplyBounds && typeof document !== 'undefined' ? createPortal(
      <>
      {replyModalPresent && <div aria-hidden="true" className="fixed inset-0 z-[120]" />}
      <motion.div
        key="mobile-reply-container"
        ref={mobileReplyPortalRef}
        id="mobile-reply-container"
        role={replyModalPresent ? 'dialog' : undefined}
        aria-modal={replyModalPresent || undefined}
        aria-label={replyModalPresent ? 'Write email message' : undefined}
        initial={false}
        animate={{
          top: replyOpen ? replyViewport.top : mobileReplyBounds.top,
          left: replyOpen ? replyViewport.left : mobileReplyBounds.left,
          width: replyOpen ? replyViewport.width : mobileReplyBounds.width,
          height: replyOpen ? replyViewport.height : mobileReplyBounds.height,
          borderRadius: replyOpen ? 0 : 24,
        }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
        onAnimationComplete={() => {
          if (replyOpen || !replyModalPresent) return
          setReplyModalPresent(false)
          mobileReplyTriggerRef.current?.focus({ preventScroll: true })
        }}
        className="fixed flex min-h-0 flex-col overflow-hidden border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] shadow-sm"
        style={{ zIndex: replyModalPresent ? 130 : 65, paddingTop: replyOpen ? 'env(safe-area-inset-top)' : undefined, paddingBottom: replyOpen ? 'env(safe-area-inset-bottom)' : undefined }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {replyOpen ? (
            <motion.div key="mobile-reply-writer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.12 }} className="flex min-h-0 flex-1 flex-col">
              {renderReplyComposerContent(true)}
            </motion.div>
          ) : (
            <motion.button
              ref={mobileReplyTriggerRef}
              key="mobile-reply-trigger"
              type="button"
              onClick={() => { setReplyModalPresent(true); setReplyOpen(true) }}
              aria-label="Open reply editor"
              aria-controls="mobile-reply-container"
              aria-expanded={false}
              className="flex min-h-11 w-full shrink-0 items-center gap-3 px-3 text-left text-sm text-[color:var(--portal-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"
            >
              <Reply size={17} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Reply to {currentInquiry?.full_name || mailboxLabel(thread?.clientEmail || (messageDetail.direction === 'incoming' ? messageDetail.from : messageDetail.to), inquiryByEmail)}…</span>
              <Send size={17} className="shrink-0 text-[#caa24c]" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
      </>,
      document.body,
    ) : null}
    </>
)
}

const emailScrollMomentumCancelers = new WeakMap<HTMLElement, Set<() => void>>()

function ThreadMessage({
  message,
  expanded: initiallyExpanded,
  currentMessage = false,
  viewMode,
  blockExternalImages,
  inquiryByEmail,
  onOpenAttachment,
  openingAttachment,
}: {
  message: EmailMessageItem
  expanded: boolean
  currentMessage?: boolean
  viewMode: 'html' | 'text'
  blockExternalImages: boolean
  inquiryByEmail: Map<string, LuxorInquiry>
  onOpenAttachment: (attachment: EmailAttachment, message: EmailMessageItem) => void
  openingAttachment: string | null
}) {
  const reduceMotion = useReducedMotion()
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [frameHeight, setFrameHeight] = useState(260)
  const [readyFrameKey, setReadyFrameKey] = useState<string | null>(null)
  const frameObserverRef = useRef<ResizeObserver | null>(null)
  const frameResizeRequestRef = useRef<number>(0)
  const frameInteractionCleanupRef = useRef<(() => void) | null>(null)
  const cleanupMessageFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (frame) return
    frameObserverRef.current?.disconnect()
    frameObserverRef.current = null
    if (frameResizeRequestRef.current) {
      window.cancelAnimationFrame(frameResizeRequestRef.current)
      frameResizeRequestRef.current = 0
    }
    frameInteractionCleanupRef.current?.()
    frameInteractionCleanupRef.current = null
  }, [])
  const portalTheme = useSyncExternalStore<'light' | 'dark'>(
    (callback) => {
      window.addEventListener('storage', callback)
      window.addEventListener('luxor-portal-theme', callback)
      return () => {
        window.removeEventListener('storage', callback)
        window.removeEventListener('luxor-portal-theme', callback)
      }
    },
    () => {
      const savedTheme = window.localStorage.getItem('luxor-portal-theme')
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
      return document.body.dataset.portalTheme === 'dark' ? 'dark' : 'light'
    },
    () => 'light',
  )
  const html = useMemo(() => buildMessageDocument(message, blockExternalImages, portalTheme), [message, blockExternalImages, portalTheme])
  const frameKey = `${messageKey(message)}:${blockExternalImages ? 'images-blocked' : 'images-visible'}`
  const ccLabel = message.cc ? mailboxLabel(message.cc, inquiryByEmail, '') : ''

  const resizeFrame = (frame: HTMLIFrameElement) => {
    const document = frame.contentDocument
    if (!document) return
    if (frameResizeRequestRef.current) window.cancelAnimationFrame(frameResizeRequestRef.current)
    const bodyBackground = document.body ? getComputedStyle(document.body).backgroundColor : ''
    if (bodyBackground && bodyBackground !== 'rgba(0, 0, 0, 0)' && bodyBackground !== 'transparent') {
      document.documentElement.style.backgroundColor = bodyBackground
    }
    const updateHeight = () => {
      if (frameResizeRequestRef.current) return
      frameResizeRequestRef.current = window.requestAnimationFrame(() => {
        frameResizeRequestRef.current = 0
        const bodyHeight = document.body
          ? Math.max(document.body.scrollHeight, Math.ceil(document.body.getBoundingClientRect().height))
          : 0
        const rootHeight = document.documentElement?.scrollHeight || 0
        const rootViewportHeight = document.documentElement?.clientHeight || 0
        const overflowingDocumentHeight = rootHeight > rootViewportHeight + 1 ? rootHeight : 0
        const height = Math.max(bodyHeight, overflowingDocumentHeight, 64)
        const nextHeight = height + 8
        if (Math.abs(frame.clientHeight - nextHeight) > 1) setFrameHeight(nextHeight)
      })
    }

    frameObserverRef.current?.disconnect()
    frameInteractionCleanupRef.current?.()
    frameInteractionCleanupRef.current = null
    const observer = new ResizeObserver(updateHeight)
    if (document.documentElement) observer.observe(document.documentElement)
    if (document.body) observer.observe(document.body)
    frameObserverRef.current = observer
    updateHeight()
    void document.fonts?.ready.then(updateHeight)

    const scrollContainer = frame.closest<HTMLElement>('[data-email-thread-scroll]')
    if (scrollContainer) {
      let lastTouchY: number | null = null
      let lastTouchAt = 0
      let touchVelocity = 0
      let momentumFrame = 0
      let momentumAt = 0
      const stopMomentum = () => {
        if (momentumFrame) window.cancelAnimationFrame(momentumFrame)
        momentumFrame = 0
      }
      const cancelOwnMomentum = () => {
        touchVelocity = 0
        stopMomentum()
      }
      let cancelers = emailScrollMomentumCancelers.get(scrollContainer)
      if (!cancelers) {
        cancelers = new Set()
        emailScrollMomentumCancelers.set(scrollContainer, cancelers)
      }
      cancelers.add(cancelOwnMomentum)
      const cancelContainerMomentum = () => {
        emailScrollMomentumCancelers.get(scrollContainer)?.forEach((cancel) => cancel())
      }
      const startMomentum = () => {
        stopMomentum()
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(touchVelocity) < 0.04) return
        momentumAt = 0
        const step = (now: number) => {
          if (!momentumAt) momentumAt = now
          const elapsed = Math.max(0, Math.min(now - momentumAt, 40))
          momentumAt = now
          const previousTop = scrollContainer.scrollTop
          scrollContainer.scrollTop += touchVelocity * elapsed
          if (elapsed > 0 && scrollContainer.scrollTop === previousTop) {
            momentumFrame = 0
            return
          }
          touchVelocity *= Math.pow(0.92, elapsed / 16)
          if (Math.abs(touchVelocity) < 0.02) {
            momentumFrame = 0
            return
          }
          momentumFrame = window.requestAnimationFrame(step)
        }
        momentumFrame = window.requestAnimationFrame(step)
      }
      const handOffWheel = (event: WheelEvent) => {
        cancelContainerMomentum()
        scrollContainer.scrollTop += event.deltaY
        event.preventDefault()
      }
      const beginTouch = (event: TouchEvent) => {
        cancelContainerMomentum()
        touchVelocity = 0
        lastTouchY = event.touches.length === 1 ? event.touches[0]?.clientY ?? null : null
        lastTouchAt = event.timeStamp
      }
      const handOffTouch = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          lastTouchY = null
          cancelContainerMomentum()
          return
        }
        const nextTouchY = event.touches[0]?.clientY
        if (nextTouchY === undefined) return
        if (lastTouchY === null) {
          lastTouchY = nextTouchY
          lastTouchAt = event.timeStamp
          return
        }
        const delta = lastTouchY - nextTouchY
        const elapsed = event.timeStamp - lastTouchAt
        scrollContainer.scrollTop += delta
        touchVelocity = elapsed > 0 && elapsed < 160
          ? Math.max(-3, Math.min(3, delta / elapsed))
          : 0
        lastTouchY = nextTouchY
        lastTouchAt = event.timeStamp
        event.preventDefault()
      }
      const endTouch = (event: TouchEvent) => {
        lastTouchY = null
        if (event.timeStamp - lastTouchAt >= 160) touchVelocity = 0
        startMomentum()
      }
      const cancelTouch = () => {
        lastTouchY = null
        cancelContainerMomentum()
      }
      const cancelFromContainerInput = () => cancelContainerMomentum()

      document.addEventListener('wheel', handOffWheel, { passive: false })
      document.addEventListener('touchstart', beginTouch, { passive: true })
      document.addEventListener('touchmove', handOffTouch, { passive: false })
      document.addEventListener('touchend', endTouch, { passive: true })
      document.addEventListener('touchcancel', cancelTouch, { passive: true })
      scrollContainer.addEventListener('wheel', cancelFromContainerInput, { passive: true })
      scrollContainer.addEventListener('touchstart', cancelFromContainerInput, { passive: true })
      frameInteractionCleanupRef.current = () => {
        cancelOwnMomentum()
        document.removeEventListener('wheel', handOffWheel)
        document.removeEventListener('touchstart', beginTouch)
        document.removeEventListener('touchmove', handOffTouch)
        document.removeEventListener('touchend', endTouch)
        document.removeEventListener('touchcancel', cancelTouch)
        scrollContainer.removeEventListener('wheel', cancelFromContainerInput)
        scrollContainer.removeEventListener('touchstart', cancelFromContainerInput)
        const registeredCancelers = emailScrollMomentumCancelers.get(scrollContainer)
        registeredCancelers?.delete(cancelOwnMomentum)
        if (registeredCancelers?.size === 0) emailScrollMomentumCancelers.delete(scrollContainer)
      }
    }
  }

  useEffect(() => () => {
    frameObserverRef.current?.disconnect()
    if (frameResizeRequestRef.current) window.cancelAnimationFrame(frameResizeRequestRef.current)
    frameInteractionCleanupRef.current?.()
    frameInteractionCleanupRef.current = null
  }, [])

  return (
    <article className={currentMessage ? 'w-full bg-[color:var(--portal-bg)]' : `overflow-hidden rounded-xl border transition-colors sm:rounded-2xl ${expanded ? 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-md' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/80 hover:bg-[color:var(--portal-card)]'}`}>
      {!currentMessage && <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full cursor-pointer items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-4">
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
      </button>}
      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          layout={currentMessage ? false : 'size'}
          initial={currentMessage ? false : reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={currentMessage ? undefined : { height: 'auto', opacity: 1 }}
          exit={currentMessage ? undefined : reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={currentMessage ? { duration: 0 } : { duration: reduceMotion ? 0.08 : 0.24, ease: [0.23, 1, 0.32, 1] }}
          className={currentMessage ? 'bg-[color:var(--portal-bg)]' : 'overflow-hidden border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)]'}
          style={{ willChange: 'height, opacity' }}
        >
          {viewMode === 'html' ? (
            <iframe
              key={frameKey}
              srcDoc={html}
              title={`${decodeHtmlEntities(message.subject)} — ${message.id}`}
              ref={cleanupMessageFrame}
              className="w-full border-0 bg-transparent"
              style={{
                height: frameHeight,
                opacity: readyFrameKey === frameKey ? 1 : 0,
                transition: reduceMotion ? 'none' : 'opacity 160ms ease-out',
              }}
              scrolling="no"
              onLoad={(event) => {
                const frame = event.currentTarget
                const loadedDocument = frame.contentDocument
                if (!loadedDocument?.body?.innerHTML.trim()) return
                resizeFrame(frame)
                window.requestAnimationFrame(() => window.requestAnimationFrame(() => setReadyFrameKey(frameKey)))
              }}
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            />
          ) : (
            <div className="min-h-36 whitespace-pre-wrap bg-[color:var(--portal-bg)] p-4 font-mono text-xs leading-relaxed text-[color:var(--portal-text)] sm:p-6">
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
  const hasHtmlBody = Boolean(message.htmlContent?.trim())
  const adaptHtmlForDarkTheme = hasHtmlBody && portalTheme === 'dark' && !hasDarkEmailSurface(message.htmlContent || '')
  const documentBackground = hasHtmlBody ? (adaptHtmlForDarkTheme ? '#f7f8f9' : '#fff') : portalTheme === 'dark' ? '#080706' : '#fbfaf6'
  const textColor = !hasHtmlBody && portalTheme === 'dark' ? '#f5f2ea' : '#18181b'
  const darkThemeFilter = adaptHtmlForDarkTheme
    ? 'html{filter:invert(1) hue-rotate(180deg)}img,svg,video{filter:invert(1) hue-rotate(180deg)}'
    : ''
  const messageContent = message.htmlContent
    || (message.content ? plainTextToEmailHtml(message.content) : `<p>${escapeHtml(message.summary || 'No message body available.')}</p>`)
  let content = stripTrackingPixels(messageContent)
  if (blockExternalImages) {
    content = content.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '<div style="border:1px dashed #a1a1aa;padding:8px;font-size:11px;color:#71717a;text-align:center">[External image blocked]</div>')
  }
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{width:100%;max-width:100%;overflow-x:hidden;background:${documentBackground}}*{box-sizing:border-box}body{width:100%;max-width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:0;color:${textColor};background:transparent;font-size:14px;line-height:1.6;overflow:hidden;overflow-wrap:anywhere}img,svg,video{max-width:100%!important;height:auto!important}a{color:#a8792f}blockquote{border-left:3px solid #caa24c;margin:12px 0;padding-left:12px;color:#52525b}table{max-width:100%}table.luxor-card{border-radius:16px!important;overflow:hidden!important}td,th{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}${darkThemeFilter}</style></head><body>${content}</body></html>`
}

function hasDarkEmailSurface(html: string) {
  const backgrounds = [...html.matchAll(/(?:background(?:-color)?\s*:\s*([^;"'}]+)|bgcolor\s*=\s*["']?([^"'\s>]+))/gi)]
  return backgrounds.some((match) => isDarkEmailColor(match[1] || match[2] || ''))
}

function isDarkEmailColor(value: string) {
  const color = value.trim().toLowerCase()
  if (color === 'black') return true
  const hex = color.match(/#([\da-f]{3}|[\da-f]{6})\b/i)?.[1]
  if (hex) {
    const normalized = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
    return (parseInt(normalized.slice(0, 2), 16) + parseInt(normalized.slice(2, 4), 16) + parseInt(normalized.slice(4, 6), 16)) / 3 < 96
  }
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) return (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3 < 96
  return false
}

function buildEmailReplyPreviewDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{width:100%;max-width:100%;margin:0;background:#fff}*{box-sizing:border-box}body{padding:16px;color:#27272a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;overflow-wrap:anywhere}img,svg,video{max-width:100%!important;height:auto!important}table{max-width:100%}</style></head><body>${html}</body></html>`
}

function DrawerNavItem({
  icon,
  label,
  detail,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c] ${active ? 'bg-[#caa24c]/12 text-[#8c6529] dark:text-[#f1d27a]' : 'text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]'}`}>
      <span className={`shrink-0 ${active ? 'text-[#a8792f] dark:text-[#f1d27a]' : 'text-[color:var(--portal-muted)]'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
        {detail ? <span className="mt-0.5 block truncate text-[10px] text-[color:var(--portal-muted)]">{detail}</span> : null}
      </span>
      {count !== undefined ? <span className="shrink-0 text-xs tabular-nums text-[color:var(--portal-muted)]">{count.toLocaleString()}</span> : null}
    </button>
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

function plainTextToEmailHtml(str: string) {
  return escapeHtml(str).replace(/\r\n?|\n/g, '<br>')
}
