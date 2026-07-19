import { updateLuxorCallStatus } from '@/lib/luxorCallsServer'
import {
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
  try {
    await updateLuxorCallStatus(recordCallSid, {
      status: normalizeTwilioCallStatus(params.DialCallStatus),
      childCallSid: params.DialCallSid || null,
      durationSeconds: parseTwilioInteger(params.DialCallDuration),
    })
  } catch (error) {
    console.error('Luxor outgoing call completion update failed:', error)
  }

  const response = createTwilioVoiceResponse()
  response.hangup()
  return twimlResponse(response)
}

