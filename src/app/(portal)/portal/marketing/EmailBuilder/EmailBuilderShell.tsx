'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { nanoid } from './nanoid'
import type { EmailBlock, BlockType, EmailTemplate } from '../emailTemplates'
import { EMAIL_TEMPLATES } from '../emailTemplates'
import { BlockPalette } from './BlockPalette'
import { BlockCanvas } from './BlockCanvas'
import { BlockInspector } from './BlockInspector'
import { EmailPreview } from './EmailPreview'
import { Eye, Sparkles, RotateCcw, ChevronDown, Save, Trash2, Loader2 } from 'lucide-react'
import { PortalModal } from '@/components/portal/PortalUI'
import { BrandAssetPicker } from '@/components/portal/BrandAssetPicker'
import { AnimatePresence } from 'framer-motion'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'

// ─── Default block factories ──────────────────────────────────────────────────

function createBlock(type: BlockType): EmailBlock {
  const id = nanoid()
  switch (type) {
    case 'hero':
      return { id, type, headline: 'Your Headline Here', subheadline: 'A compelling sub-headline that draws your reader in.', backgroundImage: '', overlayOpacity: 0.55, textAlign: 'center', ctaLabel: 'Learn More', ctaUrl: 'https://luxoratlaspalmas.com', ctaVisible: true }
    case 'text':
      return { id, type, content: 'Write your message here. You can edit this text directly on the canvas.', fontSize: 15, textAlign: 'left', color: 'rgba(215,194,154,0.78)' }
    case 'image_text':
      return { id, type, imageUrl: '', imageAlt: 'Luxor Event Space', imagePosition: 'left', headline: 'Your Section Headline', body: 'Supporting copy that describes this section. Keep it concise and compelling.', ctaLabel: 'Find Out More', ctaUrl: 'https://luxoratlaspalmas.com' }
    case 'button':
      return { id, type, label: 'Call to Action', url: 'https://luxoratlaspalmas.com', align: 'center', bgColor: '#b8924a', textColor: '#ffffff' }
    case 'two_column':
      return { id, type, leftHeadline: 'Left Column', leftBody: 'Content for the left column goes here.', rightHeadline: 'Right Column', rightBody: 'Content for the right column goes here.' }
    case 'divider':
      return { id, type, color: '#e0c97c', thickness: 1, style: 'solid' }
    case 'spacer':
      return { id, type, height: 32 }
    case 'footer':
      return { id, type, companyName: 'Luxor Event Space', address: '803 Castroville Rd #402, San Antonio, TX 78237', phone: 'Private venue tours by appointment.', website: 'luxoratlaspalmas.com', unsubscribeUrl: '#unsubscribe', showSocial: true, instagramUrl: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr', facebookUrl: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr', tiktokUrl: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM' }
    default:
      return { id, type: 'spacer', height: 24 } as EmailBlock
  }
}

function cloneTemplateBlocks(blocks: EmailBlock[]) {
  return blocks.map((block) => ({ ...block, id: nanoid() }))
}

function cleanElenaDraftBlocks(blocks: EmailBlock[]) {
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value
        .replace(/<[^>]*>/g, '')
        .replace(/\bbestie\b[!,]?/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    }
    if (Array.isArray(value)) return value.map(clean)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]))
    }
    return value
  }
  return blocks.map(clean) as unknown as EmailBlock[]
}

// ─── Template Picker ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  promo: 'Promo',
  event: 'Event',
  nurture: 'Nurture',
  transactional: 'Transactional',
  seasonal: 'Seasonal',
  custom: 'Custom',
}

type SavedMarketingTemplate = {
  id: string
  name: string
  subject: string
  description: string | null
  category: string
  blocks: EmailBlock[]
  preview_color: string
  updated_at: string
  last_used_at: string | null
  metadata: Record<string, unknown>
}

