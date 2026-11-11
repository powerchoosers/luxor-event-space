'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Armchair, Ban, Calendar, Check, CircleDot, Copy, Eye,
  Grid2X2, LampDesk, Layers, LayoutGrid, Link2, Maximize2,
  Minimize2, Move, Palette, PanelTop, RectangleHorizontal,
  Redo2, RotateCw, Ruler, Save, SlidersHorizontal, Sofa,
  Sparkles, Trash2, Undo2, User, Users, X, ZoomIn, ZoomOut,
} from '@/lib/icons/phosphor-compat'
import { EventLayout3D } from './EventLayout3D'
import { PortalCloseButton } from '@/components/portal/PortalUI'

export type LayoutItemKind =
  | 'round-table'
  | 'rectangle-table'
  | 'cocktail-table'
  | 'chair'
  | 'throne-chair'
  | 'sofa'
  | 'stage'
  | 'dj-booth'
  | 'dance-floor'
  | 'bar'
  | 'backdrop'
  | 'balloon-arch'
  | 'pipe-drape'
  | 'stanchions'
  | 'vip-area'
  | 'florals'

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
  heading?: string
  leadName: string
  eventType?: string | null
  eventDate?: string | null
  guestCount?: number | null
  contextMessage?: string
  onSave: (layout: EventLayoutDocument) => Promise<boolean>
  onCreateReview?: (layout: EventLayoutDocument) => Promise<string | null>
}

const CATALOG: Array<{
  kind: LayoutItemKind
  label: string
  subtitle: string
  group: 'Tables' | 'Seating' | 'Features' | 'Décor & more'
  icon: typeof CircleDot
  width: number
  height: number
  seats?: number
}> = [
  { kind: 'round-table', label: '60″ Round Table', subtitle: '5′ diameter · 8 seats', group: 'Tables', icon: CircleDot, width: 5, height: 5, seats: 8 },
  { kind: 'rectangle-table', label: '6′ Banquet Table', subtitle: '6′ × 2.25′ · 8 seats', group: 'Tables', icon: RectangleHorizontal, width: 6, height: 2.25, seats: 8 },
  { kind: 'cocktail-table', label: 'Highboy Cocktail', subtitle: '3′ round · 4 seats', group: 'Tables', icon: LampDesk, width: 3, height: 3, seats: 4 },
  { kind: 'chair', label: 'Chiavari Chair', subtitle: '2′ × 2′ · 1 seat', group: 'Seating', icon: Armchair, width: 2, height: 2, seats: 1 },
  { kind: 'throne-chair', label: 'Throne Chair', subtitle: '3.5′ × 3.5′ · 1 seat', group: 'Seating', icon: Armchair, width: 3.5, height: 3.5, seats: 1 },
  { kind: 'sofa', label: 'Lounge Sofa', subtitle: '8′ × 3′ · 3 seats', group: 'Seating', icon: Sofa, width: 8, height: 3, seats: 3 },
  { kind: 'stage', label: 'Main Stage', subtitle: '16′ × 8′ platform', group: 'Features', icon: PanelTop, width: 16, height: 8 },
  { kind: 'dj-booth', label: 'DJ Booth', subtitle: '6′ × 3′ station', group: 'Features', icon: RectangleHorizontal, width: 6, height: 3 },
  { kind: 'dance-floor', label: 'Dance Floor', subtitle: '16′ × 16′ parquet', group: 'Features', icon: Grid2X2, width: 16, height: 16 },
  { kind: 'bar', label: 'Beverage Bar', subtitle: '8′ × 3′ service station', group: 'Features', icon: RectangleHorizontal, width: 8, height: 3 },
  { kind: 'backdrop', label: '10′ Backdrop Frame', subtitle: '10′ × 1′ draped', group: 'Features', icon: PanelTop, width: 10, height: 1 },
  { kind: 'balloon-arch', label: 'Balloon Arch', subtitle: '8′ × 3′ entrance arch', group: 'Décor & more', icon: PanelTop, width: 8, height: 3 },
  { kind: 'pipe-drape', label: 'Pipe & Drape', subtitle: '10′ × 1.5′ wall', group: 'Décor & more', icon: PanelTop, width: 10, height: 1.5 },
  { kind: 'stanchions', label: 'Stanchions & Velvet', subtitle: '6′ × 2′ queue line', group: 'Décor & more', icon: Ban, width: 6, height: 2 },
  { kind: 'vip-area', label: 'VIP Lounge Section', subtitle: '12′ × 8′ roped area', group: 'Décor & more', icon: Users, width: 12, height: 8 },
  { kind: 'florals', label: 'Floral Arrangement', subtitle: '2′ × 2′ pedestal', group: 'Décor & more', icon: CircleDot, width: 2, height: 2 },
]

