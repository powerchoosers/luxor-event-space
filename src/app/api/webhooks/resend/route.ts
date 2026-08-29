import { NextRequest, NextResponse } from 'next/server'
import { verifyLuxorResendSignature } from '@/lib/luxorResendSignature'
import { processLuxorResendEvent, storeLuxorResendEvent, type ResendEvent } from '@/lib/luxorResendWebhookServer'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: 'Receiving is not configured.' }, { status: 503 })
  if (Number(request.headers.get('content-length') || 0) > 256_000) return new NextResponse(null, { status: 413 })
  const payload = await request.text()
  if (Buffer.byteLength(payload) > 256_000) return new NextResponse(null, { status: 413 })
  if (!verifyLuxorResendSignature(payload, request.headers, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }
  try {
    const event = JSON.parse(payload) as ResendEvent
    if (!event || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object'
      || !Number.isFinite(Date.parse(event.created_at))) return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
    const eventId = request.headers.get('svix-id')!
    const stored = await storeLuxorResendEvent(eventId, event)
    // Save first for idempotency, then process before acknowledging the webhook so
    // portal Realtime receives inbound, open, and click activity immediately.
    // If processing fails, the event stays durable for the worker and Resend retries
    // this non-2xx response as an additional recovery path.
    if (stored) await processLuxorResendEvent(eventId)
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Could not save email event.' }, { status: 500 })
  }
}