type BuilderTemplate = EmailTemplate & {
  source: 'built-in' | 'saved'
  savedId?: string
  subject?: string
  updatedAt?: string
  audienceLabel?: string
  recipientEmails?: string[]
}

function TemplatePicker({
  isOpen,
  savedTemplates,
  loadingSaved,
  onSelect,
  onDeleteSaved,
  onClose,
}: {
  isOpen: boolean
  savedTemplates: BuilderTemplate[]
  loadingSaved: boolean
  onSelect: (tpl: BuilderTemplate) => void
  onDeleteSaved: (id: string) => void
  onClose: () => void
}) {
  const builtInTemplates: BuilderTemplate[] = EMAIL_TEMPLATES.map((tpl) => ({ ...tpl, source: 'built-in' }))

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Template Library</p>
            <h3 className="text-sm font-bold text-white/90 mt-0.5">Choose a Starting Template</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all text-xs font-bold uppercase tracking-widest">
            Cancel
          </button>
        </div>
        <div className="portal-scrollbar max-h-[70vh] overflow-y-auto p-6">
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Saved Templates</h4>
              {loadingSaved ? <Loader2 size={13} className="animate-spin text-zinc-600" /> : null}
            </div>
            {savedTemplates.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {savedTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="group overflow-hidden rounded-xl border border-[#caa24c]/20 bg-[#caa24c]/5 text-left transition-all hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10"
                  >
                    <button
                      onClick={() => { onSelect(tpl); onClose() }}
                      className="w-full cursor-pointer text-left"
                    >
                      <div className="h-2 w-full" style={{ background: tpl.previewColor }} />
                      <div className="p-4">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-white/90 group-hover:text-white">{decodeHtmlEntities(tpl.name)}</h4>
                          <span className="shrink-0 rounded-sm border border-[#caa24c]/30 bg-[#caa24c]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#f1d27a]">
                            Saved
                          </span>
                        </div>
                        <p className="min-h-8 text-[11px] leading-relaxed text-zinc-500">{decodeHtmlEntities(tpl.description || tpl.subject) || 'Custom saved email layout.'}</p>
                        <p className="mt-3 font-mono text-[10px] text-zinc-700">{tpl.blocks.length} blocks</p>
                      </div>
                    </button>
                    {tpl.savedId ? (
                      <button
                        onClick={() => onDeleteSaved(tpl.savedId as string)}
                        className="mx-4 mb-4 flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/10"
                      >
                        <Trash2 size={10} />
                        Delete
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-5 text-xs leading-5 text-zinc-500">
                No saved templates yet. Build an email, then use Save Template.
              </div>
            )}
          </div>

          <div className="mb-3">
            <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">Starter Templates</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtInTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => { onSelect(tpl); onClose() }}
              className="cursor-pointer overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/20 text-left transition-all hover:scale-[1.02] hover:border-zinc-600 hover:bg-zinc-800/30 group"
            >
              {/* Color band */}
              <div className="h-2 w-full" style={{ background: tpl.previewColor }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-xs font-bold text-white/90 group-hover:text-white transition-colors">{decodeHtmlEntities(tpl.name)}</h4>
                  <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border flex-shrink-0"
                    style={{ color: tpl.previewColor, borderColor: `${tpl.previewColor}40`, background: `${tpl.previewColor}15` }}>
                    {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{tpl.description}</p>
                <p className="text-[10px] text-zinc-700 mt-3 font-mono">{tpl.blocks.length} blocks</p>
              </div>
            </button>
          ))}
          </div>
        </div>
      </PortalModal>
  )
}

