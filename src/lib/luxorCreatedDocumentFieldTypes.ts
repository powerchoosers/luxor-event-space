import type { PortalStatusTone } from '@/components/portal/PortalUI'

export const LUXOR_CREATED_DOCUMENT_FIELD_TYPES = [
  'signature',
  'name',
  'date',
  'initials',
  'email',
  'text',
  'checkbox',
] as const

export type LuxorCreatedDocumentFieldType = (typeof LUXOR_CREATED_DOCUMENT_FIELD_TYPES)[number]

export const LUXOR_CREATED_DOCUMENT_FIELD_TYPE_LABELS: Record<LuxorCreatedDocumentFieldType, string> = {
  signature: 'Signature',
  name: 'Name',
  date: 'Date',
  initials: 'Initials',
  email: 'Email',
  text: 'Text',
  checkbox: 'Checkbox',
}

export const LUXOR_SIGNER_ROLE_TONES: PortalStatusTone[] = ['gold', 'blue', 'green', 'purple', 'red', 'warning']

export const DEFAULT_CREATED_DOCUMENT_SIGNER_ROLES = [
  { role_key: 'signer_1', role_label: 'Signer 1', sign_order: 1 },
  { role_key: 'signer_2', role_label: 'Signer 2', sign_order: 2 },
  { role_key: 'luxor', role_label: 'Luxor', sign_order: 3 },
] as const

export type LuxorCreatedDocumentFieldRow = {
  id: string
  document_id: string
  field_type: LuxorCreatedDocumentFieldType
  role_key: string
  label: string
  required: boolean
  page_index: number
  x: number
  y: number
  w: number
  h: number
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type LuxorCreatedDocumentSignerRow = {
  id: string
  document_id: string
  role_key: string
  role_label: string
  name: string
  email: string
  sign_order: number
  status: 'pending' | 'viewed' | 'signed' | 'declined' | 'expired'
  token_hash: string | null
  token_expires_at: string | null
  signed_at: string | null
  declined_at: string | null
  decline_reason: string | null
  viewed_at: string | null
  last_ip: string | null
  last_user_agent: string | null
  signed_pdf_path: string | null
  created_at?: string
  updated_at?: string
}

export function isLuxorCreatedDocumentFieldType(value: unknown): value is LuxorCreatedDocumentFieldType {
  return typeof value === 'string' && (LUXOR_CREATED_DOCUMENT_FIELD_TYPES as readonly string[]).includes(value)
}

export function canEditCreatedDocumentFields(status: string, archivedAt: string | null) {
  if (archivedAt) return false
  return status === 'draft' || status === 'template'
}

export function roleToneForIndex(index: number): PortalStatusTone {
  return LUXOR_SIGNER_ROLE_TONES[index % LUXOR_SIGNER_ROLE_TONES.length] ?? 'gold'
}

export type LuxorNormalizedFieldRect = {
  page_index: number
  x: number
  y: number
  w: number
  h: number
}

export function clampNormalizedFieldRect(rect: LuxorNormalizedFieldRect): LuxorNormalizedFieldRect {
  const w = Math.min(1, Math.max(0.04, rect.w))
  const h = Math.min(1, Math.max(0.025, rect.h))
  const x = Math.max(0, Math.min(1 - w, rect.x))
  const y = Math.max(0, Math.min(1 - h, rect.y))
  return { ...rect, x, y, w, h }
}

export function validateNormalizedFieldRect(rect: LuxorNormalizedFieldRect): string | null {
  const clamped = clampNormalizedFieldRect(rect)
  const values = [clamped.x, clamped.y, clamped.w, clamped.h]
  if (values.some((value) => !Number.isFinite(value))) return 'Field position must be numeric.'
  if (clamped.page_index < 0 || !Number.isInteger(clamped.page_index)) return 'Page index must be a whole number.'
  if (clamped.x < 0 || clamped.y < 0 || clamped.w <= 0 || clamped.h <= 0) return 'Field size is invalid.'
  if (clamped.x + clamped.w > 1.0001 || clamped.y + clamped.h > 1.0001) return 'Field must stay within the page.'
  return null
}

export function derivedSignerInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase()
  return letters.slice(0, 3)
}

export function resolveEffectiveSignerFieldValues(
  fields: Array<Pick<LuxorCreatedDocumentFieldRow, 'id' | 'field_type'>>,
  values: Record<string, unknown>,
  context: {
    signerName: string
    signerEmail: string
    signatureAdopted: boolean
    defaultDate: string
  },
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...values }
  for (const field of fields) {
    const existing = merged[field.id]
    if (field.field_type === 'checkbox') {
      if (existing === true) continue
      continue
    }
    if (field.field_type === 'initials' && context.signatureAdopted) {
      merged[field.id] = derivedSignerInitials(context.signerName) || 'IN'
      continue
    }
    if (typeof existing === 'string' && existing.trim()) continue
    if (field.field_type === 'name' && context.signerName.trim()) {
      merged[field.id] = context.signerName.trim()
      continue
    }
    if (field.field_type === 'email' && context.signerEmail.trim()) {
      merged[field.id] = context.signerEmail.trim()
      continue
    }
    if (field.field_type === 'date' && context.defaultDate) {
      merged[field.id] = context.defaultDate
      continue
    }
    if (field.field_type === 'signature' && context.signatureAdopted) {
      merged[field.id] = context.signerName.trim() || 'Signed'
    }
  }
  return merged
}

export function fieldValuesComplete(
  fields: Array<Pick<LuxorCreatedDocumentFieldRow, 'id' | 'field_type' | 'required'>>,
  values: Record<string, unknown>,
): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  for (const field of fields) {
    if (!field.required) continue
    const value = values[field.id]
    if (field.field_type === 'checkbox') {
      if (value !== true) missing.push(field.id)
      continue
    }
    if (typeof value !== 'string' || !value.trim()) missing.push(field.id)
  }
  return { ok: missing.length === 0, missing }
}