'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, CheckCheck, Images, Info, Loader2, Mail, MessageSquare, MoreVertical, Phone, Plus, Search, Send, ShieldCheck, Sparkles, UserPlus, X } from '@/lib/icons/phosphor-compat'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
import type { LuxorInquiry } from '@/lib/luxorInquiryTypes'
import { formatPhoneDisplay, normalizePhoneNumber } from '@/lib/luxorPhoneClient'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { PortalContactAvatar, PortalCloseButton, PortalSkeleton, PortalSkeletonTransition, PortalTabTransition } from './PortalUI'
import { PortalSmsConsentBadge, type SmsConsentState } from './PortalSmsConsentBadge'
import { useToast } from './ToastProvider'
import { TextAnimate } from '@/components/ui/text-animate'

type Conversation = {
  key: string
  inquiryId: string | null
  contactName: string
  phoneNumber: string
  messages: LuxorMessage[]
  latest: LuxorMessage | null
  unreadCount: number
}

type ContactResult = { id: string; fullName: string; phoneNumber: string; eventType: string | null }
type BusinessLine = { phoneNumber: string; friendlyName: string | null; isActive: boolean; capabilities: { sms?: boolean } }

type MessageFilter = 'all' | 'unread'

export function LuxorMessenger() {
  const reduceMotion = useReducedMotion()
  const { notify } = useToast()
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<LuxorMessage[]>([])
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(() => searchParams?.get('inquiryId') || null)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(() => Boolean(searchParams?.get('inquiryId')))
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<ContactResult[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [loadedSmsConsent, setLoadedSmsConsent] = useState<{ phone: string; state: SmsConsentState } | null>(null)
  const [contactLead, setContactLead] = useState<LuxorInquiry | null>(null)
  const [consentRequestSending, setConsentRequestSending] = useState(false)
  const [manualOptInLoading, setManualOptInLoading] = useState(false)
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false)
  const [draftingWithElena, setDraftingWithElena] = useState(false)
  const [polishingWithElena, setPolishingWithElena] = useState(false)
  const [animatingDraft, setAnimatingDraft] = useState(false)
  const [animatingDraftText, setAnimatingDraftText] = useState('')
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const aiInFlight = useRef(false)
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [textareaHeight, setTextareaHeight] = useState(24)

  useLayoutEffect(() => {
    if (!measureRef.current) return
    const measured = measureRef.current.offsetHeight
    let target = 24
    if (measured > 56) {
      target = 72
    } else if (measured > 32) {
      target = 48
    }
    setTextareaHeight(target)
  }, [body])
  const [composerFocused, setComposerFocused] = useState(false)
  const [buttonHovered, setButtonHovered] = useState(false)
  const cardHeight = textareaHeight + 46
  const loadMessages = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const response = await fetch('/api/twilio/messages?limit=1000', { cache: 'no-store' })
      const payload = await response.json().catch(() => []) as LuxorMessage[] | { error?: string }
      if (!response.ok || !Array.isArray(payload)) throw new Error(!Array.isArray(payload) ? payload.error : 'Unable to load text messages.')
      setMessages(payload)
    } catch (error) {
      if (!quiet) notify({ title: 'Texts unavailable', description: error instanceof Error ? error.message : 'Unable to load text messages.', variant: 'error' })
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void Promise.all([
      loadMessages(),
      fetch('/api/twilio/phone-numbers?mode=owned', { cache: 'no-store' })
        .then(async (response) => ({ response, payload: await response.json().catch(() => ({ numbers: [] })) as { numbers?: BusinessLine[] } }))
        .then(({ response, payload }) => { if (response.ok) setBusinessLines((payload.numbers || []).filter((line) => line.capabilities.sms)) }),
    ])
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadMessages(true)
    }, 15_000)
    return () => window.clearInterval(intervalId)
  }, [loadMessages])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (optionsOpen && optionsRef.current && !optionsRef.current.contains(target)) {
        setOptionsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [optionsOpen])

  const conversations = useMemo(() => buildConversations(messages), [messages])
  const visibleConversations = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    return conversations.filter((conversation) => {
      if (filter === 'unread' && conversation.unreadCount === 0) return false
      if (!normalizedQuery) return true
      return `${conversation.contactName} ${conversation.phoneNumber} ${conversation.latest?.body || ''}`.toLowerCase().includes(normalizedQuery)
    })
  }, [conversations, filter, deferredQuery])
  const selectedConversation = conversations.find((conversation) => conversation.key === selectedKey || (selectedKey && conversation.inquiryId === selectedKey)) ?? (draftConversation?.key === selectedKey ? draftConversation : null) ?? conversations[0] ?? null
  const selectedLead = contactLead?.id === selectedConversation?.inquiryId ? contactLead : null

  useEffect(() => {
    const id = selectedConversation?.inquiryId
    setContactLead(null)
    if (!id) return
    const controller = new AbortController()
    void fetch(`/api/inquiries?id=${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<LuxorInquiry> : null)
      .then((lead) => { if (!controller.signal.aborted) setContactLead(lead) })
      .catch((error) => { if (!controller.signal.aborted) console.error('Unable to load contact email', error) })
    return () => controller.abort()
  }, [selectedConversation?.inquiryId])
  const smsConsent = loadedSmsConsent && loadedSmsConsent.phone === selectedConversation?.phoneNumber
    ? loadedSmsConsent.state
    : null

  useEffect(() => {
    const phone = selectedConversation?.phoneNumber
    if (!phone) return
    let active = true
    const refreshConsent = async () => {
      try {
        const response = await fetch(`/api/twilio/consent?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        const data = await response.json() as SmsConsentState & { error?: string }
        if (active && response.ok && !data.error) setLoadedSmsConsent({ phone, state: data })
      } catch {
        if (active) setLoadedSmsConsent((current) => current?.phone === phone ? null : current)
      }
    }
    void refreshConsent()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshConsent()
    }, 15_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [selectedConversation?.phoneNumber])

  useEffect(() => {
    if (!newMessageOpen || contactQuery.trim().length < 2) {
      setContactResults([])
      setSearchingContacts(false)
      return
    }
    const controller = new AbortController()
    setContactResults([])
    setSearchingContacts(true)
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/twilio/contact-search?q=${encodeURIComponent(contactQuery.trim())}`, { cache: 'no-store', signal: controller.signal })
        const payload = await response.json().catch(() => []) as ContactResult[] | { error?: string }
        if (!response.ok || !Array.isArray(payload)) throw new Error(!Array.isArray(payload) ? payload.error : 'Unable to search contacts.')
        if (!controller.signal.aborted) setContactResults(payload)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) notify({ title: 'Contact search failed', description: error instanceof Error ? error.message : 'Unable to search contacts.', variant: 'error' })
      } finally {
        if (!controller.signal.aborted) setSearchingContacts(false)
      }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timeoutId) }
  }, [contactQuery, newMessageOpen, notify])

  useEffect(() => {
    if (!selectedConversation?.unreadCount) return
    const unreadIds = selectedConversation.messages.filter((message) => message.direction === 'inbound' && !message.is_read).map((message) => message.id)
    if (!unreadIds.length) return
    setMessages((current) => current.map((message) => unreadIds.includes(message.id) ? { ...message, is_read: true } : message))
    void Promise.all(unreadIds.map((id) => fetch('/api/twilio/messages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    })))
  }, [selectedConversation?.key, selectedConversation?.unreadCount])

  useEffect(() => {
    const scroller = threadScrollRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [selectedConversation?.key, selectedConversation?.messages.length])

  const selectConversation = (conversation: Conversation) => {
    setSelectedKey(conversation.key)
    setShowThreadOnMobile(true)
  }

  const sendMessage = async () => {
    if (!selectedConversation || !body.trim() || sending) return
    setSending(true)
    try {
      const response = await fetch('/api/twilio/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.phoneNumber,
          body: body.trim(),
          inquiryId: selectedConversation.inquiryId,
          contactName: selectedConversation.contactName,
          fromNumber: businessLines.find((line) => line.isActive)?.phoneNumber,
        }),
      })
      const payload = await response.json() as LuxorMessage | { error?: string }
      if (!response.ok || !('id' in payload)) throw new Error('error' in payload ? payload.error : 'Unable to send text message.')
      setMessages((current) => [payload, ...current.filter((message) => message.id !== payload.id)])
      setDraftConversation(null)
      setBody('')
    } catch (error) {
      notify({ title: 'Text not sent', description: error instanceof Error ? error.message : 'Unable to send text message.', variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    setDraftingWithElena(false)
    setPolishingWithElena(false)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
    setAiStatus(null)
    aiInFlight.current = false
  }, [selectedConversation?.key])

  const draftWithElena = async () => {
    if (!selectedConversation || aiInFlight.current || draftingWithElena || sending || smsConsent?.status === 'opted_out') return
    const convKey = selectedConversation.key
    aiInFlight.current = true
    setDraftingWithElena(true)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
    setAiStatus(null)
    try {
      const response = await fetch('/api/portal/composer-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'write',
          channel: 'sms',
          draft: body,
          instruction: '',
          context: JSON.stringify({
            name: selectedConversation.contactName,
            messages: selectedConversation.messages.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-20).map(({ direction, body: msgBody, created_at }) => ({ direction, body: msgBody, date: created_at })),
          }),
        }),
      })
      const data = (await response.json()) as { draft?: string; error?: string }
      if (!response.ok || !data.draft?.trim()) throw new Error(data.error || 'Elena could not draft a response.')
      const cleanDraft = data.draft.trim()
      if (selectedConversation.key !== convKey) return
      setAnimatingDraftText(cleanDraft)
      setAnimatingDraft(true)
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : 'Elena could not draft a reply.')
      notify({ title: 'Elena Draft', description: error instanceof Error ? error.message : 'Could not draft response.', variant: 'error' })
    } finally {
      aiInFlight.current = false
      setDraftingWithElena(false)
    }
  }

  const polishWithElena = async () => {
    if (!selectedConversation || !body.trim() || aiInFlight.current || polishingWithElena || sending) return
    const convKey = selectedConversation.key
    const currentBody = body
    aiInFlight.current = true
    setPolishingWithElena(true)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
    setAiStatus(null)
    try {
      const response = await fetch('/api/portal/composer-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'polish',
          channel: 'sms',
          draft: currentBody,
          instruction: '',
          context: JSON.stringify({
            name: selectedConversation.contactName,
            messages: selectedConversation.messages.slice(-20).map(({ direction, body: msgBody }) => ({ direction, body: msgBody })),
          }),
        }),
      })
      const data = (await response.json()) as { draft?: string; error?: string }
      if (!response.ok || !data.draft?.trim()) throw new Error(data.error || 'Elena could not polish your draft.')
      const cleanDraft = data.draft.trim()
      if (selectedConversation.key !== convKey) return
      setAnimatingDraftText(cleanDraft)
      setAnimatingDraft(true)
      setAiStatus('Polished')
      setTimeout(() => setAiStatus(null), 3000)
    } catch (error) {
      setAiStatus(error instanceof Error ? error.message : 'Elena could not polish your draft.')
      notify({ title: 'Elena Polish', description: error instanceof Error ? error.message : 'Could not polish draft.', variant: 'error' })
    } finally {
      aiInFlight.current = false
      setPolishingWithElena(false)
    }
  }

  const finishAnimation = (text: string) => {
    setBody(text)
    setAnimatingDraft(false)
    setAnimatingDraftText('')
  }

  const requestSmsConsent = async () => {
    if (!selectedConversation || consentRequestSending) return
    setConsentRequestSending(true)
    try {
      const response = await fetch('/api/twilio/consent-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedConversation.phoneNumber,
          inquiryId: selectedConversation.inquiryId,
          contactName: selectedConversation.contactName,
          fromNumber: businessLines.find((line) => line.isActive)?.phoneNumber,
        }),
      })
      const payload = await response.json() as { simulated?: boolean; message?: LuxorMessage | null; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to request SMS consent.')
      setOptionsOpen(false)
      if (payload.simulated) {
        notify({ title: 'Test simulation recorded', description: 'No SMS was sent to this test contact.', variant: 'success' })
      } else {
        if (payload.message) setMessages((current) => [payload.message!, ...current.filter((message) => message.id !== payload.message!.id)])
        const nextState: SmsConsentState = { status: 'unknown', consent_request_status: 'pending' }
        setLoadedSmsConsent({ phone: selectedConversation.phoneNumber, state: nextState })
        window.dispatchEvent(new CustomEvent('luxor-sms-consent-updated', { detail: { phone: selectedConversation.phoneNumber, state: nextState } }))
        notify({ title: 'Consent request sent', description: `Asked ${selectedConversation.contactName} to reply YES.`, variant: 'success' })
      }
    } catch (error) {
      notify({ title: 'Consent request not sent', description: error instanceof Error ? error.message : 'Unable to request SMS consent.', variant: 'error' })
    } finally {
      setConsentRequestSending(false)
    }
  }

  const manualOptIn = async () => {
    if (!selectedConversation || manualOptInLoading) return
    setManualOptInLoading(true)
    try {
      const response = await fetch('/api/twilio/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedConversation.phoneNumber,
          reason: 'Manual opt-in from text messaging page',
        }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to record SMS opt-in.')
      const newState: SmsConsentState = {
        status: 'opted_in',
        consent_request_status: null,
        consent_scopes: ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice', 'marketing'],
      }
      setLoadedSmsConsent({ phone: selectedConversation.phoneNumber, state: newState })
      setOptionsOpen(false)
      window.dispatchEvent(new CustomEvent('luxor-sms-consent-updated', { detail: { phone: selectedConversation.phoneNumber, state: newState } }))
      notify({
        title: 'SMS opt-in recorded',
        description: `Marked ${selectedConversation.contactName} as opted in to text messages.`,
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: 'Opt-in not recorded',
        description: error instanceof Error ? error.message : 'Unable to record SMS opt-in.',
        variant: 'error',
      })
    } finally {
      setManualOptInLoading(false)
    }
  }

  const startNewConversation = (contact: ContactResult) => {
    const contactKey = normalizePhoneNumber(contact.phoneNumber) || contact.phoneNumber
    const existing = conversations.find((conversation) => conversation.key === contactKey || conversation.inquiryId === contact.id || conversation.phoneNumber === contact.phoneNumber)
    if (existing) {
      selectConversation(existing)
    } else {
      const draft: Conversation = { key: contactKey || `draft:${contact.id}`, inquiryId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, messages: [], latest: null, unreadCount: 0 }
      setDraftConversation(draft)
      setSelectedKey(draft.key)
      setShowThreadOnMobile(true)
    }
    setNewMessageOpen(false)
    setContactQuery('')
    setContactResults([])
  }

  const sharedMedia = selectedConversation?.messages.flatMap((message) => message.media_urls.map((url) => ({ url, message }))) || []

  return (
    <section className="relative grid min-h-0 h-full min-w-0 flex-1 overflow-hidden rounded-none border-0 bg-[color:var(--portal-card)] lg:grid-cols-[22rem_minmax(0,1fr)] lg:rounded-2xl lg:border lg:border-[color:var(--portal-border)] lg:shadow-xs">
      <aside className="flex min-h-0 min-w-0 flex-col border-r border-[color:var(--portal-border)]">
        <div className="border-b border-[color:var(--portal-border)]/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[color:var(--portal-text)]">Messages</h1>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { setNewMessageOpen(true); setShowThreadOnMobile(true); setContactQuery(''); setContactResults([]) }} className="luxor-gold-raised inline-flex h-8.5 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white"><Plus size={14}/> New</button>
            </div>
          </div>
          <label className="mt-3.5 flex h-9.5 items-center gap-2 rounded-xl border border-transparent bg-[color:var(--portal-soft)] px-3 transition-all focus-within:border-[#caa24c]/40 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/10">
            <Search size={14} className="text-[color:var(--portal-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="portal-input-transparent min-w-0 flex-1 bg-transparent text-xs font-medium text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]" />
          </label>
          <div className="mt-3 grid grid-cols-2 rounded-xl border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-soft)] p-1">
            {(['all', 'unread'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`relative isolate rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors ${filter === value ? 'text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>
              {filter === value ? <motion.span layoutId="messages-filter-pill" className="pointer-events-none absolute inset-0 rounded-lg border border-[color:var(--portal-border)]/50 bg-[color:var(--portal-card)] shadow-2xs" transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
              <span className="relative z-10">{value}</span>
            </button>)}
          </div>
        </div>

        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto">
          <PortalSkeletonTransition
            loading={loading}
            skeleton={<LoadingConversations />}
          >
            <PortalTabTransition activeKey={filter}>
            {visibleConversations.length ? visibleConversations.map((conversation) => (
              <button key={conversation.key} type="button" onClick={() => selectConversation(conversation)} className={`flex w-full gap-3 border-b border-[color:var(--portal-border)]/70 px-4 py-3.5 text-left transition-colors ${selectedConversation?.key === conversation.key ? 'bg-[#caa24c]/10 shadow-[inset_3px_0_0_#caa24c]' : 'hover:bg-[color:var(--portal-soft)]/70'}`}>
                <PortalContactAvatar name={conversation.contactName} inquiryId={conversation.inquiryId || undefined} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`truncate text-sm ${conversation.unreadCount ? 'font-bold text-[color:var(--portal-text)]' : 'font-semibold text-[color:var(--portal-text)]'}`}>{conversation.contactName}</span>
                    <span className="shrink-0 tabular-nums text-[11px] text-[color:var(--portal-muted)]">{conversation.latest ? formatConversationTime(conversation.latest.created_at) : 'New'}</span>
                  </span>
                  <span className="mt-0.5 block tabular-nums text-[11px] text-[color:var(--portal-muted)]">{formatPhoneDisplay(conversation.phoneNumber)}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-xs ${conversation.unreadCount ? 'font-semibold text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}>{conversation.latest?.direction === 'outbound' ? 'You: ' : ''}{conversation.latest?.body || 'Start a new conversation'}</span>
                    {conversation.unreadCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#caa24c] px-1.5 tabular-nums text-[10px] font-bold text-white">{conversation.unreadCount}</span> : null}
                  </span>
                </span>
              </button>
            )) : <div className="px-6 py-16 text-center"><MessageSquare size={24} className="mx-auto text-[color:var(--portal-muted)]"/><p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">No conversations found</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Try another search or filter.</p></div>}
            </PortalTabTransition>
          </PortalSkeletonTransition>
        </div>
      </aside>

      <main className={`absolute inset-0 z-20 flex min-h-0 min-w-0 flex-1 flex-col bg-[color:var(--portal-card)] lg:static lg:z-auto lg:border-l lg:border-[color:var(--portal-border)] ${showThreadOnMobile ? 'max-lg:translate-x-0 max-lg:visible max-lg:[transition:translate_0.36s_cubic-bezier(0.22,1,0.36,1),visibility_0s]' : 'max-lg:invisible max-lg:translate-x-full max-lg:[transition:translate_0.36s_cubic-bezier(0.22,1,0.36,1),visibility_0s_linear_0.36s]'} motion-reduce:!transition-none`}>
        <PortalSkeletonTransition
          loading={loading}
          skeleton={<LoadingMessagePane />}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            key={newMessageOpen ? 'new-message' : selectedConversation ? selectedConversation.key : 'empty'}
            className="luxor-pane-enter-desktop flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {newMessageOpen ? <NewMessagePane query={contactQuery} results={contactResults} searching={searchingContacts} onQueryChange={(value) => { setContactQuery(value); setContactResults([]); setSearchingContacts(value.trim().length >= 2) }} onSelect={startNewConversation} onClose={() => { setNewMessageOpen(false); setContactQuery(''); setShowThreadOnMobile(false) }} /> : selectedConversation ? (
            <>
              <header className="flex min-h-18 shrink-0 items-center justify-between gap-1 border-b border-[color:var(--portal-border)]/70 px-2 py-3 sm:gap-4 sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
                  <button type="button" onClick={() => setShowThreadOnMobile(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 lg:hidden" aria-label="Back to conversations"><ArrowLeft size={18}/></button>
                  {selectedConversation.inquiryId ? (
                    <Link href={`/portal/leads/${selectedConversation.inquiryId}`} className="hidden shrink-0 no-underline sm:flex" aria-label={`Open ${selectedConversation.contactName} lead profile`}>
                      <PortalContactAvatar name={selectedConversation.contactName} inquiryId={selectedConversation.inquiryId} size="md" />
                    </Link>
                  ) : (
                    <PortalContactAvatar name={selectedConversation.contactName} inquiryId={selectedConversation.inquiryId || undefined} size="md" className="hidden sm:flex" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-0.5 gap-y-0.5 sm:gap-x-2">
                      {selectedConversation.inquiryId ? (
                        <Link
                          href={`/portal/leads/${selectedConversation.inquiryId}`}
                          title={selectedConversation.contactName}
                          className="order-1 max-w-full truncate text-[15px] font-semibold leading-5 text-[color:var(--portal-text)] no-underline transition-colors hover:text-[#a8792f] dark:hover:text-[#f1d27a] sm:text-sm sm:font-bold"
                        >
                          {selectedConversation.contactName}
                        </Link>
                      ) : (
                        <p title={selectedConversation.contactName} className="order-1 max-w-full truncate text-[15px] font-semibold leading-5 text-[color:var(--portal-text)] sm:text-sm sm:font-bold">{selectedConversation.contactName}</p>
                      )}
                      <div className="order-3 basis-full whitespace-nowrap tabular-nums text-xs leading-4 text-[color:var(--portal-muted)]">
                        <span className="sm:hidden">{formatPhoneDisplay(selectedConversation.phoneNumber)}</span>
                        <button type="button" aria-label={`Call ${selectedConversation.contactName} at ${formatPhoneDisplay(selectedConversation.phoneNumber)}`} onClick={() => startLuxorBrowserCall({ phoneNumber: selectedConversation.phoneNumber, contactName: selectedConversation.contactName, inquiryId: selectedConversation.inquiryId })} className="hidden rounded-sm transition-colors hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 sm:inline-block">{formatPhoneDisplay(selectedConversation.phoneNumber)}</button>
                      </div>
                      <span className="order-2"><PortalSmsConsentBadge phone={selectedConversation.phoneNumber} initialConsent={smsConsent} compact shortUnknownOnMobile shortOptedInOnMobile /></span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center sm:gap-2">
                  <button type="button" aria-label={`Call ${selectedConversation.contactName}`} title={`Call ${selectedConversation.contactName}`} onClick={() => startLuxorBrowserCall({ phoneNumber: selectedConversation.phoneNumber, contactName: selectedConversation.contactName, inquiryId: selectedConversation.inquiryId })} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><Phone size={17}/></button>
                  {selectedLead?.email?.trim() ? <button type="button" aria-label={`Email ${selectedConversation.contactName}`} title={`Email ${selectedConversation.contactName}`} onClick={() => window.dispatchEvent(new CustomEvent('luxor-compose-email', { detail: { lead: selectedLead } }))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><Mail size={17}/></button> : null}
                  <div className="relative" ref={optionsRef}>
                    <button type="button" onClick={() => setOptionsOpen((current) => !current)} className="flex h-10 w-10 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40 sm:h-9 sm:w-9" aria-label="Conversation options" aria-expanded={optionsOpen}><MoreVertical size={17}/></button>
                    <AnimatePresence>{optionsOpen ? <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1.5 shadow-xl backdrop-blur-xl">
                      <button type="button" onClick={() => { setOptionsOpen(false); setMediaGalleryOpen(true) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"><Images size={14}/> Media gallery <span className="ml-auto tabular-nums text-[color:var(--portal-muted)]">{sharedMedia.length}</span></button>
                      {selectedConversation.inquiryId ? <Link href={`/portal/leads/${selectedConversation.inquiryId}`} onClick={() => setOptionsOpen(false)} className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"><Info size={14}/> Contact details</Link> : null}
                      {smsConsent?.status === 'opted_in' ? (
                        <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <Check size={14}/> SMS consent is active
                        </p>
                      ) : (
                        <>
                          {smsConsent?.status === 'opted_out' ? (
                            <p className="px-3 py-1.5 text-xs leading-4 text-red-600 dark:text-red-400">
                              SMS opted out (STOP keyword).
                            </p>
                          ) : null}
                          {smsConsent?.consent_request_status === 'pending' ? (
                            <p className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[color:var(--portal-muted)]">
                              <MessageSquare size={14}/> Verification text sent · waiting for YES
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void requestSmsConsent()}
                              disabled={!smsConsent || !selectedConversation.phoneNumber || consentRequestSending}
                              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MessageSquare size={14}/>
                              {consentRequestSending ? 'Sending verification text…' : smsConsent?.consent_request_status === 'failed' ? 'Retry verification text' : 'Send verification text'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void manualOptIn()}
                            disabled={manualOptInLoading || !selectedConversation.phoneNumber}
                            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
                            {manualOptInLoading ? 'Recording opt-in…' : 'Manually opt in to SMS'}
                          </button>
                        </>
                      )}
                      <div className="my-1 h-px bg-[color:var(--portal-border)]"/>
                      <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-[color:var(--portal-faint)] opacity-60"><UserPlus size={14}/> Add a member</button>
                      <p className="px-3 pb-2 text-[11px] leading-4 text-[color:var(--portal-faint)]">Twilio RCS does not support group messaging.</p>
                    </motion.div> : null}</AnimatePresence>
                  </div>
                </div>
              </header>

              <div ref={threadScrollRef} className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7">
                <div className="mx-auto max-w-4xl space-y-3">
                  {selectedConversation.messages.length ? selectedConversation.messages.map((message, index, thread) => {
                    const previous = thread[index - 1]
                    const showDate = !previous || dayKey(previous.created_at) !== dayKey(message.created_at)
                    return <div key={message.id}>{showDate ? <DateDivider value={message.created_at}/> : null}<MessageBubble message={message}/></div>
                  }) : <div className="py-16 text-center"><MessageSquare size={22} className="mx-auto text-[color:var(--portal-muted)]"/><p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">Start your conversation with {selectedConversation.contactName}</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Messages send through Luxor’s approved Twilio sender.</p></div>}
                </div>
              </div>
            </>
          ) : <EmptyMessenger />}
          </div>
          {selectedConversation && !newMessageOpen ? (
            <div className="shrink-0 border-t border-[color:var(--portal-border)]/70 bg-[color:var(--portal-card)] p-3 sm:p-4">
              <motion.div
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                animate={{ height: cardHeight }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto flex max-w-4xl items-end gap-2 overflow-hidden rounded-2xl border border-transparent bg-[color:var(--portal-soft)] p-2 transition-colors focus-within:border-[#caa24c]/40 focus-within:bg-[color:var(--portal-card)] focus-within:ring-2 focus-within:ring-[#caa24c]/10"
              >
                <div className="min-w-0 flex-1 px-2 py-1">
                  <motion.div
                    animate={{ height: textareaHeight }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="relative overflow-hidden"
                  >
                    <div
                      ref={measureRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 -z-10 invisible whitespace-pre-wrap break-words text-sm leading-6"
                    >
                      {body ? (body.endsWith('\n') ? body + ' ' : body) : ' '}
                    </div>
                    {draftingWithElena ? (
                      <div className="flex h-6 items-center gap-2">
                        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                          <span className="absolute h-full w-full animate-ping rounded-full bg-[#caa24c]/30" />
                          <Sparkles size={13} className="animate-spin text-[#caa24c]" style={{ animationDuration: '3s' }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="elena-working-shimmer truncate text-xs font-semibold leading-6 tracking-wide text-[color:var(--portal-text)]">
                            Elena is drafting a reply for {selectedConversation.contactName}…
                          </p>
                        </div>
                      </div>
                    ) : animatingDraft && animatingDraftText ? (
                      <div
                        onClick={() => finishAnimation(animatingDraftText)}
                        title="Click to edit"
                        className="h-full cursor-text"
                      >
                        <TextAnimate
                          animation="blurInUp"
                          by="word"
                          duration={Math.min(1.8, Math.max(0.5, animatingDraftText.split(/\s+/).length * 0.04))}
                          className="text-sm leading-6 text-[color:var(--portal-text)]"
                          onAnimationComplete={() => {
                            setTimeout(() => finishAnimation(animatingDraftText), 350)
                          }}
                        >
                          {animatingDraftText}
                        </TextAnimate>
                      </div>
                    ) : (
                      <>
                        {!body ? (
                          <span
                            key={selectedConversation.key}
                            aria-hidden="true"
                            className="luxor-pane-enter-desktop pointer-events-none absolute inset-x-0 top-0 truncate text-sm leading-6 text-[color:var(--portal-muted)]"
                          >
                            Message {selectedConversation.contactName}
                          </span>
                        ) : null}
                        <textarea
                          ref={textareaRef}
                          value={body}
                          onChange={(event) => setBody(event.target.value.slice(0, 1600))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              void sendMessage()
                            }
                          }}
                          rows={1}
                          aria-label={`Message ${selectedConversation.contactName}`}
                          className={`portal-input-transparent portal-scrollbar relative w-full resize-none bg-transparent p-0 m-0 border-0 text-sm leading-6 text-[color:var(--portal-text)] outline-none ${
                            textareaHeight >= 72 ? 'h-[72px] overflow-y-auto' : 'h-full overflow-hidden'
                          }`}
                        />
                      </>
                    )}
                  </motion.div>
                  <div className="mt-1 flex h-4 items-center gap-1.5 whitespace-nowrap overflow-hidden text-[11px] leading-4 text-[color:var(--portal-muted)]">
                    <p className="tabular-nums">
                      {body.length} / 1600<span className="hidden sm:inline"> · Enter to send</span>
                    </p>
                    <AnimatePresence initial={false}>{body.trim() && !draftingWithElena && !animatingDraft ? (
                      <motion.span key="polish" initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.18, ease: 'easeOut' }} className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="opacity-35 select-none">|</span>
                        <button
                          type="button"
                          onClick={() => void polishWithElena()}
                          disabled={polishingWithElena || sending || smsConsent?.status === 'opted_out'}
                          title="Polish grammar and clarity with Elena"
                          className="transition-colors hover:text-[#caa24c] focus-visible:outline-none focus-visible:underline disabled:opacity-50 dark:hover:text-[#f1d27a]"
                        >
                          {polishingWithElena ? 'Polishing…' : 'Polish with Elena'}
                        </button>
                        {aiStatus ? (
                          <span role="status" aria-live="polite" className="italic opacity-80">
                            ({aiStatus})
                          </span>
                        ) : null}
                      </motion.span>
                    ) : null}</AnimatePresence>
                  </div>
                </div>
                <motion.button
                  onMouseEnter={() => setButtonHovered(true)}
                  onMouseLeave={() => setButtonHovered(false)}
                  whileTap={{ scale: 0.96 }}
                  animate={{
                    width: body.trim() ? 80 : 92,
                    backgroundColor: body.trim()
                      ? (buttonHovered ? '#b98a3d' : '#caa24c')
                      : composerFocused
                      ? (buttonHovered ? '#eae0d0' : '#f4efe7')
                      : (buttonHovered ? '#faf5ec' : '#ffffff'),
                    color: body.trim() ? '#ffffff' : (buttonHovered ? '#6e4c10' : '#8c6218'),
                    boxShadow: buttonHovered
                      ? (body.trim()
                          ? '0 4px 14px -2px rgba(202, 162, 76, 0.45)'
                          : '0 2px 10px -1px rgba(140, 98, 24, 0.16), inset 0 0 0 1px rgba(202, 162, 76, 0.38)')
                      : '0 1px 2px rgba(0, 0, 0, 0.04)',
                    scale: buttonHovered ? 1.025 : 1,
                  }}
                  transition={{
                    width: { duration: 0.24, ease: [0.16, 1, 0.3, 1] },
                    backgroundColor: { duration: 0.18 },
                    color: { duration: 0.18 },
                    boxShadow: { duration: 0.18 },
                    scale: { duration: 0.18 },
                  }}
                  style={{ height: 38 }}
                  type="button"
                  onClick={() => {
                    if (body.trim()) {
                      void sendMessage()
                    } else {
                      void draftWithElena()
                    }
                  }}
                  disabled={body.trim() ? sending : (draftingWithElena || sending || smsConsent?.status === 'opted_out')}
                  aria-label={body.trim() ? 'Send message' : 'Draft reply with Elena'}
                  title={body.trim() ? 'Send text message' : 'Draft reply automatically with Elena'}
                  className="relative flex h-[38px] shrink-0 items-center justify-center overflow-hidden rounded-xl border-0 text-xs font-semibold shadow-xs disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <AnimatePresence initial={false}>
                    {body.trim() ? (
                      <motion.span
                        key="send-mode"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute inset-0 flex items-center justify-center gap-1.5"
                      >
                        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>Send</span>
                      </motion.span>
                    ) : (
                      <motion.span
                        key="elena-mode"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, filter: 'blur(4px)' }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute inset-0 flex items-center justify-center gap-1.5"
                      >
                        {draftingWithElena ? (
                          <Loader2 size={13} className="animate-spin text-[#caa24c]" />
                        ) : (
                          <span className="relative flex h-4.5 w-4.5 shrink-0 overflow-hidden rounded-full ring-1 ring-[#caa24c]/40">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/luxor-concierge.png" alt="" className="h-full w-full object-cover" />
                          </span>
                        )}
                        <span>{draftingWithElena ? '…' : 'Elena'}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            </div>
          ) : null}
        </PortalSkeletonTransition>
      </main>
      <AnimatePresence>{mediaGalleryOpen ? <MediaGallery items={sharedMedia} onClose={() => setMediaGalleryOpen(false)} /> : null}</AnimatePresence>
    </section>
  )
}

function buildConversations(messages: LuxorMessage[]) {
  const grouped = new Map<string, LuxorMessage[]>()
  for (const message of messages) {
    const rawPhone = message.direction === 'inbound' ? message.from_number : message.to_number
    const key = normalizePhoneNumber(rawPhone) || rawPhone || message.inquiry_id || 'unknown'
    grouped.set(key, [...(grouped.get(key) || []), message])
  }
  return Array.from(grouped, ([key, groupedMessages]) => {
    const sorted = groupedMessages.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const latest = sorted[sorted.length - 1]
    const rawPhone = latest.direction === 'inbound' ? latest.from_number : latest.to_number
    const canonicalPhone = normalizePhoneNumber(rawPhone) || rawPhone
    const latestWithInquiry = [...sorted].reverse().find((message) => message.inquiry_id)
    const latestWithName = [...sorted].reverse().find((message) => message.contact_name)
    const inquiryId = latestWithInquiry?.inquiry_id || latest.inquiry_id
    const contactName = latestWithName?.contact_name || latest.contact_name || formatPhoneDisplay(canonicalPhone) || 'Unknown contact'

    return {
      key,
      inquiryId,
      contactName,
      phoneNumber: canonicalPhone,
      messages: sorted,
      latest,
      unreadCount: sorted.filter((message) => message.direction === 'inbound' && !message.is_read).length,
    }
  }).toSorted((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
}

function MessageBubble({ message }: { message: LuxorMessage }) {
  const outbound = message.direction === 'outbound'
  return <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[88%] sm:max-w-[72%] ${outbound ? 'text-right' : 'text-left'}`}>
      <div className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-6 ${outbound ? 'rounded-br-md border border-[#b88d37] bg-gradient-to-b from-[#d4af54] to-[#ba8e35] !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.12)]' : 'rounded-bl-md border border-[color:var(--portal-border)]/70 bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]'}`}>{message.body || '(Media message)'}</div>
      <p className={`mt-1 flex items-center gap-1 tabular-nums text-[11px] text-[color:var(--portal-muted)] ${outbound ? 'justify-end' : 'justify-start'}`}>{message.owner_email === 'luxor-automation' ? <><span>Automated</span><span>·</span></> : null}{formatMessageTime(message.created_at)}{outbound ? <><span>·</span><span className="capitalize">{message.status}</span>{message.status === 'delivered' || message.status === 'read' ? <CheckCheck size={12} className={message.status === 'read' ? 'text-emerald-500' : 'text-[#caa24c]'}/> : null}</> : null}</p>
      {message.error_message ? <p className="mt-1 text-xs text-red-500">{message.error_message}</p> : null}
    </div>
  </div>
}

function NewMessagePane({ query, results, searching, onQueryChange, onSelect, onClose }: { query: string; results: ContactResult[]; searching: boolean; onQueryChange: (value: string) => void; onSelect: (contact: ContactResult) => void; onClose: () => void }) {
  const reduceMotion = useReducedMotion()
  const searchState = query.trim().length < 2 ? 'idle' : searching ? 'loading' : results.length ? 'results' : 'empty'
  return <motion.div initial={reduceMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.23, 1, 0.32, 1] }} className="flex min-h-0 flex-1 flex-col">
    <header className="flex min-h-18 items-center gap-3 border-b border-[color:var(--portal-border)]/70 px-4 py-3 sm:px-5">
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-all hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40" aria-label="Close new message"><ArrowLeft size={18}/></button>
      <div><p className="text-sm font-semibold text-[color:var(--portal-text)]">New conversation</p><p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Choose a Luxor contact to start messaging.</p></div>
    </header>
    <div className="border-b border-[color:var(--portal-border)]/70 px-4 py-4 sm:px-6">
      <label className="flex h-10 items-center gap-3 rounded-xl bg-[color:var(--portal-soft)] px-3.5">
        <span className="text-xs font-semibold text-[color:var(--portal-muted)]">To:</span>
        <input autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Type a name or phone number" className="portal-input-transparent min-w-0 flex-1 bg-transparent text-sm text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]"/>
        {searching ? <Loader2 size={14} className="animate-spin text-[#caa24c]"/> : null}
      </label>
    </div>
    <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <AnimatePresence mode="wait" initial={false}>
          {searchState !== 'idle' ? <motion.div key={searchState} initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}>
            {searchState === 'loading' ? <p role="status" className="px-3 py-3 text-xs text-[color:var(--portal-muted)]">Searching contacts…</p> : searchState === 'results' ? <><p className="mb-2 px-3 text-xs font-medium text-[color:var(--portal-muted)]">Matching contacts</p><div className="space-y-1">{results.map((contact) => <button key={contact.id} type="button" onClick={() => onSelect(contact)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/40"><PortalContactAvatar name={contact.fullName} inquiryId={contact.id} size="md"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[color:var(--portal-text)]">{contact.fullName}</span><span className="mt-0.5 block tabular-nums text-xs text-[color:var(--portal-muted)]">{formatPhoneDisplay(contact.phoneNumber)}{contact.eventType ? ` · ${contact.eventType}` : ''}</span></span><MessageSquare size={15} className="text-[#caa24c]"/></button>)}</div></> : <p className="px-3 py-3 text-xs text-[color:var(--portal-muted)]">No matching contacts with a mobile number.</p>}
          </motion.div> : query.trim().length === 1 ? <motion.p key="hint" initial={false} exit={{ opacity: 0 }} className="px-3 py-3 text-xs text-[color:var(--portal-muted)]">Enter at least two letters or digits.</motion.p> : null}
        </AnimatePresence>
      </div>
    </div>
  </motion.div>
}

function MediaGallery({ items, onClose }: { items: Array<{ url: string; message: LuxorMessage }>; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 bg-black/80 p-5 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="portal-card-surface mx-auto flex h-full max-w-4xl flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] px-5 py-4"><div><p className="text-sm font-semibold text-[color:var(--portal-text)]">Shared media</p><p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Images and files received in this conversation.</p></div><PortalCloseButton onClick={onClose} aria-label="Close media gallery" /></div>
      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((item, index) => <a key={`${item.message.id}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]"><div className="aspect-square bg-[color:var(--portal-card)]"><img src={item.url} alt={`Shared media from ${formatMessageTime(item.message.created_at)}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"/></div><p className="px-3 py-2 tabular-nums text-[11px] text-[color:var(--portal-muted)]">{new Date(item.message.created_at).toLocaleString()}</p></a>)}</div> : <div className="flex h-full items-center justify-center text-center"><div><Images size={25} className="mx-auto text-[color:var(--portal-muted)]"/><p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No shared media yet</p><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Photos received through MMS or RCS will appear here.</p></div></div>}</div>
    </motion.div>
  </motion.div>
}

function DateDivider({ value }: { value: string }) { return <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-[color:var(--portal-border)]/70"/><span className="text-[11px] font-medium text-[color:var(--portal-muted)]">{new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="h-px flex-1 bg-[color:var(--portal-border)]/70"/></div> }
function LoadingConversations() {
  return (
    <div className="divide-y divide-[color:var(--portal-border)]" aria-label="Loading conversations">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="flex min-h-[4.75rem] w-full items-start gap-3 px-4 py-4">
          <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <PortalSkeleton className="h-4 w-32 rounded" />
              <PortalSkeleton className="h-2.5 w-10 rounded" />
            </div>
            <PortalSkeleton className="h-2.5 w-24 rounded" />
            <PortalSkeleton className="h-3 w-4/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadingMessagePane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label="Loading message thread">
      <div className="flex min-h-20 items-center justify-between gap-4 border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <PortalSkeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <PortalSkeleton className="h-4 w-36 rounded" />
              <PortalSkeleton className="h-4 w-16 rounded-full" />
            </div>
            <PortalSkeleton className="h-2.5 w-24 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PortalSkeleton className="h-11 w-20 rounded-lg" />
          <PortalSkeleton className="h-11 w-11 rounded-lg" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-6 sm:px-7">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="mx-auto h-2.5 w-28 rounded luxor-skeleton" />
          {[
            { side: 'left', width: 'max-w-[80%] sm:max-w-[65%]', h: 'h-14' },
            { side: 'right', width: 'max-w-[70%] sm:max-w-[50%]', h: 'h-11' },
            { side: 'left', width: 'max-w-[85%] sm:max-w-[70%]', h: 'h-20' },
            { side: 'right', width: 'max-w-[75%] sm:max-w-[55%]', h: 'h-14' },
            { side: 'left', width: 'max-w-[60%] sm:max-w-[45%]', h: 'h-11' },
            { side: 'right', width: 'max-w-[80%] sm:max-w-[60%]', h: 'h-16' },
          ].map((item, index) => (
            <div key={index} className={`flex ${item.side === 'right' ? 'justify-end' : 'justify-start'}`}>
              <div className={`${item.width} w-full space-y-1.5`}>
                <PortalSkeleton className={`${item.h} w-full rounded-2xl`} />
                <PortalSkeleton className={`h-2 w-14 rounded ${item.side === 'right' ? 'ml-auto' : ''}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-[color:var(--portal-border)] p-3 sm:p-4">
        <div className="mx-auto h-14 max-w-4xl rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-2">
          <PortalSkeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
function EmptyMessenger() { return <div className="flex flex-1 items-center justify-center p-8 text-center"><div><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#caa24c]/15 bg-[#caa24c]/5 text-[#caa24c]"><MessageSquare size={22}/></span><p className="mt-4 text-sm font-bold text-[color:var(--portal-text)]">No text conversations yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[color:var(--portal-muted)]">Open a lead with a mobile number and choose Text Client to begin.</p></div></div> }
function dayKey(value: string) { return new Date(value).toDateString() }
function formatMessageTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
function formatConversationTime(value: string) { const date = new Date(value); return date.toDateString() === new Date().toDateString() ? formatMessageTime(value) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) }
