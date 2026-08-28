import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorZohoMessage } from './zohoMailServer'
import { luxorMailFolder, luxorMailFolderCatalog, luxorMailFolderCondition } from './luxorMailFolders'

export async function listLuxorReleasedMailFolders() {
  const releases = await supabaseRest<Array<{ account_id: string; folders: Record<string, unknown>[] }>>(
    'rpc/luxor_mail_released_folders', { method: 'POST', body: '{}' })
  return releases.flatMap(release => luxorMailFolderCatalog(release.account_id, release.folders))
}

export type LuxorMailRow = {
  id: string; provider: 'resend' | 'zoho'; provider_id: string | null
  direction: 'incoming' | 'outgoing'; internet_message_id: string | null; thread_key: string
  from_address: string; to_addresses: string[]; cc_addresses: string[]; reply_to_addresses: string[]
  reference_ids: string[]; subject: string; text_body: string; html_body: string | null
  status: string; idempotency_key: string | null; payload_hash: string | null
  created_at: string; occurred_at: string; attempted_at: string | null; accepted_at: string | null
  read_at: string | null; last_error: string | null; metadata: Record<string, unknown>
}

export type LuxorMailAttachmentRow = {
  id: string; message_id: string; source_key: string; filename: string
  content_type: string; content_id: string | null; size_bytes: number; storage_path: string
}

export function mailLocalId(id: string) {
  const value = id.replace(/^mail-/, '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid mailbox message ID.')
  return value
}

export async function getLuxorMailRow(id: string) {
  const rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&id=eq.${mailLocalId(id)}&limit=1`)
  return rows[0] || null
}

/** Resolve existing portal links without requiring Zoho after a verified import. */
export async function resolveLuxorMailboxRow(id: string) {
  if (id.startsWith('mail-')) return getLuxorMailRow(id)
  if (!/^\d+$/.test(id)) return null
  const rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&provider=eq.zoho&metadata->>zohoMessageId=eq.${id}&metadata->>importComplete=eq.true&status=neq.importing&or=(metadata->>historyStaged.is.null,metadata->>historyStaged.eq.false)&and=(or(metadata->>historySuperseded.is.null,metadata->>historySuperseded.eq.false))&limit=2`)
  if (rows.length > 1) throw new Error('This legacy email identifier matches more than one imported mailbox. Open the archived message directly.')
  return rows[0] || null
}

export async function updateLuxorMailRow(id: string, changes: Partial<LuxorMailRow>) {
  await supabaseRest(`luxor_mail_messages?id=eq.${mailLocalId(id)}`, {
    method: 'PATCH', body: JSON.stringify(changes),
  })
}

export async function setLuxorMailboxRead(id: string, isRead: boolean) {
  const rows = await supabaseRest<Array<{ id: string; read_at: string | null }>>(
    `luxor_mail_messages?id=eq.${mailLocalId(id)}&direction=eq.incoming&select=id,read_at`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ read_at: isRead ? new Date().toISOString() : null }),
    },
  )
  return rows[0] ? { id: `mail-${rows[0].id}`, isRead: Boolean(rows[0].read_at) } : null
}

function storageConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Private mailbox storage is not configured.')
  return { url: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

export async function saveLuxorMailAttachment(input: {
  messageId: string; sourceKey: string; filename: string; contentType: string; bytes: Uint8Array; contentId?: string | null
}) {
  const messageId = mailLocalId(input.messageId)
  if (input.bytes.byteLength > 40 * 1024 * 1024) throw new Error('Email attachment exceeds the 40 MB archive limit.')
  const digest = createHash('sha256').update(input.bytes).digest('hex')
  const storagePath = `${messageId}/${digest}`
  const config = storageConfig()
  const result = await fetch(`${config.url}/storage/v1/object/luxor-mail/${storagePath}`, {
    method: 'PUT', headers: { ...config.headers, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
    body: Buffer.from(input.bytes), cache: 'no-store', signal: AbortSignal.timeout(30_000),
  })
  if (!result.ok) throw new Error(`Private email attachment storage failed (${result.status}).`)
  const rows = await supabaseRest<LuxorMailAttachmentRow[]>('luxor_mail_attachments?on_conflict=message_id,source_key&select=*', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ message_id: messageId, source_key: input.sourceKey,
      filename: input.filename.replace(/[\r\n\u0000]/g, '').slice(0, 255) || 'attachment',
      content_type: input.contentType, content_id: input.contentId || null,
      size_bytes: input.bytes.byteLength, storage_path: storagePath }),
  })
  if (!rows?.[0]) throw new Error('Email attachment metadata could not be saved.')
  return rows[0]
}

