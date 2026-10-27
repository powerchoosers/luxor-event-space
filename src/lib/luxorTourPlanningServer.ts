import 'server-only'

import type { LuxorInquiry } from './luxorInquiryTypes'
import { buildAiTourConfirmationEmail, buildTourReminderEmail, type TourEmailContext } from './luxorTourEmailServer'

export const LUXOR_TOUR_TIMEZONE = 'America/Chicago'
export const LUXOR_TOUR_LOCATION = 'Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237'

export type LuxorTourMessageTemplates = {
  confirmation: Awaited<ReturnType<typeof buildAiTourConfirmationEmail>>
  reminder_24: ReturnType<typeof buildTourReminderEmail>
  reminder_2: ReturnType<typeof buildTourReminderEmail>
}

export type LuxorTourPlan = {
  startUtc: Date
  endUtc: Date
  tourDateLabel: string
  tourTimeLabel: string
  emailContext: TourEmailContext
  templates: LuxorTourMessageTemplates
  state: {
    title: string
    description: string
    location: string
    startUtc: string
    endUtc: string
    attendeeEmails: string[]
  }
  tour: { meetingType: string; clientFacingNotes: string; responseToken: string; assignees: string[] }
}

export function zonedTourDateTimeToUtc(dateValue: string, timeValue: string, timeZone = LUXOR_TOUR_TIMEZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error('Choose a valid tour date.')
  const time = parseTourTime(timeValue)
  if (!time) throw new Error('Choose a specific tour time.')
  const [year, month, day] = dateValue.split('-').map(Number)
  const wantedUtc = Date.UTC(year, month - 1, day, time.hours, time.minutes)
  let result = new Date(wantedUtc)

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(result)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute))
    result = new Date(result.getTime() + (wantedUtc - representedUtc))
  }
  return result
}

export async function buildLuxorTourPlan(input: {
  inquiry: LuxorInquiry
  date: string
  time: string
  responseToken: string
  responseUrl: string
  cancelUrl?: string
  attendeeEmails?: string[]
  location?: string
  meetingType?: string
  clientFacingNotes?: string
  durationMinutes?: number
  contactPhone?: string | null
  assignees?: string[]
}) : Promise<LuxorTourPlan> {
  if (!input.inquiry.email) throw new Error('An email address is required to prepare a tour notice.')
  const startUtc = zonedTourDateTimeToUtc(input.date, input.time)
  if (startUtc.getTime() <= Date.now()) throw new Error('Choose a tour time in the future.')
  const durationMinutes = Math.min(Math.max(Number(input.durationMinutes) || 30, 30), 180)
  const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000)
  const meetingType = input.meetingType || 'Private Venue Tour'
  const clientFacingNotes = input.clientFacingNotes || ''
  const tourDateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(startUtc)
  const tourTimeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TOUR_TIMEZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(startUtc)
  const emailContext: TourEmailContext = {
    inquiry: input.inquiry, meetingType, clientFacingNotes, tourDateLabel, tourTimeLabel, durationMinutes,
    responseUrl: input.responseUrl, cancelUrl: input.cancelUrl, contactPhone: input.contactPhone,
  }
  const templates = {
    confirmation: await buildAiTourConfirmationEmail(emailContext),
    reminder_24: buildTourReminderEmail(emailContext, 'tomorrow'),
    reminder_2: buildTourReminderEmail(emailContext, 'soon'),
  }
  const attendeeEmails = Array.from(new Set((input.attendeeEmails || [input.inquiry.email])
    .map((email) => email.trim().toLowerCase()).filter(Boolean)))
  const title = `${meetingType} · ${input.inquiry.full_name}`
  const state = {
    title,
    description: [
      `Private appointment for ${input.inquiry.full_name}.`,
      `Event: ${input.inquiry.event_type || 'Private event'}`,
      input.inquiry.guest_count ? `Expected guests: ${input.inquiry.guest_count}` : '',
      clientFacingNotes ? `Details: ${clientFacingNotes}` : '',
      `Confirm or reschedule: ${input.responseUrl}`,
    ].filter(Boolean).join('\n'),
    location: input.location || LUXOR_TOUR_LOCATION,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    attendeeEmails,
  }
  return {
    startUtc, endUtc, tourDateLabel, tourTimeLabel, emailContext, templates, state,
    tour: { meetingType, clientFacingNotes, responseToken: input.responseToken, assignees: input.assignees || [] },
  }
}

function parseTourTime(value: string) {
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  const twentyFour = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twelveHour) {
    let hours = Number(twelveHour[1]) % 12
    if (twelveHour[3].toUpperCase() === 'PM') hours += 12
    const minutes = Number(twelveHour[2])
    return hours <= 23 && minutes <= 59 ? { hours, minutes } : null
  }
  if (twentyFour) {
    const hours = Number(twentyFour[1])
    const minutes = Number(twentyFour[2])
    return hours <= 23 && minutes <= 59 ? { hours, minutes } : null
  }
  return null
}
