import 'server-only'

import { randomUUID } from 'node:crypto'
import twilio from 'twilio'
import { assertAllowedOutboundNumber } from './luxorCallsServer'
import { createOrUpdateLuxorMessage } from './luxorMessagesServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { assertLuxorSmsAllowed, beginLuxorSmsConsentRequest, finishLuxorSmsConsentRequest } from './luxorTextAutomationsServer'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from './luxorTwilioServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { recordLuxorTestSmsSimulation } from './luxorTestLeadServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID, LUXOR_TEST_PHONE_E164_DIGITS } from './luxorTestLeadPolicy'

export async function sendLuxorDirectText(input: {
  to?: string | null
  body?: string | null
  inquiryId?: string | null
  contactName?: string | null
  ownerEmail?: string | null
  fromNumber?: string | null
}) {
  const destination = assertAllowedOutboundNumber(input.to)
  const text = String(input.body || '').trim()
  if (!text) throw new Error('Write a message before sending.')
  if (text.length > 1600) throw new Error('Keep messages to 1,600 characters or fewer.')

  const inquiry = input.inquiryId ? await getLuxorInquiry(input.inquiryId) : null
  const isVerifiedTestDestination = destination.replace(/\D/g, '') === LUXOR_TEST_PHONE_E164_DIGITS
  if (inquiry?.is_test || isVerifiedTestDestination) {
    if (!isVerifiedTestDestination || (inquiry && inquiry.id !== LUXOR_PERMANENT_TEST_LEAD_ID)) {
      throw new Error('Text to the permanent test lead is limited to its verified test number.')
    }
    const testLeadId = inquiry?.id || LUXOR_PERMANENT_TEST_LEAD_ID
    const simulation = await recordLuxorTestSmsSimulation({ inquiryId: testLeadId, body: text, source: 'direct_text' })
    if (!simulation) throw new Error('No active enabled test run is available for SMS simulation.')
    const artifact = simulation.artifact as { id?: string }
    const now = new Date().toISOString()
    const simulationId = randomUUID()
    return {
      id: `simulated-${simulationId}`,
      created_at: now,
      updated_at: now,
      twilio_message_sid: `SIMULATED-${simulationId}`,
      direction: 'outbound' as const,
      status: 'delivered' as const,
      from_number: input.fromNumber || '',
      to_number: destination,
      body: text,
      inquiry_id: testLeadId,
      contact_name: input.contactName || inquiry?.full_name || 'Luxor Test Lead',
      owner_email: input.ownerEmail || null,
      error_code: null,
      error_message: null,
      media_urls: [],
      is_read: true,
      simulated: true as const,
      test_run_id: simulation.test_run_id,
    }
  }
  if (inquiry?.is_test) throw new Error('Texts to the permanent test lead cannot be sent through Twilio.')
  const smsAllowedDestination = await assertLuxorSmsAllowed(destination)

  const config = getLuxorTwilioMessagingConfig()
  const selectedPhoneNumber = input.fromNumber || await getActiveLuxorPhoneNumber()
  const client = twilio(config.accountSid, config.authToken)
  const sent = await client.messages.create({
    to: smsAllowedDestination,
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
    to: smsAllowedDestination,
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

export async function sendLuxorSmsConsentRequest(input: {
  to: string
  inquiryId?: string | null
  contactName?: string | null
  ownerEmail?: string | null
  fromNumber?: string | null
}) {
  const destination = assertAllowedOutboundNumber(input.to)
  const inquiry = input.inquiryId ? await getLuxorInquiry(input.inquiryId) : null
  const isTestDestination = destination.replace(/\D/g, '') === LUXOR_TEST_PHONE_E164_DIGITS
  const body = 'Luxor Event Space: May we text you about your inquiry, tour, and event planning? Reply YES to agree. Message frequency varies; msg and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to book.'

  if (inquiry?.is_test || isTestDestination) {
    if (!isTestDestination || (inquiry && inquiry.id !== LUXOR_PERMANENT_TEST_LEAD_ID)) {
      throw new Error('Consent requests to the permanent test lead are limited to its verified test number.')
    }
    const simulation = await recordLuxorTestSmsSimulation({
      inquiryId: inquiry?.id || LUXOR_PERMANENT_TEST_LEAD_ID,
      body,
      source: 'sms_consent_request',
    })
    if (!simulation) throw new Error('No active enabled test run is available for SMS consent-request simulation.')
    return { simulated: true as const, message: null }
  }

  const selectedPhoneNumber = input.fromNumber || await getActiveLuxorPhoneNumber()
  const config = getLuxorTwilioMessagingConfig()
  const client = twilio(config.accountSid, config.authToken)
  const requestId = randomUUID()
  await beginLuxorSmsConsentRequest(destination, requestId, selectedPhoneNumber)

  let sent: Awaited<ReturnType<typeof client.messages.create>>
  try {
    sent = await client.messages.create({
      to: destination,
      ...(config.messagingServiceSid
        ? { messagingServiceSid: config.messagingServiceSid, fallbackFrom: selectedPhoneNumber }
        : { from: selectedPhoneNumber }),
      body,
      statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
    })
  } catch (error) {
    await finishLuxorSmsConsentRequest(destination, requestId, { status: 'failed' })
    throw error
  }

  // Persist the successful provider receipt before storing message history so
  // retries cannot send a second request if history storage has a transient error.
  await finishLuxorSmsConsentRequest(destination, requestId, { status: 'pending', messageSid: sent.sid })
  const message = await createOrUpdateLuxorMessage({
    sid: sent.sid,
    direction: 'outbound',
    status: normalizeMessageStatus(sent.status),
    from: selectedPhoneNumber,
    to: destination,
    body,
    inquiryId: input.inquiryId,
    contactName: input.contactName || inquiry?.full_name,
    ownerEmail: input.ownerEmail,
    isRead: true,
  })
  return { simulated: false as const, message }
}
