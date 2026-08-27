import 'server-only'

import ical, {
  ICalAttendeeRole,
  ICalAttendeeStatus,
  ICalAttendeeType,
  ICalCalendarMethod,
  ICalEventBusyStatus,
  ICalEventClass,
  ICalEventStatus,
  ICalEventTransparency,
} from 'ical-generator'
import nodemailer from 'nodemailer'

const LUXOR_CALENDAR_DOMAIN = 'luxoratlaspalmas.com'
const LUXOR_ORGANIZER_EMAIL = 'booking@luxoratlaspalmas.com'
const LUXOR_ORGANIZER_NAME = 'Luxor Event Space'
const LUXOR_TIMEZONE = 'America/Chicago'

export type LuxorCalendarInviteInput = {
  attendeeEmail: string
  attendeeName?: string
  title: string
  description: string
  location: string
  start: Date
  end: Date
  uid: string
  sequence?: number
}

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength)
}

function validateInvite(input: LuxorCalendarInviteInput) {
  const attendeeEmail = normalizedEmail(input.attendeeEmail)
  if (!attendeeEmail) throw new Error('Enter a valid recipient email address.')

  const title = cleanText(input.title, 180)
  const description = cleanText(input.description, 5_000)
  const location = cleanText(input.location, 500)
  const attendeeName = cleanText(input.attendeeName || attendeeEmail.split('@')[0], 120)
  const uid = cleanText(input.uid, 255)
  const sequence = Math.max(0, Math.trunc(input.sequence || 0))

  if (!title) throw new Error('Enter an invitation title.')
  if (!location) throw new Error('Enter an event location.')
  if (!/^[A-Za-z0-9._@-]{8,255}$/.test(uid) || !uid.endsWith(`@${LUXOR_CALENDAR_DOMAIN}`)) {
    throw new Error('The calendar event ID is invalid.')
  }
  if (Number.isNaN(input.start.getTime()) || Number.isNaN(input.end.getTime()) || input.end <= input.start) {
    throw new Error('Choose a valid event start and end time.')
  }

  return { attendeeEmail, attendeeName, title, description, location, uid, sequence }
}

export function buildLuxorCalendarInvite(input: LuxorCalendarInviteInput) {
  const validated = validateInvite(input)
  const calendar = ical({
    method: ICalCalendarMethod.REQUEST,
    prodId: { company: LUXOR_ORGANIZER_NAME, product: 'Luxor Portal Calendar', language: 'EN' },
    scale: 'GREGORIAN',
  })

  calendar.createEvent({
    id: validated.uid,
    start: input.start,
    end: input.end,
    stamp: new Date(),
    created: new Date(),
    lastModified: new Date(),
    summary: validated.title,
    description: validated.description,
    location: validated.location,
    organizer: { name: LUXOR_ORGANIZER_NAME, email: LUXOR_ORGANIZER_EMAIL },
    attendees: [{
      name: validated.attendeeName,
      email: validated.attendeeEmail,
      role: ICalAttendeeRole.REQ,
      status: ICalAttendeeStatus.NEEDSACTION,
      type: ICalAttendeeType.INDIVIDUAL,
      rsvp: true,
    }],
    sequence: validated.sequence,
    status: ICalEventStatus.CONFIRMED,
    class: ICalEventClass.PRIVATE,
    transparency: ICalEventTransparency.OPAQUE,
    busystatus: ICalEventBusyStatus.BUSY,
    url: 'https://www.luxoratlaspalmas.com/visit',
  })

  // RFC 5545 requires CRLF line endings. ical-generator also escapes values
  // and folds long content lines so Outlook and Gmail parse the same payload.
  return calendar.toString().replace(/\r?\n/g, '\r\n')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function invitationDateLabel(start: Date, end: Date) {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(start)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return `${date}, ${time.format(start)}–${time.format(end)}`
}

export async function sendLuxorCalendarInvite(input: LuxorCalendarInviteInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error('Resend is not configured. Add RESEND_API_KEY before sending a test invitation.')

  const validated = validateInvite(input)
  const calendarContent = buildLuxorCalendarInvite(input)
  const fromAddress = normalizedEmail(process.env.LUXOR_RESEND_FROM_EMAIL || LUXOR_ORGANIZER_EMAIL)
  if (!fromAddress) throw new Error('LUXOR_RESEND_FROM_EMAIL is not a valid email address.')

  const transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: { user: 'resend', pass: apiKey },
  })
  const dateLabel = invitationDateLabel(input.start, input.end)
  const safeTitle = escapeHtml(validated.title)
  const safeDate = escapeHtml(dateLabel)
  const safeLocation = escapeHtml(validated.location)
  const safeDescription = escapeHtml(validated.description).replace(/\r?\n/g, '<br />')

  const receipt = await transporter.sendMail({
    from: `${LUXOR_ORGANIZER_NAME} <${fromAddress}>`,
    to: validated.attendeeName
      ? `${validated.attendeeName} <${validated.attendeeEmail}>`
      : validated.attendeeEmail,
    replyTo: LUXOR_ORGANIZER_EMAIL,
    subject: validated.title,
    text: [validated.title, dateLabel, validated.location, validated.description, '', `Reply to ${LUXOR_ORGANIZER_EMAIL} with any questions.`].filter(Boolean).join('\n\n'),
    html: `
      <div style="margin:0;background:#f6f2eb;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#2f271f;">
        <div style="margin:0 auto;max-width:600px;border:1px solid #e0d3bd;background:#fff;padding:30px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;letter-spacing:.12em;color:#9a712e;text-transform:uppercase;">Luxor</div>
          <h1 style="margin:24px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:#2f271f;">${safeTitle}</h1>
          <p style="margin:0 0 6px;font-size:15px;line-height:1.6;"><strong>${safeDate}</strong></p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#6f624f;">${safeLocation}</p>
          ${safeDescription ? `<p style="margin:0;border-top:1px solid #eadfce;padding-top:20px;font-size:14px;line-height:1.7;color:#51463a;">${safeDescription}</p>` : ''}
          <p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#7d7164;">Use the calendar controls in this message to accept, decline, or add the appointment. Questions? Reply to booking@luxoratlaspalmas.com.</p>
        </div>
      </div>`,
    icalEvent: {
      filename: 'luxor-event-space-invitation.ics',
      method: 'REQUEST',
      content: calendarContent,
    },
  })

  return {
    messageId: receipt.messageId,
    accepted: receipt.accepted.map(String),
    rejected: receipt.rejected.map(String),
    calendarContent,
  }
}

export function luxorCalendarInviteConfig() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY?.trim()),
    fromAddress: normalizedEmail(process.env.LUXOR_RESEND_FROM_EMAIL || LUXOR_ORGANIZER_EMAIL) || LUXOR_ORGANIZER_EMAIL,
    organizerEmail: LUXOR_ORGANIZER_EMAIL,
    timezone: LUXOR_TIMEZONE,
  }
}

export function luxorZonedDateTimeToUtc(dateValue: string, timeValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error('Choose a valid event date.')
  const match = timeValue.match(/^(\d{2}):(\d{2})$/)
  if (!match) throw new Error('Choose a valid event time.')
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error('Choose a valid event time.')

  const [year, month, day] = dateValue.split('-').map(Number)
  const wantedUtc = Date.UTC(year, month - 1, day, hours, minutes)
  let result = new Date(wantedUtc)

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LUXOR_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(result)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute))
    result = new Date(result.getTime() + wantedUtc - representedUtc)
  }

  return result
}
