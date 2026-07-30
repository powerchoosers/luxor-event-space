import 'server-only'

import { decodeHtmlEntities } from './luxorTextUtils'

import crypto from 'crypto'
import {
  LuxorMarketingCampaign,
  LuxorMarketingEvent,
  LuxorMarketingRecipient,
  LuxorMarketingSuppression,
  LuxorMarketingTemplate,
} from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import {
  createLuxorEmailJob,
  listQueuedLuxorEmailJobsByIds,
  processLuxorEmailJobs,
  updateLuxorEmailJob,
} from './luxorEmailJobsServer'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` ||
  'http://localhost:3000'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const BULK_LIST_EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
const INTERNAL_EMAIL_ADDRESSES = [
  'booking@luxoratlaspalmas.com',
  'hello@luxoratlaspalmas.com',
]

export type MarketingRecipientInput = {
  email: string
  name?: string | null
  eventType?: string | null
}

type MarketingMergeContext = {
  clientName: string
  eventType: string
}

type MarketingInquiryContext = {
  email: string | null
  full_name: string | null
  event_type: string | null
}

const MERGE_TAG_RE = /\{\{\s*([a-z][a-z0-9_.-]*)\s*\}\}|\[\[\s*([a-z][a-z0-9_.-]*)\s*\]\]|%%\s*([a-z][a-z0-9_.-]*)\s*%%/gi
const BARE_MERGE_TAG_RE = /\b(client_name|clientName|first_name|firstName|recipient_name|recipientName|event_type|eventType)\b/g
const UNRESOLVED_MERGE_TAG_RE = /\{\{\s*[a-z][a-z0-9_.-]*\s*\}\}|\[\[\s*[a-z][a-z0-9_.-]*\s*\]\]|%%\s*[a-z][a-z0-9_.-]*\s*%%|\b(?:client_name|event_type|first_name|recipient_name)\b/i

function escapeMarketingMergeValue(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeMergeKey(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[.-]/g, '_').toLowerCase()
}

function mergeValue(key: string, context: MarketingMergeContext) {
  switch (normalizeMergeKey(key)) {
    case 'client_name':
    case 'first_name':
    case 'recipient_name':
      return context.clientName
    case 'event_type':
      return context.eventType
    default:
      return null
  }
}

export function renderMarketingMergeFields(
  value: string,
  recipient: Pick<MarketingRecipientInput, 'name' | 'eventType'>,
  options: { html?: boolean } = {},
) {
  const context: MarketingMergeContext = {
    clientName: recipient.name?.trim() || 'there',
    eventType: recipient.eventType?.trim() || 'celebration',
  }
  const encode = options.html ? escapeMarketingMergeValue : (replacement: string) => replacement

  return value
    .replace(MERGE_TAG_RE, (match, curlyKey: string | undefined, bracketKey: string | undefined, percentKey: string | undefined) => {
      const replacement = mergeValue(curlyKey || bracketKey || percentKey || '', context)
      return replacement === null ? match : encode(replacement)
    })
    .replace(BARE_MERGE_TAG_RE, (key) => encode(mergeValue(key, context) || key))
}

function assertNoUnresolvedMarketingMergeFields(subject: string, htmlBody: string) {
  if (!UNRESOLVED_MERGE_TAG_RE.test(`${subject}\n${htmlBody}`)) return
  throw new Error('This campaign contains an unsupported personalization field. Replace it or use client_name and event_type before sending.')
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

async function enrichMarketingRecipients(recipients: MarketingRecipientInput[]) {
  const unique = Array.from(new Map(
    recipients.map((recipient) => [recipient.email.trim().toLowerCase(), {
      email: recipient.email.trim().toLowerCase(),
      name: recipient.name?.trim() || null,
      eventType: recipient.eventType?.trim() || null,
    }]),
  ).values()).filter((recipient) => EMAIL_RE.test(recipient.email))
  const listContext = new Map<string, { name: string | null; eventType: string | null }>()
  const inquiryContext = new Map<string, { name: string | null; eventType: string | null }>()

  for (const batch of chunks(unique.map((recipient) => recipient.email), 100)) {
    const emailFilter = batch.map((email) => encodeURIComponent(email)).join(',')
    const [members, inquiries] = await Promise.all([
      supabaseRest<MarketingListMember[]>(
        `luxor_marketing_list?select=email,full_name,metadata,created_at&id=not.is.null&email=in.(${emailFilter})&order=created_at.desc`,
      ),
      supabaseRest<MarketingInquiryContext[]>(
        `luxor_inquiries?select=email,full_name,event_type&email=in.(${emailFilter})&order=created_at.desc`,
      ),
    ])

    members.forEach((member) => {
      const email = member.email.trim().toLowerCase()
      if (listContext.has(email)) return
      listContext.set(email, {
        name: member.full_name?.trim() || null,
        eventType: typeof member.metadata?.event_type === 'string' ? member.metadata.event_type.trim() || null : null,
      })
    })
    inquiries.forEach((inquiry) => {
      const email = inquiry.email?.trim().toLowerCase()
      if (!email || inquiryContext.has(email)) return
      inquiryContext.set(email, {
        name: inquiry.full_name?.trim() || null,
        eventType: inquiry.event_type?.trim() || null,
      })
    })
  }

  return unique.map((recipient) => ({
    ...recipient,
    name: recipient.name || listContext.get(recipient.email)?.name || inquiryContext.get(recipient.email)?.name || null,
    eventType: recipient.eventType || listContext.get(recipient.email)?.eventType || inquiryContext.get(recipient.email)?.eventType || null,
  }))
}

export type MarketingCampaignSummary = LuxorMarketingCampaign & {
  sent_count: number
  queued_count: number
  failed_count: number
  open_count: number
  click_count: number
  unique_opens: number
  unique_clicks: number
  unsubscribe_count: number
  open_rate: number
  click_rate: number
}

export type MarketingTemplateInput = {
  name: string
  subject?: string
  description?: string | null
  category?: string | null
  blocks: Record<string, unknown>[]
  previewColor?: string | null
  createdBy?: string | null
  metadata?: Record<string, unknown>
}

export type MarketingActivityEvent = LuxorMarketingEvent & {
  recipient_email: string | null
  recipient_name: string | null
  campaign_name: string | null
  campaign_subject: string | null
}

export type LeadMarketingCampaignSummary = {
  recipient_id: string
  campaign_id: string
  campaign_name: string | null
  campaign_subject: string | null
  audience_label: string | null
  campaign_status: LuxorMarketingCampaign['status']
  scheduled_for: string | null
  sent_at: string | null
  recipient_status: LuxorMarketingRecipient['status']
  open_count: number
  click_count: number
  first_opened_at: string | null
  last_opened_at: string | null
  last_clicked_at: string | null
}

export type LeadMarketingEngagement = {
  email: string
  recipient_count: number
  total_campaigns: number
  total_opens: number
  total_clicks: number
  latest_opened_at: string | null
  latest_clicked_at: string | null
  subscribed: boolean
  campaigns: LeadMarketingCampaignSummary[]
  recent_events: MarketingActivityEvent[]
}

function absoluteUrl(path: string) {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`
}

