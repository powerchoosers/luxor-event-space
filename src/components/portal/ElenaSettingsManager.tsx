'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Database,
  FileUp,
  GitBranch,
  History,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from '@/lib/icons/phosphor-compat'
import {
  PortalAnimatedTabs,
  PortalButton,
  PortalCloseButton,
  PortalGhostIconButton,
  PortalModal,
  PortalSelect,
  PortalSkeleton,
  PortalSkeletonTransition,
  PortalStatusBadge,
  PortalTabTransition,
} from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type ElenaTab = 'overview' | 'knowledge' | 'flows' | 'instructions' | 'integrations' | 'settings'
type SourceType = 'manual' | 'import' | 'website' | 'connected'

type Instructions = {
  identity: string
  introduction: string
  voice: string
  priorities: string
  accuracy: string
  tour_guidance: string
  clarification: string
  handoff: string
}

type Knowledge = {
  id: string
  title: string
  content: string
  category: string
  source_type: SourceType
  source_label: string | null
  active: boolean
  archived: boolean
  sort_order: number
  published_payload: Record<string, unknown> | null
  published_at: string | null
  updated_at: string
}

type ElenaFlow = {
  id: string
  name: string
  description: string
  trigger_text: string
  steps: string[]
  active: boolean
  archived: boolean
  sort_order: number
  published_payload: Record<string, unknown> | null
  published_at: string | null
  updated_at: string
}

type ManagementState = {
  settings: {
    draft_instructions: Instructions
    published_instructions: Instructions
    version: number
    published_at: string | null
    updated_at: string
    updated_by: string | null
  }
  knowledge: Knowledge[]
  flows: ElenaFlow[]
  connections: Record<string, { status: string; detail: string }>
}

type PreviewMessage = { role: 'user' | 'assistant'; content: string; sources?: Record<string, unknown> }
type ConfirmDialogState =
  | { type: 'publish' }
  | { type: 'archive_knowledge'; entry: Knowledge }
  | { type: 'archive_flow'; flow: ElenaFlow }
  | null

const TABS: Array<{ id: ElenaTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'knowledge', label: 'Knowledge base' },
  { id: 'flows', label: 'Flows' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
]

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'Venue Information', label: 'Venue information' },
  { value: 'Packages & Pricing', label: 'Packages & pricing' },
  { value: 'Tour Information', label: 'Tour information' },
  { value: 'Weddings', label: 'Weddings' },
  { value: 'Quinceañeras', label: 'Quinceañeras' },
  { value: 'Birthdays', label: 'Birthdays' },
  { value: 'Baby Showers', label: 'Baby showers' },
  { value: 'Corporate Events', label: 'Corporate events' },
  { value: 'Venue Rules', label: 'Venue rules' },
  { value: 'Capacity', label: 'Capacity' },
  { value: 'Amenities', label: 'Amenities' },
  { value: 'Parking', label: 'Parking' },
  { value: 'Vendors', label: 'Vendors' },
  { value: 'Booking Process', label: 'Booking process' },
  { value: 'Payments & Deposits', label: 'Payments & deposits' },
  { value: 'Policies', label: 'Policies' },
  { value: 'Frequently Asked Questions', label: 'Frequently asked questions' },
  { value: 'Contact Information', label: 'Contact information' },
]

const CATEGORY_LABELS = new Map(CATEGORIES.map((item) => [item.value, item.label]))

function formatCategoryLabel(categoryValue: string) {
  return CATEGORY_LABELS.get(categoryValue) ?? categoryValue
}

const INSTRUCTION_FIELDS: Array<{ key: keyof Instructions; label: string; help: string }> = [
  { key: 'identity', label: 'Who Elena is', help: 'Elena’s role when speaking with website visitors.' },
  { key: 'introduction', label: 'Introduction', help: 'How Elena introduces herself and offers help.' },
  { key: 'voice', label: 'Brand voice', help: 'Tone, length, and conversational style.' },
  { key: 'priorities', label: 'Priorities', help: 'What Elena should focus on during a conversation.' },
  { key: 'accuracy', label: 'Accuracy rules', help: 'What Elena must never invent or overstate.' },
  { key: 'tour_guidance', label: 'When to recommend a tour', help: 'When inviting a guest to visit is the best next step.' },
  { key: 'clarification', label: 'When to clarify', help: 'How Elena asks for missing event details.' },
  { key: 'handoff', label: 'Human handoff', help: 'When Elena should involve the Luxor team.' },
]

const EMPTY_KNOWLEDGE = {
  title: '',
  content: '',
  category: 'Venue Information',
  source_type: 'manual' as SourceType,
  source_label: 'Owner entry',
  active: false,
  sort_order: 0,
}

const EMPTY_FLOW = { name: '', description: '', trigger_text: '', steps: [''], active: false, sort_order: 0 }

const inputClass =
  'min-h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-sm text-[color:var(--portal-text)] outline-none transition-colors placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50 focus:bg-[color:var(--portal-card)] focus:ring-2 focus:ring-[#caa24c]/15'

const labelClass = 'block text-xs font-medium text-[color:var(--portal-muted)]'

function formatWhen(value: string | null) {
  if (!value) return 'Not published'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function isKnowledgePublished(entry: Knowledge) {
  if (!entry.published_payload) return !entry.active || entry.archived
  return (
    !entry.archived &&
    entry.active &&
    entry.published_payload.title === entry.title &&
    entry.published_payload.content === entry.content &&
    entry.published_payload.category === entry.category &&
    entry.published_payload.source_type === entry.source_type &&
    entry.published_payload.source_label === entry.source_label
  )
}

function isFlowPublished(flow: ElenaFlow) {
  if (!flow.published_payload) return !flow.active || flow.archived
  return (
    !flow.archived &&
    flow.active &&
    flow.published_payload.name === flow.name &&
    flow.published_payload.description === flow.description &&
    flow.published_payload.trigger_text === flow.trigger_text &&
    JSON.stringify(flow.published_payload.steps) === JSON.stringify(flow.steps)
  )
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] ${className}`}
    >
      {children}
    </section>
  )
}

function SectionHeading({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-[#a8792f] dark:text-[#caa24c]">{icon}</span>
        <div>
          <h3 className="text-sm font-bold text-[color:var(--portal-text)]">{title}</h3>
          <div className="mt-0.5 text-xs text-[color:var(--portal-muted)]">{description}</div>
        </div>
      </div>
      {action}
    </div>
  )
}

function StatusToggle({
  active,
  disabled,
  onChange,
}: {
  active: boolean
  disabled?: boolean
  onChange: (active: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`relative h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50 ${
        active ? 'bg-emerald-500' : 'bg-[color:var(--portal-border)]'
      }`}
    >
      <span
        className={`pointer-events-none absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${
          active ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
      <span className="sr-only">{active ? 'Active' : 'Inactive'}</span>
    </button>
  )
}

