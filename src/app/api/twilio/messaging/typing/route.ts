import { NextRequest, NextResponse } from 'next/server'
import { assertAllowedOutboundNumber } from '@/lib/luxorCallsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorTwilioMessagingConfig } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!await getLuxorPortalSession()) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  try {
    const { to } = await request.json() as { to?: string }
    const destination = assertAllowedOutboundNumber(to)
    const config = getLuxorTwilioMessagingConfig()
    if (!config.rcsSenderId || !config.messagingServiceSid) return NextResponse.json({ enabled: false })

    const sender = config.rcsSenderId.startsWith('rcs:') ? config.rcsSenderId : `rcs:${config.rcsSenderId}`
    const response = await fetch('https://messaging.twilio.com/v3/Indicators/Typing.json', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: 'RCS', from: sender, to: `rcs:${destination}`, event: 'START' }),
    })
    if (!response.ok) {
      const payload = await response.text()
      console.error('Twilio RCS typing indicator failed:', response.status, payload.slice(0, 500))
      return NextResponse.json({ enabled: true, sent: false }, { status: 502 })
    }
    return NextResponse.json({ enabled: true, sent: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send typing indicator.' }, { status: 400 })
  }
}