function createTrackingToken() {
  return crypto.randomBytes(18).toString('base64url')
}

export function parseMarketingRecipients(raw: string) {
  const seen = new Set<string>()
  const recipients: MarketingRecipientInput[] = []

  raw
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const emailMatch = item.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/)
      const email = emailMatch?.[0]?.toLowerCase() ?? ''
      if (!EMAIL_RE.test(email) || seen.has(email)) return

      const name = item
        .replace(emailMatch?.[0] ?? '', '')
        .replace(/[<>()"]/g, '')
        .trim()

      seen.add(email)
      recipients.push({ email, name: name || null })
    })

  return recipients
}

function normalizeRedirectUrl(url: string) {
  const value = url.trim()
  if (!value || value.startsWith('#')) return null
  if (/^(mailto:|tel:|https?:\/\/)/i.test(value)) return value
  if (/^\/\//.test(value)) return `https:${value}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null
  if (value.startsWith('/')) return absoluteUrl(value)
  if (/[.][a-z]{2,}([/?#]|$)/i.test(value)) return `https://${value}`
  return null
}

export function instrumentMarketingHtml(html: string, trackingToken: string) {
  const tracked = html.replace(/href=(["'])(.*?)\1/gi, (match, quote: string, rawUrl: string) => {
    if (rawUrl.trim() === '#unsubscribe') {
      return `href=${quote}${absoluteUrl(`/api/marketing/unsubscribe/${trackingToken}`)}${quote}`
    }

    const normalized = normalizeRedirectUrl(rawUrl)
    if (!normalized) return match

    const clickUrl = absoluteUrl(`/api/marketing/click/${trackingToken}?u=${encodeURIComponent(normalized)}`)
    return `href=${quote}${clickUrl}${quote}`
  })

  const pixel = `<img src="${absoluteUrl(`/api/marketing/track/${trackingToken}.png`)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;max-width:1px;max-height:1px;opacity:0;overflow:hidden;border:0;" />`

  if (/<\/body>/i.test(tracked)) {
    return tracked.replace(/<\/body>/i, `${pixel}</body>`)
  }

  return `${tracked}${pixel}`
}

function summarizeCampaign(
  campaign: LuxorMarketingCampaign,
  recipients: LuxorMarketingRecipient[],
  events: LuxorMarketingEvent[] = [],
): MarketingCampaignSummary {
  const sentCount = recipients.filter((recipient) => recipient.status === 'sent').length
  const queuedCount = recipients.filter((recipient) => recipient.status === 'queued').length
  const failedCount = recipients.filter((recipient) => recipient.status === 'failed').length
  const openCount = recipients.reduce((sum, recipient) => sum + Number(recipient.open_count || 0), 0)
  const clickCount = recipients.reduce((sum, recipient) => sum + Number(recipient.click_count || 0), 0)
  const uniqueOpens = recipients.filter((recipient) => Number(recipient.open_count || 0) > 0).length
  const uniqueClicks = recipients.filter((recipient) => Number(recipient.click_count || 0) > 0).length
  const unsubscribeCount = new Set(
    events
      .filter((event) => event.event_type === 'unsubscribe')
      .map((event) => event.recipient_id),
  ).size
  const denominator = Math.max(sentCount, campaign.recipient_count || recipients.length || 0)

  return {
    ...campaign,
    sent_count: sentCount,
    queued_count: queuedCount,
    failed_count: failedCount,
    open_count: openCount,
    click_count: clickCount,
    unique_opens: uniqueOpens,
    unique_clicks: uniqueClicks,
    unsubscribe_count: unsubscribeCount,
    open_rate: denominator ? Math.round((uniqueOpens / denominator) * 1000) / 10 : 0,
    click_rate: denominator ? Math.round((uniqueClicks / denominator) * 1000) / 10 : 0,
  }
}

export async function listMarketingCampaigns(limit = 1000) {
  const campaigns = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
  )

  if (!campaigns.length) return []

  const campaignIds = campaigns.map((campaign) => campaign.id).join(',')
  const [recipients, events] = await Promise.all([
    supabaseRest<LuxorMarketingRecipient[]>(
      `luxor_marketing_recipients?select=*&campaign_id=in.(${campaignIds})`,
    ),
    supabaseRest<LuxorMarketingEvent[]>(
      `luxor_marketing_events?select=*&campaign_id=in.(${campaignIds})&event_type=eq.unsubscribe`,
    ),
  ])

  return campaigns.map((campaign) => summarizeCampaign(
    campaign,
    recipients.filter((recipient) => recipient.campaign_id === campaign.id),
    events.filter((event) => event.campaign_id === campaign.id),
  ))
}

export async function listMarketingTemplates(limit = 1000) {
  return supabaseRest<LuxorMarketingTemplate[]>(
    `luxor_marketing_templates?select=*&order=updated_at.desc&limit=${encodeURIComponent(limit)}`,
  )
}

export async function createMarketingTemplate(data: MarketingTemplateInput) {
  if (!data.name.trim()) throw new Error('Please name this template.')
  if (!Array.isArray(data.blocks) || !data.blocks.length) throw new Error('Add at least one block before saving a template.')

  const [template] = await supabaseRest<LuxorMarketingTemplate[]>('luxor_marketing_templates?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: data.name.trim(),
      subject: data.subject?.trim() || '',
      description: data.description?.trim() || null,
      category: data.category?.trim() || 'custom',
      blocks: data.blocks,
      preview_color: data.previewColor || '#caa24c',
      created_by: data.createdBy || null,
      metadata: data.metadata || {},
    }),
  })

  return template
}

export async function deleteMarketingTemplate(id: string) {
  await supabaseRest(`luxor_marketing_templates?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function markMarketingTemplateUsed(id: string) {
  await supabaseRest(`luxor_marketing_templates?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  })
}

