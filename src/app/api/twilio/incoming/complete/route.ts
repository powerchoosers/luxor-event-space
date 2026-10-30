import { getLuxorCallBySid, updateLuxorCallStatus } from '@/lib/luxorCallsServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { sendLuxorAutomatedText } from '@/lib/luxorTextAutomationsServer'
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
  const dialStatus = normalizeTwilioCallStatus(params.DialCallStatus)

  try {
    await updateLuxorCallStatus(recordCallSid, {
      status: dialStatus,
      childCallSid: params.DialCallSid || null,
      durationSeconds: parseTwilioInteger(params.DialCallDuration),
    })
    if (dialStatus !== 'completed') {
      const [call, settings] = await Promise.all([getLuxorCallBySid(recordCallSid), getLuxorPhoneRoutingSettings()])
      if (call && settings.missed_call_text_enabled) {
        try {
          await sendLuxorAutomatedText({
            type: 'missed_call',
            sourceId: recordCallSid,
            to: call.caller_number,
            body: settings.missed_call_text_body,
            inquiryId: call.inquiry_id,
            contactName: call.contact_name,
          })
        } catch (error) {
          console.error('Luxor missed-call text failed:', error)
        }
      }
    }
  } catch (error) {
    console.error('Luxor inbound call completion update failed:', error)
  }

  const response = createTwilioVoiceResponse()
  if (dialStatus === 'completed') {
    response.hangup()
    return twimlResponse(response)
  }

  response.say({ voice: 'Polly.Joanna' }, 'Thank you for calling Luxor Event Space. We are unable to answer right now. Please call us again soon or visit luxor atlas palmas dot com.')
  response.hangup()
  return twimlResponse(response)
}
