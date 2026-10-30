import { NextResponse } from 'next/server'
import { getLuxorCallByRecordingSid } from '@/lib/luxorCallsServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorTwilioConfig } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ sid: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

  const { sid } = await context.params
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) {
    return NextResponse.json({ error: 'Invalid recording ID.' }, { status: 400 })
  }

  const call = await getLuxorCallByRecordingSid(sid)
  const inquiryId = new URL(request.url).searchParams.get('inquiryId')
  if (!call || !inquiryId || call.inquiry_id !== inquiryId) return NextResponse.json({ error: 'Recording not found for this lead.' }, { status: 404 })

  if (call.recording_storage_path) {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return NextResponse.json({ error: 'Private recording storage is not configured.' }, { status: 503 })
    const encodedPath = call.recording_storage_path.split('/').map(encodeURIComponent).join('/')
    const range = request.headers.get('range')
    const stored = await fetch(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/luxor-call-recordings/${encodedPath}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...(range ? { Range: range } : {}) }, cache: 'no-store',
    })
    if (!stored.ok || !stored.body) return NextResponse.json({ error: 'Private recording is not available yet.' }, { status: stored.status || 502 })
    const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="luxor-call-${sid}.mp3"` })
    for (const name of ['content-range', 'content-length', 'accept-ranges']) {
      const value = stored.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
    return new Response(stored.body, { status: stored.status, headers })
  }

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

