'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Armchair, Ban, CircleDot, Copy, Grid2X2, LampDesk,
  PanelTop, RectangleHorizontal, Redo2, Save, Sofa, Trash2,
  Undo2, Users, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { EventLayout3D } from './EventLayout3D'

export type LayoutItemKind = 'round-table' | 'rectangle-table' | 'cocktail-table' | 'chair' | 'throne-chair' | 'sofa' | 'stage' | 'dj-booth' | 'dance-floor' | 'bar' | 'backdrop' | 'balloon-arch' | 'pipe-drape' | 'stanchions' | 'vip-area' | 'florals'

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
  roomWidthFeet?: number
  roomHeightFeet?: number
  secondaryRoomWidthFeet?: number
  secondaryRoomDepthFeet?: number
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
  { kind: 'round-table', label: '60 in round table', group: 'Tables', icon: CircleDot, width: 5, height: 5, seats: 8 },
  { kind: 'rectangle-table', label: '72 × 27 in table', group: 'Tables', icon: RectangleHorizontal, width: 6, height: 2.25, seats: 8 },
  { kind: 'cocktail-table', label: 'Cocktail table', group: 'Tables', icon: LampDesk, width: 3, height: 3, seats: 4 },
  { kind: 'chair', label: 'Regular chair', group: 'Seating', icon: Armchair, width: 2, height: 2, seats: 1 },
  { kind: 'throne-chair', label: 'Throne chair', group: 'Seating', icon: Armchair, width: 3.5, height: 3.5, seats: 1 },
  { kind: 'sofa', label: 'Couch', group: 'Seating', icon: Sofa, width: 8, height: 3, seats: 3 },
  { kind: 'stage', label: 'Stage', group: 'Features', icon: PanelTop, width: 16, height: 8 },
  { kind: 'dj-booth', label: 'DJ booth', group: 'Features', icon: RectangleHorizontal, width: 6, height: 3 },
  { kind: 'dance-floor', label: 'Dance floor', group: 'Features', icon: Grid2X2, width: 16, height: 16 },
  { kind: 'bar', label: 'Bar', group: 'Features', icon: RectangleHorizontal, width: 8, height: 3 },
  { kind: 'backdrop', label: '10 ft pipe & drape', group: 'Features', icon: PanelTop, width: 10, height: 1 },
  { kind: 'balloon-arch', label: 'Balloon arch', group: 'Décor & more', icon: PanelTop, width: 8, height: 3 },
  { kind: 'pipe-drape', label: 'Pipe & drape backdrop', group: 'Décor & more', icon: PanelTop, width: 10, height: 1 },
  { kind: 'stanchions', label: 'Stanchions & rope', group: 'Décor & more', icon: Ban, width: 6, height: 2 },
  { kind: 'vip-area', label: 'VIP area', group: 'Décor & more', icon: Users, width: 12, height: 8 },
  { kind: 'florals', label: 'Decor', group: 'Décor & more', icon: CircleDot, width: 2, height: 2 },
]

const TABLE_COLORS = ['#252321', '#f5ead8', '#d9be8b', '#314536', '#24354d', '#743f3d']
const PLACEMENT_GRID_FEET = 0.5
const ITEM_CLEARANCE_FEET = 0.35

type LayoutDimensions = {
  roomWidthFeet: number
  mainRoomDepthFeet: number
  secondaryRoomWidthFeet: number
  secondaryRoomDepthFeet: number
}

type ItemBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

const DEFAULT_LAYOUT_DIMENSIONS: LayoutDimensions = {
  roomWidthFeet: 33,
  mainRoomDepthFeet: 75,
  secondaryRoomWidthFeet: 20.83,
  secondaryRoomDepthFeet: 21.58,
}

function planDepthFeet(dimensions: LayoutDimensions) {
  return dimensions.mainRoomDepthFeet + dimensions.secondaryRoomDepthFeet
}

