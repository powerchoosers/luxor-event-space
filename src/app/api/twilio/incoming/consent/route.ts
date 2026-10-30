import { getLuxorCallBySid, saveLuxorConsent } from '@/lib/luxorCallsServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { buildTwilioCallbackUrl, createTwilioVoiceResponse, forbiddenTwimlResponse, getLuxorTwilioConfig, readTwilioForm, twimlResponse, validateTwilioWebhook } from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()
  const callSid = new URL(request.url).searchParams.get('recordCallSid')
  const response = createTwilioVoiceResponse()
  if (!callSid || params.CallSid !== callSid) {
    response.say('We could not verify this call. Please try again later.')
    response.hangup()
    return twimlResponse(response)
  }

  const requestedConsent = params.Digits === '1'
  const consent = await saveLuxorConsent(callSid, requestedConsent)
  const consented = consent?.recording_consent_status === 'consented'
  const [call, settings] = await Promise.all([getLuxorCallBySid(callSid), getLuxorPhoneRoutingSettings()])
  if (!call) {
    response.say('We could not connect your call. Please try again later.')
    response.hangup()
    return twimlResponse(response)
  }

  if (consented) {
    response.start().transcription({
      name: `Luxor ${callSid}`,
      statusCallbackUrl: buildTwilioCallbackUrl('/api/twilio/transcriptions'),
      track: 'both_tracks',
      inboundTrackLabel: 'caller',
      outboundTrackLabel: 'luxor_agent',
      transcriptionEngine: 'google',
      speechModel: 'telephony',
      partialResults: false,
    })
  }

  const dial = response.dial({
    action: buildTwilioCallbackUrl('/api/twilio/incoming/complete', { recordCallSid: callSid }),
    answerOnBridge: true,
    callerId: call.caller_number,
    method: 'POST',
    timeout: 30,
    ...(consented ? {
      record: 'record-from-answer-dual',
      recordingStatusCallback: buildTwilioCallbackUrl('/api/twilio/recording-status', { recordCallSid: callSid }),
      recordingStatusCallbackEvent: ['completed'],
      recordingStatusCallbackMethod: 'POST',
    } : {}),
  })
  const configClient = getLuxorTwilioConfig().clientIdentity
  if (settings.ring_browser) {
    const client = dial.client({
      statusCallback: buildTwilioCallbackUrl('/api/twilio/status', { recordCallSid: callSid, direction: 'inbound' }),
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }, configClient)
    client.parameter({ name: 'CallerName', value: call.contact_name || '' })
    client.parameter({ name: 'CallerNumber', value: call.caller_number })
    client.parameter({ name: 'InquiryId', value: call.inquiry_id || '' })
    client.parameter({ name: 'ParentCallSid', value: callSid })
    client.parameter({ name: 'Direction', value: 'inbound' })
  }
  const ringTo = settings.ring_phone ? settings.ring_to_number : null
  if (ringTo && ringTo !== call.callee_number) {
    dial.number({
      statusCallback: buildTwilioCallbackUrl('/api/twilio/status', { recordCallSid: callSid, direction: 'inbound' }),
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }, ringTo)
  }
  return twimlResponse(response)
}
