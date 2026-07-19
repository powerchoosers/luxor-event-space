import { NextResponse } from 'next/server'
import { getLuxorCallByRecordingSid } from '@/lib/luxorCallsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorTwilioConfig } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ sid: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const { sid } = await context.params
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) {
    return NextResponse.json({ error: 'Invalid recording ID.' }, { status: 400 })
  }

  const call = await getLuxorCallByRecordingSid(sid)
  if (!call) return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })

  const config = getLuxorTwilioConfig()
  const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${sid}.mp3`
  const upstream = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
    },
    cache: 'no-store',
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Recording is not available yet.' }, { status: upstream.status || 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="luxor-call-${sid}.mp3"`,
    },
  })
}

