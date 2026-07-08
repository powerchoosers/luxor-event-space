import 'server-only'

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

export type MarketingRecipientInput = {
  email: string
  name?: string | null
}

export type MarketingCampaignSummary = LuxorMarketingCampaign & {
  sent_count: number
  queued_count: number
  failed_count: number
  open_count: number
  click_count: number
  unique_opens: number
  unique_clicks: number
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

function summarizeCampaign(campaign: LuxorMarketingCampaign, recipients: LuxorMarketingRecipient[]): MarketingCampaignSummary {
  const sentCount = recipients.filter((recipient) => recipient.status === 'sent').length
  const queuedCount = recipients.filter((recipient) => recipient.status === 'queued').length
  const failedCount = recipients.filter((recipient) => recipient.status === 'failed').length
  const openCount = recipients.reduce((sum, recipient) => sum + Number(recipient.open_count || 0), 0)
  const clickCount = recipients.reduce((sum, recipient) => sum + Number(recipient.click_count || 0), 0)
  const uniqueOpens = recipients.filter((recipient) => Number(recipient.open_count || 0) > 0).length
  const uniqueClicks = recipients.filter((recipient) => Number(recipient.click_count || 0) > 0).length
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
    open_rate: denominator ? Math.round((uniqueOpens / denominator) * 1000) / 10 : 0,
    click_rate: denominator ? Math.round((uniqueClicks / denominator) * 1000) / 10 : 0,
  }
}

export async function listMarketingCampaigns(limit = 25) {
  const campaigns = await supabaseRest<LuxorMarketingCampaign[]>(
    `luxor_marketing_campaigns?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`,
  )

  if (!campaigns.length) return []

  const campaignIds = campaigns.map((campaign) => campaign.id).join(',')
  const recipients = await supabaseRest<LuxorMarketingRecipient[]>(
    `luxor_marketing_recipients?select=*&campaign_id=in.(${campaignIds})`,
  )

  return campaigns.map((campaign) => summarizeCampaign(
    campaign,
    recipients.filter((recipient) => recipient.campaign_id === campaign.id),
  ))
}

export async function listMarketingTemplates(limit = 100) {
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
      metadata: {},
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
    campaign: summarizeCampaign(campaign, recipients),
    recipients,
    events,
  }
}

export async function listMarketingActivityEvents(options: { since?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const sinceFilter = options.since ? `&created_at=gt.${encodeURIComponent(options.since)}` : ''
  const events = await supabaseRest<LuxorMarketingEvent[]>(
    `luxor_marketing_events?select=*&event_type=in.(open,click)&order=created_at.desc&limit=${encodeURIComponent(limit)}${sinceFilter}`,
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
      campaign_name: campaign?.name ?? null,
      campaign_subject: campaign?.subject ?? null,
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
      campaign_name: campaign?.name ?? null,
      campaign_subject: campaign?.subject ?? null,
    }
  })

  const campaignSummaries = recipients
    .map((recipient): LeadMarketingCampaignSummary => {
      const campaign = campaignsById.get(recipient.campaign_id)

      return {
        recipient_id: recipient.id,
        campaign_id: recipient.campaign_id,
        campaign_name: campaign?.name ?? null,
        campaign_subject: campaign?.subject ?? null,
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
}) {
  if (!data.name.trim()) throw new Error('Please name this campaign.')
  if (!data.subject.trim()) throw new Error('Please add a subject line.')
  if (!data.htmlBody.trim()) throw new Error('Please add email content.')
  if (!data.recipients.length) throw new Error('Please add at least one valid recipient.')

  const sendableRecipients: MarketingRecipientInput[] = []
  for (const recipient of data.recipients) {
    if (!await isMarketingSuppressed(recipient.email)) {
      sendableRecipients.push(recipient)
    }
  }

  if (!sendableRecipients.length) {
    throw new Error('Every recipient on this list has unsubscribed or is suppressed.')
  }

  const scheduledFor = data.scheduledFor || new Date().toISOString()
  const sendTime = new Date(scheduledFor)
  if (Number.isNaN(sendTime.getTime())) throw new Error('Please choose a valid send time.')

  const [campaign] = await supabaseRest<LuxorMarketingCampaign[]>('luxor_marketing_campaigns?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: data.name.trim(),
      subject: data.subject.trim(),
      html_body: data.htmlBody,
      status: sendTime.getTime() > Date.now() ? 'scheduled' : 'scheduled',
      audience_label: data.audienceLabel || 'Manual list',
      scheduled_for: sendTime.toISOString(),
      created_by: data.createdBy || null,
      recipient_count: sendableRecipients.length,
      metadata: {
        skipped_suppressed_count: data.recipients.length - sendableRecipients.length,
      },
    }),
  })

  if (!campaign) throw new Error('Campaign could not be created.')

  for (const recipient of sendableRecipients) {
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
      subject: campaign.subject,
      body: instrumentMarketingHtml(data.htmlBody, trackingToken),
      scheduledFor: sendTime.toISOString(),
      metadata: {
        campaign_id: campaign.id,
        marketing_recipient_id: createdRecipient.id,
        tracking_token: trackingToken,
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
  const recipient = await getRecipientByTrackingToken(trackingToken)
  if (!recipient) return null

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
  const recipient = await getRecipientByTrackingToken(trackingToken)
  if (!recipient) return null

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

  const jobs = await listQueuedLuxorEmailJobsByIds(jobIds)
  const results = await processLuxorEmailJobs(jobs)

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
  source: string | null
  metadata: Record<string, unknown>
}

export async function addMarketingMember(
  email: string,
  fullName?: string | null,
  source?: string | null,
): Promise<MarketingListMember | null> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Email is required.')

  const result = await supabaseRest<MarketingListMember[]>('luxor_marketing_list', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates, return=representation',
    },
    body: JSON.stringify({
      email: normalizedEmail,
      full_name: fullName || null,
      source: source || null,
    }),
  })
  return result?.[0] ?? null
}

export async function removeMarketingMember(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return false

  await supabaseRest('luxor_marketing_list?email=eq.' + encodeURIComponent(normalizedEmail), {
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
