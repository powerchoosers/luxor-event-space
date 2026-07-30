'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Armchair, Ban, CircleDot, Copy, Grid2X2, LampDesk, Minus, MousePointer2,
  PanelTop, Plus, RectangleHorizontal, Redo2, RotateCcw, Save, Sofa, Trash2,
  Undo2, Users, X, ZoomIn, ZoomOut,
} from 'lucide-react'

export type LayoutItemKind = 'round-table' | 'rectangle-table' | 'cocktail-table' | 'chair' | 'sofa' | 'stage' | 'dj-booth' | 'dance-floor' | 'bar' | 'backdrop' | 'vip-area' | 'florals'

export type LayoutItem = {
  id: string
  kind: LayoutItemKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  label: string
  seats: number
  color?: string
}

export type EventLayoutDocument = {
  version: 1
  name: string
  items: LayoutItem[]
  updatedAt?: string
}

type Props = {
  open: boolean
  onClose: () => void
  initialLayout?: EventLayoutDocument | null
  leadName: string
  eventType?: string | null
  eventDate?: string | null
  guestCount?: number | null
  onSave: (layout: EventLayoutDocument) => Promise<boolean>
}

const CATALOG: Array<{ kind: LayoutItemKind; label: string; group: string; icon: typeof CircleDot; width: number; height: number; seats?: number }> = [
  { kind: 'round-table', label: 'Round table', group: 'Tables', icon: CircleDot, width: 14, height: 14, seats: 8 },
  { kind: 'rectangle-table', label: 'Rectangle table', group: 'Tables', icon: RectangleHorizontal, width: 19, height: 9, seats: 8 },
  { kind: 'cocktail-table', label: 'Cocktail table', group: 'Tables', icon: LampDesk, width: 9, height: 9, seats: 4 },
  { kind: 'chair', label: 'Chair', group: 'Seating', icon: Armchair, width: 7, height: 7, seats: 1 },
  { kind: 'sofa', label: 'Sofa / lounge', group: 'Seating', icon: Sofa, width: 18, height: 8, seats: 3 },
  { kind: 'stage', label: 'Stage', group: 'Features', icon: PanelTop, width: 24, height: 12 },
  { kind: 'dj-booth', label: 'DJ booth', group: 'Features', icon: RectangleHorizontal, width: 15, height: 8 },
  { kind: 'dance-floor', label: 'Dance floor', group: 'Features', icon: Grid2X2, width: 34, height: 30 },
  { kind: 'bar', label: 'Bar', group: 'Features', icon: RectangleHorizontal, width: 22, height: 8 },
  { kind: 'backdrop', label: 'Backdrop', group: 'Features', icon: PanelTop, width: 22, height: 5 },
  { kind: 'vip-area', label: 'VIP area', group: 'Décor & more', icon: Users, width: 22, height: 16 },
  { kind: 'florals', label: 'Florals / décor', group: 'Décor & more', icon: CircleDot, width: 8, height: 8 },
]

const TABLE_COLORS = ['#f5ead8', '#d9be8b', '#2b2926', '#314536', '#24354d', '#743f3d']

