import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import {
  disableLuxorPushSubscription,
  getLuxorWebPushPublicConfig,
  type LuxorPushType,
  upsertLuxorPushSubscription,
} from '@/lib/luxorWebPushServer'

const VALID_NOTIFICATION_TYPES = new Set<LuxorPushType>(['email', 'booking'])
const BASE64_URL = /^[A-Za-z0-9_-]+$/

function validPushEndpoint(value: string) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      hostname === 'web.push.apple.com'
      || hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname === 'wns.notify.windows.com'
    )
  } catch {
    return false
  }
}

function cleanNotificationTypes(value: unknown): LuxorPushType[] {
  if (!Array.isArray(value)) return ['email', 'booking']
  const types = value.filter((item): item is LuxorPushType => typeof item === 'string' && VALID_NOTIFICATION_TYPES.has(item as LuxorPushType))
  return Array.from(new Set(types))
}

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
  return NextResponse.json(getLuxorWebPushPublicConfig(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const body = await request.json()
    const endpoint = typeof body?.subscription?.endpoint === 'string' ? body.subscription.endpoint.trim() : ''
    const p256dh = typeof body?.subscription?.keys?.p256dh === 'string' ? body.subscription.keys.p256dh.trim() : ''
    const auth = typeof body?.subscription?.keys?.auth === 'string' ? body.subscription.keys.auth.trim() : ''
    const expirationTime = typeof body?.subscription?.expirationTime === 'number' ? body.subscription.expirationTime : null

    if (!validPushEndpoint(endpoint) || endpoint.length > 4096) {
      return NextResponse.json({ error: 'The browser returned an invalid push endpoint.' }, { status: 400 })
    }
    if (!BASE64_URL.test(p256dh) || p256dh.length > 512 || !BASE64_URL.test(auth) || auth.length > 256) {
      return NextResponse.json({ error: 'The browser returned invalid push encryption keys.' }, { status: 400 })
    }

    await upsertLuxorPushSubscription({
      userEmail: session.email,
      subscription: { endpoint, expirationTime, keys: { p256dh, auth } },
      notificationTypes: cleanNotificationTypes(body.notificationTypes),
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save push notifications.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

  try {
    const body = await request.json()
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : ''
    if (!validPushEndpoint(endpoint) || endpoint.length > 4096) {
      return NextResponse.json({ error: 'A valid push endpoint is required.' }, { status: 400 })
    }
    await disableLuxorPushSubscription(endpoint, session.email)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not disable push notifications.' }, { status: 500 })
  }
}
