import 'server-only'

import twilio from 'twilio'
import { normalizePhoneNumber } from './luxorCallsServer'
import type { LuxorBooking, LuxorInquiry, LuxorInvoice, LuxorPayment } from './luxorInquiryTypes'
import { createOrUpdateLuxorMessage } from './luxorMessagesServer'
import { getActiveLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import { supabaseRest } from './supabaseRestServer'
import {
  assertLuxorAutomatedSmsAllowed,
  getLuxorSmsConsent,
} from './luxorTextAutomationsServer'
import type {
  LuxorTextAudienceFilter,
  LuxorTextAudienceRecipient,
  LuxorTextCampaign,
  LuxorTextCampaignRecipient,
  LuxorTextCampaignType,
  LuxorTextJob,
  LuxorTextJobKind,
  LuxorTextJobStatus,
} from './luxorTextCampaignTypes'
import { buildTwilioCallbackUrl, getLuxorTwilioMessagingConfig } from './luxorTwilioServer'

const MAX_CAMPAIGN_RECIPIENTS = 1000
const MAX_CAMPAIGN_BODY_LENGTH = 480
const DEFAULT_DAILY_SEGMENT_LIMIT = 1800
const DEFAULT_WORKER_BATCH_SIZE = 10
const SMS_TIME_ZONE = 'America/Chicago'

type InquiryAudienceRow = Pick<
  LuxorInquiry,
  'id' | 'full_name' | 'phone' | 'event_type' | 'status' | 'target_date' | 'preferred_tour_date' | 'preferred_tour_time'
>

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = '^{}\\[~]|€'

export function estimateSmsSegments(value: string) {
  let gsmLength = 0
  let isGsm = true
  for (const character of value) {
    if (GSM_BASIC.includes(character)) gsmLength += 1
    else if (GSM_EXTENDED.includes(character)) gsmLength += 2
    else {
      isGsm = false
      break
    }
  }
  if (isGsm) return gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153)
  const unicodeLength = Array.from(value).length
  return unicodeLength <= 70 ? 1 : Math.ceil(unicodeLength / 67)
}

function validateCampaignBody(body: string) {
  const normalized = body.trim()
  if (!normalized) throw new Error('Write a text message before creating the campaign.')
  if (normalized.length > MAX_CAMPAIGN_BODY_LENGTH) {
    throw new Error(`Keep campaign texts to ${MAX_CAMPAIGN_BODY_LENGTH} characters or fewer.`)
  }
  if (!/luxor/i.test(normalized)) {
    throw new Error('Campaign texts must clearly identify Luxor Event Space.')
  }
  if (!/\bstop\b/i.test(normalized)) {
    throw new Error('Campaign texts must include “Reply STOP to opt out.”')
  }
  return normalized
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || 'there'
}

export function renderTextTemplate(template: string, recipient: LuxorTextAudienceRecipient) {
  const replacements: Record<string, string> = {
    FirstName: firstName(recipient.name),
    FullName: recipient.name,
    EventType: recipient.eventType || 'event',
    EventDate: formatDate(recipient.targetDate) || 'your requested date',
    TourDate: formatDate(recipient.tourDate) || 'your scheduled date',
    TourTime: recipient.tourTime || 'your scheduled time',
  }

  return Object.entries(replacements).reduce(
    (message, [key, replacement]) => message.replaceAll(`[${key}]`, replacement),
    template,
  )
}