function uid() {
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeItem(kind: LayoutItemKind, x = 42, y = 44, index = 0): LayoutItem {
  const entry = CATALOG.find((item) => item.kind === kind)!
  return { id: uid(), kind, x, y, width: entry.width, height: entry.height, rotation: 0, label: entry.kind.includes('table') ? `Table ${index + 1}` : entry.label, seats: entry.seats || 0, color: kind.includes('table') ? TABLE_COLORS[0] : undefined }
}

function banquetTemplate(): LayoutItem[] {
  const tables = Array.from({ length: 8 }, (_, index) => makeItem('round-table', 27 + (index % 3) * 22, 19 + Math.floor(index / 3) * 22, index))
  return [
    ...tables,
    { ...makeItem('bar'), x: 70, y: 6 },
    { ...makeItem('dance-floor'), x: 35, y: 62 },
    { ...makeItem('stage'), x: 72, y: 65 },
    { ...makeItem('vip-area'), x: 4, y: 77 },
    { ...makeItem('sofa'), x: 48, y: 88 },
  ]
}

function templateFor(name: string): LayoutItem[] {
  if (name === 'Classic banquet') return banquetTemplate()
  if (name === 'Ceremony + reception') {
    const chairs = Array.from({ length: 24 }, (_, i) => makeItem('chair', 18 + (i % 6) * 11, 18 + Math.floor(i / 6) * 11, i))
    return [...chairs, { ...makeItem('backdrop'), x: 36, y: 7 }, { ...makeItem('dance-floor'), x: 34, y: 67 }]
  }
  if (name === 'Cocktail hour') return [...Array.from({ length: 10 }, (_, i) => makeItem('cocktail-table', 12 + (i % 5) * 17, 18 + Math.floor(i / 5) * 28, i)), { ...makeItem('bar'), x: 39, y: 78 }]
  return [...Array.from({ length: 6 }, (_, i) => makeItem('rectangle-table', 15 + (i % 2) * 40, 17 + Math.floor(i / 2) * 24, i)), { ...makeItem('stage'), x: 38, y: 82 }]
}

export function EventLayoutDesigner({ open, onClose, initialLayout, leadName, eventType, eventDate, guestCount, onSave }: Props) {
  const [name, setName] = useState(initialLayout?.name || 'Classic Banquet Layout')
  const [items, setItems] = useState<LayoutItem[]>(() => initialLayout?.items?.length ? initialLayout.items : banquetTemplate())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<LayoutItem[][]>([])
  const [future, setFuture] = useState<LayoutItem[][]>([])
  const [zoom, setZoom] = useState(100)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(initialLayout?.updatedAt || null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  const selected = items.find((item) => item.id === selectedId) || null
  const capacity = items.reduce((sum, item) => sum + (item.seats || 0), 0)

  const commit = useCallback((next: LayoutItem[] | ((current: LayoutItem[]) => LayoutItem[])) => {
    setItems((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      setHistory((past) => [...past.slice(-30), current])
      setFuture([])
      return resolved
    })
  }, [])

  const addItem = (kind: LayoutItemKind) => {
    const offset = items.length % 6
    const item = makeItem(kind, 38 + offset * 2, 38 + offset * 2, items.filter((entry) => entry.kind.includes('table')).length)
    commit((current) => [...current, item])
    setSelectedId(item.id)
  }

  const updateSelected = (updates: Partial<LayoutItem>) => {
    if (!selectedId) return
    commit((current) => current.map((item) => item.id === selectedId ? { ...item, ...updates } : item))
  }

  const removeSelected = () => {
    if (!selectedId) return
    commit((current) => current.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }

  useEffect(() => {
    if (!open) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !(event.target instanceof HTMLInputElement)) removeSelected()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setFuture((next) => [items, ...next])
    setItems(previous)
    setHistory((past) => past.slice(0, -1))
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setHistory((past) => [...past, items])
    setItems(next)
    setFuture((rest) => rest.slice(1))
  }

  const startDrag = (event: React.PointerEvent, item: LayoutItem) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: item.id, dx: ((event.clientX - bounds.left) / bounds.width) * 100 - item.x, dy: ((event.clientY - bounds.top) / bounds.height) * 100 - item.y }
    setSelectedId(item.id)
  }

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!drag || !bounds) return
    const item = items.find((entry) => entry.id === drag.id)
    if (!item) return
    const x = Math.max(0, Math.min(100 - item.width, ((event.clientX - bounds.left) / bounds.width) * 100 - drag.dx))
    const y = Math.max(0, Math.min(100 - item.height, ((event.clientY - bounds.top) / bounds.height) * 100 - drag.dy))
    setItems((current) => current.map((entry) => entry.id === drag.id ? { ...entry, x, y } : entry))
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
  }

  const save = async () => {
    setSaving(true)
    const now = new Date().toISOString()
    const ok = await onSave({ version: 1, name: name.trim() || 'Event layout', items, updatedAt: now })
    setSaving(false)
    if (ok) setSavedAt(now)
  }

  const groups = useMemo(() => Array.from(new Set(CATALOG.map((item) => item.group))), [])
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[color:var(--portal-bg)] text-[color:var(--portal-text)]" role="dialog" aria-modal="true" aria-label="Event layout designer">
      <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-5 py-4 lg:px-7">
        <div className="min-w-0">
          <div className="flex items-center gap-3"><button type="button" onClick={onClose} className="rounded-lg p-2 text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]" aria-label="Close layout designer"><X size={18} /></button><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">Planning · {leadName}</p><h1 className="text-lg font-extrabold tracking-tight sm:text-xl">Event Layout Designer</h1><p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">Arrange the room, estimate seating, and save the plan with this lead.</p></div></div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={undo} disabled={!history.length} className="layout-action"><Undo2 size={14} /> Undo</button>
          <button type="button" onClick={redo} disabled={!future.length} className="layout-action"><Redo2 size={14} /> Redo</button>
          <button type="button" onClick={() => { if (confirm('Clear every item from this layout?')) commit([]) }} className="layout-action hidden sm:inline-flex"><Trash2 size={14} /> Clear</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#b9872f] px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white hover:bg-[#caa24c] disabled:opacity-50"><Save size={14} /> {saving ? 'Saving…' : 'Save layout'}</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[230px_minmax(440px,1fr)_270px]">
        <aside className="hidden overflow-y-auto border-r border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:block">
          <p className="mb-4 text-[9px] font-black uppercase tracking-[0.2em] text-[color:var(--portal-muted)]">Add to floor plan</p>
          {groups.map((group) => <div key={group} className="mb-5"><p className="mb-2 text-[10px] font-bold">{group}</p><div className="grid grid-cols-2 gap-2">{CATALOG.filter((item) => item.group === group).map((item) => { const Icon = item.icon; return <button key={item.kind} type="button" onClick={() => addItem(item.kind)} className="group flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-2 text-center hover:border-[#caa24c]/55 hover:bg-[#caa24c]/8"><Icon size={23} strokeWidth={1.4} className="text-[color:var(--portal-muted)] group-hover:text-[#b9872f]"/><span className="text-[9px] font-bold">{item.label}</span></button> })}</div></div>)}
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden bg-[color:var(--portal-soft)]">
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-2">
            <div className="flex gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1"><span className="rounded-md bg-[#b9872f] px-4 py-2 text-[9px] font-black uppercase tracking-wider text-white">2D layout</span><span className="px-4 py-2 text-[9px] font-black uppercase tracking-wider text-[color:var(--portal-faint)]" title="A realistic 3D renderer is a later phase">3D preview</span></div>
            <div className="flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} className="layout-icon" aria-label="Zoom out"><ZoomOut size={15}/></button><span className="w-12 text-center text-[10px] font-bold">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(130, value + 10))} className="layout-icon" aria-label="Zoom in"><ZoomIn size={15}/></button></div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto flex min-h-full max-w-[900px] items-center justify-center">
              <div className="relative aspect-[4/3] w-full origin-center border-2 border-[color:var(--portal-text)] bg-[color:var(--portal-card)] shadow-xl transition-transform" style={{ transform: `scale(${zoom / 100})`, backgroundImage: 'linear-gradient(var(--portal-border) 1px, transparent 1px), linear-gradient(90deg, var(--portal-border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} ref={canvasRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
                <div className="pointer-events-none absolute inset-x-[36%] top-[-2px] h-3 border-x-2 border-[color:var(--portal-text)] bg-[color:var(--portal-card)]"/><div className="pointer-events-none absolute inset-x-[41%] bottom-[-2px] h-3 border-x-2 border-[color:var(--portal-text)] bg-[color:var(--portal-card)]"/>
                {items.map((item) => <CanvasItem key={item.id} item={item} selected={selectedId === item.id} onPointerDown={(event) => startDrag(event, item)} />)}
                {!items.length && <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><Ban size={28} className="text-[color:var(--portal-faint)]"/><p className="mt-3 text-sm font-bold">The floor plan is empty</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Add items from the toolbox or choose a quick template.</p></div>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 lg:hidden">{CATALOG.map((item) => { const Icon = item.icon; return <button key={item.kind} type="button" onClick={() => addItem(item.kind)} className="flex shrink-0 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[9px] font-bold"><Icon size={14}/>{item.label}</button> })}</div>
        </main>

        <aside className="hidden overflow-y-auto border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] lg:block">
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Layout details</p><label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Layout name<input value={name} onChange={(event) => setName(event.target.value)} className="planning-editor-input mt-2"/></label>{savedAt && <p className="mt-2 text-[9px] text-[color:var(--portal-faint)]">Last saved {new Date(savedAt).toLocaleString()}</p>}</section>
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Capacity estimate</p><div className="mt-4 flex items-center justify-between"><div><p className="flex items-center gap-2 text-sm font-black"><Users size={16}/>{capacity} seats</p><p className="mt-1 text-[9px] text-[color:var(--portal-muted)]">{guestCount ? `${guestCount} guests expected` : 'No guest count recorded'}</p></div><div className={`flex h-14 w-14 items-center justify-center rounded-full border-[5px] ${guestCount && capacity < guestCount ? 'border-red-400 text-red-500' : 'border-[#caa24c] text-[#a8792f]'}`}><span className="text-[10px] font-black">{guestCount ? Math.round((capacity / guestCount) * 100) : 0}%</span></div></div></section>
          {selected ? <Inspector item={selected} onUpdate={updateSelected} onDelete={removeSelected} onDuplicate={() => { const clone = { ...selected, id: uid(), x: Math.min(selected.x + 3, 100 - selected.width), y: Math.min(selected.y + 3, 100 - selected.height), label: `${selected.label} copy` }; commit((current) => [...current, clone]); setSelectedId(clone.id) }}/>: <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Customize item</p><p className="mt-3 text-[10px] leading-5 text-[color:var(--portal-muted)]">Select an item on the floor plan to change its name, size, color, seats, or rotation.</p></section>}
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Quick templates</p><div className="mt-3 space-y-2">{['Classic banquet','Ceremony + reception','Cocktail hour','Conference / meeting'].map((template) => <button key={template} type="button" onClick={() => { if (!items.length || confirm('Replace the current floor plan with this template?')) { commit(templateFor(template)); setName(`${template} layout`); setSelectedId(null) } }} className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-left text-[10px] font-bold hover:border-[#caa24c]/50">{template}</button>)}</div></section>
          <section className="p-5"><p className="layout-kicker">Event info</p><dl className="mt-4 space-y-3 text-[10px]"><Info label="Client" value={leadName}/><Info label="Event" value={eventType || 'Not selected'}/><Info label="Date" value={eventDate ? new Date(`${eventDate}T12:00:00`).toLocaleDateString() : 'Not scheduled'}/><Info label="Guests" value={guestCount ? String(guestCount) : 'Not recorded'}/></dl></section>
        </aside>
      </div>
    </div>
  )
}

function CanvasItem({ item, selected, onPointerDown }: { item: LayoutItem; selected: boolean; onPointerDown: (event: React.PointerEvent) => void }) {
  const table = item.kind.includes('table')
  const round = item.kind === 'round-table' || item.kind === 'cocktail-table' || item.kind === 'florals'
  return <button type="button" onPointerDown={onPointerDown} className={`absolute flex touch-none select-none items-center justify-center border text-center shadow-sm transition-[box-shadow] ${round ? 'rounded-full' : 'rounded-sm'} ${selected ? 'z-20 border-[#caa24c] ring-2 ring-[#caa24c]/35' : 'border-[#90744d]/65 hover:border-[#caa24c]'}`} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.width}%`, height: `${item.height}%`, transform: `rotate(${item.rotation}deg)`, backgroundColor: item.color || (item.kind === 'dance-floor' ? '#ead9c1' : item.kind === 'stage' || item.kind === 'bar' ? '#ded1bd' : 'var(--portal-card)') }} aria-label={`Select ${item.label}`}>
    {table && <span className="absolute inset-[-13%] rounded-[inherit] border border-dashed border-[#8b7555]/45"/>}<span className="relative truncate px-1 text-[clamp(6px,0.65vw,10px)] font-black uppercase tracking-tight text-[#342c23] dark:text-[#f1e8d9]">{item.label}</span>
  </button>
}

function Inspector({ item, onUpdate, onDelete, onDuplicate }: { item: LayoutItem; onUpdate: (updates: Partial<LayoutItem>) => void; onDelete: () => void; onDuplicate: () => void }) {
  return <section className="border-b border-[color:var(--portal-border)] p-5"><div className="flex items-center justify-between"><p className="layout-kicker">Customize {item.label}</p><div className="flex gap-1"><button type="button" onClick={onDuplicate} className="layout-icon" aria-label="Duplicate item"><Copy size={13}/></button><button type="button" onClick={onDelete} className="layout-icon hover:text-red-500" aria-label="Delete item"><Trash2 size={13}/></button></div></div>
    <label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Name<input value={item.label} onChange={(event) => onUpdate({ label: event.target.value })} className="planning-editor-input mt-2"/></label>
    {item.seats > 0 && <label className="mt-3 block text-[9px] font-bold text-[color:var(--portal-muted)]">Seats<input type="number" min="0" max="24" value={item.seats} onChange={(event) => onUpdate({ seats: Number(event.target.value) })} className="planning-editor-input mt-2"/></label>}
    {item.kind.includes('table') && <div className="mt-4"><p className="text-[9px] font-bold text-[color:var(--portal-muted)]">Table color</p><div className="mt-2 flex gap-2">{TABLE_COLORS.map((color) => <button key={color} type="button" onClick={() => onUpdate({ color })} className={`h-7 w-7 rounded-md border ${item.color === color ? 'ring-2 ring-[#caa24c] ring-offset-2 ring-offset-[color:var(--portal-card)]' : 'border-[color:var(--portal-border)]'}`} style={{ backgroundColor: color }} aria-label={`Use ${color}`}/>)}</div></div>}
    <div className="mt-4 grid grid-cols-2 gap-3"><Range label="Width" value={item.width} min={5} max={50} onChange={(width) => onUpdate({ width })}/><Range label="Height" value={item.height} min={5} max={50} onChange={(height) => onUpdate({ height })}/></div>
    <label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Rotation · {item.rotation}°<input type="range" min="0" max="345" step="15" value={item.rotation} onChange={(event) => onUpdate({ rotation: Number(event.target.value) })} className="mt-2 w-full accent-[#caa24c]"/></label>
  </section>
}

function Range({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">{label}<input type="number" min={min} max={max} value={Math.round(value)} onChange={(event) => onChange(Number(event.target.value))} className="planning-editor-input mt-2"/></label> }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="font-bold text-[color:var(--portal-muted)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div> }