function SaveTemplateModal({
  isOpen,
  subject,
  blocks,
  audienceLabel,
  recipientEmails,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  subject: string
  blocks: EmailBlock[]
  audienceLabel: string
  recipientEmails: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(subject || '')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function saveTemplate() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/marketing/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          description,
          category: 'custom',
          blocks,
          previewColor: '#caa24c',
          metadata: { audienceLabel, recipientEmails },
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save template.')
      onSaved()
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save template.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
        <div className="border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Save Template</p>
          <h3 className="mt-0.5 text-sm font-bold text-white/90">Name this reusable email</h3>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Template Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20"
              placeholder="Example: Tour no-show reactivation"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-24 w-full resize-none rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20"
              placeholder="When should you use this template?"
            />
          </div>
          {message ? <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">{message}</p> : null}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="rounded-lg border border-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
              Cancel
            </button>
            <button
              onClick={saveTemplate}
              disabled={saving || !name.trim() || !blocks.length}
              className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-5 py-2.5 text-xs font-black uppercase tracking-[0.15em] text-white transition-all hover:bg-[#d4b060] disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Template
            </button>
          </div>
        </div>
      </PortalModal>
  )
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export function EmailBuilderShell({ initialTemplate = null }: { initialTemplate?: EmailTemplate | null }) {
  const [initialBuilderState] = useState(() => {
    const initialBlocks = initialTemplate ? cloneTemplateBlocks(initialTemplate.blocks) : []
    return {
      blocks: initialBlocks,
      subject: initialTemplate?.name || '',
      history: [initialBlocks],
    }
  })
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBuilderState.blocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [subject, setSubject] = useState(initialBuilderState.subject)
  const [audienceLabel, setAudienceLabel] = useState('Manual list')
  const [recipientEmails, setRecipientEmails] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState<BuilderTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [history, setHistory] = useState<EmailBlock[][]>(initialBuilderState.history)
  const [historyIdx, setHistoryIdx] = useState(0)
  const [draftHydrated, setDraftHydrated] = useState(false)

  // Load campaign draft generated by Elena if present
  useEffect(() => {
    const checkDraft = () => {
      const activeDraftStr = localStorage.getItem('elena_active_campaign_draft')
      const workingDraftStr = localStorage.getItem('luxor_email_builder_working_draft')
      const storedDraft = activeDraftStr || workingDraftStr
      if (storedDraft) {
        try {
          const activeDraft = JSON.parse(storedDraft)
          if (activeDraft.blocks && activeDraft.blocks.length > 0) {
            const sourceBlocks = activeDraftStr ? cleanElenaDraftBlocks(activeDraft.blocks) : activeDraft.blocks
            const cloned = cloneTemplateBlocks(sourceBlocks)
            setBlocks(cloned)
            setSubject(activeDraft.subject || '')
            setAudienceLabel(activeDraft.audienceLabel || 'Manual list')
            setRecipientEmails(Array.isArray(activeDraft.recipientEmails) ? activeDraft.recipientEmails : [])
            setHistory([cloned])
            setHistoryIdx(0)
          }
          localStorage.removeItem('elena_active_campaign_draft')
        } catch (err) {
          console.error('Failed to parse Elena campaign draft:', err)
        }
      }
      setDraftHydrated(true)
    }

    checkDraft()
    window.addEventListener('elena-campaign-draft-loaded', checkDraft)
    return () => {
      window.removeEventListener('elena-campaign-draft-loaded', checkDraft)
    }
  }, [])

  useEffect(() => {
    if (!draftHydrated) return
    localStorage.setItem('luxor_email_builder_working_draft', JSON.stringify({ subject, blocks, audienceLabel, recipientEmails }))
  }, [audienceLabel, blocks, draftHydrated, recipientEmails, subject])

  // Brand Asset Picker States & Actions
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [activePickerField, setActivePickerField] = useState<'backgroundImage' | 'imageUrl' | null>(null)

  const handleBrowseImage = (field: 'backgroundImage' | 'imageUrl') => {
    setActivePickerField(field)
    setAssetPickerOpen(true)
  }

  const handleAssetSelect = (url: string) => {
    if (selectedId && activePickerField) {
      setBlocks(prev => prev.map(b => b.id === selectedId ? { ...b, [activePickerField]: url } : b))
    }
    setAssetPickerOpen(false)
    setActivePickerField(null)
  }

  async function loadSavedTemplates() {
    setTemplatesLoading(true)
    try {
      const response = await fetch('/api/marketing/templates', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to load templates.')
      const mapped = (payload.templates || []).map((tpl: SavedMarketingTemplate) => ({
        id: `saved-${tpl.id}`,
        savedId: tpl.id,
        source: 'saved' as const,
        name: tpl.name,
        description: tpl.description || 'Custom saved email layout.',
        category: 'custom' as EmailTemplate['category'],
        previewColor: tpl.preview_color || '#caa24c',
        subject: tpl.subject,
        blocks: tpl.blocks,
        updatedAt: tpl.updated_at,
        audienceLabel: typeof tpl.metadata?.audienceLabel === 'string' ? tpl.metadata.audienceLabel : 'Manual list',
        recipientEmails: Array.isArray(tpl.metadata?.recipientEmails)
          ? tpl.metadata.recipientEmails.filter((email): email is string => typeof email === 'string')
          : [],
      }))
      setSavedTemplates(mapped)
    } catch {
      setSavedTemplates([])
    } finally {
      setTemplatesLoading(false)
    }
  }

  useEffect(() => {
    loadSavedTemplates()
  }, [])


  // ─── History helpers ────────────────────────────────────────────────────────
  function pushHistory(newBlocks: EmailBlock[]) {
    const trimmed = history.slice(0, historyIdx + 1)
    const next = [...trimmed, newBlocks]
    setHistory(next)
    setHistoryIdx(next.length - 1)
  }

  function undo() {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1]
      setHistoryIdx(historyIdx - 1)
      setBlocks(prev)
      setSelectedId(null)
    }
  }

  // ─── Block operations ───────────────────────────────────────────────────────
  const handleAddBlock = useCallback((type: BlockType) => {
    const block = createBlock(type)
    const newBlocks = [...blocks, block]
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    setSelectedId(block.id)
  }, [blocks, history, historyIdx])

  const handleDelete = useCallback((id: string) => {
    const newBlocks = blocks.filter((b) => b.id !== id)
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    if (selectedId === id) setSelectedId(null)
  }, [blocks, selectedId, history, historyIdx])

  const handleReorder = useCallback((newBlocks: EmailBlock[]) => {
    setBlocks(newBlocks)
    pushHistory(newBlocks)
  }, [history, historyIdx])

  const handleBlockChange = useCallback((updated: EmailBlock) => {
    const newBlocks = blocks.map((b) => (b.id === updated.id ? updated : b))
    setBlocks(newBlocks)
    // Don't push history on every keystroke — only on meaningful changes
  }, [blocks])

  const handleLoadTemplate = useCallback((tpl: BuilderTemplate) => {
    const withNewIds = cloneTemplateBlocks(tpl.blocks)
    setBlocks(withNewIds)
    pushHistory(withNewIds)
    setSelectedId(null)
    if (!subject) setSubject(tpl.subject || tpl.name)
    setAudienceLabel(tpl.audienceLabel || 'Manual list')
    setRecipientEmails(tpl.recipientEmails || [])
    if (tpl.savedId) {
      fetch(`/api/marketing/templates/${tpl.savedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-used' }),
      }).catch(() => undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, subject, history, historyIdx])

  async function handleDeleteSavedTemplate(id: string) {
    if (!window.confirm('Delete this saved template?')) return
    await fetch(`/api/marketing/templates/${id}`, { method: 'DELETE' })
    await loadSavedTemplates()
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  const canUndo = historyIdx > 0

  return (
    <div className="flex flex-col h-full gap-0">
    <div className="flex flex-col h-full gap-0 p-3">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3 mb-3 shadow-xs">
        {/* Subject line */}
        <div className="flex-1 relative">
          <input
            className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-xs text-[color:var(--portal-text)] placeholder-[color:var(--portal-muted)] focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors font-medium"
            placeholder="Email subject line..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Template picker trigger */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] hover:border-[#caa24c]/30 hover:bg-[#caa24c]/10 hover:text-[#a8792f] transition-all flex-shrink-0 cursor-pointer"
        >
          <Sparkles size={13} />
          Templates
          <ChevronDown size={11} />
        </button>

        <button
          onClick={() => setShowSaveTemplate(true)}
          disabled={blocks.length === 0}
          className="flex flex-shrink-0 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[color:var(--portal-text)] transition-all hover:border-[#caa24c]/30 hover:bg-[#caa24c]/10 hover:text-[#a8792f] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Save size={13} />
          Save Template
        </button>

        {/* Undo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
          className="p-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)] hover:border-[#caa24c]/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 cursor-pointer"
        >
          <RotateCcw size={15} />
        </button>

        {/* Block count */}
        <div className="text-[10px] text-[color:var(--portal-muted)] font-mono flex-shrink-0 hidden md:block">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''}
        </div>

        {/* Preview + Send */}
        <button
          onClick={() => setShowPreview(true)}
          disabled={blocks.length === 0}
          className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-md shadow-[#caa24c]/20 hover:bg-[#dfbd68] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 flex-shrink-0 cursor-pointer"
        >
          <Eye size={14} />
          Preview & Send
        </button>
      </div>

      {/* ── Three-panel layout ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-3.5 overflow-hidden">
        
        {/* Left: Palette */}
        <div className="w-60 flex-shrink-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] overflow-hidden shadow-xs">
          <BlockPalette onAdd={handleAddBlock} />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] overflow-hidden flex flex-col shadow-xs">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Canvas · 600px email width</p>
            {blocks.length > 0 && (
              <button onClick={() => { setBlocks([]); pushHistory([]); setSelectedId(null) }} className="text-[9px] text-[color:var(--portal-muted)] hover:text-rose-500 uppercase tracking-widest font-bold transition-colors cursor-pointer">
                Clear all
              </button>
            )}
          </div>
          <BlockCanvas
            blocks={blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onChange={handleBlockChange}
          />
        </div>

        {/* Right: Inspector */}
        <div className="w-80 flex-shrink-0 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] overflow-hidden shadow-xs">
          {selectedBlock ? (
            <BlockInspector
              block={selectedBlock}
              onChange={(updated) => {
                handleBlockChange(updated)
              }}
              onBrowseImage={handleBrowseImage}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[color:var(--portal-muted)]">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <p className="text-xs text-[color:var(--portal-muted)] font-medium">Select a block<br />to edit its content</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <TemplatePicker
        isOpen={showTemplates}
        savedTemplates={savedTemplates}
        loadingSaved={templatesLoading}
        onSelect={handleLoadTemplate}
        onDeleteSaved={handleDeleteSavedTemplate}
        onClose={() => setShowTemplates(false)}
      />
      <SaveTemplateModal
        isOpen={showSaveTemplate}
        subject={subject || 'Email from Luxor'}
        blocks={blocks}
        audienceLabel={audienceLabel}
        recipientEmails={recipientEmails}
        onClose={() => setShowSaveTemplate(false)}
        onSaved={loadSavedTemplates}
      />
      <EmailPreview
        isOpen={showPreview}
        blocks={blocks}
        subject={subject || 'Email from Luxor'}
        initialAudienceLabel={audienceLabel}
        initialSelectedEmails={recipientEmails}
        onAudienceLabelChange={setAudienceLabel}
        onSelectedEmailsChange={setRecipientEmails}
        onClose={() => setShowPreview(false)}
      />
      <AnimatePresence>
        {assetPickerOpen && (
          <BrandAssetPicker
            isOpen={assetPickerOpen}
            onClose={() => setAssetPickerOpen(false)}
            onSelect={handleAssetSelect}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
