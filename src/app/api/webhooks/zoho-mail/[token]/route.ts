import { NextRequest, NextResponse } from 'next/server'
import {
  broadcastLuxorEmailArrival,
  getZohoWebhookSecret,
  initializeZohoWebhookSecret,
  isValidZohoWebhookPathToken,
  parseZohoEmailWebhook,
  storeZohoEmailEvent,
  verifyZohoWebhookSignature,
} from '@/lib/luxorZohoWebhookServer'

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  try {
    const { token } = await context.params
    if (!isValidZohoWebhookPathToken(token)) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const rawBody = await request.text()
    const suppliedSignature = request.headers.get('x-hook-signature') || ''
    const suppliedSecret = request.headers.get('x-hook-secret') || ''
    const storedSecret = await getZohoWebhookSecret()
    const signingSecret = storedSecret || suppliedSecret

    if (!signingSecret || !suppliedSignature || !verifyZohoWebhookSignature(signingSecret, rawBody, suppliedSignature)) {
      console.warn(JSON.stringify({
        level: 'warning',
        message: 'Rejected Zoho Mail webhook signature',
        route: '/api/webhooks/zoho-mail/[token]',
        requestId,
      }))
      return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
    }

    if (!storedSecret) {
      await initializeZohoWebhookSecret(signingSecret)
      console.log(JSON.stringify({
        level: 'info',
        message: 'Zoho Mail webhook initialized',
        route: '/api/webhooks/zoho-mail/[token]',
        requestId,
        durationMs: Date.now() - startedAt,
      }))
      return NextResponse.json({ success: true, initialized: true })
    }

    const event = parseZohoEmailWebhook(rawBody)
    const stored = await storeZohoEmailEvent(event)
    if (stored) await broadcastLuxorEmailArrival(stored.event_key)

    console.log(JSON.stringify({
      level: 'info',
      message: 'Zoho Mail webhook processed',
      route: '/api/webhooks/zoho-mail/[token]',
      requestId,
      duplicate: !stored,
      durationMs: Date.now() - startedAt,
    }))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'Zoho Mail webhook failed',
      route: '/api/webhooks/zoho-mail/[token]',
      requestId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    }))
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
