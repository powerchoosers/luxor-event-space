'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, Database, FileUp,
  GitBranch, History, Loader2, MessageCircle, Pencil, Plus, RefreshCw, Save, Search, Send,
  ShieldCheck, SlidersHorizontal, Trash2, Unplug, X,
} from 'lucide-react'
import { PortalAnimatedTabs, PortalButton, PortalSelect, PortalTabTransition } from '@/components/portal/PortalUI'
import { useToast } from '@/components/portal/ToastProvider'

type ElenaTab = 'overview' | 'knowledge' | 'flows' | 'instructions' | 'integrations' | 'settings'
type SourceType = 'manual' | 'import' | 'website' | 'connected'

type Instructions = {
  identity: string; introduction: string; voice: string; priorities: string
  accuracy: string; tour_guidance: string; clarification: string; handoff: string
}

type Knowledge = {
  id: string; title: string; content: string; category: string; source_type: SourceType
  source_label: string | null; active: boolean; archived: boolean; sort_order: number
  published_payload: Record<string, unknown> | null; published_at: string | null; updated_at: string
}

type ElenaFlow = {
  id: string; name: string; description: string; trigger_text: string; steps: string[]
  active: boolean; archived: boolean; sort_order: number
  published_payload: Record<string, unknown> | null; published_at: string | null; updated_at: string
}

type ManagementState = {
  settings: {
    draft_instructions: Instructions; published_instructions: Instructions; version: number
    published_at: string | null; updated_at: string; updated_by: string | null
  }
  knowledge: Knowledge[]
  flows: ElenaFlow[]
  connections: Record<string, { status: string; detail: string }>
}

type PreviewMessage = { role: 'user' | 'assistant'; content: string; sources?: Record<string, unknown> }

const TABS: Array<{ id: ElenaTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'knowledge', label: 'Knowledge Base' },
  { id: 'flows', label: 'Flows' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
]

const CATEGORIES = [
  'Venue Information', 'Packages & Pricing', 'Tour Information', 'Weddings', 'Quinceañeras',
  'Birthdays', 'Baby Showers', 'Corporate Events', 'Venue Rules', 'Capacity', 'Amenities',
  'Parking', 'Vendors', 'Booking Process', 'Payments & Deposits', 'Policies',
  'Frequently Asked Questions', 'Contact Information',
].map((label) => ({ value: label, label }))

const INSTRUCTION_FIELDS: Array<{ key: keyof Instructions; label: string; help: string }> = [
  { key: 'identity', label: 'Who Elena is', help: 'The role Elena has when speaking with website visitors.' },
  { key: 'introduction', label: 'Introduction', help: 'How Elena should introduce herself and offer help.' },
  { key: 'voice', label: 'Brand voice', help: 'Tone, length, and conversational style.' },
  { key: 'priorities', label: 'Priorities', help: 'What Elena should accomplish during a useful conversation.' },
  { key: 'accuracy', label: 'Accuracy rules', help: 'What Elena must never invent or overstate.' },
  { key: 'tour_guidance', label: 'When to recommend a tour', help: 'The situations where a visit is the best next step.' },
  { key: 'clarification', label: 'When to clarify', help: 'How Elena should ask for missing context.' },
  { key: 'handoff', label: 'Human handoff', help: 'When Elena should involve the Luxor team.' },
]

const EMPTY_KNOWLEDGE = { title: '', content: '', category: 'Venue Information', source_type: 'manual' as SourceType, source_label: 'Owner entry', active: false, sort_order: 0 }
const EMPTY_FLOW = { name: '', description: '', trigger_text: '', steps: [''], active: false, sort_order: 0 }

