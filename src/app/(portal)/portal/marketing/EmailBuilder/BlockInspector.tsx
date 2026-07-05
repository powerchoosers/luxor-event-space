'use client'

import React from 'react'
import type { EmailBlock, HeroBlock, TextBlock, ImageTextBlock, ButtonBlock, TwoColumnBlock, DividerBlock, SpacerBlock, FooterBlock } from '../emailTemplates'

interface InspectorProps {
  block: EmailBlock
  onChange: (updated: EmailBlock) => void
}

const labelCls = 'block text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500 mb-1.5'
const inputCls = 'w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-[#caa24c]/40 focus:outline-none focus:ring-1 focus:ring-[#caa24c]/20 transition-colors'
const textareaCls = `${inputCls} resize-none`
const selectCls = `${inputCls} cursor-pointer`
const fieldCls = 'space-y-1.5'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={fieldCls}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

function RowFields({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

// ─── Hero Inspector ──────────────────────────────────────────────────────────
function HeroInspector({ block, onChange }: { block: HeroBlock; onChange: (b: HeroBlock) => void }) {
  const u = (patch: Partial<HeroBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <Field label="Headline">
        <input className={inputCls} value={block.headline} onChange={(e) => u({ headline: e.target.value })} />
      </Field>
      <Field label="Sub-headline">
        <textarea className={textareaCls} rows={3} value={block.subheadline} onChange={(e) => u({ subheadline: e.target.value })} />
      </Field>
      <Field label="Background Image URL">
        <input className={inputCls} placeholder="https://..." value={block.backgroundImage} onChange={(e) => u({ backgroundImage: e.target.value })} />
      </Field>
      <RowFields>
        <Field label="Overlay Opacity">
          <input type="range" min={0} max={1} step={0.05} value={block.overlayOpacity} onChange={(e) => u({ overlayOpacity: Number(e.target.value) })} className="w-full accent-[#caa24c]" />
          <span className="text-[10px] text-zinc-500 font-mono">{Math.round(block.overlayOpacity * 100)}%</span>
        </Field>
        <Field label="Text Align">
          <select className={selectCls} value={block.textAlign} onChange={(e) => u({ textAlign: e.target.value as HeroBlock['textAlign'] })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
      </RowFields>
      <div className="border-t border-zinc-800/60 pt-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className={labelCls + ' mb-0'}>Show CTA Button</label>
          <button
            onClick={() => u({ ctaVisible: !block.ctaVisible })}
            className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${block.ctaVisible ? 'bg-[#caa24c]' : 'bg-zinc-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${block.ctaVisible ? 'translate-x-4' : ''}`} />
          </button>
        </div>
        {block.ctaVisible && (
          <>
            <Field label="CTA Label">
              <input className={inputCls} value={block.ctaLabel} onChange={(e) => u({ ctaLabel: e.target.value })} />
            </Field>
            <Field label="CTA URL">
              <input className={inputCls} placeholder="https://..." value={block.ctaUrl} onChange={(e) => u({ ctaUrl: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Text Inspector ──────────────────────────────────────────────────────────
function TextInspector({ block, onChange }: { block: TextBlock; onChange: (b: TextBlock) => void }) {
  const u = (patch: Partial<TextBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <Field label="Content">
        <textarea className={textareaCls} rows={7} value={block.content} onChange={(e) => u({ content: e.target.value })} />
      </Field>
      <RowFields>
        <Field label="Font Size (px)">
          <input type="number" className={inputCls} min={10} max={60} value={block.fontSize} onChange={(e) => u({ fontSize: Number(e.target.value) })} />
        </Field>
        <Field label="Text Align">
          <select className={selectCls} value={block.textAlign} onChange={(e) => u({ textAlign: e.target.value as TextBlock['textAlign'] })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
      </RowFields>
      <Field label="Color">
        <div className="flex items-center gap-2">
          <input type="color" value={block.color} onChange={(e) => u({ color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input className={inputCls} value={block.color} onChange={(e) => u({ color: e.target.value })} />
        </div>
      </Field>
    </div>
  )
}

// ─── Image+Text Inspector ─────────────────────────────────────────────────────
function ImageTextInspector({ block, onChange }: { block: ImageTextBlock; onChange: (b: ImageTextBlock) => void }) {
  const u = (patch: Partial<ImageTextBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <Field label="Image URL">
        <input className={inputCls} placeholder="https://..." value={block.imageUrl} onChange={(e) => u({ imageUrl: e.target.value })} />
      </Field>
      <RowFields>
        <Field label="Image Alt">
          <input className={inputCls} value={block.imageAlt} onChange={(e) => u({ imageAlt: e.target.value })} />
        </Field>
        <Field label="Image Position">
          <select className={selectCls} value={block.imagePosition} onChange={(e) => u({ imagePosition: e.target.value as 'left' | 'right' })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </Field>
      </RowFields>
      <Field label="Headline">
        <input className={inputCls} value={block.headline} onChange={(e) => u({ headline: e.target.value })} />
      </Field>
      <Field label="Body">
        <textarea className={textareaCls} rows={4} value={block.body} onChange={(e) => u({ body: e.target.value })} />
      </Field>
      <RowFields>
        <Field label="CTA Label">
          <input className={inputCls} value={block.ctaLabel} onChange={(e) => u({ ctaLabel: e.target.value })} />
        </Field>
        <Field label="CTA URL">
          <input className={inputCls} placeholder="https://..." value={block.ctaUrl} onChange={(e) => u({ ctaUrl: e.target.value })} />
        </Field>
      </RowFields>
    </div>
  )
}

// ─── Button Inspector ─────────────────────────────────────────────────────────
function ButtonInspector({ block, onChange }: { block: ButtonBlock; onChange: (b: ButtonBlock) => void }) {
  const u = (patch: Partial<ButtonBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <Field label="Label">
        <input className={inputCls} value={block.label} onChange={(e) => u({ label: e.target.value })} />
      </Field>
      <Field label="URL">
        <input className={inputCls} placeholder="https://..." value={block.url} onChange={(e) => u({ url: e.target.value })} />
      </Field>
      <Field label="Alignment">
        <select className={selectCls} value={block.align} onChange={(e) => u({ align: e.target.value as ButtonBlock['align'] })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </Field>
      <RowFields>
        <Field label="Background Color">
          <div className="flex items-center gap-2">
            <input type="color" value={block.bgColor} onChange={(e) => u({ bgColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input className={inputCls} value={block.bgColor} onChange={(e) => u({ bgColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Text Color">
          <div className="flex items-center gap-2">
            <input type="color" value={block.textColor} onChange={(e) => u({ textColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input className={inputCls} value={block.textColor} onChange={(e) => u({ textColor: e.target.value })} />
          </div>
        </Field>
      </RowFields>
    </div>
  )
}

// ─── Two Column Inspector ─────────────────────────────────────────────────────
function TwoColumnInspector({ block, onChange }: { block: TwoColumnBlock; onChange: (b: TwoColumnBlock) => void }) {
  const u = (patch: Partial<TwoColumnBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <div className="border border-zinc-800/60 rounded-lg p-3 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Left Column</p>
        <Field label="Headline">
          <input className={inputCls} value={block.leftHeadline} onChange={(e) => u({ leftHeadline: e.target.value })} />
        </Field>
        <Field label="Body">
          <textarea className={textareaCls} rows={3} value={block.leftBody} onChange={(e) => u({ leftBody: e.target.value })} />
        </Field>
      </div>
      <div className="border border-zinc-800/60 rounded-lg p-3 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Right Column</p>
        <Field label="Headline">
          <input className={inputCls} value={block.rightHeadline} onChange={(e) => u({ rightHeadline: e.target.value })} />
        </Field>
        <Field label="Body">
          <textarea className={textareaCls} rows={3} value={block.rightBody} onChange={(e) => u({ rightBody: e.target.value })} />
        </Field>
      </div>
    </div>
  )
}

// ─── Divider Inspector ────────────────────────────────────────────────────────
function DividerInspector({ block, onChange }: { block: DividerBlock; onChange: (b: DividerBlock) => void }) {
  const u = (patch: Partial<DividerBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <RowFields>
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input type="color" value={block.color} onChange={(e) => u({ color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
            <input className={inputCls} value={block.color} onChange={(e) => u({ color: e.target.value })} />
          </div>
        </Field>
        <Field label="Thickness (px)">
          <input type="number" className={inputCls} min={1} max={8} value={block.thickness} onChange={(e) => u({ thickness: Number(e.target.value) })} />
        </Field>
      </RowFields>
      <Field label="Style">
        <select className={selectCls} value={block.style} onChange={(e) => u({ style: e.target.value as DividerBlock['style'] })}>
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </Field>
    </div>
  )
}

// ─── Spacer Inspector ─────────────────────────────────────────────────────────
function SpacerInspector({ block, onChange }: { block: SpacerBlock; onChange: (b: SpacerBlock) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Height (px)">
        <input type="number" className={inputCls} min={8} max={120} value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) })} />
        <input type="range" min={8} max={120} step={4} value={block.height} onChange={(e) => onChange({ ...block, height: Number(e.target.value) })} className="w-full accent-[#caa24c] mt-2" />
      </Field>
    </div>
  )
}

// ─── Footer Inspector ─────────────────────────────────────────────────────────
function FooterInspector({ block, onChange }: { block: FooterBlock; onChange: (b: FooterBlock) => void }) {
  const u = (patch: Partial<FooterBlock>) => onChange({ ...block, ...patch })
  return (
    <div className="space-y-4">
      <Field label="Company Name">
        <input className={inputCls} value={block.companyName} onChange={(e) => u({ companyName: e.target.value })} />
      </Field>
      <Field label="Address">
        <input className={inputCls} value={block.address} onChange={(e) => u({ address: e.target.value })} />
      </Field>
      <RowFields>
        <Field label="Phone">
          <input className={inputCls} value={block.phone} onChange={(e) => u({ phone: e.target.value })} />
        </Field>
        <Field label="Website">
          <input className={inputCls} value={block.website} onChange={(e) => u({ website: e.target.value })} />
        </Field>
      </RowFields>
      <Field label="Unsubscribe URL">
        <input className={inputCls} placeholder="#unsubscribe" value={block.unsubscribeUrl} onChange={(e) => u({ unsubscribeUrl: e.target.value })} />
      </Field>
      <div className="flex items-center gap-3">
        <label className={labelCls + ' mb-0'}>Show Social Links</label>
        <button
          onClick={() => u({ showSocial: !block.showSocial })}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${block.showSocial ? 'bg-[#caa24c]' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${block.showSocial ? 'translate-x-4' : ''}`} />
        </button>
      </div>
      {block.showSocial && (
        <RowFields>
          <Field label="Instagram URL">
            <input className={inputCls} placeholder="https://instagram.com/..." value={block.instagramUrl} onChange={(e) => u({ instagramUrl: e.target.value })} />
          </Field>
          <Field label="Facebook URL">
            <input className={inputCls} placeholder="https://facebook.com/..." value={block.facebookUrl} onChange={(e) => u({ facebookUrl: e.target.value })} />
          </Field>
        </RowFields>
      )}
    </div>
  )
}

// ─── Main Inspector ───────────────────────────────────────────────────────────
export function BlockInspector({ block, onChange }: InspectorProps) {
  const titles: Record<string, string> = {
    hero: '🖼️ Hero Block',
    text: '📝 Text Block',
    image_text: '🖼️ Image + Text',
    button: '🔘 Button',
    two_column: '⬛ Two Columns',
    divider: '➖ Divider',
    spacer: '↕️ Spacer',
    footer: '📌 Footer',
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-zinc-800/60 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Inspector</p>
        <h3 className="text-sm font-bold text-white/90 mt-1">{titles[block.type] ?? 'Block'}</h3>
      </div>
      <div className="flex-1 overflow-y-auto portal-scrollbar px-5 py-5">
        {block.type === 'hero'        && <HeroInspector block={block} onChange={onChange as (b: HeroBlock) => void} />}
        {block.type === 'text'        && <TextInspector block={block} onChange={onChange as (b: TextBlock) => void} />}
        {block.type === 'image_text'  && <ImageTextInspector block={block} onChange={onChange as (b: ImageTextBlock) => void} />}
        {block.type === 'button'      && <ButtonInspector block={block} onChange={onChange as (b: ButtonBlock) => void} />}
        {block.type === 'two_column'  && <TwoColumnInspector block={block} onChange={onChange as (b: TwoColumnBlock) => void} />}
        {block.type === 'divider'     && <DividerInspector block={block} onChange={onChange as (b: DividerBlock) => void} />}
        {block.type === 'spacer'      && <SpacerInspector block={block} onChange={onChange as (b: SpacerBlock) => void} />}
        {block.type === 'footer'      && <FooterInspector block={block} onChange={onChange as (b: FooterBlock) => void} />}
      </div>
    </div>
  )
}