export async function getMarketingCampaignDetail(id: string) {
  const [campaign] = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )

  if (!campaign) return null

  const [recipients, events] = await Promise.all([
    supabaseRest<LuxorMarketingRecipient[]>(
      `luxor_marketing_recipients?select=*&campaign_id=eq.${encodeURIComponent(id)}&order=created_at.asc`,
    ),
    supabaseRest<LuxorMarketingEvent[]>(
      `luxor_marketing_events?select=*&campaign_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=100`,
    ),
  ])

  return {
    campaign: summarizeCampaign(campaign, recipients, events),
    recipients,
    events,
  }
}

export async function listMarketingActivityEvents(options: { since?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const sinceFilter = options.since ? `&created_at=gt.${encodeURIComponent(options.since)}` : ''
  const events = await supabaseRest<LuxorMarketingEvent[]>(
    `luxor_marketing_events?select=*&event_type=in.(open,click,unsubscribe)&order=created_at.desc&limit=${encodeURIComponent(limit)}${sinceFilter}`,
  )

  if (!events.length) return []

  const recipientIds = Array.from(new Set(events.map((event) => event.recipient_id).filter(Boolean)))
  const campaignIds = Array.from(new Set(events.map((event) => event.campaign_id).filter(Boolean)))

  const [recipients, campaigns] = await Promise.all([
    recipientIds.length
      ? supabaseRest<LuxorMarketingRecipient[]>(`luxor_marketing_recipients?select=id,email,name&id=in.(${recipientIds.join(',')})`)
      : Promise.resolve([]),
    campaignIds.length
      ? supabaseRest<LuxorMarketingCampaign[]>(`luxor_marketing_campaigns?select=id,name,subject&id=in.(${campaignIds.join(',')})`)
      : Promise.resolve([]),
  ])

  const recipientsById = new Map(recipients.map((recipient) => [recipient.id, recipient]))
  const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))

  return events.map((event): MarketingActivityEvent => {
    const recipient = recipientsById.get(event.recipient_id)
    const campaign = campaignsById.get(event.campaign_id)

    return {
      ...event,
      recipient_email: recipient?.email ?? null,
      recipient_name: recipient?.name ?? null,
      campaign_name: campaign?.name ? decodeHtmlEntities(campaign.name) : null,
      campaign_subject: campaign?.subject ? decodeHtmlEntities(campaign.subject) : null,
    }
  })
}

