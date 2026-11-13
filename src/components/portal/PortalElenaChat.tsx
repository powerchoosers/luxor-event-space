'use client'
import { LUXOR_MAX_GUESTS } from '@/lib/luxorInquiryTypes'
import { formatLuxorDate } from '@/lib/luxorDateFormatting'
import { isSafeWorkflowLink } from '@/lib/luxorWorkflowLink'

import React, { useState, useEffect, useLayoutEffect, useRef, useId, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

  Mic,
  MicOff,
  PhoneOff,
  ArrowUp,
  Camera,
  FileText,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from '@/lib/icons/phosphor-compat'
import { submitLuxorIdempotentForm } from '@/lib/luxorSubmissionIdempotency'
import { ELENA_CHAT_CONTACT_PATTERN, isEmailToken, stripOwnerFacingIds } from '@/lib/luxorElenaChatMessageFormat'
import { formatPhoneDisplay, normalizePhoneNumber } from '@/lib/luxorPhoneClient'
import { startLuxorBrowserCall } from '@/lib/luxorVoiceClient'
import { LuxorEventTypeCombobox } from '@/components/LuxorEventTypeCombobox'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { PortalCloseButton, PortalContactAvatar, PortalModal, PortalSelect, PortalConstellationLoader } from './PortalUI'
import { PortalPdfViewer } from '@/components/portal/PortalPdfViewer'
import { ElenaLiveVoiceClient, type ElenaVoiceState } from '@/lib/elenaLiveVoiceClient'
import { ElenaSilkOrb } from './ElenaSilkOrb'
import { ElenaEmailDraftCard, EmailDraftPayload } from './ElenaEmailDraftCard'
import { ElenaWorkflowDraftCard, type ElenaWorkflowDraftPayload } from './ElenaWorkflowDraftCard'
import {
  ElenaLeadUpdateCard,
  ElenaContractCard,
  ElenaInvoiceCard,
  ElenaTaskCard,
  ElenaDeveloperSupportCard,
  LeadUpdatePayload,
  ContractCardPayload,
  InvoiceCardPayload,
  TaskCardPayload,
  DeveloperSupportCardPayload,
  collectDeveloperSupportAttachmentCandidates,
  type DeveloperSupportSavedAttachment,
} from './ElenaCRMContainers'
import { ElenaSlashCommandMenu, ElenaSlashTriggerBadge } from '@/components/portal/ElenaSlashCommandMenu'
import {
  ELENA_SYSTEM_SLASH_COMMANDS,
  applySlashCommandToInput,
  filterElenaSlashCommands,
  getElenaSlashQuery,
  loadPersonalElenaSlashCommands,
  parseActiveElenaSlashCommand,
  parseTicketSlashCommand,
  resolvePersonalSlashExpansion,
  type ElenaSlashCommand,
} from '@/lib/luxorElenaSlashCommands'
import type { PortalRole } from '@/lib/luxorPortalAccess'

type ExecutedQuery = {
  query: string
  result: unknown
}

type ElenaConfirmation = { summary: string; token?: string; expiresAt?: string; query?: string; kind?: string }

function confirmationEndpoint(confirmation: ElenaConfirmation) {
  if (confirmation.query !== undefined) return null
  if (confirmation.kind === undefined || confirmation.kind === 'create_note') return '/api/portal/elena-confirmation'
  if (confirmation.kind === 'close_tour_days') return '/api/portal/elena-tour-confirmation'
  if (confirmation.kind === 'record_cleaning_completion') return '/api/portal/elena-cleaning-confirmation'
  return null
}

type MessageAttachment = {
  id?: string
  name: string
  type: string
  kind: 'image' | 'document' | 'text'
  dataUrl?: string
  textContent?: string
  storagePath?: string
}

type Message = {
  id?: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachment[]
  executedQueries?: ExecutedQuery[]
  toolActivity?: string[]
  toolActivityFailed?: boolean
  confirmation?: ElenaConfirmation
  confirmationError?: string
  isConfirmed?: boolean
  isCancelled?: boolean
  emailDraft?: EmailDraftPayload
  crmUpdateCard?: LeadUpdatePayload
  contractCard?: ContractCardPayload
  invoiceCard?: InvoiceCardPayload
  taskCard?: TaskCardPayload
  developerSupportCard?: DeveloperSupportCardPayload
  contactCard?: LeadContactCardPayload
  newContactCard?: NewContactCardPayload
  tourInviteCard?: TourInviteCardPayload
  workflowDraft?: ElenaWorkflowDraftPayload
  workflowLinks?: Array<{ name: string; href: string | null; note: string }>
  textCampaignDraft?: { name: string; bodyTemplate: string; campaignType: string }
  voiceTranscript?: Array<{ role: 'user' | 'assistant'; text: string }>
}

type ElenaChatResponse = {
  reply: string
  executedQueries: ExecutedQuery[]
  toolActivity?: string[]
  confirmation?: ElenaConfirmation
  textCampaignDraft?: { name: string; bodyTemplate: string; campaignType: string }
  emailDraft?: EmailDraftPayload
  crmUpdateCard?: LeadUpdatePayload
  contractCard?: ContractCardPayload
  invoiceCard?: InvoiceCardPayload
  taskCard?: TaskCardPayload
  developerSupportCard?: DeveloperSupportCardPayload
  contactCard?: LeadContactCardPayload
  newContactCard?: NewContactCardPayload
  tourInviteCard?: TourInviteCardPayload
  workflowDraft?: ElenaWorkflowDraftPayload
  workflowLinks?: Array<{ name: string; href: string | null; note: string }>
  navigation?: { href: string }
  userAttachments?: MessageAttachment[]
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
    || message.developerSupportCard
    || message.contactCard
    || message.newContactCard
    || message.tourInviteCard
    || message.workflowDraft
    || message.workflowLinks?.length
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

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

async function readElenaChatResponse(
  response: Response,
  onActivity: (step: string) => void,
  signal?: AbortSignal,
): Promise<ElenaChatResponse> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return response.json() as Promise<ElenaChatResponse>
  }
  if (!response.body) throw new Error('Elena’s progress stream ended before the reply arrived.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const resultRef: { current: { ok: boolean; status: number; data: ElenaChatResponse & { error?: string } } | null } = { current: null }
  let streamError = ''

  const abortReader = () => {
    void reader.cancel()
  }
  signal?.addEventListener('abort', abortReader, { once: true })

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

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { value, done } = await reader.read()
      if (done) break
      consume(decoder.decode(value, { stream: true }))
    }
    consume(decoder.decode())
  } finally {
    signal?.removeEventListener('abort', abortReader)
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
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
  portalRole: PortalRole
  userEmail: string
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

const ELENA_MAX_PDF_BYTES = 8 * 1024 * 1024
const ELENA_MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ELENA_MAX_TEXT_BYTES = 512 * 1024

const ELENA_ATTACHMENT_LAYOUT_TRANSITION = {
  layout: { type: 'spring' as const, stiffness: 520, damping: 44, mass: 0.8 },
  opacity: { duration: 0.16 },
  scale: { duration: 0.16 },
}

const ELENA_COMPOSER_LINE_HEIGHT = 20
const ELENA_COMPOSER_MAX_LINES = 4
const ELENA_COMPOSER_PAD = 4

const ElenaGrowingTextarea = React.forwardRef<HTMLTextAreaElement, {
  value: string
  reduceMotion: boolean
  className?: string
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
}>(
  function ElenaGrowingTextarea({ value, reduceMotion, className, ...props }, forwardedRef) {
    const localRef = useRef<HTMLTextAreaElement>(null)
    const [height, setHeight] = useState(ELENA_COMPOSER_LINE_HEIGHT + ELENA_COMPOSER_PAD * 2)
    const [scrollable, setScrollable] = useState(false)

    const setRefs = (node: HTMLTextAreaElement | null) => {
      localRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    }

    useLayoutEffect(() => {
      const node = localRef.current
      if (!node) return
      const previousHeight = node.style.height
      node.style.height = '0px'
      const scrollHeight = node.scrollHeight
      const maxHeight = ELENA_COMPOSER_LINE_HEIGHT * ELENA_COMPOSER_MAX_LINES + ELENA_COMPOSER_PAD * 2
      const nextHeight = Math.min(Math.max(scrollHeight, ELENA_COMPOSER_LINE_HEIGHT + ELENA_COMPOSER_PAD * 2), maxHeight)
      node.style.height = previousHeight
      setHeight(nextHeight)
      setScrollable(scrollHeight > maxHeight + 1)
    }, [value])

    return (
      <motion.textarea
        {...props}
        ref={setRefs}
        value={value}
        rows={1}
        animate={{ height }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
        style={{
          lineHeight: `${ELENA_COMPOSER_LINE_HEIGHT}px`,
          paddingTop: ELENA_COMPOSER_PAD,
          paddingBottom: ELENA_COMPOSER_PAD,
        }}
        className={`${className || ''} box-border resize-none py-0 leading-5 ${scrollable ? 'overflow-y-auto portal-scrollbar' : 'overflow-hidden'}`}
      />
    )
  },
)

export function PortalElenaChat({ isOpen, onClose, activePath, portalRole, userEmail }: PortalElenaChatProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [personalSlashCommands, setPersonalSlashCommands] = useState<ElenaSlashCommand[]>([])
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0)
  const [slashManageExpanded, setSlashManageExpanded] = useState(false)
  const [isElenaResponding, setIsElenaResponding] = useState(false)
  const [isConfirmingAction, setIsConfirmingAction] = useState(false)
  const [isSessionBootstrapping, setIsSessionBootstrapping] = useState(false)
  const [loadingActivities, setLoadingActivities] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sessions History States
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [historyUnavailable, setHistoryUnavailable] = useState(false)
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
  const [attachmentNotice, setAttachmentNotice] = useState('')
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachMenuCoords, setAttachMenuCoords] = useState<{ left: number; bottom: number } | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const attachPlusRef = useRef<HTMLButtonElement>(null)
  const slashDetailsInputRef = useRef<HTMLTextAreaElement>(null)
  const plainComposerInputRef = useRef<HTMLTextAreaElement>(null)
  const composerAnchorRef = useRef<HTMLDivElement>(null)
  const hadActiveSlashRef = useRef(false)
  const attachStripRef = useRef<HTMLDivElement>(null)
  const attachCountRef = useRef(0)
  const elenaChatAbortRef = useRef<AbortController | null>(null)
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
    if (voiceClientRef.current || isElenaResponding || !isOpen) return
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
          client.sendCommentary('Sending by voice is unavailable. Please use the email workspace to review and send the draft.', delegationId)
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

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })

  const readFileAsText = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsText(file)
  })

  const addElenaAttachmentFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setAttachmentNotice('')
    const rejected: string[] = []
    const next: AttachedFile[] = []

    for (const file of files) {
      const id = Math.random().toString(36).slice(2, 9)
      const lowerName = file.name.toLowerCase()
      const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
      const isImage = file.type.startsWith('image/')
      const isText =
        file.type === 'text/plain'
        || file.type === 'text/csv'
        || file.type === 'application/csv'
        || lowerName.endsWith('.txt')
        || lowerName.endsWith('.csv')

      if (!isPdf && !isImage && !isText) {
        rejected.push(file.name)
        continue
      }
      if (isPdf && file.size > ELENA_MAX_PDF_BYTES) {
        rejected.push(`${file.name} (PDF limit 8 MB)`)
        continue
      }
      if (isImage && file.size > ELENA_MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} (photo limit 5 MB)`)
        continue
      }
      if (isText && file.size > ELENA_MAX_TEXT_BYTES) {
        rejected.push(`${file.name} (text limit 512 KB)`)
        continue
      }

      try {
        if (isImage || isPdf) {
          const dataUrl = await readFileAsDataUrl(file)
          next.push({
            id,
            name: file.name,
            type: isPdf ? 'application/pdf' : file.type,
            dataUrl,
          })
        } else {
          const textContent = await readFileAsText(file)
          next.push({ id, name: file.name, type: file.type || 'text/plain', textContent })
        }
      } catch {
        rejected.push(file.name)
      }
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next])
    }
    if (rejected.length > 0) {
      setAttachmentNotice(
        rejected.length === 1
          ? `Could not attach ${rejected[0]}. Use a photo, PDF bill, or .txt/.csv under the size limit.`
          : `Some files were skipped: ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}.`,
      )
    }
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) void addElenaAttachmentFiles(Array.from(files))
    if (imageInputRef.current) imageInputRef.current.value = ''
    setAttachMenuOpen(false)
  }

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) void addElenaAttachmentFiles(Array.from(files))
    if (documentInputRef.current) documentInputRef.current.value = ''
    setAttachMenuOpen(false)
  }

  const handleComposerPaste = (e: React.ClipboardEvent) => {
    const pasted: File[] = []
    if (e.clipboardData.files.length > 0) {
      pasted.push(...Array.from(e.clipboardData.files))
    } else {
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (file) pasted.push(file)
      }
    }
    if (!pasted.length) return
    e.preventDefault()
    void addElenaAttachmentFiles(pasted)
  }

  const repositionAttachMenu = useCallback(() => {
    const anchor = attachPlusRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const menuWidth = 208
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12)
    const bottom = Math.max(12, window.innerHeight - rect.top + 8)
    setAttachMenuCoords({ left, bottom })
  }, [])

  const toggleAttachMenu = useCallback(() => {
    if (attachMenuOpen) {
      setAttachMenuOpen(false)
      return
    }
    repositionAttachMenu()
    setAttachMenuOpen(true)
  }, [attachMenuOpen, repositionAttachMenu])

  useLayoutEffect(() => {
    if (!attachMenuOpen) {
      setAttachMenuCoords(null)
      return
    }
    repositionAttachMenu()
    window.addEventListener('resize', repositionAttachMenu)
    window.addEventListener('scroll', repositionAttachMenu, true)
    return () => {
      window.removeEventListener('resize', repositionAttachMenu)
      window.removeEventListener('scroll', repositionAttachMenu, true)
    }
  }, [attachMenuOpen, repositionAttachMenu])

  useEffect(() => {
    if (!attachMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (attachMenuRef.current?.contains(target) || attachPlusRef.current?.contains(target)) return
      setAttachMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAttachMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [attachMenuOpen])

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const imageAttachments = attachments.filter((att) => Boolean(att.dataUrl && att.type.startsWith('image/')))
  const documentAttachments = attachments.filter((att) => !(att.dataUrl && att.type.startsWith('image/')))

  useEffect(() => {
    const count = attachments.length
    const strip = attachStripRef.current
    if (!strip || count <= attachCountRef.current) {
      attachCountRef.current = count
      return
    }
    attachCountRef.current = count
    requestAnimationFrame(() => {
      strip.scrollTo({ left: strip.scrollWidth, behavior: reduceVoiceMotion ? 'auto' : 'smooth' })
    })
  }, [attachments.length, reduceVoiceMotion])

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
      setIsSessionBootstrapping(true)
      void loadSessionsList(undefined, true)
    } else {
      sessionRequestRef.current += 1
      messageRequestRef.current += 1
      setShowSessionsList(false)
      setMessages([])
      setLoadedSessionId(null)
      setIsSessionBootstrapping(false)
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
      if (response.status === 403) {
        if (requestId !== sessionRequestRef.current) return
        setHistoryUnavailable(true)
        setSessions([])
        setShowSessionsList(false)
        if (currentSessionId) setMessages([])
        setCurrentSessionId(null)
        setLoadedSessionId(null)
        setIsSessionBootstrapping(false)
        return
      }
      if (!response.ok) throw new Error('Failed to load sessions list')
      const data = (await response.json()) as ChatSession[]
      if (requestId !== sessionRequestRef.current) return
      setHistoryUnavailable(false)
      setSessions(data)

      if (data.length > 0) {
        const targetId = selectSessionId || currentSessionId || data[0].id
        // Only load messages if we switch to a different active session or initializing
        if (forceReload || targetId !== currentSessionId || messages.length <= 1 || loadedSessionId !== targetId) {
          setCurrentSessionId(targetId)
          await loadSessionMessages(targetId)
        }
      } else {
        await handleCreateSession(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (requestId === sessionRequestRef.current) setIsSessionBootstrapping(false)
    }
  }

  const loadSessionMessages = async (sessionId: string) => {
    const requestId = ++messageRequestRef.current
    setLoadedSessionId(null)
    setMessages([])
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
    }
  }

  const handleCreateSession = async (forcePersistent = false) => {
    sessionRequestRef.current += 1
    const requestId = ++messageRequestRef.current
    setCurrentSessionId(null)
    setLoadedSessionId(null)
    setMessages([])
    setInput('')
    setAttachments([])
    if (historyUnavailable && !forcePersistent) { setShowSessionsList(false); setIsSessionBootstrapping(false); return }
    setIsSessionBootstrapping(true)
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'POST'
      })
      if (response.status === 403) {
        if (requestId === messageRequestRef.current) { setHistoryUnavailable(true); setSessions([]); setShowSessionsList(false) }
        return
      }
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
      if (requestId === messageRequestRef.current) setIsSessionBootstrapping(false)
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

  const stopElenaResponse = useCallback(() => {
    messageRequestRef.current += 1
    elenaChatAbortRef.current?.abort()
    elenaChatAbortRef.current = null
    setIsElenaResponding(false)
    setLoadingActivities([])
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setAttachMenuOpen(false)
      stopElenaResponse()
    }
  }, [isOpen, stopElenaResponse])

  useEffect(() => {
    if (!isOpen || !userEmail) return
    setPersonalSlashCommands(loadPersonalElenaSlashCommands(userEmail))
  }, [isOpen, userEmail])

  const slashCommands = React.useMemo(() => {
    const system = portalRole === 'owner' ? ELENA_SYSTEM_SLASH_COMMANDS : []
    return [...system, ...personalSlashCommands]
  }, [portalRole, personalSlashCommands])

  const activeSlashCommand = parseActiveElenaSlashCommand(input, slashCommands)
  const slashMenuQuery = getElenaSlashQuery(input)
  const slashMenuVisible = Boolean(
    !activeSlashCommand && slashMenuQuery !== null && /^\/[a-z0-9_-]*$/i.test(input.trim()),
  )
  const filteredSlashCommands = filterElenaSlashCommands(slashCommands, slashMenuQuery)

  useEffect(() => {
    setSlashHighlightIndex(0)
  }, [input, slashMenuVisible])

  useEffect(() => {
    if (!slashMenuVisible) setSlashManageExpanded(false)
  }, [slashMenuVisible])

  useEffect(() => {
    if (activeSlashCommand) {
      hadActiveSlashRef.current = true
      return
    }
    if (!hadActiveSlashRef.current) return
    hadActiveSlashRef.current = false
    requestAnimationFrame(() => {
      plainComposerInputRef.current?.focus()
    })
  }, [activeSlashCommand])

  const persistSessionMessages = useCallback(async (nextMessages: Message[]) => {
    if (!currentSessionId || historyUnavailable) return
    try {
      const response = await fetch('/api/portal/elena-chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentSessionId, messages: nextMessages }),
      })
      if (!response.ok) throw new Error('The screenshot uploaded, but this chat could not save it.')
    } catch (error) {
      console.error('Could not save Elena chat messages:', error)
      throw error
    }
  }, [currentSessionId, historyUnavailable])

  const pickSlashCommand = useCallback((command: ElenaSlashCommand) => {
    setInput(applySlashCommandToInput(command, input))
    requestAnimationFrame(() => {
      slashDetailsInputRef.current?.focus()
    })
  }, [input])

  const confirmHighlightedSlashCommand = useCallback(() => {
    if (!slashMenuVisible || !filteredSlashCommands.length) return false
    pickSlashCommand(filteredSlashCommands[slashHighlightIndex])
    return true
  }, [filteredSlashCommands, pickSlashCommand, slashHighlightIndex, slashMenuVisible])

  const updateActiveSlashRest = (rest: string) => {
    if (!activeSlashCommand) return
    const spacer = rest.length > 0 ? ' ' : ''
    setInput(`/${activeSlashCommand.command.trigger}${spacer}${rest}`)
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashManageExpanded) return
    if (!slashMenuVisible || !filteredSlashCommands.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSlashHighlightIndex((index) => (index + 1) % filteredSlashCommands.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSlashHighlightIndex((index) => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      pickSlashCommand(filteredSlashCommands[slashHighlightIndex])
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      pickSlashCommand(filteredSlashCommands[slashHighlightIndex])
    }
  }

  const isSessionHydrating =
    isSessionBootstrapping || Boolean(currentSessionId && loadedSessionId !== currentSessionId)
  const isComposerLocked = isElenaResponding || isConfirmingAction || isSessionHydrating

  const handleSend = async (textToSend: string, onVoiceReply?: (reply: string) => void): Promise<string | null> => {
    if ((!textToSend.trim() && attachments.length === 0) || isElenaResponding || isSessionHydrating) return null
    const requestId = ++messageRequestRef.current
    elenaChatAbortRef.current?.abort()
    const abortController = new AbortController()
    elenaChatAbortRef.current = abortController

    const rawMessageText = textToSend.trim()
    let userMessageText = rawMessageText
    const personalExpansion = resolvePersonalSlashExpansion(rawMessageText, slashCommands)
    if (personalExpansion) userMessageText = personalExpansion
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])

    const messageAttachments: MessageAttachment[] = currentAttachments.map((attachment) => {
      const isImage = Boolean(attachment.dataUrl && attachment.type.startsWith('image/'))
      const isText = Boolean(attachment.textContent)
      return {
        name: attachment.name,
        type: isImage ? attachment.type : attachment.type || 'application/octet-stream',
        kind: isText ? 'text' : isImage ? 'image' : 'document',
        ...(attachment.dataUrl ? { dataUrl: attachment.dataUrl } : {}),
        ...(attachment.textContent ? { textContent: attachment.textContent } : {}),
      }
    })

    const updatedMessages: Message[] = [
      ...messages,
      {
        role: 'user',
        content: userMessageText,
        attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
      },
    ]
    setMessages(updatedMessages)
    let streamedActivities: string[] = []
    setLoadingActivities([])
    setIsElenaResponding(true)

    const ticketFromSlash = parseTicketSlashCommand(rawMessageText, activePath)

    try {
      if (ticketFromSlash) {
        if (portalRole !== 'owner') {
          const denied: Message[] = [
            ...updatedMessages,
            {
              role: 'assistant',
              content: 'Developer tickets are owner-only. Ask Arianna or use Elena for help on this page.',
            },
          ]
          setMessages(denied)
          void persistSessionMessages(denied).catch(() => undefined)
          setIsElenaResponding(false)
          return null
        }
        const ticketReply =
          'I opened a developer ticket for Braxton in the cloud. Review the card below, add screenshots if you need to, then tap Review ticket and Send to developer.'
        const withCard: Message[] = [
          ...updatedMessages,
          {
            role: 'assistant',
            content: ticketReply,
            developerSupportCard: {
              title: ticketFromSlash.title,
              description: ticketFromSlash.description,
              priority: ticketFromSlash.priority,
              pagePath: ticketFromSlash.pagePath,
            },
          },
        ]
        setMessages(withCard)
        void persistSessionMessages(withCard).catch(() => undefined)
        onVoiceReply?.(ticketReply)
        setIsElenaResponding(false)
        if (currentSessionId) void refreshSessionsMetadata()
        return ticketReply
      }

      // Keep cards in saved chat history; the server sends only role and text to the model.
      const apiMessages = updatedMessages.map(({ confirmation: _confirmation, attachments: msgAttachments, ...message }) => ({
        ...message,
        ...(msgAttachments?.length ? { attachments: attachmentsForElenaPersistence(msgAttachments) } : {}),
      }))

      const response = await fetch('/api/portal/elena-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        signal: abortController.signal,
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
      }, abortController.signal)
      if (requestId !== messageRequestRef.current) return null

      if (data.textCampaignDraft) {
        window.localStorage.setItem('luxor_elena_text_campaign_draft', JSON.stringify(data.textCampaignDraft))
        window.dispatchEvent(new CustomEvent('luxor:text-campaign-draft', { detail: data.textCampaignDraft }))
      }

      if (data.navigation?.href) {
        onClose()
        router.push(data.navigation.href)
      }

      setMessages((prev) => {
        const next = [...prev]
        if (data.userAttachments?.length) {
          for (let index = next.length - 1; index >= 0; index -= 1) {
            if (next[index]?.role === 'user') {
              next[index] = { ...next[index], attachments: data.userAttachments }
              break
            }
          }
        }
        return [
          ...next,
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
            developerSupportCard: data.developerSupportCard,
            contactCard: data.contactCard,
            newContactCard: data.newContactCard,
            tourInviteCard: data.tourInviteCard,
            workflowDraft: data.workflowDraft,
            workflowLinks: data.workflowLinks,
            textCampaignDraft: data.textCampaignDraft,
          },
        ]
      })
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
      if (isAbortError(err)) return null
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
        if (elenaChatAbortRef.current === abortController) {
          elenaChatAbortRef.current = null
        }
        setIsElenaResponding(false)
        setLoadingActivities([])
      }
    }
    return null
  }
  voiceSendRef.current = handleSend

  const persistTicketAttachments = (messageIndex: number, saved: DeveloperSupportSavedAttachment[]) => {
    const updatedMessages = messages.map((message, index) => index === messageIndex && message.developerSupportCard
      ? { ...message, developerSupportCard: { ...message.developerSupportCard, savedAttachments: saved } }
      : message)
    setMessages(updatedMessages)
    return persistSessionMessages(updatedMessages)
  }

  const handleWorkflowDraftSaved = (msgIndex: number, workflow: { id: string; name: string }) => {
    const updatedMessages = messages.map((message, index) => index === msgIndex && message.workflowDraft
      ? { ...message, workflowDraft: { ...message.workflowDraft, savedWorkflowId: workflow.id, savedWorkflowName: workflow.name } }
      : message)
    setMessages(updatedMessages)
    if (currentSessionId) {
      void fetch('/api/portal/elena-chat/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentSessionId,
          messages: updatedMessages.map(({ confirmation: _confirmation, ...message }) => sanitizeMessageForStorage(message)),
        }),
      }).then((response) => {
        if (!response.ok) throw new Error('Could not save the workflow draft status in chat history.')
        void refreshSessionsMetadata()
      }).catch((error) => console.error(error))
    }
  }

  const handleConfirmAction = async (msgIndex: number, confirmation: ElenaConfirmation) => {
    // Old chat history may contain a query and summary. These are never proof
    // of an action authorized by the server and must not be submitted.
    const endpoint = confirmationEndpoint(confirmation)
    if (!endpoint || !confirmation.token || !confirmation.expiresAt || isElenaResponding || isConfirmingAction) return
    const requestId = ++messageRequestRef.current
    setIsConfirmingAction(true)
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, confirmationError: undefined } : m))

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: confirmation.token }),
      })
      if (!response.ok) throw new Error('Confirmation unavailable')
      if (requestId !== messageRequestRef.current) return
      setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, confirmation: { summary: confirmation.summary }, isConfirmed: true } : m))
      if (currentSessionId) void refreshSessionsMetadata()
    } catch {
      if (requestId !== messageRequestRef.current) return
      // A network failure can occur after the server commits. Do not say the
      // action failed or offer a blind retry; ask the user to check the record.
      setMessages(prev => prev.map((m, idx) => idx === msgIndex ? {
        ...m,
        confirmation: { summary: confirmation.summary },
        confirmationError: confirmation.kind === 'close_tour_days'
          ? 'The result could not be verified. Check the calendar before requesting this action again.'
          : confirmation.kind === 'record_cleaning_completion'
            ? 'The result could not be verified. Check the cleaning log before requesting this action again.'
          : "The result could not be verified. Check the lead's notes before requesting this action again.",
      } : m))
    } finally {
      if (requestId === messageRequestRef.current) setIsConfirmingAction(false)
    }
  }

  const handleCancelAction = (msgIndex: number) => {
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, confirmation: m.confirmation ? { summary: m.confirmation.summary } : undefined, isCancelled: true } : m))
  }

  const pathSuggestions = getSuggestionsForPath(activePath)
  const voiceActive = voiceState !== 'ended'
  const latestVoiceReplyIndex = messages.reduce((latestIndex, message, index) => (
    index >= voiceStartIndex && message.role === 'assistant' ? index : latestIndex
  ), -1)
  const voiceOutputIndex = !isElenaResponding && latestVoiceReplyIndex >= 0 && hasVoiceActionOutput(messages[latestVoiceReplyIndex])
    ? latestVoiceReplyIndex
    : -1
  const voiceHasResults = voiceOutputIndex >= 0

  return (
    <motion.aside 
      initial={{ x: '100%' }}
      animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="portal-elena-chat-panel fixed right-0 top-0 z-[65] flex w-full flex-col border-l-0 border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.85)] max-lg:bottom-[var(--portal-mobile-nav-height)] max-lg:h-[calc(100dvh-var(--portal-mobile-nav-height))] lg:bottom-0 lg:h-full lg:w-[420px] lg:border-l"
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
        <div className="flex items-center gap-0.5">
          {!voiceActive && !historyUnavailable && <button
            type="button"
            onClick={() => setShowSessionsList(curr => !curr)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer ${
              showSessionsList 
                ? 'bg-[#caa24c]/15 text-[#a8792f] dark:text-[#f1d27a]' 
                : 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]'
            }`}
            title="Chat History Sessions"
            aria-label="Chat History Sessions"
          >
            <History size={15} />
          </button>}
          {!voiceActive && <button
            type="button"
            onClick={() => void handleCreateSession()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl p-0 text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer"
            title="Start New Chat Session"
            aria-label="Start New Chat Session"
          >
            <SquarePen size={15} />
          </button>}
          {!voiceActive && <div className="mx-1.5 h-5 w-px shrink-0 self-center bg-[color:var(--portal-border)]" aria-hidden="true" />}
          <PortalCloseButton onClick={onClose} aria-label="Close Elena Chat" />
        </div>
      </div>

      {historyUnavailable && <p className="border-b border-[color:var(--portal-border)] px-4 py-2 text-xs text-[color:var(--portal-muted)]">This chat is temporary and will not be saved.</p>}

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
                  onClick={() => void handleCreateSession()}
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
                          {formatLuxorDate(session.updated_at, { includeTime: true, includeTimeZone: true, weekday: 'short' }) || 'Date unavailable'}
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
        <motion.div layoutScroll className={`portal-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 ${voiceActive && !voiceHasResults && !isElenaResponding ? 'hidden' : ''}`}>
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
                  <PortalConstellationLoader size={20} tone="gold" />
                  <p className="text-xs">Opening Elena’s conversation…</p>
                </div>
              ) : voiceActive && !voiceHasResults ? isElenaResponding ? (
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
                  <PortalConstellationLoader size={14} tone="gold" />
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
                            <PortalConstellationLoader size={10} tone="gold" /> Querying CRM...
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
                            ) : (
                              <ElenaChatMessageBody message={msg} chatId={currentSessionId} />
                            )}
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

                        {msg.workflowLinks?.filter((item) => isSafeWorkflowLink(item.href)).map((item) => <Link key={item.href} href={item.href!} onClick={() => { stopVoice(); onClose() }} className="mt-2 inline-flex min-h-11 w-[96%] items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 text-left text-xs font-semibold text-[color:var(--portal-text)] transition hover:border-[#caa24c]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"><span><span className="block">{item.name}</span><span className="mt-1 block font-normal text-[color:var(--portal-muted)]">{item.note}</span></span><ExternalLink size={15} aria-hidden="true" /></Link>)}

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

                        {/* Only server-issued confirmations may be submitted. */}
                        {msg.confirmation && !msg.isConfirmed && !msg.isCancelled && (
                          <div className="w-[88%] mt-3 pl-8">
                            <div className="space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3.5">
                              <div className="flex items-start gap-2.5">
                                <Info size={14} className="mt-0.5 shrink-0 text-[#caa24c]" />
                                <div>
                                  <p className="text-xs font-semibold text-[color:var(--portal-text)]">Review action</p>
                                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--portal-muted)]">{msg.confirmation.summary}</p>
                                  {(!msg.confirmation.token || !msg.confirmation.expiresAt || !confirmationEndpoint(msg.confirmation)) && (
                                    <p className="mt-2 text-xs text-[color:var(--portal-muted)]">This confirmation is unavailable. Request the action again.</p>
                                  )}
                                  {msg.confirmationError && <p role="alert" className="mt-2 text-xs text-[color:var(--portal-text)]">{msg.confirmationError}</p>}
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                {msg.confirmation.token && msg.confirmation.expiresAt && confirmationEndpoint(msg.confirmation) && !msg.confirmationError && (
                                  <button
                                    type="button"
                                    disabled={isComposerLocked}
                                    onClick={() => handleConfirmAction(index, msg.confirmation!)}
                                    className="luxor-gold-raised rounded px-3 py-1.5 text-xs font-bold !text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Confirm action
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isComposerLocked}
                                  onClick={() => handleCancelAction(index)}
                                  className="rounded border border-[color:var(--portal-border)] px-3 py-1.5 text-xs font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {msg.confirmation && msg.isConfirmed && (
                          <div className="w-[88%] mt-2.5 pl-8 text-xs font-medium text-[color:var(--portal-text)]">
                            Action completed
                          </div>
                        )}

                        {msg.confirmation && msg.isCancelled && (
                          <div className="w-[88%] mt-2.5 pl-8 text-xs font-medium text-[color:var(--portal-muted)]">
                            Confirmation dismissed
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

                        {msg.developerSupportCard && (
                          <div className="w-[96%] mt-2 pl-8">
                            <ElenaDeveloperSupportCard
                              payload={msg.developerSupportCard}
                              chatId={currentSessionId}
                              attachmentCandidates={collectDeveloperSupportAttachmentCandidates(messages, attachments, currentSessionId)}
                              onSavedAttachments={(saved) => persistTicketAttachments(index, saved)}
                              onSuccess={(successMsg) => {
                                setMessages((prev) => [
                                  ...prev,
                                  { role: 'assistant', content: successMsg },
                                ])
                              }}
                            />
                          </div>
                        )}
                      </motion.div>
                    ))}

                    {/* Typing indicator */}
                    {isElenaResponding && (
                      <motion.div
                        layout
                        key="thinking-indicator"
                        initial={reduceVoiceMotion ? false : { opacity: 0, y: 8, filter: 'blur(5px)', originX: 0, originY: 1 }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: 4, filter: 'blur(5px)' }}
                        transition={{ duration: reduceVoiceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 text-xs text-[color:var(--portal-muted)]"
                      >
                        <PortalConstellationLoader size={14} tone="gold" />
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
        </motion.div>

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
                  <PortalCloseButton
                    onClick={() => {
                      setVoiceError('')
                      voiceStartButtonRef.current?.focus()
                    }}
                    aria-label="Dismiss voice notice"
                    className="!h-7 !w-7 !min-h-0 !min-w-0 shrink-0 rounded-lg"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {attachmentNotice ? (
              <motion.div
                key="attachment-notice"
                initial={reduceVoiceMotion ? false : { height: 0, opacity: 0, y: 10 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={reduceVoiceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, y: 8 }}
                transition={{ duration: reduceVoiceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 pl-3 pr-1 text-[10px] leading-snug text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  <p role="status" className="min-w-0 flex-1 py-2">{attachmentNotice}</p>
                  <PortalCloseButton
                    onClick={() => setAttachmentNotice('')}
                    aria-label="Dismiss attachment notice"
                    className="!h-7 !w-7 !min-h-0 !min-w-0 shrink-0 rounded-lg"
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {(() => {
            const hasComposerAttachments = imageAttachments.length > 0 || documentAttachments.length > 0
            return (
              <div
                ref={composerAnchorRef}
                className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] shadow-xs focus-within:border-[#caa24c]/50"
              >
                <AnimatePresence initial={false}>
                  {hasComposerAttachments && (
                    <motion.div
                      key="elena-composer-attachments"
                      initial={reduceVoiceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={reduceVoiceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, marginBottom: 0 }}
                      transition={{ duration: reduceVoiceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-b border-[color:var(--portal-border)]/75 bg-[color:var(--portal-card)]/55"
                    >
                      <LayoutGroup id="elena-composer-attachments">
                      <div
                        ref={attachStripRef}
                        className="portal-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-3 py-2 [scrollbar-width:thin] [scroll-padding-inline:0.75rem]"
                        aria-label="Attached files"
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          {imageAttachments.map((att) => (
                            <motion.div
                              key={att.id}
                              layout="position"
                              initial={reduceVoiceMotion ? false : { opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={reduceVoiceMotion ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.86 }}
                              transition={reduceVoiceMotion ? { duration: 0 } : ELENA_ATTACHMENT_LAYOUT_TRANSITION}
                              className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-visible rounded-xl"
                            >
                              <div className="relative h-full w-full overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={att.dataUrl} alt={att.name} className="pointer-events-none h-full w-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeAttachment(att.id)}
                                  aria-label={`Remove ${att.name}`}
                                  className="portal-inline-action luxor-gold-raised absolute right-1 top-1 z-20 inline-flex !min-h-0 !min-w-0 h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 text-white shadow-sm"
                                >
                                  <X size={10} strokeWidth={2.8} aria-hidden="true" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                          {documentAttachments.map((att) => (
                            <motion.div
                              key={att.id}
                              layout="position"
                              initial={reduceVoiceMotion ? false : { opacity: 0, scale: 0.94 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={reduceVoiceMotion ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.92 }}
                              transition={reduceVoiceMotion ? { duration: 0 } : ELENA_ATTACHMENT_LAYOUT_TRANSITION}
                              className="flex w-max max-w-[12.5rem] shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-2.5 py-1.5 text-[10px] text-[color:var(--portal-text)]"
                            >
                              <FileText size={12} className="shrink-0 text-[#caa24c]" />
                              <span className="min-w-0 max-w-[9.5rem] truncate font-medium">{att.name}</span>
                              <PortalCloseButton
                                onClick={() => removeAttachment(att.id)}
                                aria-label={`Remove ${att.name}`}
                                className="!ml-0.5 !h-6 !w-6 !min-h-0 !min-w-0 shrink-0 rounded-lg"
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        <span className="shrink-0 pr-0.5" aria-hidden="true" />
                      </div>
                      </LayoutGroup>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (confirmHighlightedSlashCommand()) return
                    handleSend(input)
                  }}
                  className="relative flex items-center px-3 py-1.5"
                >
            <ElenaSlashCommandMenu
              anchorRef={composerAnchorRef}
              open={(slashMenuVisible || slashManageExpanded) && !isElenaResponding}
              commands={filteredSlashCommands}
              highlightIndex={slashHighlightIndex}
              onPick={pickSlashCommand}
              reduceMotion={Boolean(reduceVoiceMotion)}
              manageExpanded={slashManageExpanded}
              onManageExpandedChange={setSlashManageExpanded}
              userEmail={userEmail}
              onPersonalShortcutsSaved={() => setPersonalSlashCommands(loadPersonalElenaSlashCommands(userEmail))}
            />
            <input
              type="file"
              ref={imageInputRef}
              onChange={handleImageSelect}
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              multiple
              className="hidden"
            />
            <input
              type="file"
              ref={documentInputRef}
              onChange={handleDocumentSelect}
              accept="application/pdf,.pdf,text/plain,text/csv,.txt,.csv"
              multiple
              className="hidden"
            />

            <div className="relative mr-2 shrink-0">
              <button
                ref={attachPlusRef}
                type="button"
                onClick={toggleAttachMenu}
                aria-expanded={attachMenuOpen}
                aria-haspopup="menu"
                title="Add a photo or file"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-card)] hover:text-[#caa24c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
              >
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {activeSlashCommand ? (
                  <motion.div
                    key={`slash-badge-${activeSlashCommand.command.id}`}
                    layout="position"
                    initial={reduceVoiceMotion ? false : { opacity: 0, scale: 0.82, x: -12, filter: 'blur(4px)' }}
                    animate={reduceVoiceMotion ? { opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' } : { opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' }}
                    exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.84, x: -10, filter: 'blur(3px)' }}
                    transition={reduceVoiceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 28, mass: 0.65 }}
                    className="shrink-0 origin-left"
                  >
                    <ElenaSlashTriggerBadge command={activeSlashCommand.command} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                {activeSlashCommand ? (
                  <ElenaGrowingTextarea
                    key="slash-details-input"
                    reduceMotion={Boolean(reduceVoiceMotion)}
                    ref={slashDetailsInputRef}
                    value={activeSlashCommand.rest}
                    onChange={(event) => updateActiveSlashRest(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void handleSend(input)
                        return
                      }
                      if (event.key === 'Backspace' && !activeSlashCommand.rest) {
                        event.preventDefault()
                        setInput('')
                      }
                    }}
                    onPaste={handleComposerPaste}
                    placeholder="Add details (optional)…"
                    className="portal-input-transparent min-w-0 flex-1 bg-transparent text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none"
                    disabled={isComposerLocked}
                    aria-label={`${activeSlashCommand.command.label} details`}
                  />
                ) : (
                  <ElenaGrowingTextarea
                    key="plain-composer-input"
                    reduceMotion={Boolean(reduceVoiceMotion)}
                    ref={plainComposerInputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(event) => {
                      handleComposerKeyDown(event)
                      if (event.defaultPrevented) return
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        if (confirmHighlightedSlashCommand()) return
                        void handleSend(input)
                      }
                    }}
                    onPaste={handleComposerPaste}
                    placeholder="Message Elena… type / for shortcuts"
                    className="portal-input-transparent min-w-0 flex-1 bg-transparent text-xs text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] outline-none"
                    disabled={isComposerLocked}
                  />
                )}
              </AnimatePresence>
            </div>

            {(() => {
              const composerCanSend = Boolean(input.trim() || attachments.length > 0)
              return (
            <button
              ref={voiceStartButtonRef}
              type={isElenaResponding ? 'button' : composerCanSend ? 'submit' : 'button'}
              onClick={
                isElenaResponding
                  ? (event) => {
                      event.preventDefault()
                      stopElenaResponse()
                    }
                  : composerCanSend
                    ? undefined
                    : startVoice
              }
              onMouseEnter={() => setVoiceButtonHovered(true)}
              onMouseLeave={() => setVoiceButtonHovered(false)}
              onFocus={() => setVoiceButtonHovered(true)}
              onBlur={() => setVoiceButtonHovered(false)}
              disabled={!isElenaResponding && !composerCanSend && voiceState !== 'ended'}
              aria-label={
                isElenaResponding
                  ? 'Stop response'
                  : slashMenuVisible && filteredSlashCommands.length
                    ? 'Confirm slash command'
                    : composerCanSend
                      ? 'Send message'
                      : 'Start voice conversation with Elena'
              }
              title={
                isElenaResponding
                  ? 'Stop response'
                  : slashMenuVisible && filteredSlashCommands.length
                    ? 'Confirm slash command'
                    : composerCanSend
                      ? 'Send message'
                      : 'Start voice conversation'
              }
              className="portal-inline-action ml-1 inline-flex !min-h-0 !min-w-0 h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-35 luxor-gold-raised border-0 !text-white shadow-xs active:scale-95"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isElenaResponding ? (
                  <motion.span
                    key="stop"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="text-white"
                  >
                    <ElenaComposerStopGlyph />
                  </motion.span>
                ) : composerCanSend ? (
                  <motion.span key="send" initial={{ opacity: 0, y: 4, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.8 }} transition={{ duration: 0.15 }} className="text-white">
                    <ArrowUp size={17} strokeWidth={2.4} className="text-white" aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="voice"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="text-white"
                  >
                    <ElenaVoiceWave active={voiceButtonHovered && !composerCanSend} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
              )
            })()}
                </form>
              </div>
            )
          })()}
        </div>}
      </div>
      {typeof document !== 'undefined' && isOpen
        ? createPortal(
            <AnimatePresence>
              {attachMenuOpen && attachMenuCoords ? (
                <motion.div
                  key="elena-attach-menu"
                  ref={attachMenuRef}
                  data-portal-popover="true"
                  role="menu"
                  aria-label="Attach to Elena"
                  initial={reduceVoiceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceVoiceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: reduceVoiceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    position: 'fixed',
                    left: attachMenuCoords.left,
                    bottom: attachMenuCoords.bottom,
                    zIndex: 120,
                    width: '13rem',
                  }}
                  className="overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-1 shadow-xl ring-1 ring-black/10"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-medium text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f] dark:text-[#e6c77f]">
                      <Camera size={14} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block">Photo or screenshot</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-[color:var(--portal-muted)]">Receipts, venue photos, bills as images</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => documentInputRef.current?.click()}
                    className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-medium text-[color:var(--portal-text)] transition-colors hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#caa24c]/10 text-[#a8792f] dark:text-[#e6c77f]">
                      <FileText size={14} aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block">PDF or text file</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-[color:var(--portal-muted)]">Vendor bills, CSV exports, notes</span>
                    </span>
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
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

function ElenaComposerStopGlyph() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
    />
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
        {payload.targetDate && <p className="flex items-center gap-1.5"><CalendarDays size={12} className="text-[#caa24c]" /> {/^(\d{4})-(\d{2})-(\d{2})$/.test(payload.targetDate.trim()) ? formatLuxorDate(payload.targetDate) || payload.targetDate : payload.targetDate}</p>}
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

function ElenaTourInviteCard({ payload }: { payload: TourInviteCardPayload; onSuccess: (message: string) => void }) {
  return <div className="ml-8 mt-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 text-xs text-[color:var(--portal-text)]">Tour invites for {payload.clientName} are unavailable in Elena. Use the lead or calendar workspace to review and send the invite.</div>
}

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

function attachmentKindFromName(name: string): MessageAttachment['kind'] {
  if (/\.(txt|csv)$/i.test(name)) return 'text'
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name) ? 'image' : 'document'
}

function isPdfMessageAttachment(attachment: MessageAttachment) {
  return attachment.kind === 'document'
    && (attachment.type === 'application/pdf' || /\.pdf$/i.test(attachment.name))
}

function canOpenMessageAttachment(attachment: MessageAttachment) {
  if (attachment.textContent) return true
  if (attachment.storagePath) return attachment.kind === 'image' || isPdfMessageAttachment(attachment)
  if (!attachment.dataUrl) return false
  return attachment.kind === 'image' || isPdfMessageAttachment(attachment)
}

type ElenaMessageAttachmentPreview = {
  name: string
  url: string
  kind: 'pdf' | 'image' | 'text'
  textContent?: string
}

function messageAttachmentsForDisplay(message: Message): MessageAttachment[] {
  if (message.attachments?.length) return message.attachments
  const match = message.content.match(/\[Attached:\s*([^\]]+)\]\s*$/m)
  if (!match) return []
  return match[1]
    .split(',')
    .map((part) => part.replace(/^📎\s*/, '').trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      type: attachmentKindFromName(name) === 'image' ? 'image/png' : 'application/pdf',
      kind: attachmentKindFromName(name),
    }))
}

function messageTextForDisplay(message: Message) {
  const attachments = messageAttachmentsForDisplay(message)
  let content = message.content.trim()
  if (attachments.length > 0) {
    content = content.replace(/\n?\[Attached:\s*[^\]]+\]\s*$/m, '').trim()
  }
  return content
}

function attachmentsForElenaPersistence(attachments?: MessageAttachment[]) {
  if (!attachments?.length) return undefined
  return attachments.map(({ dataUrl: _dataUrl, textContent, storagePath, id, ...attachment }) => ({
    ...attachment,
    ...(id ? { id } : {}),
    ...(storagePath ? { storagePath } : {}),
    ...(textContent ? { textContent: textContent.slice(0, 4000) } : {}),
  }))
}

async function resolveElenaAttachmentPreviewUrl(chatId: string | null, attachment: MessageAttachment) {
  if (attachment.dataUrl) return attachment.dataUrl
  if (!chatId || !attachment.storagePath) return null
  const response = await fetch(
    `/api/portal/elena-chat/attachment?chatId=${encodeURIComponent(chatId)}&storagePath=${encodeURIComponent(attachment.storagePath)}&name=${encodeURIComponent(attachment.name)}`,
  )
  if (!response.ok) return null
  const data = (await response.json()) as { url?: string }
  return typeof data.url === 'string' ? data.url : null
}

function sanitizeMessageForStorage(message: Message): Message {
  if (!message.attachments?.length) return message
  return {
    ...message,
    attachments: attachmentsForElenaPersistence(message.attachments) || [],
  }
}

function ElenaChatStoredImageThumb({
  attachment,
  chatId,
  onOpen,
}: {
  attachment: MessageAttachment
  chatId: string | null
  onOpen: () => void
}) {
  const [fetchedSrc, setFetchedSrc] = useState('')
  const [failed, setFailed] = useState(false)
  const src = attachment.dataUrl || fetchedSrc

  useEffect(() => {
    if (attachment.dataUrl) return
    if (!attachment.storagePath || !chatId) return
    let cancelled = false
    void resolveElenaAttachmentPreviewUrl(chatId, attachment).then((url) => {
      if (cancelled) return
      if (url) setFetchedSrc(url)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [attachment, chatId])

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!src && failed}
      className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[color:var(--portal-border)]/80 bg-[color:var(--portal-soft)] shadow-xs transition hover:border-[#caa24c]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:cursor-default disabled:opacity-70"
      aria-label={`Open ${attachment.name}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-[color:var(--portal-muted)]">Loading…</span>
      )}
    </button>
  )
}

function ElenaChatMessageBody({ message, chatId }: { message: Message; chatId: string | null }) {
  const attachments = messageAttachmentsForDisplay(message)
  const content = stripOwnerFacingIds(messageTextForDisplay(message))
  const [preview, setPreview] = useState<ElenaMessageAttachmentPreview | null>(null)

  const openAttachment = async (attachment: MessageAttachment) => {
    if (!canOpenMessageAttachment(attachment)) return
    if (attachment.textContent) {
      setPreview({ name: attachment.name, url: '', kind: 'text', textContent: attachment.textContent })
      return
    }
    const url = await resolveElenaAttachmentPreviewUrl(chatId, attachment)
    if (!url) return
    if (isPdfMessageAttachment(attachment)) {
      setPreview({ name: attachment.name, url, kind: 'pdf' })
      return
    }
    if (attachment.kind === 'image') {
      setPreview({ name: attachment.name, url, kind: 'image' })
    }
  }

  return (
    <>
      <div className="space-y-2">
        {content ? <div>{renderFormattedContent(content)}</div> : null}
        {attachments.length > 0 ? (
          <div className={`flex flex-wrap gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {attachments.map((attachment) => {
              const openable = canOpenMessageAttachment(attachment)
              if (attachment.kind === 'image' && (attachment.dataUrl || attachment.storagePath)) {
                return (
                  <ElenaChatStoredImageThumb
                    key={`${attachment.id || attachment.name}-${attachment.storagePath || attachment.dataUrl || 'local'}-image`}
                    attachment={attachment}
                    chatId={chatId}
                    onOpen={() => { void openAttachment(attachment) }}
                  />
                )
              }
              const title = openable
                ? attachment.name
                : `${attachment.name} (preview unavailable after reload — reattach to view)`
              return (
                <button
                  key={`${attachment.name}-file`}
                  type="button"
                  disabled={!openable}
                  onClick={() => { void openAttachment(attachment) }}
                  title={title}
                  className={`flex w-max max-w-[12.5rem] shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/80 px-2.5 py-1.5 text-[10px] text-[color:var(--portal-text)] shadow-xs ${openable ? 'cursor-pointer transition hover:border-[#caa24c]/45 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45' : 'cursor-default opacity-80'}`}
                  aria-label={openable ? `Open ${attachment.name}` : attachment.name}
                >
                  <FileText size={12} className="shrink-0 text-[#caa24c]" aria-hidden="true" />
                  <span className="min-w-0 max-w-[9.5rem] truncate text-left font-medium">{attachment.name}</span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <PortalModal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name || 'Attachment'}
        maxWidth="max-w-5xl"
        fullScreenOnCompact
        fillBody={preview?.kind === 'pdf'}
        zIndex={200}
        className={preview?.kind === 'pdf' ? 'max-lg:!flex max-lg:!min-h-0 max-lg:!h-dvh' : undefined}
        bodyClassName={preview?.kind === 'pdf' ? '!flex !min-h-0 !flex-1 !flex-col !overflow-hidden !p-0 sm:!p-0' : undefined}
        footer={preview?.url ? (
          <a
            href={preview.url}
            download={preview.name}
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[color:var(--portal-text)] underline decoration-[#caa24c]/50 underline-offset-2"
          >
            Download
          </a>
        ) : undefined}
      >
        {preview?.kind === 'pdf' ? (
          <div className="flex min-h-0 w-full flex-1 flex-col h-0 lg:min-h-[min(72vh,760px)] lg:h-auto">
            <PortalPdfViewer url={preview.url} title={preview.name.replace(/\.pdf$/i, '') || 'PDF'} />
          </div>
        ) : null}
        {preview?.kind === 'image' ? (
          <div className="flex min-h-40 items-center justify-center bg-[color:var(--portal-soft)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.name} className="max-h-[65dvh] max-w-full rounded-lg object-contain" />
          </div>
        ) : null}
        {preview?.kind === 'text' && preview.textContent ? (
          <pre className="max-h-[65dvh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-xs leading-relaxed text-[color:var(--portal-text)]">
            {preview.textContent}
          </pre>
        ) : null}
      </PortalModal>
    </>
  )
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
                <td key={cIdx} className="px-3 py-2 whitespace-nowrap">{renderBoldAndLinks(col)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const ELENA_CONTACT_LINK_CLASS =
  'portal-inline-action font-semibold text-[#a8792f] no-underline hover:text-[#caa24c] dark:text-[#e3bc65] dark:hover:text-[#f1d27a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45'

function linkifyPlainText(text: string, keyBase: string) {
  if (!text) return null
  const pattern = new RegExp(ELENA_CHAT_CONTACT_PATTERN.source, 'gi')
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let matchIndex = 0
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }
    const key = `${keyBase}-${matchIndex}`
    if (isEmailToken(token)) {
      nodes.push(
        <a
          key={key}
          href={`mailto:${token}`}
          className={ELENA_CONTACT_LINK_CLASS}
          title={`Email ${token}`}
        >
          {token}
        </a>,
      )
    } else {
      const normalized = normalizePhoneNumber(token)
      const dialNumber = normalized || token.replace(/[^\d+]/g, '')
      const label = formatPhoneDisplay(dialNumber || token) || token
      nodes.push(
        <button
          key={key}
          type="button"
          className={ELENA_CONTACT_LINK_CLASS}
          title="Call from Luxor browser phone"
          aria-label={`Call ${label}`}
          onClick={() => {
            if (dialNumber) startLuxorBrowserCall({ phoneNumber: dialNumber })
          }}
        >
          {label}
        </button>,
      )
    }
    lastIndex = start + token.length
    matchIndex += 1
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes.length === 1 ? nodes[0] : nodes
}

function renderBoldAndLinks(text: string) {
  const cleaned = stripOwnerFacingIds(text)
  const parts = cleaned.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
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
    if (!part) return null
    return <React.Fragment key={idx}>{linkifyPlainText(part, String(idx))}</React.Fragment>
  })
}
