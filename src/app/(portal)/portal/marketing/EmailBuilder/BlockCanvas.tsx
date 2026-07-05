'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
} from '@dnd-kit/sortable'
import type { EmailBlock } from '../emailTemplates'
import { GripVertical, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

// ─── Block preview renders (simplified visual representations) ───────────────

function BlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case 'hero':
      return (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: block.backgroundImage
              ? `linear-gradient(rgba(0,0,0,${block.overlayOpacity}),rgba(0,0,0,${block.overlayOpacity})),url('${block.backgroundImage}') center/cover`
              : 'linear-gradient(135deg,#1a1208 0%,#3d2a0e 100%)',
            padding: '32px 24px',
            textAlign: block.textAlign,
          }}
        >
          <p className="text-white font-bold text-base leading-tight mb-1 truncate">{block.headline || 'Hero Headline'}</p>
          <p className="text-white/60 text-xs truncate">{block.subheadline || 'Sub-headline text'}</p>
          {block.ctaVisible && (
            <div className="mt-3">
              <span className="inline-block bg-[#b8924a] text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-sm">{block.ctaLabel}</span>
            </div>
          )}
        </div>
      )

    case 'text':
      return (
        <div style={{ textAlign: block.textAlign, padding: '12px 16px' }}>
          {block.content.split('\n').slice(0, 3).map((line, i) => (
            <p key={i} className="text-sm truncate" style={{ color: block.color, marginBottom: 4 }}>
              {line || '\u00a0'}
            </p>
          ))}
          {block.content.split('\n').length > 3 && <p className="text-[10px] text-zinc-600">...</p>}
        </div>
      )

    case 'image_text':
      return (
        <div className={`flex gap-3 p-3 ${block.imagePosition === 'right' ? 'flex-row-reverse' : ''}`}>
          <div className="w-20 h-16 rounded bg-zinc-800 flex-shrink-0 overflow-hidden">
            {block.imageUrl
              ? <img src={block.imageUrl} alt={block.imageAlt} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-zinc-600 text-[10px]">Image</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white/90 truncate">{block.headline}</p>
            <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">{block.body}</p>
          </div>
        </div>
      )

    case 'button':
      return (
        <div className="flex py-3 px-4" style={{ justifyContent: block.align === 'center' ? 'center' : block.align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span className="text-[11px] font-bold uppercase tracking-widest px-5 py-2 rounded-sm" style={{ background: block.bgColor, color: block.textColor }}>
            {block.label}
          </span>
        </div>
      )

    case 'two_column':
      return (
        <div className="grid grid-cols-2 gap-3 p-3">
          <div>
            <p className="text-[11px] font-bold text-white/80 truncate mb-1">{block.leftHeadline}</p>
            <p className="text-[10px] text-zinc-500 line-clamp-2">{block.leftBody}</p>
          </div>
          <div className="border-l border-zinc-800 pl-3">
            <p className="text-[11px] font-bold text-white/80 truncate mb-1">{block.rightHeadline}</p>
            <p className="text-[10px] text-zinc-500 line-clamp-2">{block.rightBody}</p>
          </div>
        </div>
      )

    case 'divider':
      return (
        <div className="px-4 py-4">
          <div style={{ borderTop: `${block.thickness}px ${block.style} ${block.color}` }} />
        </div>
      )

    case 'spacer':
      return (
        <div className="px-4 py-2 flex items-center justify-center gap-2">
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
          <span className="text-[9px] text-zinc-700 font-mono uppercase">{block.height}px spacer</span>
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
        </div>
      )

    case 'footer':
      return (
        <div className="p-3 text-center bg-zinc-900/50 rounded-lg">
          <p className="text-[11px] font-bold text-[#f5e6c8] tracking-widest uppercase">{block.companyName}</p>
          <p className="text-[9px] text-zinc-600 mt-1">{block.address}</p>
          {block.showSocial && <p className="text-[9px] text-[#b8924a] mt-1">Instagram · Facebook</p>}
        </div>
      )

    default:
      return <div className="p-3 text-xs text-zinc-600">Block</div>
  }
}

// ─── Sortable block wrapper ───────────────────────────────────────────────────

interface SortableBlockProps {
  block: EmailBlock
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function SortableBlock({ block, isSelected, onClick, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }

  const blockLabels: Record<string, string> = {
    hero: 'Hero',
    text: 'Text',
    image_text: 'Image + Text',
    button: 'Button',
    two_column: 'Two Columns',
    divider: 'Divider',
    spacer: 'Spacer',
    footer: 'Footer',
  }

  return (
    <div ref={setNodeRef} style={style} className="group/block relative">
      {/* Selection ring */}
      <div
        onClick={onClick}
        className={`relative rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
          isSelected
            ? 'border-[#caa24c] shadow-lg shadow-[#caa24c]/10'
            : 'border-zinc-800/60 hover:border-zinc-700 bg-zinc-900/20'
        }`}
      >
        {/* Block type label */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b transition-colors ${isSelected ? 'border-[#caa24c]/20 bg-[#caa24c]/5' : 'border-zinc-800/40 bg-zinc-900/40'}`}>
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 transition-colors touch-none">
            <GripVertical size={14} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500 flex-1">
            {blockLabels[block.type] ?? block.type}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover/block:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp() }}
              disabled={!canMoveUp}
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown() }}
              disabled={!canMoveDown}
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1 rounded text-zinc-700 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Block preview */}
        <div className="bg-white/[0.02]">
          <BlockPreview block={block} />
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
}

export function BlockCanvas({ blocks, selectedId, onSelect, onDelete, onReorder }: BlockCanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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
    if (direction === 'up' && idx > 0) {
      onReorder(arrayMove(blocks, idx, idx - 1))
    } else if (direction === 'down' && idx < blocks.length - 1) {
      onReorder(arrayMove(blocks, idx, idx + 1))
    }
  }

  if (blocks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 px-8">
        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-zinc-800 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-700">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-zinc-600">Canvas is empty</p>
          <p className="text-xs text-zinc-700 mt-1">Add blocks from the palette on the left, or choose a template above.</p>
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto portal-scrollbar px-6 py-6 space-y-3">
          {blocks.map((block, idx) => (
            <SortableBlock
              key={block.id}
              block={block}
              isSelected={block.id === selectedId}
              onClick={() => onSelect(block.id)}
              onDelete={() => onDelete(block.id)}
              onMoveUp={() => moveBlock(block.id, 'up')}
              onMoveDown={() => moveBlock(block.id, 'down')}
              canMoveUp={idx > 0}
              canMoveDown={idx < blocks.length - 1}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
