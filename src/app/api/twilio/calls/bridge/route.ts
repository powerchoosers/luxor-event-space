import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { assertAllowedOutboundNumber, createOrUpdateLuxorCall } from '@/lib/luxorCallsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { buildTwilioCallbackUrl, getLuxorTwilioConfig } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const body = await request.json() as { phoneNumber?: string; contactName?: string | null; inquiryId?: string | null }
    const destination = assertAllowedOutboundNumber(body.phoneNumber)
    const settings = await getLuxorPhoneRoutingSettings()
    if (settings.outbound_mode !== 'ring_phone' || !settings.ring_to_number) {
      return NextResponse.json({ error: 'Ring-my-phone dialing is not enabled in Settings.' }, { status: 409 })
    }

    const config = getLuxorTwilioConfig()
    const activePhoneNumber = await getActiveLuxorPhoneNumber()
    const inquiryId = /^[0-9a-f-]{36}$/i.test(body.inquiryId || '') ? body.inquiryId! : null
    const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
    const contactName = inquiry?.full_name || body.contactName?.trim().slice(0, 160) || destination
    const client = twilio(config.accountSid, config.authToken)
    const call = await client.calls.create({
      to: settings.ring_to_number,
      from: activePhoneNumber,
      url: buildTwilioCallbackUrl('/api/twilio/bridge', { destination }),
      method: 'POST',
      statusCallback: buildTwilioCallbackUrl('/api/twilio/status'),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    })

    await createOrUpdateLuxorCall({
      twilioCallSid: call.sid,
      direction: 'outbound',
      status: 'initiated',
      fromNumber: activePhoneNumber,
      toNumber: destination,
      callerNumber: activePhoneNumber,
      calleeNumber: destination,
      inquiryId: inquiry?.id ?? null,
      contactName,
      ownerEmail: session.email,
      isRead: true,
      metadata: { source: 'ring_phone', ring_to_number: settings.ring_to_number },
    })

    return NextResponse.json({ callSid: call.sid, status: call.status, ringToNumber: settings.ring_to_number }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ring your phone.' }, { status: 500 })
  }
}
