import 'server-only'

import twilio from 'twilio'
import { normalizePhoneNumber } from './luxorCallsServer'
import { createOrUpdateLuxorMessage } from './luxorMessagesServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { supabaseRest } from './supabaseRestServer'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from './luxorTwilioServer'
import { getLuxorInquiry } from './luxorInquiriesServer'
import { recordLuxorTestSmsSimulation } from './luxorTestLeadServer'
import { LUXOR_PERMANENT_TEST_LEAD_ID, LUXOR_TEST_PHONE_E164_DIGITS } from './luxorTestLeadPolicy'

type ConsentStatus = 'unknown' | 'opted_in' | 'opted_out'
type AutomationType = 'missed_call' | 'inbound_acknowledgment'
type ConsentRow = {
  phone_number: string
  status: ConsentStatus
  updated_at: string
  consent_scopes?: string[]
  proof?: Record<string, unknown>
  last_confirmed_at?: string | null
}
type AutomationEvent = { id: string; status: 'pending' | 'sent' | 'skipped' | 'failed' }

const LUXOR_SMS_CONSENT_REQUEST_SCOPES = ['customer_care', 'tour', 'event']

type SmsConsentRequestProof = {
  request_id?: string
  status?: 'pending' | 'failed' | 'confirmed'
  requested_at?: string
  from_number?: string
  message_sid?: string
  scopes?: string[]
}

export function getSmsControlType(body: string, twilioOptOutType?: string | null) {
  const provided = twilioOptOutType?.trim().toUpperCase()
  if (provided === 'STOP' || provided === 'START' || provided === 'HELP') return provided
  const keyword = body.trim().toUpperCase()
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(keyword)) return 'STOP'
  if (['START', 'UNSTOP'].includes(keyword)) return 'START'
  if (['HELP', 'INFO'].includes(keyword)) return 'HELP'
  return null
}

export async function recordLuxorSmsConsent(
  phone: string,
  controlType: 'STOP' | 'START',
  source: string,
  options: { scopes?: string[]; proof?: Record<string, unknown> } = {},
) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return null
  const timestamp = new Date().toISOString()
  const status: ConsentStatus = controlType === 'STOP' ? 'opted_out' : 'opted_in'
  const consentScopes = status === 'opted_in'
    ? options.scopes || ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice']
    : []
  const existing = await getLuxorSmsConsent(phoneNumber)
  const existingProof = (existing?.proof && typeof existing.proof === 'object') ? existing.proof : {}
  const request = existingProof.sms_consent_request as SmsConsentRequestProof | undefined
  const updatedRequest = status === 'opted_in' && request?.status === 'pending'
    ? { ...request, status: 'confirmed' as const }
    : request

  const [saved] = await supabaseRest<ConsentRow[]>('luxor_sms_consents?on_conflict=phone_number&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      phone_number: phoneNumber,
      status,
      source,
      opted_out_at: status === 'opted_out' ? timestamp : null,
      opted_in_at: status === 'opted_in' ? timestamp : null,
      consent_scopes: consentScopes,
      proof: {
        ...existingProof,
        ...(updatedRequest ? { sms_consent_request: updatedRequest } : {}),
        ...(options.proof || {}),
        source,
        captured_at: timestamp,
      },
      last_confirmed_at: status === 'opted_in' ? timestamp : null,
      updated_at: timestamp,
    }),
  })
  return saved ?? null
}

export async function recordLuxorManualSmsConsent(
  phone: string,
  ownerEmail: string,
  reason?: string,
) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) throw new Error('Enter a valid mobile phone number.')
  return recordLuxorSmsConsent(phoneNumber, 'START', 'portal_manual_opt_in', {
    scopes: ['customer_care', 'transactional', 'tour', 'event', 'payment', 'invoice', 'marketing'],
    proof: {
      method: 'portal_manual_opt_in',
      opted_in_by: ownerEmail,
      reason: reason || 'Manual opt-in via portal',
    },
  })
}

/**
 * Record consent collected by the public inquiry form without allowing a
 * repeated submission to reverse a previously recorded SMS opt-out. A
 * website checkbox is not the equivalent of an inbound START keyword.
 *
 * The conditional PATCH protects an existing opted-out row. If no row exists,
 * INSERT ... ON CONFLICT DO NOTHING protects a STOP that races with the form
 * submission. Explicit inbound START continues to use recordLuxorSmsConsent.
 */
