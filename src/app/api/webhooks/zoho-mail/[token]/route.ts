import { after, NextRequest, NextResponse } from 'next/server'
import { getArchivedLuxorEmail } from '@/lib/luxorEmailArchiveServer'
import {
  broadcastLuxorEmailArrival,
  getZohoWebhookSecret,
  initializeZohoWebhookSecret,
  isValidZohoWebhookPathToken,
  parseZohoEmailWebhook,
  storeZohoEmailEvent,
  verifyZohoWebhookSignature,
} from '@/lib/luxorZohoWebhookServer'
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'

export const maxDuration = 60

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

    // Zoho's first save-time verification sends x-hook-secret so the receiver
    // can initialize the signing secret; subsequent delivery requests include
    // x-hook-signature and must always pass HMAC verification.
    if (!storedSecret && suppliedSecret && !suppliedSignature) {
      await initializeZohoWebhookSecret(suppliedSecret)
      console.log(JSON.stringify({
        level: 'info',
        message: 'Zoho Mail webhook initialized',
        route: '/api/webhooks/zoho-mail/[token]',
        requestId,
        durationMs: Date.now() - startedAt,
      }))
      return NextResponse.json({ success: true, initialized: true })
    }

    if (!signingSecret || !suppliedSignature || !verifyZohoWebhookSignature(signingSecret, rawBody, suppliedSignature)) {
      console.warn(JSON.stringify({
        level: 'warning',
        message: 'Rejected Zoho Mail webhook signature',
        route: '/api/webhooks/zoho-mail/[token]',
        requestId,
      }))
      return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
    }

    const event = parseZohoEmailWebhook(rawBody)
    const stored = await storeZohoEmailEvent(event)
    if (stored && event.message_id) {
      const messageId = event.message_id
      after(async () => {
        try { await getArchivedLuxorEmail(messageId) }
        catch { console.warn('[email-archive] new message deferred to background retry') }
      })
    }
    if (stored) {
      await broadcastLuxorEmailArrival(stored.event_key)
      await sendLuxorWebPush('email', {
        title: 'New Luxor email',
        body: 'A new message arrived in the owner inbox.',
        url: '/portal/emails',
        tag: `luxor-email-${stored.event_key}`,
      }).catch((pushError) => {
        console.error('Zoho email stored, but Web Push delivery failed:', pushError)
      })
    }

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
