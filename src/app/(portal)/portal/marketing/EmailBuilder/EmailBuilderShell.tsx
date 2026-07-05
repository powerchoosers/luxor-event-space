'use client'

import React, { useState, useCallback } from 'react'
import { nanoid } from './nanoid'
import type { EmailBlock, BlockType, EmailTemplate } from '../emailTemplates'
import { EMAIL_TEMPLATES } from '../emailTemplates'
import { BlockPalette } from './BlockPalette'
import { BlockCanvas } from './BlockCanvas'
import { BlockInspector } from './BlockInspector'
import { EmailPreview } from './EmailPreview'
import { Eye, Sparkles, RotateCcw, ChevronDown } from 'lucide-react'

// ─── Default block factories ──────────────────────────────────────────────────

function createBlock(type: BlockType): EmailBlock {
  const id = nanoid()
  switch (type) {
    case 'hero':
      return { id, type, headline: 'Your Headline Here', subheadline: 'A compelling sub-headline that draws your reader in.', backgroundImage: '', overlayOpacity: 0.55, textAlign: 'center', ctaLabel: 'Learn More', ctaUrl: 'https://luxoratlaspalmas.com', ctaVisible: true }
    case 'text':
      return { id, type, content: 'Write your message here. You can edit this text in the inspector panel on the right.', fontSize: 15, textAlign: 'left', color: '#444444' }
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
      return { id, type, companyName: 'Luxor Event Space', address: 'Las Palmas, Gran Canaria, Spain', phone: '+34 XXX XXX XXX', website: 'luxoratlaspalmas.com', unsubscribeUrl: '#unsubscribe', showSocial: true, instagramUrl: 'https://instagram.com/luxoratlaspalmas', facebookUrl: 'https://facebook.com/luxoratlaspalmas' }
    default:
      return { id, type: 'spacer', height: 24 } as EmailBlock
  }
}

// ─── Template Picker ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  promo: 'Promo',
  event: 'Event',
  nurture: 'Nurture',
  transactional: 'Transactional',
  seasonal: 'Seasonal',
}

function TemplatePicker({ onSelect, onClose }: { onSelect: (tpl: EmailTemplate) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-zinc-800 bg-[#0a0a0a] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-6 py-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Template Library</p>
            <h3 className="text-sm font-bold text-white/90 mt-0.5">Choose a Starting Template</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all text-xs font-bold uppercase tracking-widest">
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6 max-h-[70vh] overflow-y-auto portal-scrollbar">
          {EMAIL_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => { onSelect(tpl); onClose() }}
              className="text-left rounded-xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden hover:border-zinc-600 hover:bg-zinc-800/30 transition-all hover:scale-[1.02] group"
            >
              {/* Color band */}
              <div className="h-2 w-full" style={{ background: tpl.previewColor }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-xs font-bold text-white/90 group-hover:text-white transition-colors">{tpl.name}</h4>
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
    </div>
  )
}

// ─── Main Shell ───────────────────────────────────────────────────────────────

export function EmailBuilderShell() {
  const [blocks, setBlocks] = useState<EmailBlock[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [history, setHistory] = useState<EmailBlock[][]>([[]])
  const [historyIdx, setHistoryIdx] = useState(0)


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

  const handleLoadTemplate = useCallback((tpl: EmailTemplate) => {
    const withNewIds = tpl.blocks.map((b) => ({ ...b, id: nanoid() }))
    setBlocks(withNewIds)
    pushHistory(withNewIds)
    setSelectedId(null)
    if (!subject) setSubject(tpl.name)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, subject, history, historyIdx])

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  const canUndo = historyIdx > 0

  return (
    <div className="flex flex-col h-full gap-0">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3 mb-4">
        {/* Subject line */}
        <div className="flex-1 relative">
          <input
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors font-medium"
            placeholder="Email subject line..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Template picker trigger */}
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:border-zinc-600 transition-all flex-shrink-0"
        >
          <Sparkles size={13} />
          Templates
          <ChevronDown size={11} />
        </button>

        {/* Undo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
          className="p-2.5 rounded-lg border border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
        >
          <RotateCcw size={15} />
        </button>

        {/* Block count */}
        <div className="text-[10px] text-zinc-600 font-mono flex-shrink-0 hidden md:block">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''}
        </div>

        {/* Preview + Send */}
        <button
          onClick={() => setShowPreview(true)}
          disabled={blocks.length === 0}
          className="flex items-center gap-2 rounded-xl bg-[#caa24c] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.15em] text-black shadow-lg shadow-[#caa24c]/20 hover:bg-[#d4b060] hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 flex-shrink-0"
        >
          <Eye size={14} />
          Preview & Send
        </button>
      </div>

      {/* ── Three-panel layout ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-4">
        
        {/* Left: Palette */}
        <div className="w-56 flex-shrink-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
          <BlockPalette onAdd={handleAddBlock} />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 min-w-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/10 overflow-hidden flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-zinc-800/40 bg-zinc-900/30">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">Canvas · 600px email width</p>
            {blocks.length > 0 && (
              <button onClick={() => { setBlocks([]); pushHistory([]); setSelectedId(null) }} className="text-[9px] text-zinc-700 hover:text-rose-400 uppercase tracking-widest font-bold transition-colors">
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
          />
        </div>

        {/* Right: Inspector */}
        <div className="w-72 flex-shrink-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
          {selectedBlock ? (
            <BlockInspector
              block={selectedBlock}
              onChange={(updated) => {
                handleBlockChange(updated)
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-xl border border-zinc-800 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <p className="text-xs text-zinc-600 font-medium">Select a block<br />to edit its content</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTemplates && (
        <TemplatePicker
          onSelect={handleLoadTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
      {showPreview && (
        <EmailPreview
          blocks={blocks}
          subject={subject || 'Email from Luxor'}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
