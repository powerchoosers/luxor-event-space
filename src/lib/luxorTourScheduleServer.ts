import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { getLuxorCalendarEvent, normalizedState, type LuxorCalendarEvent, type LuxorCalendarState } from './luxorCalendarServer'
import { sendLuxorResendEmail } from './luxorResendMailServer'
import type { LuxorEmailJob, LuxorInquiry } from './luxorInquiryTypes'

type TourTemplate = { subject: string; body: string; text?: string; heroImage?: string; aiGenerated?: boolean }
type SavedTour = {
  event: LuxorCalendarEvent; inquiry: LuxorInquiry; replayed: boolean
  confirmationJobs: LuxorEmailJob[]; reminderJobs: LuxorEmailJob[]
}

/** All mail is queued by this transaction; it never contacts an email provider. */
export async function saveLuxorTourSchedule(input: {
  inquiry: LuxorInquiry
  expectedSequence: number
  state: Omit<LuxorCalendarState, 'status'>
  tour: { meetingType: string; clientFacingNotes: string; responseToken: string; assignees: string[] }
  templates: { confirmation: TourTemplate; reminder_24: TourTemplate; reminder_2: TourTemplate }
  requestedBy: string
}) {
  const state = normalizedState({ ...input.state, status: 'confirmed' })
  return supabaseRest<SavedTour>('rpc/luxor_save_tour_schedule', { method: 'POST', body: JSON.stringify({
    p_inquiry_id: input.inquiry.id, p_expected_sequence: input.expectedSequence,
    p_state: state, p_tour: input.tour, p_templates: input.templates, p_requested_by: input.requestedBy,
  }) })
}

/** Revision-bound notices stay on Resend even during a global provider rollback. */
export async function deliverLuxorTourNotice(job: LuxorEmailJob) {
  const expectedKind = job.tour_notice === 'confirmation' ? 'tour_confirmation'
    : ['reminder_24', 'reminder_2'].includes(job.tour_notice || '') ? 'tour_reminder' : null
  if (!job.inquiry_id || !job.tour_revision_id || !expectedKind || job.job_type !== expectedKind) {
    throw new Error('Tour notice is missing its saved revision or notice type.')
  }
  const [revision] = await supabaseRest<Array<{ event_id: string; sequence: number; state: LuxorCalendarState }>>(
    `luxor_calendar_revisions?select=event_id,sequence,state&id=eq.${encodeURIComponent(job.tour_revision_id)}&limit=1`,
  )
  if (!revision || !revision.state.attendeeEmails.includes(job.recipient_email)) {
    throw new Error('Tour notice does not match its saved attendee list.')
  }
  // Re-read live state after claiming: a reschedule can cancel queued rows, but
  // cannot recall an SMTP/API request which is already in flight.
  const [current, inquiries, attendees] = await Promise.all([
    getLuxorCalendarEvent(job.inquiry_id),
    supabaseRest<Array<Pick<LuxorInquiry, 'status' | 'tour_attendance_status'>>>(
      `luxor_inquiries?select=status,tour_attendance_status&id=eq.${encodeURIComponent(job.inquiry_id)}&limit=1`),
    supabaseRest<Array<{ active: boolean; sequence: number; partstat: string }>>(
      `luxor_calendar_attendees?select=active,sequence,partstat&event_id=eq.${encodeURIComponent(revision.event_id)}&email=eq.${encodeURIComponent(job.recipient_email)}&limit=1`),
  ])
  const inquiry = inquiries[0]
  const attendee = attendees[0]
  if (!current || current.id !== revision.event_id || current.sequence !== revision.sequence || current.status !== 'confirmed'
    || !inquiry || inquiry.status === 'closed_lost' || inquiry.tour_attendance_status !== 'pending'
    || !attendee?.active || attendee.sequence !== revision.sequence || attendee.partstat === 'DECLINED'
    || !(Date.parse(current.state.startUtc) > Date.now())) return { status: 'skipped' as const }

  const sent = await sendLuxorResendEmail({ to: job.recipient_email, subject: job.subject, content: job.body,
    from: 'booking@luxoratlaspalmas.com', fromName: 'Luxor Event Space', idempotencyKey: `email-job/${job.id}`,
    metadata: { calendarUid: current.uid, calendarSequence: revision.sequence, tourNotice: job.tour_notice } })
  return { status: 'sent' as const, messageId: sent.messageId }
}
