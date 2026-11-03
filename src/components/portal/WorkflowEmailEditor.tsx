'use client'

import React from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Eye, LayoutTemplate, Monitor, Plus, Redo2, Settings2, Smartphone, Trash2, Undo2 } from 'lucide-react'
import { PortalButton, PortalCloseButton, PortalModal, PortalSelect } from './PortalUI'
import { WorkflowVariableChipsBar } from './WorkflowVariableChipsBar'
import { EmailRichTextEditor, type EmailRichTextEditorHandle } from './EmailRichTextEditor'
import { BlockInspector } from '@/app/(portal)/portal/marketing/EmailBuilder/BlockInspector'
import { BlockCanvas } from '@/app/(portal)/portal/marketing/EmailBuilder/BlockCanvas'
import { EmailStylePanel } from '@/app/(portal)/portal/marketing/EmailBuilder/EmailStylePanel'
import { renderThemedEmailToHtml } from '@/app/(portal)/portal/marketing/EmailBuilder/emailRenderer'
import { EMAIL_TEMPLATES, LUXOR_EMAIL_DOCUMENT_VERSION, type EmailBlock, type EmailTemplate, type LuxorEmailDocument, type BlockType } from '@/app/(portal)/portal/marketing/emailTemplates'
import { normalizeLuxorEmailTheme } from '@/lib/luxorEmailDesignSystem'
import type { CustomWorkflowDefinition, CustomWorkflowEmailStep } from '@/lib/luxorCustomWorkflowDefinition'
import { decodeLuxorEmailTextEntities, normalizeLuxorReplyHtml } from '@/lib/luxorConversationalEmailServer'

const blockLabels: Record<BlockType, string> = { hero: 'Hero', text: 'Text', image_text: 'Image and text', button: 'Button', two_column: 'Two columns', divider: 'Divider', spacer: 'Spacing', footer: 'Footer' }

type SavedTemplate = { id: string; name: string; subject: string; description?: string; blocks: EmailBlock[]; metadata?: { theme?: unknown; preheader?: string } }
type TemplateOption = EmailTemplate & { source: 'saved' | 'starter' }
type EmailDesignSnapshot = Pick<CustomWorkflowEmailStep, 'subject' | 'previewText' | 'templateId' | 'emailStyle' | 'emailDocument'>

function emailDesignSnapshot(step: CustomWorkflowEmailStep): EmailDesignSnapshot {
  return structuredClone({ subject: step.subject, previewText: step.previewText, templateId: step.templateId, emailStyle: step.emailStyle, emailDocument: step.emailDocument })
}

type CopyField = { key: string; label: string; multiline?: boolean; rich?: boolean }
const copyFields: Partial<Record<BlockType, CopyField[]>> = {
  hero: [{ key: 'headline', label: 'Headline' }, { key: 'subheadline', label: 'Supporting copy', multiline: true }, { key: 'ctaLabel', label: 'Button label' }],
  text: [{ key: 'content', label: 'Paragraph copy', rich: true }],
  image_text: [{ key: 'headline', label: 'Headline' }, { key: 'body', label: 'Message copy', multiline: true }, { key: 'ctaLabel', label: 'Button label' }],
  button: [{ key: 'label', label: 'Button label' }],
  two_column: [{ key: 'leftHeadline', label: 'Left column headline' }, { key: 'leftBody', label: 'Left column copy', multiline: true }, { key: 'rightHeadline', label: 'Right column headline' }, { key: 'rightBody', label: 'Right column copy', multiline: true }],
  footer: [{ key: 'companyName', label: 'Business name' }, { key: 'address', label: 'Venue address', multiline: true }, { key: 'phone', label: 'Phone or contact details' }],
}
const copyInputClass = 'min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] px-3 py-2 text-sm text-[color:var(--portal-text)] outline-none focus:border-[#a8792f] focus:ring-2 focus:ring-[#a8792f]/20'

