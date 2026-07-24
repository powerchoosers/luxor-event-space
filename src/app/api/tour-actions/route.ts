import { NextRequest, NextResponse } from 'next/server'
import {
  buildTourEmail,
  cancelQueuedTourEmailJobs,
  createLuxorEmailJob,
  createPublicToken,
  getTourResponseLinks,
  listLuxorEmailJobsForInquiry,
} from '@/lib/luxorEmailJobsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LuxorEmailJobKind, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'
import { createLuxorZohoCalendarEvent } from '@/lib/zohoMailServer'
import { buildAiTourConfirmationEmail, buildTourReminderEmail, TourEmailContext } from '@/lib/luxorTourEmailServer'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'

const TOUR_TIMEZONE = 'America/Chicago'
const TOUR_LOCATION = 'Luxor Event Space, 803 Castroville Rd #402, San Antonio, TX 78237'

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })

    return NextResponse.json({ jobs: await listLuxorEmailJobsForInquiry(inquiryId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load tour emails.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })

    const body = await request.json()
    const inquiryId = String(body.inquiryId || '')
    const action = String(body.action || '')

    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })

    const inquiry = await getLuxorInquiry(inquiryId)
    if (!inquiry) return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })

    if (action === 'attendance') {
      const attendance = String(body.attendance || 'pending') as LuxorTourAttendanceStatus
      const updates: Record<string, unknown> = { tour_attendance_status: attendance }
      if (attendance === 'attended') updates.status = 'tour_confirmed'
      if (attendance === 'no_show') updates.pipeline_stage = 'tour'

      const updated = await updateLuxorInquiry(inquiryId, updates)
      await createNote(inquiryId, `Tour attendance marked as ${attendance.replaceAll('_', ' ')}.`, 'status_change', 'Portal Owner')
      return NextResponse.json(updated)
    }

    if (action === 'schedule-tour') {
      if (!inquiry.email) return NextResponse.json({ error: 'Add an email address before scheduling the tour.' }, { status: 400 })

      const tourDate = String(body.tourDate || '').trim()
      const tourTime = String(body.tourTime || '').trim()
      const meetingType = String(body.meetingType || 'Private Venue Tour').trim().slice(0, 120)
      const clientFacingNotes = String(body.clientFacingNotes || '').trim().slice(0, 2_000)
      const durationMinutes = Math.min(Math.max(Number(body.durationMinutes) || 60, 30), 180)
      const startUtc = zonedDateTimeToUtc(tourDate, tourTime, TOUR_TIMEZONE)
      const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000)

      if (startUtc.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Choose a tour time in the future.' }, { status: 400 })
      }

      const token = inquiry.tour_response_token || createPublicToken()
      const links = getTourResponseLinks(token)
      const tourDateLabel = formatTourDate(startUtc)
      const tourTimeLabel = formatTourTime(startUtc)
      const emailContext: TourEmailContext = {
        inquiry,
        meetingType,
        clientFacingNotes,
        tourDateLabel,
        tourTimeLabel,
        durationMinutes,
        responseUrl: links.confirmUrl,
      }
      const confirmation = await buildAiTourConfirmationEmail(emailContext)

      const calendar = await createLuxorZohoCalendarEvent({
        attendeeEmail: inquiry.email,
        title: `${meetingType} · ${inquiry.full_name}`,
        description: [
          `Private appointment for ${inquiry.full_name}.`,
          `Event: ${inquiry.event_type || 'Private event'}`,
          inquiry.guest_count ? `Estimated guests: ${inquiry.guest_count}` : '',
          clientFacingNotes ? `Details: ${clientFacingNotes}` : '',
          `Confirm or reschedule: ${links.confirmUrl}`,
        ].filter(Boolean).join('\n'),
        location: TOUR_LOCATION,
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString(),
        timezone: TOUR_TIMEZONE,
        existingEventUid: typeof inquiry.metadata?.zohoCalendarEventUid === 'string'
          ? inquiry.metadata.zohoCalendarEventUid
          : null,
      })

      await cancelQueuedTourEmailJobs(inquiryId)
      const sharedMetadata = {
        meeting_type: meetingType,
        client_facing_notes: clientFacingNotes,
        tour_start_at: startUtc.toISOString(),
        tour_end_at: endUtc.toISOString(),
        timezone: TOUR_TIMEZONE,
        zoho_calendar_event_id: calendar.eventId,
        zoho_calendar_event_uid: calendar.eventUid,
        zoho_calendar_url: calendar.viewEventUrl,
        hero_image: confirmation.heroImage,
        requested_by: session.email,
      }

      const confirmationJob = await createLuxorEmailJob({
        inquiryId,
        jobType: 'tour_confirmation',
        recipientEmail: inquiry.email,
        subject: confirmation.subject,
        body: confirmation.body,
        metadata: { ...sharedMetadata, ai_generated: confirmation.aiGenerated, delivery: 'branded_confirmation' },
      })
      if (!confirmationJob) throw new Error('The calendar invite was created, but the confirmation email could not be saved.')

      const reminderJobs = []
      for (const reminder of [
        { hours: 24, label: 'tomorrow' as const },
        { hours: 2, label: 'soon' as const },
      ]) {
        const scheduledFor = new Date(startUtc.getTime() - reminder.hours * 60 * 60_000)
        if (scheduledFor.getTime() <= Date.now()) continue
        const email = buildTourReminderEmail(emailContext, reminder.label)
        const job = await createLuxorEmailJob({
          inquiryId,
          jobType: 'tour_reminder',
          recipientEmail: inquiry.email,
          subject: email.subject,
          body: email.body,
          scheduledFor: scheduledFor.toISOString(),
          metadata: { ...sharedMetadata, reminder_hours_before: reminder.hours },
        })
        if (job) reminderJobs.push(job)
      }

      const updated = await updateLuxorInquiry(inquiryId, {
        status: 'tour_confirmed',
        pipeline_stage: 'tour',
        preferred_tour_date: tourDate,
        preferred_tour_time: formatStoredTime(tourTime),
        tour_confirmed_at: new Date().toISOString(),
        tour_response_token: token,
        metadata: {
          ...inquiry.metadata,
          tourMeetingType: meetingType,
          tourClientFacingNotes: clientFacingNotes,
          tourDurationMinutes: durationMinutes,
          tourStartAt: startUtc.toISOString(),
          zohoCalendarEventId: calendar.eventId,
          zohoCalendarEventUid: calendar.eventUid,
          zohoCalendarUrl: calendar.viewEventUrl,
        },
      })

      if (updated) {
        try {
          await queueInquiryTextJobs(updated)
        } catch (automationError) {
          console.error('Tour scheduled, but its text confirmations could not be queued:', automationError)
        }
      }

      await createNote(
        inquiryId,
        `Tour scheduled for ${tourDateLabel} at ${tourTimeLabel}. Zoho calendar invite sent; branded confirmation and ${reminderJobs.length} automatic reminder${reminderJobs.length === 1 ? '' : 's'} queued for Supabase delivery.`,
        'email_log',
        session.email,
      )

      return NextResponse.json({ inquiry: updated, calendar, confirmationJob, reminderJobs }, { status: 201 })
    }

    if (action === 'send-email') {
      if (!inquiry.email) return NextResponse.json({ error: 'This lead does not have an email address.' }, { status: 400 })
      const jobType = String(body.jobType || 'tour_confirmation') as LuxorEmailJobKind
      const token = inquiry.tour_response_token || createPublicToken()
      const email = buildTourEmail(jobType, inquiry, token)
      const job = await createLuxorEmailJob({
        inquiryId,
        jobType,
        recipientEmail: inquiry.email,
        subject: email.subject,
        body: email.body,
        metadata: { manual: true, requestedBy: session.email },
      })
      const marker: Record<string, unknown> = { tour_response_token: token }
      if (jobType === 'tour_confirmation') marker.tour_confirmed_at = new Date().toISOString()
      if (jobType === 'tour_no_show_reschedule') marker.tour_no_show_email_sent_at = new Date().toISOString()
      await updateLuxorInquiry(inquiryId, marker)
      await createNote(inquiryId, `Queued ${jobType.replaceAll('_', ' ')} email to ${inquiry.email}.`, 'email_log', 'Portal Owner')
      return NextResponse.json(job, { status: 201 })
    }

    return NextResponse.json({ error: 'Unsupported tour action.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tour action failed.'
    const scopeError = message.includes('INVALID_OAUTHSCOPE') || message.includes('calendar lookup')
    return NextResponse.json({ error: message, reconnectRequired: scopeError }, { status: scopeError ? 403 : 500 })
  }
}

