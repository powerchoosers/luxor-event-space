'use client'

import React, { useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import type {
  EmailBlock,
  HeroBlock,
  TextBlock,
  ImageTextBlock,
  ButtonBlock,
  TwoColumnBlock,
  DividerBlock,
  SpacerBlock,
  FooterBlock,
} from '../emailTemplates'

// ─── Brand constants (match emailRenderer.ts and the website) ─────────────────
const GOLD       = '#caa24c'
const GOLD_DIM   = 'rgba(202,162,76,0.6)'
const CREAM      = '#f7efe3'
const MUTED      = 'rgba(215,194,154,0.78)'
const BG_CARD    = '#0a0807'
const BG_DARK    = '#080605'
const BORDER     = 'rgba(202,162,76,0.18)'
const SERIF      = "'Cormorant Garamond', 'Cormorant', Georgia, 'Times New Roman', serif"
const SANS       = "'Manrope', 'Helvetica Neue', Arial, Helvetica, sans-serif"

// ─── Inline-editable text primitive ──────────────────────────────────────────

interface EditableProps {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  className?: string
  multiline?: boolean
  placeholder?: string
  'data-field'?: string
}

function Editable({ value, onChange, style, className, multiline, placeholder, 'data-field': dataField }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)

  const lastValue = useRef(value)
  React.useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      if (document.activeElement !== ref.current) {
        ref.current.innerText = value
        lastValue.current = value
      }
    }
  }, [value])

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.innerText
    lastValue.current = text
    onChange(text)
  }, [onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Prevent Enter from creating <div> elements in single-line mode
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
    }
  }, [multiline])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-field={dataField}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
      className={className}
      style={{
        outline: 'none',
        cursor: 'text',
        minHeight: '1em',
        whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
        wordBreak: 'break-word',
        ...style,
      }}
    />
  )
}

// ─── "Edit here" cursor hint overlay ─────────────────────────────────────────

function EditHint({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        right: 8,
        background: 'rgba(202,162,76,0.18)',
        border: '1px solid rgba(202,162,76,0.35)',
        borderRadius: 4,
        padding: '2px 7px',
        fontSize: 9,
        fontFamily: SANS,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: GOLD,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      Click to edit
    </div>
  )
}

// ─── HERO Block ───────────────────────────────────────────────────────────────

function HeroBlockView({ block, onChange, selected }: { block: HeroBlock; onChange: (b: HeroBlock) => void; selected: boolean }) {
  const u = (patch: Partial<HeroBlock>) => onChange({ ...block, ...patch })
  const bg = block.backgroundImage
    ? `linear-gradient(rgba(5,5,5,${block.overlayOpacity}),rgba(5,5,5,${block.overlayOpacity + 0.1})),url('${block.backgroundImage}') center/cover`
    : 'radial-gradient(circle at 50% 0%,rgba(202,162,76,0.18),transparent 70%),linear-gradient(180deg,#120d0a,#050505)'
  const align = block.textAlign as React.CSSProperties['textAlign']

  return (
    <div style={{ background: bg, padding: '56px 48px 48px', textAlign: align, position: 'relative' }}>
      <EditHint show={selected} />
      {/* Label */}
      <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.38em', textTransform: 'uppercase', color: GOLD, marginBottom: 14 }}>
        LUXOR EVENT SPACE
      </div>
      {/* Headline */}
      <Editable
        value={block.headline}
        onChange={(v) => u({ headline: v })}
        placeholder="Headline"
        style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 600, lineHeight: 1.05, color: CREAM, letterSpacing: '0.02em', marginBottom: 14 }}
      />
      {/* Subheadline */}
      <Editable
        value={block.subheadline}
        onChange={(v) => u({ subheadline: v })}
        placeholder="Sub-headline"
        multiline
        style={{ fontFamily: SANS, fontSize: 15, fontWeight: 400, lineHeight: 1.75, color: MUTED, maxWidth: 460, margin: align === 'center' ? '0 auto' : undefined }}
      />
      {/* CTA button */}
      {block.ctaVisible && (
        <div style={{ marginTop: 28, display: 'flex', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
          <Editable
            value={block.ctaLabel}
            onChange={(v) => u({ ctaLabel: v })}
            style={{
              display: 'inline-block',
              background: GOLD,
              color: '#050505',
              fontFamily: SANS,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              padding: '13px 36px',
              borderRadius: 3,
              border: '1px solid rgba(241,210,122,0.5)',
              boxShadow: '0 18px 36px -20px rgba(202,162,76,0.6)',
              cursor: 'text',
            }}
          />
        </div>
      )}
      {/* Gold shimmer rule below */}
      <div style={{ marginTop: 24, height: 1, background: 'linear-gradient(90deg,transparent,rgba(202,162,76,0.4),transparent)' }} />
    </div>
  )
}

