'use client'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'

import React, { useState, useEffect, useLayoutEffect, useRef, useId } from 'react'
import { 
  X, 
  Send, 
  Info,
  RefreshCw,
  History,
  Plus,
  SquarePen,
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
  PhoneOff,
  ArrowUp,
  Paperclip,
  FileText,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from '@/lib/icons/phosphor-compat'
import { submitLuxorIdempotentForm } from '@/lib/luxorSubmissionIdempotency'
import { LuxorEventTypeCombobox } from '@/components/LuxorEventTypeCombobox'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { PortalCloseButton, PortalContactAvatar, PortalDatePicker, PortalSelect, PortalConstellationLoader } from './PortalUI'
import { ElenaLiveVoiceClient, type ElenaVoiceState } from '@/lib/elenaLiveVoiceClient'
import { ElenaSilkOrb } from './ElenaSilkOrb'
import { LUXOR_TIME_DROPDOWN_OPTIONS, normalizeLuxorTimeDropdownValue } from '@/lib/luxorTimeOptions'
import { ElenaEmailDraftCard, EmailDraftPayload } from './ElenaEmailDraftCard'
import { ElenaWorkflowDraftCard, type ElenaWorkflowDraftPayload } from './ElenaWorkflowDraftCard'
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
  id?: string
  role: 'user' | 'assistant'
  content: string
  executedQueries?: ExecutedQuery[]
  toolActivity?: string[]
  toolActivityFailed?: boolean
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
  newContactCard?: NewContactCardPayload
  tourInviteCard?: TourInviteCardPayload
  workflowDraft?: ElenaWorkflowDraftPayload
  textCampaignDraft?: { name: string; bodyTemplate: string; campaignType: string }
  voiceTranscript?: Array<{ role: 'user' | 'assistant'; text: string }>
}

type ElenaChatResponse = {
  reply: string
  executedQueries: ExecutedQuery[]
  toolActivity?: string[]
  confirmation?: { query: string; summary: string }
  textCampaignDraft?: { name: string; bodyTemplate: string; campaignType: string }
  emailDraft?: EmailDraftPayload
  crmUpdateCard?: LeadUpdatePayload
  contractCard?: ContractCardPayload
  invoiceCard?: InvoiceCardPayload
  taskCard?: TaskCardPayload
  contactCard?: LeadContactCardPayload
  newContactCard?: NewContactCardPayload
  tourInviteCard?: TourInviteCardPayload
  workflowDraft?: ElenaWorkflowDraftPayload
  navigation?: { href: string }
}

function isVoiceChoiceReply(message: Message) {
  if (message.role !== 'assistant') return false
  return Boolean(message.content.trim())
}

function hasVoiceActionOutput(message: Message) {
  return message.role === 'assistant' && Boolean(
    message.content.trim()
    || message.confirmation
    || message.emailDraft
    || message.crmUpdateCard
    || message.contractCard
    || message.invoiceCard
    || message.taskCard
    || message.contactCard
    || message.newContactCard
    || message.tourInviteCard
    || message.workflowDraft
    || message.textCampaignDraft
    || message.toolActivityFailed
  )
}

function formatForVoiceCommentary(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function readElenaChatResponse(response: Response, onActivity: (step: string) => void): Promise<ElenaChatResponse> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    return response.json() as Promise<ElenaChatResponse>
  }
  if (!response.body) throw new Error('Elena’s progress stream ended before the reply arrived.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const resultRef: { current: { ok: boolean; status: number; data: ElenaChatResponse & { error?: string } } | null } = { current: null }
  let streamError = ''

  const consume = (chunk: string) => {
    buffer += chunk
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      const payload = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
      if (!payload) continue
      try {
        const event = JSON.parse(payload) as { type?: string; text?: string; ok?: boolean; status?: number; data?: ElenaChatResponse & { error?: string } }
        if (event.type === 'activity' && event.text) onActivity(event.text)
        if (event.type === 'error') streamError = event.text || 'Elena could not finish the request.'
        if (event.type === 'result' && event.data) {
          resultRef.current = { ok: Boolean(event.ok), status: Number(event.status || 200), data: event.data }
        }
      } catch {
        streamError = 'Elena’s progress update could not be read.'
      }
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    consume(decoder.decode(value, { stream: true }))
  }
  consume(decoder.decode())

  if (streamError) throw new Error(streamError)
  const result = resultRef.current
  if (!result) throw new Error('Elena’s progress stream ended before the reply arrived.')
  if (!result.ok) throw new Error(result.data.error || `Elena could not complete the request (${result.status}).`)
  return result.data
}