export async function getLeadMarketingEngagement(email: string, options: { eventLimit?: number } = {}) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Email is required.')
  }

  const recipients = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&email=eq.${encodeURIComponent(normalizedEmail)}&order=created_at.desc`,
  )

  if (!recipients.length) {
    return {
      email: normalizedEmail,
      recipient_count: 0,
      total_campaigns: 0,
      total_opens: 0,
      total_clicks: 0,
      latest_opened_at: null,
      latest_clicked_at: null,
      subscribed: await isMarketingMember(normalizedEmail),
      campaigns: [],
      recent_events: [],
    } satisfies LeadMarketingEngagement
  }

  const campaignIds = Array.from(new Set(recipients.map((recipient) => recipient.campaign_id).filter(Boolean)))
  const recipientIds = Array.from(new Set(recipients.map((recipient) => recipient.id).filter(Boolean)))
  const eventLimit = Math.min(Math.max(options.eventLimit ?? 12, 1), 50)

  const [campaigns, recentEvents, subscribed] = await Promise.all([
    campaignIds.length
      ? supabaseRest<LuxorMarketingCampaign[]>(
          `luxor_marketing_campaigns?select=id,name,subject,audience_label,status,scheduled_for,sent_at&` +
          `id=in.(${campaignIds.join(',')})`,
        )
      : Promise.resolve([]),
    recipientIds.length
      ? supabaseRest<LuxorMarketingEvent[]>(
          `luxor_marketing_events?select=*&recipient_id=in.(${recipientIds.join(',')})&` +
          `event_type=in.(open,click,unsubscribe)&order=created_at.desc&limit=${encodeURIComponent(eventLimit)}`,
        )
      : Promise.resolve([]),
    isMarketingMember(normalizedEmail),
  ])

  const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const recipientsById = new Map(recipients.map((recipient) => [recipient.id, recipient]))

  const recentActivity = recentEvents.map((event): MarketingActivityEvent => {
    const recipient = recipientsById.get(event.recipient_id)
    const campaign = campaignsById.get(event.campaign_id)

    return {
      ...event,
      recipient_email: recipient?.email ?? normalizedEmail,
      recipient_name: recipient?.name ?? null,
      campaign_name: campaign?.name ? decodeHtmlEntities(campaign.name) : null,
      campaign_subject: campaign?.subject ? decodeHtmlEntities(campaign.subject) : null,
    }
  })

  const campaignSummaries = recipients
    .map((recipient): LeadMarketingCampaignSummary => {
      const campaign = campaignsById.get(recipient.campaign_id)

      return {
        recipient_id: recipient.id,
        campaign_id: recipient.campaign_id,
        campaign_name: campaign?.name ? decodeHtmlEntities(campaign.name) : null,
        campaign_subject: campaign?.subject ? decodeHtmlEntities(campaign.subject) : null,
        audience_label: campaign?.audience_label ?? null,
        campaign_status: campaign?.status ?? 'draft',
        scheduled_for: campaign?.scheduled_for ?? null,
        sent_at: campaign?.sent_at ?? null,
        recipient_status: recipient.status,
        open_count: Number(recipient.open_count || 0),
        click_count: Number(recipient.click_count || 0),
        first_opened_at: recipient.first_opened_at,
        last_opened_at: recipient.last_opened_at,
        last_clicked_at: recipient.last_clicked_at,
      }
    })
    .sort((a, b) => {
      const aTime = new Date(a.last_clicked_at || a.last_opened_at || a.sent_at || a.scheduled_for || 0).getTime()
      const bTime = new Date(b.last_clicked_at || b.last_opened_at || b.sent_at || b.scheduled_for || 0).getTime()
      return bTime - aTime
    })

  return {
    email: normalizedEmail,
    recipient_count: recipients.length,
    total_campaigns: campaignSummaries.length,
    total_opens: recipients.reduce((sum, recipient) => sum + Number(recipient.open_count || 0), 0),
    total_clicks: recipients.reduce((sum, recipient) => sum + Number(recipient.click_count || 0), 0),
    latest_opened_at: recipients.reduce<string | null>((latest, recipient) => {
      if (!recipient.last_opened_at) return latest
      if (!latest) return recipient.last_opened_at
      return new Date(recipient.last_opened_at).getTime() > new Date(latest).getTime() ? recipient.last_opened_at : latest
    }, null),
    latest_clicked_at: recipients.reduce<string | null>((latest, recipient) => {
      if (!recipient.last_clicked_at) return latest
      if (!latest) return recipient.last_clicked_at
      return new Date(recipient.last_clicked_at).getTime() > new Date(latest).getTime() ? recipient.last_clicked_at : latest
    }, null),
    subscribed,
    campaigns: campaignSummaries,
    recent_events: recentActivity,
  } satisfies LeadMarketingEngagement
}

export async function createMarketingCampaign(data: {
  name: string
  subject: string
  htmlBody: string
  recipients: MarketingRecipientInput[]
  scheduledFor?: string | null
  audienceLabel?: string | null
  createdBy?: string | null
  ignoreSuppressions?: boolean
  senderFrom?: string | null
  senderName?: string | null
  metadata?: Record<string, unknown>
}) {
  if (!data.name.trim()) throw new Error('Please name this campaign.')
  if (!data.subject.trim()) throw new Error('Please add a subject line.')
  if (!data.htmlBody.trim()) throw new Error('Please add email content.')
  if (!data.recipients.length) throw new Error('Please add at least one valid recipient.')

  const enrichedRecipients = await enrichMarketingRecipients(data.recipients)
  const sendableRecipients: MarketingRecipientInput[] = []
  for (const recipient of enrichedRecipients) {
    if (data.ignoreSuppressions || !await isMarketingSuppressed(recipient.email)) {
      sendableRecipients.push(recipient)
    }
  }

  if (!sendableRecipients.length) {
    throw new Error('Every recipient on this list has unsubscribed or is suppressed.')
  }

  const scheduledFor = data.scheduledFor || new Date().toISOString()
  const sendTime = new Date(scheduledFor)
  if (Number.isNaN(sendTime.getTime())) throw new Error('Please choose a valid send time.')

  const preparedRecipients = sendableRecipients.map((recipient) => {
    const subject = renderMarketingMergeFields(data.subject.trim(), recipient)
    const htmlBody = renderMarketingMergeFields(data.htmlBody, recipient, { html: true })
    assertNoUnresolvedMarketingMergeFields(subject, htmlBody)
    return { recipient, subject, htmlBody }
  })
  const campaignSubject = renderMarketingMergeFields(data.subject.trim(), {})
  const campaignHtmlBody = renderMarketingMergeFields(data.htmlBody, {}, { html: true })

  const [campaign] = await supabaseRest<LuxorMarketingCampaign[]>('luxor_marketing_campaigns?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: data.name.trim(),
      subject: campaignSubject,
      html_body: campaignHtmlBody,
      status: sendTime.getTime() > Date.now() ? 'scheduled' : 'scheduled',
      audience_label: data.audienceLabel || 'Manual list',
      scheduled_for: sendTime.toISOString(),
      created_by: data.createdBy || null,
      recipient_count: sendableRecipients.length,
      metadata: {
        ...(data.metadata || {}),
        sender_from: data.senderFrom || null,
        sender_name: data.senderName || null,
        ignore_suppressions: Boolean(data.ignoreSuppressions),
        skipped_suppressed_count: data.recipients.length - sendableRecipients.length,
      },
    }),
  })

  if (!campaign) throw new Error('Campaign could not be created.')

  for (const prepared of preparedRecipients) {
    const { recipient } = prepared
    const trackingToken = createTrackingToken()
    const [createdRecipient] = await supabaseRest<LuxorMarketingRecipient[]>('luxor_marketing_recipients?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        campaign_id: campaign.id,
        email: recipient.email,
        name: recipient.name || null,
        status: 'queued',
        tracking_token: trackingToken,
        metadata: {},
      }),
    })

    if (!createdRecipient) continue

    const job = await createLuxorEmailJob({
      jobType: 'marketing_campaign',
      recipientEmail: recipient.email,
      subject: prepared.subject,
      body: instrumentMarketingHtml(prepared.htmlBody, trackingToken),
      scheduledFor: sendTime.toISOString(),
      metadata: {
        campaign_id: campaign.id,
        marketing_recipient_id: createdRecipient.id,
        tracking_token: trackingToken,
        sender_from: data.senderFrom || null,
        sender_name: data.senderName || null,
        personalization: {
          client_name: recipient.name || 'there',
          event_type: recipient.eventType || 'celebration',
        },
      },
    })

    await supabaseRest<LuxorMarketingRecipient[]>(
      `luxor_marketing_recipients?select=*&id=eq.${encodeURIComponent(createdRecipient.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ email_job_id: job.id }),
      },
    )
  }

  return getMarketingCampaignDetail(campaign.id)
}

