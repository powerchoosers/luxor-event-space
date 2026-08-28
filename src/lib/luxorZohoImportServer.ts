import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import PostalMime, { type Address } from 'postal-mime'
import { getLuxorZohoOriginalMessage, type LuxorZohoImportFolder, type LuxorZohoImportMessage } from './zohoMailServer'
import { luxorMailAddress } from './luxorMailConfig'
import { supabaseRest } from './supabaseRestServer'
import { downloadLuxorMailAttachment, getLuxorMailRow, listLuxorMailAttachments, saveLuxorMailAttachment, type LuxorMailRow } from './luxorMailboxServer'

function mailboxes(values: Address[] = []): string[] {
  return Array.from(new Set(values.flatMap((value) => value.group || [value])
    .map((value) => luxorMailAddress(value.address || '')).filter(Boolean)))
}

function messageIds(value?: string) { return value?.match(/<[^<>\s]+>/g) || [] }

function attachmentBytes(content: ArrayBuffer | Uint8Array | string, encoding?: 'base64' | 'utf8', mimeType?: string) {
  const bytes = typeof content === 'string' ? Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8')
    : content instanceof Uint8Array ? Buffer.from(content) : Buffer.from(content)
  // The MIME decoder normalizes unencoded text line endings. Calendar files
  // must use iCalendar's CRLF convention; the untouched original MIME is also
  // archived so no source representation is lost.
  return mimeType === 'text/calendar' ? Buffer.from(bytes.toString('utf8').replace(/\r?\n/g, '\r\n')) : bytes
}

/** Parse original MIME, never infer a complete backup from an HTML preview. */
export async function parseLuxorZohoOriginal(raw: Uint8Array) {
  if (!raw.byteLength || raw.byteLength > 40 * 1024 * 1024) throw new Error('Original email is empty or exceeds the private archive limit.')
  const email = await PostalMime.parse(raw, { maxNestingDepth: 30, maxHeadersSize: 128_000,
    forceRfc822Attachments: true, maxRfc822NestingDepth: 0, attachmentEncoding: 'arraybuffer' })
  if (email.attachments.length > 1000) throw new Error('This email has too many MIME attachments for automatic import; retain it for manual export.')
  const from = email.from ? mailboxes([email.from])[0] : undefined
  if (!from) throw new Error('The original email has no valid sender; retain it for manual migration review.')
  const ids = messageIds(email.messageId)
  const internetId = ids.length === 1 && email.headers.filter((header) => header.key === 'message-id').length === 1 ? ids[0] : null
  return {
    from, to: mailboxes(email.to), cc: mailboxes(email.cc), replyTo: mailboxes(email.replyTo),
    bcc: mailboxes(email.bcc), internetId,
    references: Array.from(new Set([...messageIds(email.references), ...messageIds(email.inReplyTo)])),
    subject: email.subject || '(No subject)', text: email.text || '', html: email.html || null,
    date: email.date && Number.isFinite(Date.parse(email.date)) ? new Date(email.date).toISOString() : null,
    headers: email.headers, fromName: email.from?.name || '',
    attachments: email.attachments.map((attachment, index) => ({
      sourceKey: `zoho-part-${index}`, filename: attachment.filename || (attachment.mimeType === 'text/calendar' ? 'invitation.ics' : `attachment-${index + 1}`),
      contentType: attachment.mimeType || 'application/octet-stream', contentId: attachment.contentId || null,
      bytes: attachmentBytes(attachment.content, attachment.encoding, attachment.mimeType),
    })),
  }
}

/**
 * Imports one inventory item. Caller must inventory/reconcile every folder and
 * both read-state streams before declaring the mailbox migration complete.
 * No email jobs, notifications, RSVP changes, or writes to Zoho are performed.
 */
