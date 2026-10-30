import { NextResponse } from 'next/server'
import { getLuxorCallBySid, saveLuxorTranscriptEvent } from '@/lib/luxorCallsServer'
import { parseTwilioInteger, readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  const callSid = new URL(request.url).searchParams.get('recordCallSid') || params.CallSid
  const event = params.TranscriptionEvent
  const sequenceId = parseTwilioInteger(params.SequenceId)
  if (!/^CA[0-9a-f]{32}$/i.test(callSid || '') || !/^GT[0-9a-f]{32}$/i.test(params.TranscriptionSid || '') || !sequenceId || !['transcription-started', 'transcription-content', 'transcription-stopped', 'transcription-error'].includes(event || '')) {
    return NextResponse.json({ error: 'Malformed transcription event.' }, { status: 400 })
  }
  try {
    const call = await getLuxorCallBySid(callSid)
    if (!call || call.recording_consent_status !== 'consented') return NextResponse.json({ ok: true, ignored: true })
    let data: Record<string, unknown> = {}
    if (params.TranscriptionData) {
      try { data = JSON.parse(params.TranscriptionData) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Malformed transcription payload.' }, { status: 400 }) }
    }
    await saveLuxorTranscriptEvent({
      callSid, event: event!, sequenceId, transcriptionSid: params.TranscriptionSid!,
      transcriptionData: params.TranscriptionData, transcriptionProviderData: params.TranscriptionProviderData,
      track: String(data.track || params.Track || ''), timestamp: params.Timestamp,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor transcription callback failed:', error)
    return NextResponse.json({ error: 'Unable to save transcription.' }, { status: 500 })
  }
}
