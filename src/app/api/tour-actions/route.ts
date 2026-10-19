import { NextRequest, NextResponse } from 'next/server'
import {
  buildTourEmail,
  cancelQueuedTourEmailJobs,
  createLuxorEmailJob,
  createPublicToken,
  getTourResponseLinks,
  listLuxorEmailJobsForInquiry,
  assertEmailHasNoUnresolvedPlaceholders,
  processLuxorEmailJobs,
} from '@/lib/luxorEmailJobsServer'
import { getLuxorInquiry, updateLuxorInquiry, updateLuxorInquiryIfTourAttendanceStatus } from '@/lib/luxorInquiriesServer'
import { resolveLuxorTourOutcomePrecondition } from '@/lib/luxorTourOutcome'
import { getLuxorLeadEventForInquiry, listLuxorLeadEventsByInquiry, updateLuxorLeadEvent } from '@/lib/luxorLeadEventsServer'
import { createNote } from '@/lib/luxorNotesServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { LuxorEmailJob, LuxorEmailJobKind, LuxorInquiryStatus, LuxorPipelineStage, LuxorTourAttendanceStatus } from '@/lib/luxorInquiryTypes'
import { buildLuxorTourPlan } from '@/lib/luxorTourPlanningServer'
import { queueInquiryTextJobs } from '@/lib/luxorTextCampaignsServer'
import { cancelLuxorTourForInquiry } from '@/lib/luxorTourCancellationServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorCalendarEvent, getLuxorCalendarStatus } from '@/lib/luxorCalendarServer'
import { saveLuxorTourSchedule } from '@/lib/luxorTourScheduleServer'
import { getActiveLuxorPhoneNumber } from '@/lib/luxorPhoneNumbersServer'
import { cancelLuxorTestTour, ensureActiveLuxorTestRun, recordLuxorTestTourOutcome, scheduleLuxorTestTour } from '@/lib/luxorTestLeadServer'

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
    if (inquiry.is_test) {
      const member = await getLuxorPortalMember(session.email)
      if (!member || !['owner', 'admin'].includes(member.role) || !memberCan(member, 'settings')) {
        return NextResponse.json({ error: 'Owner or admin access required for the isolated Test Lead.' }, { status: 403 })
      }
      if (inquiry.id !== '00b264d6-a3fb-4ea3-9142-415f76385c39') {
        return NextResponse.json({ error: 'Only the permanent isolated Test Lead can use simulator actions.' }, { status: 409 })
      }
      const context = await ensureActiveLuxorTestRun()
      if (action === 'schedule-tour') {
        const tourDate = String(body.tourDate || '').trim()
        const tourTime = String(body.tourTime || '').trim()
        if (!tourDate || !tourTime) return NextResponse.json({ error: 'Choose a date and time for the simulated tour.' }, { status: 400 })
        const result = await scheduleLuxorTestTour({
          testRunId: context.run.id,
          date: tourDate,
          time: tourTime,
          durationMinutes: Number(body.durationMinutes) || 30,
          meetingType: String(body.meetingType || 'Private Venue Tour'),
          clientFacingNotes: typeof body.clientFacingNotes === 'string' ? body.clientFacingNotes : '',
          assignees: Array.isArray(body.tourAssignees) ? body.tourAssignees.map((value: unknown) => String(value)) : [],
        })
        return NextResponse.json({
          inquiry: result.inquiry,
          simulated: true,
          calendar: { calendarEventCreated: false, inventoryReserved: false },
          confirmationJob: null,
          reminderJobs: [],
        }, { status: 201 })
      }
      if (action === 'cancel-tour' || (action === 'attendance' && body.attendance === 'cancelled')) {
        const result = await cancelLuxorTestTour({ testRunId: context.run.id, reason: typeof body.reason === 'string' ? body.reason : '' })
        return NextResponse.json({ inquiry: result.inquiry, simulated: true, cancellation: result })
      }
      if (action === 'attendance') {
        const attendance = String(body.attendance || '')
        if (!['attended', 'no_show'].includes(attendance)) {
          return NextResponse.json({ error: 'The Test Lead supports simulated completed or no-show tour outcomes here.' }, { status: 400 })
        }
        const result = await recordLuxorTestTourOutcome({
          testRunId: context.run.id,
          attendance: attendance as 'attended' | 'no_show',
          expectedAttendance: typeof body.expectedAttendance === 'string' ? body.expectedAttendance : body.expectedAttendance === null ? null : undefined,
        })
        return NextResponse.json({ inquiry: result.inquiry, simulated: true, warnings: [], idempotent: result.replayed === true })
      }
      return NextResponse.json({ error: 'This action is not available for the isolated Test Lead. Use its run-scoped test controls.' }, { status: 409 })
    }
    if (inquiry.status === 'closed_lost') {
      return NextResponse.json({ error: 'This opportunity is closed lost. Reopen it before scheduling or changing a tour.' }, { status: 409 })
    }

    if (action === 'confirm-email-resend') {
      const jobId = String(body.jobId || '')
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: 'Resend request is invalid.' }, { status: 400 })
      const rpcResult = await supabaseRest<LuxorEmailJob | LuxorEmailJob[]>('rpc/luxor_confirm_prepared_tour_email_resend', {
        method: 'POST', body: JSON.stringify({ p_inquiry_id: inquiryId, p_job_id: jobId }),
      })
      // PostgreSQL returns this RPC's jsonb object as an object. Keep array
      // compatibility for deployments with a table-returning wrapper, but do
      // not destructure the scalar JSONB response as if it were a list.
      const job = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
      if (!job) return NextResponse.json({ error: 'Resend request is unavailable.' }, { status: 409 })
      if (job.status === 'queued') await processLuxorEmailJobs([job])
      const refreshedJobs = await listLuxorEmailJobsForInquiry(inquiryId)
      const refreshed = refreshedJobs.find((candidate) => candidate.id === job.id) || job
      return NextResponse.json({ job: refreshed, deliveryQueued: refreshed.status === 'queued' || refreshed.status === 'sent' })
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
      const expectedAttendance = typeof body.expectedAttendance === 'string' ? body.expectedAttendance as LuxorTourAttendanceStatus : body.expectedAttendance === null ? null : undefined
      const precondition = resolveLuxorTourOutcomePrecondition(inquiry.tour_attendance_status || null, attendance, expectedAttendance)
      if (precondition === 'stale') {
        return NextResponse.json({ error: 'The tour outcome changed since this view loaded. Refresh and review the current outcome before correcting it.' }, { status: 409 })
      }
      if (inquiry.tour_attendance_status === 'cancelled' && attendance !== 'cancelled') {
        return NextResponse.json({ error: 'A cancelled tour cannot be changed through attendance controls.' }, { status: 409 })
      }
      const updates: Record<string, unknown> = { tour_attendance_status: attendance }
      if (attendance === 'attended' && canAdvanceAttendedTour(inquiry.status, inquiry.pipeline_stage)) {
        updates.status = 'tour_confirmed'
        updates.pipeline_stage = 'proposal'
      }
      if (attendance === 'no_show' && canAdvanceAttendedTour(inquiry.status, inquiry.pipeline_stage)) updates.pipeline_stage = 'tour'
      if (attendance === 'rescheduled' && PRE_PROPOSAL_STATUSES.has(inquiry.status)) updates.status = 'tour_requested'

      let updated = inquiry
      let outcomeChanged = false
      if (inquiry.tour_attendance_status !== attendance) {
        const saved = await updateLuxorInquiryIfTourAttendanceStatus(inquiryId, inquiry.tour_attendance_status, updates)
        if (!saved) {
          const current = await getLuxorInquiry(inquiryId)
          if (!current || current.tour_attendance_status !== attendance) {
            return NextResponse.json({ error: 'Another tour outcome was saved first. Refresh to review the current status.' }, { status: 409 })
          }
          updated = current
        } else {
          updated = saved
          outcomeChanged = true
        }
      }
      const warnings: string[] = []
      let updatedLeadEvent = null
      if (attendance === 'attended' && selectedLeadEvent && canAdvanceAttendedTour(selectedLeadEvent.status, selectedLeadEvent.pipeline_stage)) {
        try {
          updatedLeadEvent = await updateLuxorLeadEvent(selectedLeadEvent.id, {
            status: 'tour_confirmed',
            pipeline_stage: 'proposal',
          })
        } catch (error) {
          console.error('Tour outcome saved; linked event stage needs refresh:', error)
          warnings.push('The tour outcome was saved, but its linked event stage could not be updated.')
        }
      }
      if (attendance === 'attended' || attendance === 'no_show' || attendance === 'rescheduled' || attendance === 'cancelled') {
        try {
          await cancelQueuedTourEmailJobs(inquiryId)
        } catch (error) {
          console.error('Tour outcome saved; queued tour messages need review:', error)
          warnings.push('The tour outcome was saved, but queued tour reminders could not be cancelled.')
        }
      }
      if (outcomeChanged) {
        try {
          await createNote(inquiryId, `Tour attendance marked as ${attendance.replaceAll('_', ' ')}.`, 'status_change', 'Portal Owner')
        } catch (error) {
          console.error('Tour outcome saved; activity note was not recorded:', error)
          warnings.push('The tour outcome was saved, but its activity note could not be recorded.')
        }
      }
      return NextResponse.json({ inquiry: updated, leadEvent: updatedLeadEvent, noShowJob: null, warnings, idempotent: !outcomeChanged })
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
      const token = inquiry.tour_response_token || createPublicToken()
      const links = getTourResponseLinks(token)
      const contactPhone = await getActiveLuxorPhoneNumber().catch((error) => {
        console.warn('Tour confirmation could not load the active Luxor phone number:', error)
        return null
      })
      const eventContacts = await supabaseRest<Array<{ email: string | null }>>(
        `luxor_event_contacts?select=email&inquiry_id=eq.${encodeURIComponent(inquiryId)}`
      )
      const recipientEmails = Array.from(new Set([inquiry.email, ...eventContacts.map((contact) => contact.email)].filter((email): email is string => Boolean(email && email.trim()))))
      const plan = await buildLuxorTourPlan({ inquiry, date: tourDate, time: tourTime, responseToken: token,
        responseUrl: links.rescheduleUrl, attendeeEmails: recipientEmails, meetingType, clientFacingNotes,
        durationMinutes, contactPhone, assignees: tourAssignees })
      const existingCalendar = await getLuxorCalendarEvent(inquiryId)
      const templates = plan.templates
      for (const template of Object.values(templates)) assertEmailHasNoUnresolvedPlaceholders(template.subject, template.body)
      const saved = await saveLuxorTourSchedule({ inquiry, expectedSequence: existingCalendar?.sequence ?? -1,
        state: plan.state,
        tour: plan.tour,
        templates, requestedBy: session.email })
      // Supabase commits the event revision and queued Resend notices together.
      // Secondary activity must not make a successful schedule retry its email.
      if (!saved.replayed) {
        try { await queueInquiryTextJobs(saved.inquiry) }
        catch (error) { console.error('Tour saved; text confirmations could not be queued:', error) }
        try {
          await createNote(inquiryId,
            `Tour scheduled for ${plan.tourDateLabel} at ${plan.tourTimeLabel}. One branded calendar invitation and ${saved.reminderJobs.length} reminders queued through Resend.`,
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
