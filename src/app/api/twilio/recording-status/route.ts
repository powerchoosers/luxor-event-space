import { runLuxorPostCallTranscriptCorrection } from '@/lib/luxorPostCallTranscriptCorrectionServer'
import { saveLuxorRecordingCopy } from '@/lib/luxorCallsServer'
import { parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { after, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

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
    const saved = await saveLuxorRecordingCopy({
      callSid: recordCallSid,
      recordingSid: params.RecordingSid,
      recordingUrl: params.RecordingUrl,
      durationSeconds: parseTwilioInteger(params.RecordingDuration),
      recordingStartedAt: params.RecordingStartTime,
      voicemail: new URL(request.url).searchParams.get('voicemail') === 'true',
    })
    if (saved?.recording_storage_path && !saved.is_voicemail) {
      after(async () => {
        try {
          await runLuxorPostCallTranscriptCorrection(saved.twilio_call_sid)
        } catch (error) {
          console.error('[Luxor] Post-call transcript correction worker failed:', error)
        }
      })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor private recording copy failed:', error)
    return NextResponse.json({ error: 'Unable to save voicemail.' }, { status: 500 })
  }
}

