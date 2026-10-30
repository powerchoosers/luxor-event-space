import twilio from 'twilio'
import { NextResponse } from 'next/server'
import { claimLuxorOutboundRecording, getLuxorCallBySid, saveLuxorConsent, setLuxorOutboundRecordingStart } from '@/lib/luxorCallsServer'
import { buildTwilioCallbackUrl, createTwilioVoiceResponse, forbiddenTwimlResponse, getLuxorTwilioConfig, readTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()
  const parentCallSid = new URL(request.url).searchParams.get('recordCallSid') || ''
  const response = createTwilioVoiceResponse()
  if (!/^CA[0-9a-f]{32}$/i.test(parentCallSid) || !/^CA[0-9a-f]{32}$/i.test(params.CallSid || '')) {
    response.say('We could not verify this call. Please try again later.')
    response.hangup()
    return twimlResponse(response)
  }

  const call = await getLuxorCallBySid(parentCallSid)
  if (!call || call.direction !== 'outbound') {
    response.say('We could not connect your call. Please try again later.')
    response.hangup()
    return twimlResponse(response)
  }

  if (!params.Digits) {
    const gather = response.gather({
      action: buildTwilioCallbackUrl('/api/twilio/outbound/consent', { recordCallSid: parentCallSid }),
      actionOnEmptyResult: true, method: 'POST', numDigits: 1, timeout: 8,
    })
    gather.say({ voice: 'Polly.Joanna' }, 'For quality and follow-up, Luxor can record and transcribe this call. Press 1 to consent. Press 2 to continue without recording. If you do not choose, the call will continue without recording.')
    return twimlResponse(response)
  }

  const consent = await saveLuxorConsent(parentCallSid, params.Digits === '1')
  const consented = consent?.recording_consent_status === 'consented'
  if (!consented) {
    response.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting you without recording.')
    return twimlResponse(response)
  }

  try {
    const claimed = await claimLuxorOutboundRecording(parentCallSid)
    if (!claimed) {
      response.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.')
      return twimlResponse(response)
    }
    const config = getLuxorTwilioConfig()
    const client = twilio(config.accountSid, config.authToken)
    await client.calls(parentCallSid).recordings.create({
      recordingChannels: 'dual',
      recordingStatusCallback: buildTwilioCallbackUrl('/api/twilio/recording-status', { recordCallSid: parentCallSid }),
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed'],
    })
    await setLuxorOutboundRecordingStart(parentCallSid, 'started')
    response.start().transcription({
      name: `Luxor ${parentCallSid}`,
      statusCallbackUrl: buildTwilioCallbackUrl('/api/twilio/transcriptions', { recordCallSid: parentCallSid }),
      track: 'both_tracks', inboundTrackLabel: 'caller', outboundTrackLabel: 'luxor_agent',
      transcriptionEngine: 'google', speechModel: 'telephony', partialResults: false,
    })
    response.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call.')
    return twimlResponse(response)
  } catch (error) {
    console.error('Luxor outbound recording could not start after consent:', error)
    await setLuxorOutboundRecordingStart(parentCallSid, 'failed').catch(() => undefined)
    response.say({ voice: 'Polly.Joanna' }, 'Thank you. Connecting your call without recording.')
    return twimlResponse(response)
  }
}
