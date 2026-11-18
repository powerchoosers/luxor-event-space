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

export function validateNormalizedFieldRect(rect: LuxorNormalizedFieldRect): string | null {
  const values = [rect.x, rect.y, rect.w, rect.h]
  if (values.some((value) => !Number.isFinite(value))) return 'Field position must be numeric.'
  if (rect.page_index < 0 || !Number.isInteger(rect.page_index)) return 'Page index must be a whole number.'
  if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0) return 'Field size is invalid.'
  if (rect.x > 1 || rect.y > 1 || rect.w > 1 || rect.h > 1) return 'Field must stay within the page.'
  if (rect.x + rect.w > 1.0001 || rect.y + rect.h > 1.0001) return 'Field must stay within the page.'
  return null
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