export async function recordLuxorWebsiteSmsConsent(
  phone: string,
  source: string,
  options: { scopes?: string[]; proof?: Record<string, unknown> } = {},
) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return null

  const existing = await getLuxorSmsConsent(phoneNumber)
  // A later web form is not an inbound START keyword. Keep STOP authoritative.
  if (existing?.status === 'opted_out') return existing

  const timestamp = new Date().toISOString()
  const consentScopes = options.scopes || ['customer_care', 'tour', 'event']
  const currentProof = {
    ...(options.proof || {}),
    source,
    captured_at: timestamp,
  }
  const consent = {
    status: 'opted_in' as const,
    source,
    opted_out_at: null,
    opted_in_at: timestamp,
    consent_scopes: consentScopes,
    // Inquiry-level metadata keeps each new form submission's proof. Keep
    // the consent row's existing proof stable instead of replacing the
    // original evidence on every repeated opt-in.
    proof: existing?.proof ?? currentProof,
    last_confirmed_at: timestamp,
    updated_at: timestamp,
  }

  const phoneFilter = `phone_number=eq.${encodeURIComponent(phoneNumber)}`
  const [updated] = await supabaseRest<ConsentRow[]>(`luxor_sms_consents?${phoneFilter}&status=neq.opted_out&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(consent),
  })
  if (updated) return updated

  const [inserted] = await supabaseRest<ConsentRow[]>('luxor_sms_consents?on_conflict=phone_number&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ phone_number: phoneNumber, ...consent }),
  })
  if (inserted) return inserted

  // A conflicting row may have been inserted concurrently by a STOP webhook.
  return getLuxorSmsConsent(phoneNumber)
}

export async function getLuxorSmsConsent(phone: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return null
  const [consent] = await supabaseRest<ConsentRow[]>(
    `luxor_sms_consents?select=phone_number,status,updated_at,consent_scopes,proof,last_confirmed_at&phone_number=eq.${encodeURIComponent(phoneNumber)}&limit=1`,
  )
  return consent ?? null
}

export async function beginLuxorSmsConsentRequest(phone: string, requestId: string, fromNumber: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) throw new Error('Enter a valid mobile phone number.')
  const existing = await getLuxorSmsConsent(phoneNumber)
  if (existing?.status === 'opted_out') throw new Error('This person opted out. They must text START before Luxor can message them again.')
  if (existing?.status === 'opted_in') throw new Error('This person has already opted in to Luxor SMS.')

  const previousRequest = existing?.proof?.sms_consent_request as SmsConsentRequestProof | undefined
  if (previousRequest?.status === 'pending') throw new Error('A consent request is already awaiting a reply.')

  const timestamp = new Date().toISOString()
  const consentRequest: SmsConsentRequestProof = {
    request_id: requestId,
    status: 'pending',
    requested_at: timestamp,
    from_number: normalizePhoneNumber(fromNumber) || fromNumber,
    scopes: LUXOR_SMS_CONSENT_REQUEST_SCOPES,
  }
  const proof = { ...(existing?.proof || {}), sms_consent_request: consentRequest }

  if (existing) {
    const updated = await supabaseRest<ConsentRow[]>(
      `luxor_sms_consents?phone_number=eq.${encodeURIComponent(phoneNumber)}&status=eq.unknown&updated_at=eq.${encodeURIComponent(existing.updated_at)}&select=*`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ source: 'manual_sms_consent_request', proof, updated_at: timestamp }),
      },
    )
    if (updated[0]) return updated[0]
    throw new Error('SMS consent changed while preparing the request. Refresh this conversation and try again.')
  }

  const inserted = await supabaseRest<ConsentRow[]>('luxor_sms_consents?on_conflict=phone_number&select=*', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ phone_number: phoneNumber, status: 'unknown', source: 'manual_sms_consent_request', proof, updated_at: timestamp }),
  })
  if (inserted[0]) return inserted[0]

  const raced = await getLuxorSmsConsent(phoneNumber)
  if (raced?.status === 'opted_out') throw new Error('This person opted out. They must text START before Luxor can message them again.')
  if (raced?.status === 'opted_in') throw new Error('This person has already opted in to Luxor SMS.')
  throw new Error('A consent request was started in another session. Refresh this conversation before trying again.')
}

export async function finishLuxorSmsConsentRequest(phone: string, requestId: string, result: { status: 'pending' | 'failed'; messageSid?: string }) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return
  const current = await getLuxorSmsConsent(phoneNumber)
  const request = current?.proof?.sms_consent_request as SmsConsentRequestProof | undefined
  if (!current || current.status !== 'unknown' || request?.request_id !== requestId || request.status !== 'pending') return

  const timestamp = new Date().toISOString()
  const proof = {
    ...(current.proof || {}),
    sms_consent_request: { ...request, status: result.status, ...(result.messageSid ? { message_sid: result.messageSid } : {}) },
  }
  await supabaseRest(
    `luxor_sms_consents?phone_number=eq.${encodeURIComponent(phoneNumber)}&status=eq.unknown&updated_at=eq.${encodeURIComponent(current.updated_at)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ proof, updated_at: timestamp }),
    },
  )
}