function editableParagraph(value: string) {
  const normalized = value.replace(/&nbsp;|&#0*160;|&#x0*a0;|\u00a0/gi, ' ')
  if (/<\/?[a-z][^>]*>/i.test(normalized)) return normalizeLuxorReplyHtml(normalized, { preserveWhitespace: true })
  return decodeLuxorEmailTextEntities(normalized).replace(/\u00a0/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')
}

function WorkflowBlockCopyFields({ block, onChange }: { block: EmailBlock; onChange: (block: EmailBlock) => void }) {
  const fields = copyFields[block.type] || []
  const [activeField, setActiveField] = React.useState(fields[0]?.key || '')
  const inputRefs = React.useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({})
  const richRef = React.useRef<EmailRichTextEditorHandle>(null)
  const selectionRef = React.useRef<{ field: string; start: number; end: number } | null>(null)
  const values = block as unknown as Record<string, unknown>
  if (!fields.length) return null

  function changeField(field: string, value: string) {
    onChange({ ...block, [field]: value } as EmailBlock)
  }

  function insertVariable(token: string) {
    const field = fields.find((entry) => entry.key === activeField) || fields[0]
    if (field.rich) {
      richRef.current?.insertText(token)
      return
    }
    const current = String(values[field.key] || '')
    const saved = selectionRef.current?.field === field.key ? selectionRef.current : null
    const start = saved?.start ?? current.length
    const end = saved?.end ?? start
    changeField(field.key, current.slice(0, start) + token + current.slice(end))
    const cursor = start + token.length
    selectionRef.current = { field: field.key, start: cursor, end: cursor }
    window.requestAnimationFrame(() => {
      const input = inputRefs.current[field.key]
      input?.focus({ preventScroll: true })
      input?.setSelectionRange(cursor, cursor)
    })
  }

  return <div className="space-y-4">
    <WorkflowVariableChipsBar onInsert={insertVariable} />
    <p className="text-xs text-[color:var(--portal-muted)]">Variables insert into {fields.find((field) => field.key === activeField)?.label.toLowerCase() || 'the selected text field'} at the cursor.</p>
    {fields.map((field) => {
      const id = `workflow-copy-${block.id}-${field.key}`
      const value = String(values[field.key] || '')
      const inputProps = {
        id, value, maxLength: 12000, className: copyInputClass,
        onFocus: () => setActiveField(field.key),
        onSelect: (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          const target = event.currentTarget
          selectionRef.current = { field: field.key, start: target.selectionStart ?? value.length, end: target.selectionEnd ?? value.length }
        },
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => changeField(field.key, event.target.value),
      }
      return <div key={field.key} className="space-y-2">
        <label htmlFor={field.rich ? undefined : id} className="block text-xs font-semibold text-[color:var(--portal-text)]">{field.label}</label>
        {field.rich ? <div onFocusCapture={() => setActiveField(field.key)}><EmailRichTextEditor ref={richRef} value={editableParagraph(value)} onChange={(html) => changeField(field.key, html)} ariaLabel={field.label} placeholder="Write your paragraph…" basicFormatting /></div>
          : field.multiline ? <textarea {...inputProps} ref={(element) => { inputRefs.current[field.key] = element }} rows={4} />
            : <input {...inputProps} ref={(element) => { inputRefs.current[field.key] = element }} />}
      </div>
    })}
  </div>
}

function freshBlock(type: BlockType, address?: string): EmailBlock {
  const id = `block-${crypto.randomUUID().slice(0, 8)}`
  const example = EMAIL_TEMPLATES.flatMap((template) => template.blocks).find((block) => block.type === type)
  if (example) return { ...structuredClone(example), id, ...(type === 'footer' && address ? { address } : {}) } as EmailBlock
  if (type === 'spacer') return { id, type, height: 24 }
  if (type === 'divider') return { id, type, color: '#dbcdb8', thickness: 1, style: 'solid' }
  return { id, type: 'text', content: 'Write your message here.', fontSize: 15, textAlign: 'left', color: '#6e6254' }
}

function sampleDocument(document: LuxorEmailDocument) {
  return JSON.parse(JSON.stringify(document).replace(/\{\{\s*first_name\s*\}\}/g, 'Sarah').replace(/\{\{\s*full_name\s*\}\}/g, 'Sarah Jenkins').replace(/\{\{\s*event_type\s*\}\}/g, 'Wedding Reception').replace(/\{\{\s*guest_count\s*\}\}/g, '150').replace(/\{\{\s*target_date\s*\}\}/g, 'October 24, 2027')) as LuxorEmailDocument
}

export function WorkflowEmailTemplateControls({ step, onChange, venueAddress }: { step: CustomWorkflowEmailStep; onChange: (step: CustomWorkflowEmailStep) => void; venueAddress?: string }) {
  const [templates, setTemplates] = React.useState<TemplateOption[]>(() => EMAIL_TEMPLATES.map((template) => ({ ...template, source: 'starter' })))
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null)
  const [editorTab, setEditorTab] = React.useState<'content' | 'preview'>('content')
  const [inspectorTab, setInspectorTab] = React.useState<'element' | 'theme'>('element')
  const [showInspector, setShowInspector] = React.useState(false)
  const [canvasMode, setCanvasMode] = React.useState<'desktop' | 'mobile'>('desktop')
  const [activeCanvasField, setActiveCanvasField] = React.useState<string | null>(null)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  const inlineSelectionRef = React.useRef<Range | null>(null)
  const inlineOffsetsRef = React.useRef<{ start: number; end: number } | null>(null)
  const inlineElementRef = React.useRef<HTMLElement | null>(null)
  const addElementRef = React.useRef<HTMLDetailsElement>(null)
  const [blockType, setBlockType] = React.useState<BlockType>('text')
  const [retry, setRetry] = React.useState(0)
  const historyRef = React.useRef({ stepId: step.id, entries: [emailDesignSnapshot(step)], cursor: 0, lastContentAt: 0 })
  const [, refreshHistory] = React.useReducer((value: number) => value + 1, 0)
  const designSignature = JSON.stringify(emailDesignSnapshot(step))
  const document = step.emailDocument
  const selectedBlock = document?.blocks.find((block) => block.id === selectedBlockId) || document?.blocks[0]
  const selectedIndex = document?.blocks.findIndex((block) => block.id === selectedBlock?.id) ?? -1
  const canUndo = historyRef.current.stepId === step.id && historyRef.current.cursor > 0
  const canRedo = historyRef.current.stepId === step.id && historyRef.current.cursor < historyRef.current.entries.length - 1

  React.useEffect(() => {
    const current = historyRef.current
    const snapshot = emailDesignSnapshot(step)
    if (current.stepId !== step.id) {
      historyRef.current = { stepId: step.id, entries: [snapshot], cursor: 0, lastContentAt: 0 }
      refreshHistory()
      return
    }
    // Include designs supplied by Elena or the parent editor in the same
    // recovery history; changes already recorded here compare equal.
    if (JSON.stringify(current.entries[current.cursor]) !== JSON.stringify(snapshot)) {
      const entries = current.entries.some((entry) => entry.emailDocument)
        ? [...current.entries.slice(0, current.cursor + 1), snapshot].slice(-50)
        : [snapshot]
      historyRef.current = { stepId: step.id, entries, cursor: entries.length - 1, lastContentAt: 0 }
      refreshHistory()
    }
  // Design data is represented by its stable serialized value above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, designSignature])

  function recordDesign(next: CustomWorkflowEmailStep, coalesceContent = false) {
    let current = historyRef.current
    if (current.stepId !== step.id) current = { stepId: step.id, entries: [emailDesignSnapshot(step)], cursor: 0, lastContentAt: 0 }
    const snapshot = emailDesignSnapshot(next)
    if (JSON.stringify(current.entries[current.cursor]) !== JSON.stringify(snapshot)) {
      const now = Date.now()
      const entries = snapshot.emailDocument && !current.entries.some((entry) => entry.emailDocument) ? [] : current.entries.slice(0, current.cursor + 1)
      if (coalesceContent && current.cursor > 0 && now - current.lastContentAt < 800) entries[entries.length - 1] = snapshot
      else entries.push(snapshot)
      const bounded = entries.slice(-50)
      historyRef.current = { stepId: step.id, entries: bounded, cursor: bounded.length - 1, lastContentAt: coalesceContent ? now : 0 }
      refreshHistory()
    }
    onChange(next)
  }

  function restoreDesign(direction: -1 | 1) {
    const history = historyRef.current
    if (history.stepId !== step.id) return
    const cursor = history.cursor + direction
    if (cursor < 0 || cursor >= history.entries.length) return
    const snapshot = structuredClone(history.entries[cursor])
    historyRef.current = { ...history, cursor, lastContentAt: 0 }
    refreshHistory()
    onChange({ ...step, subject: snapshot.subject, previewText: snapshot.previewText, templateId: snapshot.templateId, emailStyle: snapshot.emailStyle, emailDocument: snapshot.emailDocument })
    setActiveCanvasField(null)
    inlineElementRef.current = null
    inlineOffsetsRef.current = null
  }

  React.useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setError('Saved templates are taking too long to load. Retry to reconnect to your library.')
      setLoading(false)
      controller.abort()
    }, 30_000)
    fetch('/api/marketing/templates', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { templates?: SavedTemplate[]; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Saved templates could not load.')
      const saved = (payload.templates || []).map((template): TemplateOption => ({ id: template.id, name: template.name, subject: template.subject, description: template.description || '', category: 'custom', previewColor: '#a8792f', blocks: template.blocks, preheader: template.metadata?.preheader || '', theme: normalizeLuxorEmailTheme(template.metadata?.theme), source: 'saved' }))
      setTemplates([...saved, ...EMAIL_TEMPLATES.map((template) => ({ ...template, source: 'starter' as const }))])
      setError(null)
    }).catch((requestError: unknown) => {
      if (controller.signal.aborted) return
      setTemplates(EMAIL_TEMPLATES.map((template) => ({ ...template, source: 'starter' })))
      setError(requestError instanceof Error ? requestError.message : 'Saved templates could not load.')
    }).finally(() => { window.clearTimeout(timeout); if (!controller.signal.aborted) setLoading(false) })
    return () => { window.clearTimeout(timeout); controller.abort() }
  }, [retry])

  function updateDocument(patch: Partial<LuxorEmailDocument>) {
    if (!document) return
    const contentOnly = Boolean(patch.blocks && patch.blocks.map((block) => block.id).join('|') === document.blocks.map((block) => block.id).join('|'))
    recordDesign({ ...step, emailDocument: { ...document, ...patch, subject: step.subject, preheader: step.previewText } }, contentOnly)
  }

  function chooseTemplate(id: string) {
    if (step.templateId === id && document) return
    const template = templates.find((entry) => entry.id === id)
    if (!template) return
    const blocks = structuredClone(template.blocks)
    recordDesign({ ...step, emailStyle: 'template', templateId: template.id, subject: template.subject || step.subject, previewText: template.preheader || step.previewText, emailDocument: { schemaVersion: LUXOR_EMAIL_DOCUMENT_VERSION, subject: template.subject || step.subject, preheader: template.preheader || step.previewText, theme: normalizeLuxorEmailTheme(template.theme), blocks } })
    setSelectedBlockId(blocks[0]?.id || null)
  }

  function moveBlock(id: string, direction: -1 | 1) {
    if (!document) return
    const blocks = [...document.blocks]
    const index = blocks.findIndex((block) => block.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= blocks.length) return
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    updateDocument({ blocks })
  }

  function duplicateBlock(id: string) {
    if (!document || document.blocks.length >= 30) return
    const source = document.blocks.find((block) => block.id === id)
    if (!source) return
    const copy = { ...structuredClone(source), id: `block-${crypto.randomUUID().slice(0, 8)}` }
    updateDocument({ blocks: document.blocks.flatMap((block) => block.id === id ? [block, copy] : [block]) })
    setSelectedBlockId(copy.id)
  }

  function removeBlock(id: string) {
    if (!document || document.blocks.length <= 1) return
    const blocks = document.blocks.filter((block) => block.id !== id)
    updateDocument({ blocks })
    setSelectedBlockId(blocks[Math.max(0, selectedIndex - 1)]?.id || null)
    setActiveCanvasField(null)
  }

  function addElement(type: BlockType) {
    if (!document || document.blocks.length >= 30) return
    const block = freshBlock(type, venueAddress)
    updateDocument({ blocks: [...document.blocks, block] })
    setSelectedBlockId(block.id)
    if (addElementRef.current) addElementRef.current.open = false
  }

  function captureCanvasSelection() {
    const selection = window.getSelection()
    const focused = window.document.activeElement
    if (!(focused instanceof HTMLElement) || !focused.isContentEditable || !canvasRef.current?.contains(focused) || !selection?.rangeCount || !focused.contains(selection.anchorNode)) return
    inlineElementRef.current = focused
    const range = selection.getRangeAt(0)
    inlineSelectionRef.current = range.cloneRange()
    const before = range.cloneRange()
    before.selectNodeContents(focused)
    before.setEnd(range.startContainer, range.startOffset)
    const through = range.cloneRange()
    through.selectNodeContents(focused)
    through.setEnd(range.endContainer, range.endOffset)
    inlineOffsetsRef.current = { start: before.toString().length, end: through.toString().length }
  }

  function insertCanvasVariable(token: string) {
    const target = inlineElementRef.current?.isConnected ? inlineElementRef.current : activeCanvasField && selectedBlock
      ? canvasRef.current?.querySelector<HTMLElement>(`[data-email-block-id="${CSS.escape(selectedBlock.id)}"] [data-field="${CSS.escape(activeCanvasField)}"]`)
      : null
    if (!target?.isConnected) return
    const offsets = inlineOffsetsRef.current || { start: target.textContent?.length || 0, end: target.textContent?.length || 0 }
    const editor = target
    // Menu focus and normalization can replace text nodes. Rebuild the range
    // from text offsets instead of keeping a detached DOM Range.
    const range = window.document.createRange()
    const walker = window.document.createTreeWalker(target, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let node: Node | null
    while ((node = walker.nextNode())) nodes.push(node as Text)
    function boundary(offset: number) {
      let remaining = offset
      for (const text of nodes) {
        if (remaining <= text.length) return { node: text as Node, offset: remaining }
        remaining -= text.length
      }
      return { node: editor as Node, offset: editor.childNodes.length }
    }
    const start = boundary(offsets.start)
    const end = boundary(offsets.end)
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    target.focus({ preventScroll: true })
    const selection = window.getSelection()
    range.deleteContents()
    const inserted = window.document.createTextNode(token)
    range.insertNode(inserted)
    range.setStartAfter(inserted)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: token }))
    captureCanvasSelection()
  }

  function selectCanvasBlock(id: string, scroll = false) {
    setSelectedBlockId(id)
    if (id !== selectedBlock?.id) {
      setActiveCanvasField(null)
      inlineElementRef.current = null
      inlineSelectionRef.current = null
      inlineOffsetsRef.current = null
    }
    if (scroll) window.requestAnimationFrame(() => canvasRef.current?.querySelector<HTMLElement>(`[data-email-block-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const sample = document ? sampleDocument({ ...document, subject: step.subject, preheader: step.previewText }) : null
  const previewHtml = sample ? renderThemedEmailToHtml(sample.subject, sample.blocks, sample.theme, sample.preheader) : ''

  return <div className="space-y-3">
    <label className="block text-[10px] font-bold uppercase tracking-wider text-[color:var(--portal-muted)]">Email format</label>
    <PortalSelect value={step.emailStyle || 'personal'} onChange={(value) => onChange({ ...step, emailStyle: value as 'personal' | 'template' })} options={[{ value: 'personal', label: 'Personal email · lightly styled' }, { value: 'template', label: 'HTML template · editable design' }]} />
    {step.emailStyle !== 'template' ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Uses the same quiet styling and sender signature as compose and replies.</p> : <>
      <PortalSelect value={step.templateId || ''} placeholder="Choose a saved or starter template" onChange={chooseTemplate} options={templates.map((template) => ({ value: template.id, label: `${template.source === 'saved' ? 'Saved' : 'Starter'} · ${template.name}` }))} />
      {loading ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Loading saved templates… Starter designs are ready to use.</p> : null}
      {error ? <p role="alert" className="text-xs leading-5 text-rose-600 dark:text-rose-400">{error} <button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1) }} className="underline">Retry</button></p> : null}
      {document ? <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] p-3">
        <p className="text-xs leading-5 text-[color:var(--portal-muted)]">{document.blocks.length} elements · saved with this workflow</p>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)]"><LayoutTemplate size={14} /> Edit design</button>
      </div> : <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Select a template to edit its copy, images, layout, and colors for this workflow.</p>}
    </>}
    <PortalModal isOpen={open && Boolean(document)} onClose={() => setOpen(false)} ariaLabel="Edit workflow email design" maxWidth="max-w-[1400px]" fullScreenOnCompact className="!p-0">
      <div className="flex h-[90dvh] min-h-0 flex-col bg-[color:var(--portal-card)] max-lg:h-[100dvh]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--portal-border)] px-4 py-3">
          <div><h3 className="text-sm font-semibold text-[color:var(--portal-text)]">Workflow email design</h3><p className="mt-1 text-xs text-[color:var(--portal-muted)]">Click the email to edit. Changes apply to this workflow.</p></div>
          <PortalCloseButton onClick={() => setOpen(false)} aria-label="Close email design" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--portal-border)] px-3 py-1.5">
          <div className="flex gap-1" role="tablist" aria-label="Email design views">{(['content', 'preview'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={editorTab === tab} onClick={() => setEditorTab(tab)} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${editorTab === tab ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}>{tab === 'content' ? 'Edit email' : 'Preview'}</button>)}</div>
          <div className="flex items-center" aria-label="Email design history"><button type="button" aria-label="Undo email design change" title="Undo" disabled={!canUndo} onClick={() => restoreDesign(-1)} className="grid size-11 place-items-center rounded-lg text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"><Undo2 size={16} /></button><button type="button" aria-label="Redo email design change" title="Redo" disabled={!canRedo} onClick={() => restoreDesign(1)} className="grid size-11 place-items-center rounded-lg text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"><Redo2 size={16} /></button></div>
          {editorTab === 'content' && <button type="button" aria-expanded={showInspector} onClick={() => setShowInspector((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[color:var(--portal-text)] lg:hidden"><Settings2 size={16} /> Settings</button>}
          <div className="hidden items-center gap-1 sm:flex" aria-label="Email canvas width">
            <button type="button" onClick={() => setCanvasMode('desktop')} aria-pressed={canvasMode === 'desktop'} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs ${canvasMode === 'desktop' ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}><Monitor size={15} /> Desktop</button>
            <button type="button" onClick={() => setCanvasMode('mobile')} aria-pressed={canvasMode === 'mobile'} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs ${canvasMode === 'mobile' ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}><Smartphone size={15} /> Mobile</button>
          </div>
        </div>
        {editorTab === 'preview' ? <iframe title="Workflow HTML email preview" srcDoc={previewHtml} sandbox="" className="min-h-0 w-full flex-1 border-0 bg-white" /> : <>
          <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--portal-border)] px-3 py-2">
            <div className="min-w-[150px] flex-1"><PortalSelect aria-label="Selected email element" value={selectedBlock?.id || ''} onChange={(id) => selectCanvasBlock(id, true)} options={(document?.blocks || []).map((block, index) => ({ value: block.id, label: `${index + 1} of ${document?.blocks.length} · ${blockLabels[block.type]}` }))} /></div>
            {selectedBlock && <div className="flex shrink-0 items-center" aria-label="Selected element actions">
              <button type="button" disabled={selectedIndex <= 0} onClick={() => moveBlock(selectedBlock.id, -1)} aria-label={`Move ${blockLabels[selectedBlock.type]} up`} className="grid size-11 place-items-center rounded-lg text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"><ArrowUp size={16} /></button>
              <button type="button" disabled={selectedIndex >= (document?.blocks.length || 0) - 1} onClick={() => moveBlock(selectedBlock.id, 1)} aria-label={`Move ${blockLabels[selectedBlock.type]} down`} className="grid size-11 place-items-center rounded-lg text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"><ArrowDown size={16} /></button>
              <button type="button" disabled={(document?.blocks.length || 0) >= 30} onClick={() => duplicateBlock(selectedBlock.id)} aria-label={`Duplicate ${blockLabels[selectedBlock.type]}`} className="grid size-11 place-items-center rounded-lg text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] disabled:opacity-30"><Copy size={16} /></button>
              <button type="button" disabled={(document?.blocks.length || 0) <= 1} onClick={() => removeBlock(selectedBlock.id)} aria-label={`Remove ${blockLabels[selectedBlock.type]}`} className="grid size-11 place-items-center rounded-lg text-rose-600 hover:bg-[color:var(--portal-soft)] disabled:opacity-30 dark:text-rose-400"><Trash2 size={16} /></button>
            </div>}
            <details ref={addElementRef} className="relative max-sm:static">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 text-xs font-semibold text-[color:var(--portal-text)]"><Plus size={15} /> Add element</summary>
              <div className="absolute right-0 z-30 mt-2 w-64 space-y-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-lg max-sm:left-3 max-sm:right-3 max-sm:top-full max-sm:w-auto"><PortalSelect aria-label="New email element type" value={blockType} onChange={(value) => setBlockType(value as BlockType)} options={Object.entries(blockLabels).map(([value, label]) => ({ value, label }))} /><button type="button" disabled={(document?.blocks.length || 0) >= 30} onClick={() => addElement(blockType)} className="min-h-11 w-full rounded-lg bg-[#a8792f] px-3 text-xs font-semibold text-white disabled:opacity-40">Add {blockLabels[blockType].toLowerCase()}</button></div>
            </details>
            <details className="relative max-sm:static">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-xs font-semibold text-[color:var(--portal-text)]">Insert variable</summary>
              <div className="absolute right-0 z-30 mt-2 w-[min(340px,calc(100vw-2rem))] space-y-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 shadow-lg max-sm:left-3 max-sm:right-3 max-sm:top-full max-sm:w-auto">{activeCanvasField ? <><p className="text-xs text-[color:var(--portal-muted)]">Insert into {activeCanvasField.toLowerCase()}.</p><WorkflowVariableChipsBar onInsert={insertCanvasVariable} /></> : <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Click the text in the email where you want a client variable, then choose a variable here.</p>}</div>
            </details>
          </div>
          <div className="relative grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
            <div ref={canvasRef} onMouseUpCapture={captureCanvasSelection} onKeyUpCapture={captureCanvasSelection} className="flex min-h-0 min-w-0 bg-[color:var(--portal-soft)]">
              {document && <BlockCanvas blocks={document.blocks} selectedId={selectedBlock?.id || null} onSelect={(id) => selectCanvasBlock(id)} onActivateField={(id, field) => { setSelectedBlockId(id); setActiveCanvasField(field) }} onDelete={removeBlock} onDuplicate={duplicateBlock} onReorder={(blocks) => updateDocument({ blocks })} onChange={(updated) => updateDocument({ blocks: document.blocks.map((block) => block.id === updated.id ? updated : block) })} onAddBlock={addElement} theme={document.theme} previewMode={canvasMode} quietChrome showBlockControls={false} />}
            </div>
            <aside className={`${showInspector ? 'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(360px,100%)] max-lg:shadow-xl' : 'max-lg:hidden'} flex min-h-0 flex-col border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)]`} aria-label="Email element settings">
              <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--portal-border)] px-3 py-2"><div className="flex gap-1">{(['element', 'theme'] as const).map((tab) => <button type="button" key={tab} onClick={() => setInspectorTab(tab)} aria-pressed={inspectorTab === tab} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${inspectorTab === tab ? 'bg-[color:var(--portal-soft)] text-[color:var(--portal-text)]' : 'text-[color:var(--portal-muted)]'}`}>{tab === 'element' ? 'Element' : 'Colors & type'}</button>)}</div><PortalCloseButton aria-label="Close element settings" onClick={() => setShowInspector(false)} className="lg:hidden" /></div>
              <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto">{inspectorTab === 'theme' && document ? <EmailStylePanel theme={document.theme} onChange={(theme) => updateDocument({ theme })} /> : selectedBlock ? <><BlockInspector block={selectedBlock} activeField={activeCanvasField} onChange={(updated) => updateDocument({ blocks: document?.blocks.map((block) => block.id === updated.id ? updated : block) })} /><details className="border-t border-[color:var(--portal-border)] p-4"><summary className="min-h-11 cursor-pointer text-xs font-semibold text-[color:var(--portal-text)]">Detailed copy controls</summary><WorkflowBlockCopyFields key={selectedBlock.id} block={selectedBlock} onChange={(updated) => updateDocument({ blocks: document?.blocks.map((block) => block.id === updated.id ? updated : block) })} /></details></> : null}</div>
            </aside>
          </div>
        </>}
        <div className="flex shrink-0 justify-end border-t border-[color:var(--portal-border)] p-3"><PortalButton variant="primary" onClick={() => setOpen(false)}><Check size={14} /> Done editing</PortalButton></div>
      </div>
    </PortalModal>
  </div>
}

