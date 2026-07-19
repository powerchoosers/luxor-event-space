import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { assertAllowedOutboundNumber } from '@/lib/luxorCallsServer'
import { createOrUpdateLuxorMessage, listLuxorMessages, markLuxorMessageRead } from '@/lib/luxorMessagesServer'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from '@/lib/luxorTwilioServer'
import { assertOwnedLuxorMessagingNumber, getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { assertLuxorSmsAllowed } from '@/lib/luxorTextAutomationsServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  return NextResponse.json(await listLuxorMessages({ inquiryId: request.nextUrl.searchParams.get('inquiryId'), limit: Number(request.nextUrl.searchParams.get('limit') || 200) }), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const { to, body, inquiryId, contactName, fromNumber } = await request.json() as { to?: string; body?: string; inquiryId?: string; contactName?: string; fromNumber?: string }
    const destination = await assertLuxorSmsAllowed(assertAllowedOutboundNumber(to))
    const text = String(body || '').trim()
    if (!text) return NextResponse.json({ error: 'Write a message before sending.' }, { status: 400 })
    if (text.length > 1600) return NextResponse.json({ error: 'Keep messages to 1,600 characters or fewer.' }, { status: 400 })
    const config = getLuxorTwilioMessagingConfig()
    const activePhoneNumber = await getActiveLuxorPhoneNumber()
    const selectedPhoneNumber = fromNumber ? await assertOwnedLuxorMessagingNumber(fromNumber) : activePhoneNumber
    const client = twilio(config.accountSid, config.authToken)
    const sent = await client.messages.create({
      to: destination,
      ...(config.messagingServiceSid
        ? { messagingServiceSid: config.messagingServiceSid, fallbackFrom: selectedPhoneNumber }
        : { from: selectedPhoneNumber }),
      body: text,
      statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
    })
    const message = await createOrUpdateLuxorMessage({ sid: sent.sid, direction: 'outbound', status: normalizeMessageStatus(sent.status), from: selectedPhoneNumber, to: destination, body: text, inquiryId, contactName, ownerEmail: session.email, isRead: true })
    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send text message.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const { id } = await request.json() as { id?: string }
  if (!id) return NextResponse.json({ error: 'Message ID required.' }, { status: 400 })
  const message = await markLuxorMessageRead(id)
  return message ? NextResponse.json(message) : NextResponse.json({ error: 'Message not found.' }, { status: 404 })
}

function normalizeMessageStatus(value: string | undefined) {
  return ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'received'].includes(value || '') ? value as import('@/lib/luxorMessageTypes').LuxorMessageStatus : 'queued'
}
