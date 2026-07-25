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
  BrainCircuit,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  Compass,
  ArrowRight
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { PortalCloseButton } from './PortalUI'
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

function getContextLabelForPath(path: string) {
  if (path.match(/\/portal\/leads\/([a-f0-9-]{36})/)) return 'Lead Dossier Context'
  if (path.startsWith('/portal/leads')) return 'Leads Pipeline Context'
  if (path.startsWith('/portal/calendar') || path.startsWith('/portal/events')) return 'Calendar & Schedule'
  if (path.startsWith('/portal/finances') || path.startsWith('/portal/invoices')) return 'Finances & Invoices'
  if (path.startsWith('/portal/marketing')) return 'Marketing & Campaigns'
  if (path.startsWith('/portal/operations')) return 'Operations & Inventory'
  if (path.startsWith('/portal/communications') || path.startsWith('/portal/messages')) return 'Communications Inbox'
  return 'Venue Assistant'
}

function getQuickPillsForPath(path: string) {
  if (path.match(/\/portal\/leads\/([a-f0-9-]{36})/)) {
    return [
      'Draft follow-up email for this client',
      'Send agreement signature link',
      'Create follow-up task',
      'Summarize client notes'
    ]
  }
  if (path.startsWith('/portal/leads')) {
    return [
      'Show new inquiries this week',
      'Check active leads pipeline stage',
      'List leads awaiting proposals',
      'Recent client activity'
    ]
  }
  if (path.startsWith('/portal/calendar') || path.startsWith('/portal/events')) {
    return [
      'Show upcoming bookings this month',
      'Are there tours scheduled this week?',
      'Check venue date availability',
      'Show completed events this year'
    ]
  }
  if (path.startsWith('/portal/finances') || path.startsWith('/portal/invoices')) {
    return [
      'What is our total revenue from invoices?',
      'Find all unpaid or overdue bills',
      'List recent bookings & deposits',
      'Show unpaid invoice totals'
    ]
  }
  if (path.startsWith('/portal/marketing')) {
    return [
      'List marketing campaigns',
      'Draft email campaign with Elena',
      'Show email open rates',
      'Check subscriber list count'
    ]
  }
  if (path.startsWith('/portal/operations')) {
    return [
      'Show low or out of stock inventory',
      'Check active cleaning logs',
      'List pending operations tasks',
      'Show venue bills due'
    ]
  }
  return [
    'Show upcoming bookings',
    'Check active venue inquiries',
    'List tasks due this week',
    'Total revenue this month'
  ]
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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sessions History States
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [showSessionsList, setShowSessionsList] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState('')

  const [smartSuggestions, setSmartSuggestions] = useState<string[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)

  const contextLabel = getContextLabelForPath(activePath)
  const quickPills = getQuickPillsForPath(activePath)

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
      loadSmartSuggestions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isOpen, activePath])

  useEffect(() => {
    if (isOpen) {
      loadSessionsList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice dictation is not supported in your browser.')
      return
    }

    if (isListening) {
      setIsListening(false)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onstart = () => setIsListening(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((result: any) => result[0].transcript)
          .join('')
        setInput(transcript)
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)

      recognition.start()
    } catch (err) {
      console.error('Speech recognition error:', err)
      setIsListening(false)
    }
  }

  const loadSmartSuggestions = async () => {
    setIsLoadingSuggestions(true)
    setSmartSuggestions([])
    try {
      const res = await fetch(`/api/portal/elena-chat/suggestions?activePath=${encodeURIComponent(activePath)}`)
      if (res.ok) {
        const data = (await res.json()) as { suggestions?: string[] }
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
    try {
      const response = await fetch('/api/portal/elena-chat/sessions')
      if (!response.ok) throw new Error('Failed to load sessions list')
      const data = (await response.json()) as ChatSession[]
      setSessions(data)

      if (data.length > 0) {
        const targetId = selectSessionId || currentSessionId || data[0].id
        if (targetId !== currentSessionId || messages.length <= 1) {
          setCurrentSessionId(targetId)
          loadSessionMessages(targetId)
        }
      } else {
        handleCreateSession()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const loadSessionMessages = async (sessionId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/portal/elena-chat/sessions?id=${sessionId}`)
      if (!response.ok) throw new Error('Failed to load messages')
      const data = (await response.json()) as { messages: Message[] }
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
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSession = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to create session')
      const newSession = (await response.json()) as { id: string; title: string; messages: Message[] }
      
      setSessions(prev => [{
        id: newSession.id,
        title: newSession.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, ...prev])
      setCurrentSessionId(newSession.id)
      setMessages(newSession.messages)
      setShowSessionsList(false)
    } catch (err) {
      console.error(err)
    } fontally {
      setIsLoading(false)
    }
  }

  const handleLoadSession = (sessionId: string) => {
    setCurrentSessionId(sessionId)
    loadSessionMessages(sessionId)
    setShowSessionsList(false)
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(`/api/portal/elena-chat/sessions?id=${sessionId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete session')

      const remaining = sessions.filter(s => s.id !== sessionId)
      setSessions(remaining)
      if (currentSessionId === sessionId) {
        if (remaining.length > 0) {
          handleLoadSession(remaining[0].id)
        } else {
          handleCreateSession()
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sessionId, title: newTitle.trim() })
      })
      if (!response.ok) throw new Error('Failed to rename session')

      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: newTitle.trim() } : s))
      setEditingSessionId(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleConfirmAction = async (msgIndex: number) => {
    const targetMsg = messages[msgIndex]
    if (!targetMsg || !targetMsg.confirmation) return

    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    setIsLoading(true)

    try {
      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: messages.map(msg => ({ role: msg.role, content: msg.content })),
          activePath,
          confirmQuery: targetMsg.confirmation.query,
          chatId: currentSessionId || undefined
        }),
      })

      if (!response.ok) throw new Error('Failed to execute confirmed action')

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
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry bestie! Something went wrong executing that confirmed action.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelAction = (msgIndex: number) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isCancelled: true } : m))
  }

  const handleSend = async (textToSend?: string) => {
    const userMessage = (textToSend || input).trim()
    if (!userMessage || isLoading) return

    setInput('')
    
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
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
      }

      if (data.textCampaignDraft) {
        window.localStorage.setItem('luxor_elena_text_campaign_draft', JSON.stringify(data.textCampaignDraft))
        window.dispatchEvent(new CustomEvent('luxor:text-campaign-draft', { detail: data.textCampaignDraft }))
      }
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries,
          confirmation: data.confirmation,
          emailDraft: data.emailDraft,
          crmUpdateCard: data.crmUpdateCard,
          contractCard: data.contractCard,
          invoiceCard: data.invoiceCard,
          taskCard: data.taskCard
        }
      ])

      // Auto update session list
      if (currentSessionId) {
        loadSessionsList(currentSessionId)
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "Sorry bestie! I couldn't reach the server. Please check your connection and try again."
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <motion.aside
      initial={{ opacity: 0, x: 300, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#caa24c]/10 bg-[#050505] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[440px]"
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#caa24c]/10 px-4 bg-[#080605]">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full border border-[#caa24c]/30 ring-2 ring-[#caa24c]/10 shrink-0">
            <Image 
              src="/luxor-concierge.png" 
              alt="Elena Assistant" 
              fill 
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base font-medium leading-none text-zinc-200 truncate">Elena AI</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#caa24c]/30 bg-[#caa24c]/10 px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-[#f1d27a]">
                <Sparkles size={9} /> {contextLabel}
              </span>
            </div>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Screen Context Engaged
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            type="button"
            onClick={handleCreateSession}
            className="rounded-lg p-1.5 text-zinc-500 hover:text-white transition-all cursor-pointer hover:bg-zinc-900"
            title="Start New Chat Session"
          >
            <Plus size={16} />
          </button>
          <button 
            type="button"
            onClick={() => setShowSessionsList(curr => !curr)}
            className={`rounded-lg p-1.5 transition-all cursor-pointer ${
              showSessionsList 
                ? 'bg-[#caa24c]/15 text-[#f1d27a]' 
                : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
            }`}
            title="Chat History Sessions"
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
              className="absolute inset-0 z-20 flex flex-col bg-[#050505] p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Chat Sessions</h4>
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
                  <p className="text-xs text-zinc-500 text-center py-6">No chat sessions found bestie! 💕</p>
                ) : (
                  sessions.map((session) => (
                    <div 
                      key={session.id}
                      className={`group flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                        currentSessionId === session.id
                          ? 'border-[#caa24c]/30 bg-[#caa24c]/5'
                          : 'border-zinc-900 bg-zinc-950/40 hover:border-zinc-800 hover:bg-zinc-950/80'
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
                            <button type="submit" className="text-emerald-400 hover:text-emerald-300 p-0.5 cursor-pointer">
                              <Check size={13} />
                            </button>
                            <button 
                              type="button" 
                              onClick={() => setEditingSessionId(null)}
                              className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
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
                        <span className="text-[9px] text-zinc-500 block mt-1 font-mono">
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
                            className="rounded-lg p-1 text-zinc-500 hover:text-[#f1d27a] cursor-pointer"
                            title="Rename Session"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="rounded-lg p-1 text-zinc-500 hover:text-rose-400 cursor-pointer"
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

        {/* Message Thread */}
        <div className="portal-scrollbar flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div layout className="space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-5">
                  <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-[#caa24c]/40 p-1 shadow-xl shadow-[#caa24c]/10">
                    <Image src="/luxor-concierge.png" alt="Elena" fill sizes="64px" className="object-cover rounded-full" />
                  </div>

                  <div className="space-y-1 max-w-xs">
                    <h4 className="font-serif text-lg font-semibold text-[#f1d27a]">Hey bestie! I&apos;m Elena 💕</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      I&apos;m fully locked onto your <span className="text-[#f1d27a] font-bold">{contextLabel}</span> screen. Ask me anything or pick a quick action below!
                    </p>
                  </div>

                  {/* AI Smart Dynamic Cycling Suggestions */}
                  <div className="w-full space-y-2 pt-2 text-left">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#caa24c]">
                        <BrainCircuit size={12} className="text-[#caa24c]" />
                        Suggested Actions
                      </span>
                      {isLoadingSuggestions ? (
                        <span className="flex items-center gap-1 text-[9px] text-zinc-500">
                          <Loader2 size={10} className="animate-spin text-[#caa24c]" /> Thinking...
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={loadSmartSuggestions}
                          className="flex items-center gap-1 text-[9px] text-zinc-400 hover:text-[#caa24c] transition-colors cursor-pointer"
                          title="Refresh prompt suggestions"
                        >
                          <RefreshCw size={10} />
                          <span>Cycle Prompts</span>
                        </button>
                      )}
                    </div>

                    <div className="grid gap-2">
                      {(smartSuggestions.length > 0 ? smartSuggestions : quickPills).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSend(suggestion)}
                          className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 text-left text-xs text-zinc-300 hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 hover:text-white transition-all cursor-pointer group shadow-sm"
                        >
                          <span className="line-clamp-2 leading-snug">{suggestion}</span>
                          <ArrowRight size={13} className="shrink-0 text-zinc-500 group-hover:text-[#caa24c] transition-colors ml-2" />
                        </button>
                      ))}
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
                          initial={{ opacity: 0, y: 20, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.3 }}
                          className={`flex items-start gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                              <Image src="/luxor-concierge.png" alt="Elena" fill sizes="24px" className="object-cover" />
                            </div>
                          )}
                          <div 
                            className={`rounded-2xl px-4 py-2.5 shadow-sm text-xs border ${
                              msg.role === 'user'
                                ? 'rounded-tr-none bg-[#caa24c]/15 border-[#caa24c]/30 text-white'
                                : 'rounded-tl-none bg-zinc-900/80 border-zinc-800 text-zinc-200'
                            }`}
                          >
                            {renderFormattedContent(msg.content)}
                          </div>
                        </motion.div>

                        {/* Database Query Audit Pill */}
                        {msg.executedQueries && msg.executedQueries.length > 0 && (
                          <div className="mt-1.5 ml-8 space-y-1">
                            {msg.executedQueries.map((q, qIdx) => (
                              <div key={qIdx} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-mono text-emerald-300">
                                <Check size={10} className="text-emerald-400" />
                                {getQueryIndicatorText(q.query)}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Interactive CRM Action Cards */}
                        {msg.emailDraft && (
                          <div className="mt-2 ml-8 w-full max-w-md">
                            <ElenaEmailDraftCard payload={msg.emailDraft} />
                          </div>
                        )}
                        {msg.crmUpdateCard && (
                          <div className="mt-2 ml-8 w-full max-w-md">
                            <ElenaLeadUpdateCard payload={msg.crmUpdateCard} />
                          </div>
                        )}
                        {msg.contractCard && (
                          <div className="mt-2 ml-8 w-full max-w-md">
                            <ElenaContractCard payload={msg.contractCard} />
                          </div>
                        )}
                        {msg.invoiceCard && (
                          <div className="mt-2 ml-8 w-full max-w-md">
                            <ElenaInvoiceCard payload={msg.invoiceCard} />
                          </div>
                        )}
                        {msg.taskCard && (
                          <div className="mt-2 ml-8 w-full max-w-md">
                            <ElenaTaskCard payload={msg.taskCard} />
                          </div>
                        )}

                        {/* Confirmation Request Pill */}
                        {msg.confirmation && !msg.isConfirmed && !msg.isCancelled && (
                          <div className="mt-2 ml-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">User Confirmation Required</p>
                            <p className="text-xs text-amber-100">{msg.confirmation.summary}</p>
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleConfirmAction(index)}
                                className="rounded-lg bg-[#caa24c] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#dfbd68] cursor-pointer"
                              >
                                Confirm & Execute
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelAction(index)}
                                className="rounded-lg border border-zinc-700 bg-black px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-2 max-w-[80%]"
                      >
                        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                          <Image src="/luxor-concierge.png" alt="Elena" fill sizes="24px" className="object-cover" />
                        </div>
                        <div className="rounded-2xl rounded-tl-none bg-zinc-900/80 border border-zinc-800 px-4 py-2.5 text-zinc-400 text-xs flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin text-[#caa24c]" />
                          <span>Elena is reasoning with screen context...</span>
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

        {/* Quick Context Action Pills above Input */}
        {messages.length > 0 && (
          <div className="px-3 pt-2 border-t border-zinc-900 bg-[#070504] flex items-center gap-1.5 overflow-x-auto portal-scrollbar pb-1">
            <span className="text-[8.5px] font-black uppercase tracking-wider text-[#caa24c] shrink-0 flex items-center gap-1">
              <Compass size={10} /> Quick Actions:
            </span>
            {quickPills.slice(0, 3).map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => handleSend(pill)}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-[9.5px] text-zinc-300 hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 hover:text-white transition-all cursor-pointer"
              >
                {pill}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[#caa24c]/10 bg-zinc-950/80 p-3">
          <form 
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className={`relative flex items-center rounded-xl border px-3 py-1.5 transition-all ${
              isListening
                ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20'
                : 'border-zinc-800 bg-[#050505] focus-within:border-[#caa24c]/40'
            }`}
          >
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? 'Listening to speech...' : `Ask Elena anything about ${contextLabel}...`}
              className="portal-input-transparent flex-1 bg-transparent py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
              disabled={isLoading}
            />

            {/* Voice Dictation Button */}
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={`mr-1 rounded-lg p-1.5 transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'text-zinc-500 hover:text-[#caa24c]'
              }`}
              title={isListening ? 'Stop Listening' : 'Voice Dictation'}
            >
              {isListening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="rounded-lg bg-[#caa24c] p-1.5 text-white hover:bg-[#dfbd68] disabled:opacity-30 disabled:hover:bg-[#caa24c] cursor-pointer transition-all active:scale-95"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="mt-1.5 text-[9px] text-center text-zinc-500 flex items-center justify-center gap-1 font-mono">
            <Info size={9} />
            Context engaged: {contextLabel}
          </p>
        </div>
      </div>
    </motion.aside>
  )
}

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
          tableHtml.push(<p key={i} className="mb-2 text-xs leading-relaxed">{renderBoldAndLinks(line)}</p>)
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
    return <p key={idx} className="mb-2 text-xs leading-relaxed">{renderBoldAndLinks(line)}</p>
  })
}

function renderTable(rows: string[][], keyIndex: number) {
  if (rows.length === 0) return null
  const headers = rows[0]
  const bodyRows = rows.slice(1)
  return (
    <div key={keyIndex} className="my-3 overflow-x-auto rounded-lg border border-[#caa24c]/10 bg-[#050505] portal-scrollbar">
      <table className="w-full text-left border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-[#caa24c]/10 bg-[#caa24c]/5 font-serif text-[#f1d27a]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">
          {bodyRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-[#caa24c]/5 text-zinc-300">
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
  // Regex to split by markdown bold **text** or markdown links [label](url)
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-[#f1d27a]">{part.slice(2, -2)}</strong>
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      const label = linkMatch[1]
      const href = linkMatch[2]
      return (
        <Link
          key={idx}
          href={href}
          className="inline-flex items-center gap-1 font-bold text-[#f1d27a] hover:underline underline-offset-2"
        >
          {label}
        </Link>
      )
    }
    return part
  })
}
