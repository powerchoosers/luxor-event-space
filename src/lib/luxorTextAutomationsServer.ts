import 'server-only'

import twilio from 'twilio'
import { normalizePhoneNumber } from './luxorCallsServer'
import { createOrUpdateLuxorMessage } from './luxorMessagesServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { supabaseRest } from './supabaseRestServer'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from './luxorTwilioServer'

type ConsentStatus = 'unknown' | 'opted_in' | 'opted_out'
type AutomationType = 'missed_call' | 'inbound_acknowledgment'
type ConsentRow = { phone_number: string; status: ConsentStatus; updated_at: string }
type AutomationEvent = { id: string; status: 'pending' | 'sent' | 'skipped' | 'failed' }

export function getSmsControlType(body: string, twilioOptOutType?: string | null) {
  const provided = twilioOptOutType?.trim().toUpperCase()
  if (provided === 'STOP' || provided === 'START' || provided === 'HELP') return provided
  const keyword = body.trim().toUpperCase()
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(keyword)) return 'STOP'
  if (['START', 'UNSTOP'].includes(keyword)) return 'START'
  if (['HELP', 'INFO'].includes(keyword)) return 'HELP'
  return null
}

export async function recordLuxorSmsConsent(phone: string, controlType: 'STOP' | 'START', source: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return null
  const timestamp = new Date().toISOString()
  const status: ConsentStatus = controlType === 'STOP' ? 'opted_out' : 'opted_in'
  const [saved] = await supabaseRest<ConsentRow[]>('luxor_sms_consents?on_conflict=phone_number&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      phone_number: phoneNumber,
      status,
      source,
      opted_out_at: status === 'opted_out' ? timestamp : null,
      opted_in_at: status === 'opted_in' ? timestamp : null,
      updated_at: timestamp,
    }),
  })
  return saved ?? null
}

export async function assertLuxorSmsAllowed(phone: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) throw new Error('Enter a valid mobile phone number.')
  const [consent] = await supabaseRest<ConsentRow[]>(`luxor_sms_consents?select=phone_number,status,updated_at&phone_number=eq.${encodeURIComponent(phoneNumber)}&limit=1`)
  if (consent?.status === 'opted_out') throw new Error('This person opted out of Luxor text messages. They must text START before the CRM can message them again.')
  return phoneNumber
}

export async function sendLuxorAutomatedText(input: {
  type: AutomationType
  sourceId: string
  to: string
  body: string
  inquiryId?: string | null
  contactName?: string | null
  cooldownHours?: number
}) {
  const destination = await assertLuxorSmsAllowed(input.to)
  if (input.type === 'inbound_acknowledgment' && await hasRecentAutomation(destination, input.type, input.cooldownHours ?? 12)) return null

  const [claim] = await supabaseRest<AutomationEvent[]>('luxor_text_automation_events?on_conflict=automation_type,source_id&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ automation_type: input.type, source_id: input.sourceId, recipient_number: destination, status: 'pending' }),
  })
  if (!claim) return null

  try {
    const config = getLuxorTwilioMessagingConfig()
    const from = await getActiveLuxorPhoneNumber()
    const client = twilio(config.accountSid, config.authToken)
    const sent = await client.messages.create({
      to: destination,
      ...(config.messagingServiceSid ? { messagingServiceSid: config.messagingServiceSid } : { from }),
      body: input.body,
      statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
    })
    await Promise.all([
      createOrUpdateLuxorMessage({
        sid: sent.sid,
        direction: 'outbound',
        status: normalizeStatus(sent.status),
        from,
        to: destination,
        body: input.body,
        inquiryId: input.inquiryId,
        contactName: input.contactName,
        ownerEmail: 'luxor-automation',
        isRead: true,
      }),
      updateEvent(claim.id, { status: 'sent', twilio_message_sid: sent.sid }),
    ])
    return sent.sid
  } catch (error) {
    await updateEvent(claim.id, { status: 'failed', error_message: error instanceof Error ? error.message.slice(0, 500) : 'Unknown Twilio error' })
    throw error
  }
}

async function hasRecentAutomation(phone: string, type: AutomationType, cooldownHours: number) {
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()
  const events = await supabaseRest<AutomationEvent[]>(`luxor_text_automation_events?select=id,status&automation_type=eq.${type}&recipient_number=eq.${encodeURIComponent(phone)}&status=eq.sent&created_at=gte.${encodeURIComponent(cutoff)}&limit=1`)
  return events.length > 0
}

async function updateEvent(id: string, values: Record<string, unknown>) {
  return supabaseRest(`luxor_text_automation_events?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  })
}

function normalizeStatus(value: string | undefined) {
  return ['accepted', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received'].includes(value || '')
    ? value as import('./luxorMessageTypes').LuxorMessageStatus
    : 'queued'
}
