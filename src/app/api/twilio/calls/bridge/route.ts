import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { assertAllowedOutboundNumber, createOrUpdateLuxorCall, getLuxorCallBySid } from '@/lib/luxorCallsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { buildTwilioCallbackUrl, getLuxorTwilioConfig } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'calls')) {
      return NextResponse.json({ error: 'Phone access is not enabled for this account.' }, { status: 403 })
    }
    const callSid = new URL(request.url).searchParams.get('callSid') || ''
    if (!/^CA[0-9a-f]{32}$/i.test(callSid)) return NextResponse.json({ error: 'Invalid call identifier.' }, { status: 400 })
    const record = await getLuxorCallBySid(callSid)
    if (!record || record.twilio_call_sid !== callSid || record.metadata?.source !== 'ring_phone' || record.owner_email?.toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
    }
    const config = getLuxorTwilioConfig()
    const client = twilio(config.accountSid, config.authToken)
    const [parent, children] = await Promise.all([
      client.calls(callSid).fetch(),
      client.calls.list({ parentCallSid: callSid, limit: 20 }),
    ])
    const customer = children.find((call) => call.to === record.callee_number)
    return NextResponse.json({ parentStatus: parent.status, customerStatus: customer?.status ?? null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Unable to check browser phone bridge status:', error)
    return NextResponse.json({ error: 'Unable to check call status. Retrying.' }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  try {
    const member = await getLuxorPortalMember(session.email)
    if (!member || member.status !== 'active' || !memberCan(member, 'calls')) {
      return NextResponse.json({ error: 'Phone access is not enabled for this account.' }, { status: 403 })
    }
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
      statusCallback: buildTwilioCallbackUrl('/api/twilio/status', { direction: 'bridge_agent' }),
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