function zonedDateTimeToUtc(dateValue: string, timeValue: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new Error('Choose a valid tour date.')
  const time = parseTime(timeValue)
  if (!time) throw new Error('Choose a valid tour time.')
  const [year, month, day] = dateValue.split('-').map(Number)
  const wantedUtc = Date.UTC(year, month - 1, day, time.hours, time.minutes)
  let result = new Date(wantedUtc)

  for (let index = 0; index < 2; index += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(result)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const representedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute))
    result = new Date(result.getTime() + (wantedUtc - representedUtc))
  }
  return result
}

function parseTime(value: string) {
  const twentyFour = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFour) {
    const hours = Number(twentyFour[1])
    const minutes = Number(twentyFour[2])
    return hours <= 23 && minutes <= 59 ? { hours, minutes } : null
  }
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!twelveHour) return null
  let hours = Number(twelveHour[1]) % 12
  if (twelveHour[3].toUpperCase() === 'PM') hours += 12
  const minutes = Number(twelveHour[2])
  return minutes <= 59 ? { hours, minutes } : null
}

function formatTourDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TOUR_TIMEZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date)
}

function formatTourTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TOUR_TIMEZONE, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)
}

function formatStoredTime(value: string) {
  const parsed = parseTime(value)
  if (!parsed) return value
  const suffix = parsed.hours >= 12 ? 'PM' : 'AM'
  const hours = parsed.hours % 12 || 12
  return `${hours}:${String(parsed.minutes).padStart(2, '0')} ${suffix}`
}