function itemBounds(item: LayoutItem, dimensions: LayoutDimensions): ItemBounds {
  const radians = (item.rotation * Math.PI) / 180
  const visualWidth = Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height
  const visualHeight = Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height
  const centerX = (item.x / 100) * dimensions.roomWidthFeet + item.width / 2
  const centerY = (item.y / 100) * planDepthFeet(dimensions) + item.height / 2
  return {
    left: centerX - visualWidth / 2,
    top: centerY - visualHeight / 2,
    right: centerX + visualWidth / 2,
    bottom: centerY + visualHeight / 2,
  }
}

function itemFitsVenue(item: LayoutItem, dimensions: LayoutDimensions) {
  const bounds = itemBounds(item, dimensions)
  const depth = planDepthFeet(dimensions)
  const lowerRoomLeft = (dimensions.roomWidthFeet - dimensions.secondaryRoomWidthFeet) / 2
  const lowerRoomRight = lowerRoomLeft + dimensions.secondaryRoomWidthFeet
  const epsilon = 0.01

  if (
    bounds.left < -epsilon ||
    bounds.right > dimensions.roomWidthFeet + epsilon ||
    bounds.top < -epsilon ||
    bounds.bottom > depth + epsilon
  ) {
    return false
  }

  if (bounds.bottom <= dimensions.mainRoomDepthFeet + epsilon) return true

  return bounds.left >= lowerRoomLeft - epsilon && bounds.right <= lowerRoomRight + epsilon
}

function itemsOverlap(first: LayoutItem, second: LayoutItem, dimensions: LayoutDimensions) {
  const a = itemBounds(first, dimensions)
  const b = itemBounds(second, dimensions)
  return (
    a.left < b.right + ITEM_CLEARANCE_FEET &&
    a.right + ITEM_CLEARANCE_FEET > b.left &&
    a.top < b.bottom + ITEM_CLEARANCE_FEET &&
    a.bottom + ITEM_CLEARANCE_FEET > b.top
  )
}

function placementIsClear(item: LayoutItem, placedItems: LayoutItem[], dimensions: LayoutDimensions) {
  return itemFitsVenue(item, dimensions) && !placedItems.some((other) => other.id !== item.id && itemsOverlap(item, other, dimensions))
}

function withPositionInFeet(item: LayoutItem, x: number, y: number, dimensions: LayoutDimensions): LayoutItem {
  return {
    ...item,
    x: (x / dimensions.roomWidthFeet) * 100,
    y: (y / planDepthFeet(dimensions)) * 100,
  }
}

function findOpenPlacement(item: LayoutItem, placedItems: LayoutItem[], dimensions: LayoutDimensions): LayoutItem | null {
  if (placementIsClear(item, placedItems, dimensions)) return item

  const preferredX = (item.x / 100) * dimensions.roomWidthFeet
  const preferredY = (item.y / 100) * planDepthFeet(dimensions)
  const candidates: Array<{ item: LayoutItem; distance: number }> = []
  const depth = planDepthFeet(dimensions)

  for (let y = 0; y <= depth; y += PLACEMENT_GRID_FEET) {
    for (let x = 0; x <= dimensions.roomWidthFeet; x += PLACEMENT_GRID_FEET) {
      const candidate = withPositionInFeet(item, x, y, dimensions)
      if (!itemFitsVenue(candidate, dimensions)) continue
      candidates.push({
        item: candidate,
        distance: (x - preferredX) ** 2 + (y - preferredY) ** 2,
      })
    }
  }

  candidates.sort((first, second) => first.distance - second.distance)
  return candidates.find((candidate) => placementIsClear(candidate.item, placedItems, dimensions))?.item || null
}

function resolveLayoutConflicts(items: LayoutItem[], dimensions: LayoutDimensions) {
  const placed: LayoutItem[] = []
  for (const item of items) {
    const placement = findOpenPlacement(item, placed, dimensions)
    placed.push(placement || item)
  }
  return placed
}

