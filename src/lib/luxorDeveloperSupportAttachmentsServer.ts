import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getLuxorExpenseStorageConfig } from '@/lib/luxorExpensesServer'

export type DeveloperSupportAttachmentInput = {
  name: string
  type: string
  dataUrl?: string
  textContent?: string
  storagePath?: string
}

export type DeveloperSupportStoredAttachment = {
  id: string
  file_name: string
  content_type: string
  kind: 'image' | 'pdf' | 'text'
  storage_path: string | null
  text_excerpt: string | null
}

const STORAGE_PATH_PATTERN = /^(elena-chat|developer-support)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/

const MAX_ATTACHMENTS = 5
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 12_000
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60

function safeFileName(value: string) {
  const basename = value.split(/[\\/]/).pop() || 'attachment'
  const cleaned = basename.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/[ ]+/g, '_').slice(0, 120)
  return cleaned || 'attachment'
}

function normalizeMime(type: string, filename: string) {
  const lowered = (type || '').trim().toLowerCase()
  if (lowered) return lowered
  const name = filename.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.txt')) return 'text/plain'
  if (name.endsWith('.csv')) return 'text/csv'
  return 'application/octet-stream'
}

function parseDataUrl(dataUrl: string): { contentType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl)
  if (!match) return null
  const mime = (match[1] || 'application/octet-stream').toLowerCase()
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  try {
    if (isBase64) {
      const buf = Buffer.from(payload, 'base64')
      return { contentType: mime, bytes: new Uint8Array(buf) }
    }
    const decoded = decodeURIComponent(payload)
    return { contentType: mime, bytes: new Uint8Array(Buffer.from(decoded, 'utf8')) }
  } catch {
    return null
  }
}

function kindFromMime(mime: string, filename: string): 'image' | 'pdf' | 'text' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mime === 'text/plain' || mime === 'text/csv' || filename.toLowerCase().endsWith('.txt') || filename.toLowerCase().endsWith('.csv')) {
    return 'text'
  }
  return null
}

export function parseDeveloperSupportAttachmentInputs(input: unknown): DeveloperSupportAttachmentInput[] {
  if (input == null) return []
  if (!Array.isArray(input)) throw new Error('Invalid support attachments.')
  if (input.length > MAX_ATTACHMENTS) throw new Error(`At most ${MAX_ATTACHMENTS} attachments can be sent with a developer ticket.`)
  const out: DeveloperSupportAttachmentInput[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid support attachments.')
    const value = item as Record<string, unknown>
    if (Object.keys(value).some((key) => !['name', 'type', 'dataUrl', 'textContent', 'storagePath'].includes(key))) {
      throw new Error('Invalid support attachments.')
    }
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 200) throw new Error('Invalid support attachments.')
    if (typeof value.type !== 'string' || value.type.length > 120) throw new Error('Invalid support attachments.')
    const name = value.name.trim()
    const type = value.type.trim()
    const storagePath = typeof value.storagePath === 'string' ? value.storagePath.trim() : ''
    if (storagePath) {
      if (!STORAGE_PATH_PATTERN.test(storagePath) || storagePath.includes('..')) throw new Error('Invalid support attachments.')
      out.push({
        name,
        type,
        storagePath,
        ...(typeof value.textContent === 'string' && value.textContent.length > 0 && value.textContent.length <= MAX_TEXT_CHARS
          ? { textContent: value.textContent }
          : {}),
      })
      continue
    }
    if (value.textContent != null) {
      if (typeof value.textContent !== 'string' || value.textContent.length > MAX_TEXT_CHARS) throw new Error('Invalid support attachments.')
      out.push({ name, type, textContent: value.textContent })
      continue
    }
    if (typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:')) {
      out.push({ name, type, dataUrl: value.dataUrl })
      continue
    }
    throw new Error('Invalid support attachments.')
  }
  return out
}

