import type { LuxorCreatedDocumentFieldType } from './luxorCreatedDocumentFieldTypes'

export function defaultCreatedDocumentFieldRequired(fieldType: LuxorCreatedDocumentFieldType): boolean {
  switch (fieldType) {
    case 'signature':
    case 'initials':
    case 'name':
    case 'date':
    case 'email':
      return true
    case 'checkbox':
    case 'text':
    default:
      return false
  }
}

export function defaultCreatedDocumentFieldSize(fieldType: LuxorCreatedDocumentFieldType): { w: number; h: number } {
  if (fieldType === 'signature') return { w: 0.42, h: 0.08 }
  if (fieldType === 'checkbox') return { w: 0.05, h: 0.035 }
  return { w: 0.3, h: 0.05 }
}

export function luxorChicagoDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export type NormalizedPlacementRect = {
  page_index: number
  x: number
  y: number
  w: number
  h: number
}

export function normalizedFieldOverlayStyle(rect: Pick<NormalizedPlacementRect, 'x' | 'y' | 'w' | 'h'>) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  } as const
}

export function pointerToNormalizedTopLeft(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  field: Pick<NormalizedPlacementRect, 'w' | 'h'>,
): { x: number; y: number } {
  const nx = (clientX - bounds.left) / bounds.width
  const ny = (clientY - bounds.top) / bounds.height
  const x = Math.max(0, Math.min(1 - field.w, nx - field.w / 2))
  const y = Math.max(0, Math.min(1 - field.h, ny - field.h / 2))
  return { x, y }
}

export function nextPaletteFieldPlacement(
  existing: Array<Pick<NormalizedPlacementRect, 'x' | 'y'>>,
  baseX = 0.12,
  baseY = 0.62,
): { x: number; y: number } {
  const offset = existing.length * 0.04
  return {
    x: Math.min(0.72, baseX + (offset % 3) * 0.06),
    y: Math.min(0.82, baseY + Math.floor(offset / 3) * 0.05),
  }
}

export function createdDocumentSignClientStatus(message: string): number {
  if (/not found/i.test(message)) return 404
  if (/expired|cancelled|no longer active/i.test(message)) return 410
  return 400
}

export function signerNeedsAdoptedSignature(
  fieldTypes: Iterable<LuxorCreatedDocumentFieldType | string>,
): boolean {
  for (const type of fieldTypes) {
    if (type === 'signature' || type === 'initials') return true
  }
  return false
}