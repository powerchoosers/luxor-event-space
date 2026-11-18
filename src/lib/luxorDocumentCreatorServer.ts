import 'server-only'

import { saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { postgrestSchemaUnavailable } from './luxorPostgrestSchema'
import { supabaseRest, supabaseRestStrict, SupabaseRestError } from './supabaseRestServer'
import { buildLuxorCreatedDocumentPdf } from './luxorDocumentCreatorPdfServer'
import {
  isLuxorCreatedDocumentType,
  type LuxorCreatedDocumentLibrarySection,
  type LuxorCreatedDocumentRow,
  type LuxorCreatedDocumentSummary,
  type LuxorCreatedDocumentType,
} from './luxorDocumentCreatorTypes'

const TABLE = 'luxor_created_documents'

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function pdfStoragePath(documentId: string, version: number) {
  return `created-documents/${safeFilePart(documentId)}/Luxor-Document-v${version}.pdf`
}

function rowFromRecord(record: Record<string, unknown>): LuxorCreatedDocumentRow | null {
  const id = typeof record.id === 'string' ? record.id : null
  if (!id) return null
  if (!isLuxorCreatedDocumentType(record.document_type)) return null
  return {
    id,
    created_at: String(record.created_at || ''),
    updated_at: String(record.updated_at || ''),
    title: String(record.title || ''),
    document_type: record.document_type,
    body_json: record.body_json && typeof record.body_json === 'object' && !Array.isArray(record.body_json)
      ? record.body_json as Record<string, unknown>
      : {},
    body_html: typeof record.body_html === 'string' ? record.body_html : '',
    is_template: Boolean(record.is_template),
    status: typeof record.status === 'string' ? record.status as LuxorCreatedDocumentRow['status'] : 'draft',
    archived_at: typeof record.archived_at === 'string' ? record.archived_at : null,
    created_by: String(record.created_by || ''),
    version: typeof record.version === 'number' ? record.version : 1,
    pdf_storage_path: typeof record.pdf_storage_path === 'string' ? record.pdf_storage_path : null,
    source_template_id: typeof record.source_template_id === 'string' ? record.source_template_id : null,
  }
}

export function schemaUnavailable(error: unknown) {
  return postgrestSchemaUnavailable(error) || (error instanceof SupabaseRestError && error.status === 404)
}

export async function listLuxorCreatedDocuments(input: {
  section: LuxorCreatedDocumentLibrarySection
  search?: string
  documentType?: LuxorCreatedDocumentType
  status?: string
  updatedFrom?: string
  updatedTo?: string
}): Promise<LuxorCreatedDocumentSummary[]> {
  const filters: string[] = ['select=id,created_at,updated_at,title,document_type,is_template,status,archived_at,created_by,version', 'order=updated_at.desc']
  if (input.section === 'archived') {
    filters.push('archived_at=not.is.null')
  } else if (input.section === 'templates') {
    filters.push('is_template=eq.true')
    filters.push('archived_at=is.null')
  } else {
    filters.push('is_template=eq.false')
    filters.push('archived_at=is.null')
    filters.push('status=eq.draft')
  }
  if (input.documentType) filters.push(`document_type=eq.${input.documentType}`)
  if (input.status && input.section !== 'archived') filters.push(`status=eq.${encodeURIComponent(input.status)}`)
  if (input.updatedFrom) filters.push(`updated_at=gte.${encodeURIComponent(input.updatedFrom)}`)
  if (input.updatedTo) filters.push(`updated_at=lte.${encodeURIComponent(input.updatedTo)}`)
  const path = `${TABLE}?${filters.join('&')}`
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(path)
  let summaries = rows.flatMap((row) => {
    const mapped = rowFromRecord(row)
    return mapped ? [mapped] : []
  })
  if (input.search?.trim()) {
    const needle = input.search.trim().toLowerCase()
    summaries = summaries.filter((row) => row.title.toLowerCase().includes(needle))
  }
  return summaries
}

export async function getLuxorCreatedDocument(id: string): Promise<LuxorCreatedDocumentRow | null> {
  const [row] = await supabaseRestStrict<Record<string, unknown>[]>(`${TABLE}?id=eq.${encodeURIComponent(id)}&limit=1`)
  return row ? rowFromRecord(row) : null
}

export async function createLuxorCreatedDocument(input: {
  title: string
  documentType: LuxorCreatedDocumentType
  bodyJson: Record<string, unknown>
  bodyHtml: string
  isTemplate: boolean
  createdBy: string
  sourceTemplateId?: string | null
}): Promise<LuxorCreatedDocumentRow> {
  const status = input.isTemplate ? 'template' : 'draft'
  const payload = {
    title: input.title.trim(),
    document_type: input.documentType,
    body_json: input.bodyJson,
    body_html: input.bodyHtml,
    is_template: input.isTemplate,
    status,
    created_by: input.createdBy,
    source_template_id: input.sourceTemplateId ?? null,
  }
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(`${TABLE}?select=*`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  const row = Array.isArray(rows) ? rows[0] : undefined
  const document = row && typeof row === 'object' ? rowFromRecord(row) : null
  if (!document) throw new Error('The document could not be saved.')
  return document
}

export async function updateLuxorCreatedDocument(input: {
  id: string
  expectedUpdatedAt: string
  title?: string
  documentType?: LuxorCreatedDocumentType
  bodyJson?: Record<string, unknown>
  bodyHtml?: string
  isTemplate?: boolean
  updatedBy: string
}): Promise<LuxorCreatedDocumentRow> {
  const patch: Record<string, unknown> = { version: undefined as unknown }
  if (input.title !== undefined) patch.title = input.title.trim()
  if (input.documentType !== undefined) patch.document_type = input.documentType
  if (input.bodyJson !== undefined) patch.body_json = input.bodyJson
  if (input.bodyHtml !== undefined) patch.body_html = input.bodyHtml
  if (input.isTemplate !== undefined) {
    patch.is_template = input.isTemplate
    patch.status = input.isTemplate ? 'template' : 'draft'
  }
  const existing = await getLuxorCreatedDocument(input.id)
  if (!existing) throw new SupabaseRestError('Document not found.', 404, 'PGRST116')
  patch.version = existing.version + 1

  const rows = await supabaseRestStrict<Record<string, unknown>[]>(
    `${TABLE}?id=eq.${encodeURIComponent(input.id)}&updated_at=eq.${encodeURIComponent(input.expectedUpdatedAt)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    },
  )
  const row = Array.isArray(rows) ? rows[0] : undefined
  const document = row && typeof row === 'object' ? rowFromRecord(row) : null
  if (!document) throw new SupabaseRestError('Document changed or is unavailable. Reload and try again.', 409, 'PGRST116')
  return document
}

export async function archiveLuxorCreatedDocument(input: {
  id: string
  expectedUpdatedAt: string
  action: 'archive' | 'restore'
  actorEmail: string
}): Promise<LuxorCreatedDocumentRow> {
  const existing = await getLuxorCreatedDocument(input.id)
  if (!existing) throw new SupabaseRestError('Document not found.', 404, 'PGRST116')
  const now = new Date().toISOString()
  const archivedAt = input.action === 'archive' ? now : null
  const status = input.action === 'archive' ? 'archived' : (existing.is_template ? 'template' : 'draft')
  const rows = await supabaseRestStrict<Record<string, unknown>[]>(
    `${TABLE}?id=eq.${encodeURIComponent(input.id)}&updated_at=eq.${encodeURIComponent(input.expectedUpdatedAt)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ archived_at: archivedAt, status, updated_at: now }),
    },
  )
  const row = Array.isArray(rows) ? rows[0] : undefined
  const document = row && typeof row === 'object' ? rowFromRecord(row) : null
  if (!document) throw new SupabaseRestError('Document changed or is unavailable. Reload and try again.', 409, 'PGRST116')
  return document
}