export async function recordMarketingOpen(trackingToken: string, request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const referer = request.headers.get('referer') || ''
  const secFetchSite = request.headers.get('sec-fetch-site') || ''

  // Never record open events from internal CRM owner views or same-origin requests
  if (
    cookie.includes('luxor_portal_session') ||
    referer.includes('/portal') ||
    secFetchSite === 'same-origin'
  ) {
    return null
  }

  const recipient = await getRecipientByTrackingToken(trackingToken)
  if (!recipient) return null

  // Never record open events for internal staff mailboxes
  const recipientEmail = recipient.email.toLowerCase()
  if (INTERNAL_EMAIL_ADDRESSES.some((addr) => recipientEmail.includes(addr))) {
    return null
  }

  const now = new Date().toISOString()
  const userAgent = request.headers.get('user-agent') || ''
  const ip = maskIp(request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown')
  const deviceType = detectDeviceType(userAgent)

  await supabaseRest('luxor_marketing_events', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      event_type: 'open',
      ip_address: ip,
      user_agent: userAgent,
      device_type: deviceType,
      metadata: {},
    }),
  })

  await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&id=eq.${encodeURIComponent(recipient.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        open_count: Number(recipient.open_count || 0) + 1,
        first_opened_at: recipient.first_opened_at || now,
        last_opened_at: now,
      }),
    },
  )

  return recipient
}

export async function recordMarketingClick(trackingToken: string, url: string, request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const referer = request.headers.get('referer') || ''
  const secFetchSite = request.headers.get('sec-fetch-site') || ''

  if (
    cookie.includes('luxor_portal_session') ||
    referer.includes('/portal') ||
    secFetchSite === 'same-origin'
  ) {
    return null
  }

  const recipient = await getRecipientByTrackingToken(trackingToken)
  if (!recipient) return null

  const recipientEmail = recipient.email.toLowerCase()
  if (INTERNAL_EMAIL_ADDRESSES.some((addr) => recipientEmail.includes(addr))) {
    return null
  }

  const now = new Date().toISOString()
  const userAgent = request.headers.get('user-agent') || ''
  const ip = maskIp(request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown')
  const deviceType = detectDeviceType(userAgent)

  await supabaseRest('luxor_marketing_events', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      event_type: 'click',
      url,
      ip_address: ip,
      user_agent: userAgent,
      device_type: deviceType,
      metadata: {},
    }),
  })

  await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&id=eq.${encodeURIComponent(recipient.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        click_count: Number(recipient.click_count || 0) + 1,
        last_clicked_at: now,
      }),
    },
  )

  return recipient
}

export async function recordMarketingUnsubscribe(trackingToken: string, request: Request) {
  const recipient = await getRecipientByTrackingToken(trackingToken)
  if (!recipient) return null

  const userAgent = request.headers.get('user-agent') || ''
  const ip = maskIp(request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown')
  const deviceType = detectDeviceType(userAgent)

  await supabaseRest('luxor_marketing_events', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      event_type: 'unsubscribe',
      ip_address: ip,
      user_agent: userAgent,
      device_type: deviceType,
      metadata: {},
    }),
  })

  await supabaseRest('luxor_marketing_suppressions?on_conflict=email', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      email: recipient.email.toLowerCase(),
      reason: 'unsubscribe',
      source: 'marketing_email',
      metadata: {
        campaign_id: recipient.campaign_id,
        recipient_id: recipient.id,
      },
    }),
  })

  // A recipient-initiated unsubscribe applies across every saved list. Keep
  // the suppression record as the permanent sending safeguard as well.
  await removeMarketingMember(recipient.email)

  return recipient
}

export async function markMarketingJobResult(jobId: string, status: 'sent' | 'failed', error?: string) {
  const [recipient] = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&email_job_id=eq.${encodeURIComponent(jobId)}&limit=1`,
  )

  if (!recipient) return

  const now = new Date().toISOString()
  await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&id=eq.${encodeURIComponent(recipient.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        sent_at: status === 'sent' ? now : recipient.sent_at,
        last_error: error || null,
      }),
    },
  )

  await refreshMarketingCampaignStatus(recipient.campaign_id)
}

async function refreshMarketingCampaignStatus(campaignId: string) {
  const recipients = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&campaign_id=eq.${encodeURIComponent(campaignId)}`,
  )
  const sent = recipients.filter((recipient) => recipient.status === 'sent').length
  const failed = recipients.filter((recipient) => recipient.status === 'failed').length
  const queued = recipients.filter((recipient) => recipient.status === 'queued').length
  const status = queued > 0 ? 'sending' : failed > 0 && sent === 0 ? 'failed' : 'sent'

  await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(campaignId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        sent_at: queued === 0 ? new Date().toISOString() : null,
      }),
    },
  )
}

