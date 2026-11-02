import type { EventLayoutDocument, LayoutItem, LayoutItemKind } from '@/components/portal/EventLayoutDesigner'

const itemKinds = new Set<LayoutItemKind>([
  'round-table', 'rectangle-table', 'cocktail-table', 'chair', 'throne-chair', 'sofa', 'stage',
  'dj-booth', 'dance-floor', 'bar', 'backdrop', 'balloon-arch', 'pipe-drape', 'stanchions',
  'vip-area', 'florals',
])

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** Validate the bounded, JSON-safe floor-plan shape saved inside a Planner concept. */
export function normalizePlannerEventLayout(value: unknown): EventLayoutDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1 || !Array.isArray(candidate.items) || candidate.items.length > 500) return null
  if (typeof candidate.name !== 'string' || candidate.name.trim().length < 1 || candidate.name.length > 160) return null

  const items: LayoutItem[] = []
  const ids = new Set<string>()
  for (const raw of candidate.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)) return null
    if (typeof item.kind !== 'string' || !itemKinds.has(item.kind as LayoutItemKind)) return null
    if (typeof item.label !== 'string' || item.label.length > 160) return null
    if (!finiteNumber(item.x, 0, 100) || !finiteNumber(item.y, 0, 100)
      || !finiteNumber(item.width, 0.1, 100) || !finiteNumber(item.height, 0.1, 100)
      || !finiteNumber(item.rotation, -3600, 3600) || !finiteNumber(item.seats, 0, 500)) return null
    if (item.color !== undefined && (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color))) return null
    ids.add(item.id)
    items.push({ id: item.id, kind: item.kind as LayoutItemKind, x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation, label: item.label, seats: item.seats, ...(typeof item.color === 'string' ? { color: item.color } : {}) })
  }

  const dimensions: Array<['roomWidthFeet' | 'roomHeightFeet' | 'secondaryRoomWidthFeet' | 'secondaryRoomDepthFeet', number, number]> = [
    ['roomWidthFeet', 10, 300], ['roomHeightFeet', 10, 500],
    ['secondaryRoomWidthFeet', 10, 300], ['secondaryRoomDepthFeet', 10, 300],
  ]
  const normalized: EventLayoutDocument = { version: 1, name: candidate.name.trim(), items }
  for (const [key, min, max] of dimensions) {
    const dimension = candidate[key]
    if (dimension !== undefined) {
      if (!finiteNumber(dimension, min, max)) return null
      normalized[key] = dimension
    }
  }
  if (typeof candidate.updatedAt === 'string' && candidate.updatedAt.length <= 64) normalized.updatedAt = candidate.updatedAt
  return normalized
}