export async function stageDeveloperSupportUpload(
  stagingId: string,
  fileName: string,
  type: string,
  bytes: Uint8Array,
): Promise<{ storagePath: string; contentType: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stagingId)) {
    throw new Error('Invalid upload.')
  }
  const safeName = safeFileName(fileName)
  const mime = normalizeMime(type, safeName)
  const kind = kindFromMime(mime, safeName)
  if (!kind || kind === 'text') throw new Error(`${safeName} is not a supported developer ticket attachment.`)
  if (kind === 'pdf' && bytes.byteLength > MAX_PDF_BYTES) throw new Error(`${safeName} exceeds the 8 MB PDF limit.`)
  if (kind === 'image' && bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`${safeName} exceeds the 5 MB photo limit.`)
  if (kind === 'pdf' && bytes.byteLength >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error(`${safeName} is not a valid PDF.`)
  }
  const objectId = crypto.randomUUID()
  const storagePath = `developer-support/${stagingId}/${objectId}-${safeName}`
  const uploadType = kind === 'pdf' ? 'application/pdf' : (mime.startsWith('image/') ? mime : 'application/octet-stream')
  await uploadObject(storagePath, bytes, uploadType)
  return { storagePath, contentType: uploadType }
}

async function uploadObject(path: string, bytes: Uint8Array, contentType: string) {
  const { url, key } = await getLuxorExpenseStorageConfig()
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: Buffer.from(bytes),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Could not save a screenshot or file for the developer ticket.')
}

export async function storeDeveloperSupportAttachments(
  confirmationId: string,
  attachments: DeveloperSupportAttachmentInput[],
): Promise<DeveloperSupportStoredAttachment[]> {
  if (!attachments.length) return []
  const stored: DeveloperSupportStoredAttachment[] = []
  for (const attachment of attachments) {
    const fileName = safeFileName(attachment.name)
    const mime = normalizeMime(attachment.type, fileName)
    const kind = kindFromMime(mime, fileName)
    if (!kind) throw new Error(`${fileName} is not a supported developer ticket attachment.`)

    if (attachment.storagePath && STORAGE_PATH_PATTERN.test(attachment.storagePath)) {
      stored.push({
        id: crypto.randomUUID(),
        file_name: fileName,
        content_type: mime,
        kind,
        storage_path: kind === 'text' ? null : attachment.storagePath,
        text_excerpt: kind === 'text' && attachment.textContent ? attachment.textContent.slice(0, MAX_TEXT_CHARS) : null,
      })
      continue
    }

    if (kind === 'text') {
      const text = typeof attachment.textContent === 'string' ? attachment.textContent.trim() : ''
      if (!text) throw new Error(`${fileName} did not include readable text.`)
      stored.push({
        id: crypto.randomUUID(),
        file_name: fileName,
        content_type: mime,
        kind: 'text',
        storage_path: null,
        text_excerpt: text.slice(0, MAX_TEXT_CHARS),
      })
      continue
    }

    const parsed = typeof attachment.dataUrl === 'string' ? parseDataUrl(attachment.dataUrl) : null
    if (!parsed) throw new Error(`${fileName} could not be read.`)

    if (kind === 'pdf' && parsed.bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`${fileName} exceeds the 8 MB PDF limit.`)
    }
    if (kind === 'image' && parsed.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`${fileName} exceeds the 5 MB photo limit.`)
    }
    if (kind === 'pdf' && parsed.bytes.byteLength >= 5 && new TextDecoder().decode(parsed.bytes.slice(0, 5)) !== '%PDF-') {
      throw new Error(`${fileName} is not a valid PDF.`)
    }

    const objectId = crypto.randomUUID()
    const storagePath = `developer-support/${confirmationId}/${objectId}-${fileName}`
    const uploadType = kind === 'pdf' ? 'application/pdf' : (parsed.contentType.startsWith('image/') ? parsed.contentType : mime)
    await uploadObject(storagePath, parsed.bytes, uploadType)
    stored.push({
      id: objectId,
      file_name: fileName,
      content_type: uploadType,
      kind,
      storage_path: storagePath,
      text_excerpt: null,
    })
  }
  return stored
}

export async function signDeveloperSupportAttachmentUrls(
  attachments: DeveloperSupportStoredAttachment[],
): Promise<Array<DeveloperSupportStoredAttachment & { signed_url: string | null }>> {
  const { url, key } = await getLuxorExpenseStorageConfig()
  const client = createClient(url, key, { auth: { persistSession: false } })
  const signed: Array<DeveloperSupportStoredAttachment & { signed_url: string | null }> = []
  for (const attachment of attachments) {
    if (!attachment.storage_path) {
      signed.push({ ...attachment, signed_url: null })
      continue
    }
    const { data, error } = await client.storage
      .from('luxor-documents')
      .createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS, { download: attachment.file_name })
    if (error || !data?.signedUrl) throw new Error('Could not prepare developer ticket file links.')
    signed.push({ ...attachment, signed_url: data.signedUrl })
  }
  return signed
}