async function getRecipientByTrackingToken(trackingToken: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(trackingToken)) return null

  const [recipient] = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&tracking_token=eq.${encodeURIComponent(trackingToken)}&limit=1`,
  )

  return recipient ?? null
}

async function isMarketingSuppressed(email: string) {
  const [suppression] = await supabaseRest<LuxorMarketingSuppression[]>(
    `luxor_marketing_suppressions?select=id&email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
  )

  return Boolean(suppression)
}

function detectDeviceType(userAgent: string) {
  const ua = userAgent.toLowerCase()
  if (/bot|crawler|spider|googleimageproxy|feedfetcher|slurp|scanner|proofpoint|mimecast/.test(ua)) return 'bot'
  if (/mobile|android|iphone|phone|webos|blackberry|opera mini|iemobile/.test(ua)) return 'mobile'
  if (/tablet|ipad/.test(ua)) return 'tablet'
  return userAgent ? 'desktop' : 'unknown'
}

function maskIp(ip: string) {
  if (!ip || ip === 'unknown') return 'unknown'
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`
  }
  if (ip.includes(':')) {
    const parts = ip.split(':')
    if (parts.length > 4) return `${parts.slice(0, 4).join(':')}:****`
  }
  return `${ip.slice(0, 10)}***`
}

export async function cancelMarketingCampaign(id: string) {
  const recipients = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&campaign_id=eq.${encodeURIComponent(id)}&status=eq.queued`,
  )

  for (const recipient of recipients) {
    if (recipient.email_job_id) {
      await updateLuxorEmailJob(recipient.email_job_id, { status: 'cancelled' })
    }
  }

  await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?campaign_id=eq.${encodeURIComponent(id)}&status=eq.queued`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    },
  )

  const [campaign] = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'cancelled' }),
    },
  )

  return campaign ?? null
}

export async function sendMarketingCampaignNow(id: string) {
  const recipients = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&campaign_id=eq.${encodeURIComponent(id)}&status=eq.queued`,
  )
  const jobIds = recipients
    .map((recipient) => recipient.email_job_id)
    .filter((jobId): jobId is string => Boolean(jobId))

  if (!jobIds.length) {
    await refreshMarketingCampaignStatus(id)
    return { processed: 0, results: [], detail: await getMarketingCampaignDetail(id) }
  }

  const now = new Date().toISOString()
  await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'sending', scheduled_for: now }),
    },
  )

  await Promise.all(
    jobIds.map((jobId) => updateLuxorEmailJob(jobId, { status: 'queued', scheduled_for: now })),
  )

  // A manual send starts the campaign, but it must not bypass the drip queue.
  // The worker releases the remaining recipients one at a time.
  const jobs = await listQueuedLuxorEmailJobsByIds(jobIds)
  const results = jobs.length ? await processLuxorEmailJobs([jobs[0]]) : []

  return {
    processed: results.length,
    results,
    detail: await getMarketingCampaignDetail(id),
  }
}

export type MarketingListMember = {
  id: string
  created_at: string
  email: string
  full_name: string | null
  source: string
  list_id: string
  metadata: Record<string, unknown>
}

type MarketingListRecord = {
  id: string
  created_at: string
  updated_at: string
  name: string
  description: string | null
  is_builtin: boolean
  metadata: Record<string, unknown>
}

export type MarketingListReference = {
  id?: string | null
  name?: string | null
}

function normalizeMarketingListName(name: string) {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) throw new Error('List name is required.')
  if (normalized.length > 120) throw new Error('List names are limited to 120 characters.')
  return normalized
}

async function findMarketingList(reference: MarketingListReference): Promise<MarketingListRecord | null> {
  if (reference.id) {
    const [list] = await supabaseRest<MarketingListRecord[]>(
      `luxor_marketing_lists?select=*&id=eq.${encodeURIComponent(reference.id)}&limit=1`,
    )
    return list ?? null
  }

  if (!reference.name?.trim()) return null
  const lists = await supabaseRest<MarketingListRecord[]>('luxor_marketing_lists?select=*')
  const wanted = reference.name.trim().toLocaleLowerCase()
  return lists.find((list) => list.name.toLocaleLowerCase() === wanted) ?? null
}

export async function createMarketingList(
  name: string,
  description?: string | null,
  options: { isBuiltIn?: boolean; metadata?: Record<string, unknown> } = {},
): Promise<MarketingListRecord> {
  const normalizedName = normalizeMarketingListName(name)
  const existing = await findMarketingList({ name: normalizedName })
  if (existing) return existing

  const [created] = await supabaseRest<MarketingListRecord[]>('luxor_marketing_lists?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: normalizedName,
      description: description?.trim() || null,
      is_builtin: Boolean(options.isBuiltIn),
      metadata: options.metadata || {},
    }),
  })
  if (!created) throw new Error('The marketing list could not be created.')
  return created
}

async function resolveMarketingList(reference: MarketingListReference, createIfMissing = false) {
  const existing = await findMarketingList(reference)
  if (existing) return existing
  if (createIfMissing && reference.name) return createMarketingList(reference.name)
  throw new Error('The selected marketing list no longer exists.')
}