export async function listEligibleTextAudience(
  filter: LuxorTextAudienceFilter = {},
): Promise<LuxorTextAudienceRecipient[]> {
  const [inquiries, consents] = await Promise.all([
    supabaseRest<InquiryAudienceRow[]>(
      'luxor_inquiries?select=id,full_name,phone,event_type,status,target_date,preferred_tour_date,preferred_tour_time&phone=not.is.null&order=created_at.desc&limit=1000',
    ),
    supabaseRest<Array<{ phone_number: string; status: string; consent_scopes?: string[] }>>(
      'luxor_sms_consents?select=phone_number,status,consent_scopes&status=eq.opted_in&limit=2000',
    ),
  ])

  const optedInPhones = new Map(
    consents
      .filter((consent) => consent.status === 'opted_in')
      .map((consent) => [normalizePhoneNumber(consent.phone_number), consent.consent_scopes || []] as const)
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry[0])),
  )
  const inquiryIds = new Set((filter.inquiryIds || []).filter(Boolean))
  const statuses = new Set((filter.statuses || []).filter(Boolean))
  const eventTypes = new Set((filter.eventTypes || []).filter(Boolean))
  const seen = new Set<string>()

  return inquiries.flatMap((inquiry) => {
    const phone = normalizePhoneNumber(inquiry.phone || '')
    if (!phone || !optedInPhones.has(phone) || seen.has(phone)) return []
    const scopes = optedInPhones.get(phone) || []
    if (
      filter.requiredScope &&
      scopes.length &&
      !scopes.includes(filter.requiredScope) &&
      !scopes.includes('customer_care')
    ) return []
    if (inquiryIds.size && !inquiryIds.has(inquiry.id)) return []
    if (statuses.size && !statuses.has(inquiry.status)) return []
    if (eventTypes.size && !eventTypes.has(inquiry.event_type || '')) return []
    seen.add(phone)
    return [{
      inquiryId: inquiry.id,
      phone,
      name: inquiry.full_name,
      eventType: inquiry.event_type,
      status: inquiry.status,
      targetDate: inquiry.target_date,
      tourDate: inquiry.preferred_tour_date,
      tourTime: inquiry.preferred_tour_time,
    }]
  }).slice(0, MAX_CAMPAIGN_RECIPIENTS)
}

export async function listTextCampaigns(limit = 100) {
  return supabaseRest<LuxorTextCampaign[]>(
    `luxor_text_campaigns?select=*&order=created_at.desc&limit=${encodeURIComponent(Math.min(Math.max(limit, 1), 1000))}`,
  )
}

export async function getTextCampaignDetail(id: string) {
  const [campaign] = await supabaseRest<LuxorTextCampaign[]>(
    `luxor_text_campaigns?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  if (!campaign) return null
  const recipients = await supabaseRest<LuxorTextCampaignRecipient[]>(
    `luxor_text_campaign_recipients?select=*&campaign_id=eq.${encodeURIComponent(id)}&order=created_at.asc&limit=1000`,
  )
  return { campaign, recipients }
}

export async function createTextCampaign(data: {
  name: string
  bodyTemplate: string
  campaignType?: LuxorTextCampaignType
  audienceFilter?: LuxorTextAudienceFilter
  audienceLabel?: string | null
  scheduledFor?: string | null
  createdBy?: string | null
  metadata?: Record<string, unknown>
}) {
  const name = data.name.trim()
  if (!name) throw new Error('Name this text campaign.')
  const bodyTemplate = validateCampaignBody(data.bodyTemplate)
  const scheduledFor = data.scheduledFor || new Date().toISOString()
  const sendTime = new Date(scheduledFor)
  if (Number.isNaN(sendTime.getTime())) throw new Error('Choose a valid send time.')

  const complianceScope = campaignScope(data.campaignType || 'customer_care')
  const audience = await listEligibleTextAudience({
    ...(data.audienceFilter || {}),
    requiredScope: complianceScope,
  })
  if (!audience.length) {
    throw new Error('No opted-in text recipients match this audience.')
  }

  const personalized = audience.map((recipient) => {
    const body = validateCampaignBody(renderTextTemplate(bodyTemplate, recipient))
    return { recipient, body, segmentCount: estimateSmsSegments(body) }
  })
  const totalSegments = personalized.reduce((sum, entry) => sum + entry.segmentCount, 0)
  const [campaign] = await supabaseRest<LuxorTextCampaign[]>('luxor_text_campaigns?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name,
      body_template: bodyTemplate,
      campaign_type: data.campaignType || 'customer_care',
      status: 'scheduled',
      audience_label: data.audienceLabel || 'Opted-in Luxor contacts',
      audience_filter: data.audienceFilter || {},
      scheduled_for: sendTime.toISOString(),
      created_by: data.createdBy || null,
      recipient_count: personalized.length,
      estimated_segments: totalSegments,
      metadata: {
        ...(data.metadata || {}),
        compliance_scope: complianceScope,
        daily_segment_limit_at_creation: getDailySegmentLimit(),
      },
    }),
  })
  if (!campaign) throw new Error('The text campaign could not be created.')

  const recipients = await supabaseRest<LuxorTextCampaignRecipient[]>(
    'luxor_text_campaign_recipients?select=*',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(personalized.map(({ recipient, body, segmentCount }) => ({
        campaign_id: campaign.id,
        inquiry_id: recipient.inquiryId,
        phone_number: recipient.phone,
        name: recipient.name,
        personalized_body: body,
        status: 'queued',
        segment_count: segmentCount,
        metadata: {
          event_type: recipient.eventType,
          inquiry_status: recipient.status,
        },
      }))),
    },
  )

  await supabaseRest<LuxorTextJob[]>('luxor_text_jobs?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(recipients.map((recipient) => ({
      campaign_id: campaign.id,
      campaign_recipient_id: recipient.id,
      inquiry_id: recipient.inquiry_id,
      job_type: 'manual_campaign',
      status: 'queued',
      recipient_phone: recipient.phone_number,
      recipient_name: recipient.name,
      body: recipient.personalized_body,
      segment_count: recipient.segment_count,
      scheduled_for: sendTime.toISOString(),
      automation_key: `campaign:${campaign.id}:${recipient.phone_number}`,
      metadata: { compliance_scope: complianceScope },
    }))),
  })

  return getTextCampaignDetail(campaign.id)
}

export async function cancelTextCampaign(id: string) {
  const now = new Date().toISOString()
  await Promise.all([
    supabaseRest(
      `luxor_text_jobs?campaign_id=eq.${encodeURIComponent(id)}&status=eq.queued`,
      { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', updated_at: now }) },
    ),
    supabaseRest(
      `luxor_text_campaign_recipients?campaign_id=eq.${encodeURIComponent(id)}&status=eq.queued`,
      { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', updated_at: now }) },
    ),
  ])
  const [campaign] = await supabaseRest<LuxorTextCampaign[]>(
    `luxor_text_campaigns?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'cancelled', updated_at: now }),
    },
  )
  return campaign ?? null
}

