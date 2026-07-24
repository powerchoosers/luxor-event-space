import 'server-only'

import twilio from 'twilio'
import { assertAllowedOutboundNumber } from './luxorCallsServer'
import { createOrUpdateLuxorMessage } from './luxorMessagesServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { assertLuxorSmsAllowed } from './luxorTextAutomationsServer'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from './luxorTwilioServer'

export async function sendLuxorDirectText(input: {
  to?: string | null
  body?: string | null
  inquiryId?: string | null
  contactName?: string | null
  ownerEmail?: string | null
  fromNumber?: string | null
}) {
  const destination = await assertLuxorSmsAllowed(assertAllowedOutboundNumber(input.to))
  const text = String(input.body || '').trim()
  if (!text) throw new Error('Write a message before sending.')
  if (text.length > 1600) throw new Error('Keep messages to 1,600 characters or fewer.')

  const config = getLuxorTwilioMessagingConfig()
  const selectedPhoneNumber = input.fromNumber || await getActiveLuxorPhoneNumber()
  const client = twilio(config.accountSid, config.authToken)
  const sent = await client.messages.create({
    to: destination,
    ...(config.messagingServiceSid
      ? { messagingServiceSid: config.messagingServiceSid, fallbackFrom: selectedPhoneNumber }
      : { from: selectedPhoneNumber }),
    body: text,
    statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
  })

  return createOrUpdateLuxorMessage({
    sid: sent.sid,
    direction: 'outbound',
    status: normalizeMessageStatus(sent.status),
    from: selectedPhoneNumber,
    to: destination,
    body: text,
    inquiryId: input.inquiryId,
    contactName: input.contactName,
    ownerEmail: input.ownerEmail,
    isRead: true,
  })
}

function normalizeMessageStatus(value: string | undefined) {
  return ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'received'].includes(value || '')
    ? value as import('./luxorMessageTypes').LuxorMessageStatus
    : 'queued'
}