export async function addMarketingMember(
  email: string,
  fullName?: string | null,
  source?: string | null,
): Promise<MarketingListMember | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Email is required.')
  const normalizedSource = source?.trim() || 'Uncategorized'
  const marketingList = await resolveMarketingList({ name: 'Marketing' }, true)

  const result = await supabaseRest<MarketingListMember[]>('luxor_marketing_list?on_conflict=email,list_id', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates, return=representation',
    },
    body: JSON.stringify({
      email: normalizedEmail,
      full_name: fullName || null,
      source: marketingList.name,
      list_id: marketingList.id,
      metadata: { contact_source: normalizedSource },
    }),
  })
  return result?.[0] ?? null
}

export async function removeMarketingMember(email: string, listId?: string | null): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return false

  const listFilter = listId?.trim() ? `&list_id=eq.${encodeURIComponent(listId.trim())}` : ''
  await supabaseRest('luxor_marketing_list?email=eq.' + encodeURIComponent(normalizedEmail) + listFilter, {
    method: 'DELETE',
  })
  return true
}

export async function isMarketingMember(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return false

  const results = await supabaseRest<MarketingListMember[]>('luxor_marketing_list?email=eq.' + encodeURIComponent(normalizedEmail), {
    method: 'GET',
  })
  return Array.isArray(results) && results.length > 0
}

/**
 * Finds (or re-uses) the single consolidated Grand Opening RSVP campaign and
 * adds the given recipient to it, then immediately sends their confirmation email.
 *
 * This replaces the old pattern of creating a new campaign per RSVP.
 */
export async function addRecipientToGrandOpeningCampaign(data: {
  email: string
  name: string | null
  htmlBody: string
  senderFrom?: string
  senderName?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const CAMPAIGN_NAME = 'Grand Opening Showcase \u2014 RSVP Confirmations'

  // 1. Find the existing consolidated campaign
  const existing = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&name=eq.${encodeURIComponent(CAMPAIGN_NAME)}&limit=1`,
  )
  let campaign = existing[0] ?? null

  // 2. If it doesn't exist yet (e.g. fresh environment), create it
  if (!campaign) {
    const [created] = await supabaseRest<LuxorMarketingCampaign[]>('luxor_marketing_campaigns?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name: CAMPAIGN_NAME,
        subject: 'Your Luxor Grand Opening RSVP is confirmed',
        html_body: data.htmlBody,
        status: 'sent',
        audience_label: 'Automated RSVP Confirmations',
        scheduled_for: new Date().toISOString(),
        created_by: 'system',
        recipient_count: 0,
        metadata: {
          source: 'grand_opening_rsvp',
          campaign_key: 'grand_opening_2026_07_25',
          automation_type: 'grand_opening_rsvp_confirmation',
          sender_from: data.senderFrom || null,
          sender_name: data.senderName || null,
          ignore_suppressions: true,
          consolidated: true,
          ...(data.metadata || {}),
        },
      }),
    })
    if (!created) throw new Error('Grand Opening campaign could not be created.')
    campaign = created
  }

  // 3. Add the new recipient
  const trackingToken = createTrackingToken()
  const [createdRecipient] = await supabaseRest<LuxorMarketingRecipient[]>('luxor_marketing_recipients?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      campaign_id: campaign.id,
      email: data.email,
      name: data.name || null,
      status: 'queued',
      tracking_token: trackingToken,
      metadata: data.metadata || {},
    }),
  })

  if (!createdRecipient) return

  // 4. Bump recipient_count on the campaign
  await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&id=eq.${encodeURIComponent(campaign.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ recipient_count: (campaign.recipient_count ?? 0) + 1 }),
    },
  )

  // 5. Queue the individual email. Grand Opening traffic is marketing traffic,
  // so it must use the same paced worker as every other campaign recipient.
  const now = new Date().toISOString()
  const job = await createLuxorEmailJob({
    jobType: 'marketing_campaign',
    recipientEmail: data.email,
    subject: 'Your Luxor Grand Opening RSVP is confirmed',
    body: instrumentMarketingHtml(data.htmlBody, trackingToken),
    scheduledFor: now,
    metadata: {
      campaign_id: campaign.id,
      marketing_recipient_id: createdRecipient.id,
      tracking_token: trackingToken,
      sender_from: data.senderFrom || null,
      sender_name: data.senderName || null,
    },
  })

  await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&id=eq.${encodeURIComponent(createdRecipient.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ email_job_id: job.id }),
    },
  )

}

/**
 * Adds a newly confirmed Grand Opening RSVP to every still-pending reminder
 * campaign. The campaigns themselves are created in the portal/Supabase so
 * Lewis can review or cancel them without a deployment.
 */
export async function addRecipientToGrandOpeningReminderCampaigns(data: {
  inquiryId: string
  email: string
  name: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  const campaigns = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&status=eq.scheduled&scheduled_for=gt.${encodeURIComponent(now)}&metadata->>campaign_key=eq.grand_opening_2026_07_25&metadata->>automation_type=eq.grand_opening_rsvp_reminder&order=scheduled_for.asc`,
  )

  for (const campaign of campaigns) {
    const existing = await supabaseRest<LuxorMarketingRecipient[]>(
      `luxor_marketing_recipients?select=id&campaign_id=eq.${encodeURIComponent(campaign.id)}&email=eq.${encodeURIComponent(data.email.toLowerCase())}&limit=1`,
    )
    if (existing.length) continue

    const trackingToken = createTrackingToken()
    const [recipient] = await supabaseRest<LuxorMarketingRecipient[]>('luxor_marketing_recipients?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        campaign_id: campaign.id,
        email: data.email.toLowerCase(),
        name: data.name,
        status: 'queued',
        tracking_token: trackingToken,
        metadata: { inquiry_id: data.inquiryId, rsvp_status: 'attending' },
      }),
    })
    if (!recipient || !campaign.scheduled_for) continue

    const job = await createLuxorEmailJob({
      inquiryId: data.inquiryId,
      jobType: 'marketing_campaign',
      recipientEmail: data.email.toLowerCase(),
      subject: campaign.subject,
      body: instrumentMarketingHtml(campaign.html_body, trackingToken),
      scheduledFor: campaign.scheduled_for,
      metadata: {
        campaign_id: campaign.id,
        marketing_recipient_id: recipient.id,
        tracking_token: trackingToken,
        sender_from: campaign.metadata?.sender_from || 'hello@luxoratlaspalmas.com',
        sender_name: campaign.metadata?.sender_name || 'Luxor Event Space',
        inquiry_id: data.inquiryId,
        rsvp_status: 'attending',
      },
    })

    await supabaseRest(
      `luxor_marketing_recipients?id=eq.${encodeURIComponent(recipient.id)}`,
      { method: 'PATCH', body: JSON.stringify({ email_job_id: job.id }) },
    )

    const recipients = await supabaseRest<{ id: string }[]>(
      `luxor_marketing_recipients?select=id&campaign_id=eq.${encodeURIComponent(campaign.id)}`,
    )
    await supabaseRest(
      `luxor_marketing_campaigns?id=eq.${encodeURIComponent(campaign.id)}`,
      { method: 'PATCH', body: JSON.stringify({ recipient_count: recipients.length, updated_at: now }) },
    )
  }
}

