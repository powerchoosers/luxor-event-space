import 'server-only'

import crypto from 'crypto'
import { supabaseRest } from './supabaseRestServer'

type WebhookConfigRow = {
  provider: string
  secret_ciphertext: string
}

export type LuxorEmailWebhookEvent = {
  event_key: string
  message_id: string | null
  sender_email: string | null
  sender_name: string | null
  recipient_email: string | null
  subject: string
  received_at: string
  metadata: Record<string, unknown>
}

function webhookKeyMaterial() {
  const secret = process.env.LUXOR_PORTAL_SESSION_SECRET
  if (!secret) throw new Error('Missing LUXOR_PORTAL_SESSION_SECRET.')
  return secret
}

export function getZohoWebhookPathToken() {
  return crypto.createHmac('sha256', webhookKeyMaterial()).update('luxor:zoho-mail:webhook:v1').digest('base64url')
}

export function getLuxorNotificationChannelName() {
  const suffix = crypto.createHmac('sha256', webhookKeyMaterial()).update('luxor:portal:notifications:v1').digest('base64url')
  return `luxor-portal-${suffix}`
}

export function isValidZohoWebhookPathToken(token: string) {
  const expected = getZohoWebhookPathToken()
  const received = String(token || '')
  if (expected.length !== received.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

function encryptWebhookSecret(secret: string) {
  const key = crypto.createHash('sha256').update(webhookKeyMaterial()).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

function decryptWebhookSecret(ciphertext: string) {
  const [version, ivValue, tagValue, encryptedValue] = ciphertext.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid Zoho webhook secret format.')
  const key = crypto.createHash('sha256').update(webhookKeyMaterial()).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export async function getZohoWebhookSecret() {
  const rows = await supabaseRest<WebhookConfigRow[]>(
    'luxor_zoho_webhook_config?provider=eq.mail&select=provider,secret_ciphertext&limit=1',
  )
  const row = rows?.[0]
  return row ? decryptWebhookSecret(row.secret_ciphertext) : null
}

export async function initializeZohoWebhookSecret(secret: string) {
  const value = secret.trim()
  if (!value) throw new Error('Zoho did not provide its webhook signing secret.')
  await supabaseRest('luxor_zoho_webhook_config?on_conflict=provider', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      provider: 'mail',
      secret_ciphertext: encryptWebhookSecret(value),
      initialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  })
}

export async function resetZohoWebhookSecret() {
  await supabaseRest('luxor_zoho_webhook_config?provider=eq.mail', { method: 'DELETE' })
}

export function verifyZohoWebhookSignature(secret: string, rawBody: string, suppliedSignature: string) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  const received = suppliedSignature.trim()
  if (expected.length !== received.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findPayloadValue(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined
  const wanted = new Set(keys.map(normalizeKey))
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPayloadValue(item, keys)
      if (found !== undefined) return found
    }
    return undefined
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (wanted.has(normalizeKey(key)) && item !== null && item !== '') return item
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    const found = findPayloadValue(item, keys)
    if (found !== undefined) return found
  }
  return undefined
}

function emailFrom(value: unknown) {
  return String(value || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() || null
}

function senderNameFrom(value: unknown) {
  const text = String(value || '').trim()
  const email = emailFrom(text)
  const name = text.replace(/<[^>]+>/g, '').replace(email || '', '').replace(/["']/g, '').trim()
  return name || null
}

function webhookDate(value: unknown) {
  if (typeof value === 'number') {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(milliseconds)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function parseZohoEmailWebhook(rawBody: string): LuxorEmailWebhookEvent {
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = Object.fromEntries(new URLSearchParams(rawBody))
  }

  const senderValue = findPayloadValue(payload, ['fromAddress', 'from', 'sender', 'senderAddress'])
  const recipientValue = findPayloadValue(payload, ['toAddress', 'to', 'recipient', 'recipientAddress'])
  const subject = String(findPayloadValue(payload, ['subject', 'mailSubject']) || '(No subject)').trim()
  const messageId = String(findPayloadValue(payload, ['messageId', 'message_id', 'mailId']) || '').trim() || null
  const receivedValue = findPayloadValue(payload, ['receivedTime', 'received_at', 'receivedAt', 'time', 'date'])
  const eventKey = messageId || crypto.createHash('sha256').update(rawBody).digest('hex')

  return {
    event_key: eventKey,
    message_id: messageId,
    sender_email: emailFrom(senderValue),
    sender_name: senderNameFrom(senderValue),
    recipient_email: emailFrom(recipientValue),
    subject: subject || '(No subject)',
    received_at: webhookDate(receivedValue),
    metadata: { source: 'zoho-mail-webhook', limitedData: true },
  }
}

export async function storeZohoEmailEvent(event: LuxorEmailWebhookEvent) {
  const rows = await supabaseRest<Array<{ id: string; event_key: string }>>(
    'luxor_email_events?on_conflict=event_key&select=id,event_key',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(event),
    },
  )
  return rows?.[0] || null
}

export async function broadcastLuxorPortalNotification(event: string, payload: Record<string, unknown> = {}) {
  const eventName = event.trim()
  if (!/^[a-z0-9-]{1,80}$/.test(eventName)) throw new Error('Invalid portal notification event.')

  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase configuration for webhook broadcast.')

  const topic = encodeURIComponent(getLuxorNotificationChannelName())
  const response = await fetch(`${url}/realtime/v1/api/broadcast/${topic}/events/${encodeURIComponent(eventName)}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Supabase Realtime broadcast failed with ${response.status}.`)
}

export async function broadcastLuxorEmailArrival(eventKey: string) {
  return broadcastLuxorPortalNotification('email-arrived', { eventKey })
}
