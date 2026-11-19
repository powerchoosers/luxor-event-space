import 'server-only'

import { supabaseRestStrict } from './supabaseRestServer'
import {
  DEFAULT_CREATED_DOCUMENT_SIGNER_ROLES,
  isLuxorCreatedDocumentFieldType,
  clampNormalizedFieldRect,
  validateNormalizedFieldRect,
  type LuxorCreatedDocumentFieldRow,
  type LuxorCreatedDocumentFieldType,
  type LuxorCreatedDocumentSignerRow,
} from './luxorCreatedDocumentFieldTypes'

const FIELD_TABLE = 'luxor_created_document_fields'
const SIGNER_TABLE = 'luxor_created_document_signers'
const EVENT_TABLE = 'luxor_created_document_events'

function fieldFromRecord(row: Record<string, unknown>): LuxorCreatedDocumentFieldRow | null {
  const id = typeof row.id === 'string' ? row.id : null
  const documentId = typeof row.document_id === 'string' ? row.document_id : null
  if (!id || !documentId || !isLuxorCreatedDocumentFieldType(row.field_type)) return null
  return {
    id,
    document_id: documentId,
    field_type: row.field_type,
    role_key: String(row.role_key || ''),
    label: typeof row.label === 'string' ? row.label : '',
    required: Boolean(row.required),
    page_index: Number(row.page_index ?? 0),
    x: Number(row.x),
    y: Number(row.y),
    w: Number(row.w),
    h: Number(row.h),
    sort_order: Number(row.sort_order ?? 0),
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  }
}

function signerFromRecord(row: Record<string, unknown>): LuxorCreatedDocumentSignerRow | null {
  const id = typeof row.id === 'string' ? row.id : null
  const documentId = typeof row.document_id === 'string' ? row.document_id : null
  if (!id || !documentId) return null
  const status = typeof row.status === 'string' ? row.status : 'pending'
  return {
    id,
    document_id: documentId,
    role_key: String(row.role_key || ''),
    role_label: String(row.role_label || ''),
    name: typeof row.name === 'string' ? row.name : '',
    email: typeof row.email === 'string' ? row.email : '',
    sign_order: Number(row.sign_order ?? 1),
    status: status as LuxorCreatedDocumentSignerRow['status'],
    token_hash: typeof row.token_hash === 'string' ? row.token_hash : null,
    token_expires_at: typeof row.token_expires_at === 'string' ? row.token_expires_at : null,
    signed_at: typeof row.signed_at === 'string' ? row.signed_at : null,
    declined_at: typeof row.declined_at === 'string' ? row.declined_at : null,
    decline_reason: typeof row.decline_reason === 'string' ? row.decline_reason : null,
    viewed_at: typeof row.viewed_at === 'string' ? row.viewed_at : null,
    last_ip: typeof row.last_ip === 'string' ? row.last_ip : null,
    last_user_agent: typeof row.last_user_agent === 'string' ? row.last_user_agent : null,
    signed_pdf_path: typeof row.signed_pdf_path === 'string' ? row.signed_pdf_path : null,
    invited_at: typeof row.invited_at === 'string' ? row.invited_at : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  }
}

export async function listLuxorCreatedDocumentFields(documentId: string) {
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(
    `${FIELD_TABLE}?document_id=eq.${encodeURIComponent(documentId)}&select=*&order=sort_order.asc,page_index.asc`,
  )
  return rows.flatMap((row) => {
    const mapped = fieldFromRecord(row)
    return mapped ? [mapped] : []
  })
}

export async function listLuxorCreatedDocumentSigners(documentId: string) {
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(
    `${SIGNER_TABLE}?document_id=eq.${encodeURIComponent(documentId)}&select=*&order=sign_order.asc`,
  )
  return rows.flatMap((row) => {
    const mapped = signerFromRecord(row)
    return mapped ? [mapped] : []
  })
}

export async function ensureDefaultLuxorCreatedDocumentSigners(documentId: string) {
  const existing = await listLuxorCreatedDocumentSigners(documentId)
  if (existing.length > 0) return existing
  const created: LuxorCreatedDocumentSignerRow[] = []
  for (const role of DEFAULT_CREATED_DOCUMENT_SIGNER_ROLES) {
    const [row] = await supabaseRestStrict<Record<string, unknown>[]>(`${SIGNER_TABLE}?select=*`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        document_id: documentId,
        role_key: role.role_key,
        role_label: role.role_label,
        sign_order: role.sign_order,
      }),
    })
    const mapped = row && typeof row === 'object' ? signerFromRecord(row) : null
    if (mapped) created.push(mapped)
  }
  return created
}

export type UpsertFieldInput = {
  id?: string
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
}

export function validateLuxorCreatedFieldInput(field: UpsertFieldInput) {
  if (!field.role_key.trim()) return 'Each field needs a signer role.'
  const clamped = clampNormalizedFieldRect(field)
  Object.assign(field, { x: clamped.x, y: clamped.y, w: clamped.w, h: clamped.h })
  const rectError = validateNormalizedFieldRect(field)
  if (rectError) return rectError
  if (!field.label.trim()) return 'Each field needs a label.'
  return null
}

