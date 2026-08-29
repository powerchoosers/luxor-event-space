import 'server-only'

import { randomUUID } from 'node:crypto'
import { supabaseRest } from './supabaseRestServer'
import { luxorResendApi } from './luxorResendApiServer'
import { luxorMailAddress, luxorMailSenders } from './luxorMailConfig'
import { downloadLuxorMailAttachment, listLuxorMailAttachments, luxorMailMessage, saveLuxorMailAttachment, updateLuxorMailRow, type LuxorMailRow } from './luxorMailboxServer'
import { recordLuxorCalendarReplies } from './luxorCalendarReplyServer'
import { broadcastLuxorEmailArrival, broadcastLuxorPortalNotification } from './luxorZohoWebhookServer'
import { sendLuxorWebPush } from './luxorWebPushServer'

export type ResendEvent = {
  type: string; created_at: string
  data: { email_id?: string; message_id?: string; from?: string; to?: string[]; subject?: string; tags?: Record<string, string> }
}
type EventRow = {
  event_id: string; payload: ResendEvent; processed_at: string | null; attempts: number; lease_until: string | null
}
type ReceivedEmail = {
  id: string; from: string; to: string[]; cc: string[]; reply_to: string[]; subject: string
  text: string | null; html: string | null; message_id: string; created_at: string; headers: Record<string, string>
  attachments: Array<{ id: string; filename: string; content_type: string; content_id: string | null; size: number }>
  raw?: { download_url: string; expires_at: string } | null
}
type ResendAttachment = { id: string; filename: string; content_type: string; content_id: string | null; size: number; download_url: string }
type MarketingRecipient = {
  id: string; campaign_id: string; open_count: number | null; click_count: number | null
  first_opened_at: string | null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function address(value: string) {
  return luxorMailAddress(value.match(/<([^<>]+)>/)?.[1] || value)
}

/**
 * Resend receives the domain as a whole. Keep the owner inbox complete by
 * accepting every valid Luxor alias, not only the addresses currently offered
 * as outbound senders. This lets booking@ remain the single place to review
 * messages sent to future aliases such as events@ or arianna@.
 */
function isLuxorMailboxRecipient(value: string) {
  const email = address(value)
  return luxorMailSenders().includes(email) || email.endsWith('@luxoratlaspalmas.com')
}

function isLuxorEvent(event: ResendEvent) {
  const senders = luxorMailSenders()
  return event.type === 'email.received'
    ? (event.data.to || []).some(isLuxorMailboxRecipient)
    : senders.includes(address(event.data.from || ''))
}

export async function storeLuxorResendEvent(id: string, event: ResendEvent) {
  if (!isLuxorEvent(event)) return false // Other domains can share this Resend account.
  await supabaseRest('luxor_resend_events?on_conflict=event_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ event_id: id, event_type: event.type, provider_email_id: event.data.email_id, payload: event }),
  })
  return true
}

async function downloadProviderAttachment(urlValue: string, raw = false) {
  const url = new URL(urlValue)
  // Only fetch signed URLs returned by the authenticated Resend API, never webhook/user URLs.
  // Resend uses cdn.resend.app for inbound file parts (including inline CID
  // images), while older messages may point at the two resend.com hosts.
  // Keep the allowlist explicit so a malformed provider response cannot turn
  // this server-side fetch into a generic URL fetcher.
  const allowedHost = raw
    ? url.hostname === 'cdn.resend.app' || url.hostname.endsWith('.resend.com') || url.hostname.endsWith('.cloudfront.net')
    : ['inbound-cdn.resend.com', 'cdn.resend.com', 'cdn.resend.app'].includes(url.hostname)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !allowedHost) {
    throw new Error('Resend returned an unsupported attachment download host.')
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) })
  if (!response.ok || !response.body) throw new Error('Incoming attachment download failed.')
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 40 * 1024 * 1024) throw new Error('Incoming attachment exceeds the archive limit.')
      parts.push(part.value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return Buffer.concat(parts)
}

