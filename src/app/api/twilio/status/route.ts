import { NextResponse } from 'next/server'
import twilio from 'twilio'
import { claimLuxorTranscriptionStart, getLuxorCallBySid, setLuxorTranscriptionStart, setLuxorTranscriptionStatus, updateLuxorCallStatus } from '@/lib/luxorCallsServer'
import {
  buildTwilioCallbackUrl,
  getLuxorTwilioConfig,
  normalizeTwilioCallStatus,
  parseTwilioInteger,
  readTwilioForm,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) {
    return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const recordCallSid = url.searchParams.get('recordCallSid') || params.ParentCallSid || params.CallSid

  try {
    await updateLuxorCallStatus(recordCallSid, {
      status: normalizeTwilioCallStatus(params.CallStatus),
      childCallSid: params.CallSid,
      durationSeconds: parseTwilioInteger(params.CallDuration),
      sequenceNumber: parseTwilioInteger(params.SequenceNumber),
      metadata: {
        callback_source: params.CallbackSource || null,
        sip_response_code: params.SipResponseCode || null,
        stir_status: params.StirStatus || null,
      },
    })

    const legDirection = url.searchParams.get('direction')
    // Twilio's "answered" status callback event carries CallStatus="in-progress".
    if (params.CallStatus === 'in-progress' && legDirection !== 'bridge_agent') {
      const call = await getLuxorCallBySid(recordCallSid)
      // Inbound parent calls carry the caller track; outbound customer legs carry caller track.
      const transcriptionCallSid = legDirection === 'inbound' ? recordCallSid : params.CallSid
      const claimed = call && await claimLuxorTranscriptionStart(recordCallSid)
      if (claimed) {
        const config = getLuxorTwilioConfig()
        const client = twilio(config.accountSid, config.authToken)
        try {
          await client.calls(transcriptionCallSid).transcriptions.create({
            name: `Luxor ${recordCallSid}`,
            statusCallbackUrl: buildTwilioCallbackUrl('/api/twilio/transcriptions', { recordCallSid }),
            statusCallbackMethod: 'POST',
            track: 'both_tracks',
            inboundTrackLabel: call?.direction === 'inbound' ? 'luxor_agent' : 'caller',
            outboundTrackLabel: call?.direction === 'inbound' ? 'caller' : 'luxor_agent',
            transcriptionEngine: 'google', speechModel: 'telephony', partialResults: false, enableProviderData: true,
          })
          await setLuxorTranscriptionStart(recordCallSid, 'started')
        } catch (error) {
          console.error('Luxor live transcription could not start:', error)
          await setLuxorTranscriptionStart(recordCallSid, 'failed').catch(() => undefined)
          await setLuxorTranscriptionStatus(recordCallSid, 'failed').catch(() => undefined)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor Twilio status update failed:', error)
    return NextResponse.json({ error: 'Unable to update call status.' }, { status: 500 })
  }
}