export async function replaceLuxorCreatedDocumentFields(documentId: string, fields: UpsertFieldInput[]) {
  for (const field of fields) {
    const error = validateLuxorCreatedFieldInput(field)
    if (error) throw new Error(error)
  }
  await supabaseRestStrict(`${FIELD_TABLE}?document_id=eq.${encodeURIComponent(documentId)}`, { method: 'DELETE' })
  if (fields.length === 0) return []
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(`${FIELD_TABLE}?select=*`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(fields.map((field) => ({
      document_id: documentId,
      field_type: field.field_type,
      role_key: field.role_key.trim(),
      label: field.label.trim().slice(0, 200),
      required: field.required,
      page_index: field.page_index,
      x: field.x,
      y: field.y,
      w: field.w,
      h: field.h,
      sort_order: field.sort_order,
    }))),
  })
  return rows.flatMap((row) => {
    const mapped = fieldFromRecord(row)
    return mapped ? [mapped] : []
  })
}

export async function replaceLuxorCreatedDocumentSignerLabels(
  documentId: string,
  signers: Array<{ id: string; role_label: string; name?: string; email?: string }>,
) {
  const updated: LuxorCreatedDocumentSignerRow[] = []
  for (const signer of signers) {
    const rows = await supabaseRestStrict<Record<string, unknown>[]>(
      `${SIGNER_TABLE}?id=eq.${encodeURIComponent(signer.id)}&document_id=eq.${encodeURIComponent(documentId)}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          role_label: signer.role_label.trim().slice(0, 120),
          ...(signer.name !== undefined ? { name: signer.name.trim().slice(0, 200) } : {}),
          ...(signer.email !== undefined ? { email: signer.email.trim().slice(0, 320) } : {}),
        }),
      },
    )
    const row = Array.isArray(rows) ? rows[0] : undefined
    const mapped = row && typeof row === 'object' ? signerFromRecord(row) : null
    if (mapped) updated.push(mapped)
  }
  return updated
}

export async function copyLuxorCreatedDocumentFieldsAndSigners(sourceDocumentId: string, targetDocumentId: string) {
  const [fields, signers] = await Promise.all([
    listLuxorCreatedDocumentFields(sourceDocumentId),
    listLuxorCreatedDocumentSigners(sourceDocumentId),
  ])
  if (signers.length === 0) {
    await ensureDefaultLuxorCreatedDocumentSigners(targetDocumentId)
  } else {
    for (const signer of signers) {
      await supabaseRestStrict(`${SIGNER_TABLE}?select=id`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          document_id: targetDocumentId,
          role_key: signer.role_key,
          role_label: signer.role_label,
          name: signer.name,
          email: signer.email,
          sign_order: signer.sign_order,
        }),
      })
    }
  }
  if (fields.length > 0) {
    await supabaseRestStrict(`${FIELD_TABLE}?select=id`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(fields.map((field, index) => ({
        document_id: targetDocumentId,
        field_type: field.field_type,
        role_key: field.role_key,
        label: field.label,
        required: field.required,
        page_index: field.page_index,
        x: field.x,
        y: field.y,
        w: field.w,
        h: field.h,
        sort_order: index,
      }))),
    })
  }
}

export async function listLuxorCreatedDocumentFieldsForRole(documentId: string, roleKey: string) {
  const fields = await listLuxorCreatedDocumentFields(documentId)
  return fields.filter((field) => field.role_key === roleKey)
}

export async function getLuxorCreatedDocumentSignerByTokenHash(tokenHash: string) {
  const [row] = await supabaseRestStrict<Record<string, unknown>[]>(
    `${SIGNER_TABLE}?token_hash=eq.${encodeURIComponent(tokenHash)}&select=*&limit=1`,
  )
  return row && typeof row === 'object' ? signerFromRecord(row) : null
}

export async function getLuxorCreatedDocumentSignerById(id: string) {
  const [row] = await supabaseRestStrict<Record<string, unknown>[]>(
    `${SIGNER_TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )
  return row && typeof row === 'object' ? signerFromRecord(row) : null
}

export async function recordLuxorCreatedDocumentEvent(input: {
  documentId: string
  signerId?: string | null
  eventType: string
  payload?: Record<string, unknown>
}) {
  await supabaseRestStrict(`${EVENT_TABLE}?select=id`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      document_id: input.documentId,
      signer_id: input.signerId ?? null,
      event_type: input.eventType,
      payload: input.payload ?? {},
    }),
  })
}

export async function latestLuxorCreatedDocumentSignedEventPayload(signerId: string) {
  const rows = await supabaseRestStrict<Array<{ payload?: unknown }>>(
    `${EVENT_TABLE}?signer_id=eq.${encodeURIComponent(signerId)}&event_type=eq.signed&select=payload&order=created_at.desc&limit=1`,
  )
  const payload = rows[0]?.payload
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

export async function updateLuxorCreatedDocumentSigner(
  id: string,
  patch: Record<string, unknown>,
): Promise<LuxorCreatedDocumentSignerRow | null> {
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(
    `${SIGNER_TABLE}?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    },
  )
  const row = Array.isArray(rows) ? rows[0] : undefined
  return row && typeof row === 'object' ? signerFromRecord(row) : null
}

export { signerFromRecord, fieldFromRecord }