async function receiveEmail(providerId: string) {
  const email = await luxorResendApi<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(providerId)}?html_format=cid`)
  if (!email.to.some(isLuxorMailboxRecipient)) return
  const headers = Object.fromEntries(Object.entries(email.headers || {}).map(([key, value]) => [key.toLowerCase(), value]))
  const references = `${headers.references || ''} ${headers['in-reply-to'] || ''}`.match(/<[^<>\s]+>/g) || []
  let threadKey = ''
  for (const reference of references.slice().reverse()) {
    const parents = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&internet_message_id=eq.${encodeURIComponent(reference)}&limit=1`)
    if (parents[0]) { threadKey = parents[0].thread_key; break }
  }
  const id = randomUUID()
  await supabaseRest('luxor_mail_messages?on_conflict=provider,provider_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ id, provider: 'resend', provider_id: email.id, direction: 'incoming',
      internet_message_id: email.message_id, thread_key: threadKey || `mail-${id}`,
      from_address: address(email.from) || email.from, to_addresses: email.to.map(address).filter(Boolean),
      cc_addresses: (email.cc || []).map(address).filter(Boolean), reply_to_addresses: (email.reply_to || []).map(address).filter(Boolean),
      reference_ids: references, subject: email.subject || '(No subject)', text_body: email.text || '', html_body: email.html,
      status: 'received', occurred_at: email.created_at, metadata: { hasAttachments: email.attachments.length > 0, headers } }),
  })
  const rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&provider=eq.resend&provider_id=eq.${encodeURIComponent(email.id)}&limit=1`)
  const row = rows[0]
  if (!row) throw new Error('Incoming email was not saved.')
  const archived = await listLuxorMailAttachments(row.id)

  // The inbox record is durable at this point. Alert the portal before optional
  // attachment/raw-MIME archiving so a large attachment never delays the owner
  // seeing a newly received email. Attachment work remains in this event's
  // retry boundary below.
  const eventKey = `resend:${email.id}`
  const cachedMessage = luxorMailMessage(row, archived)
  await supabaseRest<Array<{ id: string }>>('luxor_email_events?on_conflict=event_key&select=id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ event_key: eventKey, message_id: cachedMessage.id, sender_email: row.from_address,
      recipient_email: row.to_addresses[0], subject: row.subject, received_at: row.occurred_at,
      metadata: { source: 'resend', limitedData: false, cachedAt: new Date().toISOString(), cachedMessage } }),
  })
  const initialMetadata = { ...row.metadata }
  if (!initialMetadata.arrivalBroadcastAt) {
    await broadcastLuxorEmailArrival(eventKey)
    initialMetadata.arrivalBroadcastAt = new Date().toISOString()
    await updateLuxorMailRow(row.id, { metadata: initialMetadata })
  }
  if (!initialMetadata.arrivalPushAt) {
    const push = await sendLuxorWebPush('email', { title: 'New Luxor email', body: 'A new message arrived in the owner inbox.',
      url: `/portal/emails?messageId=${cachedMessage.id}`, tag: `luxor-email-${eventKey}` })
    if (push.failed) throw new Error('Email notification delivery needs a retry.')
    initialMetadata.arrivalPushAt = new Date().toISOString()
    await updateLuxorMailRow(row.id, { metadata: initialMetadata })
  }

  for (const attachment of email.attachments) {
    if (archived.some((item) => item.source_key === attachment.id)) continue
    const detail = await luxorResendApi<ResendAttachment>(`/emails/receiving/${encodeURIComponent(email.id)}/attachments/${encodeURIComponent(attachment.id)}`)
    const bytes = await downloadProviderAttachment(detail.download_url)
    archived.push(await saveLuxorMailAttachment({ messageId: row.id, sourceKey: attachment.id,
      filename: attachment.filename || 'attachment', contentType: attachment.content_type || 'application/octet-stream',
      contentId: attachment.content_id, bytes }))
  }
  // Keep the original MIME for calendar parts that clients place inline, and
  // verify DKIM ourselves instead of trusting caller-supplied auth headers.
  if (email.raw?.download_url) {
    const savedRaw = archived.find((item) => item.source_key === 'raw-message')
    const raw = savedRaw ? (await downloadLuxorMailAttachment(row.id, savedRaw.id)).bytes
      : await downloadProviderAttachment(email.raw.download_url, true)
    if (!savedRaw) await saveLuxorMailAttachment({ messageId: row.id, sourceKey: 'raw-message', filename: 'original-message.eml', contentType: 'message/rfc822', bytes: raw })
    await recordLuxorCalendarReplies(row.id, raw, row.from_address)
  }
}

async function processDelivery(event: ResendEvent, eventId: string) {
  const providerId = event.data.email_id
  if (!providerId) return
  // Resend includes custom tags in every lifecycle webhook. Use the signed
  // payload rather than retrieving the email again: that makes delivery,
  // open, and click processing immediate and avoids requiring a second API
  // permission or retention-dependent lookup for every event.
  const localId = event.data.tags?.luxor_message_id
  let rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&provider=eq.resend&direction=eq.outgoing&provider_id=eq.${encodeURIComponent(providerId)}&limit=1`)
  if (!rows[0] && localId && /^[0-9a-f-]{36}$/i.test(localId)) {
    rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&provider=eq.resend&direction=eq.outgoing&id=eq.${localId}&limit=1`)
  }
  if (!rows[0] && event.data.message_id) rows = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?select=*&provider=eq.resend&direction=eq.outgoing&internet_message_id=eq.${encodeURIComponent(event.data.message_id)}&limit=1`)
  const row = rows[0]
  // This Resend account can receive lifecycle events for mail that predates
  // the portal outbox, or that was sent from another approved application.
  // Keep the signed event audit trail, but do not retry forever for an event
  // that cannot belong to a local portal message. Current Luxor sends carry
  // both a provider id and a Luxor message tag, so they continue below.
  if (!row) return
  // Events may arrive out of order. Retain the event log, but never regress status.
  const rank: Record<string, number> = { prepared: 0, sending: 1, sent: 2, delivery_delayed: 3, delivered: 4, opened: 5, clicked: 6, failed: 7, bounced: 8, suppressed: 9, complained: 10 }
  const next = event.type.replace(/^email\./, '')
  const updated = await supabaseRest<LuxorMailRow[]>(`luxor_mail_messages?id=eq.${row.id}&status=eq.${encodeURIComponent(row.status)}&select=id`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      provider_id: providerId, internet_message_id: event.data.message_id || row.internet_message_id,
      accepted_at: row.accepted_at || event.created_at,
      status: (rank[next] || 0) >= (rank[row.status] || 0) ? next : row.status,
    }),
  })
  if (!updated?.length) throw new Error('Delivery state changed concurrently; retry this event.')
  // Keep this inside the durable event retry boundary. A transient campaign
  // write failure must not leave the event marked processed.
  await supabaseRest('rpc/luxor_resend_marketing_delivery', { method: 'POST',
    body: JSON.stringify({ p_message_id: row.id, p_event_id: eventId }) })
  await recordResendMarketingEngagement(row, event, eventId)
  // Send only an opaque signal. The authenticated browser refetches protected
  // records and shows its normal deduplicated toast for opens/clicks instantly.
  await broadcastLuxorPortalNotification('email-status', { eventId, eventType: event.type })
}

