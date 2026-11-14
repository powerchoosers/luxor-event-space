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
import { Copy, GripVertical, Trash2, ChevronUp, ChevronDown, Plus } from '@/lib/icons/phosphor-compat'
import { decodeLuxorEmailTextEntities, normalizeLuxorReplyHtml } from '@/lib/luxorConversationalEmailServer'
import { getLuxorEmailHeroOverlay, getLuxorEmailReadableText, LUXOR_EMAIL_HERO_COLORS } from './emailRenderer'
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
  BlockType,
  LuxorEmailTheme,
} from '../emailTemplates'

// ─── Brand constants (match emailRenderer.ts and the website) ─────────────────
const GOLD       = 'var(--email-accent)'
const GOLD_DIM   = 'var(--email-accent-muted)'
const CREAM      = 'var(--email-text)'
const MUTED      = 'var(--email-muted)'
const BG_CARD    = 'var(--email-surface)'
const BG_DARK    = 'var(--email-surface-alt)'
const BORDER     = 'var(--email-border)'
const SERIF      = 'var(--email-heading-font)'
const SANS       = 'var(--email-body-font)'
const CanvasThemeContext = React.createContext<LuxorEmailTheme | null>(null)

function canvasColor(value: string, theme: LuxorEmailTheme | null) {
  if (!theme) return value
  if (['#f7efe3'].includes(value)) return theme.text
  if (value === '#d7c29a' || /^rgba\(215,\s*194,\s*154,/i.test(value)) return theme.muted
  if (['#caa24c', '#f1d27a'].includes(value)) return theme.accent
  if (value === '#050505') return theme.canvas
  if (value === '#0a0807') return theme.surface
  if (['#080605', '#120d0a', '#0b0a08'].includes(value)) return theme.surfaceAlt
  return value
}

// ─── Inline-editable text primitive ──────────────────────────────────────────

interface EditableProps {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  className?: string
  multiline?: boolean
  placeholder?: string
  'data-field'?: string
  rich?: boolean
}

function Editable({ value, onChange, style, className, multiline, placeholder, rich = false, 'data-field': dataField }: EditableProps) {
  const ref = useRef<HTMLDivElement>(null)

  const lastValue = useRef(value)
  React.useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      if (rich) {
        const normalized = value.replace(/&nbsp;|&#0*160;|&#x0*a0;|\u00a0/gi, ' ')
        const html = /<\/?[a-z][^>]*>/i.test(normalized) ? normalizeLuxorReplyHtml(normalized, { preserveWhitespace: true }) : decodeLuxorEmailTextEntities(normalized).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')
        if (ref.current.innerHTML !== html) ref.current.innerHTML = html
      } else if (ref.current.innerText !== value) {
        ref.current.innerText = value
        lastValue.current = value
      }
    }
  }, [value, rich])

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const text = rich ? e.currentTarget.innerHTML : e.currentTarget.innerText
    lastValue.current = text
    onChange(text)
  }, [onChange, rich])

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
      role="textbox"
      aria-label={dataField || placeholder || 'Email text'}
      aria-multiline={Boolean(multiline)}
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
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
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
  const theme = React.useContext(CanvasThemeContext)
  const u = (patch: Partial<HeroBlock>) => onChange({ ...block, ...patch })
  const overlay = getLuxorEmailHeroOverlay(block.overlayOpacity)
  const bg = block.backgroundImage
    ? `linear-gradient(rgba(5,5,5,${overlay}),rgba(5,5,5,${Math.min(1, overlay + 0.1)})),url('${block.backgroundImage}') center/cover`
    : 'linear-gradient(180deg,#120d0a,#050505)'
  const align = block.textAlign as React.CSSProperties['textAlign']

  return (
    <div className="luxor-email-block-content luxor-email-hero" style={{ background: bg, padding: '72px 48px 64px', textAlign: align, position: 'relative' }}>
      <EditHint show={selected} />
      {/* Label */}
      <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.38em', textTransform: 'uppercase', color: LUXOR_EMAIL_HERO_COLORS.text, marginBottom: 16 }}>
        LUXOR EVENT SPACE
      </div>
      {/* Headline */}
      <Editable
        value={block.headline}
        onChange={(v) => u({ headline: v })}
        placeholder="Headline"
        data-field="Hero headline"
        className="luxor-email-hero-title"
        style={{ fontFamily: SERIF, fontSize: 46, fontWeight: 600, lineHeight: 1.05, color: LUXOR_EMAIL_HERO_COLORS.text, letterSpacing: '0.02em', marginBottom: 16 }}
      />
      {/* Subheadline */}
      <Editable
        value={block.subheadline}
        onChange={(v) => u({ subheadline: v })}
        placeholder="Sub-headline"
        data-field="Hero supporting text"
        multiline
        style={{ fontFamily: SANS, fontSize: 15, fontWeight: 400, lineHeight: 1.75, color: LUXOR_EMAIL_HERO_COLORS.muted, maxWidth: 480, margin: align === 'center' ? '0 auto' : undefined }}
      />
      {/* CTA button */}
      {block.ctaVisible && (
        <div style={{ marginTop: 22, display: 'flex', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
          <Editable
            value={block.ctaLabel}
            onChange={(v) => u({ ctaLabel: v })}
            data-field="Hero CTA label"
            style={{
              display: 'inline-block',
              background: GOLD,
              color: theme ? getLuxorEmailReadableText(theme.accent, theme.accentText) : '#050505',
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
      <div style={{ marginTop: 18, height: 1, background: 'linear-gradient(90deg,transparent,rgba(202,162,76,0.4),transparent)' }} />
    </div>
  )
}

// ─── TEXT Block ───────────────────────────────────────────────────────────────

function TextBlockView({ block, onChange, selected }: { block: TextBlock; onChange: (b: TextBlock) => void; selected: boolean }) {
  const theme = React.useContext(CanvasThemeContext)
  const u = (patch: Partial<TextBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="luxor-email-block-content" style={{ padding: '36px 48px', position: 'relative' }}>
      <EditHint show={selected} />
      <Editable
        value={block.content}
        onChange={(v) => u({ content: v })}
        multiline
        placeholder="Type your text here..."
        data-field="Paragraph text"
        rich
        style={{
          fontFamily: SANS,
          fontSize: block.fontSize,
          fontWeight: 400,
          lineHeight: 1.8,
          color: canvasColor(block.color, theme),
          textAlign: block.textAlign as React.CSSProperties['textAlign'],
        }}
      />
    </div>
  )
}

// ─── IMAGE + TEXT Block ───────────────────────────────────────────────────────

function ImageTextBlockView({ block, onChange, selected }: { block: ImageTextBlock; onChange: (b: ImageTextBlock) => void; selected: boolean }) {
  const theme = React.useContext(CanvasThemeContext)
  const u = (patch: Partial<ImageTextBlock>) => onChange({ ...block, ...patch })
  const isRight = block.imagePosition === 'right'

  const imgSlot = (
    <div className="luxor-email-image-slot" style={{ width: 220, flexShrink: 0 }}>
      {block.imageUrl
        ? <img src={block.imageUrl} alt={block.imageAlt} style={{ width: 220, maxWidth: '100%', borderRadius: 3, border: '1px solid rgba(202,162,76,0.14)', display: 'block' }} />
        : (
          <div style={{ width: 220, maxWidth: '100%', height: 160, background: 'linear-gradient(135deg,#120d0a,#1e1409)', border: '1px solid rgba(202,162,76,0.14)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: SERIF, fontSize: 16, color: 'rgba(202,162,76,0.4)', letterSpacing: '0.2em' }}>IMAGE</span>
          </div>
        )
      }
    </div>
  )

  const textSlot = (
    <div className="luxor-email-image-copy" style={{ flex: 1, minWidth: 0, paddingLeft: isRight ? 0 : 28, paddingRight: isRight ? 28 : 0 }}>
      <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.38em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>FEATURED</div>
      <Editable
        value={block.headline}
        onChange={(v) => u({ headline: v })}
        placeholder="Headline"
        data-field="Image-text headline"
        style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: CREAM, marginBottom: 14 }}
      />
      <Editable
        value={block.body}
        onChange={(v) => u({ body: v })}
        multiline
        placeholder="Body text..."
        data-field="Image-text body"
        style={{ fontFamily: SANS, fontSize: 14, fontWeight: 400, lineHeight: 1.8, color: MUTED, marginBottom: 24 }}
      />
      <Editable
        value={block.ctaLabel}
        onChange={(v) => u({ ctaLabel: v })}
        data-field="Image-text CTA label"
        style={{
          display: 'inline-block',
          background: GOLD,
          color: theme ? getLuxorEmailReadableText(theme.accent, theme.accentText) : '#050505',
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
    <div className="luxor-email-block-content luxor-email-image-text" style={{ padding: '36px 48px', display: 'flex', flexDirection: isRight ? 'row-reverse' : 'row', gap: 0, position: 'relative', alignItems: 'flex-start' }}>
      <EditHint show={selected} />
      {imgSlot}
      {textSlot}
    </div>
  )
}

// ─── BUTTON Block ─────────────────────────────────────────────────────────────

function ButtonBlockView({ block, onChange, selected }: { block: ButtonBlock; onChange: (b: ButtonBlock) => void; selected: boolean }) {
  const theme = React.useContext(CanvasThemeContext)
  const isGold = !block.bgColor || ['#caa24c', '#b8924a'].includes(block.bgColor)
  const background = isGold && theme ? theme.accent : block.bgColor
  const foreground = getLuxorEmailReadableText(background, isGold && theme ? theme.accentText : block.textColor)
  const u = (patch: Partial<ButtonBlock>) => onChange({ ...block, ...patch })
  const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' }

  return (
    <div className="luxor-email-block-content" style={{ padding: '16px 48px 28px', display: 'flex', justifyContent: justifyMap[block.align] ?? 'center', position: 'relative' }}>
      <EditHint show={selected} />
      <Editable
        value={block.label}
        onChange={(v) => u({ label: v })}
        data-field="Button label"
        style={{
          display: 'inline-block',
          background,
          color: foreground,
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
    <div className="luxor-email-block-content luxor-email-two-column" style={{ padding: '28px 48px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 1px minmax(0,1fr)', gap: '0 20px', position: 'relative' }}>
      <EditHint show={selected} />
      {/* Left */}
      <div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>01</div>
        <Editable value={block.leftHeadline} onChange={(v) => u({ leftHeadline: v })} data-field="Left column heading" style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, lineHeight: 1.15, color: CREAM, marginBottom: 10 }} />
        <Editable value={block.leftBody} onChange={(v) => u({ leftBody: v })} data-field="Left column body" multiline style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.8, color: MUTED }} />
      </div>
      {/* Divider */}
      <div className="luxor-email-column-divider" style={{ background: BORDER }} />
      {/* Right */}
      <div>
        <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>02</div>
        <Editable value={block.rightHeadline} onChange={(v) => u({ rightHeadline: v })} data-field="Right column heading" style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, lineHeight: 1.15, color: CREAM, marginBottom: 10 }} />
        <Editable value={block.rightBody} onChange={(v) => u({ rightBody: v })} data-field="Right column body" multiline style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.8, color: MUTED }} />
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

const SITE_BASE_URL = 'https://www.luxoratlaspalmas.com'

function FooterBlockView({ block, onChange, selected }: { block: FooterBlock; onChange: (b: FooterBlock) => void; selected: boolean }) {
  const theme = React.useContext(CanvasThemeContext)
  const footerMuted = theme ? getLuxorEmailReadableText(theme.surfaceAlt, theme.muted) : MUTED
  const footerAccent = theme ? getLuxorEmailReadableText(theme.surfaceAlt, theme.accent, 3) : GOLD
  const u = (patch: Partial<FooterBlock>) => onChange({ ...block, ...patch })

  return (
    <div className="luxor-email-block-content" style={{ background: BG_DARK, padding: '44px 48px 36px', borderTop: '1px solid rgba(202,162,76,0.22)', position: 'relative', textAlign: 'center' }}>
      <EditHint show={selected} />
      {/* Palm mark */}
      <div style={{ marginBottom: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${SITE_BASE_URL}/luxor-portal-mark-gold-tight.png`} alt="" width={64} height={64} style={{ display: 'inline-block', width: 64, height: 64, objectFit: 'contain', border: '2px solid #caa24c', borderRadius: '999px', padding: 2, backgroundColor: BG_DARK, boxSizing: 'border-box' }} />
      </div>
      {/* LUXOR wordmark */}
      <Editable value={block.companyName === 'Luxor Event Space' ? 'LUXOR' : block.companyName} onChange={(value) => u({ companyName: value })} data-field="Footer business name" style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 500, letterSpacing: '0.14em', color: footerAccent, textTransform: 'uppercase', lineHeight: 1.2, marginBottom: 6 }} />
      {/* Subline */}
      <div style={{ fontFamily: SERIF, fontSize: 8, fontWeight: 500, letterSpacing: '0.55em', color: footerMuted, textTransform: 'uppercase', marginBottom: 24 }}>AT LAS PALMAS EVENTS</div>
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
        data-field="Footer address"
        style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: footerMuted, lineHeight: 1.9, display: 'block', textAlign: 'center' }}
      />
      <Editable
        value={block.phone}
        onChange={(v) => u({ phone: v })}
        data-field="Footer details"
        style={{ fontFamily: SANS, fontSize: 11, fontWeight: 400, color: footerMuted, lineHeight: 1.9, display: 'block', textAlign: 'center' }}
      />
      <div style={{ fontFamily: SANS, fontSize: 11, color: footerMuted, marginTop: 2 }}>
        <div>booking@luxoratlaspalmas.com</div>
        <span style={{ textDecoration: 'underline' }}>{block.website}</span>
      </div>
      {/* Social */}
      {block.showSocial && (
        <div style={{ marginTop: 16, fontFamily: SANS, fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: GOLD }}>
          Instagram <span style={{ opacity: 0.4, margin: '0 12px' }}>◆</span> Facebook <span style={{ opacity: 0.4, margin: '0 12px' }}>◆</span> TikTok
        </div>
      )}
      {/* Tagline */}
      <div style={{ marginTop: 20, fontFamily: SANS, fontSize: 8, fontWeight: 600, letterSpacing: '0.46em', textTransform: 'uppercase', color: footerMuted }}>
        Timeless ◆ Elegant ◆ Celebratory ◆ Luxurious
      </div>
      {/* Unsubscribe */}
      <div style={{ marginTop: 20, fontFamily: SANS, fontSize: 9, color: footerMuted, lineHeight: 1.7 }}>
        You received this because you expressed interest in Luxor Event Space.{' '}
        <span style={{ color: footerMuted, textDecoration: 'underline' }}>Unsubscribe</span>
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
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (b: EmailBlock) => void
  onActivateField: (field: string) => void
  showControls?: boolean
}

function SortableBlock({
  block, isSelected, onSelect, onDelete, onDuplicate, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onChange, onActivateField, showControls = true,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} data-email-block-id={block.id}>
      {/* Floating controls bar — only visible on hover/selection */}
      <div
        className="group/block relative"
        style={{
          border: `2px solid ${isSelected ? GOLD : 'transparent'}`,
          borderRadius: 4,
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(202,162,76,0.3)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'
        }}
        onClick={(event) => {
          const field = (event.target as HTMLElement).closest<HTMLElement>('[contenteditable]')?.dataset.field
          onSelect()
          if (field) onActivateField(field)
        }}
        onFocusCapture={(event) => {
          const field = (event.target as HTMLElement).closest<HTMLElement>('[contenteditable]')?.dataset.field
          onSelect()
          if (field) onActivateField(field)
        }}
      >
        {/* Controls toolbar */}
        {showControls && <div
          className={`luxor-email-block-tools transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100 group-focus-within/block:opacity-100'}`}
          style={{
            position: 'absolute',
            top: -46,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'var(--portal-card)',
            border: '1px solid var(--portal-border)',
            borderRadius: '4px 4px 0 0',
            padding: '1px',
            zIndex: 10,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="touch-none cursor-grab active:cursor-grabbing"
            style={{ color: 'var(--portal-muted)', padding: '0 4px', display: 'flex', alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center' }}
            title="Drag to reorder"
          >
            <GripVertical size={13} />
          </div>
          <div style={{ width: 1, height: 14, background: 'rgba(202,162,76,0.15)', margin: '0 2px' }} />
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate block"
            aria-label="Duplicate email element"
            style={{ color: 'var(--portal-muted)', padding: '0 3px', cursor: 'pointer', background: 'none', border: 'none', display: 'flex' }}
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            aria-label="Move email element up"
            style={{ color: canMoveUp ? 'var(--portal-muted)' : 'var(--portal-faint)', padding: '0 3px', cursor: canMoveUp ? 'pointer' : 'not-allowed', background: 'none', border: 'none', display: 'flex' }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            aria-label="Move email element down"
            style={{ color: canMoveDown ? 'var(--portal-muted)' : 'var(--portal-faint)', padding: '0 3px', cursor: canMoveDown ? 'pointer' : 'not-allowed', background: 'none', border: 'none', display: 'flex' }}
          >
            <ChevronDown size={13} />
          </button>
          <div style={{ width: 1, height: 14, background: 'rgba(202,162,76,0.15)', margin: '0 2px' }} />
          <button
            type="button"
            onClick={onDelete}
            title="Delete block"
            aria-label="Remove email element"
            style={{ color: 'var(--portal-muted)', padding: '0 3px', cursor: 'pointer', background: 'none', border: 'none', display: 'flex' }}
            className="hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>}

        {/* Actual email block preview */}
        <div
          style={{ background: BG_CARD, overflow: 'hidden', borderRadius: 2 }}
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
  onDuplicate?: (id: string) => void
  onReorder: (blocks: EmailBlock[]) => void
  onChange: (block: EmailBlock) => void
  onActivateField?: (blockId: string, field: string) => void
  onAddBlock?: (type: BlockType) => void
  theme: LuxorEmailTheme
  previewMode?: 'desktop' | 'mobile'
  quietChrome?: boolean
  showBlockControls?: boolean
}

export function BlockCanvas({ blocks, selectedId, onSelect, onDelete, onDuplicate, onReorder, onChange, onAddBlock, onActivateField, theme, previewMode = 'desktop', quietChrome = true, showBlockControls = true }: BlockCanvasProps) {
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

  const themeVariables = {
    '--email-accent': theme.accent,
    '--email-accent-muted': `${theme.accent}99`,
    '--email-text': theme.text,
    '--email-muted': theme.muted,
    '--email-surface': theme.surface,
    '--email-surface-alt': theme.surfaceAlt,
    '--email-border': theme.border,
    '--email-heading-font': theme.fontHeading,
    '--email-body-font': theme.fontBody,
  } as React.CSSProperties

  const handlePaletteDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/x-luxor-email-block') as BlockType
    if (type && onAddBlock) onAddBlock(type)
  }

  if (blocks.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-4 py-24 px-8"
        style={themeVariables}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handlePaletteDrop}
      >
        <div style={{ width: 64, height: 64, borderRadius: 12, border: '2px dashed rgba(202,162,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={28} style={{ color: theme.accent }} />
        </div>
        <div className="text-center">
          <p style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: 'rgba(215,194,154,0.4)', marginBottom: 4 }}>Canvas is empty</p>
          <p style={{ fontFamily: SANS, fontSize: 11, color: 'rgba(215,194,154,0.25)' }}>Add blocks from the palette, or pick a template above.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="luxor-email-canvas flex min-h-0 min-w-0 flex-1"
      style={themeVariables}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handlePaletteDrop}
    >
    <CanvasThemeContext.Provider value={theme}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {/* Email at 600px, centred, scrollable */}
        <div className="luxor-email-canvas-scroll min-w-0 flex-1 overflow-y-auto portal-scrollbar" style={{ padding: quietChrome ? '16px 12px' : '32px 24px' }}>
          <div style={{ maxWidth: previewMode === 'mobile' ? Math.min(390, theme.contentWidth) : theme.contentWidth, margin: '0 auto', containerType: 'inline-size', containerName: 'luxor-email' }}>
          {/* Email chrome header */}
          <div style={{ margin: '0 auto', marginBottom: 4 }}>
            {!quietChrome && <div style={{ background: '#0a0807', border: '1px solid rgba(202,162,76,0.22)', borderBottom: 'none', borderRadius: '4px 4px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.25)' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.15)' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(202,162,76,0.1)' }} />
              <div style={{ flex: 1, height: 1, background: 'rgba(202,162,76,0.1)', margin: '0 8px' }} />
              <span style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.35)' }}>Email Preview — 600px</span>
            </div>}
            {/* Gold shimmer top bar */}
            {!quietChrome && <div style={{ height: 3, background: 'linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24)' }} />}
            {/* Logo header band */}
            <div style={{ background: quietChrome ? theme.surfaceAlt : '#080605', padding: '18px 24px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${SITE_BASE_URL}/luxor-portal-mark-gold-tight.png`} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: 'contain', display: 'block', border: '2px solid #caa24c', borderRadius: '999px', padding: 2, backgroundColor: '#080605', boxSizing: 'border-box' }} />
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, letterSpacing: '0.22em', color: GOLD, textTransform: 'uppercase', lineHeight: 1 }}>LUXOR</div>
                <div style={{ fontFamily: SERIF, fontSize: 7.2, fontWeight: 500, letterSpacing: '0.4em', color: GOLD_DIM, textTransform: 'uppercase', marginTop: 4 }}>AT LAS PALMAS EVENTS</div>
              </div>
            </div>
          </div>

          {/* Blocks */}
          <div style={{ margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {blocks.map((block, idx) => (
              <SortableBlock
                key={block.id}
                block={block}
                isSelected={block.id === selectedId}
                onSelect={() => onSelect(block.id)}
                onDelete={() => onDelete(block.id)}
                onDuplicate={() => onDuplicate?.(block.id)}
                onMoveUp={() => moveBlock(block.id, 'up')}
                onMoveDown={() => moveBlock(block.id, 'down')}
                canMoveUp={idx > 0}
                canMoveDown={idx < blocks.length - 1}
                onChange={onChange}
                onActivateField={(field) => onActivateField?.(block.id, field)}
                showControls={showBlockControls}
              />
            ))}
          </div>

          {/* Email chrome footer bar */}
          {!quietChrome && <div style={{ margin: '0 auto', marginTop: 4 }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24)' }} />
            <div style={{ background: '#0a0807', border: '1px solid rgba(202,162,76,0.22)', borderTop: 'none', borderRadius: '0 0 4px 4px', padding: '8px 16px', textAlign: 'center' }}>
              <span style={{ fontFamily: SANS, fontSize: 8, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(202,162,76,0.25)' }}>End of email</span>
            </div>
          </div>}
          </div>
        </div>
      </SortableContext>
    </DndContext>
    </CanvasThemeContext.Provider>
    <style jsx global>{`
      .luxor-email-block-tools button { min-width: 44px; min-height: 44px; align-items: center; justify-content: center; }
      .luxor-email-block-tools button:focus-visible { outline: 2px solid var(--portal-gold, #a8792f); outline-offset: -2px; }
      @container luxor-email (max-width: 600px) {
        .luxor-email-canvas .luxor-email-block-content { padding-left: 22px !important; padding-right: 22px !important; }
        .luxor-email-canvas .luxor-email-hero { padding: 42px 22px 38px !important; }
        .luxor-email-canvas .luxor-email-hero-title { font-size: 34px !important; line-height: 1.12 !important; }
        .luxor-email-canvas .luxor-email-image-text { flex-direction: column !important; gap: 20px !important; }
        .luxor-email-canvas .luxor-email-image-slot { width: 100% !important; }
        .luxor-email-canvas .luxor-email-image-slot > img, .luxor-email-canvas .luxor-email-image-slot > div { width: 100% !important; }
        .luxor-email-canvas .luxor-email-image-copy { padding: 0 !important; }
        .luxor-email-canvas .luxor-email-two-column { grid-template-columns: minmax(0, 1fr) !important; gap: 20px !important; }
        .luxor-email-canvas .luxor-email-column-divider { display: none; }
      }
    `}</style>
    </div>
  )
}
