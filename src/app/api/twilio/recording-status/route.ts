import { NextResponse } from 'next/server'
import { saveLuxorRecordingCopy } from '@/lib/luxorCallsServer'
import { parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) {
    return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  }

  const recordCallSid = new URL(request.url).searchParams.get('recordCallSid') || params.CallSid
  try {
    if (params.RecordingStatus && params.RecordingStatus !== 'completed') return NextResponse.json({ ok: true, status: params.RecordingStatus })
    if (!/^RE[0-9a-f]{32}$/i.test(params.RecordingSid || '') || !params.RecordingUrl) {
      return NextResponse.json({ error: 'Malformed recording callback.' }, { status: 400 })
    }
    await saveLuxorRecordingCopy({
      callSid: recordCallSid,
      recordingSid: params.RecordingSid,
      recordingUrl: params.RecordingUrl,
      durationSeconds: parseTwilioInteger(params.RecordingDuration),
      voicemail: new URL(request.url).searchParams.get('voicemail') === 'true',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor private recording copy failed:', error)
    return NextResponse.json({ error: 'Unable to save voicemail.' }, { status: 500 })
  }
}