export async function listLuxorMailAttachments(messageId: string) {
  const id = mailLocalId(messageId)
  const all: LuxorMailAttachmentRow[] = []
  // The original MIME is itself an archive part. A message with 1,000 files
  // therefore exceeds PostgREST's default 1,000-row response ceiling.
  for (let offset = 0; ; offset += 500) {
    const page = await supabaseRest<LuxorMailAttachmentRow[]>(`luxor_mail_attachments?select=*&message_id=eq.${id}&order=created_at.asc,id.asc&limit=500&offset=${offset}`)
    all.push(...page)
    if (page.length < 500) return all
  }
}

export async function downloadLuxorMailAttachment(messageId: string, attachmentId: string) {
  const attachments = await listLuxorMailAttachments(messageId)
  const attachment = attachments.find((item) => item.id === attachmentId)
  if (!attachment) throw new Error('Attachment not found in this message.')
  const config = storageConfig()
  const result = await fetch(`${config.url}/storage/v1/object/luxor-mail/${attachment.storage_path}`, {
    headers: config.headers, cache: 'no-store', signal: AbortSignal.timeout(30_000),
  })
  if (!result.ok) throw new Error('The saved email attachment could not be loaded.')
  return { bytes: new Uint8Array(await result.arrayBuffer()), contentType: attachment.content_type, filename: attachment.filename }
}