export async function createUniqueTextJob(data: {
  jobType: LuxorTextJobKind
  phone: string
  name?: string | null
  body: string
  scheduledFor?: string | null
  automationKey: string
  inquiryId?: string | null
  bookingId?: string | null
  invoiceId?: string | null
  metadata?: Record<string, unknown>
  requiredScope?: string
}) {
  const phone = await assertLuxorAutomatedSmsAllowed(data.phone, data.requiredScope || 'customer_care')
  const body = validateCampaignBody(data.body)
  const [existing] = await supabaseRest<LuxorTextJob[]>(
    `luxor_text_jobs?select=*&automation_key=eq.${encodeURIComponent(data.automationKey)}&limit=1`,
  )
  if (existing) return existing

  const [created] = await supabaseRest<LuxorTextJob[]>('luxor_text_jobs?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      inquiry_id: data.inquiryId || null,
      booking_id: data.bookingId || null,
      invoice_id: data.invoiceId || null,
      job_type: data.jobType,
      status: 'queued',
      recipient_phone: phone,
      recipient_name: data.name || null,
      body,
      segment_count: estimateSmsSegments(body),
      scheduled_for: data.scheduledFor || new Date().toISOString(),
      automation_key: data.automationKey,
      metadata: {
        ...(data.metadata || {}),
        compliance_scope: data.requiredScope || 'customer_care',
      },
    }),
  })
  return created ?? null
}

