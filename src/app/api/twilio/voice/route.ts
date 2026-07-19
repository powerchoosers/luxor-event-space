import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { createOrUpdateLuxorCall, assertAllowedOutboundNumber } from '@/lib/luxorCallsServer'
import { getLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import {
  buildTwilioCallbackUrl,
  createTwilioVoiceResponse,
  forbiddenTwimlResponse,
  getLuxorTwilioConfig,
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
    const config = getLuxorTwilioConfig()
    const activePhoneNumber = await getActiveLuxorPhoneNumber()
    const destination = assertAllowedOutboundNumber(params.To)
    const inquiryId = /^[0-9a-f-]{36}$/i.test(params.InquiryId || '') ? params.InquiryId : null
    const inquiry = inquiryId ? await getLuxorInquiry(inquiryId) : null
    const contactName = inquiry?.full_name || params.ContactName?.trim().slice(0, 160) || destination
    const ownerEmail = params.ownerEmail?.trim().toLowerCase() || null

    await createOrUpdateLuxorCall({
      twilioCallSid: params.CallSid,
      direction: 'outbound',
      status: 'initiated',
      fromNumber: activePhoneNumber,
      toNumber: destination,
      callerNumber: activePhoneNumber,
      calleeNumber: destination,
      inquiryId: inquiry?.id ?? null,
      contactName,
      ownerEmail,
      isRead: true,
      metadata: {
        source: 'browser',
        twilio_from: params.From || null,
      },
    })

    const statusCallback = buildTwilioCallbackUrl('/api/twilio/status', {
      recordCallSid: params.CallSid,
      direction: 'outbound',
    })
    const completeCallback = buildTwilioCallbackUrl('/api/twilio/outgoing/complete', {
      recordCallSid: params.CallSid,
    })
    const dial = response.dial({
      action: completeCallback,
      answerOnBridge: true,
      callerId: activePhoneNumber,
      method: 'POST',
      timeout: 30,
    })
    dial.number({
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }, destination)
  } catch (error) {
    console.error('Luxor outbound TwiML failed:', error)
    response.say('We could not complete that call. Please check the number and try again.')
    response.hangup()
  }

  return twimlResponse(response)
}

export async function GET() {
  const session = await getLuxorPortalSession()
  if (!session) return new Response('Portal login required.', { status: 401 })
  return new Response('Luxor TwiML voice endpoint is ready. Twilio must use HTTP POST.', { status: 200 })
}
