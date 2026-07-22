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
  Check
} from 'lucide-react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { PortalCloseButton } from './PortalUI'

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

function getSuggestionsForPath(path: string) {
  if (path.startsWith('/portal/leads')) {
    return [
      'List details of the last 3 inquiries',
      'Show recent follow-up notes',
      'Check active leads pipeline stage'
    ]
  }
  if (path.startsWith('/portal/calendar') || path.startsWith('/portal/events')) {
    return [
      'Show upcoming bookings for this month',
      'Are there any tours scheduled this week?',
      'Show completed events this year'
    ]
  }
  if (path.startsWith('/portal/finances') || path.startsWith('/portal/invoices')) {
    return [
      'What is our total revenue from invoices?',
      'Find all unpaid or overdue bills',
      'List recent bookings and expenses'
    ]
  }
  if (path.startsWith('/portal/marketing')) {
    return [
      'List our marketing campaigns',
      'Show open rates of email campaigns',
      'Check marketing list subscriber count'
    ]
  }
  if (path.startsWith('/portal/operations')) {
    return [
      'Show inventory items that are Low or Out of Stock',
      'Check active cleaning logs',
      'List pending operations tasks'
    ]
  }
  return [
    'Show upcoming bookings',
    'Check active venue inquiries',
    'List tasks due this week'
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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey bestie! 💕 Your COO, CFO, Marketing guru, and business mentor is in the house. I've got full access to our Luxor database, so whether you want to crunch numbers, check leads, brainstorm marketing ideas, or get some operations advice, I've got your back. What are we tackling today?"
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sessions History States
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [showSessionsList, setShowSessionsList] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState('')

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen])

  useEffect(() => {
    if (isOpen) {
      loadSessionsList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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
        // Only load messages if we switch to a different active session or initializing
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
      setMessages(data.messages)
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
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadSession = (sessionId: string) => {
    setCurrentSessionId(sessionId)
    loadSessionMessages(sessionId)
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
          loadSessionMessages(remaining[0].id)
        } else {
          handleCreateSession()
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    const userMessage = textToSend.trim()
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
      }
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries,
          confirmation: data.confirmation
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

  return (
    <motion.aside 
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[#caa24c]/10 bg-[#050505] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]"
    >
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#caa24c]/10 px-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-full border border-[#caa24c]/30 ring-2 ring-[#caa24c]/10">
            <Image 
              src="/luxor-concierge.png" 
              alt="Elena Assistant" 
              fill 
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
            className="rounded-lg border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white p-1.5 transition-colors cursor-pointer"
            title="Start New Chat Session"
            aria-label="Start New Chat Session"
          >
            <Plus size={16} />
          </button>
          <button 
            type="button"
            onClick={() => setShowSessionsList(curr => !curr)}
            className={`rounded-lg border p-1.5 transition-colors cursor-pointer ${
              showSessionsList 
                ? 'border-[#caa24c]/35 bg-[#caa24c]/5 text-[#f1d27a]' 
                : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white'
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
              className="absolute inset-0 z-20 flex flex-col bg-[#050505] p-4 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-550">Chat Sessions</h4>
                <button
                  type="button"
                  onClick={handleCreateSession}
                  className="inline-flex items-center gap-1.5 rounded bg-[#caa24c] hover:bg-[#f1d27a] text-black px-2.5 py-1 text-[10px] font-black uppercase cursor-pointer transition-all"
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
                            className="text-zinc-500 hover:text-[#caa24c] p-1 rounded hover:bg-zinc-900 cursor-pointer"
                            title="Rename Session"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-900 cursor-pointer"
                            title="Delete Session"
                          >
                            <Trash2 size={12} />
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
        <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
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
                      <Image src="/luxor-concierge.png" alt="Elena" fill className="object-cover" />
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
                          className="rounded bg-[#caa24c] hover:bg-[#f1d27a] text-[#050505] px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer"
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
                  <Image src="/luxor-concierge.png" alt="Elena" fill className="object-cover" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-zinc-900/60 border border-zinc-800/80 px-4 py-3 text-zinc-400 text-xs flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin text-[#caa24c]" />
                  <span>Querying database...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested prompts */}
        {messages.length === 1 && (
          <div className="border-t border-[#caa24c]/5 p-3 space-y-1.5 bg-[#050505]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-550 px-1">Suggested Requests</p>
            <div className="flex flex-wrap gap-1.5">
              {pathSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(s)}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-left text-xs text-zinc-450 hover:border-[#caa24c]/20 hover:bg-[#caa24c]/2 hover:text-[#f1d27a] transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-[#caa24c]/10 bg-zinc-950/80 p-3">
          <form 
            onSubmit={(e) => {
              e.preventDefault()
              handleSend(input)
            }}
            className="relative flex items-center rounded-xl border border-zinc-800 bg-[#050505] px-3 py-1.5 focus-within:border-[#caa24c]/30"
          >
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Elena to query or update something..."
              className="portal-input-transparent flex-1 bg-transparent py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="ml-2 rounded-lg bg-[#caa24c]/10 border border-[#caa24c]/20 p-1.5 text-[#caa24c] hover:bg-[#caa24c]/20 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Send size={14} />
            </button>
          </form>
          <p className="mt-1.5 text-[9px] text-center text-zinc-650 flex items-center justify-center gap-1">
            <Info size={9} />
            Queries will run securely on the server with owner authorization.
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
