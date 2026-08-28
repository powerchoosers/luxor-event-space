import 'server-only'
import { supabaseRest } from './supabaseRestServer'

const pageSize = 25
export type CalendarReviewItem = {
  id: string; messageId: string; attendeeEmail: string; replyStatus: string; replyStamp: string
  eventTitle: string; startUtc: string; eventSequence: number; replySequence: number
  currentStatus: string; canApprove: boolean
}
type ReplyRow = { id: string; event_id: string; message_id: string; attendee_email: string; sequence: number; partstat: string; reply_stamp: string }
type EventRow = { id: string; sequence: number; status: string; updated_at: string; state: { title: string; startUtc: string } }
type AttendeeRow = { event_id: string; email: string; partstat: string; sequence: number; active: boolean; response_at: string | null }

export async function listLuxorCalendarReviews(page: number) {
  if (!Number.isSafeInteger(page) || page < 0 || page > 100_000) throw new Error('Invalid review page')
  // The anti-join excludes decisions without rewriting the original reply.
  const replies = await supabaseRest<ReplyRow[]>(`luxor_calendar_responses?select=id,event_id,message_id,attendee_email,sequence,partstat,reply_stamp,luxor_calendar_response_reviews!left(response_id)&disposition=eq.pending_review&luxor_calendar_response_reviews=is.null&order=created_at.asc,id.asc&limit=${pageSize + 1}&offset=${page * pageSize}`)
  const selected = replies.slice(0, pageSize)
  if (!selected.length) return { items: [], page, hasNext: false }
  const eventIds = [...new Set(selected.map(reply => reply.event_id))]
  const [events, attendeeGroups] = await Promise.all([
    supabaseRest<EventRow[]>(`luxor_calendar_events?select=id,sequence,status,updated_at,state&id=in.(${eventIds.join(',')})`),
    // Each event is bounded to 50 attendees; don't rely on a >1,000-row REST limit.
    Promise.all(eventIds.map(id => supabaseRest<AttendeeRow[]>(`luxor_calendar_attendees?select=event_id,email,partstat,sequence,active,response_at&event_id=eq.${id}&active=eq.true&limit=50`))),
  ])
  const eventMap = new Map(events.map(event => [event.id, event]))
  const attendeeMap = new Map(attendeeGroups.flat().map(attendee => [`${attendee.event_id}/${attendee.email}`, attendee]))
  const items: CalendarReviewItem[] = selected.map(reply => {
    const event = eventMap.get(reply.event_id)
    if (!event) throw new Error('Calendar event unavailable')
    const attendee = attendeeMap.get(`${reply.event_id}/${reply.attendee_email}`)
    const stamp = Date.parse(reply.reply_stamp)
    return { id: reply.id, messageId: reply.message_id, attendeeEmail: reply.attendee_email,
      replyStatus: reply.partstat, replyStamp: reply.reply_stamp, replySequence: reply.sequence,
      eventTitle: event.state.title, startUtc: event.state.startUtc, eventSequence: event.sequence,
      currentStatus: attendee?.partstat || 'NOT-ATTENDING',
      canApprove: Boolean(attendee?.active && event.status === 'confirmed'
        && attendee.sequence === event.sequence && reply.sequence === event.sequence
        && stamp <= Date.now() + 600_000 && stamp >= Date.parse(event.updated_at) - 300_000
        && (!attendee.response_at || stamp > Date.parse(attendee.response_at))),
    }
  })
  return { items, page, hasNext: replies.length > pageSize }
}

export async function reviewLuxorCalendarReply(input: { responseId: string; expectedSequence: number; decision: 'approve' | 'dismiss'; note: string }, reviewedBy: string) {
  return supabaseRest('rpc/luxor_review_calendar_response', { method: 'POST', body: JSON.stringify({
    p_response_id: input.responseId, p_expected_sequence: input.expectedSequence,
    p_decision: input.decision, p_reviewed_by: reviewedBy, p_note: input.note,
  }) })
}
