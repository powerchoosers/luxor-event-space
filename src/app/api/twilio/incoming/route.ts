import { after } from 'next/server'
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
import { sendLuxorWebPush } from '@/lib/luxorWebPushServer'

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

    after(async () => {
      const callerLabel = callerName === 'Unknown caller'
        ? callerNumber
        : `${callerName} · ${callerNumber}`
      await sendLuxorWebPush('call', {
        title: 'Incoming Luxor call',
        body: callerLabel,
        url: '/portal/calls',
        tag: `luxor-call-${params.CallSid}`,
      }).catch((pushError) => {
        console.error('Incoming Luxor call stored, but Web Push delivery failed:', pushError)
      })
    })

    const statusCallback = buildTwilioCallbackUrl('/api/twilio/status', {
      recordCallSid: params.CallSid,
      direction: 'inbound',
    })
    const completeCallback = buildTwilioCallbackUrl('/api/twilio/incoming/complete', {
      recordCallSid: params.CallSid,
    })
    const consent = response.gather({
      action: buildTwilioCallbackUrl('/api/twilio/incoming/consent', { recordCallSid: params.CallSid }),
      actionOnEmptyResult: true,
      method: 'POST',
      numDigits: 1,
      timeout: 8,
    })
    consent.say({ voice: 'Polly.Joanna' }, 'For quality and follow-up, Luxor can record and transcribe this call. Press 1 to consent. Press 2 to continue without recording. If you do not choose, the call will continue without recording.')
  } catch (error) {
    console.error('Luxor inbound TwiML failed:', error)
    response.say('We are unable to connect your call right now. Please try again shortly.')
    response.hangup()
  }

  return twimlResponse(response)
}