export async function queueInquiryTextJobs(inquiry: LuxorInquiry) {
  if (!inquiry.phone) return []
  const jobs: Array<LuxorTextJob | null> = []
  if (inquiry.preferred_tour_date) {
    jobs.push(await createUniqueTextJob({
      jobType: 'tour_confirmation',
      phone: inquiry.phone,
      name: inquiry.full_name,
      inquiryId: inquiry.id,
      automationKey: `tour_confirmation:${inquiry.id}:${inquiry.preferred_tour_date}:${inquiry.preferred_tour_time || ''}`,
      body: `Luxor Event Space: Hi ${firstName(inquiry.full_name)}, your private venue tour is confirmed for ${formatDate(inquiry.preferred_tour_date)}${inquiry.preferred_tour_time ? ` at ${inquiry.preferred_tour_time}` : ''}. Reply with any questions. Reply STOP to opt out.`,
      requiredScope: 'tour',
      metadata: { tour_date: inquiry.preferred_tour_date },
    }))

    const reminderDate = new Date(`${inquiry.preferred_tour_date}T15:00:00Z`)
    reminderDate.setUTCDate(reminderDate.getUTCDate() - 1)
    if (reminderDate.getTime() > Date.now()) {
      jobs.push(await createUniqueTextJob({
        jobType: 'tour_reminder',
        phone: inquiry.phone,
        name: inquiry.full_name,
        inquiryId: inquiry.id,
        scheduledFor: reminderDate.toISOString(),
        automationKey: `tour_reminder:${inquiry.id}:${inquiry.preferred_tour_date}:${inquiry.preferred_tour_time || ''}`,
        body: `Luxor Event Space: Reminder for your private venue tour tomorrow${inquiry.preferred_tour_time ? ` at ${inquiry.preferred_tour_time}` : ''}. We look forward to meeting you. Reply STOP to opt out.`,
        requiredScope: 'tour',
        metadata: { tour_date: inquiry.preferred_tour_date },
      }))
    }
  } else {
    jobs.push(await createUniqueTextJob({
      jobType: 'inquiry_confirmation',
      phone: inquiry.phone,
      name: inquiry.full_name,
      inquiryId: inquiry.id,
      automationKey: `inquiry_confirmation:${inquiry.id}`,
      body: `Luxor Event Space: Hi ${firstName(inquiry.full_name)}, we received your ${inquiry.event_type || 'event'} inquiry and will follow up with availability and next steps. Reply STOP to opt out.`,
    }))
  }
  return jobs.filter((job): job is LuxorTextJob => Boolean(job))
}

export async function queueBookingTextJobs(booking: LuxorBooking) {
  if (!booking.phone || !booking.event_date || booking.status === 'cancelled') return []
  const eventDate = new Date(`${booking.event_date}T15:00:00Z`)
  const sevenDaysBefore = new Date(eventDate)
  sevenDaysBefore.setUTCDate(sevenDaysBefore.getUTCDate() - 7)
  const oneDayBefore = new Date(eventDate)
  oneDayBefore.setUTCDate(oneDayBefore.getUTCDate() - 1)
  const schedules = [
    { key: '7d', date: sevenDaysBefore, label: 'one week' },
    { key: '1d', date: oneDayBefore, label: 'tomorrow' },
  ].filter((entry) => entry.date.getTime() > Date.now())

  const jobs = []
  for (const schedule of schedules) {
    jobs.push(await createUniqueTextJob({
      jobType: 'event_reminder',
      phone: booking.phone,
      name: booking.client_name,
      inquiryId: booking.inquiry_id,
      bookingId: booking.id,
      scheduledFor: schedule.date.toISOString(),
      automationKey: `event_reminder:${booking.id}:${schedule.key}:${booking.event_date}`,
      body: `Luxor Event Space: Hi ${firstName(booking.client_name)}, your ${booking.event_type || 'event'} is ${schedule.label} away on ${formatDate(booking.event_date)}. Reply with any final questions or updates. Reply STOP to opt out.`,
      requiredScope: 'event',
      metadata: { event_date: booking.event_date },
    }))
  }
  return jobs.filter((job): job is LuxorTextJob => Boolean(job))
}

