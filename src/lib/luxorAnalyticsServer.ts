import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { listLuxorInquiries } from './luxorInquiriesServer'
import { listLuxorBookingsWithPayments } from './luxorBookingsServer'

export type AnalyticsDatePreset = '7d' | '30d' | '90d' | 'this_month' | 'previous_month' | 'custom'

export type DateRange = {
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
  label: string
  comparisonLabel: string
}

export type MarketingSalesMetrics = {
  hasConnectedAnalytics: boolean
  // Primary KPI values (null indicates no tracking data connected)
  websiteVisitors: number | null
  tourPageVisits: number | null
  tourClicks: number | null
  toursBooked: number
  toursCompleted: number
  proposalsSent: number
  bookings: number
  revenue: number

  // Brochure Lead Generation Tracking
  brochureFormViews: number | null
  brochureSubmissions: number
  brochureConversionRate: number | null
  brochureSubmissionsDeltaPercent: number | null

  // Schedule a Visit Tracking
  visitPageViews: number | null
  visitSubmissions: number
  visitConversionRate: number | null
  visitSubmissionsDeltaPercent: number | null

  // Brochure Leads vs Schedule a Visit Leads Comparison
  leadFunnelComparison: {
    brochureLeads: number
    visitLeads: number
    ratio: number | null
  }

  // Deltas vs previous period
  toursBookedDeltaPercent: number | null
  websiteVisitorsDeltaPercent: number | null
  tourPageVisitsDeltaPercent: number | null
  tourClicksDeltaPercent: number | null
  toursCompletedDeltaPercent: number | null
  proposalsSentDeltaPercent: number | null
  bookingsDeltaPercent: number | null
  revenueDeltaPercent: number | null

  // Sales Funnel Stages
  funnel: {
    stage: string
    count: number | null
    conversionRateFromPrevious: number | null // percentage 0 - 100
    description?: string
  }[]

  // Traffic sources
  trafficSources: {
    source: string
    visitors: number | null
    tourPageVisits: number | null
    tourClicks: number | null
    toursBooked: number
    bookings: number
    revenue: number
  }[]

  // Website Performance
  websitePerformance: {
    pageName: string
    path: string
    views: number | null
    engagementRate: string | null
    ctaClicks: number | null
    exitRate: string | null
    isPriority?: boolean
  }[]

  // Funnel Health Diagnostics
  diagnostics: {
    id: string
    type: 'warning' | 'alert' | 'healthy' | 'neutral'
    stageTransition: string
    message: string
    recommendation: string
  }[]
}

export function getDateRangeFromPreset(preset: AnalyticsDatePreset, customStart?: string, customEnd?: string): DateRange {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  if (preset === '7d') {
    const end = new Date(now)
    const start = new Date(now)
    start.setDate(now.getDate() - 7)
    start.setHours(0, 0, 0, 0)

    const prevEnd = new Date(start)
    prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevEnd.getDate() - 7)
    prevStart.setHours(0, 0, 0, 0)

    return {
      start,
      end,
      previousStart: prevStart,
      previousEnd: prevEnd,
      label: 'Last 7 Days',
      comparisonLabel: 'vs previous 7 days',
    }
  }

  if (preset === '90d') {
    const end = new Date(now)
    const start = new Date(now)
    start.setDate(now.getDate() - 90)
    start.setHours(0, 0, 0, 0)

    const prevEnd = new Date(start)
    prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setDate(prevEnd.getDate() - 90)
    prevStart.setHours(0, 0, 0, 0)

    return {
      start,
      end,
      previousStart: prevStart,
      previousEnd: prevEnd,
      label: 'Last 90 Days',
      comparisonLabel: 'vs previous 90 days',
    }
  }

  if (preset === 'this_month') {
    const start = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0)
    const end = new Date(now)

    // Previous month up to same day-of-month or full previous month
    const prevStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0)
    const prevEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

    return {
      start,
      end,
      previousStart: prevStart,
      previousEnd: prevEnd,
      label: 'This Month',
      comparisonLabel: 'vs previous month',
    }
  }

  if (preset === 'previous_month') {
    const start = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0)
    const end = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)

    const prevStart = new Date(currentYear, currentMonth - 2, 1, 0, 0, 0, 0)
    const prevEnd = new Date(currentYear, currentMonth - 1, 0, 23, 59, 59, 999)

    return {
      start,
      end,
      previousStart: prevStart,
      previousEnd: prevEnd,
      label: 'Previous Month',
      comparisonLabel: 'vs month before',
    }
  }

  if (preset === 'custom' && customStart && customEnd) {
    const start = new Date(customStart + 'T00:00:00')
    const end = new Date(customEnd + 'T23:59:59.999')
    const diffMs = end.getTime() - start.getTime()

    const prevEnd = new Date(start.getTime() - 1)
    const prevStart = new Date(prevEnd.getTime() - diffMs)

    return {
      start,
      end,
      previousStart: prevStart,
      previousEnd: prevEnd,
      label: 'Custom Range',
      comparisonLabel: 'vs previous equivalent period',
    }
  }

  // Default: 30d
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(now.getDate() - 30)
  start.setHours(0, 0, 0, 0)

  const prevEnd = new Date(start)
  prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevEnd.getDate() - 30)
  prevStart.setHours(0, 0, 0, 0)

  return {
    start,
    end,
    previousStart: prevStart,
    previousEnd: prevEnd,
    label: 'Last 30 Days',
    comparisonLabel: 'vs previous 30 days',
  }
}

function calculateDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : 0
  }
  return Math.round(((current - previous) / previous) * 100)
}

type PublicEventRow = {
  id: string
  event_name: string
  session_id: string | null
  page_path: string | null
  source: string | null
  created_at: string
  metadata?: Record<string, unknown>
}

export async function fetchMarketingAndSalesMetrics(range: DateRange): Promise<MarketingSalesMetrics> {
  const startIso = range.start.toISOString()
  const endIso = range.end.toISOString()
  const prevStartIso = range.previousStart.toISOString()
  const prevEndIso = range.previousEnd.toISOString()

  // 1. Fetch First-Party Web Events
  const [currentEvents, prevEvents, inquiries, bookingsWithPayments] = await Promise.all([
    supabaseRest<PublicEventRow[]>(
      `luxor_public_events?select=id,event_name,session_id,page_path,source,created_at,metadata&created_at=gte.${encodeURIComponent(startIso)}&created_at=lte.${encodeURIComponent(endIso)}&limit=10000`,
    ).catch(() => []),
    supabaseRest<PublicEventRow[]>(
      `luxor_public_events?select=id,event_name,session_id,page_path,source,created_at,metadata&created_at=gte.${encodeURIComponent(prevStartIso)}&created_at=lte.${encodeURIComponent(prevEndIso)}&limit=10000`,
    ).catch(() => []),
    listLuxorInquiries(2000).catch(() => []),
    listLuxorBookingsWithPayments(2000).catch(() => []),
  ])

  // Analytics connected check: if no events have ever been recorded or table is completely empty
  const hasConnectedAnalytics = (currentEvents.length > 0 || prevEvents.length > 0)

  // Web events: current period
  const uniqueSessions = new Set(
    currentEvents
      .filter((e) => e.event_name === 'website_visit' || e.event_name === 'page_view')
      .map((e) => e.session_id || e.id),
  )
  const websiteVisitors = hasConnectedAnalytics ? uniqueSessions.size : null

  const tourPageViewsCount = currentEvents.filter(
    (e) =>
      e.event_name === 'tour_page_view' ||
      (e.event_name === 'page_view' && (e.page_path?.includes('/tour') || e.page_path?.includes('/visit'))),
  ).length
  const tourPageVisits = hasConnectedAnalytics ? tourPageViewsCount : null

  const tourClicksCount = currentEvents.filter((e) => e.event_name === 'tour_cta_click').length
  const tourClicks = hasConnectedAnalytics ? tourClicksCount : null

  // Web events: previous period
  const prevUniqueSessions = new Set(
    prevEvents
      .filter((e) => e.event_name === 'website_visit' || e.event_name === 'page_view')
      .map((e) => e.session_id || e.id),
  )
  const prevWebsiteVisitors = prevUniqueSessions.size
  const prevTourPageVisits = prevEvents.filter(
    (e) =>
      e.event_name === 'tour_page_view' ||
      (e.event_name === 'page_view' && (e.page_path?.includes('/tour') || e.page_path?.includes('/visit'))),
  ).length
  const prevTourClicks = prevEvents.filter((e) => e.event_name === 'tour_cta_click').length

  // 2. CRM Analytics: Inquiries & Tours
  const startTimeMs = range.start.getTime()
  const endTimeMs = range.end.getTime()
  const prevStartTimeMs = range.previousStart.getTime()
  const prevEndTimeMs = range.previousEnd.getTime()

  // Current period inquiries
  const currentInquiries = inquiries.filter((inq) => {
    const t = new Date(inq.created_at).getTime()
    return t >= startTimeMs && t <= endTimeMs
  })

  // Previous period inquiries
  const prevInquiries = inquiries.filter((inq) => {
    const t = new Date(inq.created_at).getTime()
    return t >= prevStartTimeMs && t <= prevEndTimeMs
  })

  // Tours Booked (Inquiries requesting a tour or confirmed tour)
  const isTourBooked = (inq: (typeof inquiries)[0]) =>
    Boolean(inq.preferred_tour_date || inq.status === 'tour_requested' || inq.status === 'tour_confirmed' || inq.status === 'booked')

  const toursBooked = currentInquiries.filter(isTourBooked).length
  const prevToursBooked = prevInquiries.filter(isTourBooked).length

  // Tours Completed (inquiries marked attended or completed)
  const isTourCompleted = (inq: (typeof inquiries)[0]) =>
    inq.tour_attendance_status === 'attended' || inq.metadata?.tour_attended === true

  const toursCompleted = currentInquiries.filter(isTourCompleted).length
  const prevToursCompleted = prevInquiries.filter(isTourCompleted).length

  // Proposals Sent
  const isProposalSent = (inq: (typeof inquiries)[0]) =>
    inq.status === 'proposal_sent' || inq.pipeline_stage === 'proposal' || inq.status === 'booked'

  const proposalsSent = currentInquiries.filter(isProposalSent).length
  const prevProposalsSent = prevInquiries.filter(isProposalSent).length

  // 3. Bookings & Revenue
  const currentBookings = bookingsWithPayments.filter((b) => {
    const bookedAt = b.booked_at || b.created_at
    if (!bookedAt) return false
    const t = new Date(bookedAt).getTime()
    return t >= startTimeMs && t <= endTimeMs && b.status !== 'cancelled'
  })

  const prevBookings = bookingsWithPayments.filter((b) => {
    const bookedAt = b.booked_at || b.created_at
    if (!bookedAt) return false
    const t = new Date(bookedAt).getTime()
    return t >= prevStartTimeMs && t <= prevEndTimeMs && b.status !== 'cancelled'
  })

  const bookingsCount = currentBookings.length
  const prevBookingsCount = prevBookings.length

  const currentRevenue = currentBookings.reduce((sum, b) => sum + Number(b.contract_total || b.paid_total || 0), 0)
  const prevRevenue = prevBookings.reduce((sum, b) => sum + Number(b.contract_total || b.paid_total || 0), 0)

  // 4. Brochure Lead Generation Tracking
  const brochureFormViewsCount = currentEvents.filter(
    (e) => e.event_name === 'brochure_form_view' || (e.event_name === 'page_view' && (e.page_path === '/' || e.page_path === ''))
  ).length
  const brochureFormViews = hasConnectedAnalytics ? brochureFormViewsCount : null

  const isBrochureInquiry = (inq: (typeof inquiries)[0]) =>
    inq.flow === 'brochure_lead' || inq.source === 'homepage_brochure' || inq.metadata?.flow === 'brochure_lead'

  const currentBrochureInquiries = currentInquiries.filter(isBrochureInquiry)
  const prevBrochureInquiries = prevInquiries.filter(isBrochureInquiry)
  const brochureSubmissions = Math.max(
    currentBrochureInquiries.length,
    currentEvents.filter((e) => e.event_name === 'brochure_submitted').length,
  )
  const prevBrochureSubmissions = Math.max(
    prevBrochureInquiries.length,
    prevEvents.filter((e) => e.event_name === 'brochure_submitted').length,
  )

  const brochureConversionRate = brochureFormViews && brochureFormViews > 0
    ? Math.round((brochureSubmissions / brochureFormViews) * 1000) / 10
    : websiteVisitors && websiteVisitors > 0
      ? Math.round((brochureSubmissions / websiteVisitors) * 1000) / 10
      : null

  const brochureSubmissionsDeltaPercent = calculateDeltaPercent(brochureSubmissions, prevBrochureSubmissions)

  // Schedule a Visit Tracking
  const visitPageViewsCount = currentEvents.filter(
    (e) =>
      e.event_name === 'visit_page_view' ||
      e.event_name === 'tour_page_view' ||
      (e.event_name === 'page_view' && (e.page_path?.includes('/visit') || e.page_path?.includes('/tour'))),
  ).length
  const visitPageViews = hasConnectedAnalytics ? visitPageViewsCount : null

  const isVisitInquiry = (inq: (typeof inquiries)[0]) =>
    Boolean(inq.preferred_tour_date || inq.flow === 'visit_booking' || inq.flow === 'tour_booking' || inq.status === 'tour_requested' || inq.status === 'tour_confirmed' || inq.status === 'booked')

  const currentVisitInquiries = currentInquiries.filter(isVisitInquiry)
  const prevVisitInquiries = prevInquiries.filter(isVisitInquiry)
  const visitSubmissions = Math.max(
    currentVisitInquiries.length,
    currentEvents.filter((e) => e.event_name === 'visit_booked' || e.event_name === 'tour_booked').length,
  )
  const prevVisitSubmissions = Math.max(
    prevVisitInquiries.length,
    prevEvents.filter((e) => e.event_name === 'visit_booked' || e.event_name === 'tour_booked').length,
  )

  const visitConversionRate = visitPageViews && visitPageViews > 0
    ? Math.round((visitSubmissions / visitPageViews) * 1000) / 10
    : websiteVisitors && websiteVisitors > 0
      ? Math.round((visitSubmissions / websiteVisitors) * 1000) / 10
      : null

  const visitSubmissionsDeltaPercent = calculateDeltaPercent(visitSubmissions, prevVisitSubmissions)

  // Comparison: Brochure Leads vs Schedule a Visit Leads
  const leadFunnelComparison = {
    brochureLeads: brochureSubmissions,
    visitLeads: visitSubmissions,
    ratio: visitSubmissions > 0 ? Math.round((brochureSubmissions / visitSubmissions) * 10) / 10 : null,
  }

  // 5. Deltas
  const toursBookedDeltaPercent = calculateDeltaPercent(toursBooked, prevToursBooked)
  const websiteVisitorsDeltaPercent = hasConnectedAnalytics ? calculateDeltaPercent(websiteVisitors || 0, prevWebsiteVisitors) : null
  const tourPageVisitsDeltaPercent = hasConnectedAnalytics ? calculateDeltaPercent(tourPageVisits || 0, prevTourPageVisits) : null
  const tourClicksDeltaPercent = hasConnectedAnalytics ? calculateDeltaPercent(tourClicks || 0, prevTourClicks) : null
  const toursCompletedDeltaPercent = calculateDeltaPercent(toursCompleted, prevToursCompleted)
  const proposalsSentDeltaPercent = calculateDeltaPercent(proposalsSent, prevProposalsSent)
  const bookingsDeltaPercent = calculateDeltaPercent(bookingsCount, prevBookingsCount)
  const revenueDeltaPercent = calculateDeltaPercent(currentRevenue, prevRevenue)

  // 5. Sales Funnel with step conversion rates
  // Order:
  // Website Visitors -> Tour Page Visits -> Tour Clicks -> Tours Booked -> Tours Completed -> Proposals Sent -> Bookings
  const calcRate = (currentVal: number | null, prevVal: number | null): number | null => {
    if (currentVal === null || prevVal === null || prevVal === 0) return null
    return Math.round((currentVal / prevVal) * 1000) / 10
  }

  const funnel = [
    {
      stage: 'Website Visitors',
      count: websiteVisitors,
      conversionRateFromPrevious: null,
      description: 'Unique visitors discovery pool',
    },
    {
      stage: 'Tour Page Visits',
      count: tourPageVisits,
      conversionRateFromPrevious: calcRate(tourPageVisits, websiteVisitors),
      description: 'Visitors considering an in-person tour',
    },
    {
      stage: 'Tour Clicks',
      count: tourClicks,
      conversionRateFromPrevious: calcRate(tourClicks, tourPageVisits),
      description: 'Intent to schedule a visit CTA',
    },
    {
      stage: 'Tours Booked',
      count: toursBooked,
      conversionRateFromPrevious: tourClicks !== null ? calcRate(toursBooked, tourClicks) : null,
      description: 'Scheduled appointments created',
    },
    {
      stage: 'Tours Completed',
      count: toursCompleted,
      conversionRateFromPrevious: calcRate(toursCompleted, toursBooked),
      description: 'Walked through venue in person',
    },
    {
      stage: 'Proposals Sent',
      count: proposalsSent,
      conversionRateFromPrevious: calcRate(proposalsSent, toursCompleted),
      description: 'Pricing & package quotes delivered',
    },
    {
      stage: 'Bookings',
      count: bookingsCount,
      conversionRateFromPrevious: calcRate(bookingsCount, proposalsSent),
      description: 'Signed agreements & confirmed venue events',
    },
  ]

  // 6. Traffic Sources
  const SOURCE_CATEGORIES = [
    'Google / Organic Search',
    'Instagram',
    'Facebook',
    'TikTok',
    'Meta Ads',
    'Direct',
    'Referral',
    'Other',
  ]

  function normalizeChannel(rawSource?: string | null, metadata?: Record<string, unknown>): string {
    const s = (rawSource || '').toLowerCase()
    const mChannel = (metadata?.channel as string || '').toLowerCase()

    if (mChannel.includes('meta ads') || s.includes('meta_ads') || s.includes('fb_ads') || s.includes('instagram_ads')) return 'Meta Ads'
    if (mChannel.includes('instagram') || s.includes('instagram')) return 'Instagram'
    if (mChannel.includes('facebook') || s.includes('facebook')) return 'Facebook'
    if (mChannel.includes('tiktok') || s.includes('tiktok')) return 'TikTok'
    if (mChannel.includes('google / organic') || s.includes('google') || s.includes('organic')) return 'Google / Organic Search'
    if (s.includes('direct') || (!s && !mChannel)) return 'Direct'
    if (mChannel.includes('referral') || s.includes('referral')) return 'Referral'
    return 'Other'
  }

  const trafficSources = SOURCE_CATEGORIES.map((category) => {
    // Filter web events matching this category
    const catEvents = currentEvents.filter((e) => normalizeChannel(e.source, e.metadata) === category)
    const catVisitors = hasConnectedAnalytics ? new Set(catEvents.map((e) => e.session_id || e.id)).size : null
    const catTourVisits = hasConnectedAnalytics
      ? catEvents.filter((e) => e.event_name === 'tour_page_view' || (e.event_name === 'page_view' && e.page_path?.includes('/tour'))).length
      : null
    const catTourClicks = hasConnectedAnalytics
      ? catEvents.filter((e) => e.event_name === 'tour_cta_click').length
      : null

    // Filter CRM inquiries matching this category
    const catInquiries = currentInquiries.filter((inq) => normalizeChannel(inq.source, inq.metadata) === category)
    const catToursBooked = catInquiries.filter(isTourBooked).length

    // Filter Bookings matching this category (via linked inquiry or booking source)
    const catBookings = currentBookings.filter((b) => {
      const linkedInquiry = inquiries.find((inq) => inq.id === b.inquiry_id)
      const bookingSource = linkedInquiry ? linkedInquiry.source : (b.metadata?.source as string)
      return normalizeChannel(bookingSource, linkedInquiry?.metadata) === category
    })
    const catBookingsCount = catBookings.length
    const catRevenue = catBookings.reduce((sum, b) => sum + Number(b.contract_total || b.paid_total || 0), 0)

    return {
      source: category,
      visitors: catVisitors,
      tourPageVisits: catTourVisits,
      tourClicks: catTourClicks,
      toursBooked: catToursBooked,
      bookings: catBookingsCount,
      revenue: catRevenue,
    }
  })

  // 7. Website Performance
  const TRACKED_PAGES = [
    { pageName: 'Schedule a Visit', path: '/visit', isPriority: true },
    { pageName: 'Homepage & Brochure Form', path: '/', isPriority: true },
    { pageName: 'Events', path: '/events', isPriority: false },
    { pageName: 'Gallery', path: '/gallery', isPriority: false },
    { pageName: 'Contact', path: '/contact', isPriority: false },
  ]

  const websitePerformance = TRACKED_PAGES.map((page) => {
    if (!hasConnectedAnalytics) {
      return {
        pageName: page.pageName,
        path: page.path,
        views: null,
        engagementRate: null,
        ctaClicks: null,
        exitRate: null,
        isPriority: page.isPriority,
      }
    }

    const pageEvents = currentEvents.filter((e) => {
      if (page.path === '/') return e.page_path === '/' || e.page_path === ''
      return e.page_path?.startsWith(page.path)
    })

    const views = pageEvents.filter((e) => e.event_name === 'page_view' || e.event_name === 'tour_page_view').length
    const ctaClicks = pageEvents.filter((e) => e.event_name === 'tour_cta_click' || e.event_name === 'cta_click').length
    const engagementRate = views > 0 ? `${Math.min(100, Math.round((ctaClicks / views) * 100))}%` : '—'
    const exitRate = views > 0 ? `${Math.max(10, Math.round(100 - (ctaClicks / views) * 100))}%` : '—'

    return {
      pageName: page.pageName,
      path: page.path,
      views,
      engagementRate,
      ctaClicks,
      exitRate,
      isPriority: page.isPriority,
    }
  })

  // 8. Funnel Health / Diagnostics
  const diagnostics: MarketingSalesMetrics['diagnostics'] = []

  if (websiteVisitors !== null && tourPageVisits !== null) {
    const webToTour = websiteVisitors > 0 ? (tourPageVisits / websiteVisitors) * 100 : 0
    if (webToTour < 15 && websiteVisitors >= 20) {
      diagnostics.push({
        id: 'web_to_tour_drop',
        type: 'warning',
        stageTransition: 'Website → Tour Page',
        message: 'Visitors are not progressing to the tour page.',
        recommendation: 'Evaluate homepage hero CTAs and navigation visibility for “Schedule a Visit” to guide visitors directly into scheduling.',
      })
    }
  }

  if (tourPageVisits !== null && tourClicks !== null) {
    const tourToClick = tourPageVisits > 0 ? (tourClicks / tourPageVisits) * 100 : 0
    if (tourToClick < 25 && tourPageVisits >= 10) {
      diagnostics.push({
        id: 'tour_to_click_drop',
        type: 'warning',
        stageTransition: 'Tour Page → Tour Click',
        message: 'Visitors are viewing the tour page but few are clicking the scheduling CTA.',
        recommendation: 'Consider highlighting available calendar slots earlier on the tour page and reducing copy friction before the appointment selector.',
      })
    }
  }

  if (tourClicks !== null && tourClicks > 0) {
    const clickToBook = (toursBooked / tourClicks) * 100
    if (clickToBook < 30 && tourClicks >= 5) {
      diagnostics.push({
        id: 'click_to_book_drop',
        type: 'alert',
        stageTransition: 'Tour Click → Tour Booked',
        message: 'People are showing scheduling intent but dropping before completing the booking process.',
        recommendation: 'Verify form length, guest count requirements, and ensure preferred dates display clear green-dot availability without confusion.',
      })
    }
  }

  if (toursBooked > 0) {
    const bookedToCompleted = (toursCompleted / toursBooked) * 100
    if (bookedToCompleted < 60 && toursBooked >= 3) {
      diagnostics.push({
        id: 'tour_completion_drop',
        type: 'warning',
        stageTransition: 'Tours Booked → Tours Completed',
        message: 'Review tour reminders and follow-up.',
        recommendation: 'Ensure SMS and email calendar reminders are actively firing 24 hours prior to tours to protect tour show-up rates.',
      })
    }
  }

  if (toursCompleted > 0) {
    const completedToBooking = (bookingsCount / toursCompleted) * 100
    if (completedToBooking < 30 && toursCompleted >= 3) {
      diagnostics.push({
        id: 'tour_to_booking_drop',
        type: 'alert',
        stageTransition: 'Tours Completed → Bookings',
        message: 'Review the sales experience, pricing, offer, follow-up, and proposal process.',
        recommendation: 'Inspect same-day proposal turnaround speed, payment plan clarity, and follow-up communication after clients leave their in-person walk-through.',
      })
    }
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      id: 'healthy_overview',
      type: 'healthy',
      stageTransition: 'Full Funnel Flow',
      message: 'Conversion indicators are steady across active stages.',
      recommendation: 'Continue monitoring inbound traffic quality and weekly visit booking consistency.',
    })
  }

  return {
    hasConnectedAnalytics,
    websiteVisitors,
    tourPageVisits,
    tourClicks,
    toursBooked,
    toursCompleted,
    proposalsSent,
    bookings: bookingsCount,
    revenue: currentRevenue,

    // Brochure Lead Generation Tracking
    brochureFormViews,
    brochureSubmissions,
    brochureConversionRate,
    brochureSubmissionsDeltaPercent,

    // Schedule a Visit Tracking
    visitPageViews,
    visitSubmissions,
    visitConversionRate,
    visitSubmissionsDeltaPercent,

    // Brochure Leads vs Schedule a Visit Leads Comparison
    leadFunnelComparison,

    toursBookedDeltaPercent,
    websiteVisitorsDeltaPercent,
    tourPageVisitsDeltaPercent,
    tourClicksDeltaPercent,
    toursCompletedDeltaPercent,
    proposalsSentDeltaPercent,
    bookingsDeltaPercent,
    revenueDeltaPercent,

    funnel,
    trafficSources,
    websitePerformance,
    diagnostics,
  }
}
