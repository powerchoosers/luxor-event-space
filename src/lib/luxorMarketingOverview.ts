export const LUXOR_MARKETING_TIME_ZONE = 'America/Chicago'

export type MarketingOverviewRange = {
  days: 7 | 30 | 90
  startDate: string
  endDate: string
  start: Date
  endExclusive: Date
}

export type MarketingOverviewInquiry = {
  id: string
  created_at: string
  source: string | null
  is_test: boolean | null
}

export type MarketingOverviewRecipient = {
  id: string
  campaign_id: string | null
  email_job_id: string | null
  status?: string
  sent_at?: string | null
  metadata?: unknown
}

export type MarketingOverviewEvent = {
  id: string
  created_at: string
  campaign_id: string | null
  recipient_id: string | null
  event_type: string
  metadata?: unknown
}

export type MarketingOverviewEmailJob = {
  id: string
  test_run_id: string | null
}

export type MarketingOverviewCampaign = {
  id: string
  name: string | null
  status: string
  scheduled_for: string | null
  metadata?: unknown
}

export type MarketingOverviewData = {
  period: {
    days: 7 | 30 | 90
    startDate: string
    endDate: string
    timeZone: typeof LUXOR_MARKETING_TIME_ZONE
  }
  inquiryCount: number
  sentRecipientCount: number
  excludedUnlinkedSentCount: number
  clickEventCount: number
  inquiriesByDay: Array<{ date: string; count: number }>
  sourceBreakdown: Array<{ source: string; count: number }>
  upcomingCampaignCount: number
  upcomingCampaigns: Array<{ id: string; name: string; scheduledFor: string }>
  trackedActivityCount: number
  recentActivity: Array<{ id: string; createdAt: string; eventType: string; campaignName: string }>
}

type MarketingOverviewInput = {
  range: MarketingOverviewRange
  inquiries: MarketingOverviewInquiry[]
  sentRecipients: MarketingOverviewRecipient[]
  eventRecipients: MarketingOverviewRecipient[]
  emailJobs: MarketingOverviewEmailJob[]
  events: MarketingOverviewEvent[]
  campaigns: MarketingOverviewCampaign[]
  now?: Date
  activityLimit?: number
}

function chicagoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_MARKETING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return { year: read('year'), month: read('month'), day: read('day') }
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftDate(date: string, amount: number) {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + amount))
  return formatDateParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

function chicagoMidnight(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const targetWallTime = Date.UTC(year, month - 1, day)
  let candidate = targetWallTime
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_MARKETING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate))
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const observedWallTime = Date.UTC(
      read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'),
    )
    const correction = targetWallTime - observedWallTime
    candidate += correction
    if (correction === 0) break
  }

  return new Date(candidate)
}

export function getMarketingOverviewRange(days: number, now = new Date()): MarketingOverviewRange {
  if (days !== 7 && days !== 30 && days !== 90) {
    throw new Error('Choose a 7, 30, or 90 day marketing range.')
  }

  const localParts = chicagoDateParts(now)
  const localToday = formatDateParts(localParts.year, localParts.month, localParts.day)
  const startDate = shiftDate(localToday, -(days - 1))
  const endDate = localToday
  return {
    days,
    startDate,
    endDate,
    start: chicagoMidnight(startDate),
    endExclusive: chicagoMidnight(shiftDate(endDate, 1)),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasTestMarker(metadata: unknown) {
  const record = asRecord(metadata)
  if (!record) return false
  const trueKeys = ['is_test', 'isTest', 'test', 'test_mode', 'testMode', 'is_test_lead', 'isTestLead']
  if (trueKeys.some((key) => record[key] === true || record[key] === 'true' || record[key] === '1')) return true
  const runId = record.test_run_id ?? record.testRunId
  return typeof runId === 'string' && runId.trim().length > 0
}

function isWithinRange(value: string | null | undefined, range: MarketingOverviewRange) {
  if (!value) return false
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp >= range.start.getTime() && timestamp < range.endExclusive.getTime()
}

function dateKey(value: string) {
  const parts = chicagoDateParts(new Date(value))
  return formatDateParts(parts.year, parts.month, parts.day)
}

function collectAllPages<T>(
  loadPage: (offset: number, limit: number) => Promise<T[]>,
  options: { pageSize?: number; maxRows?: number } = {},
) {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? 1000))
  const maxRows = Math.max(pageSize, Math.floor(options.maxRows ?? 10_000))

  return (async () => {
    const rows: T[] = []
    while (true) {
      const offset = rows.length
      const limit = Math.min(pageSize, maxRows - rows.length)
      const page = await loadPage(offset, limit)
      if (page.length > limit) throw new Error('Marketing data page exceeded its requested size.')
      rows.push(...page)
      if (page.length < limit) return rows
      if (rows.length === maxRows) {
        const more = await loadPage(rows.length, 1)
        if (more.length) throw new Error('Marketing overview data exceeds the supported read limit.')
        return rows
      }
    }
  })()
}

