'use client'

import React, { useState, useEffect, useRef } from 'react'
import { 
  X, 
  Send, 
  Info,
  RefreshCw,
  History,
  Plus,
  Trash2,
  Edit2,
  Check,
  Radar,
  UserRoundCheck,
  ReceiptText,
  FileSignature,
  CalendarClock,
  MessageCircleMore,
  ListTodo,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  FileText,
  CalendarDays,
  ExternalLink,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { PortalCloseButton, PortalContactAvatar, PortalDatePicker, PortalSelect } from './PortalUI'
import { ElenaEmailDraftCard, EmailDraftPayload } from './ElenaEmailDraftCard'
import {
  ElenaLeadUpdateCard,
  ElenaContractCard,
  ElenaInvoiceCard,
  ElenaTaskCard,
  LeadUpdatePayload,
  ContractCardPayload,
  InvoiceCardPayload,
  TaskCardPayload
} from './ElenaCRMContainers'

type ExecutedQuery = {
  query: string
  result: unknown
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  executedQueries?: ExecutedQuery[]
  confirmation?: {
    query: string
    summary: string
  }
  isConfirmed?: boolean
  isCancelled?: boolean
  emailDraft?: EmailDraftPayload
  crmUpdateCard?: LeadUpdatePayload
  contractCard?: ContractCardPayload
  invoiceCard?: InvoiceCardPayload
  taskCard?: TaskCardPayload
  contactCard?: LeadContactCardPayload
  tourInviteCard?: TourInviteCardPayload
}

type LeadContactCardPayload = {
  inquiryId: string
  clientName: string
  email?: string | null
  phone?: string | null
  eventType?: string | null
  targetDate?: string | null
  guestCount?: number | null
  status?: string | null
}

type TourInviteCardPayload = {
  inquiryId: string
  clientName: string
  clientEmail: string | null
  eventType: string | null
  tourDate: string
  tourTime: string
  meetingType: string
  durationMinutes: number
  clientFacingNotes: string
}

type SmartSuggestion = {
  id: string
  kind: 'lead' | 'money' | 'contract' | 'event' | 'message' | 'task'
  label: string
  detail: string
  prompt: string
  urgency: 'urgent' | 'attention' | 'plan'
}

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface PortalElenaChatProps {
  isOpen: boolean
  onClose: () => void
  activePath: string
}

function getSuggestionsForPath(path: string): SmartSuggestion[] {
  const makeSuggestion = (id: string, label: string, detail: string, prompt: string, kind: SmartSuggestion['kind']): SmartSuggestion => ({
    id,
    label,
    detail,
    prompt,
    kind,
    urgency: 'attention',
  })
  if (path.startsWith('/portal/leads')) {
    return [
      makeSuggestion('leads-recent', 'Recent inquiries', 'Review the newest leads and their details.', 'List details of the last 3 inquiries.', 'lead'),
      makeSuggestion('leads-follow-up', 'Lead follow-up', 'Find the leads waiting for a next step.', 'Show recent follow-up notes and which leads need movement.', 'lead'),
      makeSuggestion('leads-pipeline', 'Pipeline health', 'See where active leads are getting stuck.', 'Check active leads by pipeline stage.', 'lead'),
    ]
  }
  if (path.startsWith('/portal/calendar') || path.startsWith('/portal/events')) {
    return [
      makeSuggestion('events-upcoming', 'Upcoming bookings', 'Review the next events on the calendar.', 'Show upcoming bookings for this month.', 'event'),
      makeSuggestion('events-tours', 'Tours this week', 'Check what needs preparation for scheduled tours.', 'Are there any tours scheduled this week?', 'event'),
      makeSuggestion('events-completed', 'Completed events', 'Look back at this year’s completed events.', 'Show completed events this year.', 'event'),
    ]
  }
  if (path.startsWith('/portal/finances') || path.startsWith('/portal/invoices')) {
    return [
      makeSuggestion('finances-revenue', 'Invoice revenue', 'Get the current revenue picture.', 'What is our total revenue from invoices?', 'money'),
      makeSuggestion('finances-owed', 'Payments due', 'Focus on unpaid and overdue balances.', 'Find all unpaid or overdue invoices.', 'money'),
      makeSuggestion('finances-bookings', 'Bookings and expenses', 'Review recent financial movement.', 'List recent bookings and expenses.', 'money'),
    ]
  }
  if (path.startsWith('/portal/marketing')) {
    return [
      makeSuggestion('marketing-campaigns', 'Campaigns', 'Review what is currently running.', 'List our marketing campaigns.', 'task'),
      makeSuggestion('marketing-opens', 'Email performance', 'See which messages are getting attention.', 'Show open rates of email campaigns.', 'task'),
      makeSuggestion('marketing-subscribers', 'Audience growth', 'Check the size of the marketing list.', 'Check marketing list subscriber count.', 'task'),
    ]
  }
  if (path.startsWith('/portal/operations')) {
    return [
      makeSuggestion('operations-stock', 'Inventory attention', 'Find what needs restocking.', 'Show inventory items that are Low or Out of Stock.', 'task'),
      makeSuggestion('operations-cleaning', 'Cleaning checks', 'Review active cleaning logs.', 'Check active cleaning logs.', 'task'),
      makeSuggestion('operations-tasks', 'Operations tasks', 'Prioritize open operational work.', 'List pending operations tasks.', 'task'),
    ]
  }
  return [
    makeSuggestion('default-bookings', 'Upcoming bookings', 'Review the calendar ahead.', 'Show upcoming bookings.', 'event'),
    makeSuggestion('default-inquiries', 'Active inquiries', 'See which leads need attention.', 'Check active venue inquiries.', 'lead'),
    makeSuggestion('default-tasks', 'Tasks this week', 'Prioritize what is due next.', 'List tasks due this week.', 'task'),
  ]
}

function SuggestionIcon({ kind, className }: { kind: SmartSuggestion['kind']; className?: string }) {
  const Icon = {
    lead: UserRoundCheck,
    money: ReceiptText,
    contract: FileSignature,
    event: CalendarClock,
    message: MessageCircleMore,
    task: ListTodo,
  }[kind]
  return <Icon size={14} className={className} />
}

function getQueryIndicatorText(sql: string) {
  const clean = sql.trim().toLowerCase()
  let action = 'Queried'
  if (clean.startsWith('insert')) action = 'Added to'
  if (clean.startsWith('update')) action = 'Updated'
  if (clean.startsWith('delete')) action = 'Removed from'

  const match = sql.match(/public\.luxor_([a-zA-Z0-9_]+)/i)
  const tableName = match ? match[1].replace(/_/g, ' ') : 'database'

  return `${action} ${tableName}`
}

export function PortalElenaChat({ isOpen, onClose, activePath }: PortalElenaChatProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sessions History States
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  const [showSessionsList, setShowSessionsList] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState('')

  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const suggestionCycleRef = useRef(0)
  const sessionRequestRef = useRef(0)
  const messageRequestRef = useRef(0)

  type AttachedFile = {
    id: string
    name: string
    type: string
    dataUrl?: string
    textContent?: string
  }

  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [isListening, setIsListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const toggleVoiceDictation = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      setIsListening(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice dictation is not supported in this browser. Please use Chrome, Safari, or Edge.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        if (transcript.trim()) {
          setInput((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()))
        }
      }

      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)

      recognition.start()
      recognitionRef.current = recognition
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      const id = Math.random().toString(36).slice(2, 9)
      const reader = new FileReader()
      if (file.type.startsWith('image/')) {
        reader.onload = (evt) => {
          const dataUrl = evt.target?.result as string
          setAttachments((prev) => [...prev, { id, name: file.name, type: file.type, dataUrl }])
        }
        reader.readAsDataURL(file)
      } else {
        reader.onload = (evt) => {
          const textContent = evt.target?.result as string
          setAttachments((prev) => [...prev, { id, name: file.name, type: file.type, textContent }])
        }
        reader.readAsText(file)
      }
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  useEffect(() => {
    if (isOpen) scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      suggestionCycleRef.current = 0
      loadSmartSuggestions(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activePath])

  useEffect(() => {
    if (isOpen) {
      setShowSessionsList(false)
      loadSessionsList()
    } else {
      setShowSessionsList(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const loadSmartSuggestions = async (advanceCycle = true) => {
    if (advanceCycle) suggestionCycleRef.current += 1
    setIsLoadingSuggestions(true)
    try {
      const res = await fetch(`/api/portal/elena-chat/suggestions?activePath=${encodeURIComponent(activePath)}&cycle=${suggestionCycleRef.current}`)
      if (res.ok) {
        const data = (await res.json()) as { suggestions?: SmartSuggestion[] }
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSmartSuggestions(data.suggestions)
        }
      }
    } catch (err) {
      console.error('Error loading smart suggestions:', err)
    } finally {
      setIsLoadingSuggestions(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadSessionsList = async (selectSessionId?: string) => {
    const requestId = ++sessionRequestRef.current
    try {
      const response = await fetch('/api/portal/elena-chat/sessions')
      if (!response.ok) throw new Error('Failed to load sessions list')
      const data = (await response.json()) as ChatSession[]
      if (requestId !== sessionRequestRef.current) return
      setSessions(data)

      if (data.length > 0) {
        const targetId = selectSessionId || currentSessionId || data[0].id
        // Only load messages if we switch to a different active session or initializing
        if (targetId !== currentSessionId || messages.length <= 1 || loadedSessionId !== targetId) {
          setCurrentSessionId(targetId)
          await loadSessionMessages(targetId)
        }
      } else {
        await handleCreateSession()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const loadSessionMessages = async (sessionId: string) => {
    const requestId = ++messageRequestRef.current
    setLoadedSessionId(null)
    setIsLoading(true)
    try {
      const response = await fetch(`/api/portal/elena-chat/sessions?id=${sessionId}`)
      if (!response.ok) throw new Error('Failed to load messages')
      const data = (await response.json()) as { messages: Message[] }
      if (requestId !== messageRequestRef.current) return
      const raw = data.messages || []
      const hasUserMsg = raw.some((m) => m.role === 'user')
      if (!hasUserMsg) {
        setMessages([])
      } else {
        const cleaned = raw.filter((m, idx) => {
          if (idx === 0 && m.role === 'assistant' && (m.content?.includes('bestie') || m.content?.includes('Elena AI Concierge active'))) {
            return false
          }
          return true
        })
        setMessages(cleaned)
      }
      setLoadedSessionId(sessionId)
    } catch (err) {
      console.error(err)
    } finally {
      if (requestId === messageRequestRef.current) setIsLoading(false)
    }
  }

  const handleCreateSession = async () => {
    const requestId = ++messageRequestRef.current
    setLoadedSessionId(null)
    setIsLoading(true)
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to create session')
      const newSession = (await response.json()) as { id: string; title: string; messages: Message[] }
      if (requestId !== messageRequestRef.current) return
      
      setSessions(prev => [{
        id: newSession.id,
        title: newSession.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, ...prev])
      setCurrentSessionId(newSession.id)
      setMessages(newSession.messages)
      setLoadedSessionId(newSession.id)
      setShowSessionsList(false)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSession = (sessionId: string) => {
    setCurrentSessionId(sessionId)
    void loadSessionMessages(sessionId)
    setShowSessionsList(false)
  }

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: sessionId, title: newTitle.trim() })
      })
      if (!response.ok) throw new Error('Failed to rename session')
      
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
      setEditingSessionId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat session bestie? 💔')) return
    try {
      const response = await fetch(`/api/portal/elena-chat/sessions?id=${sessionId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete session')

      const remaining = sessions.filter(s => s.id !== sessionId)
      setSessions(remaining)
      
      if (currentSessionId === sessionId) {
        if (remaining.length > 0) {
          setCurrentSessionId(remaining[0].id)
          void loadSessionMessages(remaining[0].id)
        } else {
          handleCreateSession()
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSend = async (textToSend: string) => {
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return

    const userMessageText = textToSend.trim()
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    if (isListening) toggleVoiceDictation()

    let fullDisplayContent = userMessageText
    if (currentAttachments.length > 0) {
      const attNames = currentAttachments.map(a => `📎 ${a.name}`).join(', ')
      fullDisplayContent = userMessageText ? `${userMessageText}\n\n[Attached: ${attNames}]` : `[Attached: ${attNames}]`
    }
    
    const updatedMessages: Message[] = [...messages, { role: 'user', content: fullDisplayContent }]
    setMessages(updatedMessages)
    setIsLoading(true)

    try {
      const apiMessages = updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: apiMessages,
          activePath,
          attachments: currentAttachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl, textContent: a.textContent })),
          chatId: currentSessionId || undefined
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = (await response.json()) as {
        reply: string
        executedQueries: ExecutedQuery[]
        confirmation?: { query: string; summary: string }
        textCampaignDraft?: {
          name: string
          bodyTemplate: string
          campaignType: string
        }
        emailDraft?: EmailDraftPayload
        crmUpdateCard?: LeadUpdatePayload
        contractCard?: ContractCardPayload
        invoiceCard?: InvoiceCardPayload
        taskCard?: TaskCardPayload
        contactCard?: LeadContactCardPayload
        tourInviteCard?: TourInviteCardPayload
        navigation?: { href: string }
      }

      if (data.textCampaignDraft) {
        window.localStorage.setItem('luxor_elena_text_campaign_draft', JSON.stringify(data.textCampaignDraft))
        window.dispatchEvent(new CustomEvent('luxor:text-campaign-draft', { detail: data.textCampaignDraft }))
      }

      if (data.navigation?.href) router.push(data.navigation.href)
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply?.trim() || 'I did not get a clear answer back from the query service. Please try that question again, or ask me for a daily brief.',
          executedQueries: data.executedQueries,
          confirmation: data.confirmation,
          emailDraft: data.emailDraft,
          crmUpdateCard: data.crmUpdateCard,
          contractCard: data.contractCard,
          invoiceCard: data.invoiceCard,
          taskCard: data.taskCard,
          contactCard: data.contactCard,
          tourInviteCard: data.tourInviteCard,
        }
      ])
      
      // Refresh session sidebar metadata in background to update title & date order
      if (currentSessionId) {
        loadSessionsList(currentSessionId)
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I ran into an error connecting to the query service. Please check your network and try again.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmAction = async (msgIndex: number, confirmation: { query: string; summary: string }) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    setIsLoading(true)

    try {
      const apiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          activePath,
          confirmQuery: confirmation.query,
          confirmSummary: confirmation.summary,
          chatId: currentSessionId || undefined
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to execute confirm query')
      }

      const data = (await response.json()) as {
        reply: string
        executedQueries: ExecutedQuery[]
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries
        }
      ])

      if (currentSessionId) {
        loadSessionsList(currentSessionId)
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'I ran into an issue executing the action bestie! Please double-check lead/booking locks or database logs.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelAction = (msgIndex: number) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isCancelled: true } : m))
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'No worries bestie! 💁‍♀️ I cancelled the action. Nothing was modified!'
      }
    ])
  }

  const pathSuggestions = getSuggestionsForPath(activePath)
  const isSessionHydrating = Boolean(currentSessionId && loadedSessionId !== currentSessionId)

  return (
    <motion.aside 
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]"
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] px-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full border border-[#caa24c]/30 ring-2 ring-[#caa24c]/10">
            <Image 
              src="/luxor-concierge.png" 
              alt="Elena Assistant" 
              fill 
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div>
            <h3 className="font-serif text-base font-medium leading-none text-zinc-300">Elena AI</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              CRM Intelligence Connected
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={handleCreateSession}
            className="rounded-lg p-1.5 text-zinc-500 opacity-80 transition-all hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 cursor-pointer"
            title="Start New Chat Session"
            aria-label="Start New Chat Session"
          >
            <Plus size={16} />
          </button>
          <button 
            type="button"
            onClick={() => setShowSessionsList(curr => !curr)}
            className={`rounded-lg p-1.5 transition-all cursor-pointer ${
              showSessionsList 
                ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]' 
                : 'text-zinc-500 opacity-80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white hover:opacity-100'
            }`}
            title="Chat History Sessions"
            aria-label="Chat History Sessions"
          >
            <History size={16} />
          </button>
          <PortalCloseButton onClick={onClose} aria-label="Close Elena Chat" />
        </div>
      </div>

      {/* Main Drawer Shell / Overlay List */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <AnimatePresence>
          {showSessionsList && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 z-20 flex flex-col bg-[color:var(--portal-bg)] p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-550">Chat Sessions</h4>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  className="inline-flex items-center gap-1.5 rounded bg-[#caa24c] hover:bg-[#f1d27a] text-white px-2.5 py-1 text-[10px] font-black uppercase cursor-pointer transition-all"
                >
                  <Plus size={11} strokeWidth={3} /> New Session
                </button>
              </div>
              
              <div className="portal-scrollbar flex-1 overflow-y-auto space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-xs text-zinc-550 text-center py-6">No chat sessions found bestie! 💕</p>
                ) : (
                  sessions.map((session) => (
                    <div 
                      key={session.id}
                      className={`group flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                        currentSessionId === session.id
                          ? 'border-[#caa24c]/30 bg-[#caa24c]/5'
                          : 'border-zinc-900 bg-zinc-950/40 hover:border-zinc-850 hover:bg-zinc-950/80'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        {editingSessionId === session.id ? (
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault()
                              handleRenameSession(session.id, editTitleInput)
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <input
                              autoFocus
                              type="text"
                              value={editTitleInput}
                              onChange={(e) => setEditTitleInput(e.target.value)}
                              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-[#caa24c]"
                            />
                            <button type="submit" className="text-green-500 hover:text-green-400 p-0.5 cursor-pointer">
                              <Check size={13} />
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setEditingSessionId(null)}
                              className="text-red-500 hover:text-red-400 p-0.5 cursor-pointer"
                            >
                              <X size={13} />
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLoadSession(session.id)}
                            className="w-full text-left font-serif text-sm text-zinc-300 hover:text-white truncate cursor-pointer"
                          >
                            {session.title}
                          </button>
                        )}
                        <span className="text-[9px] text-zinc-650 block mt-1 font-mono">
                          {new Date(session.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
  
                      {editingSessionId !== session.id && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSessionId(session.id)
                              setEditTitleInput(session.title)
                            }}
                            className="rounded-lg p-1 text-zinc-500 opacity-70 transition-all hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#a8792f] dark:hover:text-[#f1d27a] hover:opacity-100 cursor-pointer"
                            title="Rename Session"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            className="rounded-lg p-1 text-zinc-500 opacity-70 transition-all hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:opacity-100 cursor-pointer"
                            title="Delete Session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages Window */}
        <div className={`portal-scrollbar min-h-0 flex-1 p-4 ${isSessionHydrating || messages.length === 0 ? 'overflow-hidden flex flex-col justify-center' : 'overflow-y-auto'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSessionId || 'empty-session'}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className={messages.length === 0 ? 'h-full flex flex-col justify-center' : 'min-h-full flex flex-col justify-between space-y-4'}
            >
              {isSessionHydrating ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center text-zinc-500" role="status" aria-live="polite">
                  <Loader2 size={20} className="animate-spin text-[#caa24c]" />
                  <p className="text-xs">Opening Elena’s conversation…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-2 py-2 space-y-4 my-auto">
                  <div className="relative">
                    <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-[#caa24c]/40 ring-4 ring-[#caa24c]/10 shadow-2xl">
                      <Image src="/luxor-concierge.png" alt="Elena AI" fill sizes="56px" className="object-cover" />
                    </div>
                    <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#050505] bg-green-500" />
                  </div>

                  <div className="max-w-xs space-y-1">
                    <h3 className="font-serif text-lg font-medium text-zinc-300">Elena Concierge</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Connected to your live Luxor database & CRM intelligence.
                    </p>
                  </div>

                  <div className="w-full space-y-2 pt-1">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-550">Current priorities</p>
                      <div className="flex items-center gap-2">
                        {isLoadingSuggestions ? (
                          <span className="flex items-center gap-1 text-[9px] text-[#caa24c]">
                            <Loader2 size={10} className="animate-spin" /> Querying CRM...
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => loadSmartSuggestions(true)}
                            className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-[#caa24c] transition-colors cursor-pointer"
                            title="Show the next set of live priorities"
                          >
                            <RefreshCw size={10} />
                            <span>Next priorities</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <AnimatePresence mode="wait">
                        {isLoadingSuggestions && smartSuggestions.length === 0 ? (
                          <motion.div
                            key="suggestions-skeleton"
                            initial={{ opacity: 0, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, filter: 'blur(6px)' }}
                            transition={{ duration: 0.25 }}
                            className="grid gap-2"
                          >
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className="portal-suggestion-card flex items-center justify-between rounded-xl border border-zinc-800/20 bg-zinc-950/40 p-3 shadow-sm animate-pulse"
                              >
                                <div className="h-3.5 w-3/4 rounded bg-zinc-800/60 luxor-skeleton" />
                                <Radar size={13} className="shrink-0 text-zinc-700/50" />
                              </div>
                            ))}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="suggestions-list"
                            initial={{ opacity: 0, filter: 'blur(6px)', y: 6 }}
                            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                            className="grid gap-2"
                          >
                            <AnimatePresence mode="popLayout">
                              {(smartSuggestions.length > 0 ? smartSuggestions : pathSuggestions).map((suggestion, idx) => (
                                <motion.button
                                  key={suggestion.id}
                                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ 
                                    duration: 0.3, 
                                    delay: idx * 0.06, 
                                    ease: [0.23, 1, 0.32, 1] 
                                  }}
                                  type="button"
                                  onClick={() => handleSend(suggestion.prompt)}
                                  className="portal-suggestion-card flex items-center justify-between rounded-xl border border-zinc-800/20 bg-zinc-950/40 p-3 text-left text-xs text-zinc-300 hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 hover:text-white transition-all cursor-pointer group shadow-sm hover:shadow-md hover:shadow-[#caa24c]/5"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[9px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#e3bc65]">{suggestion.label}</span>
                                    <span className="mt-0.5 block line-clamp-2 leading-snug">{suggestion.detail}</span>
                                  </span>
                                  <SuggestionIcon kind={suggestion.kind} className="ml-3 shrink-0 text-zinc-600 transition-colors group-hover:text-[#caa24c]" />
                                </motion.button>
                              ))}
                            </AnimatePresence>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {messages.map((msg, index) => (
                      <motion.div 
                        layout
                        key={index} 
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <motion.div
                          initial={{ opacity: 0, y: 30, scale: 0.88, originX: msg.role === 'user' ? 1 : 0, originY: 1 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          className={`flex items-start gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                              <Image src="/luxor-concierge.png" alt="Elena" fill sizes="24px" className="object-cover" />
                            </div>
                          )}
                          <div 
                            className={`rounded-2xl px-4 py-2.5 shadow-sm text-sm border ${
                              msg.role === 'user'
                                ? 'rounded-tr-none bg-[#caa24c]/10 border-[#caa24c]/20 text-zinc-300'
                                : 'rounded-tl-none bg-zinc-900/60 border-zinc-800/30 text-zinc-300'
                            }`}
                          >
                            {renderFormattedContent(msg.content)}
                          </div>
                        </motion.div>

                        {msg.contactCard && <ElenaContactCard payload={msg.contactCard} />}

                        {msg.tourInviteCard && (
                          <ElenaTourInviteCard
                            payload={msg.tourInviteCard}
                            onSuccess={(successMessage) => {
                              setMessages((prev) => [...prev, { role: 'assistant', content: successMessage }])
                            }}
                          />
                        )}

                        {/* Render SQL execution indicators */}
                        {msg.executedQueries && msg.executedQueries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 pl-8">
                            {msg.executedQueries.map((eq, qIdx) => (
                              <span 
                                key={qIdx} 
                                className="inline-flex items-center gap-1 rounded bg-[#caa24c]/5 border border-[#caa24c]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#f1d27a] font-sans"
                              >
                                <span className="h-1 w-1 rounded-full bg-[#caa24c]" />
                                {getQueryIndicatorText(eq.query)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Render Direct Action Confirmation Cards */}
                        {msg.confirmation && !msg.isConfirmed && !msg.isCancelled && (
                          <div className="w-[88%] mt-3 pl-8">
                            <div className="rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/5 p-3.5 space-y-3">
                              <div className="flex items-start gap-2.5">
                                <Info size={14} className="text-[#caa24c] shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-semibold text-zinc-300">Action Confirmation Required</p>
                                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{msg.confirmation.summary}</p>
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmAction(index, msg.confirmation!)}
                                  className="rounded bg-[#caa24c] hover:bg-[#f1d27a] text-white px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  Confirm Action
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelAction(index)}
                                  className="rounded border border-zinc-850 hover:bg-zinc-900 text-zinc-450 hover:text-white px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {msg.confirmation && msg.isConfirmed && (
                          <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-green-500 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                            Action Confirmed & Executed
                          </div>
                        )}

                        {msg.confirmation && msg.isCancelled && (
                          <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-zinc-550 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                            Action Cancelled
                          </div>
                        )}

                        {/* Render Mini Email Draft Card */}
                        {msg.emailDraft && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaEmailDraftCard
                              draft={msg.emailDraft}
                              onSendSuccess={(recipient, subj) => {
                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    role: 'assistant',
                                    content: `Done bestie! I successfully sent the email to **${recipient}** with subject *"${subj}"*! 💌✨`
                                  }
                                ])
                              }}
                              onRegenerateRequest={(instruction) => {
                                handleSend(`Please refine the email draft: ${instruction}`)
                              }}
                            />
                          </div>
                        )}

                        {/* Render CRM Lead Update Card */}
                        {msg.crmUpdateCard && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaLeadUpdateCard
                              payload={msg.crmUpdateCard}
                              onSuccess={(successMsg) => {
                                setMessages((prev) => [
                                  ...prev,
                                  { role: 'assistant', content: successMsg }
                                ])
                              }}
                            />
                          </div>
                        )}

                        {/* Render Contract Signature Card */}
                        {msg.contractCard && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaContractCard
                              payload={msg.contractCard}
                              onSuccess={(successMsg) => {
                                setMessages((prev) => [
                                  ...prev,
                                  { role: 'assistant', content: successMsg }
                                ])
                              }}
                            />
                          </div>
                        )}

                        {/* Render Invoice & Payment Link Card */}
                        {msg.invoiceCard && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaInvoiceCard
                              payload={msg.invoiceCard}
                              onSuccess={(successMsg) => {
                                setMessages((prev) => [
                                  ...prev,
                                  { role: 'assistant', content: successMsg }
                                ])
                              }}
                            />
                          </div>
                        )}

                        {/* Render Task Card */}
                        {msg.taskCard && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaTaskCard
                              payload={msg.taskCard}
                              onSuccess={(successMsg) => {
                                setMessages((prev) => [
                                  ...prev,
                                  { role: 'assistant', content: successMsg }
                                ])
                              }}
                            />
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                      <motion.div
                        layout
                        key="thinking-indicator"
                        initial={{ opacity: 0, y: 20, scale: 0.9, originX: 0, originY: 1 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start gap-2 max-w-[80%]"
                      >
                        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                          <Image src="/luxor-concierge.png" alt="Elena" fill sizes="24px" className="object-cover" />
                        </div>
                        <div className="rounded-2xl rounded-tl-none bg-zinc-900/60 border border-zinc-800/80 px-4 py-3 text-zinc-400 text-xs flex items-center gap-2">
                          <RefreshCw size={12} className="animate-spin text-[#caa24c]" />
                          <span>Querying database...</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <div ref={messagesEndRef} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Input */}
        <div className="border-t border-[#caa24c]/10 bg-zinc-950/60 p-3">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 px-0.5">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1 text-[10px] text-[color:var(--portal-text)] shadow-xs">
                  {att.dataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={att.dataUrl} alt={att.name} className="h-4 w-4 rounded object-cover" />
                  ) : (
                    <FileText size={12} className="text-[#caa24c]" />
                  )}
                  <span className="max-w-[120px] truncate font-medium">{att.name}</span>
                  <button type="button" onClick={() => removeAttachment(att.id)} className="text-[color:var(--portal-muted)] hover:text-rose-400 transition-colors ml-0.5 cursor-pointer">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form 
            onSubmit={(e) => {
              e.preventDefault()
              handleSend(input)
            }}
            className="relative flex items-center rounded-xl border border-zinc-800 bg-[#050505] px-3 py-1.5 focus-within:border-[#caa24c]/40 transition-colors"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*,.pdf,.txt,.csv" 
              multiple 
              className="hidden" 
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or document"
              className="mr-2 text-zinc-500 hover:text-[#caa24c] transition-colors p-1 rounded-md cursor-pointer"
            >
              <Paperclip size={14} />
            </button>

            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? 'Listening to your voice...' : 'Type a message or ask Elena anything...'}
              className="portal-input-transparent flex-1 bg-transparent py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
              disabled={isLoading}
            />

            <button
              type="button"
              onClick={toggleVoiceDictation}
              title={isListening ? 'Stop dictation' : 'Voice dictation'}
              className={`mx-1 p-1.5 rounded-lg transition-all cursor-pointer ${
                isListening
                  ? 'text-[#caa24c] animate-pulse ring-1 ring-[#caa24c]/50 bg-[#caa24c]/15'
                  : 'text-zinc-500 hover:text-[#caa24c]'
              }`}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button 
              type="submit" 
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className="ml-1 rounded-lg bg-[#caa24c]/10 border border-[#caa24c]/20 p-1.5 text-[#caa24c] hover:bg-[#caa24c]/20 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="mt-1.5 text-[9px] text-center text-zinc-650 flex items-center justify-center gap-1">
            <Info size={9} />
            Queries run securely on the server with owner authorization.
          </p>
        </div>
      </div>
    </motion.aside>
  )
}

function ElenaContactCard({ payload }: { payload: LeadContactCardPayload }) {
  const detailLine = [
    payload.eventType,
    payload.guestCount ? `${payload.guestCount} guests` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="ml-8 mt-3 w-[calc(88%-2rem)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <PortalContactAvatar name={payload.clientName} size="md" className="shrink-0 border-[#caa24c]/35 bg-[#caa24c]/10 text-[#a8792f] dark:text-[#f1d27a]" />
          <div className="min-w-0">
            <h4 className="truncate text-xs font-semibold text-[color:var(--portal-text)]">{payload.clientName}</h4>
            <p className="text-[10px] text-[color:var(--portal-muted)]">Contact card · opened in CRM</p>
          </div>
        </div>
        {payload.status && <span className="shrink-0 rounded-full border border-[#caa24c]/25 bg-[#caa24c]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#a8792f] dark:text-[#f1d27a]">{payload.status.replace(/_/g, ' ')}</span>}
      </div>
      <div className="space-y-2.5 p-4 text-[11px] text-[color:var(--portal-muted)]">
        {payload.email && <p className="truncate">{payload.email}</p>}
        {payload.phone && <p>{payload.phone}</p>}
        {detailLine && <p>{detailLine}</p>}
        {payload.targetDate && <p className="flex items-center gap-1.5"><CalendarDays size={12} className="text-[#caa24c]" /> {payload.targetDate}</p>}
        <Link href={`/portal/leads/${payload.inquiryId}`} className="inline-flex items-center gap-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-[#a8792f] transition-colors hover:text-[#caa24c] dark:text-[#f1d27a] dark:hover:text-white">
          View contact <ExternalLink size={11} />
        </Link>
      </div>
    </div>
  )
}

function ElenaTourInviteCard({ payload, onSuccess }: { payload: TourInviteCardPayload; onSuccess: (message: string) => void }) {
  const [tourDate, setTourDate] = useState(payload.tourDate)
  const [tourTime, setTourTime] = useState(payload.tourTime)
  const [meetingType, setMeetingType] = useState(payload.meetingType || 'Private Venue Tour')
  const [durationMinutes, setDurationMinutes] = useState(String(payload.durationMinutes || 60))
  const [clientFacingNotes, setClientFacingNotes] = useState(payload.clientFacingNotes)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingItems = [
    !payload.clientEmail ? 'client email' : null,
    !tourDate ? 'tour date' : null,
    !tourTime ? 'start time' : null,
  ].filter(Boolean) as string[]

  const handleSend = async () => {
    if (missingItems.length > 0 || isSending) return
    setIsSending(true)
    setError(null)

    try {
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inquiryId: payload.inquiryId,
          action: 'schedule-tour',
          tourDate,
          tourTime,
          meetingType,
          durationMinutes: Number(durationMinutes),
          clientFacingNotes,
        }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; reminderJobs?: unknown[] }
      if (!response.ok) throw new Error(result.error || 'The invite could not be sent.')
      onSuccess(`Tour invite sent to ${payload.clientName}. The calendar invite and branded confirmation are on their way${result.reminderJobs?.length ? `, with ${result.reminderJobs.length} reminder${result.reminderJobs.length === 1 ? '' : 's'} queued` : ''}.`)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The invite could not be sent.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="ml-8 mt-3 w-[calc(88%-2rem)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-lg shadow-black/10">
      <div className="flex items-start gap-2.5 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
        <CalendarDays size={15} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-[color:var(--portal-text)]">Send tour invite</h4>
          <p className="mt-0.5 truncate text-[10px] text-[color:var(--portal-muted)]">{payload.clientName}{payload.clientEmail ? ` · ${payload.clientEmail}` : ' · email needed first'}</p>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Date</label>
            <PortalDatePicker value={tourDate} onChange={setTourDate} className="!min-w-0 w-full [&>button]:min-h-9 [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:text-[10px]" placeholder="Choose date" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Time</label>
            <PortalSelect value={tourTime} onChange={setTourTime} className="!min-w-0 w-full" buttonClassName="min-h-9 px-2.5 py-1.5 text-[10px]" placeholder="Choose time" options={TOUR_TIME_OPTIONS} />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Meeting</label>
            <PortalSelect value={meetingType} onChange={setMeetingType} className="!min-w-0 w-full" buttonClassName="min-h-9 px-2.5 py-1.5 text-[10px]" options={TOUR_MEETING_TYPE_OPTIONS} />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Length</label>
            <PortalSelect value={durationMinutes} onChange={setDurationMinutes} className="!min-w-0 w-full" buttonClassName="min-h-9 px-2.5 py-1.5 text-[10px]" options={TOUR_DURATION_OPTIONS} />
          </div>
        </div>

        <textarea value={clientFacingNotes} onChange={(event) => setClientFacingNotes(event.target.value)} rows={2} maxLength={2000} placeholder="Client-safe tour details (optional)" className="w-full resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] leading-4 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50" />

        {missingItems.length > 0 ? (
          <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-800 dark:text-amber-200">Still needed: {missingItems.join(', ')}.</p>
        ) : null}
        {error ? <p className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-[10px] leading-4 text-rose-700 dark:text-rose-200">{error}</p> : null}

        <button type="button" onClick={handleSend} disabled={isSending || missingItems.length > 0} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#caa24c] px-3 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:bg-[color:var(--portal-soft)] disabled:text-[color:var(--portal-muted)]">
          {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {isSending ? 'Sending invite…' : 'Send invite'}
        </button>
      </div>
    </div>
  )
}

const TOUR_TIME_OPTIONS = Array.from({ length: 19 }, (_, index) => {
  const hour = index + 8
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return { value: `${displayHour}:00 ${suffix}`, label: `${displayHour}:00 ${suffix}` }
})

const TOUR_MEETING_TYPE_OPTIONS = [
  { value: 'Private Venue Tour', label: 'Private Venue Tour' },
  { value: 'Wedding Walkthrough', label: 'Wedding Walkthrough' },
  { value: 'Quinceañera Walkthrough', label: 'Quinceañera Walkthrough' },
  { value: 'Event Planning Consultation', label: 'Event Planning Consultation' },
  { value: 'Vendor Walkthrough', label: 'Vendor Walkthrough' },
]

const TOUR_DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '90', label: '90 minutes' },
]

/* Local formatting helper function */
function renderFormattedContent(content: string) {
  if (content.includes('|') && content.includes('\n|')) {
    const lines = content.split('\n')
    const tableHtml: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[][] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true
          tableRows = []
        }
        const cols = line.split('|').map(c => c.trim()).slice(1, -1)
        if (cols.every(c => /^:-*|-*:-*|-*:$/.test(c))) {
          continue
        }
        tableRows.push(cols)
      } else {
        if (inTable) {
          tableHtml.push(renderTable(tableRows, i))
          inTable = false
        }
        if (line) {
          tableHtml.push(<p key={i} className="mb-2 text-sm leading-relaxed">{renderBoldAndLinks(line)}</p>)
        }
      }
    }
    if (inTable) {
      tableHtml.push(renderTable(tableRows, lines.length))
    }
    return <div>{tableHtml}</div>
  }

  return content.split('\n').map((line, idx) => {
    if (!line.trim()) return <div key={idx} className="h-2" />
    return <p key={idx} className="mb-2 text-sm leading-relaxed">{renderBoldAndLinks(line)}</p>
  })
}

function renderTable(rows: string[][], keyIndex: number) {
  if (rows.length === 0) return null
  const headers = rows[0]
  const bodyRows = rows.slice(1)
  return (
    <div key={keyIndex} className="my-3 overflow-x-auto rounded-lg border border-[#caa24c]/10 bg-[#050505] portal-scrollbar">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#caa24c]/10 bg-[#caa24c]/5 font-serif text-[#f1d27a]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {bodyRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-[#caa24c]/2 text-zinc-350">
              {row.map((col, cIdx) => (
                <td key={cIdx} className="px-3 py-2 whitespace-nowrap">{col}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderBoldAndLinks(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-[#caa24c]">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
