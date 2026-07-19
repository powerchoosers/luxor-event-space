import { assertAllowedOutboundNumber } from '@/lib/luxorCallsServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import {
  buildTwilioCallbackUrl,
  createTwilioVoiceResponse,
  forbiddenTwimlResponse,
  readTwilioForm,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()
  const response = createTwilioVoiceResponse()

  try {
    const destination = assertAllowedOutboundNumber(new URL(request.url).searchParams.get('destination'))
    const activePhoneNumber = await getActiveLuxorPhoneNumber()
    const completeCallback = buildTwilioCallbackUrl('/api/twilio/outgoing/complete', { recordCallSid: params.CallSid })
    const statusCallback = buildTwilioCallbackUrl('/api/twilio/status', { recordCallSid: params.CallSid, direction: 'outbound' })

    response.say('Connecting your Luxor call.')
    const dial = response.dial({ action: completeCallback, answerOnBridge: true, callerId: activePhoneNumber, method: 'POST', timeout: 30 })
    dial.number({
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }, destination)
  } catch (error) {
    console.error('Luxor phone bridge failed:', error)
    response.say('We could not complete that call. Please check the number and try again.')
    response.hangup()
  }

  return twimlResponse(response)
}
