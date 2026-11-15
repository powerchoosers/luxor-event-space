import 'server-only'

import { listSavedLuxorDailyPriorities } from './luxorDailyPrioritiesServer'
import { listAllLuxorInquiries } from './luxorInquiriesServer'
import { listLuxorBookings, listAllPayments } from './luxorBookingsServer'
import { listInvoices } from './luxorInvoicesServer'
import { listAllTasks } from './luxorTasksServer'
import { isLuxorNonRevenueTestInquiry, type LuxorInquiry, type LuxorInvoice, type LuxorPayment, type LuxorTask } from './luxorInquiryTypes'
import { luxorDateKey, LUXOR_TOUR_TIMEZONE } from './luxorTourMetrics'
import { supabaseRest } from './supabaseRestServer'
import {
  type LuxorSalesBriefingCoaching,
  type LuxorSalesBriefingPipeline,
  renderLuxorSalesBriefingEmail,
} from './luxorSalesBriefingEmail'
import { getPublicLuxorPhoneNumber } from './luxorPhoneNumbersServer'
import {
  evaluateLuxorSalesBriefingSendGate,
  luxorSalesBriefingRecipient,
  luxorSalesBriefingSendEnabled,
  readLuxorChicagoClock,
} from './luxorSalesBriefingSendGate'
import { bookingAwaitingInitialPayment, formatLuxorLeadWaitingLabel } from './luxorSalesBriefingPipelineModel'

export { bookingAwaitingInitialPayment, formatLuxorLeadWaitingLabel } from './luxorSalesBriefingPipelineModel'

export type LuxorSalesBriefingRow = {
  id: string
  briefing_date: string
  headline: string | null
  coaching_markdown: string | null
  focus_items: Array<{ title: string; detail: string }>
  author: string
  status: string
  sent_at: string | null
  resend_message_id: string | null
  error: string | null
  created_at: string
  updated_at: string
}

type LuxorTourVisitRow = {
  id: string
  inquiry_id: string
  tour_date: string
  attendance_status: string
  calendar_event_id: string | null
}

type LuxorCalendarEventBrief = {
  id: string
  inquiry_id: string
  status: 'confirmed' | 'cancelled'
  state: { startUtc?: string; endUtc?: string } | null
}

const OPEN_INQUIRY_STATUSES = new Set(['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent'])
const ACTIVE_TOUR_VISIT_STATUSES = new Set(['pending', 'rescheduled'])

function addChicagoDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function formatTourTimeFromUtc(startUtc: string | undefined) {
  if (!startUtc) return null
  const parsed = new Date(startUtc)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function tourStatusLabel(inquiry: LuxorInquiry) {
  return inquiry.status === 'tour_confirmed' ? 'Confirmed' : 'Requested'
}

function isActiveSalesLead(inquiry: LuxorInquiry) {
  return inquiry.status !== 'closed_lost' && inquiry.status !== 'booked'
}

function isTourLeadStatus(inquiry: LuxorInquiry) {
  return inquiry.status === 'tour_requested' || inquiry.status === 'tour_confirmed'
}

async function listLuxorTourVisitsBetween(startDate: string, endDate: string) {
  return supabaseRest<LuxorTourVisitRow[]>(
    `luxor_tour_visits?select=id,inquiry_id,tour_date,attendance_status,calendar_event_id&tour_date=gte.${encodeURIComponent(startDate)}&tour_date=lte.${encodeURIComponent(endDate)}&order=tour_date.asc`,
  ).catch(() => [])
}

async function listLuxorCalendarEventsById(ids: string[]) {
  if (!ids.length) return [] as LuxorCalendarEventBrief[]
  const unique = [...new Set(ids)]
  const batches: LuxorCalendarEventBrief[] = []
  for (let index = 0; index < unique.length; index += 80) {
    const slice = unique.slice(index, index + 80).map(encodeURIComponent).join(',')
    const page = await supabaseRest<LuxorCalendarEventBrief[]>(
      `luxor_calendar_events?select=id,inquiry_id,status,state&id=in.(${slice})`,
    ).catch(() => [])
    batches.push(...page)
  }
  return batches
}

function mapTourVisitLines(input: {
  visits: LuxorTourVisitRow[]
  inquiryById: Map<string, LuxorInquiry>
  calendarById: Map<string, LuxorCalendarEventBrief>
  briefingDateKey: string
  mode: 'today' | 'upcoming' | 'no_show'
  windowEnd?: string
}) {
  const lines = []
  for (const visit of input.visits) {
    const inquiry = input.inquiryById.get(visit.inquiry_id)
    if (!inquiry || !isActiveSalesLead(inquiry)) continue
    const calendar = visit.calendar_event_id ? input.calendarById.get(visit.calendar_event_id) : null
    if (input.mode === 'no_show') {
      if (visit.attendance_status !== 'no_show') continue
    } else {
      if (!isTourLeadStatus(inquiry)) continue
      if (!ACTIVE_TOUR_VISIT_STATUSES.has(visit.attendance_status)) continue
      if (calendar && calendar.status !== 'confirmed') continue
      if (input.mode === 'today' && visit.tour_date !== input.briefingDateKey) continue
      if (
        input.mode === 'upcoming'
        && (visit.tour_date <= input.briefingDateKey || (input.windowEnd && visit.tour_date > input.windowEnd))
      ) {
        continue
      }
    }
    lines.push({
      id: visit.id,
      name: inquiry.full_name || 'Guest',
      tourDate: visit.tour_date,
      tourTime: formatTourTimeFromUtc(calendar?.state?.startUtc),
      tourStatus: input.mode === 'no_show' ? 'No-show' : tourStatusLabel(inquiry),
      href: `/portal/leads/${encodeURIComponent(inquiry.id)}`,
    })
  }
  return lines.sort((a, b) => a.tourDate.localeCompare(b.tourDate)).slice(0, input.mode === 'upcoming' ? 10 : 8)
}

function businessTask(task: LuxorTask, testInquiryIds: Set<string>) {
  return task.status === 'pending' && (!task.inquiry_id || !testInquiryIds.has(task.inquiry_id))
}

export async function gatherLuxorSalesBriefingPipeline(briefingDateKey: string): Promise<LuxorSalesBriefingPipeline> {
  const windowEnd = addChicagoDays(briefingDateKey, 14)
  const lookbackStart = addChicagoDays(briefingDateKey, -30)
  const now = Date.now()

  const [inquiries, bookings, dailyPriorities, tasks, invoices, payments, tourVisits, noShowVisits] = await Promise.all([
    listAllLuxorInquiries().catch(() => []),
    listLuxorBookings().catch(() => []),
    listSavedLuxorDailyPriorities(briefingDateKey),
    listAllTasks().catch(() => []),
    listInvoices(3000).catch(() => []),
    listAllPayments().catch(() => []),
    listLuxorTourVisitsBetween(briefingDateKey, windowEnd),
    listLuxorTourVisitsBetween(lookbackStart, briefingDateKey),
  ])

  const businessLeads = inquiries.filter((lead) => !isLuxorNonRevenueTestInquiry(lead))
  const testInquiryIds = new Set(inquiries.filter(isLuxorNonRevenueTestInquiry).map((lead) => lead.id))
  const inquiryById = new Map(businessLeads.map((lead) => [lead.id, lead]))
  const cutoff = now - 48 * 60 * 60 * 1000

  const newInquiries = businessLeads
    .filter((lead) => lead.status === 'new' || (lead.created_at && Date.parse(lead.created_at) >= cutoff))
    .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
    .slice(0, 8)
    .map((lead) => ({
      id: lead.id,
      name: lead.full_name || 'Lead',
      eventType: lead.event_type || 'Event',
      status: lead.status,
      href: `/portal/leads/${encodeURIComponent(lead.id)}`,
      waitingLabel: formatLuxorLeadWaitingLabel(lead.created_at, now),
    }))

  const openLeads = businessLeads.filter((lead) => OPEN_INQUIRY_STATUSES.has(lead.status))
  const openInquiryHighlights = openLeads
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || '') - Date.parse(a.updated_at || a.created_at || ''))
    .slice(0, 6)
    .map((lead) => ({
      id: lead.id,
      name: lead.full_name || 'Lead',
      eventType: lead.event_type || 'Event',
      status: lead.status,
      href: `/portal/leads/${encodeURIComponent(lead.id)}`,
    }))

  const calendarById = new Map(
    (await listLuxorCalendarEventsById(
      [...tourVisits, ...noShowVisits].map((visit) => visit.calendar_event_id).filter((id): id is string => Boolean(id)),
    )).map((event) => [event.id, event]),
  )

  const toursToday = mapTourVisitLines({
    visits: tourVisits,
    inquiryById,
    calendarById,
    briefingDateKey,
    mode: 'today',
  })
  const upcomingTours = mapTourVisitLines({
    visits: tourVisits,
    inquiryById,
    calendarById,
    briefingDateKey,
    mode: 'upcoming',
    windowEnd,
  })
  const tourNoShowsToRebook = mapTourVisitLines({
    visits: noShowVisits,
    inquiryById,
    calendarById,
    briefingDateKey,
    mode: 'no_show',
  })

  const depositByBookingId = new Map(
    invoices
      .filter((invoice) => invoice.invoice_kind === 'deposit' && invoice.booking_id)
      .map((invoice) => [invoice.booking_id as string, invoice]),
  )

  const inquiryNames = new Map(businessLeads.map((lead) => [lead.id, lead.full_name || 'Client']))
  const awaitingBookingPayment = bookings
    .filter((booking) => {
      if (booking.status === 'cancelled' || booking.status === 'completed') return false
      if (booking.contract_status !== 'signed') return false
      return bookingAwaitingInitialPayment(booking.id, depositByBookingId, payments)
    })
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))
    .slice(0, 8)
    .map((booking) => ({
      id: booking.id,
      clientName: (booking.inquiry_id && inquiryNames.get(booking.inquiry_id)) || booking.client_name || 'Client',
      eventDate: booking.event_date || 'Unscheduled',
      href: booking.inquiry_id
        ? `/portal/leads/${encodeURIComponent(booking.inquiry_id)}?tab=agreement`
        : '/portal/bookings',
    }))

  const leadsToCallToday = tasks
    .filter(
      (task) =>
        businessTask(task, testInquiryIds)
        && task.due_date === briefingDateKey
        && (task.task_type === 'call' || /phone call|call /i.test(task.title)),
    )
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8)
    .map((task) => {
      const inquiry = task.inquiry_id ? inquiryById.get(task.inquiry_id) : null
      return {
        id: task.id,
        name: inquiry?.full_name || task.title,
        detail: task.title,
        href: task.inquiry_id ? `/portal/leads/${encodeURIComponent(task.inquiry_id)}` : null,
      }
    })

  const overdueFollowUps = tasks
    .filter(
      (task) =>
        businessTask(task, testInquiryIds)
        && task.due_date
        && task.due_date < briefingDateKey
        && (task.task_type === 'call' || task.task_type === 'email' || /follow-up|phone call/i.test(task.title)),
    )
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
    .slice(0, 6)
    .map((task) => {
      const inquiry = task.inquiry_id ? inquiryById.get(task.inquiry_id) : null
      return {
        id: task.id,
        name: inquiry?.full_name || task.title,
        detail: `Due ${task.due_date}`,
        href: task.inquiry_id ? `/portal/leads/${encodeURIComponent(task.inquiry_id)}` : null,
      }
    })

  const activeBookings = bookings.filter(
    (booking) =>
      booking.status !== 'cancelled'
      && booking.status !== 'completed'
      && booking.event_date
      && booking.event_date >= briefingDateKey
      && booking.event_date <= windowEnd,
  )
  const eventsNext14Days = activeBookings
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))
    .slice(0, 10)
    .map((booking) => ({
      id: booking.id,
      clientName: (booking.inquiry_id && inquiryNames.get(booking.inquiry_id)) || booking.client_name || 'Client',
      eventDate: booking.event_date || '',
      eventType: booking.event_type || 'Event',
      href: booking.inquiry_id
        ? `/portal/leads/${encodeURIComponent(booking.inquiry_id)}`
        : '/portal/bookings',
    }))

  return {
    briefingDateKey,
    newInquiries,
    openInquiriesCount: openLeads.length,
    openInquiryHighlights,
    leadsToCallToday,
    toursToday,
    upcomingTours,
    awaitingBookingPayment,
    eventsNext14Days,
    overdueFollowUps,
    tourNoShowsToRebook,
    dailyPriorities,
  }
}

