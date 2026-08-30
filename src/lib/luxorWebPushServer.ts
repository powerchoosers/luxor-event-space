import 'server-only'

import webPush, { type PushSubscription, type WebPushError } from 'web-push'
import { supabaseRest } from './supabaseRestServer'

export type LuxorPushType = 'email' | 'booking' | 'call'

export type LuxorPushPayload = {
  title: string
  body: string
  url: `/portal${string}`
  tag: string
}

type LuxorPushSubscriptionRow = {
  id: string
  user_email: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time: number | null
  notification_types: LuxorPushType[]
  failure_count: number
}

function getWebPushConfig() {
  const publicKey = String(process.env.LUXOR_WEB_PUSH_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.LUXOR_WEB_PUSH_PRIVATE_KEY || '').trim()
  const subject = String(process.env.LUXOR_WEB_PUSH_SUBJECT || 'mailto:booking@luxoratlaspalmas.com').trim()

  return {
    configured: Boolean(publicKey && privateKey && /^(mailto:|https:\/\/)/.test(subject)),
    publicKey,
    privateKey,
    subject,
  }
}

export function getLuxorWebPushPublicConfig() {
  const config = getWebPushConfig()
  return { configured: config.configured, publicKey: config.configured ? config.publicKey : '' }
}

export async function upsertLuxorPushSubscription(input: {
  userEmail: string
  subscription: PushSubscription
  notificationTypes: LuxorPushType[]
  userAgent?: string | null
}) {
  const now = new Date().toISOString()
  await supabaseRest('luxor_push_subscriptions?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_email: input.userEmail.trim().toLowerCase(),
      endpoint: input.subscription.endpoint,
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth,
      expiration_time: input.subscription.expirationTime ?? null,
      notification_types: input.notificationTypes,
      user_agent: String(input.userAgent || '').slice(0, 500) || null,
      disabled_at: null,
      failure_count: 0,
      last_error: null,
      updated_at: now,
    }),
  })
}

export async function disableLuxorPushSubscription(endpoint: string, userEmail: string) {
  await supabaseRest(
    `luxor_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_email=eq.${encodeURIComponent(userEmail.trim().toLowerCase())}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    },
  )
}

async function activeSubscriptions(userEmail?: string) {
  const emailFilter = userEmail ? `&user_email=eq.${encodeURIComponent(userEmail.trim().toLowerCase())}` : ''
  return supabaseRest<LuxorPushSubscriptionRow[]>(
    `luxor_push_subscriptions?disabled_at=is.null${emailFilter}&select=id,user_email,endpoint,p256dh,auth,expiration_time,notification_types,failure_count&limit=250`,
  )
}

async function recordDelivery(row: LuxorPushSubscriptionRow, error?: WebPushError) {
  const status = Number(error?.statusCode || 0)
  const expired = status === 404 || status === 410
  await supabaseRest(`luxor_push_subscriptions?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(error ? {
      failure_count: row.failure_count + 1,
      last_error: status ? `Push service returned HTTP ${status}.` : 'Push delivery failed.',
      disabled_at: expired ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    } : {
      failure_count: 0,
      last_error: null,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  })
}

export async function sendLuxorWebPush(
  type: LuxorPushType,
  payload: LuxorPushPayload,
  options: { userEmail?: string } = {},
) {
  const config = getWebPushConfig()
  if (!config.configured) return { configured: false, sent: 0, failed: 0 }

  const rows = (await activeSubscriptions(options.userEmail))
    .filter((row) => Array.isArray(row.notification_types) && row.notification_types.includes(type))

  let sent = 0
  let failed = 0
  await Promise.all(rows.map(async (row) => {
    try {
      await webPush.sendNotification({
        endpoint: row.endpoint,
        expirationTime: row.expiration_time,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: 'high',
        topic: payload.tag.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32),
        vapidDetails: {
          subject: config.subject,
          publicKey: config.publicKey,
          privateKey: config.privateKey,
        },
      })
      sent += 1
      await recordDelivery(row)
    } catch (error) {
      failed += 1
      await recordDelivery(row, error as WebPushError).catch((recordError) => {
        console.error('Failed to record Luxor Web Push delivery error:', recordError)
      })
    }
  }))

  return { configured: true, sent, failed }
}