export type MarketingList = {
  id: string
  name: string
  description: string | null
  isBuiltIn: boolean
  createdAt: string
  updatedAt: string
  memberCount: number
  members: MarketingListMember[]
}

export async function getMarketingLists(): Promise<MarketingList[]> {
  const [lists, members] = await Promise.all([
    supabaseRest<MarketingListRecord[]>('luxor_marketing_lists?select=*&order=is_builtin.desc,updated_at.desc,name.asc'),
    supabaseRest<MarketingListMember[]>('luxor_marketing_list?select=*&order=created_at.desc'),
  ])
  const membersByList = new Map<string, MarketingListMember[]>()
  members.forEach((member) => {
    const current = membersByList.get(member.list_id) || []
    current.push(member)
    membersByList.set(member.list_id, current)
  })

  return lists.map((list) => {
    const listMembers = membersByList.get(list.id) || []
    const latestMembership = listMembers.reduce(
      (latest, member) => member.created_at > latest ? member.created_at : latest,
      list.updated_at,
    )
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      isBuiltIn: list.is_builtin,
      createdAt: list.created_at,
      updatedAt: latestMembership,
      memberCount: listMembers.length,
      members: listMembers,
    }
  })
}

export async function getMarketingListById(id: string): Promise<MarketingList | null> {
  const lists = await getMarketingLists()
  return lists.find((list) => list.id === id) ?? null
}

export async function bulkAddMarketingMembers(
  listReference: MarketingListReference,
  recipients: { email: string; name?: string | null; source?: string | null; metadata?: Record<string, unknown> }[]
): Promise<{ added: number; skippedSuppressed: number }> {
  const list = await resolveMarketingList(listReference, Boolean(listReference.name))
  if (!recipients.length) return { added: 0, skippedSuppressed: 0 }

  const uniqueRecipients = Array.from(new Map(
    recipients
      .map((recipient) => ({
        email: recipient.email.trim().toLowerCase(),
        name: recipient.name?.trim() || null,
        source: recipient.source?.trim() || 'Manual',
        metadata: recipient.metadata || {},
      }))
      .filter((recipient) => BULK_LIST_EMAIL_RE.test(recipient.email))
      .map((recipient) => [recipient.email, recipient]),
  ).values())
  if (!uniqueRecipients.length) return { added: 0, skippedSuppressed: 0 }

  const suppressed = await supabaseRest<Array<{ email: string }>>(
    `luxor_marketing_suppressions?select=email&email=in.(${uniqueRecipients.map((recipient) => encodeURIComponent(recipient.email)).join(',')})`,
  )
  const suppressedEmails = new Set(suppressed.map((row) => row.email.trim().toLowerCase()))
  const allowedRecipients = uniqueRecipients.filter((recipient) => !suppressedEmails.has(recipient.email))

  if (!allowedRecipients.length) return { added: 0, skippedSuppressed: suppressedEmails.size }

  await supabaseRest('luxor_marketing_list?on_conflict=email,list_id', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(
      allowedRecipients.map(r => ({
        email: r.email.trim().toLowerCase(),
        full_name: r.name || null,
        source: list.name,
        metadata: { ...r.metadata, contact_source: r.source },
        list_id: list.id,
      }))
    ),
  })

  await supabaseRest(`luxor_marketing_lists?id=eq.${encodeURIComponent(list.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  })

  return { added: allowedRecipients.length, skippedSuppressed: suppressedEmails.size }
}

export async function bulkRemoveMarketingMembers(listReference: MarketingListReference, emails: string[]): Promise<number> {
  const list = await resolveMarketingList(listReference)
  const normalizedEmails = Array.from(new Set(
    emails.map((email) => email.trim().toLowerCase()).filter((email) => BULK_LIST_EMAIL_RE.test(email)),
  ))
  if (!normalizedEmails.length) return 0

  const deleted = await supabaseRest<Array<{ id: string }>>(
    `luxor_marketing_list?select=id&list_id=eq.${encodeURIComponent(list.id)}&email=in.(${normalizedEmails.map((email) => encodeURIComponent(email)).join(',')})`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } },
  )
  if (deleted.length) {
    await supabaseRest(`luxor_marketing_lists?id=eq.${encodeURIComponent(list.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })
  }
  return deleted.length
}
