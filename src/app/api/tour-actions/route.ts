import { NextRequest, NextResponse } from 'next/server'
import {
  buildTourEmail,
  cancelQueuedTourEmailJobs,
  createLuxorEmailJob,
  createPublicToken,
  getTourResponseLinks,
  listLuxorEmailJobsForInquiry,
  assertEmailHasNoUnresolvedPlaceholders,
} from '@/lib/luxorEmailJobsServer'
import { getLuxorInquiry, updateLuxorInquiry } from '@/lib/luxorInquiriesServer'
import { getLuxorLeadEventForInquiry, listLuxorLeadEventsByInquiry, updateLuxorLeadEvent } from '@/lib/luxorLeadEventsServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { LuxorEmailJobKind, LuxorInquiryStatus, LuxorPipelineStage, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'
import { buildAiTourConfirmationEmail, buildTourReminderEmail, TourEmailContext } from '@/lib/luxorTourEmailServer'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'
import { cancelLuxorTourForInquiry } from '@/lib/luxorTourCancellationServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorCalendarEvent, getLuxorCalendarStatus } from '@/lib/luxorCalendarServer'
import { saveLuxorTourSchedule } from '@/lib/luxorTourScheduleServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'

const TOUR_TIMEZONE = 'America/Chicago'
const TOUR_LOCATION = 'Luxor at Las Palmas Events, 803 Castroville Rd #402, San Antonio, TX 78237'
const PRE_PROPOSAL_STATUSES = new Set<LuxorInquiryStatus>(['new', 'contacted', 'tour_requested', 'tour_confirmed'])
const PRE_PROPOSAL_STAGES = new Set<LuxorPipelineStage | null | undefined>([null, undefined, 'inquiry', 'tour'])