export function ElenaSettingsManager() {
  const { notify } = useToast()
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<ManagementState | null>(null)
  const [activeTab, setActiveTab] = useState<ElenaTab>('overview')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [knowledgeEditor, setKnowledgeEditor] = useState<(typeof EMPTY_KNOWLEDGE & { id?: string }) | null>(null)
  const [flowEditor, setFlowEditor] = useState<(typeof EMPTY_FLOW & { id?: string }) | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null)
  const [instructions, setInstructions] = useState<Instructions | null>(null)
  const [importText, setImportText] = useState('')
  const [importLabel, setImportLabel] = useState('Pasted notes')
  const [importCategory, setImportCategory] = useState('Frequently Asked Questions')
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([
    { role: 'assistant', content: 'Preview uses your saved draft configuration. Ask a question as a visitor would.' },
  ])
  const [previewInput, setPreviewInput] = useState('')
  const previewEndRef = useRef<HTMLDivElement>(null)

  const load = async (syncInstructions = true) => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const response = await fetch('/api/portal/elena-config', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load Elena settings.')
      setState(payload)
      if (syncInstructions) {
        setInstructions(payload.settings.draft_instructions)
      }
    } catch (error) {
      setLoadFailed(true)
      notify({
        title: 'Elena settings unavailable',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [])

  const request = async (body: Record<string, unknown>, label: string) => {
    setBusyAction(label)
    try {
      const response = await fetch('/api/portal/elena-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Elena could not save that change.')
      return payload
    } finally {
      setBusyAction(null)
    }
  }

  const visibleKnowledge = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (state?.knowledge || [])
      .filter((entry) => !entry.archived)
      .filter((entry) => category === 'all' || entry.category === category)
      .filter(
        (entry) =>
          !query ||
          `${entry.title} ${entry.content} ${entry.category} ${entry.source_label || ''}`
            .toLowerCase()
            .includes(query),
      )
  }, [category, search, state?.knowledge])

  const activeKnowledge = (state?.knowledge || []).filter((entry) => entry.active && !entry.archived)
  const activeFlows = (state?.flows || []).filter((flow) => flow.active && !flow.archived)
  const hasDraftChanges = Boolean(
    state &&
      (JSON.stringify(state.settings.draft_instructions) !== JSON.stringify(state.settings.published_instructions) ||
        state.knowledge.some((entry) => !isKnowledgePublished(entry)) ||
        state.flows.some((flow) => !isFlowPublished(flow))),
  )

  const saveKnowledge = async (entry: typeof EMPTY_KNOWLEDGE & { id?: string }) => {
    try {
      await request({ action: 'save_knowledge', ...entry }, `knowledge-${entry.id || 'new'}`)
      setKnowledgeEditor(null)
      notify({
        title: entry.id ? 'Knowledge draft updated' : 'Knowledge draft created',
        description: 'Publish when you are ready for website Elena to use it.',
        variant: 'success',
      })
      await load(false)
    } catch (error) {
      notify({
        title: 'Knowledge was not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const toggleKnowledge = async (entry: Knowledge, active: boolean) => {
    try {
      await request(
        {
          action: 'save_knowledge',
          id: entry.id,
          title: entry.title,
          content: entry.content,
          category: entry.category,
          source_type: entry.source_type,
          source_label: entry.source_label || '',
          active,
          sort_order: entry.sort_order,
        },
        `knowledge-${entry.id}`,
      )
      notify({
        title: active ? 'Knowledge entry enabled in draft' : 'Knowledge entry paused in draft',
        description: 'Publish when you are ready for website Elena to use it.',
        variant: 'success',
      })
      await load(false)
    } catch (error) {
      notify({
        title: 'Knowledge was not updated',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const confirmArchiveKnowledge = async (entry: Knowledge) => {
    try {
      await request({ action: 'archive_knowledge', id: entry.id }, `archive-${entry.id}`)
      setConfirmDialog(null)
      notify({
        title: 'Knowledge removed from draft',
        description: 'Publish changes to remove it from website Elena.',
        variant: 'success',
      })
      await load(false)
    } catch (error) {
      notify({
        title: 'Knowledge was not removed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const saveFlow = async (flow: typeof EMPTY_FLOW & { id?: string }, quiet = false) => {
    try {
      await request(
        {
          action: 'save_flow',
          ...flow,
          steps: flow.steps.map((step) => step.trim()).filter(Boolean),
        },
        `flow-${flow.id || 'new'}`,
      )
      if (!quiet) {
        setFlowEditor(null)
        notify({
          title: flow.id ? 'Flow draft updated' : 'Flow draft created',
          description: 'Preview it, then publish when ready.',
          variant: 'success',
        })
      }
      await load(false)
    } catch (error) {
      notify({
        title: 'Flow was not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const confirmArchiveFlow = async (flow: ElenaFlow) => {
    try {
      await request({ action: 'archive_flow', id: flow.id }, `archive-flow-${flow.id}`)
      setConfirmDialog(null)
      notify({
        title: 'Flow removed from draft',
        description: 'Publish changes to remove it from website Elena.',
        variant: 'success',
      })
      await load(false)
    } catch (error) {
      notify({
        title: 'Flow was not removed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const moveFlow = async (flow: ElenaFlow, direction: -1 | 1) => {
    if (!state) return
    const current = state.flows.filter((item) => !item.archived).sort((a, b) => a.sort_order - b.sort_order)
    const index = current.findIndex((item) => item.id === flow.id)
    const swap = current[index + direction]
    if (!swap) return
    const flowTargetOrder = swap.sort_order === flow.sort_order ? (index + direction) * 10 : swap.sort_order
    const swapTargetOrder = swap.sort_order === flow.sort_order ? index * 10 : flow.sort_order
    try {
      await request({ action: 'save_flow', ...flow, sort_order: flowTargetOrder }, `move-${flow.id}`)
      await request({ action: 'save_flow', ...swap, sort_order: swapTargetOrder }, `move-${swap.id}`)
      await load(false)
    } catch (error) {
      notify({
        title: 'Flow order was not changed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const saveInstructions = async () => {
    if (!instructions) return
    try {
      await request({ action: 'save_instructions', instructions }, 'instructions')
      notify({
        title: 'Instructions saved as a draft',
        description: 'Test Elena before publishing them to the website.',
        variant: 'success',
      })
      await load(true)
    } catch (error) {
      notify({
        title: 'Instructions were not saved',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const confirmPublish = async () => {
    if (!state) return
    try {
      await request({ action: 'publish' }, 'publish')
      setConfirmDialog(null)
      notify({
        title: 'Website Elena updated',
        description: 'The public concierge now uses this configuration.',
        variant: 'success',
      })
      await load(true)
    } catch (error) {
      notify({
        title: 'Changes were not published',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const runImport = async (website = false) => {
    try {
      const payload = await request(
        website
          ? { action: 'import_website' }
          : { action: 'import_text', text: importText, source_label: importLabel, category: importCategory },
        website ? 'import-website' : 'import-text',
      )
      setImportText('')
      notify({
        title: `${payload.count} knowledge draft${payload.count === 1 ? '' : 's'} ready for review`,
        description: 'Imported entries are inactive until you review and enable them.',
        variant: 'success',
      })
      setActiveTab('knowledge')
      await load(false)
    } catch (error) {
      notify({
        title: 'Knowledge was not imported',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const readImportFile = async (file?: File) => {
    if (!file) return
    if (!/\.(txt|md)$/i.test(file.name)) {
      notify({ title: 'Unsupported file', description: 'Upload a plain text or Markdown file.', variant: 'error' })
      return
    }
    if (file.size > 100_000) {
      notify({ title: 'File is too large', description: 'Use a text or Markdown file under 100 KB.', variant: 'error' })
      return
    }
    setImportText(await file.text())
    setImportLabel(file.name)
  }

  const sendPreview = async (question = previewInput) => {
    const text = question.trim()
    if (!text || busyAction === 'preview') return
    const user: PreviewMessage = { role: 'user', content: text }
    const history = [
      ...previewMessages.filter((message) => message.role === 'user' || message.role === 'assistant').slice(-8),
      user,
    ]
    setPreviewMessages((current) => [...current, user])
    setPreviewInput('')
    setBusyAction('preview')
    try {
      const response = await fetch('/api/portal/elena-config/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Preview is unavailable.')
      setPreviewMessages((current) => [
        ...current,
        { role: 'assistant', content: payload.reply, sources: payload.sources },
      ])
    } catch (error) {
      setPreviewMessages((current) => [
        ...current,
        { role: 'assistant', content: error instanceof Error ? error.message : 'Preview is unavailable.' },
      ])
    } finally {
      setBusyAction(null)
      window.setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }

  if (loadFailed && !state) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <p className="text-sm font-semibold text-red-600 dark:text-red-300">Elena management could not be loaded.</p>
        <PortalButton className="mt-4" onClick={() => void load(true)}>
          <RefreshCw size={13} aria-hidden="true" />
          Try again
        </PortalButton>
      </div>
    )
  }

  const isFetchingInitial = loading && !state

  const previewPanel = (
    <Panel className="flex h-[28rem] flex-col overflow-hidden sm:h-[31rem]">
      <SectionHeading
        icon={<MessageCircle size={17} />}
        title="Test Elena"
        description="Uses saved drafts without changing client records."
        action={
          <PortalButton
            size="sm"
            variant="ghost"
            onClick={() =>
              setPreviewMessages([
                { role: 'assistant', content: 'New preview started. Ask a question as a visitor would.' },
              ])
            }
          >
            New chat
          </PortalButton>
        }
      />
      <div className="portal-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[color:var(--portal-soft)]/45 p-4" aria-live="polite">
        {previewMessages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-5 ${
              message.role === 'user'
                ? 'luxor-gold-raised ml-auto border-transparent text-white'
                : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)]'
            }`}
          >
            {message.content}
            {message.sources ? (
              <p className="mt-2 border-t border-current/15 pt-1.5 text-[11px] tabular-nums opacity-75">
                Draft sources: {String(message.sources.knowledge || 0)} knowledge · {String(message.sources.flows || 0)} flows
              </p>
            ) : null}
          </div>
        ))}
        {busyAction === 'preview' ? (
          <div className="flex items-center gap-2 text-xs text-[color:var(--portal-muted)]">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Elena is checking the draft…
          </div>
        ) : null}
        <div ref={previewEndRef} />
      </div>
      <div className="border-t border-[color:var(--portal-border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={previewInput}
            onChange={(event) => setPreviewInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendPreview()
              }
            }}
            rows={2}
            placeholder="Ask Elena a visitor question…"
            className="min-h-11 flex-1 resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50"
          />
          <PortalButton
            variant="primary"
            disabled={!previewInput.trim() || busyAction === 'preview' || isFetchingInitial}
            onClick={() => void sendPreview()}
            aria-label="Send preview question"
            className="!h-11 !w-11 !px-0"
          >
            <Send size={15} />
          </PortalButton>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {['How much is the venue?', 'Can I tour tomorrow?', 'Can I bring my own vendors?'].map((question) => (
            <button
              key={question}
              type="button"
              disabled={isFetchingInitial}
              onClick={() => void sendPreview(question)}
              className="shrink-0 rounded-lg border border-[color:var(--portal-border)] px-2.5 py-1.5 text-xs text-[color:var(--portal-muted)] transition-colors hover:border-[#caa24c]/40 hover:text-[color:var(--portal-text)] disabled:opacity-45"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  )

  const confirmBusy = Boolean(busyAction === 'publish' || busyAction?.startsWith('archive-'))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/30 bg-[color:var(--portal-soft)] ring-2 ring-[#caa24c]/10">
            <Image src="/luxor-concierge.png" alt="Elena AI concierge" fill sizes="40px" className="object-cover" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-sans text-base font-bold text-[color:var(--portal-text)]">Elena AI</h2>
              <PortalSkeletonTransition
                loading={isFetchingInitial}
                overlap
                className="inline-flex items-center"
                skeleton={<PortalSkeleton className="h-5 w-16 rounded-md" />}
              >
                {state ? (
                  <PortalStatusBadge
                    borderless
                    tone={hasDraftChanges ? 'gold' : 'green'}
                    status={hasDraftChanges ? 'Draft changes' : `Live v${state.settings.version}`}
                  />
                ) : null}
              </PortalSkeletonTransition>
            </div>
            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">
              Manage what website Elena knows and how she responds.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/portal/elena-voice"
            className="inline-flex min-h-9.5 items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35"
          >
            Voice sandbox
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
          <PortalButton
            onClick={() => {
              setActiveTab('overview')
              window.setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
            }}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Test Elena
          </PortalButton>
          <PortalButton
            variant="primary"
            disabled={!hasDraftChanges || busyAction === 'publish' || isFetchingInitial}
            onClick={() => setConfirmDialog({ type: 'publish' })}
          >
            {busyAction === 'publish' ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            Publish
          </PortalButton>
        </div>
      </div>

      <div className="sm:hidden">
        <PortalSelect
          value={activeTab}
          onChange={(val) => setActiveTab(val as ElenaTab)}
          options={TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
          aria-label="Elena settings sections"
          className="w-full"
          buttonClassName="min-h-10"
        />
      </div>
      <div className="hidden sm:block">
        <PortalAnimatedTabs
          variant="slider"
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Elena settings sections"
          className="!min-w-0 flex-wrap"
          buttonClassName="px-3"
        />
      </div>

      <PortalTabTransition activeKey={activeTab}>
        {activeTab === 'overview' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(18.5rem,0.92fr)]">
            <div className="order-2 space-y-5 xl:order-1">
              <Panel>
                <SectionHeading
                  icon={<BookOpen size={17} />}
                  title="Knowledge base"
                  description={
                    <PortalSkeletonTransition
                      loading={isFetchingInitial}
                      overlap
                      skeleton={<PortalSkeleton className="h-3.5 w-44 rounded" />}
                    >
                      <span>
                        {activeKnowledge.length} active entries across {new Set(activeKnowledge.map((entry) => entry.category)).size} categories.
                      </span>
                    </PortalSkeletonTransition>
                  }
                  action={
                    <PortalGhostIconButton onClick={() => setActiveTab('knowledge')} aria-label="Open knowledge base">
                      <ChevronRight size={16} />
                    </PortalGhostIconButton>
                  }
                />
                <PortalSkeletonTransition
                  loading={isFetchingInitial}
                  skeleton={
                    <div className="divide-y divide-[color:var(--portal-border)]">
                      {[0, 1, 2].map((idx) => (
                        <div key={idx} className="flex items-center justify-between px-4 py-3 sm:px-5">
                          <PortalSkeleton className="h-3.5 w-32 rounded" />
                          <PortalSkeleton className="h-3.5 w-14 rounded" />
                        </div>
                      ))}
                    </div>
                  }
                >
                  <div className="divide-y divide-[color:var(--portal-border)]">
                    {Array.from(
                      new Map(
                        activeKnowledge.map((entry) => [
                          entry.category,
                          activeKnowledge.filter((item) => item.category === entry.category).length,
                        ]),
                      ),
                    )
                      .slice(0, 6)
                      .map(([label, count]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => {
                            setCategory(label)
                            setActiveTab('knowledge')
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[color:var(--portal-soft)] sm:px-5"
                        >
                          <span className="text-xs font-semibold text-[color:var(--portal-text)]">{formatCategoryLabel(label)}</span>
                          <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">
                            {count} {count === 1 ? 'item' : 'items'}
                            <ChevronRight size={12} className="ml-1 inline" aria-hidden="true" />
                          </span>
                        </button>
                      ))}
                  </div>
                </PortalSkeletonTransition>
              </Panel>

              <div className="grid gap-5 md:grid-cols-2">
                <Panel>
                  <SectionHeading
                    icon={<GitBranch size={17} />}
                    title="Flows"
                    description={
                      <PortalSkeletonTransition
                        loading={isFetchingInitial}
                        overlap
                        skeleton={<PortalSkeleton className="h-3.5 w-36 rounded" />}
                      >
                        <span>{activeFlows.length} active guided conversations.</span>
                      </PortalSkeletonTransition>
                    }
                    action={
                      <PortalGhostIconButton onClick={() => setActiveTab('flows')} aria-label="Open flows">
                        <ChevronRight size={16} />
                      </PortalGhostIconButton>
                    }
                  />
                  <PortalSkeletonTransition
                    loading={isFetchingInitial}
                    skeleton={
                      <div className="divide-y divide-[color:var(--portal-border)]">
                        {[0, 1].map((idx) => (
                          <div key={idx} className="flex items-center justify-between px-4 py-3 sm:px-5">
                            <div className="space-y-1">
                              <PortalSkeleton className="h-3.5 w-28 rounded" />
                              <PortalSkeleton className="h-3 w-16 rounded" />
                            </div>
                            <PortalSkeleton className="h-2 w-2 rounded-full" />
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <div className="divide-y divide-[color:var(--portal-border)]">
                      {activeFlows.slice(0, 4).map((flow) => (
                        <div key={flow.id} className="flex items-center justify-between px-4 py-3 sm:px-5">
                          <div>
                            <p className="text-xs font-semibold text-[color:var(--portal-text)]">{flow.name}</p>
                            <p className="mt-0.5 text-xs tabular-nums text-[color:var(--portal-muted)]">{flow.steps.length} steps</p>
                          </div>
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        </div>
                      ))}
                    </div>
                  </PortalSkeletonTransition>
                </Panel>

                <Panel>
                  <SectionHeading
                    icon={<SlidersHorizontal size={17} />}
                    title="Elena’s instructions"
                    description="Voice, accuracy, and handoff rules."
                    action={
                      <PortalGhostIconButton onClick={() => setActiveTab('instructions')} aria-label="Open instructions">
                        <ChevronRight size={16} />
                      </PortalGhostIconButton>
                    }
                  />
                  <div className="p-4 sm:p-5">
                    <PortalSkeletonTransition
                      loading={isFetchingInitial}
                      overlap
                      skeleton={
                        <div className="space-y-1.5">
                          <PortalSkeleton className="h-3.5 w-full rounded" />
                          <PortalSkeleton className="h-3.5 w-5/6 rounded" />
                          <PortalSkeleton className="h-3.5 w-3/4 rounded" />
                        </div>
                      }
                    >
                      <p className="line-clamp-5 text-xs leading-5 text-[color:var(--portal-muted)]">
                        {instructions ? `${instructions.voice} ${instructions.accuracy}` : ''}
                      </p>
                    </PortalSkeletonTransition>
                  </div>
                </Panel>
              </div>
            </div>

            <div className="order-1 xl:order-2">{previewPanel}</div>

            <div className="order-3 grid gap-4 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-4">
              <button type="button" onClick={() => setActiveTab('integrations')} className="text-left">
                <Panel className="h-full p-4 transition-colors hover:border-[#caa24c]/35">
                  <FileUp size={16} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                  <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Import knowledge</p>
                  <p className="mt-1 text-xs leading-4 text-[color:var(--portal-muted)]">
                    Turn notes, FAQs, or site copy into drafts.
                  </p>
                </Panel>
              </button>
              <Panel className="p-4">
                <ShieldCheck size={16} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Knowledge status</p>
                <PortalSkeletonTransition
                  loading={isFetchingInitial}
                  overlap
                  skeleton={<PortalSkeleton className="mt-1.5 h-3.5 w-28 rounded" />}
                >
                  <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                    {activeKnowledge.length} active · {(state?.knowledge || []).filter((entry) => !entry.active && !entry.archived).length} inactive
                  </p>
                </PortalSkeletonTransition>
              </Panel>
              <button type="button" onClick={() => setActiveTab('integrations')} className="text-left">
                <Panel className="h-full p-4 transition-colors hover:border-[#caa24c]/35">
                  <Database size={16} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                  <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Connected data</p>
                  <PortalSkeletonTransition
                    loading={isFetchingInitial}
                    overlap
                    skeleton={<PortalSkeleton className="mt-1.5 h-3.5 w-32 rounded" />}
                  >
                    <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                      {state ? Object.values(state.connections).filter((item) => item.status === 'connected').length : 0} of{' '}
                      {state ? Object.keys(state.connections).length : 0} sources connected
                    </p>
                  </PortalSkeletonTransition>
                </Panel>
              </button>
              <Panel className="p-4">
                <History size={16} className="text-[#a8792f] dark:text-[#caa24c]" aria-hidden="true" />
                <p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Live configuration</p>
                <PortalSkeletonTransition
                  loading={isFetchingInitial}
                  overlap
                  skeleton={<PortalSkeleton className="mt-1.5 h-3.5 w-36 rounded" />}
                >
                  <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                    Version {state?.settings.version ?? '—'} · {formatWhen(state?.settings.published_at ?? null)}
                  </p>
                </PortalSkeletonTransition>
              </Panel>
            </div>
          </div>
        ) : null}

        {activeTab === 'knowledge' ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Elena’s knowledge…"
                  className={`${inputClass} bg-[color:var(--portal-card)] pl-9`}
                />
              </div>
              <PortalSelect
                value={category}
                onChange={setCategory}
                options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES]}
                className="sm:w-56"
                buttonClassName="min-h-10"
              />
              <PortalButton variant="primary" disabled={isFetchingInitial} onClick={() => setKnowledgeEditor({ ...EMPTY_KNOWLEDGE })} className="shrink-0">
                <Plus size={14} aria-hidden="true" />
                Add knowledge
              </PortalButton>
            </div>

            <AnimatePresence initial={false}>
              {knowledgeEditor ? (
                <motion.div
                  key={knowledgeEditor.id || 'new-knowledge'}
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <Panel className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-[color:var(--portal-text)]">
                        {knowledgeEditor.id ? 'Edit knowledge draft' : 'New knowledge draft'}
                      </h3>
                      <PortalCloseButton onClick={() => setKnowledgeEditor(null)} aria-label="Close knowledge editor" />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className={labelClass}>Title</span>
                        <input
                          value={knowledgeEditor.title}
                          onChange={(event) => setKnowledgeEditor({ ...knowledgeEditor, title: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className={labelClass}>Category</span>
                        <PortalSelect
                          value={knowledgeEditor.category}
                          onChange={(value) => setKnowledgeEditor({ ...knowledgeEditor, category: value })}
                          options={CATEGORIES}
                          buttonClassName="min-h-10"
                        />
                      </label>
                      <label className="space-y-1.5 lg:col-span-2">
                        <span className={labelClass}>Approved answer or information</span>
                        <textarea
                          rows={5}
                          value={knowledgeEditor.content}
                          onChange={(event) => setKnowledgeEditor({ ...knowledgeEditor, content: event.target.value })}
                          className={`${inputClass} min-h-28 resize-y py-2.5 leading-5`}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[color:var(--portal-text)]">
                        <StatusToggle
                          active={knowledgeEditor.active}
                          onChange={(active) => setKnowledgeEditor({ ...knowledgeEditor, active })}
                        />
                        Active in draft
                      </label>
                      <div className="flex justify-end gap-2">
                        <PortalButton variant="ghost" onClick={() => setKnowledgeEditor(null)}>
                          Cancel
                        </PortalButton>
                        <PortalButton
                          variant="primary"
                          disabled={!knowledgeEditor.title.trim() || !knowledgeEditor.content.trim() || busyAction?.startsWith('knowledge-')}
                          onClick={() => void saveKnowledge(knowledgeEditor)}
                        >
                          {busyAction?.startsWith('knowledge-') ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Save size={14} aria-hidden="true" />
                          )}
                          Save draft
                        </PortalButton>
                      </div>
                    </div>
                  </Panel>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Panel className="overflow-hidden">
              <PortalSkeletonTransition
                loading={isFetchingInitial}
                skeleton={
                  <div className="divide-y divide-[color:var(--portal-border)]">
                    {[0, 1, 2].map((idx) => (
                      <div key={idx} className="space-y-2 px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-2">
                          <PortalSkeleton className="h-4 w-44 rounded" />
                          <PortalSkeleton className="h-5 w-24 rounded-md" />
                        </div>
                        <PortalSkeleton className="h-3.5 w-3/4 rounded" />
                      </div>
                    ))}
                  </div>
                }
              >
                <div className="divide-y divide-[color:var(--portal-border)]">
                  {visibleKnowledge.length ? (
                    visibleKnowledge.map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[color:var(--portal-text)]">{entry.title}</p>
                            <PortalStatusBadge borderless tone="neutral" status={formatCategoryLabel(entry.category)} />
                            {!isKnowledgePublished(entry) ? <PortalStatusBadge borderless tone="gold" status="Draft changed" /> : null}
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[color:var(--portal-muted)]">{entry.content}</p>
                          <p className="mt-1.5 text-xs tabular-nums text-[color:var(--portal-faint)]">
                            {entry.source_label || 'Owner entry'} · Updated {formatWhen(entry.updated_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-medium text-[color:var(--portal-muted)]">
                            {entry.active ? 'Active' : 'Inactive'}
                          </span>
                          <StatusToggle
                            active={entry.active}
                            disabled={busyAction === `knowledge-${entry.id}`}
                            onChange={(active) => void toggleKnowledge(entry, active)}
                          />
                          <PortalGhostIconButton
                            size="sm"
                            onClick={() =>
                              setKnowledgeEditor({
                                id: entry.id,
                                title: entry.title,
                                content: entry.content,
                                category: entry.category,
                                source_type: entry.source_type,
                                source_label: entry.source_label || '',
                                active: entry.active,
                                sort_order: entry.sort_order,
                              })
                            }
                            aria-label={`Edit ${entry.title}`}
                          >
                            <Pencil size={14} />
                          </PortalGhostIconButton>
                          <PortalGhostIconButton
                            size="sm"
                            onClick={() => setConfirmDialog({ type: 'archive_knowledge', entry })}
                            aria-label={`Delete ${entry.title}`}
                            className="hover:!bg-red-500/10 hover:!text-red-500"
                          >
                            <Trash2 size={14} />
                          </PortalGhostIconButton>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-12 text-center">
                      <BookOpen size={20} className="mx-auto text-[color:var(--portal-faint)]" aria-hidden="true" />
                      <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No knowledge matches these filters</p>
                      <p className="mt-1 text-xs text-[color:var(--portal-muted)]">Clear the search or add a new entry.</p>
                    </div>
                  )}
                </div>
              </PortalSkeletonTransition>
            </Panel>
          </div>
        ) : null}

        {activeTab === 'flows' ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <PortalButton variant="primary" disabled={isFetchingInitial} onClick={() => setFlowEditor({ ...EMPTY_FLOW })}>
                <Plus size={14} aria-hidden="true" />
                New flow
              </PortalButton>
            </div>

            <AnimatePresence initial={false}>
              {flowEditor ? (
                <motion.div
                  key={flowEditor.id || 'new-flow'}
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <Panel className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold text-[color:var(--portal-text)]">
                        {flowEditor.id ? 'Edit flow draft' : 'New flow draft'}
                      </h3>
                      <PortalCloseButton onClick={() => setFlowEditor(null)} aria-label="Close flow editor" />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <label className="space-y-1.5">
                        <span className={labelClass}>Flow name</span>
                        <input
                          value={flowEditor.name}
                          onChange={(event) => setFlowEditor({ ...flowEditor, name: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className={labelClass}>When to use it</span>
                        <input
                          value={flowEditor.trigger_text}
                          onChange={(event) => setFlowEditor({ ...flowEditor, trigger_text: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-1.5 lg:col-span-2">
                        <span className={labelClass}>Purpose</span>
                        <input
                          value={flowEditor.description}
                          onChange={(event) => setFlowEditor({ ...flowEditor, description: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <div className="space-y-2 lg:col-span-2">
                        <span className={labelClass}>Guidance steps</span>
                        {flowEditor.steps.map((step, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="w-5 text-center text-xs font-bold tabular-nums text-[color:var(--portal-muted)]">
                              {index + 1}
                            </span>
                            <input
                              value={step}
                              onChange={(event) =>
                                setFlowEditor({
                                  ...flowEditor,
                                  steps: flowEditor.steps.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                                })
                              }
                              className={inputClass}
                            />
                            <PortalGhostIconButton
                              size="sm"
                              onClick={() =>
                                setFlowEditor({
                                  ...flowEditor,
                                  steps: flowEditor.steps.filter((_, itemIndex) => itemIndex !== index),
                                })
                              }
                              aria-label={`Remove step ${index + 1}`}
                              className="hover:!bg-red-500/10 hover:!text-red-500"
                            >
                              <X size={13} />
                            </PortalGhostIconButton>
                          </div>
                        ))}
                        <PortalButton
                          size="sm"
                          variant="ghost"
                          onClick={() => setFlowEditor({ ...flowEditor, steps: [...flowEditor.steps, ''] })}
                          className="ml-7"
                        >
                          <Plus size={13} aria-hidden="true" />
                          Add step
                        </PortalButton>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[color:var(--portal-text)]">
                        <StatusToggle
                          active={flowEditor.active}
                          onChange={(active) => setFlowEditor({ ...flowEditor, active })}
                        />
                        Active in draft
                      </label>
                      <div className="flex justify-end gap-2">
                        <PortalButton variant="ghost" onClick={() => setFlowEditor(null)}>
                          Cancel
                        </PortalButton>
                        <PortalButton
                          variant="primary"
                          disabled={
                            !flowEditor.name.trim() ||
                            !flowEditor.steps.some((step) => step.trim()) ||
                            busyAction?.startsWith('flow-')
                          }
                          onClick={() => void saveFlow(flowEditor)}
                        >
                          {busyAction?.startsWith('flow-') ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Save size={14} aria-hidden="true" />
                          )}
                          Save draft
                        </PortalButton>
                      </div>
                    </div>
                  </Panel>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Panel className="overflow-hidden">
              <PortalSkeletonTransition
                loading={isFetchingInitial}
                skeleton={
                  <div className="divide-y divide-[color:var(--portal-border)]">
                    {[0, 1].map((idx) => (
                      <div key={idx} className="space-y-2 px-4 py-4 sm:px-5">
                        <PortalSkeleton className="h-4 w-40 rounded" />
                        <PortalSkeleton className="h-3.5 w-2/3 rounded" />
                      </div>
                    ))}
                  </div>
                }
              >
                <div className="divide-y divide-[color:var(--portal-border)]">
                  {(state?.flows || [])
                    .filter((flow) => !flow.archived)
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((flow, index, list) => (
                      <div key={flow.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[color:var(--portal-text)]">{flow.name}</p>
                            <span className="text-xs tabular-nums text-[color:var(--portal-muted)]">{flow.steps.length} steps</span>
                            {!isFlowPublished(flow) ? <PortalStatusBadge borderless tone="gold" status="Draft changed" /> : null}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">
                            {flow.description || flow.trigger_text}
                          </p>
                          <ol className="mt-2 space-y-1 text-xs text-[color:var(--portal-faint)]">
                            {flow.steps.slice(0, 3).map((step, stepIndex) => (
                              <li key={stepIndex} className="tabular-nums">
                                {stepIndex + 1}. {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <PortalGhostIconButton
                            size="sm"
                            disabled={index === 0 || busyAction?.startsWith('move-')}
                            onClick={() => void moveFlow(flow, -1)}
                            aria-label={`Move ${flow.name} up`}
                          >
                            <ArrowUp size={14} />
                          </PortalGhostIconButton>
                          <PortalGhostIconButton
                            size="sm"
                            disabled={index === list.length - 1 || busyAction?.startsWith('move-')}
                            onClick={() => void moveFlow(flow, 1)}
                            aria-label={`Move ${flow.name} down`}
                          >
                            <ArrowDown size={14} />
                          </PortalGhostIconButton>
                          <StatusToggle
                            active={flow.active}
                            onChange={(active) =>
                              void saveFlow(
                                {
                                  id: flow.id,
                                  name: flow.name,
                                  description: flow.description,
                                  trigger_text: flow.trigger_text,
                                  steps: flow.steps,
                                  active,
                                  sort_order: flow.sort_order,
                                },
                                true,
                              )
                            }
                          />
                          <PortalGhostIconButton
                            size="sm"
                            onClick={() =>
                              setFlowEditor({
                                id: flow.id,
                                name: flow.name,
                                description: flow.description,
                                trigger_text: flow.trigger_text,
                                steps: flow.steps,
                                active: flow.active,
                                sort_order: flow.sort_order,
                              })
                            }
                            aria-label={`Edit ${flow.name}`}
                          >
                            <Pencil size={14} />
                          </PortalGhostIconButton>
                          <PortalGhostIconButton
                            size="sm"
                            onClick={() => setConfirmDialog({ type: 'archive_flow', flow })}
                            aria-label={`Delete ${flow.name}`}
                            className="hover:!bg-red-500/10 hover:!text-red-500"
                          >
                            <Trash2 size={14} />
                          </PortalGhostIconButton>
                        </div>
                      </div>
                    ))}
                </div>
              </PortalSkeletonTransition>
            </Panel>
          </div>
        ) : null}

        {activeTab === 'instructions' ? (
          <Panel>
            <SectionHeading
              icon={<SlidersHorizontal size={17} />}
              title="Elena’s instructions"
              description="Saved changes remain drafts until you publish them."
            />
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
              {INSTRUCTION_FIELDS.map((field) => (
                <label key={field.key} className="space-y-1.5">
                  <span className="block text-xs font-semibold text-[color:var(--portal-text)]">{field.label}</span>
                  <span className="block text-xs text-[color:var(--portal-muted)]">{field.help}</span>
                  <PortalSkeletonTransition
                    loading={isFetchingInitial || !instructions}
                    overlap
                    skeleton={<PortalSkeleton className="h-24 w-full rounded-xl" />}
                  >
                    <textarea
                      rows={4}
                      value={instructions ? instructions[field.key] : ''}
                      onChange={(event) =>
                        setInstructions((current) => (current ? { ...current, [field.key]: event.target.value } : current))
                      }
                      className={`${inputClass} min-h-24 resize-y py-2.5 text-xs leading-5`}
                    />
                  </PortalSkeletonTransition>
                </label>
              ))}
            </div>
            <div className="flex justify-end border-t border-[color:var(--portal-border)] p-4">
              <PortalButton
                variant="primary"
                disabled={busyAction === 'instructions' || isFetchingInitial || !instructions}
                onClick={() => void saveInstructions()}
              >
                {busyAction === 'instructions' ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                Save instructions draft
              </PortalButton>
            </div>
          </Panel>
        ) : null}

        {activeTab === 'integrations' ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <SectionHeading
                icon={<FileUp size={17} />}
                title="Import knowledge"
                description="Imported entries arrive inactive so you can review them first."
              />
              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className={labelClass}>Source label</span>
                    <input value={importLabel} onChange={(event) => setImportLabel(event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1.5">
                    <span className={labelClass}>Category</span>
                    <PortalSelect
                      value={importCategory}
                      onChange={setImportCategory}
                      options={CATEGORIES}
                      buttonClassName="min-h-10"
                    />
                  </label>
                </div>
                <textarea
                  rows={8}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder="Paste FAQs, notes, or venue information…"
                  className={`${inputClass} min-h-40 resize-y py-2.5 text-xs leading-5`}
                />
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-9.5 cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2 text-xs font-semibold text-[color:var(--portal-text)] transition-colors hover:border-[#caa24c]/35">
                    <FileUp size={14} aria-hidden="true" />
                    Choose .txt or .md
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      className="sr-only"
                      onChange={(event) => void readImportFile(event.target.files?.[0])}
                    />
                  </label>
                  <PortalButton
                    variant="primary"
                    disabled={!importText.trim() || busyAction === 'import-text' || isFetchingInitial}
                    onClick={() => void runImport(false)}
                  >
                    {busyAction === 'import-text' ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <BookOpen size={14} aria-hidden="true" />
                    )}
                    Create review drafts
                  </PortalButton>
                  <PortalButton disabled={busyAction === 'import-website' || isFetchingInitial} onClick={() => void runImport(true)}>
                    {busyAction === 'import-website' ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw size={14} aria-hidden="true" />
                    )}
                    Import website data
                  </PortalButton>
                </div>
              </div>
            </Panel>

            <Panel>
              <SectionHeading
                icon={<Database size={17} />}
                title="Connected data"
                description="Live sources Elena checks at answer time."
              />
              <PortalSkeletonTransition
                loading={isFetchingInitial}
                skeleton={
                  <div className="divide-y divide-[color:var(--portal-border)]">
                    {[0, 1, 2].map((idx) => (
                      <div key={idx} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                        <div className="space-y-1.5">
                          <PortalSkeleton className="h-3.5 w-28 rounded" />
                          <PortalSkeleton className="h-3 w-40 rounded" />
                        </div>
                        <PortalSkeleton className="h-5 w-20 rounded-md" />
                      </div>
                    ))}
                  </div>
                }
              >
                <div className="divide-y divide-[color:var(--portal-border)]">
                  {state
                    ? Object.entries(state.connections).map(([key, connection]) => (
                        <div key={key} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                          <div>
                            <p className="text-xs font-bold capitalize text-[color:var(--portal-text)]">
                              {key === 'siteContent' ? 'Website content' : key}
                            </p>
                            <p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">{connection.detail}</p>
                          </div>
                          <PortalStatusBadge
                            borderless
                            tone={connection.status === 'connected' ? 'green' : 'red'}
                            status={connection.status}
                          />
                        </div>
                      ))
                    : null}
                </div>
              </PortalSkeletonTransition>
            </Panel>
          </div>
        ) : null}

        {activeTab === 'settings' ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel>
              <SectionHeading
                icon={<ShieldCheck size={17} />}
                title="Publishing"
                description="Drafts stay private until you publish them."
              />
              <div className="space-y-4 p-4 sm:p-5">
                <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4">
                  <p className="text-xs font-medium text-[color:var(--portal-muted)]">Current public version</p>
                  <PortalSkeletonTransition
                    loading={isFetchingInitial}
                    overlap
                    skeleton={
                      <div className="mt-1.5 space-y-1.5">
                        <PortalSkeleton className="h-6 w-24 rounded" />
                        <PortalSkeleton className="h-3.5 w-36 rounded" />
                      </div>
                    }
                  >
                    <div>
                      <p className="mt-1 font-sans text-xl font-bold tabular-nums text-[color:var(--portal-text)]">
                        Version {state?.settings.version ?? '—'}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-[color:var(--portal-muted)]">
                        Published {formatWhen(state?.settings.published_at ?? null)}
                      </p>
                    </div>
                  </PortalSkeletonTransition>
                </div>
                <p className="text-xs leading-5 text-[color:var(--portal-muted)]">
                  Publishing updates website Elena&apos;s active instructions, knowledge, and flows together. Inactive drafts stay excluded.
                </p>
                <PortalButton
                  variant="primary"
                  disabled={!hasDraftChanges || busyAction === 'publish' || isFetchingInitial}
                  onClick={() => setConfirmDialog({ type: 'publish' })}
                >
                  {busyAction === 'publish' ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save size={14} aria-hidden="true" />
                  )}
                  Publish website Elena
                </PortalButton>
              </div>
            </Panel>

            <Panel>
              <SectionHeading
                icon={<ShieldCheck size={17} />}
                title="Accuracy boundary"
                description="Safeguards enforced on every public response."
              />
              <ul className="space-y-2.5 p-4 text-xs leading-5 text-[color:var(--portal-muted)] sm:p-5">
                <li>Elena uses only published knowledge and live connected venue data for factual claims.</li>
                <li>Missing or unavailable details trigger a handoff to the team instead of guessing.</li>
                <li>Preview mode cannot book tours, create leads, send messages, or edit records.</li>
                <li>Internal portal Elena stays separate and never shares private CRM context publicly.</li>
              </ul>
            </Panel>
          </div>
        ) : null}
      </PortalTabTransition>

      <PortalModal
        isOpen={Boolean(confirmDialog)}
        onClose={() => {
          if (!confirmBusy) setConfirmDialog(null)
        }}
        title={
          confirmDialog?.type === 'publish'
            ? 'Publish changes to website Elena?'
            : confirmDialog?.type === 'archive_knowledge'
              ? 'Remove knowledge entry?'
              : 'Remove conversation flow?'
        }
        maxWidth="max-w-md"
      >
        {confirmDialog ? (
          <div className="space-y-4 text-xs leading-relaxed text-[color:var(--portal-muted)]">
            {confirmDialog.type === 'publish' ? (
              <p>
                This updates the live website concierge with your current active knowledge, flows, and instructions.
              </p>
            ) : confirmDialog.type === 'archive_knowledge' ? (
              <p>
                Remove <strong className="text-[color:var(--portal-text)]">{confirmDialog.entry.title}</strong> from your draft? Publish afterward to remove it from website Elena.
              </p>
            ) : (
              <p>
                Remove <strong className="text-[color:var(--portal-text)]">{confirmDialog.flow.name}</strong> from your draft? Publish afterward to remove it from website Elena.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-3 sm:flex-row sm:justify-end">
              <PortalButton variant="ghost" disabled={confirmBusy} onClick={() => setConfirmDialog(null)}>
                Cancel
              </PortalButton>
              {confirmDialog.type === 'publish' ? (
                <PortalButton variant="primary" disabled={confirmBusy} onClick={() => void confirmPublish()}>
                  {busyAction === 'publish' ? 'Publishing…' : 'Publish changes'}
                </PortalButton>
              ) : confirmDialog.type === 'archive_knowledge' ? (
                <PortalButton
                  variant="danger"
                  disabled={confirmBusy}
                  onClick={() => void confirmArchiveKnowledge(confirmDialog.entry)}
                >
                  {confirmBusy ? 'Removing…' : 'Remove from draft'}
                </PortalButton>
              ) : (
                <PortalButton
                  variant="danger"
                  disabled={confirmBusy}
                  onClick={() => void confirmArchiveFlow(confirmDialog.flow)}
                >
                  {confirmBusy ? 'Removing…' : 'Remove from draft'}
                </PortalButton>
              )}
            </div>
          </div>
        ) : null}
      </PortalModal>
    </div>
  )
}
