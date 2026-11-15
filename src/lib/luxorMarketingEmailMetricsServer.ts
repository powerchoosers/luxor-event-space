import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import {
  aggregateMarketingEmailMetrics,
  type MarketingEmailMetrics,
  type MarketingEmailMetricsJob,
  type MarketingEmailMetricsMailRow,
  type MarketingEmailMetricsResendEvent,
} from './luxorMarketingEmailMetrics'
import { getMarketingOverviewRange, readMarketingOverviewPages } from './luxorMarketingOverview'

const PAGE_SIZE = 1000
const MAX_MAIL_ROWS = 10_000
const ID_BATCH_SIZE = 100
const ID_BATCH_CONCURRENCY = 10

async function readRows<T>(table: string, select: string, filters: string, order: string) {
  return readMarketingOverviewPages(
    (offset, limit) => supabaseRest<T[]>(
      `${table}?select=${select}${filters}&order=${order}&limit=${limit}&offset=${offset}`,
    ),
    { pageSize: PAGE_SIZE, maxRows: MAX_MAIL_ROWS },
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

export async function getLuxorMarketingEmailMetrics(days: number, now = new Date(), activityLimit = 50): Promise<MarketingEmailMetrics> {
  const range = getMarketingOverviewRange(days, now)
  const from = encodeURIComponent(range.start.toISOString())
  const until = encodeURIComponent(range.endExclusive.toISOString())

  const mailRows = await readRows<MarketingEmailMetricsMailRow>(
    'luxor_mail_messages',
    'id,provider_id,accepted_at,occurred_at,subject,metadata',
    `&provider=eq.resend&direction=eq.outgoing&accepted_at=gte.${from}&accepted_at=lt.${until}`,
    'accepted_at.desc,id.asc',
  )

  const jobIds = mailRows
    .map((mail) => (typeof mail.metadata?.emailJobId === 'string' ? mail.metadata.emailJobId : null))
    .filter((value): value is string => Boolean(value))
  const jobs = await readByIds<MarketingEmailMetricsJob>(
    'luxor_email_jobs',
    'id,test_run_id,job_type,automation_enrollment_id,metadata',
    jobIds,
  )
  const jobsById = new Map(jobs.map((job) => [job.id, job]))

  const providerIds = [...new Set(mailRows.map((row) => row.provider_id).filter((value): value is string => Boolean(value)))]
  const resendEvents: MarketingEmailMetricsResendEvent[] = []
  if (providerIds.length) {
    const batches: string[][] = []
    for (let index = 0; index < providerIds.length; index += ID_BATCH_SIZE) {
      batches.push(providerIds.slice(index, index + ID_BATCH_SIZE))
    }
    for (let index = 0; index < batches.length; index += ID_BATCH_CONCURRENCY) {
      const group = batches.slice(index, index + ID_BATCH_CONCURRENCY)
      const results = await Promise.all(group.map((batch) => readRows<MarketingEmailMetricsResendEvent>(
        'luxor_resend_events',
        'event_id,event_type,provider_email_id,received_at',
        `&provider_email_id=in.(${batch.map(encodeURIComponent).join(',')})&event_type=in.(email.delivered,email.opened,email.clicked,email.bounced)&received_at=gte.${from}&received_at=lt.${until}`,
        'received_at.desc,event_id.asc',
      )))
      results.forEach((result) => resendEvents.push(...result))
    }
  }

  return aggregateMarketingEmailMetrics({
    mailRows,
    jobsById,
    resendEvents,
    activityLimit,
  })
}