function canAdvanceAttendedTour(status: string | null | undefined, pipelineStage: string | null | undefined) {
  return PRE_PROPOSAL_STATUSES.has(status as LuxorInquiryStatus) && PRE_PROPOSAL_STAGES.has(pipelineStage as LuxorPipelineStage | null | undefined)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

    const inquiryId = request.nextUrl.searchParams.get('inquiryId') || ''
    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })

    const [jobs, calendar] = await Promise.all([listLuxorEmailJobsForInquiry(inquiryId), getLuxorCalendarStatus(inquiryId)])
    return NextResponse.json({ jobs, calendar })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load tour emails.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLuxorPortalSession()
    if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })

    const body = await request.json()
    const inquiryId = String(body.inquiryId || '')
    const action = String(body.action || '')
    const leadEventId = body.leadEventId ? String(body.leadEventId) : null

    if (!inquiryId) return NextResponse.json({ error: 'inquiryId is required.' }, { status: 400 })

    const inquiry = await getLuxorInquiry(inquiryId)
    if (!inquiry) return NextResponse.json({ error: 'Inquiry not found.' }, { status: 404 })
    if (inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This opportunity is closed lost. Reopen it before scheduling or changing a tour.' }, { status: 409 })
    }

    let selectedLeadEvent = null
    if (leadEventId) {
      selectedLeadEvent = await getLuxorLeadEventForInquiry(leadEventId, inquiryId)
      if (!selectedLeadEvent) return NextResponse.json({ error: 'The selected event does not belong to this lead.' }, { status: 400 })
    } else if (action === 'attendance' && body.attendance === 'attended') {
      const leadEvents = await listLuxorLeadEventsByInquiry(inquiryId)
      const primaryEvents = leadEvents.filter((event) => event.is_primary)
      selectedLeadEvent = primaryEvents.length === 1 ? primaryEvents[0] : null
    }

    if (action === 'cancel-tour' || (action === 'attendance' && body.attendance === 'cancelled')) {
      if (['attended', 'no_show', 'cancelled'].includes(inquiry.tour_attendance_status || '')) {
        return NextResponse.json({ error: 'Only a pending or upcoming tour can be cancelled.' }, { status: 409 })
      }
      if (!inquiry.preferred_tour_date && typeof inquiry.metadata?.zohoCalendarEventUid !== 'string' && typeof inquiry.metadata?.calendarEventUid !== 'string') {
        return NextResponse.json({ error: 'There is no scheduled tour to cancel.' }, { status: 409 })
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
      const cancellation = await cancelLuxorTourForInquiry({
        inquiry,
        reason,
        requestedBy: session.email,
      })
      if (!cancellation.ok) {
        throw new Error(cancellation.errors.join(' '))
      }

      const updated = await updateLuxorInquiry(inquiryId, {
        tour_attendance_status: 'cancelled',
        metadata: {
          ...inquiry.metadata,
          ...cancellation.metadataPatch,
        },
      })
      await createNote(
        inquiryId,
        `Tour cancelled${reason ? `: ${reason}` : '.'} Queued tour email and text reminders were cancelled${cancellation.slotReleased ? '; the public tour time was released' : ''}${cancellation.calendar.status === 'cancelled' ? '; the Zoho calendar invite was cancelled' : cancellation.calendar.status === 'needs_reconnect' ? '; the Zoho calendar invite needs a reconnect to cancel' : ''}.`,
        'status_change',
        session.email,
      )

      return NextResponse.json({ inquiry: updated, cancellation })
    }

    if (action === 'attendance') {
      const attendance = String(body.attendance || 'pending') as LuxorTourAttendanceStatus
      if (!['pending', 'attended', 'no_show', 'rescheduled', 'cancelled'].includes(attendance)) {
        return NextResponse.json({ error: 'Unsupported attendance status.' }, { status: 400 })
      }
      const updates: Record<string, unknown> = { tour_attendance_status: attendance }
      if (attendance === 'attended' && canAdvanceAttendedTour(inquiry.status, inquiry.pipeline_stage)) {
        updates.status = 'tour_confirmed'
        updates.pipeline_stage = 'proposal'
      }
      if (attendance === 'no_show' && canAdvanceAttendedTour(inquiry.status, inquiry.pipeline_stage)) updates.pipeline_stage = 'tour'
      if (attendance === 'rescheduled' && PRE_PROPOSAL_STATUSES.has(inquiry.status)) updates.status = 'tour_requested'

      const updated = await updateLuxorInquiry(inquiryId, updates)
      let updatedLeadEvent = null
      if (attendance === 'attended' && selectedLeadEvent && canAdvanceAttendedTour(selectedLeadEvent.status, selectedLeadEvent.pipeline_stage)) {
        updatedLeadEvent = await updateLuxorLeadEvent(selectedLeadEvent.id, {
          status: 'tour_confirmed',
          pipeline_stage: 'proposal',
        })
      }
      if (attendance === 'attended' || attendance === 'rescheduled' || attendance === 'cancelled') {
        await cancelQueuedTourEmailJobs(inquiryId)
      }
      let noShowJob = null
      if (attendance === 'no_show' && inquiry.email) {
        const existingJobs = await listLuxorEmailJobsForInquiry(inquiryId)
        const alreadyQueued = existingJobs.some((job) => job.job_type === 'tour_no_show_reschedule' && job.status === 'queued')
        if (!alreadyQueued) {
          const token = inquiry.tour_response_token || createPublicToken()
          const email = buildTourEmail('tour_no_show_reschedule', inquiry, token)
          noShowJob = await createLuxorEmailJob({
            inquiryId,
            jobType: 'tour_no_show_reschedule',
            recipientEmail: inquiry.email,
            subject: email.subject,
            body: email.body,
            scheduledFor: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            metadata: { attendance_occurrence: inquiry.tour_confirmed_at || inquiry.preferred_tour_date || new Date().toISOString(), requestedBy: session.email },
          })
          if (noShowJob && !inquiry.tour_response_token) await updateLuxorInquiry(inquiryId, { tour_response_token: token })
        }
      }
      await createNote(inquiryId, `Tour attendance marked as ${attendance.replaceAll('_', ' ')}.`, 'status_change', 'Portal Owner')
      return NextResponse.json({ inquiry: updated, leadEvent: updatedLeadEvent, noShowJob })
    }

    if (action === 'schedule-tour') {
      if (!inquiry.email) return NextResponse.json({ error: 'Add an email address before scheduling the tour.' }, { status: 400 })

      const tourDate = String(body.tourDate || '').trim()
      const tourTime = String(body.tourTime || '').trim()
      const meetingType = String(body.meetingType || 'Private Venue Tour').trim().slice(0, 120)
      const clientFacingNotes = String(body.clientFacingNotes || '').trim().slice(0, 2_000)
      const tourAssignees = Array.isArray(body.tourAssignees)
        ? body.tourAssignees.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 12)
        : []
      const durationMinutes = Math.min(Math.max(Number(body.durationMinutes) || 30, 30), 180)
      const startUtc = zonedDateTimeToUtc(tourDate, tourTime, TOUR_TIMEZONE)
      const endUtc = new Date(startUtc.getTime() + durationMinutes * 60_000)

      if (startUtc.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Choose a tour time in the future.' }, { status: 400 })
      }

      const token = inquiry.tour_response_token || createPublicToken()
      const links = getTourResponseLinks(token)
      const tourDateLabel = formatTourDate(startUtc)
      const tourTimeLabel = formatTourTime(startUtc)
      const contactPhone = await getActiveLuxorPhoneNumber().catch((error) => {
        console.warn('Tour confirmation could not load the active Luxor phone number:', error)
        return null
      })
      const emailContext: TourEmailContext = {
        inquiry,
        meetingType,
        clientFacingNotes,
        tourDateLabel,
        tourTimeLabel,
        durationMinutes,
        responseUrl: links.rescheduleUrl,
        contactPhone,
      }
      const confirmation = await buildAiTourConfirmationEmail(emailContext)

      const eventContacts = await supabaseRest<Array<{ email: string | null }>>(
        `luxor_event_contacts?select=email&inquiry_id=eq.${encodeURIComponent(inquiryId)}`
      )
      const recipientEmails = Array.from(new Set([inquiry.email, ...eventContacts.map((contact) => contact.email)].filter((email): email is string => Boolean(email && email.trim()))))
      const eventInput = {
        attendeeEmails: recipientEmails,
        title: `${meetingType} · ${inquiry.full_name}`,
        description: [
          `Private appointment for ${inquiry.full_name}.`,
          `Event: ${inquiry.event_type || 'Private event'}`,
          inquiry.guest_count ? `Expected guests: ${inquiry.guest_count}` : '',
          clientFacingNotes ? `Details: ${clientFacingNotes}` : '',
          `Confirm or reschedule: ${links.rescheduleUrl}`,
        ].filter(Boolean).join('\n'),
        location: TOUR_LOCATION,
        startUtc: startUtc.toISOString(),
        endUtc: endUtc.toISOString(),
      }
      const existingCalendar = await getLuxorCalendarEvent(inquiryId)
      const templates = { confirmation, reminder_24: buildTourReminderEmail(emailContext, 'tomorrow'),
        reminder_2: buildTourReminderEmail(emailContext, 'soon') }
      for (const template of Object.values(templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)
      const saved = await saveLuxorTourSchedule({ inquiry, expectedSequence: existingCalendar?.sequence ?? -1,
        state: { title: eventInput.title, description: eventInput.description, location: eventInput.location,
          startUtc: eventInput.startUtc, endUtc: eventInput.endUtc, attendeeEmails: recipientEmails },
        tour: { meetingType, clientFacingNotes, responseToken: token, assignees: tourAssignees },
        templates, requestedBy: session.email })
      // Supabase commits the event revision and queued Resend notices together.
      // Secondary activity must not make a successful schedule retry its email.
      if (!saved.replayed) {
        try { await queueInquiryTextJobs(saved.inquiry) }
        catch (error) { console.error('Tour saved; text confirmations could not be queued:', error) }
        try {
          await createNote(inquiryId,
            `Tour scheduled for ${tourDateLabel} at ${tourTimeLabel}. One branded calendar invitation and ${saved.reminderJobs.length} reminders queued through Resend.`,
            'email_log', session.email)
        } catch (error) { console.error('Tour saved; activity note could not be recorded:', error) }
      }
      return NextResponse.json({ inquiry: saved.inquiry,
        calendar: { eventId: saved.event.id, eventUid: saved.event.uid, viewEventUrl: '/portal/calendar' },
        confirmationJob: saved.confirmationJobs.find(job => job.recipient_email === inquiry.email?.toLowerCase().trim()) || saved.confirmationJobs[0],
        reminderJobs: saved.reminderJobs, replayed: saved.replayed }, { status: saved.replayed ? 200 : 201 })
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