export function luxorMailMessage(row: LuxorMailRow, attachments: LuxorMailAttachmentRow[] = []): LuxorZohoMessage {
  attachments = attachments.filter((item) => item.source_key !== 'raw-message')
  const id = `mail-${row.id}`
  const fromName = typeof row.metadata.fromName === 'string' ? row.metadata.fromName.replace(/[\r\n"<>]/g, '').trim().slice(0, 200) : ''
  let htmlContent = row.html_body
  for (const attachment of attachments) {
    if (!attachment.content_id || !htmlContent) continue
    const path = `/api/email/attachments/${id}?attachmentId=${attachment.id}&filename=${encodeURIComponent(attachment.filename)}`
    htmlContent = htmlContent.split(`cid:${attachment.content_id.replace(/^<|>$/g, '')}`).join(path)
  }
  return {
    id, threadId: row.thread_key, ...luxorMailFolder(row),
    subject: row.subject, from: fromName ? `${fromName} <${row.from_address}>` : row.from_address, to: row.to_addresses.join(', '), cc: row.cc_addresses.join(', '),
    receivedAt: row.occurred_at, summary: row.text_body.replace(/\s+/g, ' ').slice(0, 280),
    content: row.text_body, htmlContent, hasAttachment: attachments.length > 0 || Boolean(row.metadata.hasAttachments),
    isRead: Boolean(row.read_at) || row.direction === 'outgoing', direction: row.direction,
    deliveryStatus: row.direction === 'outgoing' ? row.status : undefined,
    deliveryError: row.direction === 'outgoing' ? row.last_error : null,
    attachments: attachments.map((item) => ({ messageId: id, attachmentId: item.id,
      filename: item.filename, mimeType: item.content_type, size: item.size_bytes })),
  }
}

export async function getLuxorMailboxMessage(id: string) {
  const row = await getLuxorMailRow(id)
  if (!row) throw new Error('Mailbox message not found.')
  if (row.status === 'importing') throw new Error('This historical email is still importing. Please retry after its attachments are saved.')
  if (row.metadata.historyStaged === true) throw new Error('This historical email is awaiting migration reconciliation.')
  return luxorMailMessage(row, await listLuxorMailAttachments(row.id))
}

export async function listLuxorMailboxMessages(options: { limit?: number; email?: string; threadId?: string; folder?: string; withAttachments?: boolean } = {}) {
  const limit = Math.min(1000, Math.max(1, options.limit || 1000))
  const params = new URLSearchParams({ select: '*', order: 'occurred_at.desc', limit: String(limit), status: 'neq.importing' })
  const folderCondition = luxorMailFolderCondition(options.folder || 'all')
  params.set('and', `(or(metadata->>historyStaged.is.null,metadata->>historyStaged.eq.false),or(metadata->>historySuperseded.is.null,metadata->>historySuperseded.eq.false)${folderCondition ? `,${folderCondition}` : ''})`)
  if (options.threadId) params.set('thread_key', `eq.${options.threadId}`)
  // PostgREST logical expressions require quoted values, not just URL encoding.
  if (options.email) {
    const value = options.email.replace(/\\/g, '\\\\').replace(/"/g, '\\"').toLowerCase()
    params.set('or', `(from_address.eq."${value}",to_addresses.cs.{"${value}"},cc_addresses.cs.{"${value}"})`)
  }
  const rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?${params}`)
  const attachments = options.withAttachments && rows.length
    ? await supabaseRest<LuxorMailAttachmentRow[]>(`luxor_mail_attachments?select=*&message_id=in.(${rows.map((row) => row.id).join(',')})`)
    : []
  const byMessage = new Map<string, LuxorMailAttachmentRow[]>()
  for (const attachment of attachments) {
    const group = byMessage.get(attachment.message_id) || []
    group.push(attachment)
    byMessage.set(attachment.message_id, group)
  }
  return rows.map((row) => ({ ...luxorMailMessage(row, byMessage.get(row.id)), ...luxorMailFolder(row),
    storedLocally: true, emailJobId: row.metadata.emailJobId,
    legacyMessageId: row.provider === 'zoho' && row.metadata.importComplete === true && typeof row.metadata.zohoMessageId === 'string' ? row.metadata.zohoMessageId : undefined }))
}

/** Suppress superseded legacy previews even when their replacement is outside
 * the current folder or date window. Staged history must not hide live Zoho mail. */
export async function findLuxorImportedLegacyIds(ids: string[]) {
  const candidates = Array.from(new Set(ids.filter((id) => /^\d+$/.test(id))))
  const replaced = new Set<string>()
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const params = new URLSearchParams({ select: 'legacy_id:metadata->>zohoMessageId', provider: 'eq.zoho',
      'metadata->>importComplete': 'eq.true', status: 'neq.importing',
      'metadata->>zohoMessageId': `in.(${candidates.slice(offset, offset + 100).join(',')})`,
      or: '(metadata->>historyStaged.is.null,metadata->>historyStaged.eq.false)',
      and: '(or(metadata->>historySuperseded.is.null,metadata->>historySuperseded.eq.false))' })
    const rows = await supabaseRest<Array<{ legacy_id: string }>>(`luxor_mail_messages?${params}`)
    for (const row of rows) replaced.add(row.legacy_id)
  }
  return replaced
}

export async function prepareLuxorOutbox(input: {
  from: string; to: string; subject: string; text: string; html: string | null;
  idempotencyKey: string; payloadHash: string; threadId?: string; references?: string[]; metadata?: Record<string, unknown>
  smtpMessageId?: boolean
}) {
  const id = randomUUID()
  await supabaseRest('luxor_mail_messages?on_conflict=idempotency_key', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ id, provider: 'resend', direction: 'outgoing',
      // API delivery assigns its own Internet Message-ID. Never expose a
      // placeholder as a reply parent while waiting for provider reconciliation.
      internet_message_id: input.smtpMessageId ? `<${id}@luxoratlaspalmas.com>` : null, thread_key: input.threadId || `mail-${id}`,
      from_address: input.from, to_addresses: [input.to], subject: input.subject,
      text_body: input.text, html_body: input.html, reference_ids: input.references || [], status: 'prepared',
      idempotency_key: input.idempotencyKey, payload_hash: input.payloadHash, metadata: input.metadata || {} }),
  })
  const rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&limit=1`)
  const row = rows[0]
  if (!row) throw new Error('The outgoing email could not be saved. Nothing was sent.')
  if (row.payload_hash !== input.payloadHash) throw new Error('This email retry has different content. Review the original before sending again.')
  if (!row.accepted_at && row.attempted_at && Date.now() - Date.parse(row.attempted_at) > 23 * 60 * 60_000) {
    throw new Error('This email needs delivery reconciliation before retrying; the provider duplicate-protection window has expired.')
  }
  return row
}
