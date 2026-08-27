'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { nanoid } from './nanoid'
import type { EmailBlock, BlockType, EmailTemplate, LuxorEmailTheme, LuxorEmailThemeMode } from '../emailTemplates'
import { EMAIL_TEMPLATES, LUXOR_EMAIL_DOCUMENT_VERSION } from '../emailTemplates'
import { BlockPalette } from './BlockPalette'
import { BlockCanvas } from './BlockCanvas'
import { BlockInspector } from './BlockInspector'
import { EmailStylePanel } from './EmailStylePanel'
import { EmailPreview } from './EmailPreview'
import { BadgeCheck, CheckCircle2, Eye, Monitor, Moon, Redo2, RotateCcw, Save, Send, Smartphone, Sun, Trash2, Loader2, X } from 'lucide-react'
import { PortalModal } from '@/components/portal/PortalUI'
import { BrandAssetPicker } from '@/components/portal/BrandAssetPicker'
import { AnimatePresence, motion } from 'framer-motion'
import { decodeHtmlEntities } from '@/lib/luxorTextUtils'
import { cloneLuxorEmailTheme, normalizeLuxorEmailTheme } from '@/lib/luxorEmailDesignSystem'

// ─── Default block factories ──────────────────────────────────────────────────

function createBlock(type: BlockType): EmailBlock {
  const id = nanoid()
  switch (type) {
    case 'hero':
      return { id, type, headline: 'An Unforgettable Event at Luxor', subheadline: 'Add a short, inviting message that gives readers a reason to keep exploring.', backgroundImage: '/images/dining-hall/main-hall-wedding-wide.png', overlayOpacity: 0.58, textAlign: 'center', ctaLabel: 'Explore Luxor', ctaUrl: 'https://www.luxoratlaspalmas.com/spaces', ctaVisible: true }
    case 'text':
      return { id, type, content: 'Write your message here. You can edit this text directly on the canvas.', fontSize: 15, textAlign: 'left', color: 'rgba(215,194,154,0.78)' }
    case 'image_text':
      return { id, type, imageUrl: '/images/luxor-lounge/luxor-lounge-wedding.png', imageAlt: 'Luxor Event Space', imagePosition: 'left', headline: 'Designed for unforgettable moments', body: 'Supporting copy that describes this section. Keep it concise, useful, and compelling.', ctaLabel: 'Explore Our Spaces', ctaUrl: 'https://www.luxoratlaspalmas.com/spaces' }
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
  campaignName,
  subject,
  preheader,
  theme,
  blocks,
  audienceLabel,
  recipientEmails,
  onClose,
  onSaved,
}: {
  isOpen: boolean
  campaignName: string
  subject: string
  preheader: string
  theme: LuxorEmailTheme
  blocks: EmailBlock[]
  audienceLabel: string
  recipientEmails: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(campaignName || subject || '')
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
          metadata: {
            audienceLabel,
            recipientEmails,
            schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION,
            preheader,
            theme,
          },
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

export function EmailBuilderShell({ initialTemplate = null, onClose }: { initialTemplate?: EmailTemplate | null; onClose?: () => void }) {
  const [initialBuilderState] = useState(() => {
    const initialBlocks = initialTemplate ? cloneTemplateBlocks(initialTemplate.blocks) : []
    return {
      blocks: initialBlocks,
      campaignName: initialTemplate?.name || '',
      subject: initialTemplate?.subject || initialTemplate?.name || '',
      preheader: initialTemplate?.preheader || '',
      theme: normalizeLuxorEmailTheme(initialTemplate?.theme),
      history: [initialBlocks],
    }
  })
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBuilderState.blocks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeField, setActiveField] = useState<string | null>(null)
  const [campaignName, setCampaignName] = useState(initialBuilderState.campaignName)
  const [subject, setSubject] = useState(initialBuilderState.subject)
  const [preheader, setPreheader] = useState(initialBuilderState.preheader)
  const [theme, setTheme] = useState<LuxorEmailTheme>(initialBuilderState.theme)
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [inspectorTab, setInspectorTab] = useState<'content' | 'design'>('content')
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
            setCampaignName(activeDraft.name || activeDraft.campaignName || activeDraft.subject || '')
            setSubject(activeDraft.subject || '')
            setPreheader(activeDraft.preheader || '')
            setTheme(normalizeLuxorEmailTheme(activeDraft.theme))
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
    localStorage.setItem('luxor_email_builder_working_draft', JSON.stringify({
      schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION,
      campaignName,
      subject,
      preheader,
      theme,
      blocks,
      audienceLabel,
      recipientEmails,
    }))
  }, [audienceLabel, blocks, campaignName, draftHydrated, preheader, recipientEmails, subject, theme])

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
        schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION,
        preheader: typeof tpl.metadata?.preheader === 'string' ? tpl.metadata.preheader : '',
        theme: normalizeLuxorEmailTheme(tpl.metadata?.theme),
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
    const timer = window.setTimeout(() => {
      void loadSavedTemplates()
    }, 0)
    return () => window.clearTimeout(timer)
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
      setActiveField(null)
    }
  }

  function redo() {
    if (historyIdx < history.length - 1) {
      const next = history[historyIdx + 1]
      setHistoryIdx(historyIdx + 1)
      setBlocks(next)
      setSelectedId(null)
      setActiveField(null)
    }
  }

  // ─── Block operations ───────────────────────────────────────────────────────
  const handleAddBlock = useCallback((type: BlockType) => {
    const block = createBlock(type)
    const newBlocks = [...blocks, block]
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    setSelectedId(block.id)
    setActiveField(null)
  }, [blocks, history, historyIdx])

  const handleAddSequence = useCallback((types: BlockType[]) => {
    const additions = types.map(createBlock)
    const newBlocks = [...blocks, ...additions]
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    setSelectedId(additions[0]?.id || null)
    setActiveField(null)
  }, [blocks, history, historyIdx])

  const handleDelete = useCallback((id: string) => {
    const newBlocks = blocks.filter((b) => b.id !== id)
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    if (selectedId === id) {
      setSelectedId(null)
      setActiveField(null)
    }
  }, [blocks, selectedId, history, historyIdx])

  const handleDuplicate = useCallback((id: string) => {
    const index = blocks.findIndex((block) => block.id === id)
    if (index < 0) return
    const duplicate = { ...blocks[index], id: nanoid() } as EmailBlock
    const newBlocks = [...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)]
    setBlocks(newBlocks)
    pushHistory(newBlocks)
    setSelectedId(duplicate.id)
    setActiveField(null)
  }, [blocks, history, historyIdx])

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
    setActiveField(null)
    setCampaignName(tpl.name)
    setSubject(tpl.subject || tpl.name)
    setPreheader(tpl.preheader || '')
    setTheme(normalizeLuxorEmailTheme(tpl.theme))
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
  const readinessIssues = [
    !subject.trim() ? 'Add a subject line' : null,
    !preheader.trim() ? 'Add preview text' : null,
    !blocks.length ? 'Add at least one content block' : null,
    blocks.some((block) => block.type === 'image_text' && !block.imageAlt.trim()) ? 'Add alt text to every image' : null,
    blocks.some((block) => block.type === 'button' && !/^https?:\/\//i.test(block.url)) ? 'Check button links' : null,
  ].filter((issue): issue is string => Boolean(issue))

  const canUndo = historyIdx > 0
  const canRedo = historyIdx < history.length - 1
  const displayCampaignName = campaignName?.trim() || EMAIL_TEMPLATES.find((template) => template.subject === subject)?.name || subject

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--portal-bg)]">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(event) => setCampaignName(event.currentTarget.textContent?.trim() || '')}
              className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-[color:var(--portal-text)] outline-none"
              aria-label="Email name"
              role="textbox"
            >
              {displayCampaignName || 'Untitled email'}
            </div>
            <span className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Draft</span>
            <span className="hidden items-center gap-1 text-[9px] text-[color:var(--portal-muted)] sm:flex"><CheckCircle2 size={12} className="text-[#a8792f]" /> Autosaved</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={!canUndo} title="Undo" className="rounded-md p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-25"><RotateCcw size={15} /></button>
          <button type="button" onClick={redo} disabled={!canRedo} title="Redo" className="rounded-md p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] disabled:opacity-25"><Redo2 size={15} /></button>
        </div>
        <button type="button" onClick={() => setShowTemplates(true)} className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[9px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]">Templates</button>
        <button type="button" onClick={() => setShowSaveTemplate(true)} disabled={!blocks.length} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[9px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-40"><Save size={13} /> Save</button>
        <button type="button" onClick={() => setShowPreview(true)} disabled={!blocks.length} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[9px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-40"><Eye size={13} /> Preview</button>
        <button type="button" onClick={() => setShowPreview(true)} disabled={!blocks.length} className="flex items-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 py-2 text-[9px] font-bold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-40"><Send size={13} /> Send test</button>
        <button type="button" onClick={() => setShowPreview(true)} disabled={!blocks.length} title="Review the email, audience, and delivery details before sending" aria-label="Review email before sending" className="flex items-center gap-1.5 rounded-lg bg-[#b88732] px-4 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#a8792f] disabled:opacity-40"><BadgeCheck size={13} /> Review &amp; prepare</button>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close builder" title="Close builder" className="grid size-9 place-items-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] transition hover:border-[#b88732]/50 hover:bg-[#b88732]/10 hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88732]/40">
            <X size={16} />
          </button>
        ) : null}
      </div>

      <div className="grid shrink-0 gap-px border-b border-[color:var(--portal-border)] bg-[color:var(--portal-border)] md:grid-cols-2">
        <label className="flex items-center gap-2 bg-[color:var(--portal-card)] px-4 py-2.5">
          <span className="text-[9px] font-bold text-[color:var(--portal-muted)]">Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Write a subject line" className="min-w-0 flex-1 bg-transparent text-[11px] text-[color:var(--portal-text)] outline-none" />
        </label>
        <label className="flex items-center gap-2 bg-[color:var(--portal-card)] px-4 py-2.5">
          <span className="text-[9px] font-bold text-[color:var(--portal-muted)]">Preview text</span>
          <input value={preheader} onChange={(event) => setPreheader(event.target.value)} placeholder="Add the inbox preview sentence" className="min-w-0 flex-1 bg-transparent text-[11px] text-[color:var(--portal-text)] outline-none" />
        </label>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[238px_minmax(0,1fr)_294px]">
        <motion.aside initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="hidden min-h-0 border-r border-[color:var(--portal-border)] xl:block">
          <BlockPalette onAdd={handleAddBlock} onAddSequence={handleAddSequence} templates={EMAIL_TEMPLATES} onSelectTemplate={(template) => handleLoadTemplate({ ...template, source: 'built-in' })} />
        </motion.aside>

        <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#2c2b2a]">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <BlockCanvas
              blocks={blocks}
              selectedId={selectedId}
              onSelect={(id) => { setSelectedId(id); setActiveField(null); setInspectorTab('content') }}
              onActivateField={(id, field) => { setSelectedId(id); setActiveField(field); setInspectorTab('design') }}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onReorder={handleReorder}
              onChange={handleBlockChange}
              onAddBlock={handleAddBlock}
              theme={theme}
              previewMode={previewMode}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-black/15 bg-[color:var(--portal-card)] px-3 py-2">
            <div className="flex items-center rounded-lg border border-[color:var(--portal-border)] p-0.5">
              <button type="button" onClick={() => setPreviewMode('desktop')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[9px] font-bold ${previewMode === 'desktop' ? 'bg-[color:var(--portal-soft)] text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}><Monitor size={13} /> Desktop</button>
              <button type="button" onClick={() => setPreviewMode('mobile')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[9px] font-bold ${previewMode === 'mobile' ? 'bg-[color:var(--portal-soft)] text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}><Smartphone size={13} /> Mobile</button>
            </div>
            <div className="flex items-center rounded-lg border border-[color:var(--portal-border)] p-0.5">
              {(['light', 'dark', 'brand'] as LuxorEmailThemeMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setTheme(cloneLuxorEmailTheme(mode))} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[9px] font-bold capitalize ${theme.mode === mode ? 'bg-[color:var(--portal-soft)] text-[#a8792f]' : 'text-[color:var(--portal-muted)]'}`}>
                  {mode === 'light' ? <Sun size={12} /> : mode === 'dark' ? <Moon size={12} /> : null}{mode}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowPreview(true)} title={readinessIssues.join(' · ')} className={`flex items-center gap-1.5 text-[9px] font-bold ${readinessIssues.length ? 'text-amber-700' : 'text-emerald-700'}`}><CheckCircle2 size={14} /> {readinessIssues.length ? `${readinessIssues.length} issue${readinessIssues.length === 1 ? '' : 's'}` : 'Ready · 5 checks passed'}</button>
          </div>
        </motion.main>

        <motion.aside initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="hidden min-h-0 overflow-hidden border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] xl:flex xl:flex-col">
          <div className="grid shrink-0 grid-cols-2 border-b border-[color:var(--portal-border)] px-2 pt-2">
            {(['content', 'design'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setInspectorTab(tab)} className={`border-b-2 px-3 py-3 text-[10px] font-bold capitalize ${inspectorTab === tab ? 'border-[#b88732] text-[#a8792f]' : 'border-transparent text-[color:var(--portal-muted)]'}`}>{tab}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {inspectorTab === 'design' ? <EmailStylePanel theme={theme} onChange={setTheme} activeField={activeField} /> : selectedBlock ? (
              <BlockInspector block={selectedBlock} onChange={handleBlockChange} onBrowseImage={handleBrowseImage} activeField={activeField} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-7 text-center">
                <Eye size={20} className="text-[color:var(--portal-muted)]" />
                <p className="text-[11px] font-semibold text-[color:var(--portal-text)]">Select a block to edit</p>
                <p className="text-[9px] leading-4 text-[color:var(--portal-muted)]">Content controls appear here. Global colors and typography live under Design.</p>
              </div>
            )}
          </div>
        </motion.aside>
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
        campaignName={campaignName}
        subject={subject || 'Email from Luxor'}
        preheader={preheader}
        theme={theme}
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
        preheader={preheader}
        theme={theme}
        initialAudienceLabel={audienceLabel}
        initialSelectedEmails={recipientEmails}
        onAudienceLabelChange={setAudienceLabel}
        onSelectedEmailsChange={setRecipientEmails}
        onBlocksChange={setBlocks}
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