function formatWhen(value: string | null) {
  if (!value) return 'Not published'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function isKnowledgePublished(entry: Knowledge) {
  if (!entry.published_payload) return !entry.active || entry.archived
  return !entry.archived && entry.active
    && entry.published_payload.title === entry.title
    && entry.published_payload.content === entry.content
    && entry.published_payload.category === entry.category
    && entry.published_payload.source_type === entry.source_type
    && entry.published_payload.source_label === entry.source_label
}

function isFlowPublished(flow: ElenaFlow) {
  if (!flow.published_payload) return !flow.active || flow.archived
  return !flow.archived && flow.active
    && flow.published_payload.name === flow.name
    && flow.published_payload.description === flow.description
    && flow.published_payload.trigger_text === flow.trigger_text
    && JSON.stringify(flow.published_payload.steps) === JSON.stringify(flow.steps)
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-sm ${className}`}>{children}</section>
}

function SectionHeading({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-5 py-4">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 text-[#a8792f] dark:text-[#e0bd67]">{icon}</span>
      <div><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{title}</h3><p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">{description}</p></div>
    </div>
    {action}
  </div>
}

function StatusToggle({ active, disabled, onChange }: { active: boolean; disabled?: boolean; onChange: (active: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={active} disabled={disabled} onClick={() => onChange(!active)} className={`relative h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 disabled:opacity-50 ${active ? 'bg-emerald-500' : 'bg-[color:var(--portal-border)]'}`}>
    <span className={`pointer-events-none absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none ${active ? 'translate-x-5' : 'translate-x-1'}`} />
    <span className="sr-only">{active ? 'Active' : 'Inactive'}</span>
  </button>
}

export function ElenaSettingsManager() {
  const { notify } = useToast()
  const [state, setState] = useState<ManagementState | null>(null)
  const [activeTab, setActiveTab] = useState<ElenaTab>('overview')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [knowledgeEditor, setKnowledgeEditor] = useState<(typeof EMPTY_KNOWLEDGE & { id?: string }) | null>(null)
  const [flowEditor, setFlowEditor] = useState<(typeof EMPTY_FLOW & { id?: string }) | null>(null)
  const [instructions, setInstructions] = useState<Instructions | null>(null)
  const [importText, setImportText] = useState('')
  const [importLabel, setImportLabel] = useState('Pasted notes')
  const [importCategory, setImportCategory] = useState('Frequently Asked Questions')
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([
    { role: 'assistant', content: 'Preview uses your saved draft configuration. Ask a question exactly as a visitor would.' },
  ])
  const [previewInput, setPreviewInput] = useState('')
  const previewEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!knowledgeEditor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const frame = window.requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLButtonElement>('button[aria-label="Close knowledge editor"]')?.closest<HTMLElement>('section')
      if (!editor) return
      const height = editor.scrollHeight
      editor.style.overflow = 'hidden'
      const animation = editor.animate(
        [{ height: '0px', opacity: 0, transform: 'translateY(-8px)' }, { height: `${height}px`, opacity: 1, transform: 'translateY(0)' }],
        { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      )
      animation.finished.finally(() => { editor.style.height = ''; editor.style.overflow = '' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [knowledgeEditor?.id])

  const closeKnowledgeEditor = async () => {
    const editor = document.querySelector<HTMLButtonElement>('button[aria-label="Close knowledge editor"]')?.closest<HTMLElement>('section')
    if (!editor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setKnowledgeEditor(null); return }
    editor.style.overflow = 'hidden'
    const animation = editor.animate(
      [{ height: `${editor.offsetHeight}px`, opacity: 1, transform: 'translateY(0)' }, { height: '0px', opacity: 0, transform: 'translateY(-8px)' }],
      { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
    )
    await animation.finished.catch(() => undefined)
    setKnowledgeEditor(null)
  }

  const handleKnowledgeEditorClose = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!knowledgeEditor) return
    const button = (event.target as Element).closest('button')
    const editor = document.querySelector<HTMLButtonElement>('button[aria-label="Close knowledge editor"]')?.closest('section')
    if (!button || !editor || !editor.contains(button)) return
    if (button.getAttribute('aria-label') !== 'Close knowledge editor' && button.textContent?.trim() !== 'Cancel') return
    event.preventDefault()
    event.stopPropagation()
    void closeKnowledgeEditor()
  }

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/portal/elena-config', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not load Elena settings.')
      setState(payload)
      setInstructions(payload.settings.draft_instructions)
    } catch (error) {
      notify({ title: 'Elena settings unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const request = async (body: Record<string, unknown>, label: string) => {
    setBusyAction(label)
    try {
      const response = await fetch('/api/portal/elena-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Elena could not save that change.')
      return payload
    } finally {
      setBusyAction(null)
    }
  }

  const visibleKnowledge = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (state?.knowledge || []).filter((entry) => !entry.archived)
      .filter((entry) => category === 'all' || entry.category === category)
      .filter((entry) => !query || `${entry.title} ${entry.content} ${entry.category} ${entry.source_label || ''}`.toLowerCase().includes(query))
  }, [category, search, state?.knowledge])

  const activeKnowledge = (state?.knowledge || []).filter((entry) => entry.active && !entry.archived)
  const activeFlows = (state?.flows || []).filter((flow) => flow.active && !flow.archived)
  const hasDraftChanges = Boolean(state && (
    JSON.stringify(state.settings.draft_instructions) !== JSON.stringify(state.settings.published_instructions)
    || state.knowledge.some((entry) => !isKnowledgePublished(entry))
    || state.flows.some((flow) => !isFlowPublished(flow))
  ))

  const saveKnowledge = async (entry: typeof EMPTY_KNOWLEDGE & { id?: string }) => {
    try {
      await request({ action: 'save_knowledge', ...entry }, `knowledge-${entry.id || 'new'}`)
      setKnowledgeEditor(null)
      notify({ title: entry.id ? 'Knowledge draft updated' : 'Knowledge draft created', description: 'Publish when you are ready for website Elena to use it.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Knowledge was not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const toggleKnowledge = async (entry: Knowledge, active: boolean) => {
    await saveKnowledge({ id: entry.id, title: entry.title, content: entry.content, category: entry.category, source_type: entry.source_type, source_label: entry.source_label || '', active, sort_order: entry.sort_order })
  }

  const archiveKnowledge = async (entry: Knowledge) => {
    if (!window.confirm(`Remove “${entry.title}” from the draft? Publish afterward to remove it from website Elena.`)) return
    try {
      await request({ action: 'archive_knowledge', id: entry.id }, `archive-${entry.id}`)
      notify({ title: 'Knowledge removed from draft', description: 'Publish changes to remove it from website Elena.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Knowledge was not removed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const saveFlow = async (flow: typeof EMPTY_FLOW & { id?: string }, quiet = false) => {
    try {
      await request({ action: 'save_flow', ...flow, steps: flow.steps.map((step) => step.trim()).filter(Boolean) }, `flow-${flow.id || 'new'}`)
      setFlowEditor(null)
      if (!quiet) notify({ title: flow.id ? 'Flow draft updated' : 'Flow draft created', description: 'Preview it, then publish when ready.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Flow was not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const archiveFlow = async (flow: ElenaFlow) => {
    if (!window.confirm(`Remove “${flow.name}” from the draft? Publish afterward to remove it from website Elena.`)) return
    try {
      await request({ action: 'archive_flow', id: flow.id }, `archive-flow-${flow.id}`)
      notify({ title: 'Flow removed from draft', description: 'Publish changes to remove it from website Elena.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Flow was not removed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const moveFlow = async (flow: ElenaFlow, direction: -1 | 1) => {
    if (!state) return
    const current = state.flows.filter((item) => !item.archived).sort((a, b) => a.sort_order - b.sort_order)
    const index = current.findIndex((item) => item.id === flow.id)
    const swap = current[index + direction]
    if (!swap) return
    try {
      await request({ action: 'save_flow', ...flow, sort_order: swap.sort_order }, `move-${flow.id}`)
      await request({ action: 'save_flow', ...swap, sort_order: flow.sort_order }, `move-${swap.id}`)
      await load()
    } catch (error) { notify({ title: 'Flow order was not changed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const saveInstructions = async () => {
    if (!instructions) return
    try {
      await request({ action: 'save_instructions', instructions }, 'instructions')
      notify({ title: 'Instructions saved as a draft', description: 'Test Elena before publishing them to the website.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Instructions were not saved', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const publish = async () => {
    if (!state || !window.confirm('Publish the current active knowledge, flows, and instructions to website Elena?')) return
    try {
      await request({ action: 'publish' }, 'publish')
      notify({ title: 'Website Elena updated', description: 'The public concierge now uses this configuration.', variant: 'success' })
      await load()
    } catch (error) { notify({ title: 'Changes were not published', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
  }

  const runImport = async (website = false) => {
    try {
      const payload = await request(website ? { action: 'import_website' } : { action: 'import_text', text: importText, source_label: importLabel, category: importCategory }, website ? 'import-website' : 'import-text')
      setImportText('')
      notify({ title: `${payload.count} knowledge draft${payload.count === 1 ? '' : 's'} ready for review`, description: 'Imported entries are inactive until you review and enable them.', variant: 'success' })
      setActiveTab('knowledge')
      await load()
    } catch (error) { notify({ title: 'Knowledge was not imported', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' }) }
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
    const history = [...previewMessages.filter((message) => message.role === 'user' || message.role === 'assistant').slice(-8), user]
    setPreviewMessages((current) => [...current, user])
    setPreviewInput('')
    setBusyAction('preview')
    try {
      const response = await fetch('/api/portal/elena-config/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Preview is unavailable.')
      setPreviewMessages((current) => [...current, { role: 'assistant', content: payload.reply, sources: payload.sources }])
    } catch (error) {
      setPreviewMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Preview is unavailable.' }])
    } finally {
      setBusyAction(null)
      window.setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }

  if (loading && !state) return <div className="flex min-h-72 items-center justify-center rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]"><Loader2 className="h-5 w-5 animate-spin text-[#a8792f]" /><span className="ml-3 text-sm text-[color:var(--portal-muted)]">Loading Elena management…</span></div>
  if (!state || !instructions) return <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6"><p className="text-sm font-semibold text-red-600 dark:text-red-300">Elena management could not be loaded.</p><PortalButton className="mt-4" onClick={() => void load()}><RefreshCw size={13} />Try again</PortalButton></div>

  const previewPanel = <Panel className="flex min-h-[31rem] flex-col overflow-hidden xl:row-span-2">
    <SectionHeading icon={<MessageCircle size={17} />} title="Test Elena" description="Uses saved drafts. Preview never books, sends, or changes client records." action={<button type="button" onClick={() => setPreviewMessages([{ role: 'assistant', content: 'New preview started. Ask a question exactly as a visitor would.' }])} className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#a8792f] hover:text-[#caa24c]">New chat</button>} />
    <div className="portal-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[color:var(--portal-soft)]/45 p-4" aria-live="polite">
      {previewMessages.map((message, index) => <div key={index} className={`max-w-[88%] rounded-xl px-3.5 py-3 text-xs leading-5 ${message.role === 'user' ? 'ml-auto bg-[#b88835] text-white' : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)]'}`}>
        {message.content}
        {message.sources ? <p className="mt-2 border-t border-current/10 pt-2 text-[9px] opacity-60">Draft sources checked: {String(message.sources.knowledge || 0)} knowledge entries · {String(message.sources.flows || 0)} flows</p> : null}
      </div>)}
      {busyAction === 'preview' ? <div className="flex items-center gap-2 text-xs text-[color:var(--portal-muted)]"><Loader2 size={13} className="animate-spin" />Elena is checking the draft and connected data…</div> : null}
      <div ref={previewEndRef} />
    </div>
    <div className="border-t border-[color:var(--portal-border)] p-3">
      <div className="flex items-end gap-2"><textarea value={previewInput} onChange={(event) => setPreviewInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendPreview() } }} rows={2} placeholder="Ask Elena a visitor question…" className="min-h-11 flex-1 resize-none rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-faint)] focus:border-[#caa24c]/50" /><button type="button" disabled={!previewInput.trim() || busyAction === 'preview'} onClick={() => void sendPreview()} aria-label="Send preview question" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#b88835] text-white transition hover:bg-[#caa24c] disabled:opacity-40"><Send size={15} /></button></div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{['How much is the venue?', 'Can I tour tomorrow?', 'Can I bring my own vendors?'].map((question) => <button key={question} type="button" onClick={() => void sendPreview(question)} className="shrink-0 rounded-lg border border-[color:var(--portal-border)] px-2.5 py-1.5 text-[9px] text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[color:var(--portal-text)]">{question}</button>)}</div>
    </div>
  </Panel>

  return <div className="space-y-5" onClickCapture={handleKnowledgeEditorClose}>
    <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-3"><span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#caa24c]/30 bg-[color:var(--portal-soft)] ring-2 ring-[#caa24c]/10"><Image src="/luxor-concierge.png" alt="Elena AI concierge" fill sizes="40px" className="object-cover" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-xl font-semibold text-[color:var(--portal-text)]">Elena AI</h2><span className={`rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${hasDraftChanges ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>{hasDraftChanges ? 'Draft changes' : `Live v${state.settings.version}`}</span></div><p className="mt-0.5 text-xs text-[color:var(--portal-muted)]">Manage what website Elena knows and how she responds.</p></div></div>
      <div className="flex gap-2"><PortalButton onClick={() => { setActiveTab('overview'); window.setTimeout(() => previewEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60) }}><MessageCircle size={13} />Test Elena</PortalButton><PortalButton variant="primary" disabled={!hasDraftChanges || busyAction === 'publish'} onClick={() => void publish()}>{busyAction === 'publish' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Publish</PortalButton></div>
    </div>

    <div className="portal-scrollbar overflow-x-auto border-b border-[color:var(--portal-border)]"><PortalAnimatedTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} ariaLabel="Elena settings sections" className="gap-6" buttonClassName="pb-3" /></div>

    <PortalTabTransition activeKey={activeTab}>
    {activeTab === 'overview' ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
      <div className="order-2 space-y-5 xl:order-1">
        <Panel><SectionHeading icon={<BookOpen size={17} />} title="Knowledge Base" description={`${activeKnowledge.length} active draft entries across ${new Set(activeKnowledge.map((entry) => entry.category)).size} categories.`} action={<button type="button" onClick={() => setActiveTab('knowledge')} className="text-[#a8792f]"><ChevronRight size={17} /></button>} /><div className="divide-y divide-[color:var(--portal-border)]">{Array.from(new Map(activeKnowledge.map((entry) => [entry.category, activeKnowledge.filter((item) => item.category === entry.category).length]))).slice(0, 6).map(([label, count]) => <button key={label} type="button" onClick={() => { setCategory(label); setActiveTab('knowledge') }} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-[color:var(--portal-soft)]"><span className="text-xs font-semibold text-[color:var(--portal-text)]">{label}</span><span className="text-[10px] text-[color:var(--portal-muted)]">{count} {count === 1 ? 'item' : 'items'} <ChevronRight size={12} className="ml-1 inline" /></span></button>)}</div></Panel>
        <div className="grid gap-5 md:grid-cols-2"><Panel><SectionHeading icon={<GitBranch size={17} />} title="Flows" description={`${activeFlows.length} active guided conversations.`} action={<button type="button" onClick={() => setActiveTab('flows')} className="text-[#a8792f]"><ChevronRight size={17} /></button>} /><div className="divide-y divide-[color:var(--portal-border)]">{activeFlows.slice(0, 4).map((flow) => <div key={flow.id} className="flex items-center justify-between px-5 py-3"><div><p className="text-xs font-semibold text-[color:var(--portal-text)]">{flow.name}</p><p className="mt-0.5 text-[9px] text-[color:var(--portal-muted)]">{flow.steps.length} steps</p></div><span className="h-2 w-2 rounded-full bg-emerald-500" /></div>)}</div></Panel><Panel><SectionHeading icon={<SlidersHorizontal size={17} />} title="Elena's Instructions" description="Voice, accuracy, conversion, and handoff behavior." action={<button type="button" onClick={() => setActiveTab('instructions')} className="text-[#a8792f]"><ChevronRight size={17} /></button>} /><div className="p-5"><p className="line-clamp-5 text-xs leading-5 text-[color:var(--portal-muted)]">{instructions.voice} {instructions.accuracy}</p></div></Panel></div>
      </div>
      <div className="order-1 xl:order-2">{previewPanel}</div>
      <div className="order-3 grid gap-5 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-4"><button type="button" onClick={() => setActiveTab('integrations')} className="text-left"><Panel className="h-full p-4"><FileUp size={16} className="text-[#a8792f]" /><p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Import Knowledge</p><p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">Turn notes, FAQs, or website copy into reviewable drafts.</p></Panel></button><Panel className="p-4"><ShieldCheck size={16} className="text-[#a8792f]" /><p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Knowledge Status</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{activeKnowledge.length} active · {(state.knowledge || []).filter((entry) => !entry.active && !entry.archived).length} inactive</p></Panel><button type="button" onClick={() => setActiveTab('integrations')} className="text-left"><Panel className="h-full p-4"><Database size={16} className="text-[#a8792f]" /><p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Connected Data</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{Object.values(state.connections).filter((item) => item.status === 'connected').length} of {Object.keys(state.connections).length} sources connected</p></Panel></button><Panel className="p-4"><History size={16} className="text-[#a8792f]" /><p className="mt-3 text-xs font-bold text-[color:var(--portal-text)]">Live Configuration</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Version {state.settings.version} · {formatWhen(state.settings.published_at)}</p></Panel></div>
    </div> : null}

    {activeTab === 'knowledge' ? <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--portal-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Elena's knowledge…" className="h-10 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pl-9 pr-3 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></div><PortalSelect value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES]} className="sm:w-56" buttonClassName="h-10" /><PortalButton variant="primary" className="h-10" onClick={() => setKnowledgeEditor({ ...EMPTY_KNOWLEDGE })}><Plus size={13} />Add knowledge</PortalButton></div>
      {knowledgeEditor ? <Panel className="p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{knowledgeEditor.id ? 'Edit knowledge draft' : 'New knowledge draft'}</h3><button type="button" onClick={() => setKnowledgeEditor(null)} aria-label="Close knowledge editor" className="text-[color:var(--portal-muted)]"><X size={16} /></button></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Title</span><input value={knowledgeEditor.title} onChange={(event) => setKnowledgeEditor({ ...knowledgeEditor, title: event.target.value })} className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Category</span><PortalSelect value={knowledgeEditor.category} onChange={(value) => setKnowledgeEditor({ ...knowledgeEditor, category: value })} options={CATEGORIES} /></label><label className="space-y-1.5 lg:col-span-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Approved answer or information</span><textarea rows={6} value={knowledgeEditor.content} onChange={(event) => setKnowledgeEditor({ ...knowledgeEditor, content: event.target.value })} className="w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--portal-text)]"><StatusToggle active={knowledgeEditor.active} onChange={(active) => setKnowledgeEditor({ ...knowledgeEditor, active })} />Active in draft</label><div className="flex justify-end gap-2"><PortalButton onClick={() => setKnowledgeEditor(null)}>Cancel</PortalButton><PortalButton variant="primary" disabled={!knowledgeEditor.title.trim() || !knowledgeEditor.content.trim() || busyAction?.startsWith('knowledge-')} onClick={() => void saveKnowledge(knowledgeEditor)}>{busyAction?.startsWith('knowledge-') ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save draft</PortalButton></div></div></Panel> : null}
      <Panel className="overflow-hidden"><div className="divide-y divide-[color:var(--portal-border)]">{visibleKnowledge.length ? visibleKnowledge.map((entry) => <div key={entry.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[color:var(--portal-text)]">{entry.title}</p><span className="rounded-md bg-[color:var(--portal-soft)] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-[color:var(--portal-muted)]">{entry.category}</span>{!isKnowledgePublished(entry) ? <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">Draft changed</span> : null}</div><p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-[color:var(--portal-muted)]">{entry.content}</p><p className="mt-2 text-[9px] text-[color:var(--portal-faint)]">{entry.source_label || 'Owner entry'} · Updated {formatWhen(entry.updated_at)}</p></div><div className="flex items-center gap-2"><span className="text-[9px] font-semibold text-[color:var(--portal-muted)]">{entry.active ? 'Active' : 'Inactive'}</span><StatusToggle active={entry.active} disabled={busyAction === `knowledge-${entry.id}`} onChange={(active) => void toggleKnowledge(entry, active)} /><button type="button" onClick={() => setKnowledgeEditor({ id: entry.id, title: entry.title, content: entry.content, category: entry.category, source_type: entry.source_type, source_label: entry.source_label || '', active: entry.active, sort_order: entry.sort_order })} aria-label={`Edit ${entry.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]"><Pencil size={13} /></button><button type="button" onClick={() => void archiveKnowledge(entry)} aria-label={`Delete ${entry.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-red-500/10 hover:text-red-500"><Trash2 size={13} /></button></div></div>) : <div className="px-5 py-12 text-center"><BookOpen size={20} className="mx-auto text-[color:var(--portal-faint)]" /><p className="mt-3 text-xs font-semibold text-[color:var(--portal-text)]">No knowledge matches these filters</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Clear the search or add a new entry.</p></div>}</div></Panel>
    </div> : null}

    {activeTab === 'flows' ? <div className="space-y-4"><div className="flex justify-end"><PortalButton variant="primary" onClick={() => setFlowEditor({ ...EMPTY_FLOW })}><Plus size={13} />New flow</PortalButton></div>
      {flowEditor ? <Panel className="p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-[color:var(--portal-text)]">{flowEditor.id ? 'Edit flow draft' : 'New flow draft'}</h3><button type="button" onClick={() => setFlowEditor(null)} aria-label="Close flow editor"><X size={16} /></button></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Flow name</span><input value={flowEditor.name} onChange={(event) => setFlowEditor({ ...flowEditor, name: event.target.value })} className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">When to use it</span><input value={flowEditor.trigger_text} onChange={(event) => setFlowEditor({ ...flowEditor, trigger_text: event.target.value })} className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label><label className="space-y-1.5 lg:col-span-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Purpose</span><input value={flowEditor.description} onChange={(event) => setFlowEditor({ ...flowEditor, description: event.target.value })} className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label><div className="space-y-2 lg:col-span-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Guidance steps</span>{flowEditor.steps.map((step, index) => <div key={index} className="flex items-center gap-2"><span className="w-5 text-center text-[10px] font-bold text-[color:var(--portal-faint)]">{index + 1}</span><input value={step} onChange={(event) => setFlowEditor({ ...flowEditor, steps: flowEditor.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="min-w-0 flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /><button type="button" onClick={() => setFlowEditor({ ...flowEditor, steps: flowEditor.steps.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove step ${index + 1}`} className="text-[color:var(--portal-muted)] hover:text-red-500"><X size={14} /></button></div>)}<button type="button" onClick={() => setFlowEditor({ ...flowEditor, steps: [...flowEditor.steps, ''] })} className="ml-7 text-[10px] font-bold text-[#a8792f]">+ Add step</button></div></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--portal-text)]"><StatusToggle active={flowEditor.active} onChange={(active) => setFlowEditor({ ...flowEditor, active })} />Active in draft</label><div className="flex justify-end gap-2"><PortalButton onClick={() => setFlowEditor(null)}>Cancel</PortalButton><PortalButton variant="primary" disabled={!flowEditor.name.trim() || !flowEditor.steps.some((step) => step.trim()) || busyAction?.startsWith('flow-')} onClick={() => void saveFlow(flowEditor)}>{busyAction?.startsWith('flow-') ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save draft</PortalButton></div></div></Panel> : null}
      <Panel className="overflow-hidden"><div className="divide-y divide-[color:var(--portal-border)]">{state.flows.filter((flow) => !flow.archived).sort((a, b) => a.sort_order - b.sort_order).map((flow, index, list) => <div key={flow.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[color:var(--portal-text)]">{flow.name}</p><span className="text-[9px] text-[color:var(--portal-muted)]">{flow.steps.length} steps</span>{!isFlowPublished(flow) ? <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">Draft changed</span> : null}</div><p className="mt-1 text-[10px] leading-4 text-[color:var(--portal-muted)]">{flow.description || flow.trigger_text}</p><ol className="mt-2 space-y-1 text-[9px] text-[color:var(--portal-faint)]">{flow.steps.slice(0, 3).map((step, stepIndex) => <li key={stepIndex}>{stepIndex + 1}. {step}</li>)}</ol></div><div className="flex items-center gap-1"><button type="button" disabled={index === 0 || busyAction?.startsWith('move-')} onClick={() => void moveFlow(flow, -1)} aria-label={`Move ${flow.name} up`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-25"><ArrowUp size={13} /></button><button type="button" disabled={index === list.length - 1 || busyAction?.startsWith('move-')} onClick={() => void moveFlow(flow, 1)} aria-label={`Move ${flow.name} down`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] disabled:opacity-25"><ArrowDown size={13} /></button><StatusToggle active={flow.active} onChange={(active) => void saveFlow({ id: flow.id, name: flow.name, description: flow.description, trigger_text: flow.trigger_text, steps: flow.steps, active, sort_order: flow.sort_order }, true)} /><button type="button" onClick={() => setFlowEditor({ id: flow.id, name: flow.name, description: flow.description, trigger_text: flow.trigger_text, steps: flow.steps, active: flow.active, sort_order: flow.sort_order })} aria-label={`Edit ${flow.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)]"><Pencil size={13} /></button><button type="button" onClick={() => void archiveFlow(flow)} aria-label={`Delete ${flow.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-red-500/10 hover:text-red-500"><Trash2 size={13} /></button></div></div>)}</div></Panel>
    </div> : null}

    {activeTab === 'instructions' ? <Panel><SectionHeading icon={<SlidersHorizontal size={17} />} title="Elena's Instructions" description="Saved changes remain drafts until you publish them." /><div className="grid gap-5 p-5 lg:grid-cols-2">{INSTRUCTION_FIELDS.map((field) => <label key={field.key} className="space-y-1.5"><span className="text-[10px] font-bold text-[color:var(--portal-text)]">{field.label}</span><span className="block text-[9px] leading-4 text-[color:var(--portal-muted)]">{field.help}</span><textarea rows={5} value={instructions[field.key]} onChange={(event) => setInstructions({ ...instructions, [field.key]: event.target.value })} className="w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label>)}</div><div className="flex justify-end border-t border-[color:var(--portal-border)] p-4"><PortalButton variant="primary" disabled={busyAction === 'instructions'} onClick={() => void saveInstructions()}>{busyAction === 'instructions' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Save instructions draft</PortalButton></div></Panel> : null}

    {activeTab === 'integrations' ? <div className="grid gap-5 xl:grid-cols-2"><Panel><SectionHeading icon={<FileUp size={17} />} title="Import Knowledge" description="Imported entries arrive inactive so you can review them first." /><div className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Source label</span><input value={importLabel} onChange={(event) => setImportLabel(event.target.value)} className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-xs text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /></label><label className="space-y-1.5"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Category</span><PortalSelect value={importCategory} onChange={setImportCategory} options={CATEGORIES} /></label></div><textarea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste FAQs, notes, or structured venue information…" className="w-full resize-y rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-3 text-xs leading-5 text-[color:var(--portal-text)] outline-none focus:border-[#caa24c]/50" /><div className="flex flex-wrap gap-2"><label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--portal-muted)] hover:border-[#caa24c]/30"><FileUp size={13} />Choose .txt or .md<input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={(event) => void readImportFile(event.target.files?.[0])} /></label><PortalButton variant="primary" disabled={!importText.trim() || busyAction === 'import-text'} onClick={() => void runImport(false)}>{busyAction === 'import-text' ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}Create review drafts</PortalButton><PortalButton disabled={busyAction === 'import-website'} onClick={() => void runImport(true)}>{busyAction === 'import-website' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Import website data</PortalButton></div></div></Panel><Panel><SectionHeading icon={<Database size={17} />} title="Connected Data" description="Live sources Elena checks at answer time." /><div className="divide-y divide-[color:var(--portal-border)]">{Object.entries(state.connections).map(([key, connection]) => <div key={key} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-xs font-bold capitalize text-[color:var(--portal-text)]">{key === 'siteContent' ? 'Website content' : key}</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">{connection.detail}</p></div><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${connection.status === 'connected' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-300'}`}>{connection.status === 'connected' ? <Check size={10} /> : <Unplug size={10} />}{connection.status}</span></div>)}</div></Panel></div> : null}

    {activeTab === 'settings' ? <div className="grid gap-5 xl:grid-cols-2"><Panel><SectionHeading icon={<ShieldCheck size={17} />} title="Publishing" description="Drafts are private until you publish them." /><div className="space-y-4 p-5"><div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Current public version</p><p className="mt-1 font-serif text-2xl font-semibold text-[color:var(--portal-text)]">Version {state.settings.version}</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Published {formatWhen(state.settings.published_at)}</p></div><p className="text-xs leading-5 text-[color:var(--portal-muted)]">Publishing atomically updates website Elena&apos;s active instructions, knowledge, and flows. Inactive or removed drafts are excluded from the public configuration.</p><PortalButton variant="primary" disabled={!hasDraftChanges || busyAction === 'publish'} onClick={() => void publish()}>{busyAction === 'publish' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Publish website Elena</PortalButton></div></Panel><Panel><SectionHeading icon={<ShieldCheck size={17} />} title="Accuracy Boundary" description="These safeguards remain in force for every public answer." /><div className="space-y-3 p-5 text-xs leading-5 text-[color:var(--portal-muted)]"><p>Elena uses only published knowledge and current connected data for factual venue claims.</p><p>Missing or unavailable facts trigger a human handoff instead of a guess.</p><p>Preview mode cannot book tours, create leads, send messages, or perform portal actions.</p><p>Portal Elena remains a separate authenticated internal assistant and its private context is never supplied to the public concierge.</p></div></Panel></div> : null}
    </PortalTabTransition>
  </div>
}
