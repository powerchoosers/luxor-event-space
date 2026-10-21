import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import {
  aggregateMarketingOverview,
  getMarketingOverviewRange,
  readMarketingOverviewPages,
  type MarketingOverviewCampaign,
  type MarketingOverviewEmailJob,
  type MarketingOverviewEvent,
  type MarketingOverviewInquiry,
  type MarketingOverviewRecipient,
} from './luxorMarketingOverview'

const PAGE_SIZE = 1000
const MAX_OVERVIEW_ROWS = 10_000
const ID_BATCH_SIZE = 100
const ID_BATCH_CONCURRENCY = 10

async function readRows<T>(table: string, select: string, filters: string, order: string) {
  return readMarketingOverviewPages(
    (offset, limit) => supabaseRest<T[]>(
      `${table}?select=${select}${filters}&order=${order}&limit=${limit}&offset=${offset}`,
    ),
    { pageSize: PAGE_SIZE, maxRows: MAX_OVERVIEW_ROWS },
  )
}

async function readByIds<T>(table: string, select: string, values: Array<string | null>) {
  const ids = Array.from(new Set(values.filter((value): value is string => Boolean(value))))
  const batches: string[][] = []
  for (let index = 0; index < ids.length; index += ID_BATCH_SIZE) {
    batches.push(ids.slice(index, index + ID_BATCH_SIZE))
  }

  const rows: T[] = []
  for (let index = 0; index < batches.length; index += ID_BATCH_CONCURRENCY) {
    const group = batches.slice(index, index + ID_BATCH_CONCURRENCY)
    const results = await Promise.all(group.map((batch) => supabaseRest<T[]>(
      `${table}?select=${select}&id=in.(${batch.join(',')})&limit=${batch.length}`,
    )))
    results.forEach((result) => rows.push(...result))
  }
  return rows
}

export async function getLuxorMarketingOverview(days: number, now = new Date()) {
  const range = getMarketingOverviewRange(days, now)
  const from = encodeURIComponent(range.start.toISOString())
  const until = encodeURIComponent(range.endExclusive.toISOString())
  const nowIso = encodeURIComponent(now.toISOString())

  const [inquiries, sentRecipients, events, upcomingCampaigns] = await Promise.all([
    readRows<MarketingOverviewInquiry>(
      'luxor_inquiries',
      'id,created_at,source,is_test',
      `&created_at=gte.${from}&created_at=lt.${until}&is_test=eq.false`,
      'created_at.asc,id.asc',
    ),
    readRows<MarketingOverviewRecipient>(
      'luxor_marketing_recipients',
      'id,campaign_id,email_job_id,status,sent_at,metadata',
      `&status=eq.sent&sent_at=gte.${from}&sent_at=lt.${until}`,
      'sent_at.asc,id.asc',
    ),
    readRows<MarketingOverviewEvent>(
      'luxor_marketing_events',
      'id,created_at,campaign_id,recipient_id,event_type,metadata',
      `&event_type=in.(open,click,unsubscribe)&created_at=gte.${from}&created_at=lt.${until}`,
      'created_at.desc,id.asc',
    ),
    readRows<MarketingOverviewCampaign>(
      'luxor_marketing_campaigns',
      'id,name,status,scheduled_for,metadata',
      `&status=eq.scheduled&scheduled_for=gte.${nowIso}`,
      'scheduled_for.asc,id.asc',
    ),
  ])

  const eventRecipients = await readByIds<MarketingOverviewRecipient>(
    'luxor_marketing_recipients',
    'id,campaign_id,email_job_id,metadata',
    events.map((event) => event.recipient_id),
  )
  const relatedRecipients = [...sentRecipients, ...eventRecipients]
  const [emailJobs, relatedCampaigns] = await Promise.all([
    readByIds<MarketingOverviewEmailJob>(
      'luxor_email_jobs',
      'id,test_run_id',
      relatedRecipients.map((recipient) => recipient.email_job_id),
    ),
    readByIds<MarketingOverviewCampaign>(
      'luxor_marketing_campaigns',
      'id,name,status,scheduled_for,metadata',
      [
        ...relatedRecipients.map((recipient) => recipient.campaign_id),
        ...upcomingCampaigns.map((campaign) => campaign.id),
      ],
    ),
  ])

  const campaignsById = new Map<string, MarketingOverviewCampaign>()
  for (const campaign of [...upcomingCampaigns, ...relatedCampaigns]) campaignsById.set(campaign.id, campaign)

  return aggregateMarketingOverview({
    range,
    inquiries,
    sentRecipients,
    eventRecipients,
    emailJobs,
    events,
    campaigns: [...campaignsById.values()],
    now,
  })
}
