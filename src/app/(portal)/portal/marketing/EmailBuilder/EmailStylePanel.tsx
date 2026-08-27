'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Moon, Palette, Sun } from 'lucide-react'
import type { LuxorEmailTheme, LuxorEmailThemeMode } from '../emailTemplates'
import { LUXOR_EMAIL_THEME_PRESETS } from '@/lib/luxorEmailDesignSystem'
import { PortalSelect } from '@/components/portal/PortalUI'

const COLOR_FIELDS: Array<{ key: keyof Pick<LuxorEmailTheme, 'canvas' | 'surface' | 'surfaceAlt' | 'text' | 'muted' | 'accent' | 'border'>; label: string }> = [
  { key: 'canvas', label: 'Backdrop' },
  { key: 'surface', label: 'Email canvas' },
  { key: 'surfaceAlt', label: 'Alternate section' },
  { key: 'text', label: 'Primary text' },
  { key: 'muted', label: 'Body text' },
  { key: 'accent', label: 'Accent & buttons' },
  { key: 'border', label: 'Borders' },
]

const FONT_OPTIONS = [
  { value: 'Cormorant Garamond, Georgia, Times New Roman, serif', label: 'Cormorant Garamond' },
  { value: 'Playfair Display, Georgia, Times New Roman, serif', label: 'Playfair Display' },
  { value: 'Georgia, Times New Roman, serif', label: 'Georgia' },
]

const BODY_FONT_OPTIONS = [
  { value: 'Manrope, Helvetica Neue, Arial, sans-serif', label: 'Manrope' },
  { value: 'Helvetica Neue, Arial, sans-serif', label: 'Helvetica Neue' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
]

function ThemeIcon({ mode }: { mode: LuxorEmailThemeMode }) {
  if (mode === 'light') return <Sun size={14} />
  if (mode === 'dark') return <Moon size={14} />
  return <Palette size={14} />
}

export function EmailStylePanel({ theme, onChange, activeField }: { theme: LuxorEmailTheme; onChange: (theme: LuxorEmailTheme) => void; activeField?: string | null }) {
  const [openSection, setOpenSection] = useState('Email')
  const update = (patch: Partial<LuxorEmailTheme>) => onChange({ ...theme, ...patch })
  const highlightedKey = activeField?.toLowerCase().includes('supporting') || activeField?.toLowerCase().includes('body') || activeField?.toLowerCase().includes('details')
    ? 'muted'
    : activeField?.toLowerCase().includes('headline') || activeField?.toLowerCase().includes('heading') || activeField?.toLowerCase().includes('label')
      ? 'text'
      : activeField?.toLowerCase().includes('cta') || activeField?.toLowerCase().includes('button')
        ? 'accent'
        : null

  return (
    <div className="portal-scrollbar h-full overflow-y-auto">
      <div className="border-b border-[color:var(--portal-border)] p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[color:var(--portal-muted)]">Theme presets</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(Object.keys(LUXOR_EMAIL_THEME_PRESETS) as LuxorEmailThemeMode[]).map((mode) => {
            const preset = LUXOR_EMAIL_THEME_PRESETS[mode]
            const active = theme.mode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ ...preset })}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[9px] font-bold capitalize transition ${active ? 'border-[#b88732] bg-[#b88732]/10 text-[#a8792f]' : 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}
              >
                <ThemeIcon mode={mode} />
                {mode}
              </button>
            )
          })}
        </div>
      </div>

      {['Email', 'Text', 'Buttons', 'Dividers', 'Footer'].map((section) => {
        const open = openSection === section
        return (
          <section key={section} className="border-b border-[color:var(--portal-border)]">
            <button
              type="button"
              onClick={() => setOpenSection(open ? '' : section)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-[11px] font-bold text-[color:var(--portal-text)]"
            >
              {section}
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {open && section === 'Email' ? (
              <div className="space-y-3 px-4 pb-4">
                {COLOR_FIELDS.map((field) => (
                  <label key={field.key} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition ${highlightedKey === field.key ? 'bg-[#caa24c]/10 ring-1 ring-[#caa24c]/60' : ''}`}>
                    <span className="text-[9px] font-semibold text-[color:var(--portal-muted)]">{field.label}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme[field.key]}
                        onChange={(event) => update({ [field.key]: event.target.value })}
                        className="h-7 w-7 cursor-pointer rounded border border-[color:var(--portal-border)] bg-transparent p-0"
                      />
                      <input
                        value={theme[field.key]}
                        onChange={(event) => update({ [field.key]: event.target.value })}
                        className="w-20 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-2 py-1.5 font-mono text-[9px] text-[color:var(--portal-text)] outline-none"
                      />
                    </span>
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-semibold text-[color:var(--portal-muted)]">Email width</span>
                  <input type="range" min={520} max={680} step={10} value={theme.contentWidth} onChange={(event) => update({ contentWidth: Number(event.target.value) })} className="w-full accent-[#b88732]" />
                  <span className="text-[9px] text-[color:var(--portal-muted)]">{theme.contentWidth}px</span>
                </label>
              </div>
            ) : null}
            {open && section === 'Text' ? (
              <div className="space-y-3 px-4 pb-4">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-semibold text-[color:var(--portal-muted)]">Heading font</span>
                  <PortalSelect value={theme.fontHeading} onChange={(value) => update({ fontHeading: value })} options={FONT_OPTIONS} className="w-full" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-semibold text-[color:var(--portal-muted)]">Body font</span>
                  <PortalSelect value={theme.fontBody} onChange={(value) => update({ fontBody: value })} options={BODY_FONT_OPTIONS} className="w-full" />
                </label>
              </div>
            ) : null}
            {open && !['Email', 'Text'].includes(section) ? (
              <div className="px-4 pb-4 text-[9px] leading-4 text-[color:var(--portal-muted)]">
                Uses your accent, border, radius, and text choices above. Select a block to override its individual styling.
              </div>
            ) : null}
          </section>
        )
      })}

      <div className="p-4 text-[9px] leading-4 text-[color:var(--portal-muted)]">
        Theme changes apply to this template, its mobile layout, previews, and sent HTML. Inbox dark-mode fallbacks are included automatically.
      </div>
    </div>
  )
}
