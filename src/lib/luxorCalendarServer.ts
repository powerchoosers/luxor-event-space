import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { luxorMailAddress } from './luxorMailConfig'
import { buildLuxorCalendarMessage } from './luxorCalendarInviteServer'
import { sendLuxorResendEmail } from './luxorResendMailServer'
import type { LuxorEmailJob, LuxorInquiry } from './luxorInquiryTypes'

export type LuxorCalendarState = {
  title: string; description: string; location: string
  startUtc: string; endUtc: string; attendeeEmails: string[]; status: 'confirmed' | 'cancelled'
}
export type LuxorCalendarEvent = {
  id: string; inquiry_id: string; uid: string; sequence: number; status: 'confirmed' | 'cancelled'
  state: LuxorCalendarState; created_at: string; updated_at: string
}
type CalendarSnapshot = LuxorCalendarState & {
  uid: string; sequence: number; stamp: string; createdAt: string; attendeeEmail: string; method: 'REQUEST' | 'CANCEL'
}

export async function getLuxorCalendarEvent(inquiryId: string) {
  const rows = await supabaseRest<LuxorCalendarEvent[]>(`luxor_calendar_events?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&limit=1`)
  return rows[0] || null
}

export async function getLuxorCalendarStatus(inquiryId: string) {
  const event = await getLuxorCalendarEvent(inquiryId)
  if (!event) return null
  const [attendees, responses] = await Promise.all([
    supabaseRest(`luxor_calendar_attendees?select=email,partstat,sequence,response_at,active&event_id=eq.${event.id}&order=email.asc`),
    supabaseRest(`luxor_calendar_responses?select=*&event_id=eq.${event.id}&order=created_at.desc&limit=50`),
  ])
  return { ...event, attendees, responses }
}

export function normalizedState(input: LuxorCalendarState): LuxorCalendarState {
  const attendeeEmails = Array.from(new Set(input.attendeeEmails.map(luxorMailAddress))).sort()
  if (!attendeeEmails.length || attendeeEmails.includes('') || attendeeEmails.length > 50) throw new Error('Add valid calendar attendee email addresses.')
  const state = { ...input, title: input.title.trim().slice(0,180), description: input.description.trim().slice(0,5000),
    location: input.location.trim().slice(0,500), attendeeEmails,
    startUtc: new Date(input.startUtc).toISOString(), endUtc: new Date(input.endUtc).toISOString() }
  // Use the same validation and serialization as the actual delivery worker.
  buildLuxorCalendarMessage({ ...state, start: new Date(state.startUtc), end: new Date(state.endUtc),
    uid: 'validation@luxoratlaspalmas.com', attendeeEmail: attendeeEmails[0], method: state.status === 'cancelled' ? 'CANCEL' : 'REQUEST' })
  return state
}

export async function scheduleLuxorCalendarEvent(inquiry: LuxorInquiry, input: Omit<LuxorCalendarState,'status'>, requestedBy: string) {
  const current = await getLuxorCalendarEvent(inquiry.id)
  if (!current && inquiry.metadata?.zohoCalendarEventUid) {
    throw new Error('This tour has an existing Zoho invitation. Import its original UID and sequence before moving it to Resend; a duplicate invitation was not created.')
  }
  const state = normalizedState({ ...input, status: 'confirmed' })
  return supabaseRest<LuxorCalendarEvent>('rpc/luxor_save_calendar_revision', { method: 'POST', body: JSON.stringify({
    p_inquiry_id: inquiry.id, p_expected_sequence: current?.sequence ?? -1, p_state: state, p_requested_by: requestedBy,
  }) })
}

export async function cancelLuxorCalendarEvent(inquiryId: string, requestedBy: string) {
  const current = await getLuxorCalendarEvent(inquiryId)
  if (!current) return null
  return supabaseRest<LuxorCalendarEvent>('rpc/luxor_save_calendar_revision', { method: 'POST', body: JSON.stringify({
    p_inquiry_id: inquiryId, p_expected_sequence: current.sequence,
    p_state: { ...current.state, status: 'cancelled' }, p_requested_by: requestedBy,
  }) })
}

/** Called only by the existing email queue worker after it claims the job. */
export async function deliverLuxorCalendarJob(job: LuxorEmailJob) {
  if (!job.inquiry_id || !job.calendar_revision_id || !job.calendar_method) throw new Error('Calendar delivery is missing its saved event revision.')
  const snapshot = job.metadata.calendar_snapshot as CalendarSnapshot | undefined
  if (!snapshot || snapshot.attendeeEmail !== job.recipient_email || snapshot.method !== job.calendar_method) throw new Error('Calendar delivery snapshot does not match its recipient or method.')
  const current = await getLuxorCalendarEvent(job.inquiry_id)
  if (!current || current.uid !== snapshot.uid) throw new Error('Saved calendar event not found.')
  const superseded = snapshot.method === 'REQUEST'
    ? current.sequence !== snapshot.sequence || current.status === 'cancelled'
    : current.sequence > snapshot.sequence && current.status === 'confirmed' && current.state.attendeeEmails.includes(snapshot.attendeeEmail)
  if (superseded) return { status: 'skipped' as const }
  const message = buildLuxorCalendarMessage({ ...snapshot, start: new Date(snapshot.startUtc), end: new Date(snapshot.endUtc),
    stamp: new Date(snapshot.stamp), created: new Date(snapshot.createdAt) })
  const sent = await sendLuxorResendEmail({ to: job.recipient_email, subject: message.subject, content: message.html, text: message.text,
    from: 'booking@luxoratlaspalmas.com', calendar: message.icalEvent, idempotencyKey: `email-job/${job.id}`,
    metadata: { calendarUid: snapshot.uid, calendarSequence: snapshot.sequence, calendarMethod: snapshot.method } })
  return { status: 'sent' as const, messageId: sent.messageId }
}