const TABLE_COLORS = [
  { hex: '#252321', name: 'Black' },
  { hex: '#f5ead8', name: 'Champagne Linen' },
  { hex: '#d9be8b', name: 'Warm Gold' },
  { hex: '#314536', name: 'Emerald' },
  { hex: '#24354d', name: 'Midnight Navy' },
  { hex: '#743f3d', name: 'Burgundy' },
]

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
  return {
    id: uid(),
    kind,
    x,
    y,
    width: entry.width,
    height: entry.height,
    rotation: 0,
    label: entry.kind.includes('table') ? `${entry.label.split(' ')[0]} ${index + 1}` : entry.label,
    seats: entry.seats || 0,
    color: kind.includes('table') ? TABLE_COLORS[0].hex : undefined,
  }
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
  if (name === 'Cocktail hour') {
    return [...Array.from({ length: 10 }, (_, i) => makeItem('cocktail-table', 12 + (i % 5) * 17, 18 + Math.floor(i / 5) * 28, i)), { ...makeItem('bar'), x: 39, y: 78 }]
  }
  return [...Array.from({ length: 6 }, (_, i) => makeItem('rectangle-table', 15 + (i % 2) * 40, 17 + Math.floor(i / 2) * 24, i)), { ...makeItem('stage'), x: 38, y: 82 }]
}

