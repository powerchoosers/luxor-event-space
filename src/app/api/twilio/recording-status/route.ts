import { NextResponse } from 'next/server'
import { saveLuxorVoicemail } from '@/lib/luxorCallsServer'
import { parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) {
    return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  }

  const recordCallSid = new URL(request.url).searchParams.get('recordCallSid') || params.CallSid
  try {
    await saveLuxorVoicemail({
      callSid: recordCallSid,
      recordingSid: params.RecordingSid,
      recordingUrl: params.RecordingUrl,
      recordingDurationSeconds: parseTwilioInteger(params.RecordingDuration),
      recordingStatus: params.RecordingStatus || 'completed',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor voicemail update failed:', error)
    return NextResponse.json({ error: 'Unable to save voicemail.' }, { status: 500 })
  }
}