// ─── TEXT Block ───────────────────────────────────────────────────────────────

function TextBlockView({ block, onChange, selected }: { block: TextBlock; onChange: (b: TextBlock) => void; selected: boolean }) {
  const u = (patch: Partial<TextBlock>) => onChange({ ...block, ...patch })
  return (
    <div style={{ padding: '28px 48px', position: 'relative' }}>
      <EditHint show={selected} />
      <Editable
        value={block.content}
        onChange={(v) => u({ content: v })}
        multiline
        placeholder="Type your text here..."
        style={{
          fontFamily: SANS,
          fontSize: block.fontSize,
          fontWeight: 400,
          lineHeight: 1.8,
          color: block.color,
          textAlign: block.textAlign as React.CSSProperties['textAlign'],
        }}
      />
    </div>
  )
}

// ─── IMAGE + TEXT Block ───────────────────────────────────────────────────────

function ImageTextBlockView({ block, onChange, selected }: { block: ImageTextBlock; onChange: (b: ImageTextBlock) => void; selected: boolean }) {
  const u = (patch: Partial<ImageTextBlock>) => onChange({ ...block, ...patch })
  const isRight = block.imagePosition === 'right'

  const imgSlot = (
    <div style={{ width: 180, flexShrink: 0 }}>
      {block.imageUrl
        ? <img src={block.imageUrl} alt={block.imageAlt} style={{ width: 180, borderRadius: 3, border: '1px solid rgba(202,162,76,0.14)', display: 'block' }} />
        : (
          <div style={{ width: 180, height: 140, background: 'linear-gradient(135deg,#120d0a,#1e1409)', border: '1px solid rgba(202,162,76,0.14)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: SERIF, fontSize: 16, color: 'rgba(202,162,76,0.4)', letterSpacing: '0.2em' }}>IMAGE</span>
          </div>
        )
      }
    </div>
  )

  const textSlot = (
    <div style={{ flex: 1, paddingLeft: isRight ? 0 : 28, paddingRight: isRight ? 28 : 0 }}>
      <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.38em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>FEATURED</div>
      <Editable
        value={block.headline}
        onChange={(v) => u({ headline: v })}
        placeholder="Headline"
        style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, lineHeight: 1.1, color: CREAM, marginBottom: 12 }}
      />
      <Editable
        value={block.body}
        onChange={(v) => u({ body: v })}
        multiline
        placeholder="Body text..."
        style={{ fontFamily: SANS, fontSize: 13, fontWeight: 400, lineHeight: 1.8, color: MUTED, marginBottom: 20 }}
      />
      <Editable
        value={block.ctaLabel}
        onChange={(v) => u({ ctaLabel: v })}
        style={{
          display: 'inline-block',
          background: GOLD,
          color: '#050505',
          fontFamily: SANS,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          padding: '10px 24px',
          borderRadius: 3,
          border: '1px solid rgba(241,210,122,0.45)',
          cursor: 'text',
        }}
      />
    </div>
  )

  return (
    <div style={{ padding: '28px 48px', display: 'flex', flexDirection: isRight ? 'row-reverse' : 'row', gap: 0, position: 'relative', alignItems: 'flex-start' }}>
      <EditHint show={selected} />
      {imgSlot}
      {textSlot}
    </div>
  )
}

// ─── BUTTON Block ─────────────────────────────────────────────────────────────

function ButtonBlockView({ block, onChange, selected }: { block: ButtonBlock; onChange: (b: ButtonBlock) => void; selected: boolean }) {
  const u = (patch: Partial<ButtonBlock>) => onChange({ ...block, ...patch })
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' }

  return (
    <div style={{ padding: '14px 48px 24px', display: 'flex', justifyContent: justifyMap[block.align] ?? 'center', position: 'relative' }}>
      <EditHint show={selected} />
      <Editable
        value={block.label}
        onChange={(v) => u({ label: v })}
        style={{
          display: 'inline-block',
          background: block.bgColor,
          color: block.textColor,
          fontFamily: SANS,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          padding: '14px 42px',
          borderRadius: 3,
          border: '1px solid rgba(241,210,122,0.45)',
          boxShadow: '0 18px 36px -20px rgba(202,162,76,0.5)',
          cursor: 'text',
        }}
      />
    </div>
  )
}