export async function queuePaymentConfirmationText(
  payment: LuxorPayment,
  contact: { phone?: string | null; name: string; inquiryId?: string | null },
) {
  if (!contact.phone || payment.status !== 'paid') return null
  const amount = Number(payment.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return createUniqueTextJob({
    jobType: 'payment_confirmation',
    phone: contact.phone,
    name: contact.name,
    inquiryId: contact.inquiryId || payment.inquiry_id,
    bookingId: payment.booking_id,
    invoiceId: payment.invoice_id,
    automationKey: `payment_confirmation:${payment.id}`,
    body: `Luxor Event Space: Hi ${firstName(contact.name)}, we received your payment of ${amount}. Thank you. Reply with any questions. Reply STOP to opt out.`,
    requiredScope: 'payment',
  })
}

export async function queueInvoiceReminderTexts(
  invoice: LuxorInvoice,
  contact: { phone?: string | null; name: string },
) {
  if (!contact.phone || !invoice.due_date || invoice.status === 'paid' || invoice.status === 'cancelled') return []
  const dueDate = new Date(`${invoice.due_date}T15:00:00Z`)
  const beforeDue = new Date(dueDate)
  beforeDue.setUTCDate(beforeDue.getUTCDate() - 3)
  const overdue = new Date(dueDate)
  overdue.setUTCDate(overdue.getUTCDate() + 1)
  const amount = Number(invoice.total || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const jobs = []

  if (beforeDue.getTime() > Date.now()) {
    jobs.push(await createUniqueTextJob({
      jobType: 'invoice_due_reminder',
      phone: contact.phone,
      name: contact.name,
      inquiryId: invoice.inquiry_id,
      invoiceId: invoice.id,
      scheduledFor: beforeDue.toISOString(),
      automationKey: `invoice_due:${invoice.id}:${invoice.due_date}`,
      body: `Luxor Event Space: Hi ${firstName(contact.name)}, a friendly reminder that your ${amount} invoice is due ${formatDate(invoice.due_date)}. Please use your secure invoice link or contact us with questions. Reply STOP to opt out.`,
      requiredScope: 'invoice',
      metadata: { due_date: invoice.due_date },
    }))
  }
  jobs.push(await createUniqueTextJob({
    jobType: 'invoice_overdue_reminder',
    phone: contact.phone,
    name: contact.name,
    inquiryId: invoice.inquiry_id,
    invoiceId: invoice.id,
    scheduledFor: overdue.toISOString(),
    automationKey: `invoice_overdue:${invoice.id}:${invoice.due_date}`,
    body: `Luxor Event Space: Hi ${firstName(contact.name)}, our records show your ${amount} invoice due ${formatDate(invoice.due_date)} is still unpaid. Please use your secure invoice link or contact us for help. Reply STOP to opt out.`,
    requiredScope: 'invoice',
    metadata: { due_date: invoice.due_date },
  }))
  return jobs.filter((job): job is LuxorTextJob => Boolean(job))
}

export async function processDueTextJobs(limit = getWorkerBatchSize()) {
  const jobs = await claimDueTextJobs(limit)
  const usedSegments = await getRollingSentSegments()
  const dailyLimit = getDailySegmentLimit()
  let remainingSegments = Math.max(0, dailyLimit - usedSegments)
  const results: Array<{ id: string; status: LuxorTextJobStatus; error?: string }> = []

  for (const job of jobs) {
    if (job.segment_count > remainingSegments) {
      await updateTextJob(job.id, {
        status: 'queued',
        scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_error: `Deferred by the ${dailyLimit.toLocaleString()}-segment rolling safety cap.`,
      })
      results.push({ id: job.id, status: 'queued', error: 'daily_segment_cap' })
      continue
    }

    const result = await processTextJob(job)
    results.push(result)
    if (result.status === 'sent') remainingSegments -= job.segment_count
  }
  return { results, usedSegments, dailyLimit, remainingSegments }
}

async function claimDueTextJobs(limit: number) {
  return supabaseRest<LuxorTextJob[]>('rpc/luxor_claim_due_text_jobs', {
    method: 'POST',
    body: JSON.stringify({ job_limit: Math.min(Math.max(limit, 1), 50) }),
  })
}

async function processTextJob(job: LuxorTextJob) {
  try {
    const skipReason = await getTextJobSkipReason(job)
    if (skipReason) {
      await finishTextJob(job, 'skipped', skipReason)
      return { id: job.id, status: 'skipped' as const, error: skipReason }
    }

    const requiredScope =
      typeof job.metadata?.compliance_scope === 'string' ? job.metadata.compliance_scope : scopeForJob(job.job_type)
    const destination = await assertLuxorAutomatedSmsAllowed(job.recipient_phone, requiredScope)
    const config = getLuxorTwilioMessagingConfig()
    const from = await getActiveLuxorPhoneNumber()
    const client = twilio(config.accountSid, config.authToken)
    const sent = await client.messages.create({
      to: destination,
      ...(config.messagingServiceSid
        ? { messagingServiceSid: config.messagingServiceSid, fallbackFrom: from }
        : { from }),
      body: job.body,
      validityPeriod: 21600,
      statusCallback: buildTwilioCallbackUrl('/api/twilio/messaging/status'),
    })
    const now = new Date().toISOString()
    await Promise.all([
      createOrUpdateLuxorMessage({
        sid: sent.sid,
        direction: 'outbound',
        status: normalizeTwilioMessageStatus(sent.status),
        from,
        to: destination,
        body: job.body,
        inquiryId: job.inquiry_id,
        contactName: job.recipient_name,
        ownerEmail: job.campaign_id ? 'luxor-text-campaign' : 'luxor-text-automation',
        isRead: true,
      }),
      updateTextJob(job.id, {
        status: 'sent',
        sent_at: now,
        twilio_message_sid: sent.sid,
        last_error: null,
      }),
      job.campaign_recipient_id
        ? updateCampaignRecipient(job.campaign_recipient_id, {
            status: 'sent',
            sent_at: now,
            twilio_message_sid: sent.sid,
            error_code: null,
            error_message: null,
          })
        : Promise.resolve(null),
    ])
    if (job.campaign_id) await refreshTextCampaignStats(job.campaign_id)
    return { id: job.id, status: 'sent' as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Text delivery failed.'
    const consentFailure = /opt-in|opted out|not opted/i.test(message)
    const terminal = consentFailure || Number(job.attempts || 0) >= 3
    const status: LuxorTextJobStatus = consentFailure ? 'skipped' : terminal ? 'failed' : 'queued'
    await updateTextJob(job.id, {
      status,
      scheduled_for: status === 'queued' ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : job.scheduled_for,
      last_error: message,
    })
    if (job.campaign_recipient_id) {
      await updateCampaignRecipient(job.campaign_recipient_id, {
        status: status === 'queued' ? 'queued' : status,
        error_message: message,
      })
    }
    if (job.campaign_id) await refreshTextCampaignStats(job.campaign_id)
    return { id: job.id, status, error: message }
  }
}

async function getTextJobSkipReason(job: LuxorTextJob) {
  if (job.invoice_id && (job.job_type === 'invoice_due_reminder' || job.job_type === 'invoice_overdue_reminder')) {
    const [invoice] = await supabaseRest<Array<{ status: string; due_date: string | null }>>(
      `luxor_invoices?select=status,due_date&id=eq.${encodeURIComponent(job.invoice_id)}&limit=1`,
    )
    if (!invoice || ['paid', 'void', 'cancelled'].includes(invoice.status)) return 'Invoice is already paid, cancelled, or unavailable.'
    if (job.metadata?.due_date && invoice.due_date !== job.metadata.due_date) return 'Invoice due date changed; the old reminder was skipped.'
  }
  if (job.booking_id && job.job_type === 'event_reminder') {
    const [booking] = await supabaseRest<Array<{ status: string; event_date: string | null }>>(
      `luxor_bookings?select=status,event_date&id=eq.${encodeURIComponent(job.booking_id)}&limit=1`,
    )
    if (!booking || booking.status === 'cancelled' || booking.status === 'completed') return 'Event is cancelled, completed, or unavailable.'
    if (job.metadata?.event_date && booking.event_date !== job.metadata.event_date) return 'Event date changed; the old reminder was skipped.'
  }
  if (job.inquiry_id && job.job_type === 'tour_reminder') {
    const [inquiry] = await supabaseRest<Array<{ status: string; tour_attendance_status?: string | null; preferred_tour_date: string | null }>>(
      `luxor_inquiries?select=status,tour_attendance_status,preferred_tour_date&id=eq.${encodeURIComponent(job.inquiry_id)}&limit=1`,
    )
    if (!inquiry || inquiry.status === 'closed_lost' || ['cancelled', 'attended', 'no_show'].includes(inquiry.tour_attendance_status || '')) {
      return 'Tour is cancelled, completed, or unavailable.'
    }
    if (job.metadata?.tour_date && inquiry.preferred_tour_date !== job.metadata.tour_date) return 'Tour date changed; the old reminder was skipped.'
  }
  return null
}

async function finishTextJob(job: LuxorTextJob, status: LuxorTextJobStatus, reason: string) {
  await updateTextJob(job.id, { status, last_error: reason })
  if (job.campaign_recipient_id) {
    await updateCampaignRecipient(job.campaign_recipient_id, { status, error_message: reason })
  }
  if (job.campaign_id) await refreshTextCampaignStats(job.campaign_id)
}

async function updateTextJob(id: string, updates: Partial<LuxorTextJob>) {
  const [updated] = await supabaseRest<LuxorTextJob[]>(
    `luxor_text_jobs?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    },
  )
  return updated ?? null
}

async function updateCampaignRecipient(id: string, updates: Partial<LuxorTextCampaignRecipient>) {
  const [updated] = await supabaseRest<LuxorTextCampaignRecipient[]>(
    `luxor_text_campaign_recipients?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    },
  )
  return updated ?? null
}

export async function updateTextDeliveryStatus(
  sid: string,
  twilioStatus: string,
  errorCode?: string | null,
  errorMessage?: string | null,
) {
  const [job] = await supabaseRest<LuxorTextJob[]>(
    `luxor_text_jobs?select=*&twilio_message_sid=eq.${encodeURIComponent(sid)}&limit=1`,
  )
  if (!job) return null
  const status = mapDeliveryStatus(twilioStatus)
  await updateTextJob(job.id, { status, last_error: errorMessage || null })
  if (job.campaign_recipient_id) {
    await updateCampaignRecipient(job.campaign_recipient_id, {
      status,
      delivered_at: status === 'delivered' ? new Date().toISOString() : null,
      error_code: errorCode || null,
      error_message: errorMessage || null,
    })
  }
  if (job.campaign_id) await refreshTextCampaignStats(job.campaign_id)
  return job
}

export async function recordTextCampaignReply(phone: string, optedOut = false) {
  const normalized = normalizePhoneNumber(phone)
  if (!normalized) return
  const recipients = await supabaseRest<LuxorTextCampaignRecipient[]>(
    `luxor_text_campaign_recipients?select=*&phone_number=eq.${encodeURIComponent(normalized)}&status=in.(sent,delivered)&order=sent_at.desc&limit=1`,
  )
  const campaignIds = new Set<string>()
  const now = new Date().toISOString()
  for (const recipient of recipients) {
    campaignIds.add(recipient.campaign_id)
    await updateCampaignRecipient(recipient.id, {
      replied_at: recipient.replied_at || now,
      opted_out_at: optedOut ? now : recipient.opted_out_at,
    })
  }
  await Promise.all([...campaignIds].map((campaignId) => refreshTextCampaignStats(campaignId)))
}

async function refreshTextCampaignStats(campaignId: string) {
  const [campaign, recipients] = await Promise.all([
    supabaseRest<LuxorTextCampaign[]>(
      `luxor_text_campaigns?select=*&id=eq.${encodeURIComponent(campaignId)}&limit=1`,
    ).then((rows) => rows[0] || null),
    supabaseRest<LuxorTextCampaignRecipient[]>(
      `luxor_text_campaign_recipients?select=status,replied_at,opted_out_at&campaign_id=eq.${encodeURIComponent(campaignId)}&limit=1000`,
    ),
  ])
  if (!campaign) return null
  const queued = recipients.filter((recipient) => ['queued', 'sending'].includes(recipient.status)).length
  const sent = recipients.filter((recipient) => ['sent', 'delivered', 'undelivered'].includes(recipient.status)).length
  const delivered = recipients.filter((recipient) => recipient.status === 'delivered').length
  const failed = recipients.filter((recipient) => ['failed', 'undelivered'].includes(recipient.status)).length
  const status: LuxorTextCampaign['status'] = campaign.status === 'cancelled'
    ? 'cancelled'
    : queued > 0
      ? sent > 0 || failed > 0 ? 'sending' : 'scheduled'
      : sent > 0
        ? 'sent'
        : failed > 0 ? 'failed' : campaign.status
  const now = new Date().toISOString()
  const [updated] = await supabaseRest<LuxorTextCampaign[]>(
    `luxor_text_campaigns?select=*&id=eq.${encodeURIComponent(campaignId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status,
        sent_count: sent,
        delivered_count: delivered,
        failed_count: failed,
        reply_count: recipients.filter((recipient) => Boolean(recipient.replied_at)).length,
        opt_out_count: recipients.filter((recipient) => Boolean(recipient.opted_out_at)).length,
        sent_at: queued === 0 && sent > 0 ? campaign.sent_at || now : campaign.sent_at,
        updated_at: now,
      }),
    },
  )
  return updated ?? null
}

function scopeForJob(kind: LuxorTextJobKind) {
  if (kind.startsWith('tour_')) return 'tour'
  if (kind === 'event_reminder') return 'event'
  if (kind === 'payment_confirmation') return 'payment'
  if (kind.startsWith('invoice_')) return 'invoice'
  return 'customer_care'
}

function campaignScope(type: LuxorTextCampaignType) {
  return type === 'elena' || type === 'transactional' ? 'customer_care' : type
}

function mapDeliveryStatus(status: string): LuxorTextJobStatus {
  if (status === 'delivered' || status === 'read') return 'delivered'
  if (status === 'undelivered') return 'undelivered'
  if (status === 'failed') return 'failed'
  return 'sent'
}

function normalizeTwilioMessageStatus(value: string | undefined) {
  return ['accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'received'].includes(value || '')
    ? value as import('./luxorMessageTypes').LuxorMessageStatus
    : 'queued'
}

function getDailySegmentLimit() {
  const configured = Number(process.env.LUXOR_SMS_DAILY_SEGMENT_LIMIT || DEFAULT_DAILY_SEGMENT_LIMIT)
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 100000) : DEFAULT_DAILY_SEGMENT_LIMIT
}

function getWorkerBatchSize() {
  const configured = Number(process.env.LUXOR_SMS_WORKER_BATCH_SIZE || DEFAULT_WORKER_BATCH_SIZE)
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 50) : DEFAULT_WORKER_BATCH_SIZE
}

async function getRollingSentSegments() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const jobs = await supabaseRest<Array<{ segment_count: number }>>(
    `luxor_text_jobs?select=segment_count&status=in.(sent,delivered)&sent_at=gte.${encodeURIComponent(since)}&limit=5000`,
  )
  return jobs.reduce((sum, job) => sum + Number(job.segment_count || 1), 0)
}

export function isWithinSmsSendWindow(date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SMS_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).find((part) => part.type === 'hour')?.value,
  )
  return Number.isFinite(hour) && hour >= 8 && hour < 20
}

export async function getTextCampaignDashboard() {
  const [campaigns, audience, consents] = await Promise.all([
    listTextCampaigns(100),
    listEligibleTextAudience(),
    supabaseRest<Array<{ status: string }>>('luxor_sms_consents?select=status&limit=5000'),
  ])
  return {
    campaigns,
    audience,
    stats: {
      campaigns: campaigns.length,
      textsSent: campaigns.reduce((sum, campaign) => sum + Number(campaign.sent_count || 0), 0),
      delivered: campaigns.reduce((sum, campaign) => sum + Number(campaign.delivered_count || 0), 0),
      replies: campaigns.reduce((sum, campaign) => sum + Number(campaign.reply_count || 0), 0),
      optOuts: consents.filter((consent) => consent.status === 'opted_out').length,
      eligibleRecipients: audience.length,
      dailySegmentLimit: getDailySegmentLimit(),
    },
  }
}

export async function hasRecordedTextConsent(phone: string) {
  const consent = await getLuxorSmsConsent(phone)
  return consent?.status === 'opted_in'
}
