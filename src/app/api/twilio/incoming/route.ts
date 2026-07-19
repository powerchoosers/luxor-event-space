import { createOrUpdateLuxorCall, findLuxorInquiryByPhone, normalizePhoneNumber } from '@/lib/luxorCallsServer'
import {
  buildTwilioCallbackUrl,
  createTwilioVoiceResponse,
  forbiddenTwimlResponse,
  getLuxorTwilioConfig,
  readTwilioForm,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()

  const response = createTwilioVoiceResponse()

  try {
    const config = getLuxorTwilioConfig()
    const callerNumber = normalizePhoneNumber(params.From) || params.From || 'anonymous'
    const inquiry = await findLuxorInquiryByPhone(callerNumber)
    const callerName = inquiry?.full_name || (callerNumber === 'anonymous' ? 'Anonymous caller' : 'Unknown caller')

    await createOrUpdateLuxorCall({
      twilioCallSid: params.CallSid,
      direction: 'inbound',
      status: 'ringing',
      fromNumber: callerNumber,
      toNumber: params.To || config.phoneNumber,
      callerNumber,
      calleeNumber: params.To || config.phoneNumber,
      inquiryId: inquiry?.id ?? null,
      contactName: callerName,
      isRead: false,
      metadata: {
        caller_city: params.FromCity || null,
        caller_state: params.FromState || null,
        caller_country: params.FromCountry || null,
        stir_status: params.StirStatus || null,
      },
    })

    const statusCallback = buildTwilioCallbackUrl('/api/twilio/status', {
      recordCallSid: params.CallSid,
      direction: 'inbound',
    })
    const completeCallback = buildTwilioCallbackUrl('/api/twilio/incoming/complete', {
      recordCallSid: params.CallSid,
    })
    const dial = response.dial({
      action: completeCallback,
      answerOnBridge: true,
      callerId: callerNumber,
      method: 'POST',
      timeout: 30,
    })
    const routing = await getLuxorPhoneRoutingSettings()
    if (routing.ring_browser) {
      const client = dial.client({
        statusCallback,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      }, config.clientIdentity)
      client.parameter({ name: 'CallerName', value: callerName })
      client.parameter({ name: 'CallerNumber', value: callerNumber })
      client.parameter({ name: 'InquiryId', value: inquiry?.id || '' })
      client.parameter({ name: 'ParentCallSid', value: params.CallSid })
      client.parameter({ name: 'Direction', value: 'inbound' })
    }

    const ringToNumber = normalizePhoneNumber(routing.ring_to_number)
    if (routing.ring_phone && ringToNumber && ringToNumber !== normalizePhoneNumber(params.To || config.phoneNumber)) {
      dial.number({
        statusCallback,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      }, ringToNumber)
    }
  } catch (error) {
    console.error('Luxor inbound TwiML failed:', error)
    response.say('We are unable to connect your call right now. Please try again shortly.')
    response.hangup()
  }

  return twimlResponse(response)
}