function isVoiceEmailSendConfirmation(text: string) {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ')
  if (/\b(don't|do not|not|never|wait|stop|cancel|hold on|change|edit|rewrite|instead)\b/.test(normalized)) return false
  if (/^(yes|yeah|yep|sure|okay|ok|go ahead|please|send it|send that|send this|send the email|that's good|that looks good|looks good|sounds good|do it|perfect)( please)?( and send( it| that| this| the email)?)?$/.test(normalized)) {
    return true
  }
  if (/^(yes|yeah|yep|okay|ok|go ahead|so|well|um|uh|like),?\s*(like,?\s*)?(can you|could you|will you|please|go ahead and)?\s*(just\s*)?(send|send it|send that|send this|send the email)(\s+for me|\s+out|\s+now|\s+please)*$/.test(normalized)) {
    return true
  }
  if (/\b(can you|could you|please|go ahead and)\s+(just\s+)?send\s+(it|that|this|the email|her the email|him the email|them the email)(\s+for me|\s+out|\s+now|\s+please)*$/.test(normalized)) {
    return true
  }
  return false
}

function isVoiceEmailReadRequest(text: string) {
  return /\b(read (it|the email|that email|this email)( to me)?|read (it|the email) aloud|what does (it|the email) say|let me hear (it|the email))\b/i.test(text)
}

function isVoiceEmailSendCancellation(text: string) {
  return /^(no|no thanks|no thank you|don't send it|do not send it|not yet|cancel|leave it as a draft|keep it as a draft)[.! ]*$/i.test(text.trim())
}

function voiceEmailReadback(draft: EmailDraftPayload) {
  const recipient = draft.recipientName?.trim() || draft.recipientEmail
  const purpose = draft.subject.toLowerCase().includes('brochure')
    ? 'It follows up on their brochure request.'
    : 'I put the draft card on screen for you.'
  return `I drafted an email for ${recipient} at ${draft.recipientEmail} with the subject “${draft.subject}.” ${purpose} Would you like me to send it?`
}

function ToolActivityDisclosure({ steps, active = false, failed = false }: { steps: string[]; active?: boolean; failed?: boolean }) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const reduceMotion = useReducedMotion()
  if (!steps.length) return null

  return (
      <div className={`elena-tool-activity${active ? ' is-active' : ''}`}>
      <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(value => !value)}>
        <ChevronRight size={13} aria-hidden="true" className={open ? 'is-open' : ''} />
        <span>{active ? `View activity · ${steps.length}` : `Activity · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            initial={reduceMotion ? false : { height: 0, opacity: 0, y: -3 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, y: -3 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="elena-tool-activity-reveal"
          >
            <ol role="list" aria-label="Workflow activity">
              {steps.map((step, index) => {
                const current = active && index === steps.length - 1
                const hasFailed = /could not|failed|unavailable|error/i.test(step) || (failed && index === steps.length - 1)
                return (
                  <motion.li
                    key={`${index}-${step}`}
                    role="listitem"
                    aria-current={current ? 'step' : undefined}
                    initial={reduceMotion ? false : { opacity: 0, y: 5, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : Math.min(index, 5) * 0.035, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className={hasFailed ? 'is-failed' : current ? 'is-current' : 'is-complete'} aria-hidden="true">
                      {hasFailed ? <Info size={13} /> : current ? <PortalConstellationLoader size={14} /> : <Check size={13} />}
                    </span>
                    <span>{step}</span>
                  </motion.li>
                )
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
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

type NewContactCardPayload = {
  fullName: string
  email?: string
  phone?: string
  eventType?: string
  source?: string
  targetDate?: string
  guestCount?: number | null
  notes?: string
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
  currentVisitId: string | null
  currentVisitVersion: number
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
  if (path.startsWith('/portal/calendar') || path.startsWith('/portal/planner')) {
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
      makeSuggestion('operations-bills', 'Bills needing review', 'Check extracted invoices, evidence, and payment readiness.', 'Show vendor bills that need review or are due soon, with the source evidence and next action.', 'task'),
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
  const [loadingActivities, setLoadingActivities] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sessions History States
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  const activeSessionRef = useRef<string | null>(null)
  const isOpenRef = useRef(isOpen)
  const [showSessionsList, setShowSessionsList] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState('')

  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([])
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const suggestionCycleRef = useRef(0)
  const suggestionRequestRef = useRef(0)
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const voiceClientRef = useRef<ElenaLiveVoiceClient | null>(null)
  const handledVoiceDelegationsRef = useRef(new Set<string>())
  const pendingVoiceEmailDraftRef = useRef<{ draft: EmailDraftPayload; idempotencyKey: string } | null>(null)
  const voiceSendRef = useRef<((text: string, onReply: (reply: string) => void) => Promise<string | null>) | null>(null)
  const [voiceState, setVoiceState] = useState<ElenaVoiceState>('ended')
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceButtonHovered, setVoiceButtonHovered] = useState(false)
  const [voiceStartIndex, setVoiceStartIndex] = useState(0)
  const [voiceCaption, setVoiceCaption] = useState<{ role: 'user' | 'assistant'; text: string } | null>(null)
  const voiceStartButtonRef = useRef<HTMLButtonElement>(null)
  const voiceEndButtonRef = useRef<HTMLButtonElement>(null)
  const wasVoiceActiveRef = useRef(false)
  const reduceVoiceMotion = useReducedMotion()

  useEffect(() => { activeSessionRef.current = currentSessionId }, [currentSessionId])
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])
  useEffect(() => {
    if (voiceState === 'connecting') {
      wasVoiceActiveRef.current = true
      voiceEndButtonRef.current?.focus()
    } else if (voiceState === 'ended' && wasVoiceActiveRef.current) {
      wasVoiceActiveRef.current = false
      if (isOpen) voiceStartButtonRef.current?.focus()
    }
  }, [voiceState, isOpen])

  const stopVoice = () => {
    voiceClientRef.current?.stop()
    voiceClientRef.current = null
    setVoiceMuted(false)
  }

  const startVoice = () => {
    if (voiceClientRef.current || isLoading || !isOpen) return
    setVoiceError('')
    setVoiceStartIndex(messages.length)
    setVoiceCaption(null)
    handledVoiceDelegationsRef.current.clear()
    const pendingDelegations = new Map<string, { timer: number; startedAt: number }>()
    let transcript = ''
    let consumedLength = 0
    const voiceTurns: Array<{ role: 'user' | 'assistant'; text: string }> = []
    const recordVoiceFragment = (role: 'user' | 'assistant', fragment: string) => {
      const last = voiceTurns[voiceTurns.length - 1]
      if (last?.role === role) last.text += fragment
      else voiceTurns.push({ role, text: fragment })
    }
    let queue = Promise.resolve()
    let processDelegation: (delegationId: string) => void = () => {}
    const scheduleDelegation = (delegationId: string, delay: number) => {
      const pending = pendingDelegations.get(delegationId)
      if (!pending) return
      window.clearTimeout(pending.timer)
      pending.timer = window.setTimeout(() => processDelegation(delegationId), delay)
    }
    const client = new ElenaLiveVoiceClient({
      messages: messages.map(({ role, content }) => ({ role, content })),
      onState: (state) => {
        setVoiceState(state)
        if (state === 'ended') {
          for (const pending of pendingDelegations.values()) window.clearTimeout(pending.timer)
          pendingDelegations.clear()
          pendingVoiceEmailDraftRef.current = null
          if (voiceClientRef.current === client) {
            voiceClientRef.current = null
            if (voiceTurns.some(turn => turn.role === 'user' && turn.text.trim())) {
              const turns = voiceTurns.filter(turn => turn.text.trim()).map(turn => ({ ...turn }))
              const entry: Message = {
                id: `voice-${crypto.randomUUID()}`,
                role: 'user',
                content: `Voice conversation:\n${turns.map(turn => `${turn.role === 'user' ? 'You' : 'Elena'}: ${turn.text.trim()}`).join('\n')}`,
                voiceTranscript: turns,
              }
              setMessages(previous => [...previous, entry])
              if (currentSessionId) {
                void queue.then(async () => {
                  const response = await fetch('/api/portal/elena-chat/sessions', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: currentSessionId, appendVoiceTranscript: entry }),
                  })
                  if (!response.ok) throw new Error('Could not save the voice transcript')
                  if (isOpenRef.current && activeSessionRef.current === currentSessionId) {
                    setMessages(previous => previous.some(message => message.id === entry.id) ? previous : [...previous, entry])
                  }
                }).catch(() => setVoiceError('The voice transcript is visible here but could not be saved.'))
              }
            }
          }
        }
      },
      onLevel: setVoiceLevel,
      onError: setVoiceError,
      onEvent: (event) => {
        if (event.type === 'session.input_transcript.delta' && typeof event.delta === 'string') {
          transcript += event.delta
          const fragment = event.delta
          recordVoiceFragment('user', fragment)
          setVoiceCaption(previous => previous?.role === 'user'
            ? { role: 'user', text: previous.text + fragment }
            : { role: 'user', text: fragment })
          for (const [delegationId, pending] of pendingDelegations) {
            scheduleDelegation(delegationId, Math.max(0, Math.min(1200, 8000 - (Date.now() - pending.startedAt))))
          }
        }
        if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
          if (pendingDelegations.size === 0) {
            consumedLength = transcript.length
          }
          const fragment = event.delta
          recordVoiceFragment('assistant', fragment)
          setVoiceCaption(previous => previous?.role === 'assistant'
            ? { role: 'assistant', text: previous.text + fragment }
            : { role: 'assistant', text: fragment })
        }
        if (event.type === 'session.output_audio_buffer.stopped' && pendingDelegations.size === 0) {
          consumedLength = transcript.length
        }
        if (event.type !== 'session.delegation.created') return

        const delegation = event.delegation
        const delegationId = delegation && typeof delegation === 'object' && 'id' in delegation
          ? (delegation as { id?: unknown }).id
          : null
        if (typeof delegationId !== 'string' || handledVoiceDelegationsRef.current.has(delegationId)) return
        handledVoiceDelegationsRef.current.add(delegationId)
        client.sendThinking('Checking your Luxor records and inbox now.', delegationId)
        pendingDelegations.set(delegationId, { timer: 0, startedAt: Date.now() })
        scheduleDelegation(delegationId, 1200)
      },
    })
    processDelegation = (delegationId) => {
      const pending = pendingDelegations.get(delegationId)
      if (!pending || voiceClientRef.current !== client) return
      if (!transcript.slice(consumedLength).trim() && Date.now() - pending.startedAt < 8000) {
        scheduleDelegation(delegationId, 500)
        return
      }
      window.clearTimeout(pending.timer)
      pendingDelegations.delete(delegationId)
      const request = transcript.slice(consumedLength).trim()
      consumedLength = transcript.length
      queue = queue.then(async () => {
        if (voiceClientRef.current !== client) return
        if (!request) {
          client.sendCommentary('I did not catch that clearly. Please say it again.', delegationId)
          return
        }
        const pendingEmail = pendingVoiceEmailDraftRef.current
        if (pendingEmail && isVoiceEmailReadRequest(request)) {
          const readback = `Here is the email: ${pendingEmail.draft.body}`
          client.sendCommentary(readback, delegationId)
          return
        }
        if (pendingEmail && isVoiceEmailSendCancellation(request)) {
          pendingVoiceEmailDraftRef.current = null
          client.sendCommentary('Okay, I will leave it as a draft.', delegationId)
          return
        }
        if (pendingEmail && isVoiceEmailSendConfirmation(request)) {
          try {
            const response = await fetch('/api/email/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: pendingEmail.draft.recipientEmail,
                recipientName: pendingEmail.draft.recipientName,
                subject: pendingEmail.draft.subject,
                content: pendingEmail.draft.body,
                from: pendingEmail.draft.senderProfile?.email || 'booking@luxoratlaspalmas.com',
                format: 'conversational',
                track: true,
                inquiryId: pendingEmail.draft.inquiryId,
                idempotencyKey: pendingEmail.idempotencyKey,
              }),
            })
            const result = await response.json() as { success?: boolean; error?: string }
            if (!response.ok || !result.success) throw new Error(result.error || 'The email could not be sent.')
            pendingVoiceEmailDraftRef.current = null
            const recipientLabel = pendingEmail.draft.recipientName || pendingEmail.draft.recipientEmail
            const sentReply = `The email to ${recipientLabel} was sent.`
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: `Done! I sent the email to **${recipientLabel}** with subject *"${pendingEmail.draft.subject}"*.`,
              },
            ])
            client.sendCommentary(sentReply, delegationId)
          } catch (error) {
            const failedReply = error instanceof Error ? error.message : 'The email could not be sent.'
            client.sendCommentary(failedReply, delegationId)
          }
          return
        }
        const result = await voiceSendRef.current?.(request, (reply) => {
          if (voiceClientRef.current === client) client.sendCommentary(formatForVoiceCommentary(reply), delegationId)
        })
        if (result == null && voiceClientRef.current === client) {
          client.sendCommentary('I could not finish that request. Please try again.', delegationId)
        }
      })
    }
    voiceClientRef.current = client
    void client.start()
  }

  useEffect(() => {
    if (!isOpen) {
      voiceClientRef.current?.stop()
      voiceClientRef.current = null
    }
    return () => voiceClientRef.current?.stop()
  }, [isOpen])

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

  useLayoutEffect(() => {
    if (isOpen) {
      suggestionCycleRef.current = 0
      setSmartSuggestions([])
      void loadSmartSuggestions(false)
    } else {
      suggestionRequestRef.current += 1
      setSmartSuggestions([])
      setIsLoadingSuggestions(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activePath])

  useLayoutEffect(() => {
    if (isOpen) {
      setShowSessionsList(false)
      setMessages([])
      setLoadedSessionId(null)
      setIsLoading(true)
      void loadSessionsList(undefined, true)
    } else {
      sessionRequestRef.current += 1
      messageRequestRef.current += 1
      setShowSessionsList(false)
      setMessages([])
      setLoadedSessionId(null)
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const loadSmartSuggestions = async (advanceCycle = true) => {
    if (advanceCycle) suggestionCycleRef.current += 1
    const requestId = ++suggestionRequestRef.current
    setIsLoadingSuggestions(true)
    try {
      const res = await fetch(`/api/portal/elena-chat/suggestions?activePath=${encodeURIComponent(activePath)}&cycle=${suggestionCycleRef.current}`)
      if (res.ok) {
        const data = (await res.json()) as { suggestions?: SmartSuggestion[] }
        if (requestId !== suggestionRequestRef.current) return
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSmartSuggestions(data.suggestions)
        }
      }
    } catch (err) {
      console.error('Error loading smart suggestions:', err)
    } finally {
      if (requestId === suggestionRequestRef.current) setIsLoadingSuggestions(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const refreshSessionsMetadata = async () => {
    try {
      const response = await fetch('/api/portal/elena-chat/sessions')
      if (response.ok) setSessions(await response.json() as ChatSession[])
    } catch (error) {
      console.error('Could not refresh chat sessions:', error)
    }
  }

  const loadSessionsList = async (selectSessionId?: string, forceReload = false) => {
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
        if (forceReload || targetId !== currentSessionId || messages.length <= 1 || loadedSessionId !== targetId) {
          setCurrentSessionId(targetId)
          await loadSessionMessages(targetId)
        }
      } else {
        await handleCreateSession()
      }
    } catch (err) {
      console.error(err)
      if (requestId === sessionRequestRef.current) setIsLoading(false)
    }
  }

  const loadSessionMessages = async (sessionId: string) => {
    const requestId = ++messageRequestRef.current
    setLoadedSessionId(null)
    setMessages([])
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
    sessionRequestRef.current += 1
    const requestId = ++messageRequestRef.current
    setCurrentSessionId(null)
    setLoadedSessionId(null)
    setMessages([])
    setInput('')
    setAttachments([])
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
      if (requestId === messageRequestRef.current) setIsLoading(false)
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

  const handleSend = async (textToSend: string, onVoiceReply?: (reply: string) => void): Promise<string | null> => {
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return null
    const requestId = ++messageRequestRef.current

    const userMessageText = textToSend.trim()
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])

    let fullDisplayContent = userMessageText
    if (currentAttachments.length > 0) {
      const attNames = currentAttachments.map(a => `📎 ${a.name}`).join(', ')
      fullDisplayContent = userMessageText ? `${userMessageText}\n\n[Attached: ${attNames}]` : `[Attached: ${attNames}]`
    }
    
    const updatedMessages: Message[] = [...messages, { role: 'user', content: fullDisplayContent }]
    setMessages(updatedMessages)
    let streamedActivities: string[] = []
    setLoadingActivities([])
    setIsLoading(true)

    try {
      // Keep cards in saved chat history; the server sends only role and text to the model.
      const apiMessages = updatedMessages

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
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

      const data = await readElenaChatResponse(response, (step) => {
        streamedActivities = streamedActivities.at(-1) === step ? streamedActivities : [...streamedActivities, step]
        setLoadingActivities(streamedActivities)
      })
      if (requestId !== messageRequestRef.current) return null

      if (data.textCampaignDraft) {
        window.localStorage.setItem('luxor_elena_text_campaign_draft', JSON.stringify(data.textCampaignDraft))
        window.dispatchEvent(new CustomEvent('luxor:text-campaign-draft', { detail: data.textCampaignDraft }))
      }

      if (data.navigation?.href) {
        onClose()
        router.push(data.navigation.href)
      }
      
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply?.trim() || 'I did not get a clear answer back from the query service. Please try that question again, or ask me for a daily brief.',
          executedQueries: data.executedQueries,
          toolActivity: data.toolActivity?.length ? data.toolActivity : streamedActivities,
          confirmation: data.confirmation,
          emailDraft: data.emailDraft,
          crmUpdateCard: data.crmUpdateCard,
          contractCard: data.contractCard,
          invoiceCard: data.invoiceCard,
          taskCard: data.taskCard,
          contactCard: data.contactCard,
          newContactCard: data.newContactCard,
          tourInviteCard: data.tourInviteCard,
          workflowDraft: data.workflowDraft,
          textCampaignDraft: data.textCampaignDraft,
        }
      ])
      const voiceReply = onVoiceReply && data.emailDraft
        ? voiceEmailReadback(data.emailDraft)
        : data.reply?.trim() || 'I did not get a clear answer back from the query service. Please try that question again, or ask me for a daily brief.'
      if (onVoiceReply && data.emailDraft) {
        pendingVoiceEmailDraftRef.current = {
          draft: data.emailDraft,
          idempotencyKey: `manual/${crypto.randomUUID()}`,
        }
      }
      onVoiceReply?.(voiceReply)
      
      // Refresh session sidebar metadata in background to update title & date order
      if (currentSessionId) {
        void refreshSessionsMetadata()
      }
      return voiceReply
    } catch (err) {
      if (requestId !== messageRequestRef.current) return null
      console.error(err)
      const voiceErrorReply = 'Sorry, I ran into an error connecting to the query service. Please check your network and try again.'
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: voiceErrorReply,
          toolActivity: streamedActivities.length ? streamedActivities : undefined,
          toolActivityFailed: streamedActivities.length > 0,
        }
      ])
      onVoiceReply?.(voiceErrorReply)
      return voiceErrorReply
    } finally {
      if (requestId === messageRequestRef.current) {
        setIsLoading(false)
        setLoadingActivities([])
      }
    }
    return null
  }
  voiceSendRef.current = handleSend

  const handleWorkflowDraftSaved = (msgIndex: number, workflow: { id: string; name: string }) => {
    const updatedMessages = messages.map((message, index) => index === msgIndex && message.workflowDraft
      ? { ...message, workflowDraft: { ...message.workflowDraft, savedWorkflowId: workflow.id, savedWorkflowName: workflow.name } }
      : message)
    setMessages(updatedMessages)
    if (currentSessionId) {
      void fetch('/api/portal/elena-chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentSessionId, messages: updatedMessages }),
      }).then((response) => {
        if (!response.ok) throw new Error('Could not save the workflow draft status in chat history.')
        void refreshSessionsMetadata()
      }).catch((error) => console.error(error))
    }
  }

  const handleConfirmAction = async (msgIndex: number, confirmation: { query: string; summary: string }) => {
    const requestId = ++messageRequestRef.current
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, isConfirmed: true } : m))
    setIsLoading(true)

    try {
      const apiMessages = messages.map((msg, index) => index === msgIndex ? { ...msg, isConfirmed: true } : msg)

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
      if (requestId !== messageRequestRef.current) return

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          executedQueries: data.executedQueries
        }
      ])

      if (currentSessionId) {
        void refreshSessionsMetadata()
      }
    } catch (err) {
      if (requestId !== messageRequestRef.current) return
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'I ran into an issue executing the action bestie! Please double-check lead/booking locks or database logs.'
        }
      ])
    } finally {
      if (requestId === messageRequestRef.current) setIsLoading(false)
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
  const voiceActive = voiceState !== 'ended'
  const latestVoiceReplyIndex = messages.reduce((latestIndex, message, index) => (
    index >= voiceStartIndex && message.role === 'assistant' ? index : latestIndex
  ), -1)
  const voiceOutputIndex = !isLoading && latestVoiceReplyIndex >= 0 && hasVoiceActionOutput(messages[latestVoiceReplyIndex])
    ? latestVoiceReplyIndex
    : -1
  const voiceHasResults = voiceOutputIndex >= 0

  return (
    <motion.aside 
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="portal-elena-chat-panel fixed right-0 top-0 z-[65] flex w-full flex-col border-l-0 border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] max-lg:bottom-[var(--portal-mobile-nav-height)] max-lg:h-[calc(100dvh-var(--portal-mobile-nav-height))] lg:bottom-0 lg:h-full"
      aria-hidden={!isOpen}
      inert={!isOpen}
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
            <h3 className="font-serif text-base font-medium leading-none text-[color:var(--portal-text)]">Elena AI</h3>
            <span className="mt-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-green-500">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Connected
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!voiceActive && <button
            type="button"
            onClick={() => setShowSessionsList(curr => !curr)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer ${
              showSessionsList 
                ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]' 
                : 'text-zinc-500 opacity-80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white hover:opacity-100'
            }`}
            title="Chat History Sessions"
            aria-label="Chat History Sessions"
          >
            <History size={16} />
          </button>}
          {!voiceActive && <button
            type="button"
            onClick={handleCreateSession}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-zinc-500 opacity-80 transition-colors hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer"
            title="Start New Chat Session"
            aria-label="Start New Chat Session"
          >
            <SquarePen size={16} />
          </button>}
          {!voiceActive && <div className="h-4 w-px bg-[color:var(--portal-border)] shrink-0 mx-0.5" aria-hidden="true" />}
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

        <AnimatePresence mode="popLayout">
        {voiceActive && (
          <motion.section
            key="voice-conversation"
            layout={!reduceVoiceMotion}
            initial={reduceVoiceMotion ? false : { opacity: 0, y: 20, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: 20, filter: 'blur(8px)' }}
            transition={{ duration: reduceVoiceMotion ? 0 : 0.35, ease: [0.23, 1, 0.32, 1] }}
            aria-label="Voice conversation with Elena"
            className={`relative z-10 flex min-h-0 items-center justify-center overflow-hidden bg-[color:var(--portal-card)] px-5 py-4 text-center ${voiceHasResults ? 'shrink-0 border-b border-[color:var(--portal-border)]' : 'flex-1'}`}
          >
            <ElenaVoiceAtmosphere level={voiceLevel} reducedMotion={Boolean(reduceVoiceMotion)} />
            <div className={`relative z-10 mx-auto flex max-w-sm flex-col items-center ${voiceHasResults ? '' : '-translate-y-3'}`}>
              <ElenaSilkOrb level={voiceLevel} size={voiceHasResults ? 150 : 200} />
              <p className="-mt-3 font-serif text-xl text-[color:var(--portal-text)]">Elena</p>
              <p aria-live="polite" className="mt-1 text-xs text-[color:var(--portal-muted)]">
                {voiceState === 'connecting' ? 'Connecting…' : voiceState === 'thinking' ? 'Working on it…' : voiceState === 'speaking' ? 'Speaking' : voiceState === 'closing' ? 'Ending voice…' : voiceMuted ? 'Microphone muted' : 'Listening'}
              </p>
              {voiceCaption?.text.trim() && (
                <p className="mt-2 line-clamp-2 max-w-[300px] text-xs leading-relaxed text-[color:var(--portal-muted)]">
                  <span className="sr-only">{voiceCaption.role === 'user' ? 'You said: ' : 'Elena said: '}</span>
                  {voiceCaption.text}
                </p>
              )}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => { voiceClientRef.current?.mute(!voiceMuted); setVoiceMuted(current => !current) }}
                  aria-label={voiceMuted ? 'Unmute microphone' : 'Mute microphone'}
                  aria-pressed={voiceMuted}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]"
                >
                  {voiceMuted ? <MicOff size={16} /> : <Mic size={16} />} {voiceMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  type="button"
                  ref={voiceEndButtonRef}
                  onClick={stopVoice}
                  className="portal-gold-button inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#916823] px-4 text-xs font-semibold text-white transition hover:bg-[#805b1e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]"
                >
                  <PhoneOff size={16} /> End voice
                </button>
              </div>
            </div>
          </motion.section>
        )}
        </AnimatePresence>

        {/* Messages Window */}
        <div className={`portal-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 ${voiceActive && !voiceHasResults && !isLoading ? 'hidden' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSessionId || 'empty-session'}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className={messages.length === 0 && !voiceActive ? 'min-h-full flex flex-col justify-center [justify-content:safe_center]' : 'min-h-full flex flex-col justify-between space-y-4'}
            >
              {isSessionHydrating ? (
                <div className="flex flex-col items-center justify-center gap-3 text-center text-zinc-500" role="status" aria-live="polite">
                  <Loader2 size={20} className="animate-spin text-[#caa24c]" />
                  <p className="text-xs">Opening Elena’s conversation…</p>
                </div>
              ) : voiceActive && !voiceHasResults ? isLoading ? (
                <motion.div
                  key="voice-tool-progress"
                  initial={reduceVoiceMotion ? false : { opacity: 0, y: 8, filter: 'blur(5px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(5px)' }}
                  transition={{ duration: reduceVoiceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-xs text-[color:var(--portal-muted)]"
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-[#caa24c]">
                    {[0, 1, 2].map((dot) => <span key={dot} className="h-1 w-1 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${dot * 140}ms` }} />)}
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={loadingActivities.at(-1) || 'working'}
                      initial={reduceVoiceMotion ? false : { opacity: 0, y: 4, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(4px)' }}
                      transition={{ duration: reduceVoiceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="min-w-0 flex-1 elena-working-shimmer"
                    >
                      {loadingActivities.at(-1) || 'Working through your request…'}
                    </motion.span>
                  </AnimatePresence>
                  <ToolActivityDisclosure steps={loadingActivities} active />
                </motion.div>
              ) : null : messages.length === 0 ? (
                <div className="portal-elena-welcome flex flex-col items-center justify-center text-center px-1 sm:px-2 py-2 space-y-3 sm:space-y-4 my-auto">
                  <div className="portal-elena-avatar-wrap relative shrink-0">
                    <div className="portal-elena-avatar relative h-14 w-14 overflow-hidden rounded-full border-2 border-[#caa24c]/40 ring-4 ring-[#caa24c]/10 shadow-2xl transition-all">
                      <Image src="/luxor-concierge.png" alt="Elena AI" fill sizes="56px" className="object-cover" />
                    </div>
                    <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[color:var(--portal-bg)] bg-green-500 transition-colors" />
                  </div>

                  <div className="max-w-xs space-y-1">
                    <h3 className="portal-elena-title font-serif text-lg font-medium text-[color:var(--portal-text)] transition-all">Elena Concierge</h3>
                    <p className="portal-elena-subtitle text-xs text-[color:var(--portal-muted)] leading-relaxed transition-all">
                      Connected to your live Luxor database & CRM intelligence.
                    </p>
                  </div>

                  <div className="w-full space-y-2 pt-1">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Current priorities</p>
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
                    <div className="portal-elena-cards-grid grid gap-2">
                      <AnimatePresence mode="wait">
                        {isLoadingSuggestions && smartSuggestions.length === 0 ? (
                          <motion.div
                            key="suggestions-skeleton"
                            initial={{ opacity: 0, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, filter: 'blur(6px)' }}
                            transition={{ duration: 0.25 }}
                            className="portal-elena-cards-grid grid gap-2"
                          >
                            {[1, 2, 3, 4].map((i) => (
                              <div
                                key={i}
                                className="portal-elena-card portal-suggestion-card flex items-center justify-between rounded-xl border-0 bg-zinc-950/40 p-3 shadow-sm animate-pulse"
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
                            className="portal-elena-cards-grid grid gap-2"
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
                                  className="portal-elena-card portal-suggestion-card flex items-center justify-between rounded-xl border-0 bg-zinc-950/40 p-3 text-left text-xs text-zinc-300 hover:bg-[#caa24c]/10 hover:text-white transition-all cursor-pointer group shadow-sm hover:shadow-md hover:shadow-[#caa24c]/5"
                                >
                                  <span className="min-w-0">
                                    <span className="portal-elena-card-label block text-[9px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#e3bc65]">{suggestion.label}</span>
                                    <span className="portal-elena-card-detail mt-0.5 block line-clamp-2 leading-snug">{suggestion.detail}</span>
                                  </span>
                                  <SuggestionIcon kind={suggestion.kind} className="portal-elena-card-icon ml-3 shrink-0 text-zinc-600 transition-colors group-hover:text-[#caa24c]" />
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
                    {messages.map((msg, index) => voiceActive && index !== voiceOutputIndex ? null : (
                      <motion.div 
                        layout="position"
                        key={index} 
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        {(!voiceActive || isVoiceChoiceReply(msg)) && (
                        <motion.div
                          initial={reduceVoiceMotion ? false : { opacity: 0, y: 18, scale: 0.985, filter: 'blur(8px)', originX: msg.role === 'user' ? 1 : 0, originY: 1 }}
                          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                          transition={{ duration: reduceVoiceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                          className={`flex items-start gap-2 max-w-[88%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-[color:var(--portal-border)] mt-1">
                              <Image src="/luxor-concierge.png" alt="Elena" fill sizes="24px" className="object-cover" />
                            </div>
                          )}
                          <div 
                            className={`rounded-2xl px-4 py-2.5 shadow-sm text-sm border ${
                              msg.role === 'user'
                                ? 'rounded-tr-none bg-[#caa24c]/12 border-[#caa24c]/25 text-[color:var(--portal-text)]'
                                : 'rounded-tl-none bg-[color:var(--portal-card)] border-[color:var(--portal-border)] text-[color:var(--portal-text)]'
                            }`}
                          >
                            {msg.voiceTranscript ? (
                              <details>
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                                  Voice conversation
                                  <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-[color:var(--portal-muted)] transition-transform duration-300 ease-out group-open:rotate-180 motion-reduce:transition-none" />
                                </summary>
                                <div className="grid grid-rows-[0fr] opacity-0 blur-[2px] transition-[grid-template-rows,opacity,filter] duration-300 ease-out group-open:grid-rows-[1fr] group-open:opacity-100 group-open:blur-0 motion-reduce:transition-none">
                                <div className="mt-3 min-h-0 overflow-hidden space-y-2 text-xs leading-relaxed">
                                  {msg.voiceTranscript.map((turn, turnIndex) => (
                                    <p key={turnIndex}><span className="font-semibold">{turn.role === 'user' ? 'You' : 'Elena'}:</span> {turn.text}</p>
                                  ))}
                                </div>
                                </div>
                              </details>
                            ) : renderFormattedContent(msg.content)}
                          </div>
                        </motion.div>
                        )}

                        {!voiceActive && msg.toolActivity?.length ? (
                          <ToolActivityDisclosure steps={msg.toolActivity} failed={msg.toolActivityFailed} />
                        ) : null}

                        {voiceActive && msg.toolActivityFailed && (
                          <div className="mt-2 flex w-[96%] items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-xs text-rose-800 dark:text-rose-200" role="status">
                            <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span>{msg.content}</span>
                          </div>
                        )}

                        {msg.contactCard && <ElenaContactCard payload={msg.contactCard} />}

                        {msg.newContactCard && (
                          <ElenaNewContactCard
                            payload={msg.newContactCard}
                            onSuccess={(successMessage) => {
                              setMessages((prev) => [...prev, { role: 'assistant', content: successMessage }])
                            }}
                          />
                        )}

                        {msg.tourInviteCard && (
                          <ElenaTourInviteCard
                            payload={msg.tourInviteCard}
                            onSuccess={(successMessage) => {
                              setMessages((prev) => [...prev, { role: 'assistant', content: successMessage }])
                            }}
                          />
                        )}

                        {msg.workflowDraft && (
                          <ElenaWorkflowDraftCard
                            draft={msg.workflowDraft}
                            onSaved={(workflow) => handleWorkflowDraftSaved(index, workflow)}
                          />
                        )}

                        {msg.textCampaignDraft && (
                          <section className="mt-2 w-[96%] rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a8792f] dark:text-[#e3bc65]">Text campaign draft</p>
                            <h4 className="mt-1 font-serif text-base text-[color:var(--portal-text)]">{msg.textCampaignDraft.name}</h4>
                            <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Prepared for the text campaign editor.</p>
                            <button
                              type="button"
                              onClick={() => {
                                window.localStorage.setItem('luxor_elena_text_campaign_draft', JSON.stringify(msg.textCampaignDraft))
                                stopVoice()
                                onClose()
                                router.push('/portal/marketing?tab=text-campaigns')
                              }}
                              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caa24c]"
                            >
                              Open campaign editor
                            </button>
                          </section>
                        )}

                        {/* Render SQL execution indicators */}
                        {!voiceActive && msg.executedQueries && msg.executedQueries.length > 0 && (
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
                                pendingVoiceEmailDraftRef.current = null
                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    role: 'assistant',
                                    content: `Done! I sent the email to **${recipient}** with subject *"${subj}"*.`
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
                        initial={reduceVoiceMotion ? false : { opacity: 0, y: 8, filter: 'blur(5px)', originX: 0, originY: 1 }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(5px)' }}
                        transition={{ duration: reduceVoiceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 text-xs text-[color:var(--portal-muted)]"
                      >
                        <span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-[#caa24c]">
                          {[0, 1, 2].map((dot) => <span key={dot} className="h-1 w-1 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${dot * 140}ms` }} />)}
                        </span>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={loadingActivities.at(-1) || 'working'}
                            initial={reduceVoiceMotion ? false : { opacity: 0, y: 4, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: -3, filter: 'blur(4px)' }}
                            transition={{ duration: reduceVoiceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className="elena-working-shimmer"
                            role="status"
                            aria-live="polite"
                          >
                            {loadingActivities.at(-1) || 'Working through your request…'}
                          </motion.span>
                        </AnimatePresence>
                        <ToolActivityDisclosure steps={loadingActivities} active />
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
        {!voiceActive && <div className="bg-[color:var(--portal-card)]/90 backdrop-blur-md p-3 shrink-0">
          <AnimatePresence>
            {voiceError && (
              <motion.div
                key="voice-notice"
                initial={reduceVoiceMotion ? false : { height: 0, opacity: 0, y: 6, filter: 'blur(4px)' }}
                animate={{ height: 'auto', opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduceVoiceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: 6, filter: 'blur(4px)' }}
                transition={{ duration: reduceVoiceMotion ? 0 : 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="overflow-hidden"
              >
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 pl-3 pr-1 text-[10px] text-rose-700 dark:text-rose-300">
                  <p role="status" className="min-w-0 flex-1 py-2">{voiceError}</p>
                  <button
                    type="button"
                    aria-label="Dismiss voice notice"
                    onClick={() => {
                      setVoiceError('')
                      voiceStartButtonRef.current?.focus()
                    }}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-rose-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            className="relative flex items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-1.5 focus-within:border-[#caa24c]/50 transition-colors"
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
              className="mr-2 text-[color:var(--portal-muted)] hover:text-[#caa24c] transition-colors p-1 rounded-md cursor-pointer"
            >
              <Paperclip size={14} />
            </button>

            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message or ask Elena anything..."
              className="portal-input-transparent flex-1 bg-transparent py-1 text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none"
              disabled={isLoading}
            />

            <button
              ref={voiceStartButtonRef}
              type={input.trim() || attachments.length > 0 ? 'submit' : 'button'}
              onClick={input.trim() || attachments.length > 0 ? undefined : startVoice}
              onMouseEnter={() => setVoiceButtonHovered(true)}
              onMouseLeave={() => setVoiceButtonHovered(false)}
              onFocus={() => setVoiceButtonHovered(true)}
              onBlur={() => setVoiceButtonHovered(false)}
              disabled={isLoading || (!input.trim() && attachments.length === 0 && voiceState !== 'ended')}
              aria-label={input.trim() || attachments.length > 0 ? 'Send message' : 'Start voice conversation with Elena'}
              title={input.trim() || attachments.length > 0 ? 'Send message' : 'Start voice conversation'}
              className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#caa24c]/35 bg-[#caa24c]/10 text-[#a8792f] transition-all hover:bg-[#caa24c]/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AnimatePresence mode="wait" initial={false}>
                {input.trim() || attachments.length > 0 ? (
                  <motion.span key="send" initial={{ opacity: 0, y: 4, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <ArrowUp size={17} strokeWidth={2.4} />
                  </motion.span>
                ) : (
                  <motion.span key="voice" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }}>
                    <ElenaVoiceWave active={voiceButtonHovered && !input.trim() && attachments.length === 0} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </form>
          <p className="mt-1.5 text-[9px] text-center text-[color:var(--portal-muted)] flex items-center justify-center gap-1">
            <Info size={9} />
            Queries run securely on the server with owner authorization.
          </p>
        </div>}
      </div>
    </motion.aside>
  )
}

function ElenaVoiceAtmosphere({ level, reducedMotion }: { level: number; reducedMotion: boolean }) {
  const audio = useMotionValue(0)
  const pulse = useSpring(audio, { stiffness: 120, damping: 24, mass: 0.7 })
  const opacity = useTransform(pulse, [0, 1], [0.4, 0.9])
  const scale = useTransform(pulse, [0, 1], [1, 1.18])
  const drift = useTransform(pulse, [0, 1], [0, 24])
  const counterDrift = useTransform(pulse, [0, 1], [0, -18])

  useEffect(() => {
    const rms = Math.max(0, Math.min(1, level)) / 4.5
    audio.set(reducedMotion ? 0 : Math.min(1, Math.pow(Math.max(0, rms - 0.006) * 11, 0.65)))
  }, [audio, level, reducedMotion])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -inset-1/4"
        style={{
          background: 'radial-gradient(ellipse at 50% 42%, rgba(217,183,117,0.32), rgba(235,218,182,0.16) 38%, transparent 72%)',
          opacity: reducedMotion ? 0.4 : opacity,
          scale: reducedMotion ? 1 : scale,
        }}
      />
      <motion.div
        className="absolute -inset-1/4"
        style={{
          background: 'radial-gradient(ellipse at 30% 68%, rgba(207,170,110,0.25), transparent 58%), radial-gradient(ellipse at 76% 25%, rgba(244,222,177,0.3), transparent 55%)',
          opacity: reducedMotion ? 0.4 : opacity,
          x: reducedMotion ? 0 : drift,
          y: reducedMotion ? 0 : counterDrift,
          scale: reducedMotion ? 1 : scale,
        }}
      />
    </div>
  )
}

function ElenaVoiceWave({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion()
  const bars = [
    { x: 4, height: 7 },
    { x: 8, height: 11 },
    { x: 12, height: 15 },
    { x: 16, height: 11 },
    { x: 20, height: 7 },
  ]
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="block h-5 w-5 shrink-0 overflow-visible">
      {bars.map(({ x, height }, index) => (
        <motion.line
          key={index}
          x1={x}
          x2={x}
          y1={12 - height / 2}
          y2={12 + height / 2}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ scaleY: active && !reduceMotion ? [0.62, 0.88, 1.12, 0.72, 1, 0.62] : 1 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          transition={active && !reduceMotion ? {
            duration: 0.72,
            delay: Math.abs(2 - index) * 0.07,
            repeat: Infinity,
            ease: 'easeInOut',
          } : { duration: 0.2, ease: 'easeOut' }}
        />
      ))}
    </svg>
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

function ElenaNewContactCard({ payload, onSuccess }: { payload: NewContactCardPayload; onSuccess: (message: string) => void }) {
  const [fullName, setFullName] = useState(payload.fullName || '')
  const [email, setEmail] = useState(payload.email || '')
  const [phone, setPhone] = useState(payload.phone || '')
  const [eventType, setEventType] = useState(payload.eventType || '')
  const [source, setSource] = useState(payload.source || 'Manual Entry')
  const [targetDate, setTargetDate] = useState(payload.targetDate || '')
  const [guestCount, setGuestCount] = useState(payload.guestCount ? String(payload.guestCount) : '')
  const [notes, setNotes] = useState(payload.notes || '')
  const [isSaving, setIsSaving] = useState(false)
  const [createdInquiryId, setCreatedInquiryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const guestCountInvalid = Boolean(guestCount.trim() && (!Number.isInteger(Number(guestCount)) || Number(guestCount) < 1 || Number(guestCount) > LUXOR_MAX_GUESTS))
  const canSave = Boolean(fullName.trim() && (email.trim() || phone.trim()) && eventType.trim()) && !guestCountInvalid && !createdInquiryId

  const handleCreate = async () => {
    if (!canSave || isSaving) return
    setIsSaving(true)
    setError(null)

    try {
      const response = await submitLuxorIdempotentForm('elena-contact', '/api/portal/elena-chat/actions', {
          action: 'CREATE_CONTACT',
          contact: {
            fullName,
            email,
            phone,
            eventType: eventType.trim(),
            source,
            targetDate,
            guestCount: guestCount ? Number(guestCount) : null,
            notes,
          },
      })
      const result = await response.json().catch(() => ({})) as { error?: string; inquiry?: { id?: string; full_name?: string } }
      if (!response.ok) throw new Error(result.error || 'The contact could not be added.')
      const inquiryId = result.inquiry?.id || ''
      setCreatedInquiryId(inquiryId)
      window.dispatchEvent(new Event('luxor:inquiries-updated'))
      onSuccess(`${result.inquiry?.full_name || fullName.trim()} is now in Luxor’s CRM. No marketing consent or campaign enrollment was added.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The contact could not be added.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="ml-8 mt-3 w-[calc(96%-2rem)] overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-lg shadow-black/10">
      <div className="flex items-start gap-2.5 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3">
        <UserRoundCheck size={15} className="mt-0.5 shrink-0 text-[#a8792f] dark:text-[#f1d27a]" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-[color:var(--portal-text)]">Review new contact</h4>
          <p className="mt-0.5 text-[10px] leading-4 text-[color:var(--portal-muted)]">Creates a CRM contact only. Marketing and SMS consent stay off.</p>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <ElenaContactField label="Full name" value={fullName} onChange={setFullName} placeholder="Full name" required />
          <ElenaContactField label="Email" value={email} onChange={setEmail} placeholder="name@example.com" type="email" />
          <ElenaContactField label="Phone" value={phone} onChange={setPhone} placeholder="(210) 555-0199" type="tel" />
          <LuxorEventTypeCombobox
            label="Event Type"
            value={eventType}
            onChange={setEventType}
            required
            variant="portal"
            className="min-w-0"
            labelClassName="!mb-1 !text-[9px] !tracking-wider"
            inputClassName="!min-h-9 !rounded-xl !px-2.5 !py-1.5 !text-[10px]"
            listClassName="text-[10px]"
          />
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Source</label>
            <PortalSelect value={source} onChange={setSource} className="!min-w-0 w-full" buttonClassName="min-h-9 px-2.5 py-1.5 text-[10px]" options={ELENA_CONTACT_SOURCE_OPTIONS} />
          </div>
          <ElenaContactField label="Event date" value={targetDate} onChange={setTargetDate} placeholder="YYYY-MM-DD or date range" />
          <div><ElenaContactField label="Guests" value={guestCount} onChange={setGuestCount} placeholder="Optional" type="number" />{guestCountInvalid ? <p role="alert" className="mt-1 text-[10px] text-rose-700 dark:text-rose-200">Guest count must be a whole number from 1 to 180.</p> : null}</div>
        </div>

        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={3000} placeholder="Context or follow-up notes (optional)" className="w-full resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-[10px] leading-4 text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50" />

        {!email.trim() && !phone.trim() ? <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] leading-4 text-amber-800 dark:text-amber-200">Add an email or phone number so Luxor can follow up.</p> : null}
        {error ? <p className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-[10px] leading-4 text-rose-700 dark:text-rose-200">{error}</p> : null}

        {createdInquiryId ? (
          <Link href={`/portal/leads/${createdInquiryId}`} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#caa24c]/35 bg-[#caa24c]/10 px-3 text-[10px] font-bold uppercase tracking-wider text-[#8c6529] transition-colors hover:bg-[#caa24c]/15 dark:text-[#f1d27a]">
            Open contact <ExternalLink size={11} />
          </Link>
        ) : (
          <button type="button" onClick={handleCreate} disabled={isSaving || !canSave} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#caa24c] px-3 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#dfbd68] disabled:cursor-not-allowed disabled:bg-[color:var(--portal-soft)] disabled:text-[color:var(--portal-muted)]">
            {isSaving ? <PortalConstellationLoader size={14} tone="white" /> : <UserRoundCheck size={12} />} {isSaving ? 'Adding contact…' : 'Add contact'}
          </button>
        )}
      </div>
    </div>
  )
}

function ElenaContactField({ label, value, onChange, placeholder, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: React.HTMLInputTypeAttribute; required?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">{label}{required ? ' *' : ''}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} min={type === 'number' ? 1 : undefined} max={type === 'number' ? LUXOR_MAX_GUESTS : undefined} step={type === 'number' ? 1 : undefined} className="min-h-9 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2.5 py-1.5 text-[10px] text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50" />
    </div>
  )
}

function ElenaTourInviteCard({ payload, onSuccess }: { payload: TourInviteCardPayload; onSuccess: (message: string) => void }) {
  const [tourDate, setTourDate] = useState(payload.tourDate)
  const [tourTime, setTourTime] = useState(normalizeLuxorTimeDropdownValue(payload.tourTime))
  const [meetingType, setMeetingType] = useState(payload.meetingType || 'Private Venue Tour')
  const [durationMinutes, setDurationMinutes] = useState(String(payload.durationMinutes || 30))
  const [clientFacingNotes, setClientFacingNotes] = useState(payload.clientFacingNotes)
  const [visitIntent, setVisitIntent] = useState<'new_visit' | 'reschedule' | ''>('')
  const scheduleAttempt = useRef<{ signature: string; id: string } | null>(null)
  const [visitId, setVisitId] = useState(() => crypto.randomUUID())
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missingItems = [
    !payload.clientEmail ? 'client email' : null,
    !tourDate ? 'tour date' : null,
    !tourTime ? 'start time' : null,
    !visitIntent ? 'whether this is a new visit or a reschedule' : null,
  ].filter(Boolean) as string[]

  const handleSend = async () => {
    if (missingItems.length > 0 || isSending) return
    setIsSending(true)
    setError(null)

    try {
      const scheduleBody = {
        inquiryId: payload.inquiryId,
        action: 'schedule-tour',
        visitIntent,
        visitId,
        expectedVisitId: payload.currentVisitId,
        expectedVisitVersion: payload.currentVisitVersion,
        tourDate,
        tourTime,
        meetingType,
        durationMinutes: Number(durationMinutes),
        clientFacingNotes,
      }
      const signature = JSON.stringify(scheduleBody)
      if (scheduleAttempt.current?.signature !== signature) {
        scheduleAttempt.current = { signature, id: crypto.randomUUID() }
      }
      const response = await fetch('/api/tour-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scheduleBody, scheduleRequestId: scheduleAttempt.current.id }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string; reminderJobs?: unknown[] }
      if (!response.ok) throw new Error(result.error || 'The invite could not be sent.')
      onSuccess(`Tour invite sent to ${payload.clientName}. One branded calendar email is on its way${result.reminderJobs?.length ? `, with ${result.reminderJobs.length} reminder${result.reminderJobs.length === 1 ? '' : 's'} queued for later` : ''}.`)
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
        <div>
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Visit action</label>
          <PortalSelect value={visitIntent} onChange={(value) => {
            const intent = value as 'new_visit' | 'reschedule' | ''
            setVisitIntent(intent)
            setVisitId(intent === 'reschedule' && payload.currentVisitId ? payload.currentVisitId : crypto.randomUUID())
          }} options={[
            { value: 'new_visit', label: 'Schedule a separate visit' },
            { value: 'reschedule', label: 'Reschedule the current visit' },
          ]} className="w-full" buttonClassName="min-h-9" placeholder="Choose visit action" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Date</label>
            <PortalDatePicker value={tourDate} onChange={setTourDate} className="!min-w-0 w-full [&>button]:min-h-9 [&>button]:px-2.5 [&>button]:py-1.5 [&>button]:text-[10px]" placeholder="Choose date" maxMonths={36} />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Time</label>
            <PortalSelect value={tourTime} onChange={setTourTime} className="!min-w-0 w-full" buttonClassName="min-h-9 px-2.5 py-1.5 text-[10px]" placeholder="Choose time" options={LUXOR_TIME_DROPDOWN_OPTIONS} />
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
          {isSending ? <PortalConstellationLoader size={14} tone="white" /> : <Send size={12} />} {isSending ? 'Sending invite…' : 'Send invite'}
        </button>
      </div>
    </div>
  )
}

const TOUR_MEETING_TYPE_OPTIONS = [
  { value: 'Private Venue Tour', label: 'Private Venue Tour' },
  { value: 'Wedding Walkthrough', label: 'Wedding Walkthrough' },
  { value: 'Quinceañera Walkthrough', label: 'Quinceañera Walkthrough' },
  { value: 'Event Planning Consultation', label: 'Event Planning Consultation' },
  { value: 'Vendor Walkthrough', label: 'Vendor Walkthrough' },
]

const ELENA_CONTACT_SOURCE_OPTIONS = [
  { value: 'Manual Entry', label: 'Manual entry' },
  { value: 'Phone', label: 'Phone' },
  { value: 'Walk-in', label: 'Walk-in' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'The Knot', label: 'The Knot' },
  { value: 'Vendor / Partner', label: 'Vendor / partner' },
]

const TOUR_DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
  { value: '90', label: '90 minutes' },
]

/* Local formatting helper function */
function renderFormattedLine(line: string, key: React.Key) {
  const trimmed = line.trim()
  if (!trimmed) return <div key={key} className="h-2" />

  const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
  if (headingMatch) {
    return (
      <h4 key={key} className="mt-2.5 mb-1.5 font-serif text-sm font-semibold text-[color:var(--portal-text)]">
        {renderBoldAndLinks(headingMatch[2])}
      </h4>
    )
  }

  const bulletMatch = trimmed.match(/^(?:[-*•])\s+(.+)$/)
  if (bulletMatch) {
    return (
      <div key={key} className="mb-1.5 flex items-start gap-2 pl-1 text-sm leading-relaxed">
        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#caa24c]" />
        <span className="min-w-0 flex-1">{renderBoldAndLinks(bulletMatch[1])}</span>
      </div>
    )
  }

  const orderedMatch = trimmed.match(/^(\d+[.)])\s+(.+)$/)
  if (orderedMatch) {
    return (
      <div key={key} className="mb-1.5 flex items-start gap-2 pl-1 text-sm leading-relaxed">
        <span className="shrink-0 font-semibold text-[#a8792f] dark:text-[#e3bc65]">{orderedMatch[1]}</span>
        <span className="min-w-0 flex-1">{renderBoldAndLinks(orderedMatch[2])}</span>
      </div>
    )
  }

  const quoteMatch = trimmed.match(/^>\s*(.+)$/)
  if (quoteMatch) {
    return (
      <blockquote
        key={key}
        className="my-2 border-l-2 border-[#caa24c]/50 bg-[color:var(--portal-soft)] px-3 py-1.5 text-xs italic leading-relaxed text-[color:var(--portal-muted)] rounded-r-lg"
      >
        {renderBoldAndLinks(quoteMatch[1])}
      </blockquote>
    )
  }

  return <p key={key} className="mb-2 text-sm leading-relaxed">{renderBoldAndLinks(trimmed)}</p>
}

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
          tableHtml.push(renderFormattedLine(line, i))
        }
      }
    }
    if (inTable) {
      tableHtml.push(renderTable(tableRows, lines.length))
    }
    return <div>{tableHtml}</div>
  }

  return content.split('\n').map((line, idx) => renderFormattedLine(line, idx))
}

function renderTable(rows: string[][], keyIndex: number) {
  if (rows.length === 0) return null
  const headers = rows[0]
  const bodyRows = rows.slice(1)
  return (
    <div key={keyIndex} className="my-3 overflow-x-auto rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] portal-scrollbar">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[color:var(--portal-border)] bg-[#caa24c]/10 font-serif text-[#a8792f] dark:text-[#f1d27a]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--portal-border)]">
          {bodyRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-[#caa24c]/5 text-[color:var(--portal-text)]">
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
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-semibold text-[#a8792f] dark:text-[#e3bc65]">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={idx} className="italic">{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={idx} className="rounded bg-[color:var(--portal-soft)] px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>
    }
    return part
  })
}
