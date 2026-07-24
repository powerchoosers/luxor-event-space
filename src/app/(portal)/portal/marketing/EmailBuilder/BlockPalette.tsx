'use client'

import React from 'react'
import type { BlockType } from '../emailTemplates'
import { LayoutTemplate, Type, Image, MousePointerClick, Columns2, Minus, AlignJustify, FootprintsIcon } from 'lucide-react'

interface PaletteBlock {
  type: BlockType
  label: string
  description: string
  icon: React.ReactNode
  color: string
}

const PALETTE_BLOCKS: PaletteBlock[] = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'Full-width banner with headline',
    icon: <LayoutTemplate size={18} />,
    color: '#b8924a',
  },
  {
    type: 'text',
    label: 'Text',
    description: 'Paragraph or heading block',
    icon: <Type size={18} />,
    color: '#4a90d9',
  },
  {
    type: 'image_text',
    label: 'Image + Text',
    description: 'Side-by-side image and copy',
    icon: <Image size={18} />,
    color: '#6c63ff',
  },
  {
    type: 'button',
    label: 'Button',
    description: 'CTA button with custom URL',
    icon: <MousePointerClick size={18} />,
    color: '#27ae60',
  },
  {
    type: 'two_column',
    label: 'Two Columns',
    description: 'Side-by-side content sections',
    icon: <Columns2 size={18} />,
    color: '#e67e22',
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Horizontal rule separator',
    icon: <Minus size={18} />,
    color: '#888888',
  },
  {
    type: 'spacer',
    label: 'Spacer',
    description: 'Vertical whitespace',
    icon: <AlignJustify size={18} />,
    color: '#555555',
  },
  {
    type: 'footer',
    label: 'Footer',
    description: 'Branded footer with links',
    icon: <FootprintsIcon size={18} />,
    color: '#c0392b',
  },
]

interface BlockPaletteProps {
  onAdd: (type: BlockType) => void
  isDragging?: boolean
}

export function BlockPalette({ onAdd }: BlockPaletteProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/40 px-5 py-3.5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Blocks</p>
        <p className="text-[11px] text-[color:var(--portal-muted)] mt-0.5">Click to add to canvas</p>
      </div>
      <div className="flex-1 overflow-y-auto portal-scrollbar px-3.5 py-3.5 space-y-2">
        {PALETTE_BLOCKS.map((block) => (
          <button
            key={block.type}
            onClick={() => onAdd(block.type)}
            className="w-full flex items-center gap-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 py-3 text-left transition-all hover:border-[#caa24c]/40 hover:bg-[#caa24c]/10 hover:scale-[1.015] active:scale-[0.99] group cursor-pointer"
          >
            <div
              className="flex-shrink-0 rounded-lg p-2 transition-transform group-hover:scale-110"
              style={{ background: `${block.color}20`, color: block.color }}
            >
              {block.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[color:var(--portal-text)] leading-tight">{block.label}</p>
              <p className="text-[10px] text-[color:var(--portal-muted)] leading-tight mt-0.5 truncate">{block.description}</p>
            </div>
            <div className="ml-auto text-[color:var(--portal-muted)] group-hover:text-[#a8792f] dark:group-hover:text-[#f1d27a] transition-colors flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* Drag hint */}
      <div className="px-4 pb-3.5 pt-2 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/20 mt-1">
        <p className="text-[9px] text-[color:var(--portal-muted)] text-center uppercase tracking-widest">Drag blocks on canvas to reorder</p>
      </div>
    </div>
  )
}