export async function importLuxorZohoMessage(input: {
  accountId: string; folder: LuxorZohoImportFolder; message: LuxorZohoImportMessage; direction: 'incoming' | 'outgoing'
  maxParts?: number; staged?: boolean
  revision?: { passId: string; expectedSha256: string }
}) {
  const maxParts = input.maxParts ?? 1001
  if (!Number.isInteger(maxParts) || maxParts < 1 || maxParts > 1001) throw new Error('Invalid import batch size.')
  if (!/^\d+$/.test(input.accountId) || !/^\d+$/.test(input.message.id) || !/^\d+$/.test(input.message.threadId)
    || input.folder.id !== input.message.folderId || !['incoming', 'outgoing'].includes(input.direction)) {
    throw new Error('Invalid Zoho import inventory item.')
  }
  if (input.revision && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.revision.passId)
    || !/^[0-9a-f]{64}$/.test(input.revision.expectedSha256) || input.staged !== true)) {
    throw new Error('Invalid staged source revision.')
  }
  const providerId = `${input.accountId}:${input.message.id}${input.revision ? `:revision:${input.revision.passId}` : ''}`
  const query = `luxor_mail_messages?select=*&provider=eq.zoho&provider_id=eq.${encodeURIComponent(providerId)}&limit=1`
  const existing = (await supabaseRest<LuxorMailRow[]>(query))[0]
  if (existing?.metadata.importComplete === true) {
    if (input.revision && existing.payload_hash !== input.revision.expectedSha256) throw new Error('The saved source revision differs from the audited original.')
    return { id: `mail-${existing.id}`, alreadyImported: true, complete: true }
  }
  const raw = await getLuxorZohoOriginalMessage(input.accountId, input.message.id)
  const hash = createHash('sha256').update(raw).digest('hex')
  if (input.revision && hash !== input.revision.expectedSha256) throw new Error('The source changed again after its audit. Run a fresh comparison before archiving this revision.')
  const parsed = await parseLuxorZohoOriginal(raw)
  const occurredAt = input.message.occurredAt || parsed.date
  if (!occurredAt || !Number.isFinite(Date.parse(occurredAt))) throw new Error('The original message needs a valid historical date before import.')
  const metadata = { source: 'zoho-history-import', zohoAccountId: input.accountId, zohoMessageId: input.message.id,
    zohoThreadId: input.message.threadId, zohoFolder: input.folder, zohoSummary: input.message.source,
    importComplete: false, historyStaged: input.staged === true, originalSha256: hash, headers: parsed.headers, bcc: parsed.bcc,
    fromName: parsed.fromName, hasAttachments: parsed.attachments.length > 0, importedReadState: input.message.isRead,
    ...(input.revision ? { sourceRevisionPassId: input.revision.passId } : {}) }
  await supabaseRest('luxor_mail_messages?on_conflict=provider,provider_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({
      id: randomUUID(), provider: 'zoho', provider_id: providerId, direction: input.direction,
      internet_message_id: parsed.internetId, thread_key: `mail-zoho-${input.accountId}-${input.message.threadId}`,
      from_address: parsed.from, to_addresses: parsed.to, cc_addresses: parsed.cc, reply_to_addresses: parsed.replyTo,
      reference_ids: parsed.references, subject: parsed.subject, text_body: parsed.text, html_body: parsed.html,
      status: 'importing', payload_hash: hash, occurred_at: occurredAt,
      read_at: input.message.isRead ? new Date().toISOString() : null, metadata,
    }),
  })
  const row = (await supabaseRest<LuxorMailRow[]>(query))[0]
  if (!row || row.payload_hash !== hash) throw new Error('The original email changed during import; reconcile it before continuing.')
  if (row.metadata.importComplete === true) return { id: `mail-${row.id}`, alreadyImported: true, complete: true }
  if (row.status !== 'importing') throw new Error('This historical message is not in the expected import state.')
  const saved = await listLuxorMailAttachments(row.id)
  const files = [{ sourceKey: 'raw-message', filename: 'original-message.eml', contentType: 'message/rfc822', bytes: raw, contentId: null }, ...parsed.attachments]
  let savedParts = 0
  for (const file of files) {
    const digest = createHash('sha256').update(file.bytes).digest('hex')
    const previous = saved.find((attachment) => attachment.source_key === file.sourceKey)
    if (previous && (previous.storage_path !== `${row.id}/${digest}` || previous.size_bytes !== file.bytes.byteLength)) {
      throw new Error('An archived attachment differs from the source; reconcile it before continuing.')
    }
    if (!previous) {
      if (savedParts >= maxParts) return { id: `mail-${row.id}`, alreadyImported: false, complete: false }
      await saveLuxorMailAttachment({ messageId: row.id, ...file })
      savedParts += 1
    }
  }
  // Publish only after every MIME part and the original source are persisted.
  const finalStatus = input.direction === 'incoming' ? 'received' : 'imported'
  const manifest = files.map((file) => ({ sourceKey: file.sourceKey, size: file.bytes.byteLength,
    sha256: createHash('sha256').update(file.bytes).digest('hex') }))
  await supabaseRest(`luxor_mail_messages?id=eq.${row.id}&status=eq.importing&payload_hash=eq.${hash}`, {
    method: 'PATCH', body: JSON.stringify({ status: finalStatus, metadata: { ...row.metadata,
      importComplete: true, importedAt: new Date().toISOString(), archivedPartCount: files.length, archivedParts: manifest } }),
  })
  const completed = (await supabaseRest<LuxorMailRow[]>(query))[0]
  if (completed?.metadata.importComplete !== true) throw new Error('The complete archive could not be confirmed; resume this item later.')
  return { id: `mail-${row.id}`, alreadyImported: false, complete: true }
}