// ─── TWO COLUMN Block ─────────────────────────────────────────────────────────

function TwoColumnBlockView({ block, onChange, selected }: { block: TwoColumnBlock; onChange: (b: TwoColumnBlock) => void; selected: boolean }) {
  const u = (patch: Partial<TwoColumnBlock>) => onChange({ ...block, ...patch })
  return (
    <div style={{ padding: '28px 48px', display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 20px', position: 'relative' }}>
      <EditHint show={selected} />
      {/* Left */}
      <div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>01</div>
        <Editable value={block.leftHeadline} onChange={(v) => u({ leftHeadline: v })} style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, lineHeight: 1.15, color: CREAM, marginBottom: 10 }} />
        <Editable value={block.leftBody} onChange={(v) => u({ leftBody: v })} multiline style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.8, color: MUTED }} />
      </div>
      {/* Divider */}
      <div style={{ background: BORDER }} />
      {/* Right */}
      <div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>02</div>
        <Editable value={block.rightHeadline} onChange={(v) => u({ rightHeadline: v })} style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, lineHeight: 1.15, color: CREAM, marginBottom: 10 }} />
        <Editable value={block.rightBody} onChange={(v) => u({ rightBody: v })} multiline style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.8, color: MUTED }} />
      </div>
    </div>
  )
}

// ─── DIVIDER Block ────────────────────────────────────────────────────────────

function DividerBlockView({ block }: { block: DividerBlock }) {
  const isGold = block.color === '#caa24c' || block.color === '#e0c97c'
  if (isGold) {
    return (
      <div style={{ padding: '8px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.35)' }} />
          <div style={{ width: 7, height: 7, background: GOLD, transform: 'rotate(45deg)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.35)' }} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ padding: '8px 48px' }}>
      <div style={{ height: block.thickness, background: block.color, borderStyle: block.style }} />
    </div>
  )
}

// ─── SPACER Block ─────────────────────────────────────────────────────────────

function SpacerBlockView({ block }: { block: SpacerBlock }) {
  return (
    <div style={{ height: block.height, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '50% 48px', height: 1, borderTop: '1px dashed rgba(202,162,76,0.2)' }} />
      <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.35)', background: BG_CARD, padding: '0 12px', position: 'relative', zIndex: 1 }}>
        {block.height}px
      </span>
    </div>
  )
}

// ─── FOOTER Block ─────────────────────────────────────────────────────────────

const SITE_BASE_URL = 'https://luxor-event-space.vercel.app'

