import 'server-only'

import { listSavedLuxorDailyPriorities } from './luxorDailyPrioritiesServer'
import { listAllLuxorInquiries } from './luxorInquiriesServer'
import { listLuxorBookings } from './luxorBookingsServer'
import { isLuxorNonRevenueTestInquiry } from './luxorInquiryTypes'
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

function addChicagoDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const OPEN_INQUIRY_STATUSES = new Set(['new', 'contacted', 'tour_requested', 'tour_confirmed', 'proposal_sent'])

export async function gatherLuxorSalesBriefingPipeline(briefingDateKey: string): Promise<LuxorSalesBriefingPipeline> {
  const [inquiries, bookings, dailyPriorities] = await Promise.all([
    listAllLuxorInquiries().catch(() => []),
    listLuxorBookings().catch(() => []),
    listSavedLuxorDailyPriorities(briefingDateKey),
  ])

  const businessLeads = inquiries.filter((lead) => !isLuxorNonRevenueTestInquiry(lead))
  const cutoff = Date.now() - 48 * 60 * 60 * 1000

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
    }))

  const openLeads = businessLeads.filter(
    (lead) => OPEN_INQUIRY_STATUSES.has(lead.status) && lead.status !== 'booked',
  )
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

  const toursToday = businessLeads
    .filter(
      (lead) =>
        lead.preferred_tour_date === briefingDateKey
        && !['attended', 'no_show', 'cancelled'].includes(lead.tour_attendance_status || ''),
    )
    .map((lead) => ({
      id: lead.id,
      name: lead.full_name || 'Guest',
      tourDate: lead.preferred_tour_date || briefingDateKey,
      tourTime: lead.preferred_tour_time || null,
      href: `/portal/leads/${encodeURIComponent(lead.id)}`,
    }))

  const windowEnd = addChicagoDays(briefingDateKey, 14)
  const upcomingTours = businessLeads
    .filter((lead) => {
      const date = lead.preferred_tour_date
      if (!date || date <= briefingDateKey || date > windowEnd) return false
      return !['attended', 'no_show', 'cancelled'].includes(lead.tour_attendance_status || '')
    })
    .sort((a, b) => (a.preferred_tour_date || '').localeCompare(b.preferred_tour_date || ''))
    .slice(0, 8)
    .map((lead) => ({
      id: lead.id,
      name: lead.full_name || 'Guest',
      tourDate: lead.preferred_tour_date || '',
      tourTime: lead.preferred_tour_time || null,
      href: `/portal/leads/${encodeURIComponent(lead.id)}`,
    }))

  const inquiryNames = new Map(businessLeads.map((lead) => [lead.id, lead.full_name || 'Client']))
  const awaitingDeposit = bookings
    .filter((booking) => {
      if (booking.status === 'cancelled' || booking.status === 'completed') return false
      if (booking.contract_status !== 'signed') return false
      const depositPaidAt = booking.metadata?.deposit_paid_at
      return !depositPaidAt
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
    toursToday,
    upcomingTours,
    awaitingDeposit,
    eventsNext14Days,
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
  if (!row) return null
  if (row.status === 'skipped' || row.status === 'draft') return null
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
  const coaching = coachingFromRow(row)
  const rendered = renderLuxorSalesBriefingEmail({
    siteOrigin,
    pipeline,
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