/** Read back every private object before treating an imported message as verified. */
export async function verifyLuxorZohoArchive(id: string, options: { maxParts?: number; resume?: boolean } = {}) {
  const maxParts = options.maxParts ?? 1001
  if (!Number.isInteger(maxParts) || maxParts < 1 || maxParts > 1001) throw new Error('Invalid verification batch size.')
  const row = await getLuxorMailRow(id)
  if (!row || row.provider !== 'zoho' || row.metadata.importComplete !== true) throw new Error('The Zoho message is not completely imported.')
  const manifestHash = createHash('sha256').update(JSON.stringify(row.metadata.archivedParts ?? null)).digest('hex')
  const prior = row.metadata.archiveVerificationCursor as { manifestHash?: string; nextIndex?: number } | undefined
  const nextIndex = options.resume && prior?.manifestHash === manifestHash && Number.isInteger(prior.nextIndex)
    && Number(prior.nextIndex) >= 0 && Array.isArray(row.metadata.archivedParts)
    && Number(prior.nextIndex) < row.metadata.archivedParts.length ? Number(prior.nextIndex) : 0
  const verificationMetadata = { ...row.metadata, archiveVerifiedAt: null,
    archiveVerificationStartedAt: nextIndex ? row.metadata.archiveVerificationStartedAt : new Date().toISOString(),
    archiveVerificationCursor: { manifestHash, nextIndex } }
  const started = await supabaseRest<boolean>('rpc/luxor_compare_import_metadata', {
    method: 'POST', body: JSON.stringify({ p_id: row.id, p_expected: row.metadata, p_next: verificationMetadata }),
  })
  if (!started) throw new Error('Archive metadata changed before verification. Retry the integrity check.')
  const manifest = row.metadata.archivedParts as Array<{ sourceKey: string; size: number; sha256: string }> | undefined
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 1001
    || manifest.some((part) => !part || typeof part.sourceKey !== 'string' || !Number.isSafeInteger(part.size) || part.size < 0 || !/^[0-9a-f]{64}$/.test(part.sha256))
    || new Set(manifest.map((part) => part.sourceKey)).size !== manifest.length
    || manifest.find((part) => part.sourceKey === 'raw-message')?.sha256 !== row.metadata.originalSha256) {
    throw new Error('This archive is missing its original-message integrity manifest.')
  }
  const attachments = await listLuxorMailAttachments(row.id)
  if (attachments.length !== manifest.length) throw new Error('The archive attachment inventory is incomplete or has changed.')
  if (nextIndex >= manifest.length) throw new Error('Invalid saved archive verification cursor. Restart the integrity check.')
  const endIndex = Math.min(manifest.length, nextIndex + maxParts)
  for (const part of manifest.slice(nextIndex, endIndex)) {
    const attachment = attachments.find((item) => item.source_key === part.sourceKey)
    if (!attachment || attachment.size_bytes !== part.size || attachment.storage_path !== `${row.id}/${part.sha256}`) throw new Error('An archived MIME part is missing or has changed size.')
    const { bytes } = await downloadLuxorMailAttachment(row.id, attachment.id)
    if (bytes.byteLength !== part.size || createHash('sha256').update(bytes).digest('hex') !== part.sha256) {
      throw new Error('An archived MIME part failed its read-back integrity check. Do not retire the Zoho source.')
    }
  }
  const complete = endIndex === manifest.length
  const verifiedAt = complete ? new Date().toISOString() : null
  const updated = await supabaseRest<boolean>('rpc/luxor_compare_import_metadata', {
    method: 'POST', body: JSON.stringify({ p_id: row.id, p_expected: verificationMetadata,
      p_next: { ...verificationMetadata, archiveVerifiedAt: verifiedAt,
      archiveVerificationCursor: complete ? null : { manifestHash, nextIndex: endIndex } } }),
  })
  if (!updated) throw new Error('Archive metadata changed during verification. Retry the integrity check.')
  return { id: `mail-${row.id}`, verifiedParts: endIndex, verifiedAt, complete }
}