function EventLayoutDesignerComponent({
  open,
  onClose,
  initialLayout,
  heading = 'Event Layout Designer',
  leadName,
  eventType,
  eventDate,
  guestCount,
  contextMessage,
  onSave,
  onCreateReview,
}: Props) {
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
  const [creatingReview, setCreatingReview] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(initialLayout?.updatedAt || null)
  const [placementMessage, setPlacementMessage] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [activeCatalogTab, setActiveCatalogTab] = useState<'All' | 'Tables' | 'Seating' | 'Features' | 'Décor & more'>('All')
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number; bounds: DOMRect } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const commit = useCallback((next: LayoutItem[] | ((current: LayoutItem[]) => LayoutItem[])) => {
    setItems((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      setHistory((past) => [...past.slice(-30), current])
      setFuture([])
      return resolved
    })
  }, [])

  const removeSelected = useCallback(() => {
    if (!selectedId) return
    commit((current) => current.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, commit])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileDetailsOpen) {
          setMobileDetailsOpen(false)
        } else {
          onClose()
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        removeSelected()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, mobileDetailsOpen, selectedId, removeSelected])

  const selected = items.find((item) => item.id === selectedId) || null
  const capacity = items.reduce((sum, item) => sum + (item.seats || 0), 0)
  const planDepthFeetValue = roomHeightFeet + secondaryRoomDepthFeet
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

  const startDrag = useCallback((event: React.PointerEvent, item: LayoutItem) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // safe fallback if capture fails
    }
    dragRef.current = {
      id: item.id,
      dx: ((event.clientX - bounds.left) / bounds.width) * 100 - item.x,
      dy: ((event.clientY - bounds.top) / bounds.height) * 100 - item.y,
      bounds,
    }
    setSelectedId(item.id)
  }, [])

  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const bounds = drag.bounds
    if (!bounds) return
    const item = items.find((entry) => entry.id === drag.id)
    if (!item) return
    const snapX = 100 / Math.max(1, roomWidthFeet * 2)
    const itemWidthPercent = (item.width / roomWidthFeet) * 100
    const itemHeightPercent = (item.height / planDepthFeetValue) * 100
    const snapY = 100 / Math.max(1, planDepthFeetValue * 2)
    const x = Math.max(0, Math.min(100 - itemWidthPercent, Math.round((((event.clientX - bounds.left) / bounds.width) * 100 - drag.dx) / snapX) * snapX))
    const y = Math.max(0, Math.min(100 - itemHeightPercent, Math.round((((event.clientY - bounds.top) / bounds.height) * 100 - drag.dy) / snapY) * snapY))
    if (x === item.x && y === item.y) return
    const candidate = { ...item, x, y }
    if (!placementIsClear(candidate, items.filter((entry) => entry.id !== drag.id), layoutDimensions)) {
      setPlacementMessage('Items cannot overlap. Move it into a clear part of the room.')
      return
    }
    setItems((current) => current.map((entry) => entry.id === drag.id ? candidate : entry))
    setPlacementMessage(null)
  }

  const endDrag = (event?: React.PointerEvent) => {
    if (!dragRef.current) return
    if (event?.currentTarget && event.pointerId !== undefined) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // pointer may already be released
      }
    }
    dragRef.current = null
  }

  const layoutDocument = (updatedAt: string): EventLayoutDocument => ({
    version: 1,
    name: name.trim() || 'Event layout',
    items,
    roomWidthFeet,
    roomHeightFeet,
    secondaryRoomWidthFeet,
    secondaryRoomDepthFeet,
    updatedAt,
  })

  const save = async (): Promise<EventLayoutDocument | null> => {
    if (hasPlacementIssues) {
      setPlacementMessage('Resolve overlapping or out-of-room items before saving this layout.')
      return null
    }
    setSaving(true)
    const now = new Date().toISOString()
    const document = layoutDocument(now)
    try {
      const ok = await onSave(document)
      if (!ok) return null
      setSavedAt(now)
      return document
    } catch {
      setPlacementMessage('Unable to save this layout. Please try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const createReview = async () => {
    if (!onCreateReview) return
    const document = await save()
    if (!document) return

    setCreatingReview(true)
    try {
      const shareUrl = await onCreateReview(document)
      if (!shareUrl) {
        setPlacementMessage('The layout is saved, but a private review link could not be created. Please try again.')
        return
      }
      let copied = false
      try {
        await navigator.clipboard.writeText(shareUrl)
        copied = true
      } catch {
        // The Planning review card retains the link for browsers that block clipboard access.
      }
      setPlacementMessage(copied
        ? 'Private review link created and copied. Close the builder to email it to the client.'
        : 'Private review link created. Close the builder to email it to the client.')
    } catch {
      setPlacementMessage('The layout is saved, but a private review link could not be created. Please try again.')
    } finally {
      setCreatingReview(false)
    }
  }

  const groups = useMemo(() => Array.from(new Set(CATALOG.map((item) => item.group))), [])
  const filteredCatalog = useMemo(() => {
    if (activeCatalogTab === 'All') return CATALOG
    return CATALOG.filter((item) => item.group === activeCatalogTab)
  }, [activeCatalogTab])

  if (!open || !mounted || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--portal-bg)] text-[color:var(--portal-text)] selection:bg-[#caa24c]/30 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      role="dialog"
      aria-modal="true"
      aria-label="Event layout designer"
    >
      {/* Top Header */}
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/95 backdrop-blur-md px-4 py-3 sm:min-h-20 sm:gap-4 sm:px-6 sm:py-3.5 lg:px-8 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <PortalCloseButton
            onClick={onClose}
            aria-label="Close layout designer"
            title="Close focus mode (Esc)"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.22em] text-[#a8792f] dark:text-[#caa24c]">
                Planning · {leadName}
              </p>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#caa24c]/35 bg-[#caa24c]/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#caa24c]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#caa24c] animate-pulse" /> Focus Mode
              </span>
            </div>
            <h1 className="truncate font-serif text-lg font-bold tracking-tight text-[color:var(--portal-text)] sm:text-2xl">
              {heading}
            </h1>
            <p className="hidden text-[11px] text-[color:var(--portal-muted)] sm:block">
              Arrange the hall, estimate guest seating, and save the architectural floor plan.
            </p>
            {contextMessage ? <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-[color:var(--portal-muted)]">{contextMessage}</p> : null}
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!history.length}
            className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 sm:gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[#b9872f] dark:hover:text-[#caa24c] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-xs"
            title="Undo"
          >
            <Undo2 size={14} /> <span className="hidden sm:inline">Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!future.length}
            className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 sm:gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[#b9872f] dark:hover:text-[#caa24c] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-xs"
            title="Redo"
          >
            <Redo2 size={14} /> <span className="hidden sm:inline">Redo</span>
          </button>

          {hasPlacementIssues ? (
            <button
              type="button"
              onClick={resolveOverlaps}
              className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shadow-xs"
            >
              Resolve overlaps
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => { if (confirm('Clear every item from this floor plan?')) commit([]) }}
            className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-500 transition-colors shadow-xs hidden md:inline-flex"
            title="Clear canvas"
          >
            <Trash2 size={14} /> Clear
          </button>

          <button
            type="button"
            onClick={() => setMobileDetailsOpen((v) => !v)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-wider transition-colors shadow-xs lg:hidden ${
              mobileDetailsOpen
                ? 'border-[#caa24c] bg-[#caa24c]/15 text-[#a8792f] dark:text-[#caa24c]'
                : 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
            }`}
            aria-label="Toggle layout details and inspector"
          >
            <SlidersHorizontal size={14} />
            <span>Details</span>
            {selected && (
              <span className="flex h-2 w-2 rounded-full bg-[#caa24c]" />
            )}
          </button>

          {onCreateReview ? (
            <button
              type="button"
              onClick={() => void createReview()}
              disabled={saving || creatingReview}
              className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 sm:gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 sm:px-4 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] hover:border-[#caa24c]/40 hover:text-[#b9872f] dark:hover:text-[#caa24c] disabled:opacity-40 transition-colors shadow-xs"
            >
              <Link2 size={14} /> <span className="hidden sm:inline">{creatingReview ? 'Creating link…' : 'Save & link'}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex min-h-9 sm:min-h-10 items-center gap-1.5 sm:gap-2 rounded-xl bg-[#b9872f] px-3.5 sm:px-5 text-[10px] font-black uppercase tracking-[0.14em] !text-white hover:bg-[#caa24c] hover:!text-white [&>svg]:!text-white [&>svg]:!stroke-white shadow-md shadow-[#b9872f]/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Save size={14} className="!text-white !stroke-white" />
            <span className="!text-white">{saving ? 'Saving…' : 'Save layout'}</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Layout */}
      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[250px_minmax(460px,1fr)_300px]">
        {/* Left catalog - desktop */}
        <aside className="hidden overflow-y-auto border-r border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:block">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[color:var(--portal-border)]">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
              Catalog Items
            </span>
            <span className="rounded-full bg-[color:var(--portal-soft)] px-2 py-0.5 text-[9px] font-bold text-[color:var(--portal-muted)]">
              {CATALOG.length} elements
            </span>
          </div>

          {groups.map((group) => (
            <div key={group} className="mb-6">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[color:var(--portal-muted)]">
                {group}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CATALOG.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => addItem(item.kind)}
                      className="group flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/60 p-2 text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-[#caa24c]/60 hover:bg-[#caa24c]/10 hover:shadow-md cursor-pointer active:scale-95"
                    >
                      <Icon size={22} strokeWidth={1.5} className="text-[color:var(--portal-muted)] group-hover:text-[#b9872f] dark:group-hover:text-[#caa24c] transition-colors" />
                      <span className="text-[9px] font-bold leading-tight text-[color:var(--portal-text)] line-clamp-2">
                        {item.label}
                      </span>
                      {item.seats ? (
                        <span className="rounded bg-[color:var(--portal-card)] px-1.5 py-0.5 text-[8px] font-black text-[#a8792f] dark:text-[#caa24c]">
                          {item.seats} seats
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Center Canvas Area */}
        <main className="flex min-h-0 flex-col overflow-hidden bg-[color:var(--portal-soft)]">
          {/* Canvas Sub-Header: 2D/3D switcher & Zoom */}
          <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-2 sm:px-6">
            <div className="inline-flex rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`rounded-lg px-3.5 sm:px-4 py-1.5 sm:py-2 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-[#b9872f] !text-white shadow-xs'
                    : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                2D layout
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`rounded-lg px-3.5 sm:px-4 py-1.5 sm:py-2 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  viewMode === '3d'
                    ? 'bg-[#b9872f] !text-white shadow-xs'
                    : 'text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
                }`}
              >
                3D preview
              </button>
            </div>

            {viewMode === '2d' ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="inline-flex items-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setZoom((value) => Math.max(70, value - 10))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(100)}
                    className="w-12 text-center text-[10px] font-black text-[color:var(--portal-text)] hover:text-[#b9872f] dark:hover:text-[#caa24c] transition-colors cursor-pointer"
                    title="Click to reset zoom (100%)"
                  >
                    {zoom}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((value) => Math.min(130, value + 10))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-card)] hover:text-[color:var(--portal-text)] transition-colors cursor-pointer"
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <p className="hidden text-[10px] font-bold text-[color:var(--portal-muted)] sm:block">
                Interactive 3D Walkthrough
              </p>
            )}
          </div>

          {/* Placement Notice Banner */}
          {placementMessage ? (
            <div role="status" className="flex items-center justify-between border-b border-[#caa24c]/30 bg-[#caa24c]/10 px-4 py-2.5 text-[11px] font-semibold text-[#8b6525] dark:text-[#e7c97e]">
              <span>{placementMessage}</span>
              <button
                type="button"
                onClick={() => setPlacementMessage(null)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          ) : null}

          {/* View Mode Switch (3D vs 2D Canvas) */}
          {viewMode === '3d' ? (
            <div className="min-h-0 flex-1">
              <EventLayout3D
                items={items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                roomWidthFeet={roomWidthFeet}
                roomDepthFeet={planDepthFeetValue}
                mainRoomDepthFeet={roomHeightFeet}
                secondaryRoomWidthFeet={secondaryRoomWidthFeet}
              />
            </div>
          ) : (
            <div className="portal-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 overscroll-contain [touch-action:pan-y]">
              <div className="mx-auto flex min-h-full max-w-[920px] items-start justify-center py-4">
                <div
                  className="relative w-full origin-top rounded-2xl border-2 border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-xl transform-gpu will-change-transform"
                  style={{
                    aspectRatio: `${roomWidthFeet}/${planDepthFeetValue}`,
                    transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
                    contain: 'layout paint',
                  }}
                  ref={canvasRef}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) setSelectedId(null)
                  }}
                >
                  {/* Subtle Grid Lines */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-35 [background-image:linear-gradient(var(--portal-border)_1px,transparent_1px),linear-gradient(90deg,var(--portal-border)_1px,transparent_1px)] [background-size:24px_24px] [contain:strict]"
                    aria-hidden="true"
                  />

                  {/* Main Hall Boundary */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 border-b-2 border-dashed border-[#caa24c]/50"
                    style={{ height: `${(roomHeightFeet / planDepthFeetValue) * 100}%` }}
                  >
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] shadow-xs">
                      Main Hall · {roomWidthFeet}′ × {roomHeightFeet}′
                    </span>
                  </div>

                  {/* Lower Room / Salon Boundary */}
                  <div
                    className="pointer-events-none absolute bottom-0 rounded-b-xl border-2 border-dashed border-[#caa24c]/50 bg-[color:var(--portal-card)]/60"
                    style={{
                      left: `${((roomWidthFeet - secondaryRoomWidthFeet) / roomWidthFeet) * 50}%`,
                      width: `${(secondaryRoomWidthFeet / roomWidthFeet) * 100}%`,
                      height: `${(secondaryRoomDepthFeet / planDepthFeetValue) * 100}%`,
                    }}
                  >
                    <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]/90 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[color:var(--portal-muted)] shadow-xs">
                      Lower Salon · {secondaryRoomWidthFeet}′ × {secondaryRoomDepthFeet}′
                    </span>
                  </div>

                  {/* Canvas Items */}
                  {items.map((item) => (
                    <CanvasItem
                      key={item.id}
                      item={item}
                      roomWidthFeet={roomWidthFeet}
                      planDepthFeet={planDepthFeetValue}
                      selected={selectedId === item.id}
                      onPointerDown={(event) => startDrag(event, item)}
                    />
                  ))}

                  {/* Empty State */}
                  {!items.length && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[#caa24c] shadow-xs">
                        <LayoutGrid size={28} />
                      </div>
                      <p className="mt-3 text-base font-bold text-[color:var(--portal-text)] font-serif">The floor plan is empty</p>
                      <p className="mt-1 text-xs text-[color:var(--portal-muted)] max-w-xs">
                        Add items from the catalog or pick a quick template from the sidebar to begin layout planning.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Floating Action Bar for Selected Item on Mobile / iPad */}
          {selected && (
            <div className="flex items-center justify-between gap-3 border-t border-[#caa24c]/40 bg-[color:var(--portal-card)]/95 px-4 py-2.5 shadow-xl backdrop-blur-md lg:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xs font-black uppercase text-[#a8792f] dark:text-[#caa24c]">
                  {selected.label}
                </span>
                {selected.seats > 0 && (
                  <span className="rounded-full bg-[color:var(--portal-soft)] px-2 py-0.5 text-[9px] font-bold text-[color:var(--portal-muted)]">
                    {selected.seats} seats
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => updateSelected({ rotation: ((selected.rotation || 0) + 15) % 360 })}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[#b9872f] transition-colors cursor-pointer"
                  aria-label="Rotate item 15 degrees"
                  title="Rotate 15°"
                >
                  <RotateCw size={15} />
                </button>
                <button
                  type="button"
                  onClick={duplicateSelected}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[#b9872f] transition-colors cursor-pointer"
                  aria-label="Duplicate item"
                  title="Duplicate"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-red-400 hover:text-red-500 transition-colors cursor-pointer"
                  aria-label="Delete item"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDetailsOpen(true)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-[#caa24c]/50 bg-[#caa24c]/15 px-3.5 text-[10px] font-black uppercase tracking-wider text-[#a8792f] dark:text-[#caa24c] hover:bg-[#caa24c]/25 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              </div>
            </div>
          )}

          {/* Bottom Catalog Shelf on Mobile / iPad */}
          <div className="flex flex-col border-t border-[color:var(--portal-border)] bg-[color:var(--portal-card)] pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
            {/* Category Filter Chips for Quick iPad/Phone Navigation */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 pt-2.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(['All', 'Tables', 'Seating', 'Features', 'Décor & more'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveCatalogTab(tab)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                    activeCatalogTab === tab
                      ? 'bg-[#b9872f] !text-white'
                      : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Scrollable Items Row */}
            <div className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain p-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filteredCatalog.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addItem(item.kind)}
                    className="flex min-h-12 shrink-0 snap-start items-center gap-2.5 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3.5 text-[10px] font-bold active:scale-95 hover:border-[#caa24c]/50 hover:bg-[#caa24c]/10 transition-colors cursor-pointer shadow-xs"
                  >
                    <Icon size={16} className="text-[#a8792f] dark:text-[#caa24c]" />
                    <div className="text-left">
                      <p className="leading-tight text-[color:var(--portal-text)]">{item.label}</p>
                      {item.seats ? (
                        <p className="text-[8px] text-[color:var(--portal-muted)]">{item.seats} seats</p>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </main>

        {/* Right Inspector / Details Sidebar - Desktop */}
        <aside className="hidden overflow-y-auto border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] p-4 lg:block">
          <LayoutDetailsSidebar
            name={name}
            setName={setName}
            roomWidthFeet={roomWidthFeet}
            setRoomWidthFeet={setRoomWidthFeet}
            roomHeightFeet={roomHeightFeet}
            setRoomHeightFeet={setRoomHeightFeet}
            secondaryRoomWidthFeet={secondaryRoomWidthFeet}
            setSecondaryRoomWidthFeet={setSecondaryRoomWidthFeet}
            secondaryRoomDepthFeet={secondaryRoomDepthFeet}
            setSecondaryRoomDepthFeet={setSecondaryRoomDepthFeet}
            savedAt={savedAt}
            capacity={capacity}
            guestCount={guestCount}
            selected={selected}
            planDepthFeet={planDepthFeetValue}
            updateSelected={updateSelected}
            removeSelected={removeSelected}
            duplicateSelected={duplicateSelected}
            items={items}
            commit={commit}
            layoutDimensions={layoutDimensions}
            setSelectedId={setSelectedId}
            setPlacementMessage={setPlacementMessage}
            leadName={leadName}
            eventType={eventType}
            eventDate={eventDate}
          />
        </aside>

        {/* Right Inspector / Details Drawer - Mobile & iPad */}
        {mobileDetailsOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
              onClick={() => setMobileDetailsOpen(false)}
            />
            <aside
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[color:var(--portal-border)] bg-[color:var(--portal-card)] shadow-2xl lg:hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              role="dialog"
              aria-modal="true"
              aria-label="Layout Details and Inspector"
            >
              <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <SlidersHorizontal size={16} className="text-[#a8792f] dark:text-[#caa24c]" />
                  <span className="font-serif text-base font-bold text-[color:var(--portal-text)]">
                    {selected ? `Editing ${selected.label}` : 'Layout Details'}
                  </span>
                </div>
                <PortalCloseButton
                  onClick={() => setMobileDetailsOpen(false)}
                  aria-label="Close details"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                <LayoutDetailsSidebar
                  name={name}
                  setName={setName}
                  roomWidthFeet={roomWidthFeet}
                  setRoomWidthFeet={setRoomWidthFeet}
                  roomHeightFeet={roomHeightFeet}
                  setRoomHeightFeet={setRoomHeightFeet}
                  secondaryRoomWidthFeet={secondaryRoomWidthFeet}
                  setSecondaryRoomWidthFeet={setSecondaryRoomWidthFeet}
                  secondaryRoomDepthFeet={secondaryRoomDepthFeet}
                  setSecondaryRoomDepthFeet={setSecondaryRoomDepthFeet}
                  savedAt={savedAt}
                  capacity={capacity}
                  guestCount={guestCount}
                  selected={selected}
                  planDepthFeet={planDepthFeetValue}
                  updateSelected={updateSelected}
                  removeSelected={removeSelected}
                  duplicateSelected={duplicateSelected}
                  items={items}
                  commit={commit}
                  layoutDimensions={layoutDimensions}
                  setSelectedId={setSelectedId}
                  setPlacementMessage={setPlacementMessage}
                  leadName={leadName}
                  eventType={eventType}
                  eventDate={eventDate}
                />
              </div>
            </aside>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export const EventLayoutDesigner = memo(EventLayoutDesignerComponent)

function LayoutDetailsSidebar({
  name,
  setName,
  roomWidthFeet,
  setRoomWidthFeet,
  roomHeightFeet,
  setRoomHeightFeet,
  secondaryRoomWidthFeet,
  setSecondaryRoomWidthFeet,
  secondaryRoomDepthFeet,
  setSecondaryRoomDepthFeet,
  savedAt,
  capacity,
  guestCount,
  selected,
  planDepthFeet,
  updateSelected,
  removeSelected,
  duplicateSelected,
  items,
  commit,
  layoutDimensions,
  setSelectedId,
  setPlacementMessage,
  leadName,
  eventType,
  eventDate,
}: {
  name: string
  setName: (v: string) => void
  roomWidthFeet: number
  setRoomWidthFeet: (v: number) => void
  roomHeightFeet: number
  setRoomHeightFeet: (v: number) => void
  secondaryRoomWidthFeet: number
  secondaryRoomDepthFeet: number
  setSecondaryRoomWidthFeet: (v: number) => void
  setSecondaryRoomDepthFeet: (v: number) => void
  savedAt: string | null
  capacity: number
  guestCount?: number | null
  selected: LayoutItem | null
  planDepthFeet: number
  updateSelected: (updates: Partial<LayoutItem>) => void
  removeSelected: () => void
  duplicateSelected: () => void
  items: LayoutItem[]
  commit: (next: LayoutItem[] | ((current: LayoutItem[]) => LayoutItem[])) => void
  layoutDimensions: LayoutDimensions
  setSelectedId: (id: string | null) => void
  setPlacementMessage: (msg: string | null) => void
  leadName: string
  eventType?: string | null
  eventDate?: string | null
}) {
  const capacityPct = guestCount ? Math.round((capacity / guestCount) * 100) : 0
  const capacityDelta = guestCount ? capacity - guestCount : 0

  return (
    <div className="space-y-4">
      {/* Selected Item Inspector (Elevated to top if an item is selected!) */}
      {selected ? (
        <Inspector
          item={selected}
          roomWidthFeet={roomWidthFeet}
          roomHeightFeet={planDepthFeet}
          onUpdate={updateSelected}
          onDelete={removeSelected}
          onDuplicate={duplicateSelected}
        />
      ) : null}

      {/* Card 1: Floor Plan & Dimensions */}
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[color:var(--portal-border)] pb-2.5">
          <Ruler size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
            Layout & Dimensions
          </h3>
        </div>

        <label className="mt-3.5 block text-[10px] font-bold text-[color:var(--portal-muted)]">
          Plan Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="planning-editor-input mt-1.5"
            placeholder="e.g. Classic Banquet Layout"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">
            Main Width (ft)
            <input
              type="number"
              min="10"
              value={roomWidthFeet}
              onChange={(event) => setRoomWidthFeet(Math.max(10, Number(event.target.value) || 10))}
              className="planning-editor-input mt-1"
            />
          </label>
          <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">
            Main Depth (ft)
            <input
              type="number"
              min="10"
              value={roomHeightFeet}
              onChange={(event) => setRoomHeightFeet(Math.max(10, Number(event.target.value) || 10))}
              className="planning-editor-input mt-1"
            />
          </label>
          <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">
            Lower Width (ft)
            <input
              type="number"
              min="10"
              step="0.01"
              value={secondaryRoomWidthFeet}
              onChange={(event) => setSecondaryRoomWidthFeet(Math.max(10, Number(event.target.value) || 10))}
              className="planning-editor-input mt-1"
            />
          </label>
          <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">
            Lower Depth (ft)
            <input
              type="number"
              min="10"
              step="0.01"
              value={secondaryRoomDepthFeet}
              onChange={(event) => setSecondaryRoomDepthFeet(Math.max(10, Number(event.target.value) || 10))}
              className="planning-editor-input mt-1"
            />
          </label>
        </div>

        <p className="mt-3 text-[9px] leading-relaxed text-[color:var(--portal-muted)]">
          Architectural venue blueprint: 33′ × 75′ main hall with a 20′10″ × 21′7″ lower salon. Items snap smoothly to 6-inch increments.
        </p>

        {savedAt && (
          <p className="mt-2 text-[9px] font-medium text-[color:var(--portal-faint)]">
            Last saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </section>

      {/* Card 2: Seating Capacity Meter */}
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[color:var(--portal-border)] pb-2.5">
          <Users size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
            Capacity Estimate
          </h3>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div>
            <p className="font-serif text-2xl font-bold tracking-tight text-[color:var(--portal-text)]">
              {capacity} <span className="text-xs font-sans font-bold text-[color:var(--portal-muted)]">seats planned</span>
            </p>
            <p className="mt-0.5 text-[10px] text-[color:var(--portal-muted)]">
              {guestCount ? `${guestCount} guests expected` : 'Guest count not set in lead'}
            </p>
          </div>

          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 ${
              guestCount && capacity < guestCount
                ? 'border-amber-400 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-[#caa24c] bg-[#caa24c]/10 text-[#a8792f] dark:text-[#caa24c]'
            }`}
          >
            <span className="text-xs font-black">{capacityPct}%</span>
          </div>
        </div>

        {guestCount ? (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--portal-border)]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  capacity < guestCount ? 'bg-amber-500' : 'bg-[#caa24c]'
                }`}
                style={{ width: `${Math.min(100, capacityPct)}%` }}
              />
            </div>
            <p className="mt-2 text-[9px] font-bold text-[color:var(--portal-muted)]">
              {capacityDelta >= 0
                ? `Capacity accommodates all ${guestCount} guests (+${capacityDelta} buffer)`
                : `Need ${Math.abs(capacityDelta)} more seats to seat full guest count`}
            </p>
          </div>
        ) : null}
      </section>

      {/* Card 3: Quick Templates */}
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[color:var(--portal-border)] pb-2.5">
          <Sparkles size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
            Quick Templates
          </h3>
        </div>

        <div className="mt-3 space-y-2">
          {[
            { name: 'Classic banquet', desc: '8 banquet rounds · stage · dance floor · bar' },
            { name: 'Ceremony + reception', desc: 'Aisle seating · dance floor · photo backdrop' },
            { name: 'Cocktail hour', desc: '10 highboy cocktail tables · bar setup' },
            { name: 'Conference / meeting', desc: '6 rectangular meeting tables · presentation stage' },
          ].map((template) => (
            <button
              key={template.name}
              type="button"
              onClick={() => {
                if (!items.length || confirm(`Replace the current floor plan with "${template.name}"?`)) {
                  commit(resolveLayoutConflicts(templateFor(template.name), layoutDimensions))
                  setName(`${template.name} layout`)
                  setSelectedId(null)
                  setPlacementMessage(null)
                }
              }}
              className="group flex w-full flex-col rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3.5 py-2.5 text-left transition-all hover:border-[#caa24c]/60 hover:bg-[#caa24c]/5 cursor-pointer"
            >
              <span className="text-[10px] font-bold text-[color:var(--portal-text)] group-hover:text-[#b9872f] dark:group-hover:text-[#caa24c] transition-colors">
                {template.name}
              </span>
              <span className="text-[9px] text-[color:var(--portal-muted)]">
                {template.desc}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Card 4: Event Dossier Context */}
      <section className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/50 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-[color:var(--portal-border)] pb-2.5">
          <Calendar size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
            Event Information
          </h3>
        </div>

        <dl className="mt-3 space-y-2.5 text-[10px]">
          <Info label="Client" value={leadName} />
          <Info label="Event Type" value={eventType || 'Not selected'} />
          <Info label="Date" value={eventDate ? new Date(`${eventDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'} />
          <Info label="Guest List" value={guestCount ? `${guestCount} guests` : 'Not recorded'} />
        </dl>
      </section>
    </div>
  )
}

const CanvasItem = memo(function CanvasItem({
  item,
  roomWidthFeet,
  planDepthFeet,
  selected,
  onPointerDown,
}: {
  item: LayoutItem
  roomWidthFeet: number
  planDepthFeet: number
  selected: boolean
  onPointerDown: (event: React.PointerEvent) => void
}) {
  const table = item.kind.includes('table')
  const round = item.kind === 'round-table' || item.kind === 'cocktail-table' || item.kind === 'florals'

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className={`absolute flex touch-none select-none items-center justify-center border text-center shadow-xs transition-shadow ${
        round ? 'rounded-full' : 'rounded-lg'
      } ${
        selected
          ? 'z-20 border-[#caa24c] ring-2 ring-[#caa24c]/60 shadow-lg shadow-[#caa24c]/20'
          : 'border-[#90744d]/60 hover:border-[#caa24c]'
      }`}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        width: `${(item.width / roomWidthFeet) * 100}%`,
        height: `${(item.height / planDepthFeet) * 100}%`,
        transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
        backgroundColor:
          item.color ||
          (item.kind === 'dance-floor'
            ? '#ead9c1'
            : item.kind === 'stage' || item.kind === 'bar'
              ? '#ded1bd'
              : 'var(--portal-card)'),
      }}
      aria-label={`Select ${item.label}`}
    >
      {table && (
        <span className="pointer-events-none absolute inset-[-14%] rounded-[inherit] border border-dashed border-[#8b7555]/40" />
      )}
      <span className="pointer-events-none relative truncate px-1 text-[clamp(6px,0.75vw,10px)] font-black uppercase tracking-tight text-[#342c23] dark:text-[#f1e8d9]">
        {item.label}
      </span>
    </button>
  )
})

function Inspector({
  item,
  roomWidthFeet,
  roomHeightFeet,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  item: LayoutItem
  roomWidthFeet: number
  roomHeightFeet: number
  onUpdate: (updates: Partial<LayoutItem>) => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  return (
    <section className="rounded-2xl border border-[#caa24c]/40 bg-[color:var(--portal-card)] p-4 sm:p-5 shadow-lg">
      <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-2.5">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-[#a8792f] dark:text-[#caa24c]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a8792f] dark:text-[#caa24c]">
            Customize {item.label}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[#b9872f] transition-colors cursor-pointer"
            aria-label="Duplicate item"
            title="Duplicate"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:border-red-400 hover:text-red-500 transition-colors cursor-pointer"
            aria-label="Delete item"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <label className="mt-3.5 block text-[9px] font-bold text-[color:var(--portal-muted)]">
        Item Label
        <input
          value={item.label}
          onChange={(event) => onUpdate({ label: event.target.value })}
          className="planning-editor-input mt-1.5"
        />
      </label>

      {item.seats > 0 && (
        <label className="mt-3 block text-[9px] font-bold text-[color:var(--portal-muted)]">
          Seating Capacity
          <input
            type="number"
            min="0"
            max="30"
            value={item.seats}
            onChange={(event) => onUpdate({ seats: Number(event.target.value) })}
            className="planning-editor-input mt-1"
          />
        </label>
      )}

      {item.kind.includes('table') && (
        <div className="mt-3.5">
          <p className="text-[9px] font-bold text-[color:var(--portal-muted)]">Linen / Surface Color</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TABLE_COLORS.map(({ hex, name }) => (
              <button
                key={hex}
                type="button"
                onClick={() => onUpdate({ color: hex })}
                className={`h-7 w-7 rounded-full border transition-transform ${
                  item.color === hex
                    ? 'scale-110 border-[#caa24c] ring-2 ring-[#caa24c] ring-offset-2 ring-offset-[color:var(--portal-card)]'
                    : 'border-[color:var(--portal-border)] hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`Select ${name}`}
                title={name}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <Range
          label="Width (ft)"
          value={item.width}
          min={0.5}
          max={roomWidthFeet}
          step={0.25}
          onChange={(feet) => onUpdate({ width: Math.min(roomWidthFeet, feet) })}
        />
        <Range
          label="Depth (ft)"
          value={item.height}
          min={0.5}
          max={roomHeightFeet}
          step={0.25}
          onChange={(feet) => onUpdate({ height: Math.min(roomHeightFeet, feet) })}
        />
      </div>

      <div className="mt-3.5">
        <div className="flex items-center justify-between text-[9px] font-bold text-[color:var(--portal-muted)]">
          <span>Rotation Angle</span>
          <span className="text-[#a8792f] dark:text-[#caa24c] font-black">{item.rotation}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="345"
          step="15"
          value={item.rotation}
          onChange={(event) => onUpdate({ rotation: Number(event.target.value) })}
          className="mt-2 w-full accent-[#caa24c] cursor-pointer"
        />
        <div className="mt-1 flex justify-between gap-1">
          {[0, 45, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onUpdate({ rotation: deg })}
              className={`rounded px-1.5 py-0.5 text-[8px] font-black transition-colors ${
                item.rotation === deg
                  ? 'bg-[#caa24c] text-white'
                  : 'bg-[color:var(--portal-soft)] text-[color:var(--portal-muted)] hover:text-[color:var(--portal-text)]'
              }`}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Range({
  label,
  value,
  min,
  max,
  step = 0.25,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-[9px] font-bold text-[color:var(--portal-muted)]">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="planning-editor-input mt-1"
      />
    </label>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-bold text-[color:var(--portal-muted)]">{label}</dt>
      <dd className="text-right font-bold text-[color:var(--portal-text)]">{value}</dd>
    </div>
  )
}