export async function getLuxorSalesBriefingRow(briefingDateKey: string) {
  const rows = await supabaseRest<LuxorSalesBriefingRow[]>(
    `luxor_sales_briefings?briefing_date=eq.${encodeURIComponent(briefingDateKey)}&limit=1`,
  )
  return rows[0] ?? null
}

function coachingFromRow(row: LuxorSalesBriefingRow | null): LuxorSalesBriefingCoaching | null {
  if (!row || row.status !== 'ready') return null
  return {
    headline: row.headline,
    coachingMarkdown: row.coaching_markdown,
    focusItems: Array.isArray(row.focus_items) ? row.focus_items : [],
  }
}

export async function buildLuxorSalesBriefingDelivery(now = new Date()) {
  const clock = readLuxorChicagoClock(now)
  const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  const [pipeline, row, senderPhone] = await Promise.all([
    gatherLuxorSalesBriefingPipeline(clock.dateKey),
    getLuxorSalesBriefingRow(clock.dateKey),
    getPublicLuxorPhoneNumber().catch(() => null),
  ])
  const marcusBriefingReady = row?.status === 'ready'
  const coaching = coachingFromRow(row)
  const rendered = renderLuxorSalesBriefingEmail({
    siteOrigin,
    pipeline,
    marcusBriefingReady,
    coaching,
    senderPhone,
  })
  const gate = evaluateLuxorSalesBriefingSendGate({
    sendEnabled: luxorSalesBriefingSendEnabled(),
    recipientConfigured: Boolean(luxorSalesBriefingRecipient()),
    chicagoHour: clock.hour,
    chicagoWeekdayShort: clock.weekdayShort,
    alreadySent: Boolean(row?.sent_at),
  })
  return {
    clock,
    pipeline,
    row,
    marcusBriefingReady,
    coaching,
    rendered,
    gate,
    recipient: luxorSalesBriefingRecipient(),
  }
}