function FooterBlockView({ block, onChange, selected }: { block: FooterBlock; onChange: (b: FooterBlock) => void; selected: boolean }) {
  const u = (patch: Partial<FooterBlock>) => onChange({ ...block, ...patch })

  return (
    <div style={{ background: BG_DARK, padding: '40px 48px 32px', borderTop: '1px solid rgba(202,162,76,0.22)', position: 'relative', textAlign: 'center' }}>
      <EditHint show={selected} />
      {/* Palm mark */}
      <div style={{ marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${SITE_BASE_URL}/luxor-portal-mark-gold.png`} alt="" width={48} height={48} style={{ display: 'inline-block', width: 48, height: 48, objectFit: 'contain' }} />
      </div>
      {/* LUXOR wordmark */}
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, letterSpacing: '0.14em', color: GOLD, textTransform: 'uppercase', lineHeight: 1, marginBottom: 5 }}>LUXOR</div>
      {/* Subline */}
      <div style={{ fontFamily: SERIF, fontSize: 7.5, fontWeight: 500, letterSpacing: '0.52em', color: GOLD_DIM, textTransform: 'uppercase', marginBottom: 22 }}>AT LAS PALMAS EVENTS</div>
      {/* Gold divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.2)' }} />
        <div style={{ width: 5, height: 5, background: 'rgba(202,162,76,0.5)', transform: 'rotate(45deg)' }} />
        <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.2)' }} />
      </div>
      {/* Editable address */}
      <Editable
        value={block.address}
        onChange={(v) => u({ address: v })}
        style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: 'rgba(215,194,154,0.52)', lineHeight: 1.9, display: 'block', textAlign: 'center' }}
      />
      <Editable
        value={block.phone}
        onChange={(v) => u({ phone: v })}
        style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: 'rgba(215,194,154,0.40)', lineHeight: 1.9, display: 'block', textAlign: 'center' }}
      />
      <div style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(202,162,76,0.55)', marginTop: 2 }}>
        <span style={{ textDecoration: 'underline' }}>{block.website}</span>
      </div>
      {/* Social */}
      {block.showSocial && (
        <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>
          Instagram <span style={{ opacity: 0.4, margin: '0 12px' }}>◆</span> Facebook <span style={{ opacity: 0.4, margin: '0 12px' }}>◆</span> TikTok
        </div>
      )}
      {/* Tagline */}
      <div style={{ marginTop: 18, fontFamily: SANS, fontSize: 8, fontWeight: 600, letterSpacing: '0.45em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.32)' }}>
        Timeless ◆ Elegant ◆ Celebratory ◆ Luxurious
      </div>
      {/* Unsubscribe */}
      <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 9, color: 'rgba(215,194,154,0.25)', lineHeight: 1.7 }}>
        You received this because you expressed interest in Luxor Event Space.{' '}
        <span style={{ color: 'rgba(202,162,76,0.35)', textDecoration: 'underline' }}>Unsubscribe</span>
      </div>
    </div>
  )
}

// ─── Block view dispatcher ────────────────────────────────────────────────────

function BlockView({
  block,
  onChange,
  selected,
}: {
  block: EmailBlock
  onChange: (b: EmailBlock) => void
  selected: boolean
}) {
  switch (block.type) {
    case 'hero':       return <HeroBlockView       block={block} onChange={onChange as (b: HeroBlock) => void}       selected={selected} />
    case 'text':       return <TextBlockView        block={block} onChange={onChange as (b: TextBlock) => void}        selected={selected} />
    case 'image_text': return <ImageTextBlockView   block={block} onChange={onChange as (b: ImageTextBlock) => void}  selected={selected} />
    case 'button':     return <ButtonBlockView      block={block} onChange={onChange as (b: ButtonBlock) => void}     selected={selected} />
    case 'two_column': return <TwoColumnBlockView   block={block} onChange={onChange as (b: TwoColumnBlock) => void}  selected={selected} />
    case 'divider':    return <DividerBlockView     block={block} />
    case 'spacer':     return <SpacerBlockView      block={block} />
    case 'footer':     return <FooterBlockView      block={block} onChange={onChange as (b: FooterBlock) => void}     selected={selected} />
    default:           return null
  }
}

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

interface SortableBlockProps {
  block: EmailBlock
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (b: EmailBlock) => void
}

function SortableBlock({
  block, isSelected, onSelect, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onChange,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {/* Floating controls bar — only visible on hover/selection */}
      <div
        className="group/block relative"
        style={{
          border: `2px solid ${isSelected ? GOLD : 'transparent'}`,
          borderRadius: 4,
          transition: 'border-color 0.15s',
          boxShadow: isSelected ? `0 0 0 1px rgba(202,162,76,0.12), 0 8px 32px -8px rgba(202,162,76,0.12)` : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(202,162,76,0.3)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'
        }}
        onClick={onSelect}
      >
        {/* Controls toolbar */}
        <div
          className="opacity-0 group-hover/block:opacity-100 transition-opacity"
          style={{
            position: 'absolute',
            top: -28,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: '#0a0807',
            border: '1px solid rgba(202,162,76,0.22)',
            borderRadius: '4px 4px 0 0',
            padding: '3px 6px',
            zIndex: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="touch-none cursor-grab active:cursor-grabbing"
            style={{ color: 'rgba(202,162,76,0.5)', padding: '0 4px', display: 'flex', alignItems: 'center' }}
            title="Drag to reorder"
          >
            <GripVertical size={13} />
          </div>
          <div style={{ width: 1, height: 14, background: 'rgba(202,162,76,0.15)', margin: '0 2px' }} />
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            style={{ color: canMoveUp ? 'rgba(215,194,154,0.6)' : 'rgba(215,194,154,0.2)', padding: '0 3px', cursor: canMoveUp ? 'pointer' : 'not-allowed', background: 'none', border: 'none', display: 'flex' }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            style={{ color: canMoveDown ? 'rgba(215,194,154,0.6)' : 'rgba(215,194,154,0.2)', padding: '0 3px', cursor: canMoveDown ? 'pointer' : 'not-allowed', background: 'none', border: 'none', display: 'flex' }}
          >
            <ChevronDown size={13} />
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(202,162,76,0.15)', margin: '0 2px' }} />
          <button
            onClick={onDelete}
            title="Delete block"
            style={{ color: 'rgba(215,194,154,0.4)', padding: '0 3px', cursor: 'pointer', background: 'none', border: 'none', display: 'flex' }}
            className="hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Actual email block preview */}
        <div
          style={{ background: BG_CARD, overflow: 'hidden', borderRadius: 2 }}
          onClick={(e) => e.stopPropagation()} // let clicks on editables through without triggering block select
        >
          <BlockView block={block} onChange={onChange} selected={isSelected} />
        </div>
      </div>
    </div>
  )
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface BlockCanvasProps {
  blocks: EmailBlock[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (blocks: EmailBlock[]) => void
  onChange: (block: EmailBlock) => void
}

export function BlockCanvas({ blocks, selectedId, onSelect, onDelete, onReorder, onChange }: BlockCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id)
      const newIndex = blocks.findIndex((b) => b.id === over.id)
      onReorder(arrayMove(blocks, oldIndex, newIndex))
    }
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const idx = blocks.findIndex((b) => b.id === id)
    if (direction === 'up' && idx > 0)                    onReorder(arrayMove(blocks, idx, idx - 1))
    else if (direction === 'down' && idx < blocks.length - 1) onReorder(arrayMove(blocks, idx, idx + 1))
  }

  if (blocks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 px-8">
        <div style={{ width: 64, height: 64, borderRadius: 12, border: '2px dashed rgba(202,162,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'rgba(202,162,76,0.3)' }}>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div className="text-center">
          <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: 'rgba(215,194,154,0.4)', marginBottom: 4 }}>Canvas is empty</p>
          <p style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(215,194,154,0.25)' }}>Add blocks from the palette, or pick a template above.</p>
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {/* Email at 600px, centred, scrollable */}
        <div className="flex-1 overflow-y-auto portal-scrollbar" style={{ padding: '32px 24px' }}>
          {/* Email chrome header */}
          <div style={{ maxWidth: 600, margin: '0 auto', marginBottom: 4 }}>
            <div style={{ background: '#0a0807', border: '1px solid rgba(202,162,76,0.22)', borderBottom: 'none', borderRadius: '4px 4px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.25)' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.15)' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.1)' }} />
              <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.1)', margin: '0 8px' }} />
              <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.35)' }}>Email Preview — 600px</span>
            </div>
            {/* Gold shimmer top bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24)' }} />
            {/* Logo header band */}
            <div style={{ background: '#080605', padding: '18px 48px', borderLeft: '1px solid rgba(202,162,76,0.22)', borderRight: '1px solid rgba(202,162,76,0.22)', borderBottom: '1px solid rgba(202,162,76,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${SITE_BASE_URL}/luxor-portal-mark-gold.png`} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }} />
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', lineHeight: 1 }}>LUXOR</div>
                <div style={{ fontFamily: SERIF, fontSize: 7.2, fontWeight: 500, letterSpacing: '0.4em', color: GOLD_DIM, textTransform: 'uppercase', marginTop: 4 }}>AT LAS PALMAS EVENTS</div>
              </div>
            </div>
          </div>

          {/* Blocks */}
          <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {blocks.map((block, idx) => (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={block.id === selectedId}
                onSelect={() => onSelect(block.id)}
                onDelete={() => onDelete(block.id)}
                onMoveUp={() => moveBlock(block.id, 'up')}
                onMoveDown={() => moveBlock(block.id, 'down')}
                canMoveUp={idx > 0}
                canMoveDown={idx < blocks.length - 1}
                onChange={onChange}
              />
            ))}
          </div>

          {/* Email chrome footer bar */}
          <div style={{ maxWidth: 600, margin: '0 auto', marginTop: 4 }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24)' }} />
            <div style={{ background: '#0a0807', border: '1px solid rgba(202,162,76,0.22)', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '8px 16px', textAlign: 'center' }}>
              <span style={{ fontFamily: SANS, fontSize: 8, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.25)' }}>End of email</span>
            </div>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}