export function WorkflowEmailPreview({ step, emailSettings }: { step: CustomWorkflowEmailStep; emailSettings?: CustomWorkflowDefinition['emailSettings'] }) {
  const [html, setHtml] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [mobile, setMobile] = React.useState(false)
  const serialized = JSON.stringify({ step, emailSettings })
  React.useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetch('/api/marketing/custom-workflows/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized, signal: controller.signal }).then(async (response) => {
        const payload = await response.json() as { html?: string; error?: string }
        if (!response.ok || !payload.html) throw new Error(payload.error || 'Email preview unavailable.')
        setHtml(payload.html)
        setError(null)
      }).catch((requestError: unknown) => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Email preview unavailable.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [serialized])
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[color:var(--portal-muted)]">Sample preview · no message sent</p><button type="button" onClick={() => setMobile((value) => !value)} aria-pressed={mobile} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-xs text-[color:var(--portal-text)]"><Eye size={14} /> {mobile ? 'Show desktop' : 'Show mobile'}</button></div>
    {step.generationMode === 'ai' ? <p className="text-xs leading-5 text-[color:var(--portal-muted)]">This shows the saved example. Elena writes a new version for each eligible client when this step runs.</p> : null}
    {error ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : loading ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Rendering email…</p> : null}
    {html && !error ? <iframe title="Delivered workflow email preview" srcDoc={html} sandbox="" className={`mx-auto h-[600px] max-w-full rounded-lg border border-[color:var(--portal-border)] bg-white ${mobile ? 'w-[375px]' : 'w-full'}`} /> : null}
  </div>
}
