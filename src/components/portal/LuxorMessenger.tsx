'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, CheckCheck, Images, Info, Loader2, MessageSquare, MoreVertical, Phone, Plus, Search, Send, UserPlus, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LuxorMessage } from '@/lib/luxorMessageTypes'
import { formatPhoneDisplay } from '@/lib/luxorPhoneClient'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { PortalContactAvatar, PortalCloseButton } from './PortalUI'
import { useToast } from './ToastProvider'

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
  const { notify } = useToast()
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<LuxorMessage[]>([])
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([])
  const [selectedLine, setSelectedLine] = useState('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(() => searchParams?.get('inquiryId') || null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showThreadOnMobile, setShowThreadOnMobile] = useState(false)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<ContactResult[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [draftConversation, setDraftConversation] = useState<Conversation | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [lineOptionsOpen, setLineOptionsOpen] = useState(false)
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

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
    const intervalId = window.setInterval(() => void loadMessages(true), 15_000)
    return () => window.clearInterval(intervalId)
  }, [loadMessages])

  const lineMessages = useMemo(() => selectedLine === 'all' ? messages : messages.filter((message) => {
    const businessSide = message.direction === 'inbound' ? message.to_number : message.from_number
    return businessSide === selectedLine
  }), [messages, selectedLine])
  const conversations = useMemo(() => buildConversations(lineMessages), [lineMessages])
  const visibleConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return conversations.filter((conversation) => {
      if (filter === 'unread' && conversation.unreadCount === 0) return false
      if (!normalizedQuery) return true
      return `${conversation.contactName} ${conversation.phoneNumber} ${conversation.latest?.body || ''}`.toLowerCase().includes(normalizedQuery)
    })
  }, [conversations, filter, query])
  const selectedConversation = conversations.find((conversation) => conversation.key === selectedKey) ?? (draftConversation?.key === selectedKey ? draftConversation : null) ?? conversations[0] ?? null
  const isComposing = Boolean(body.trim())

  useEffect(() => {
    if (!newMessageOpen || contactQuery.trim().length < 2) {
      setContactResults([])
      setSearchingContacts(false)
      return
    }
    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setSearchingContacts(true)
      try {
        const response = await fetch(`/api/twilio/contact-search?q=${encodeURIComponent(contactQuery.trim())}`, { cache: 'no-store', signal: controller.signal })
        const payload = await response.json().catch(() => []) as ContactResult[] | { error?: string }
        if (!response.ok || !Array.isArray(payload)) throw new Error(!Array.isArray(payload) ? payload.error : 'Unable to search contacts.')
        setContactResults(payload)
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
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selectedConversation?.key, selectedConversation?.messages.length])

  useEffect(() => {
    if (!isComposing || !selectedConversation?.phoneNumber) return
    const sendTypingIndicator = () => void fetch('/api/twilio/messaging/typing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: selectedConversation.phoneNumber }),
    })
    sendTypingIndicator()
    const intervalId = window.setInterval(sendTypingIndicator, 15_000)
    return () => window.clearInterval(intervalId)
  }, [isComposing, selectedConversation?.phoneNumber])

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
          fromNumber: selectedLine === 'all' ? businessLines.find((line) => line.isActive)?.phoneNumber : selectedLine,
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

  const startNewConversation = (contact: ContactResult) => {
    const existing = conversations.find((conversation) => conversation.inquiryId === contact.id || conversation.phoneNumber === contact.phoneNumber)
    if (existing) {
      selectConversation(existing)
    } else {
      const draft: Conversation = { key: `draft:${contact.id}`, inquiryId: contact.id, contactName: contact.fullName, phoneNumber: contact.phoneNumber, messages: [], latest: null, unreadCount: 0 }
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
    <section className="portal-surface relative grid min-h-[calc(100dvh-9.5rem)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={`${showThreadOnMobile ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-[color:var(--portal-border)]`}>
        <div className="border-b border-[color:var(--portal-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl font-semibold text-white">Text Messages</h1>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setNewMessageOpen(true); setShowThreadOnMobile(true); setContactQuery(''); setContactResults([]) }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#caa24c] px-3 text-[9px] font-black uppercase tracking-wider text-black hover:bg-[#dfbd68]"><Plus size={13}/> New</button>
              <div className="relative">
                <button type="button" onClick={() => setLineOptionsOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 opacity-60 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30" aria-label="Message line options" aria-expanded={lineOptionsOpen}><MoreVertical size={16}/></button>
                <AnimatePresence>{lineOptionsOpen ? <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-1.5 shadow-2xl backdrop-blur-xl">
                  <p className="px-3 pb-1 pt-2 font-mono text-[8px] uppercase tracking-widest text-zinc-650">Show messages for</p>
                  {[{ value: 'all', label: 'All Luxor numbers' }, ...businessLines.map((line) => ({ value: line.phoneNumber, label: `${line.isActive ? 'Main · ' : ''}${formatPhoneDisplay(line.phoneNumber)}` }))].map((option) => <button key={option.value} type="button" onClick={() => { setSelectedLine(option.value); setSelectedKey(null); setDraftConversation(null); setLineOptionsOpen(false) }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-zinc-300 hover:bg-black/5 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-white"><span className="flex h-4 w-4 items-center justify-center">{selectedLine === option.value ? <Check size={13} className="text-[#caa24c]"/> : null}</span><span>{option.label}</span></button>)}
                </motion.div> : null}</AnimatePresence>
              </div>
            </div>
          </div>
          <label className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 focus-within:border-[#caa24c]/45">
            <Search size={14} className="text-zinc-600" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="portal-input-transparent min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-700" />
          </label>
          <div className="mt-3 grid grid-cols-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1">
            {(['all', 'unread'] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-md py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${filter === value ? 'bg-[#caa24c]/12 text-[#f1d27a]' : 'text-zinc-600 hover:text-zinc-300'}`}>{value}</button>)}
          </div>
        </div>

        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? <LoadingConversations /> : visibleConversations.length ? visibleConversations.map((conversation) => (
            <button key={conversation.key} type="button" onClick={() => selectConversation(conversation)} className={`flex w-full gap-3 border-b border-zinc-900/70 px-4 py-4 text-left transition-colors ${selectedConversation?.key === conversation.key ? 'bg-[#caa24c]/8 shadow-[inset_2px_0_0_#caa24c]' : 'hover:bg-black/5 dark:hover:bg-white/[0.025]'}`}>
              <PortalContactAvatar name={conversation.contactName} inquiryId={conversation.inquiryId || undefined} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={`truncate text-sm ${conversation.unreadCount ? 'font-black text-white' : 'font-semibold text-zinc-300'}`}>{conversation.contactName}</span>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-600">{conversation.latest ? formatConversationTime(conversation.latest.created_at) : 'New'}</span>
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-zinc-600">{formatPhoneDisplay(conversation.phoneNumber)}</span>
                <span className="mt-1 flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-[11px] ${conversation.unreadCount ? 'font-semibold text-zinc-300' : 'text-zinc-600'}`}>{conversation.latest?.direction === 'outbound' ? 'You: ' : ''}{conversation.latest?.body || 'Start a new conversation'}</span>
                  {conversation.unreadCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#caa24c] px-1 font-mono text-[9px] font-black text-black">{conversation.unreadCount}</span> : null}
                </span>
              </span>
            </button>
          )) : <div className="px-6 py-16 text-center"><MessageSquare size={24} className="mx-auto text-zinc-800"/><p className="mt-3 text-xs font-bold text-zinc-500">No conversations found</p><p className="mt-1 text-[10px] text-zinc-700">Try another search or filter.</p></div>}
        </div>
      </aside>

      <main className={`${showThreadOnMobile ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`}>
        {newMessageOpen ? <NewMessagePane query={contactQuery} results={contactResults} searching={searchingContacts} onQueryChange={setContactQuery} onSelect={startNewConversation} onClose={() => { setNewMessageOpen(false); setContactQuery(''); setShowThreadOnMobile(false) }} /> : selectedConversation ? (
          <>
            <header className="flex min-h-20 items-center justify-between gap-4 border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setShowThreadOnMobile(false)} className="rounded-lg p-2 text-zinc-500 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 lg:hidden" aria-label="Back to conversations"><ArrowLeft size={18}/></button>
                <PortalContactAvatar name={selectedConversation.contactName} inquiryId={selectedConversation.inquiryId || undefined} size="md" />
                <div className="min-w-0"><p className="truncate text-sm font-black text-white">{selectedConversation.contactName}</p><button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: selectedConversation.phoneNumber, contactName: selectedConversation.contactName, inquiryId: selectedConversation.inquiryId })} className="mt-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:text-emerald-400">{formatPhoneDisplay(selectedConversation.phoneNumber)}</button></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => startLuxorBrowserCall({ phoneNumber: selectedConversation.phoneNumber, contactName: selectedConversation.contactName, inquiryId: selectedConversation.inquiryId })} className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-[9px] font-black uppercase tracking-wider text-zinc-300 hover:border-emerald-500/25 hover:text-emerald-400"><Phone size={13}/> <span className="hidden sm:inline">Call</span></button>
                {selectedConversation.inquiryId ? <Link href={`/portal/leads/${selectedConversation.inquiryId}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#caa24c]/25 px-3 text-[9px] font-black uppercase tracking-wider text-[#f1d27a] hover:bg-[#caa24c]/8"><UserRound size={13}/> <span className="hidden sm:inline">View Lead</span></Link> : null}
                <div className="relative">
                  <button type="button" onClick={() => setOptionsOpen((current) => !current)} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 opacity-60 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30" aria-label="Conversation options" aria-expanded={optionsOpen}><MoreVertical size={16}/></button>
                  <AnimatePresence>{optionsOpen ? <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-1.5 shadow-2xl backdrop-blur-xl">
                    <button type="button" onClick={() => { setOptionsOpen(false); setMediaGalleryOpen(true) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"><Images size={14}/> Media gallery <span className="ml-auto font-mono text-zinc-600">{sharedMedia.length}</span></button>
                    {selectedConversation.inquiryId ? <Link href={`/portal/leads/${selectedConversation.inquiryId}`} onClick={() => setOptionsOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[10px] font-bold text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"><Info size={14}/> Contact details</Link> : null}
                    <div className="my-1 h-px bg-[color:var(--portal-border)]"/>
                    <button type="button" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold text-zinc-650"><UserPlus size={14}/> Add a member</button>
                    <p className="px-3 pb-2 text-[9px] leading-4 text-zinc-700">Twilio RCS does not support group messaging.</p>
                  </motion.div> : null}</AnimatePresence>
                </div>
              </div>
            </header>

            <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7">
              <div className="mx-auto max-w-4xl space-y-3">
                {selectedConversation.messages.length ? selectedConversation.messages.map((message, index, thread) => {
                  const previous = thread[index - 1]
                  const showDate = !previous || dayKey(previous.created_at) !== dayKey(message.created_at)
                  return <div key={message.id}>{showDate ? <DateDivider value={message.created_at}/> : null}<MessageBubble message={message}/></div>
                }) : <div className="py-16 text-center"><MessageSquare size={22} className="mx-auto text-zinc-800"/><p className="mt-3 text-sm font-bold text-zinc-400">Start your conversation with {selectedConversation.contactName}</p><p className="mt-1 text-xs text-zinc-650">Messages send through Luxor’s approved Twilio sender.</p></div>}
                <div ref={threadEndRef}/>
              </div>
            </div>

            <div className="border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 sm:p-4">
              <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 focus-within:border-[#caa24c]/40">
                <div className="min-w-0 flex-1 px-2 py-1">
                  <textarea value={body} onChange={(event) => setBody(event.target.value.slice(0, 1600))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} rows={1} placeholder={`Message ${selectedConversation.contactName}`} className="portal-input-transparent max-h-32 min-h-7 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-zinc-700" />
                  <div className="mt-1 flex items-center justify-between gap-2"><p className="font-mono text-[8px] text-zinc-700">{body.length} / 1600 · Enter to send · Shift+Enter for a new line</p><AnimatePresence>{isComposing ? <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-[8px] text-[#caa24c]">Typing <TypingDots/></motion.span> : null}</AnimatePresence></div>
                </div>
                <button type="button" onClick={() => void sendMessage()} disabled={!body.trim() || sending} className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg bg-[#caa24c] px-3 text-[9px] font-black uppercase tracking-wider text-black transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">{sending ? <Loader2 size={15} className="animate-spin"/> : <><Send size={14}/><span className="hidden sm:inline">Send</span></>}</button>
              </div>
            </div>
          </>
        ) : <EmptyMessenger />}
      </main>
      <AnimatePresence>{mediaGalleryOpen ? <MediaGallery items={sharedMedia} onClose={() => setMediaGalleryOpen(false)} /> : null}</AnimatePresence>
    </section>
  )
}

function buildConversations(messages: LuxorMessage[]) {
  const grouped = new Map<string, LuxorMessage[]>()
  for (const message of messages) {
    const phoneNumber = message.direction === 'inbound' ? message.from_number : message.to_number
    const key = message.inquiry_id || phoneNumber
    grouped.set(key, [...(grouped.get(key) || []), message])
  }
  return Array.from(grouped, ([key, groupedMessages]) => {
    const sorted = groupedMessages.toSorted((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const latest = sorted[sorted.length - 1]
    const phoneNumber = latest.direction === 'inbound' ? latest.from_number : latest.to_number
    return { key, inquiryId: latest.inquiry_id, contactName: latest.contact_name || formatPhoneDisplay(phoneNumber) || 'Unknown contact', phoneNumber, messages: sorted, latest, unreadCount: sorted.filter((message) => message.direction === 'inbound' && !message.is_read).length }
  }).toSorted((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
}

function MessageBubble({ message }: { message: LuxorMessage }) {
  const outbound = message.direction === 'outbound'
  return <motion.div layout initial={{ opacity: 0, y: 34, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[88%] sm:max-w-[72%] ${outbound ? 'text-right' : 'text-left'}`}>
      <div className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-6 ${outbound ? 'rounded-br-md bg-[#caa24c] text-black' : 'rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200'}`}>{message.body || '(Media message)'}</div>
      <p className={`mt-1 flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-zinc-650 ${outbound ? 'justify-end' : 'justify-start'}`}>{message.owner_email === 'luxor-automation' ? <><span>Automated</span><span>·</span></> : null}{formatMessageTime(message.created_at)}{outbound ? <><span>·</span><span>{message.status}</span>{message.status === 'delivered' || message.status === 'read' ? <CheckCheck size={11} className={message.status === 'read' ? 'text-emerald-400' : 'text-[#caa24c]'}/> : null}</> : null}</p>
      {message.error_message ? <p className="mt-1 text-[9px] text-red-400">{message.error_message}</p> : null}
    </div>
  </motion.div>
}

function NewMessagePane({ query, results, searching, onQueryChange, onSelect, onClose }: { query: string; results: ContactResult[]; searching: boolean; onQueryChange: (value: string) => void; onSelect: (contact: ContactResult) => void; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }} className="flex min-h-0 flex-1 flex-col">
    <header className="flex min-h-20 items-center gap-3 border-b border-[color:var(--portal-border)] px-4 py-3 sm:px-5">
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30" aria-label="Close new message"><ArrowLeft size={18}/></button>
      <div><p className="text-sm font-black text-white">New conversation</p><p className="mt-0.5 text-[10px] text-zinc-600">Choose a Luxor contact to start messaging.</p></div>
    </header>
    <div className="border-b border-[color:var(--portal-border)] px-4 py-5 sm:px-6">
      <label className="flex items-center gap-3">
        <span className="text-xs font-black text-[#f1d27a]">To:</span>
        <input autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Type a name or phone number" className="portal-input-transparent min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"/>
        {searching ? <Loader2 size={14} className="animate-spin text-[#caa24c]"/> : null}
      </label>
    </div>
    <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 font-mono text-[8px] font-black uppercase tracking-widest text-zinc-650">{query.trim().length >= 2 ? 'Matching contacts' : 'Find a contact'}</p>
        {query.trim().length < 2 ? <div className="py-16 text-center"><Search size={24} className="mx-auto text-zinc-800"/><p className="mt-3 text-sm font-bold text-zinc-400">Search Luxor contacts</p><p className="mt-1 text-xs text-zinc-650">Enter at least two letters or digits.</p></div> : searching ? <p className="py-16 text-center text-xs text-zinc-650">Searching Luxor contacts…</p> : results.length ? <div className="space-y-1">{results.map((contact) => <button key={contact.id} type="button" onClick={() => onSelect(contact)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05]"><PortalContactAvatar name={contact.fullName} inquiryId={contact.id} size="md"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-white">{contact.fullName}</span><span className="mt-0.5 block font-mono text-[10px] text-zinc-600">{formatPhoneDisplay(contact.phoneNumber)}{contact.eventType ? ` · ${contact.eventType}` : ''}</span></span><MessageSquare size={15} className="text-[#caa24c]"/></button>)}</div> : <p className="py-16 text-center text-xs text-zinc-650">No matching contacts with a mobile number.</p>}
      </div>
    </div>
  </motion.div>
}

function MediaGallery({ items, onClose }: { items: Array<{ url: string; message: LuxorMessage }>; onClose: () => void }) {
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 bg-black/80 p-5 backdrop-blur-sm">
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#10100e]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div><p className="text-sm font-black text-white">Shared media</p><p className="mt-1 text-[10px] text-zinc-600">Images and files received in this conversation.</p></div><PortalCloseButton onClick={onClose} aria-label="Close media gallery" /></div>
      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{items.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((item, index) => <a key={`${item.message.id}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-zinc-800 bg-black/30"><div className="aspect-square bg-zinc-950"><img src={item.url} alt={`Shared media from ${formatMessageTime(item.message.created_at)}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"/></div><p className="px-3 py-2 font-mono text-[8px] text-zinc-600">{new Date(item.message.created_at).toLocaleString()}</p></a>)}</div> : <div className="flex h-full items-center justify-center text-center"><div><Images size={25} className="mx-auto text-zinc-800"/><p className="mt-3 text-sm font-bold text-zinc-400">No shared media yet</p><p className="mt-1 text-xs text-zinc-650">Photos received through MMS or RCS will appear here.</p></div></div>}</div>
    </motion.div>
  </motion.div>
}

function DateDivider({ value }: { value: string }) { return <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-zinc-900"/><span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">{new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="h-px flex-1 bg-zinc-900"/></div> }
function TypingDots() { return <span className="flex items-center gap-0.5" aria-hidden="true">{[0, 1, 2].map((dot) => <motion.span key={dot} className="h-1 w-1 rounded-full bg-[#caa24c]" animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }} transition={{ duration: 0.75, repeat: Infinity, delay: dot * 0.12 }}/>)}</span> }
function LoadingConversations() { return <div className="space-y-1 p-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex animate-pulse gap-3 rounded-xl p-3"><span className="h-10 w-10 rounded-full bg-zinc-900"/><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-zinc-900"/><span className="block h-2 w-4/5 rounded bg-zinc-900/70"/></span></div>)}</div> }
function EmptyMessenger() { return <div className="flex flex-1 items-center justify-center p-8 text-center"><div><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#caa24c]/15 bg-[#caa24c]/5 text-[#caa24c]"><MessageSquare size={22}/></span><p className="mt-4 text-sm font-bold text-zinc-300">No text conversations yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">Open a lead with a mobile number and choose Text Client to begin.</p></div></div> }
function dayKey(value: string) { return new Date(value).toDateString() }
function formatMessageTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
function formatConversationTime(value: string) { const date = new Date(value); return date.toDateString() === new Date().toDateString() ? formatMessageTime(value) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }) }
