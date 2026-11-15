export type MarketingEmailChannel = 'campaign' | 'follow_up' | 'system'

export type MarketingEmailMetricsMailRow = {
  id: string
  provider_id: string | null
  accepted_at: string | null
  occurred_at: string
  subject: string | null
  metadata?: Record<string, unknown> | null
}

export type MarketingEmailMetricsJob = {
  id: string
  test_run_id: string | null
  job_type: string
  automation_enrollment_id?: string | null
  metadata?: Record<string, unknown> | null
}

export type MarketingEmailMetricsResendEvent = {
  event_id: string
  event_type: string
  provider_email_id: string | null
  received_at: string
}

export type MarketingEmailChannelCounts = {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
}

export type MarketingEmailDeliveryActivity = {
  id: string
  createdAt: string
  eventType: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced'
  channel: MarketingEmailChannel
  label: string
}

export type MarketingEmailMetrics = {
  totals: MarketingEmailChannelCounts
  byChannel: Record<MarketingEmailChannel, MarketingEmailChannelCounts>
  recentActivity: MarketingEmailDeliveryActivity[]
  trackedActivityCount: number
}

type AggregateMarketingEmailMetricsInput = {
  sentMailRows: MarketingEmailMetricsMailRow[]
  mailByProviderId: Map<string, MarketingEmailMetricsMailRow>
  jobsById: Map<string, MarketingEmailMetricsJob>
  resendEvents: MarketingEmailMetricsResendEvent[]
  activityLimit?: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function hasTruthyTestMarker(metadata: unknown) {
  const record = asRecord(metadata)
  if (!record) return false
  if (record.is_test_record === true || record.is_test_record === 'true') return true
  const runId = record.test_run_id ?? record.testRunId
  return typeof runId === 'string' && runId.trim().length > 0
}

function resolveMarketingCampaignId(
  mail: MarketingEmailMetricsMailRow,
  job?: MarketingEmailMetricsJob,
) {
  const metadata = mail.metadata || {}
  if (isUuid(metadata.marketingCampaignId)) return metadata.marketingCampaignId
  const jobMetadata = job?.metadata || {}
  return isUuid(jobMetadata.campaign_id) ? jobMetadata.campaign_id : null
}

export function classifyMarketingEmailChannel(
  mail: MarketingEmailMetricsMailRow,
  job?: MarketingEmailMetricsJob,
): MarketingEmailChannel {
  const resolvedJob = job || undefined
  const jobMetadata = resolvedJob?.metadata || {}

  if (
    jobMetadata.follow_up_sequence === true
    || resolvedJob?.automation_enrollment_id
    || resolvedJob?.job_type === 'brochure_follow_up'
  ) {
    return 'follow_up'
  }

  const automationKey = typeof jobMetadata.automation_key === 'string' ? jobMetadata.automation_key : ''
  if (automationKey.includes('follow_up') || automationKey.includes('brochure')) return 'follow_up'

  if (resolveMarketingCampaignId(mail, job)) return 'campaign'

  return 'system'
}

export function isProductionMarketingMailRow(
  mail: MarketingEmailMetricsMailRow,
  job?: MarketingEmailMetricsJob,
) {
  if (hasTruthyTestMarker(mail.metadata)) return false
  if (!job) return true
  if (job.test_run_id) return false
  if (hasTruthyTestMarker(job.metadata)) return false
  return true
}

function emptyCounts(): MarketingEmailChannelCounts {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 }
}

function resendMetricType(eventType: string): keyof MarketingEmailChannelCounts | null {
  if (eventType === 'email.delivered') return 'delivered'
  if (eventType === 'email.opened') return 'opened'
  if (eventType === 'email.clicked') return 'clicked'
  if (eventType === 'email.bounced') return 'bounced'
  return null
}

function activityEventType(eventType: string): MarketingEmailDeliveryActivity['eventType'] | null {
  if (eventType === 'email.delivered') return 'delivered'
  if (eventType === 'email.opened') return 'opened'
  if (eventType === 'email.clicked') return 'clicked'
  if (eventType === 'email.bounced') return 'bounced'
  return null
}

function productionMailForEvent(
  mail: MarketingEmailMetricsMailRow | undefined,
  jobsById: Map<string, MarketingEmailMetricsJob>,
) {
  if (!mail) return null
  const jobId = typeof mail.metadata?.emailJobId === 'string' ? mail.metadata.emailJobId : null
  const job = jobId ? jobsById.get(jobId) : undefined
  return isProductionMarketingMailRow(mail, job) ? mail : null
}

export function aggregateMarketingEmailMetrics(input: AggregateMarketingEmailMetricsInput): MarketingEmailMetrics {
  const totals = emptyCounts()
  const byChannel: Record<MarketingEmailChannel, MarketingEmailChannelCounts> = {
    campaign: emptyCounts(),
    follow_up: emptyCounts(),
    system: emptyCounts(),
  }

  for (const mail of input.sentMailRows) {
    const production = productionMailForEvent(mail, input.jobsById)
    if (!production?.accepted_at) continue
    const jobId = typeof mail.metadata?.emailJobId === 'string' ? mail.metadata.emailJobId : null
    const job = jobId ? input.jobsById.get(jobId) : undefined
    const channel = classifyMarketingEmailChannel(mail, job)
    totals.sent += 1
    byChannel[channel].sent += 1
  }

  const countedEvents = new Set<string>()
  for (const event of input.resendEvents) {
    const metric = resendMetricType(event.event_type)
    if (!metric || !event.provider_email_id) continue
    const dedupeKey = `${event.provider_email_id}:${event.event_type}:${event.event_id}`
    if (countedEvents.has(dedupeKey)) continue
    countedEvents.add(dedupeKey)

    const mail = productionMailForEvent(input.mailByProviderId.get(event.provider_email_id), input.jobsById)
    if (!mail) continue
    const jobId = typeof mail.metadata?.emailJobId === 'string' ? mail.metadata.emailJobId : null
    const job = jobId ? input.jobsById.get(jobId) : undefined
    const channel = classifyMarketingEmailChannel(mail, job)
    totals[metric] += 1
    byChannel[channel][metric] += 1
  }

  const activityLimit = Math.max(1, Math.min(100, Math.floor(input.activityLimit ?? 50)))
  const recentActivity = input.resendEvents
    .map((event) => {
      const mapped = activityEventType(event.event_type)
      if (!mapped || !event.provider_email_id) return null
      const mail = productionMailForEvent(input.mailByProviderId.get(event.provider_email_id), input.jobsById)
      if (!mail) return null
      const jobId = typeof mail.metadata?.emailJobId === 'string' ? mail.metadata.emailJobId : null
      const job = jobId ? input.jobsById.get(jobId) : undefined
      const channel = classifyMarketingEmailChannel(mail, job)
      const subject = mail.subject?.trim()
      return {
        id: event.event_id,
        createdAt: event.received_at,
        eventType: mapped,
        channel,
        label: subject || 'Outbound email',
      } satisfies MarketingEmailDeliveryActivity
    })
    .filter((row): row is MarketingEmailDeliveryActivity => Boolean(row))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, activityLimit)

  return {
    totals,
    byChannel,
    recentActivity,
    trackedActivityCount: totals.delivered + totals.opened + totals.clicked + totals.bounced,
  }
}