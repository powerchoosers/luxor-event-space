import 'server-only'

import { listLuxorZohoThread, normalizeEmailAddress } from './zohoMailServer'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorBooking, LuxorInquiry, LuxorNote } from './luxorInquiryTypes'

const LUXOR_SENDERS = new Set(['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com'])

function addresses(value: string) {
  return Array.from(value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0].toLowerCase())
}

export async function getLuxorEmailThreadContext(threadId: string) {
  const messages = await listLuxorZohoThread(threadId, 50)
  const participants = Array.from(new Set(messages.flatMap((message) => [
    ...addresses(message.from), ...addresses(message.to), ...addresses(message.cc),
  ])))
  const clientEmail = participants.find((email) => !LUXOR_SENDERS.has(email)) || ''

  let inquiry: LuxorInquiry | null = null
  let notes: LuxorNote[] = []
  let bookings: LuxorBooking[] = []
  if (clientEmail) {
    const matches = await supabaseRest<LuxorInquiry[]>(
      `luxor_inquiries?select=*&email=ilike.${encodeURIComponent(clientEmail)}&order=created_at.desc&limit=1`,
    )
    inquiry = matches[0] || null
    if (inquiry) {
      ;[notes, bookings] = await Promise.all([
        supabaseRest<LuxorNote[]>(`luxor_notes?select=*&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&order=created_at.asc&limit=100`),
        supabaseRest<LuxorBooking[]>(`luxor_bookings?select=*&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&order=created_at.desc&limit=20`),
      ])
    }
  }

  return { threadId, clientEmail: normalizeEmailAddress(clientEmail), messages, inquiry, notes, bookings }
}

export function buildElenaReplyContext(context: Awaited<ReturnType<typeof getLuxorEmailThreadContext>>) {
  const chain = context.messages.map((message, index) => [
    `MESSAGE ${index + 1} (${message.direction === 'outgoing' ? 'LUXOR' : 'CLIENT'})`,
    `Date: ${message.receivedAt || 'Unknown'}`,
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Body: ${(message.content || message.summary || '').slice(0, 12000)}`,
  ].join('\n')).join('\n\n')

  const inquiry = context.inquiry
  const client = inquiry ? [
    `Name: ${inquiry.full_name}`,
    `Email: ${inquiry.email || context.clientEmail}`,
    `Phone: ${inquiry.phone || 'Unknown'}`,
    `Status: ${inquiry.status}`,
    `Pipeline stage: ${inquiry.pipeline_stage || 'Unknown'}`,
    `Event: ${inquiry.event_type || 'Unknown'}`,
    `Target date: ${inquiry.target_date || 'Unknown'}`,
    `Guests: ${inquiry.guest_count ?? 'Unknown'}`,
    `Package interest: ${inquiry.package_interest || 'Unknown'}`,
    `Original inquiry: ${inquiry.message || 'None'}`,
  ].join('\n') : `No matching lead record. Client email: ${context.clientEmail || 'Unknown'}`

  const notes = context.notes.length
    ? context.notes.map((note) => `${note.created_at} — ${note.author}: ${note.content}`).join('\n')
    : 'No client notes.'
  const bookings = context.bookings.length
    ? context.bookings.map((booking) => `${booking.status}: ${booking.event_type || 'Event'} on ${booking.event_date || 'date TBD'}, ${booking.guest_count ?? 'unknown'} guests, package ${booking.package_name || 'TBD'}, notes: ${booking.notes || 'none'}`).join('\n')
    : 'No booking records.'

  return { chain, client, notes, bookings }
}