export async function recordLuxorSalesBriefingSend(input: {
  briefingDateKey: string
  resendMessageId: string
  existingRow?: LuxorSalesBriefingRow | null
}) {
  const payload = {
    briefing_date: input.briefingDateKey,
    status: 'sent',
    sent_at: new Date().toISOString(),
    resend_message_id: input.resendMessageId,
    error: null,
  }
  if (input.existingRow?.id) {
    await supabaseRest(`luxor_sales_briefings?id=eq.${encodeURIComponent(input.existingRow.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return
  }
  await supabaseRest('luxor_sales_briefings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

export async function recordLuxorSalesBriefingError(input: {
  briefingDateKey: string
  error: string
  existingRow?: LuxorSalesBriefingRow | null
}) {
  const payload = {
    briefing_date: input.briefingDateKey,
    status: input.existingRow?.status === 'sent' ? 'sent' : 'ready',
    error: input.error,
  }
  if (input.existingRow?.id) {
    await supabaseRest(`luxor_sales_briefings?id=eq.${encodeURIComponent(input.existingRow.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    return
  }
  await supabaseRest('luxor_sales_briefings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
}

export function luxorSalesBriefingChicagoDateLabel(now = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE,
    dateStyle: 'long',
  }).format(now)
}

export function luxorSalesBriefingDateKey(now = new Date()) {
  return luxorDateKey(now)
}