async function recordResendMarketingEngagement(row: LuxorMailRow, event: ResendEvent, eventId: string) {
  const kind = event.type === 'email.opened' ? 'open' : event.type === 'email.clicked' ? 'click' : null
  if (!kind) return
  const metadata = row.metadata || {}
  const campaignId = metadata.marketingCampaignId
  const recipientId = metadata.marketingRecipientId
  if (!isUuid(campaignId) || !isUuid(recipientId)) return

  const recipientRows = await supabaseRest<MarketingRecipient[]>(
    `luxor_marketing_recipients?select=id,campaign_id,open_count,click_count,first_opened_at&id=eq.${recipientId}&campaign_id=eq.${campaignId}&limit=1`,
  )
  const recipient = recipientRows[0]
  if (!recipient) return
  const known = await supabaseRest<Array<{ id: string }>>(
    `luxor_marketing_events?select=id&recipient_id=eq.${recipientId}&metadata->>resendEventId=eq.${encodeURIComponent(eventId)}&limit=1`,
  )
  if (known.length) return
  const now = event.created_at || new Date().toISOString()
  await supabaseRest('luxor_marketing_events', {
    method: 'POST', body: JSON.stringify({ campaign_id: campaignId, recipient_id: recipientId, event_type: kind,
      metadata: { source: 'resend_webhook', resendEventId: eventId, providerEmailId: event.data.email_id || null } }),
  })
  await supabaseRest(`luxor_marketing_recipients?id=eq.${recipientId}`, {
    method: 'PATCH', body: JSON.stringify(kind === 'open'
      ? { open_count: Number(recipient.open_count || 0) + 1, first_opened_at: recipient.first_opened_at || now, last_opened_at: now }
      : { click_count: Number(recipient.click_count || 0) + 1, last_clicked_at: now }),
  })
}

export async function processLuxorResendEvent(eventId: string) {
  const filter = `event_id=eq.${encodeURIComponent(eventId)}`
  const rows = await supabaseRest<EventRow[]>(`luxor_resend_events?select=*&${filter}&limit=1`)
  const row = rows[0]
  if (!row || row.processed_at) return
  const now = new Date().toISOString()
  const claimed = await supabaseRest<EventRow[]>(`luxor_resend_events?${filter}&processed_at=is.null&or=(lease_until.is.null,lease_until.lt.${encodeURIComponent(now)})&select=*`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ lease_until: new Date(Date.now() + 120_000).toISOString(), attempts: row.attempts + 1 }),
  })
  if (!claimed?.length) return
  try {
    if (row.payload.type === 'email.received' && row.payload.data.email_id) await receiveEmail(row.payload.data.email_id)
    else if (row.payload.type.startsWith('email.')) await processDelivery(row.payload, eventId)
    await supabaseRest(`luxor_resend_events?${filter}`, { method: 'PATCH',
      body: JSON.stringify({ processed_at: new Date().toISOString(), lease_until: null, last_error: null }) })
  } catch (error) {
    await supabaseRest(`luxor_resend_events?${filter}`, { method: 'PATCH', body: JSON.stringify({
      lease_until: null, next_attempt_at: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(row.attempts, 7))).toISOString(),
      last_error: 'Email processing failed. A retry is scheduled.',
    }) })
    throw error
  }
}

export async function processPendingLuxorResendEvents(limit = 3) {
  const rows = await supabaseRest<EventRow[]>(`luxor_resend_events?select=event_id&processed_at=is.null&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&order=received_at.asc&limit=${limit}`)
  for (const row of rows) await processLuxorResendEvent(row.event_id).catch(() => undefined)
}