export const readMarketingOverviewPages = collectAllPages

export function aggregateMarketingOverview(input: MarketingOverviewInput): MarketingOverviewData {
  const { range } = input
  const now = input.now ?? new Date()
  const jobsById = new Map(input.emailJobs.map((job) => [job.id, job]))
  const campaignsById = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]))
  const recipientsById = new Map<string, MarketingOverviewRecipient>()
  for (const recipient of [...input.sentRecipients, ...input.eventRecipients]) recipientsById.set(recipient.id, recipient)

  const series = new Map<string, number>()
  const [startYear, startMonth, startDay] = range.startDate.split('-').map(Number)
  for (let index = 0; index < range.days; index += 1) {
    const date = new Date(Date.UTC(startYear, startMonth - 1, startDay + index))
    series.set(formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()), 0)
  }

  const sourceCounts = new Map<string, number>()
  let inquiryCount = 0
  for (const inquiry of input.inquiries) {
    if (inquiry.is_test !== false || !isWithinRange(inquiry.created_at, range)) continue
    inquiryCount += 1
    const key = dateKey(inquiry.created_at)
    if (series.has(key)) series.set(key, (series.get(key) ?? 0) + 1)
    const source = inquiry.source?.trim() || 'Not recorded'
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
  }

  const hasProductionAssociation = (recipient: MarketingOverviewRecipient) => {
    if (hasTestMarker(recipient.metadata)) return false
    if (!recipient.email_job_id) return false
    const job = jobsById.get(recipient.email_job_id)
    if (!job || job.test_run_id) return false
    const campaign = recipient.campaign_id ? campaignsById.get(recipient.campaign_id) : null
    return !campaign || !hasTestMarker(campaign.metadata)
  }

  let sentRecipientCount = 0
  let excludedUnlinkedSentCount = 0
  for (const recipient of input.sentRecipients) {
    if (recipient.status !== 'sent' || !isWithinRange(recipient.sent_at, range)) continue
    if (!recipient.email_job_id || !jobsById.has(recipient.email_job_id)) {
      excludedUnlinkedSentCount += 1
      continue
    }
    if (hasProductionAssociation(recipient)) sentRecipientCount += 1
  }

  const eligibleEvents = input.events
    .filter((event) => isWithinRange(event.created_at, range) && !hasTestMarker(event.metadata))
    .filter((event) => {
      const recipient = event.recipient_id ? recipientsById.get(event.recipient_id) : undefined
      if (!recipient || !hasProductionAssociation(recipient)) return false
      const campaign = event.campaign_id ? campaignsById.get(event.campaign_id) : null
      return !campaign || !hasTestMarker(campaign.metadata)
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())

  const upcomingCampaigns = input.campaigns
    .filter((campaign) => campaign.status === 'scheduled' && campaign.scheduled_for)
    .filter((campaign) => new Date(campaign.scheduled_for as string).getTime() > now.getTime())
    .filter((campaign) => !hasTestMarker(campaign.metadata))
    .sort((left, right) => new Date(left.scheduled_for as string).getTime() - new Date(right.scheduled_for as string).getTime())

  const sortedSources = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))
  const sourceBreakdown = sortedSources.slice(0, 5)
  const otherSourceCount = sortedSources.slice(5).reduce((sum, item) => sum + item.count, 0)
  if (otherSourceCount) sourceBreakdown.push({ source: 'Other sources', count: otherSourceCount })

  const activityLimit = Math.max(1, Math.min(100, Math.floor(input.activityLimit ?? 50)))
  const campaignName = (id: string | null) => {
    const name = id ? campaignsById.get(id)?.name : null
    return name?.trim() || 'Campaign name unavailable'
  }

  return {
    period: {
      days: range.days,
      startDate: range.startDate,
      endDate: range.endDate,
      timeZone: LUXOR_MARKETING_TIME_ZONE,
    },
    inquiryCount,
    sentRecipientCount,
    excludedUnlinkedSentCount,
    clickEventCount: eligibleEvents.filter((event) => event.event_type === 'click').length,
    inquiriesByDay: [...series.entries()].map(([date, count]) => ({ date, count })),
    sourceBreakdown,
    upcomingCampaignCount: upcomingCampaigns.length,
    upcomingCampaigns: upcomingCampaigns.slice(0, 5).map((campaign) => ({
      id: campaign.id,
      name: campaign.name?.trim() || 'Untitled campaign',
      scheduledFor: campaign.scheduled_for as string,
    })),
    trackedActivityCount: eligibleEvents.length,
    recentActivity: eligibleEvents.slice(0, activityLimit).map((event) => ({
      id: event.id,
      createdAt: event.created_at,
      eventType: event.event_type,
      campaignName: campaignName(event.campaign_id),
    })),
  }
}