export async function recordLuxorSmsConsentReply(phone: string, messageSid: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) return false
  const current = await getLuxorSmsConsent(phoneNumber)
  if (!current || current.status !== 'unknown') return false

  const request = current.proof?.sms_consent_request as SmsConsentRequestProof | undefined
  if (request?.status !== 'pending' || !request.request_id) return false

  const timestamp = new Date().toISOString()
  const proof = {
    ...(current.proof || {}),
    sms_consent_request: { ...request, status: 'confirmed' as const },
    sms_consent_reply: {
      keyword: 'YES',
      message_sid: messageSid,
      request_id: request.request_id,
      request_message_sid: request.message_sid || null,
      confirmed_at: timestamp,
    },
  }
  const [saved] = await supabaseRest<ConsentRow[]>(
    `luxor_sms_consents?phone_number=eq.${encodeURIComponent(phoneNumber)}&status=eq.unknown&updated_at=eq.${encodeURIComponent(current.updated_at)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'opted_in',
        source: 'inbound_sms_consent_keyword',
        opted_in_at: timestamp,
        opted_out_at: null,
        consent_scopes: request.scopes || LUXOR_SMS_CONSENT_REQUEST_SCOPES,
        proof,
        last_confirmed_at: timestamp,
        updated_at: timestamp,
      }),
    },
  )
  return Boolean(saved)
}

export async function assertLuxorSmsAllowed(phone: string) {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) throw new Error('Enter a valid mobile phone number.')
  const consent = await getLuxorSmsConsent(phoneNumber)
  if (consent?.status === 'opted_out') throw new Error('This person opted out of Luxor text messages. They must text START before the CRM can message them again.')
  if (consent?.status !== 'opted_in') throw new Error('This person has not opted in to Luxor text messages. Record their consent before sending.')
  const scopes = Array.isArray(consent.consent_scopes) ? consent.consent_scopes : []
  if (!scopes.includes('customer_care')) throw new Error('This person has not opted in to customer-care texts.')
  return phoneNumber
}

export async function assertLuxorAutomatedSmsAllowed(phone: string, requiredScope = 'customer_care') {
  const phoneNumber = normalizePhoneNumber(phone)
  if (!phoneNumber) throw new Error('Enter a valid mobile phone number.')
  const consent = await getLuxorSmsConsent(phoneNumber)
  if (consent?.status !== 'opted_in') {
    throw new Error('Automated texts require a recorded customer opt-in.')
  }
  const scopes = Array.isArray(consent.consent_scopes) ? consent.consent_scopes : []
  if (!scopes.includes(requiredScope)) {
    throw new Error(`This customer has not opted in to ${requiredScope.replace(/_/g, ' ')} texts.`)
  }
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
  const inquiry = input.inquiryId ? await getLuxorInquiry(input.inquiryId) : null
  const normalizedTestDestination = normalizePhoneNumber(input.to)?.replace(/\D/g, '')
  if (inquiry?.is_test || normalizedTestDestination === LUXOR_TEST_PHONE_E164_DIGITS) {
    if (normalizedTestDestination !== LUXOR_TEST_PHONE_E164_DIGITS || (inquiry && inquiry.id !== LUXOR_PERMANENT_TEST_LEAD_ID)) {
      throw new Error('Automated texts to the permanent test lead are limited to its verified test number.')
    }
    const simulation = await recordLuxorTestSmsSimulation({
      inquiryId: inquiry?.id || LUXOR_PERMANENT_TEST_LEAD_ID,
      body: input.body,
      source: `automated_text:${input.type}`,
    })
    if (!simulation) throw new Error('No active enabled test run is available for SMS simulation.')
    return `SIMULATED-${String((simulation.artifact as { id?: string }).id || 'sms')}`
  }
  const destination = await assertLuxorAutomatedSmsAllowed(input.to, 'customer_care')
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
      ...(config.messagingServiceSid ? { messagingServiceSid: config.messagingServiceSid, fallbackFrom: from } : { from }),
      body: input.body,
      statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
    })
    await Promise.all([
      createOrUpdateLuxorMessage({
        sid: sent.sid,
        direction: 'outbound',
        status: normalizeStatus(sent.status),
        // Keep the selected business line as the CRM conversation line. Twilio may
        // return the branded RCS sender here even though this number owns fallback.
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