export async function duplicateLuxorCreatedDocument(input: {
  sourceId: string
  createdBy: string
}): Promise<LuxorCreatedDocumentRow> {
  const source = await getLuxorCreatedDocument(input.sourceId)
  if (!source) throw new SupabaseRestError('Template not found.', 404, 'PGRST116')
  return createLuxorCreatedDocument({
    title: `${source.title} (copy)`.slice(0, 300),
    documentType: source.document_type,
    bodyJson: source.body_json,
    bodyHtml: source.body_html,
    isTemplate: false,
    createdBy: input.createdBy,
    sourceTemplateId: source.is_template ? source.id : source.source_template_id,
  })
}

export async function renderLuxorCreatedDocumentPdf(document: LuxorCreatedDocumentRow): Promise<LuxorCreatedDocumentRow> {
  const pdf = await buildLuxorCreatedDocumentPdf({
    title: document.title,
    documentType: document.document_type,
    bodyJson: document.body_json,
  })
  const storagePath = pdfStoragePath(document.id, document.version)
  await saveLuxorPrivatePdf(storagePath, pdf)
  await supabaseRest<Record<string, unknown>[]>(
    `${TABLE}?id=eq.${encodeURIComponent(document.id)}&select=id`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ pdf_storage_path: storagePath }),
    },
  )
  const fresh = await getLuxorCreatedDocument(document.id)
  if (!fresh) throw new Error('The PDF was generated but the document record could not be reloaded.')
  return { ...fresh, pdf_storage_path: storagePath }
}

export async function signedPdfUrlForCreatedDocument(document: LuxorCreatedDocumentRow, fileName: string) {
  if (!document.pdf_storage_path) return null
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase configuration is missing on the server.')
  const response = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/sign/luxor-documents/${document.pdf_storage_path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 3600, download: fileName }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not sign the PDF URL: ${await response.text()}`)
  const body = await response.json() as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL || body.signedUrl
  if (!signed) throw new Error('The PDF URL could not be prepared.')
  return signed.startsWith('http') ? signed : `${url.replace(/\/$/, '')}/storage/v1${signed}`
}