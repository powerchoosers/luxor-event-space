import { after, NextRequest, NextResponse } from 'next/server'
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
    if (stored) after(async () => {
      try { await processLuxorResendEvent(eventId) }
      catch { console.warn('[resend] saved webhook awaits retry') }
    })
    // Provider can stop retrying because the event is durable; the worker resumes failures.
    return NextResponse.json({ received: true })
  } catch {
    return NextResponse.json({ error: 'Could not save email event.' }, { status: 500 })
  }
}
