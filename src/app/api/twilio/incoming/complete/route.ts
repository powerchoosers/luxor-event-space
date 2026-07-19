import { updateLuxorCallStatus } from '@/lib/luxorCallsServer'
import {
  buildTwilioCallbackUrl,
  createTwilioVoiceResponse,
  forbiddenTwimlResponse,
  normalizeTwilioCallStatus,
  parseTwilioInteger,
  readTwilioForm,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()

  const recordCallSid = new URL(request.url).searchParams.get('recordCallSid') || params.CallSid
  const dialStatus = normalizeTwilioCallStatus(params.DialCallStatus)

  try {
    await updateLuxorCallStatus(recordCallSid, {
      status: dialStatus,
      childCallSid: params.DialCallSid || null,
      durationSeconds: parseTwilioInteger(params.DialCallDuration),
    })
  } catch (error) {
    console.error('Luxor inbound call completion update failed:', error)
  }

  const response = createTwilioVoiceResponse()
  if (dialStatus === 'completed') {
    response.hangup()
    return twimlResponse(response)
  }

  response.say({ voice: 'Polly.Joanna' }, 'Thank you for calling Luxor Event Space. We cannot answer right now. Please leave your name, number, event date, and a short message after the tone.')
  response.record({
    action: buildTwilioCallbackUrl('/api/twilio/incoming/voicemail-complete', { recordCallSid }),
    maxLength: 120,
    method: 'POST',
    playBeep: true,
    recordingStatusCallback: buildTwilioCallbackUrl('/api/twilio/recording-status', { recordCallSid }),
    recordingStatusCallbackEvent: ['completed'],
    recordingStatusCallbackMethod: 'POST',
    timeout: 6,
    trim: 'trim-silence',
  })
  response.say({ voice: 'Polly.Joanna' }, 'We did not receive a message. Please call again or visit luxor atlas palmas dot com.')
  response.hangup()
  return twimlResponse(response)
}

