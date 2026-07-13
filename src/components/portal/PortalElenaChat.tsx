'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { 
  X, 
  Send, 
  Info,
  RefreshCw,
  Mail,
  RotateCcw,
  Sparkles,
  LayoutTemplate
} from 'lucide-react'
import { useToast } from '@/components/portal/ToastProvider'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

type ExecutedQuery = {
  query: string
  result: unknown
}

type EmailDraft = {
  to: string
  subject: string
  body: string
  recipient_name?: string
}

type CampaignDraft = {
  name: string
  subject: string
  audienceLabel: string
  blocks: { type: string; headline?: string; label?: string; content?: string }[]
  scheduledFor?: string | null
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  executedQueries?: ExecutedQuery[]
  confirmation?: {
    query: string
    summary: string
  }
  emailDraft?: EmailDraft
  campaignDraft?: CampaignDraft
  isConfirmed?: boolean
  isCancelled?: boolean
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
  const reduceMotion = useReducedMotion()
  const { notify } = useToast()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey bestie! 💕 Your COO, CFO, Marketing guru, and business mentor is in the house. I've got full access to our Luxor database, so whether you want to crunch numbers, check leads, brainstorm marketing ideas, or get some operations advice, I've got your back. What are we tackling today?"
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [reduceMotion])

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(scrollToBottom)
      return () => cancelAnimationFrame(frame)
    }
  }, [messages, isOpen, scrollToBottom])

  const handleSend = useCallback(async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    const userMessage = textToSend.trim()
    setInput('')
    
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(updatedMessages)
    setIsLoading(true)

    // Set campaign generation loading state in localStorage for other tabs
    localStorage.setItem('elena_campaign_generation_state', JSON.stringify({ status: 'generating', prompt: userMessage, timestamp: Date.now() }))
    window.dispatchEvent(new Event('elena-generation-state-change'))

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
          activePath
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()
      
      // Detect if the confirmation payload is actually an email draft or campaign draft
      let emailDraft: EmailDraft | undefined
      let campaignDraft: CampaignDraft | undefined
      let rawConfirmation = data.confirmation
      if (rawConfirmation?.query) {
        try {
          const parsed = JSON.parse(rawConfirmation.query)
          if (parsed.__emailDraft) {
            emailDraft = { to: parsed.to, subject: parsed.subject, body: parsed.body, recipient_name: parsed.recipient_name }
            rawConfirmation = undefined
          } else if (parsed.__campaignDraft) {
            campaignDraft = { 
              name: parsed.name, 
              subject: parsed.subject, 
              audienceLabel: parsed.audienceLabel, 
              blocks: parsed.blocks, 
              scheduledFor: parsed.scheduledFor 
            }
            rawConfirmation = undefined
          }
        } catch { /* not JSON, treat as SQL */ }
      }

      // If the chat widget is closed, trigger a toast notification
      if (!isOpen && (campaignDraft || emailDraft || rawConfirmation)) {
        notify({
          title: 'Elena finished drafting! ✦',
          description: campaignDraft 
            ? `Campaign "${campaignDraft.name}" is ready for approval.` 
            : 'A message is ready for your review in Elena Chat.',
          variant: 'success'
        })
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries,
          confirmation: rawConfirmation,
          emailDraft,
          campaignDraft
        }
      ])
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
      localStorage.removeItem('elena_campaign_generation_state')
      window.dispatchEvent(new Event('elena-generation-state-change'))
      setIsLoading(false)
    }
  }, [activePath, isLoading, messages])

  const handleConfirmAction = useCallback(async (msgIndex: number, confirmation: { query: string; summary: string }) => {
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
          confirmSummary: confirmation.summary
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to execute confirm query')
      }

      const data = await response.json()

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
          content: 'I ran into an issue executing the action bestie! Please double-check lead/booking locks or database logs.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }, [activePath, messages])

  const handleCancelAction = useCallback((msgIndex: number) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isCancelled: true } : m))
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: 'No worries bestie! 💁‍♀️ I cancelled the action. Nothing was modified!'
      }
    ])
  }, [])

  const handleSendEmail = useCallback(async (msgIndex: number, draft: EmailDraft) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    setIsLoading(true)

    try {
      const apiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, activePath, confirmEmail: draft }),
      })

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { role: 'assistant', content: 'I had trouble sending that email bestie. Please check the mail config and try again.' }])
    } finally {
      setIsLoading(false)
    }
  }, [activePath, messages])

  const handleRepromptEmail = useCallback((msgIndex: number, draft: EmailDraft) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isCancelled: true } : m))
    const reprompt = `Please revise the email draft you just wrote to ${draft.recipient_name || draft.to}. Here is what needs to change: `
    setInput(reprompt)
  }, [])

  const handleConfirmCampaign = useCallback(async (msgIndex: number, draft: CampaignDraft) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    setIsLoading(true)

    localStorage.setItem('elena_campaign_generation_state', JSON.stringify({ status: 'executing', prompt: `Publishing campaign "${draft.name}"`, timestamp: Date.now() }))
    window.dispatchEvent(new Event('elena-generation-state-change'))

    try {
      const apiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, activePath, confirmCampaign: draft }),
      })

      const data = await response.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      window.dispatchEvent(new Event('elena-campaign-published'))
    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { role: 'assistant', content: 'I had trouble creating that campaign bestie. Please check target recipients and try again.' }])
    } finally {
      localStorage.removeItem('elena_campaign_generation_state')
      window.dispatchEvent(new Event('elena-generation-state-change'))
      setIsLoading(false)
    }
  }, [activePath, messages])

  const handleOpenInBuilder = useCallback((msgIndex: number, draft: CampaignDraft) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    localStorage.setItem('elena_active_campaign_draft', JSON.stringify(draft))
    if (activePath === '/portal/marketing') {
      window.dispatchEvent(new Event('elena-campaign-draft-loaded'))
      onClose()
      return
    }
    window.location.assign('/portal/marketing')
  }, [activePath, onClose])

  const handleRepromptCampaign = useCallback((msgIndex: number, draft: CampaignDraft) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isCancelled: true } : m))
    const reprompt = `Please revise the campaign draft "${draft.name}" with subject "${draft.subject}". Here is what needs to change: `
    setInput(reprompt)
  }, [])

  const pathSuggestions = useMemo(() => getSuggestionsForPath(activePath), [activePath])

  return (
    <motion.aside 
      initial={{ x: reduceMotion ? 0 : '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="fixed right-0 top-0 z-50 flex h-full w-full transform-gpu flex-col border-l border-[#caa24c]/10 bg-[#050505] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] sm:w-[420px]"
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
            <h3 className="font-serif text-base font-medium leading-none text-[#f7efe3]">Elena AI</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              CRM Intelligence Connected
            </span>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          aria-label="Close Elena Chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages Window */}
      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <motion.div
              key={index} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98, originX: msg.role === 'user' ? 1 : 0, originY: 1 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
                      ? 'rounded-tr-none bg-[#caa24c]/10 border-[#caa24c]/20 text-[#f7efe3]'
                      : 'rounded-tl-none bg-zinc-900/60 border-zinc-800/80 text-zinc-300'
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

              {/* Render Email Draft Preview Cards */}
              {msg.emailDraft && !msg.isConfirmed && !msg.isCancelled && (
                <div className="w-[88%] mt-3 pl-8">
                  <div className="rounded-xl border border-[#caa24c]/40 bg-[#0a0807] overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-[#caa24c]/20 bg-[#caa24c]/8 px-3.5 py-2.5">
                      <Mail size={13} className="text-[#caa24c] shrink-0" />
                      <p className="text-xs font-semibold text-[#f7efe3]">Email Draft — Review Before Sending</p>
                    </div>
                    <div className="p-3.5 space-y-2.5">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">To</p>
                        <p className="text-xs text-zinc-300 font-mono">{msg.emailDraft.recipient_name ? `${msg.emailDraft.recipient_name} <${msg.emailDraft.to}>` : msg.emailDraft.to}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Subject</p>
                        <p className="text-xs text-[#f7efe3] font-semibold">{msg.emailDraft.subject}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Body</p>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto portal-scrollbar">
                          {msg.emailDraft.body}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end border-t border-[#caa24c]/10 px-3.5 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleRepromptEmail(index, msg.emailDraft!)}
                        className="flex items-center gap-1.5 rounded border border-zinc-700 hover:border-[#caa24c]/30 bg-transparent hover:bg-[#caa24c]/5 text-zinc-400 hover:text-[#f1d27a] px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Reprompt
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEmail(index, msg.emailDraft!)}
                        className="flex items-center gap-1.5 rounded bg-[#caa24c] hover:bg-[#f1d27a] text-[#050505] px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        <Send size={11} />
                        Send Email
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {msg.emailDraft && msg.isConfirmed && (
                <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-green-500 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Email Sent ✉️
                </div>
              )}

              {msg.emailDraft && msg.isCancelled && (
                <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-zinc-500 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  Email Draft Dismissed — Reprompting...
                </div>
              )}

              {/* Render Campaign Draft Preview Cards */}
              {msg.campaignDraft && !msg.isConfirmed && !msg.isCancelled && (
                <div className="w-[88%] mt-3 pl-8">
                  <div className="rounded-xl border border-[#caa24c]/40 bg-[#0a0807] overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-[#caa24c]/20 bg-[#caa24c]/8 px-3.5 py-2.5">
                      <Sparkles size={13} className="text-[#caa24c] shrink-0" />
                      <p className="text-xs font-semibold text-[#f7efe3]">Campaign Draft — Review Details</p>
                    </div>
                    <div className="p-3.5 space-y-3">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Campaign Name</p>
                        <p className="text-xs text-[#f7efe3] font-semibold">{msg.campaignDraft.name}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Subject Line</p>
                        <p className="text-xs text-zinc-300">{msg.campaignDraft.subject}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Audience Filter</p>
                        <span className="inline-block rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300 font-mono">
                          {msg.campaignDraft.audienceLabel}
                        </span>
                      </div>
                      {msg.campaignDraft.scheduledFor && (
                        <div className="space-y-0.5">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Schedule For</p>
                          <p className="text-xs text-zinc-400 font-mono">{new Date(msg.campaignDraft.scheduledFor).toLocaleString()}</p>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#caa24c]/60">Blocks Preview</p>
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-[10px] max-h-32 overflow-y-auto portal-scrollbar space-y-1.5 text-zinc-400 font-mono">
                          {msg.campaignDraft.blocks.map((b, idx: number) => (
                            <div key={idx} className="flex gap-2 justify-between border-b border-zinc-900 pb-1">
                              <span className="text-[#f1d27a] font-bold uppercase">{b.type}</span>
                              <span className="truncate max-w-[150px]">{b.headline || b.label || b.content || ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-[#caa24c]/10 px-3.5 py-2.5 bg-zinc-950/30">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRepromptCampaign(index, msg.campaignDraft!)}
                          className="flex items-center gap-1 hover:border-[#caa24c]/30 rounded border border-zinc-700 bg-transparent text-zinc-400 hover:text-[#f1d27a] px-2.5 py-1 text-[9px] font-bold transition-colors cursor-pointer"
                        >
                          <RotateCcw size={10} />
                          Reprompt
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenInBuilder(index, msg.campaignDraft!)}
                          className="flex items-center gap-1 hover:border-[#caa24c]/30 rounded border border-zinc-700 bg-transparent text-zinc-400 hover:text-[#f1d27a] px-2.5 py-1 text-[9px] font-bold transition-colors cursor-pointer"
                        >
                          <LayoutTemplate size={10} />
                          Open in Builder
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleConfirmCampaign(index, msg.campaignDraft!)}
                        className="flex items-center justify-center gap-1.5 w-full rounded bg-[#caa24c] hover:bg-[#f1d27a] text-[#050505] py-2 text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        <Send size={10} />
                        {msg.campaignDraft.scheduledFor ? 'Approve & Schedule' : 'Approve & Send Now'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {msg.campaignDraft && msg.isConfirmed && (
                <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-green-500 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Campaign Approved & Published ✦
                </div>
              )}

              {msg.campaignDraft && msg.isCancelled && (
                <div className="w-[88%] mt-2.5 pl-8 text-[10px] text-zinc-500 font-medium flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  Campaign Draft Dismissed — Reprompting...
                </div>
              )}

              {/* Render Direct Action Confirmation Cards */}
              {msg.confirmation && !msg.isConfirmed && !msg.isCancelled && (
                <div className="w-[88%] mt-3 pl-8">
                  <div className="rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/5 p-3.5 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Info size={14} className="text-[#caa24c] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-[#f7efe3]">Action Confirmation Required</p>
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
              key="thinking-indicator"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.96, originX: 0, originY: 1 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.18 }}
              className="flex items-start gap-2 max-w-[80%]"
            >
              <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-zinc-700 mt-1">
                <Image src="/luxor-concierge.png" alt="Elena" fill className="object-cover" />
              </div>
              <div className="rounded-2xl rounded-tl-none bg-zinc-900/60 border border-zinc-800/80 px-4 py-3 text-zinc-400 text-xs flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-[#caa24c]" />
                <span>Elena is thinking...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts */}
      {messages.length === 1 && (
        <div className="border-t border-[#caa24c]/5 p-3 space-y-1.5 bg-[#050505]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-1">Suggested Requests</p>
          <div className="flex flex-wrap gap-1.5">
            {pathSuggestions.map((s, i) => (
              <button
                key={i}
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
            className="flex-1 bg-transparent py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none"
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