function layoutHasPlacementIssues(items: LayoutItem[], dimensions: LayoutDimensions) {
  return items.some((item, index) => !placementIsClear(item, items.slice(0, index), dimensions))
}

function uid() {
  return `layout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeItem(kind: LayoutItemKind, x = 42, y = 44, index = 0): LayoutItem {
  const entry = CATALOG.find((item) => item.kind === kind)!
  return { id: uid(), kind, x, y, width: entry.width, height: entry.height, rotation: 0, label: entry.kind.includes('table') ? `${entry.label} ${index + 1}` : entry.label, seats: entry.seats || 0, color: kind.includes('table') ? TABLE_COLORS[0] : undefined }
}

function banquetTemplate(dimensions = DEFAULT_LAYOUT_DIMENSIONS): LayoutItem[] {
  const position = (item: LayoutItem, x: number, y: number) => withPositionInFeet(item, x, y, dimensions)
  const tablePositions = [
    [1, 10], [27, 10],
    [1, 25], [27, 25],
    [1, 40], [27, 40],
    [1, 55], [27, 55],
  ]
  const tables = tablePositions.map(([x, y], index) => position(makeItem('round-table', 0, 0, index), x, y))
  return [
    ...tables,
    position(makeItem('bar'), 12.5, 4),
    position(makeItem('dance-floor'), 8.5, 29.5),
    position(makeItem('stage'), 8.5, 63),
    position(makeItem('vip-area'), 10, 77),
    position(makeItem('sofa'), 12.5, 90),
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
  const [roomWidthFeet, setRoomWidthFeet] = useState(initialLayout?.roomWidthFeet || 33)
  const [roomHeightFeet, setRoomHeightFeet] = useState(initialLayout?.roomHeightFeet || 75)
  const [secondaryRoomWidthFeet, setSecondaryRoomWidthFeet] = useState(initialLayout?.secondaryRoomWidthFeet || 20.83)
  const [secondaryRoomDepthFeet, setSecondaryRoomDepthFeet] = useState(initialLayout?.secondaryRoomDepthFeet || 21.58)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<LayoutItem[][]>([])
  const [future, setFuture] = useState<LayoutItem[][]>([])
  const [zoom, setZoom] = useState(100)
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(initialLayout?.updatedAt || null)
  const [placementMessage, setPlacementMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  const selected = items.find((item) => item.id === selectedId) || null
  const capacity = items.reduce((sum, item) => sum + (item.seats || 0), 0)
  const planDepthFeet = roomHeightFeet + secondaryRoomDepthFeet
  const layoutDimensions = useMemo<LayoutDimensions>(() => ({
    roomWidthFeet,
    mainRoomDepthFeet: roomHeightFeet,
    secondaryRoomWidthFeet,
    secondaryRoomDepthFeet,
  }), [roomHeightFeet, roomWidthFeet, secondaryRoomDepthFeet, secondaryRoomWidthFeet])
  const hasPlacementIssues = useMemo(
    () => layoutHasPlacementIssues(items, layoutDimensions),
    [items, layoutDimensions],
  )

  const commit = useCallback((next: LayoutItem[] | ((current: LayoutItem[]) => LayoutItem[])) => {
    setItems((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      setHistory((past) => [...past.slice(-30), current])
      setFuture([])
      return resolved
    })
  }, [])

  const resolveOverlaps = () => {
    const resolved = resolveLayoutConflicts(items, layoutDimensions)
    commit(resolved)
    setSelectedId(null)
    setPlacementMessage(
      layoutHasPlacementIssues(resolved, layoutDimensions)
        ? 'Some items still need more room. Remove an item or enlarge the floor plan, then try again.'
        : 'Items were moved into clear space.',
    )
  }

  const addItem = (kind: LayoutItemKind) => {
    const item = makeItem(kind, 42, 44, items.filter((entry) => entry.kind.includes('table')).length)
    const placement = findOpenPlacement(item, items, layoutDimensions)
    if (!placement) {
      setPlacementMessage('There is not enough clear space for that item. Move or remove an item first.')
      return
    }
    commit([...items, placement])
    setSelectedId(placement.id)
    setPlacementMessage(null)
  }

  const updateSelected = (updates: Partial<LayoutItem>) => {
    if (!selectedId || !selected) return
    const placement = findOpenPlacement({ ...selected, ...updates }, items.filter((item) => item.id !== selectedId), layoutDimensions)
    if (!placement) {
      setPlacementMessage('That change would overlap another item or leave the room. Try a smaller size or a different position.')
      return
    }
    commit(items.map((item) => item.id === selectedId ? placement : item))
    setPlacementMessage(null)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const clone = findOpenPlacement(
      { ...selected, id: uid(), label: `${selected.label} copy`, x: selected.x + 3, y: selected.y + 3 },
      items,
      layoutDimensions,
    )
    if (!clone) {
      setPlacementMessage('There is not enough clear space to duplicate this item.')
      return
    }
    commit([...items, clone])
    setSelectedId(clone.id)
    setPlacementMessage(null)
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
    const snapX = 100 / Math.max(1, roomWidthFeet * 2)
    const itemWidthPercent = (item.width / roomWidthFeet) * 100
    const itemHeightPercent = (item.height / planDepthFeet) * 100
    const snapY = 100 / Math.max(1, planDepthFeet * 2)
    const x = Math.max(0, Math.min(100 - itemWidthPercent, Math.round((((event.clientX - bounds.left) / bounds.width) * 100 - drag.dx) / snapX) * snapX))
    const y = Math.max(0, Math.min(100 - itemHeightPercent, Math.round((((event.clientY - bounds.top) / bounds.height) * 100 - drag.dy) / snapY) * snapY))
    const candidate = { ...item, x, y }
    if (!placementIsClear(candidate, items.filter((entry) => entry.id !== drag.id), layoutDimensions)) {
      setPlacementMessage('Items cannot overlap. Move it into a clear part of the room.')
      return
    }
    setItems((current) => current.map((entry) => entry.id === drag.id ? candidate : entry))
    setPlacementMessage(null)
  }

  const endDrag = () => {
    if (!dragRef.current) return
    dragRef.current = null
  }

  const save = async () => {
    if (hasPlacementIssues) {
      setPlacementMessage('Resolve overlapping or out-of-room items before saving this layout.')
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    const ok = await onSave({ version: 1, name: name.trim() || 'Event layout', items, roomWidthFeet, roomHeightFeet, secondaryRoomWidthFeet, secondaryRoomDepthFeet, updatedAt: now })
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
          {hasPlacementIssues ? <button type="button" onClick={resolveOverlaps} className="layout-action">Resolve overlaps</button> : null}
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
            <div className="flex gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1"><button type="button" onClick={() => setViewMode('2d')} className={`rounded-md px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-colors ${viewMode === '2d' ? 'bg-[#b9872f] text-white' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>2D layout</button><button type="button" onClick={() => setViewMode('3d')} className={`rounded-md px-4 py-2 text-[9px] font-black uppercase tracking-wider transition-colors ${viewMode === '3d' ? 'bg-[#b9872f] text-white' : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'}`}>3D preview</button></div>
            {viewMode === '2d' ? <div className="flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(70, value - 10))} className="layout-icon" aria-label="Zoom out"><ZoomOut size={15}/></button><span className="w-12 text-center text-[10px] font-bold">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(130, value + 10))} className="layout-icon" aria-label="Zoom in"><ZoomIn size={15}/></button></div> : <p className="hidden text-[9px] font-bold text-[color:var(--portal-muted)] sm:block">Interactive room preview</p>}
          </div>
          {placementMessage ? <p role="status" className="border-b border-[#caa24c]/20 bg-[#caa24c]/8 px-4 py-2 text-[10px] font-semibold text-[#8b6525] dark:text-[#e7c97e]">{placementMessage}</p> : null}
          {viewMode === '3d' ? <div className="min-h-0 flex-1"><EventLayout3D items={items} selectedId={selectedId} onSelect={setSelectedId} roomWidthFeet={roomWidthFeet} roomDepthFeet={planDepthFeet} mainRoomDepthFeet={roomHeightFeet} secondaryRoomWidthFeet={secondaryRoomWidthFeet}/></div> : <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto flex min-h-full max-w-[900px] items-center justify-center">
              <div className="relative w-full origin-center border-2 border-[color:var(--portal-text)] bg-[color:var(--portal-card)] shadow-xl transition-transform" style={{ aspectRatio: `${roomWidthFeet}/${planDepthFeet}`, transform: `scale(${zoom / 100})`, backgroundImage: 'linear-gradient(var(--portal-border) 1px, transparent 1px), linear-gradient(90deg, var(--portal-border) 1px, transparent 1px)', backgroundSize: '24px 24px' }} ref={canvasRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
                <div className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-[color:var(--portal-text)]" style={{ height: `${(roomHeightFeet / planDepthFeet) * 100}%` }}><span className="absolute left-2 top-2 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Main room · {roomWidthFeet}′ × {roomHeightFeet}′</span></div>
                <div className="pointer-events-none absolute bottom-0 border-2 border-t-0 border-[color:var(--portal-text)] bg-[color:var(--portal-card)]" style={{ left: `${((roomWidthFeet - secondaryRoomWidthFeet) / roomWidthFeet) * 50}%`, width: `${(secondaryRoomWidthFeet / roomWidthFeet) * 100}%`, height: `${(secondaryRoomDepthFeet / planDepthFeet) * 100}%` }}><span className="absolute left-2 top-2 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">Lower room · {secondaryRoomWidthFeet}′ × {secondaryRoomDepthFeet}′</span></div>
                {items.map((item) => <CanvasItem key={item.id} item={item} roomWidthFeet={roomWidthFeet} planDepthFeet={planDepthFeet} selected={selectedId === item.id} onPointerDown={(event) => startDrag(event, item)} />)}
                {!items.length && <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><Ban size={28} className="text-[color:var(--portal-faint)]"/><p className="mt-3 text-sm font-bold">The floor plan is empty</p><p className="mt-1 text-[10px] text-[color:var(--portal-muted)]">Add items from the toolbox or choose a quick template.</p></div>}
              </div>
            </div>
          </div>}
          <div className="flex gap-2 overflow-x-auto border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-3 lg:hidden">{CATALOG.map((item) => { const Icon = item.icon; return <button key={item.kind} type="button" onClick={() => addItem(item.kind)} className="flex shrink-0 items-center gap-2 rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[9px] font-bold"><Icon size={14}/>{item.label}</button> })}</div>
        </main>

        <aside className="hidden overflow-y-auto border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] lg:block">
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Layout details</p><label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Layout name<input value={name} onChange={(event) => setName(event.target.value)} className="planning-editor-input mt-2"/></label><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[9px] font-bold text-[color:var(--portal-muted)]">Main width (ft)<input type="number" min="10" value={roomWidthFeet} onChange={(event) => setRoomWidthFeet(Math.max(10, Number(event.target.value) || 10))} className="planning-editor-input mt-2"/></label><label className="text-[9px] font-bold text-[color:var(--portal-muted)]">Main depth (ft)<input type="number" min="10" value={roomHeightFeet} onChange={(event) => setRoomHeightFeet(Math.max(10, Number(event.target.value) || 10))} className="planning-editor-input mt-2"/></label><label className="text-[9px] font-bold text-[color:var(--portal-muted)]">Lower width (ft)<input type="number" min="10" step="0.01" value={secondaryRoomWidthFeet} onChange={(event) => setSecondaryRoomWidthFeet(Math.max(10, Number(event.target.value) || 10))} className="planning-editor-input mt-2"/></label><label className="text-[9px] font-bold text-[color:var(--portal-muted)]">Lower depth (ft)<input type="number" min="10" step="0.01" value={secondaryRoomDepthFeet} onChange={(event) => setSecondaryRoomDepthFeet(Math.max(10, Number(event.target.value) || 10))} className="planning-editor-input mt-2"/></label></div><p className="mt-2 text-[9px] leading-4 text-[color:var(--portal-muted)]">Based on the supplied blueprint: 33′ × 75′ main room with a 20′10″ × 21′7″ lower room. Items snap to six-inch increments.</p>{savedAt && <p className="mt-2 text-[9px] text-[color:var(--portal-faint)]">Last saved {new Date(savedAt).toLocaleString()}</p>}</section>
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Capacity estimate</p><div className="mt-4 flex items-center justify-between"><div><p className="flex items-center gap-2 text-sm font-black"><Users size={16}/>{capacity} seats</p><p className="mt-1 text-[9px] text-[color:var(--portal-muted)]">{guestCount ? `${guestCount} guests expected` : 'No guest count recorded'}</p></div><div className={`flex h-14 w-14 items-center justify-center rounded-full border-[5px] ${guestCount && capacity < guestCount ? 'border-red-400 text-red-500' : 'border-[#caa24c] text-[#a8792f]'}`}><span className="text-[10px] font-black">{guestCount ? Math.round((capacity / guestCount) * 100) : 0}%</span></div></div></section>
          {selected ? <Inspector item={selected} roomWidthFeet={roomWidthFeet} roomHeightFeet={planDepthFeet} onUpdate={updateSelected} onDelete={removeSelected} onDuplicate={duplicateSelected}/>: <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Customize item</p><p className="mt-3 text-[10px] leading-5 text-[color:var(--portal-muted)]">Select an item on the floor plan to change its name, size, color, seats, or rotation.</p></section>}
          <section className="border-b border-[color:var(--portal-border)] p-5"><p className="layout-kicker">Quick templates</p><div className="mt-3 space-y-2">{['Classic banquet','Ceremony + reception','Cocktail hour','Conference / meeting'].map((template) => <button key={template} type="button" onClick={() => { if (!items.length || confirm('Replace the current floor plan with this template?')) { commit(resolveLayoutConflicts(templateFor(template), layoutDimensions)); setName(`${template} layout`); setSelectedId(null); setPlacementMessage(null) } }} className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-left text-[10px] font-bold hover:border-[#caa24c]/50">{template}</button>)}</div></section>
          <section className="p-5"><p className="layout-kicker">Event info</p><dl className="mt-4 space-y-3 text-[10px]"><Info label="Client" value={leadName}/><Info label="Event" value={eventType || 'Not selected'}/><Info label="Date" value={eventDate ? new Date(`${eventDate}T12:00:00`).toLocaleDateString() : 'Not scheduled'}/><Info label="Guests" value={guestCount ? String(guestCount) : 'Not recorded'}/></dl></section>
        </aside>
      </div>
    </div>
  )
}

function CanvasItem({ item, roomWidthFeet, planDepthFeet, selected, onPointerDown }: { item: LayoutItem; roomWidthFeet: number; planDepthFeet: number; selected: boolean; onPointerDown: (event: React.PointerEvent) => void }) {
  const table = item.kind.includes('table')
  const round = item.kind === 'round-table' || item.kind === 'cocktail-table' || item.kind === 'florals'
  return <button type="button" onPointerDown={onPointerDown} className={`absolute flex touch-none select-none items-center justify-center border text-center shadow-sm transition-[box-shadow] ${round ? 'rounded-full' : 'rounded-sm'} ${selected ? 'z-20 border-[#caa24c] ring-2 ring-[#caa24c]/35' : 'border-[#90744d]/65 hover:border-[#caa24c]'}`} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${(item.width / roomWidthFeet) * 100}%`, height: `${(item.height / planDepthFeet) * 100}%`, transform: `rotate(${item.rotation}deg)`, backgroundColor: item.color || (item.kind === 'dance-floor' ? '#ead9c1' : item.kind === 'stage' || item.kind === 'bar' ? '#ded1bd' : 'var(--portal-card)') }} aria-label={`Select ${item.label}`}>
    {table && <span className="absolute inset-[-13%] rounded-[inherit] border border-dashed border-[#8b7555]/45"/>}<span className="relative truncate px-1 text-[clamp(6px,0.65vw,10px)] font-black uppercase tracking-tight text-[#342c23] dark:text-[#f1e8d9]">{item.label}</span>
  </button>
}

function Inspector({ item, roomWidthFeet, roomHeightFeet, onUpdate, onDelete, onDuplicate }: { item: LayoutItem; roomWidthFeet: number; roomHeightFeet: number; onUpdate: (updates: Partial<LayoutItem>) => void; onDelete: () => void; onDuplicate: () => void }) {
  return <section className="border-b border-[color:var(--portal-border)] p-5"><div className="flex items-center justify-between"><p className="layout-kicker">Customize {item.label}</p><div className="flex gap-1"><button type="button" onClick={onDuplicate} className="layout-icon" aria-label="Duplicate item"><Copy size={13}/></button><button type="button" onClick={onDelete} className="layout-icon hover:text-red-500" aria-label="Delete item"><Trash2 size={13}/></button></div></div>
    <label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Name<input value={item.label} onChange={(event) => onUpdate({ label: event.target.value })} className="planning-editor-input mt-2"/></label>
    {item.seats > 0 && <label className="mt-3 block text-[9px] font-bold text-[color:var(--portal-muted)]">Seats<input type="number" min="0" max="24" value={item.seats} onChange={(event) => onUpdate({ seats: Number(event.target.value) })} className="planning-editor-input mt-2"/></label>}
    {item.kind.includes('table') && <div className="mt-4"><p className="text-[9px] font-bold text-[color:var(--portal-muted)]">Table color</p><div className="mt-2 flex gap-2">{TABLE_COLORS.map((color) => <button key={color} type="button" onClick={() => onUpdate({ color })} className={`h-7 w-7 rounded-md border ${item.color === color ? 'ring-2 ring-[#caa24c] ring-offset-2 ring-offset-[color:var(--portal-card)]' : 'border-[color:var(--portal-border)]'}`} style={{ backgroundColor: color }} aria-label={`Use ${color}`}/>)}</div></div>}
    <div className="mt-4 grid grid-cols-2 gap-3"><Range label="Width (ft)" value={item.width} min={0.5} max={roomWidthFeet} step={0.25} onChange={(feet) => onUpdate({ width: Math.min(roomWidthFeet, feet) })}/><Range label="Depth (ft)" value={item.height} min={0.5} max={roomHeightFeet} step={0.25} onChange={(feet) => onUpdate({ height: Math.min(roomHeightFeet, feet) })}/></div>
    <label className="mt-4 block text-[9px] font-bold text-[color:var(--portal-muted)]">Rotation · {item.rotation}°<input type="range" min="0" max="345" step="15" value={item.rotation} onChange={(event) => onUpdate({ rotation: Number(event.target.value) })} className="mt-2 w-full accent-[#caa24c]"/></label>
  </section>
}

function Range({ label, value, min, max, step = 0.25, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) { return <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">{label}<input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="planning-editor-input mt-2"/></label> }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="font-bold text-[color:var(--portal-muted)]">{label}</dt><dd className="text-right font-semibold">{value}</dd></div> }
