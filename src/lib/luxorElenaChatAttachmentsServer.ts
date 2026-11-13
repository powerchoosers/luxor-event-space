import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { ElenaChatAttachmentInput } from '@/lib/luxorElenaAttachmentsServer'
import { getLuxorExpenseStorageConfig } from '@/lib/luxorExpensesServer'

export type ElenaChatStoredAttachment = {
  id: string
  file_name: string
  content_type: string
  kind: 'image' | 'document' | 'text'
  storage_path: string | null
  text_excerpt: string | null
}

const MAX_ATTACHMENTS = 5
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 12_000
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60
const ELENA_CHAT_STORAGE_PREFIX = 'elena-chat'

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

function kindFromMime(mime: string, filename: string): 'image' | 'document' | 'text' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) return 'document'
  if (mime === 'text/plain' || mime === 'text/csv' || filename.toLowerCase().endsWith('.txt') || filename.toLowerCase().endsWith('.csv')) {
    return 'text'
  }
  return null
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
  if (!response.ok) throw new Error('Could not save the Elena chat attachment.')
}

export function isElenaChatAttachmentStoragePath(chatId: string, storagePath: string) {
  if (!storagePath || storagePath.includes('..')) return false
  const prefix = `${ELENA_CHAT_STORAGE_PREFIX}/${chatId}/`
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length
}

export async function storeElenaChatAttachments(
  chatId: string,
  attachments: ElenaChatAttachmentInput[],
): Promise<ElenaChatStoredAttachment[]> {
  if (!attachments.length) return []
  if (attachments.length > MAX_ATTACHMENTS) throw new Error(`At most ${MAX_ATTACHMENTS} attachments can be saved per message.`)

  const stored: ElenaChatStoredAttachment[] = []
  for (const attachment of attachments) {
    const fileName = safeFileName(attachment.name)
    const mime = normalizeMime(attachment.type, fileName)
    const kind = kindFromMime(mime, fileName)
    if (!kind) {
      stored.push({
        id: crypto.randomUUID(),
        file_name: fileName,
        content_type: mime,
        kind: 'document',
        storage_path: null,
        text_excerpt: null,
      })
      continue
    }

    if (kind === 'text') {
      const text = typeof attachment.textContent === 'string' ? attachment.textContent.trim() : ''
      stored.push({
        id: crypto.randomUUID(),
        file_name: fileName,
        content_type: mime,
        kind: 'text',
        storage_path: null,
        text_excerpt: text ? text.slice(0, MAX_TEXT_CHARS) : null,
      })
      continue
    }

    const parsed = typeof attachment.dataUrl === 'string' ? parseDataUrl(attachment.dataUrl) : null
    if (!parsed) {
      stored.push({
        id: crypto.randomUUID(),
        file_name: fileName,
        content_type: mime,
        kind,
        storage_path: null,
        text_excerpt: null,
      })
      continue
    }

    if (kind === 'document' && parsed.bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`${fileName} exceeds the 8 MB PDF limit.`)
    }
    if (kind === 'image' && parsed.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`${fileName} exceeds the 5 MB photo limit.`)
    }
    if (kind === 'document' && parsed.bytes.byteLength >= 5 && new TextDecoder().decode(parsed.bytes.slice(0, 5)) !== '%PDF-') {
      throw new Error(`${fileName} is not a valid PDF.`)
    }

    const objectId = crypto.randomUUID()
    const storagePath = `${ELENA_CHAT_STORAGE_PREFIX}/${chatId}/${objectId}-${fileName}`
    const uploadType = kind === 'document'
      ? 'application/pdf'
      : (parsed.contentType.startsWith('image/') ? parsed.contentType : mime)
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

export async function signElenaChatAttachmentUrl(storagePath: string, downloadName: string) {
  const { url, key } = await getLuxorExpenseStorageConfig()
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client.storage
    .from('luxor-documents')
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS, { download: downloadName })
  if (error || !data?.signedUrl) throw new Error('Could not prepare the attachment preview link.')
  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
  }
}
