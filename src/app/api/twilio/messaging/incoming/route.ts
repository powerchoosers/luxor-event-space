import { NextRequest } from 'next/server'
import { readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { saveInboundLuxorMessage } from '@/lib/luxorMessagesServer'
import { getLuxorPhoneRoutingSettings } from '@/lib/luxorPhoneRoutingServer'
import { getSmsControlType, recordLuxorSmsConsent, sendLuxorAutomatedText } from '@/lib/luxorTextAutomationsServer'
import { recordTextCampaignReply } from '@/lib/luxorTextCampaignsServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return new Response('<Response/>', { status: 403, headers: { 'Content-Type': 'text/xml' } })
  const mediaUrls = Array.from({ length: Number.parseInt(params.NumMedia || '0', 10) || 0 }, (_, index) => params[`MediaUrl${index}`]).filter((url): url is string => Boolean(url))
  const message = await saveInboundLuxorMessage({ sid: params.MessageSid, from: params.From, to: params.To, body: params.Body || '', mediaUrls })
  const controlType = getSmsControlType(params.Body || '', params.OptOutType)
  await recordTextCampaignReply(params.From, controlType === 'STOP')
  if (controlType === 'STOP' || controlType === 'START') {
    await recordLuxorSmsConsent(params.From, controlType, params.OptOutType ? 'twilio_advanced_opt_out' : 'inbound_keyword')
  } else if (!controlType) {
    const settings = await getLuxorPhoneRoutingSettings()
    if (settings.inbound_text_reply_enabled) {
      try {
        await sendLuxorAutomatedText({
          type: 'inbound_acknowledgment',
          sourceId: params.MessageSid,
          to: params.From,
          body: settings.inbound_text_reply_body,
          inquiryId: message?.inquiry_id,
          contactName: message?.contact_name,
          cooldownHours: settings.inbound_text_reply_cooldown_hours,
        })
      } catch (error) {
        console.error('Luxor inbound text acknowledgment failed:', error)
      }
    }
  }
  return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}
