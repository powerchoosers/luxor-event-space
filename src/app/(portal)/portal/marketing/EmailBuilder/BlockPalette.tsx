'use client'

import React, { useState } from 'react'
import type { BlockType, EmailTemplate } from '../emailTemplates'
import {
  CalendarDays,
  Columns2,
  Heading1,
  Image,
  Images,
  LayoutTemplate,
  Link2,
  Minus,
  MousePointerClick,
  PanelBottom,
  Search,
  Share2,
  Space,
  Type,
} from 'lucide-react'

type PaletteTab = 'blocks' | 'sections' | 'templates'

type PaletteItem = {
  type: BlockType
  label: string
  icon: React.ComponentType<{ size?: number }>
}

const GROUPS: Array<{ label: string; items: PaletteItem[] }> = [
  {
    label: 'Basic blocks',
    items: [
      { type: 'text', label: 'Heading', icon: Heading1 },
      { type: 'text', label: 'Paragraph', icon: Type },
      { type: 'image_text', label: 'Image', icon: Image },
      { type: 'button', label: 'Button', icon: MousePointerClick },
      { type: 'divider', label: 'Divider', icon: Minus },
      { type: 'spacer', label: 'Spacer', icon: Space },
    ],
  },
  {
    label: 'Event & CTA',
    items: [
      { type: 'two_column', label: 'Event card', icon: CalendarDays },
      { type: 'button', label: 'Booking CTA', icon: Link2 },
      { type: 'hero', label: 'Hero', icon: LayoutTemplate },
      { type: 'two_column', label: 'Columns', icon: Columns2 },
    ],
  },
  {
    label: 'Media & social',
    items: [
      { type: 'image_text', label: 'Gallery', icon: Images },
      { type: 'footer', label: 'Social', icon: Share2 },
    ],
  },
  {
    label: 'Footer & legal',
    items: [
      { type: 'footer', label: 'Signature', icon: PanelBottom },
      { type: 'footer', label: 'Footer', icon: PanelBottom },
    ],
  },
]

const SECTIONS: Array<{ label: string; description: string; blocks: BlockType[]; icon: React.ComponentType<{ size?: number }> }> = [
  { label: 'Tour details', description: 'Hero, visit details, and booking action', blocks: ['hero', 'two_column', 'button'], icon: CalendarDays },
  { label: 'Venue feature', description: 'Image, story, and link', blocks: ['image_text', 'button'], icon: Image },
  { label: 'Payment reminder', description: 'Clear balance details and payment action', blocks: ['text', 'divider', 'button'], icon: Link2 },
  { label: 'Event invitation', description: 'Announcement, details, and RSVP', blocks: ['hero', 'text', 'button'], icon: LayoutTemplate },
]

export function BlockPalette({
  onAdd,
  onAddSequence,
  templates = [],
  onSelectTemplate,
}: {
  onAdd: (type: BlockType) => void
  onAddSequence?: (types: BlockType[]) => void
  templates?: EmailTemplate[]
  onSelectTemplate?: (template: EmailTemplate) => void
}) {
  const [activeTab, setActiveTab] = useState<PaletteTab>('blocks')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--portal-card)]">
      <div className="grid grid-cols-3 border-b border-[color:var(--portal-border)] px-2 pt-2">
        {(['blocks', 'sections', 'templates'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-1 py-3 text-[10px] font-bold capitalize transition-colors ${activeTab === tab ? 'border-[#b88732] text-[#a8792f]' : 'border-transparent text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="border-b border-[color:var(--portal-border)] p-3">
        <label className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2">
          <Search size={13} className="text-[color:var(--portal-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeTab}`}
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[color:var(--portal-text)] outline-none placeholder:text-[color:var(--portal-muted)]"
          />
        </label>
      </div>

      <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === 'blocks' ? (
          <div className="space-y-5">
            {GROUPS.map((group) => {
              const items = group.items.filter((item) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery))
              if (!items.length) return null
              return (
                <section key={group.label}>
                  <p className="mb-2 text-[8px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((item, index) => {
                      const Icon = item.icon
                      return (
                        <button
                          key={`${item.label}-${index}`}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'copy'
                            event.dataTransfer.setData('application/x-luxor-email-block', item.type)
                          }}
                          onClick={() => onAdd(item.type)}
                          className="group flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-3 text-center transition hover:border-[#b88732]/55 hover:bg-[#b88732]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b88732]/35"
                        >
                          <Icon size={17} />
                          <span className="text-[10px] font-semibold text-[color:var(--portal-text)]">{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'sections' ? (
          <div className="space-y-2">
            {SECTIONS.filter((section) => !normalizedQuery || `${section.label} ${section.description}`.toLowerCase().includes(normalizedQuery)).map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.label}
                  type="button"
                  onClick={() => onAddSequence?.(section.blocks)}
                  className="flex w-full items-start gap-3 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-left transition hover:border-[#b88732]/55 hover:bg-[#b88732]/8"
                >
                  <span className="rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-2 text-[#a8792f]"><Icon size={16} /></span>
                  <span>
                    <span className="block text-[11px] font-bold text-[color:var(--portal-text)]">{section.label}</span>
                    <span className="mt-1 block text-[9px] leading-4 text-[color:var(--portal-muted)]">{section.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}

        {activeTab === 'templates' ? (
          <div className="space-y-2">
            {templates.filter((template) => !normalizedQuery || `${template.name} ${template.description}`.toLowerCase().includes(normalizedQuery)).map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate?.(template)}
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-left transition hover:border-[#b88732]/55 hover:bg-[#b88732]/8"
              >
                <span className="mb-2 block h-1 w-8" style={{ backgroundColor: template.previewColor }} />
                <span className="block text-[11px] font-bold text-[color:var(--portal-text)]">{template.name}</span>
                <span className="mt-1 line-clamp-2 block text-[9px] leading-4 text-[color:var(--portal-muted)]">{template.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="border-t border-[color:var(--portal-border)] px-3 py-2.5 text-center text-[8px] uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Drag blocks to add · drag canvas blocks to reorder</p>
    </div>
  )
}
