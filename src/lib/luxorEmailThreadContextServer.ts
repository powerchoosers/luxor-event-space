import 'server-only'

import { listLuxorZohoThread, normalizeEmailAddress } from './zohoMailServer'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorBooking, LuxorInquiry, LuxorNote } from './luxorInquiryTypes'

const LUXOR_SENDERS = new Set(['booking@luxoratlaspalmas.com', 'hello@luxoratlaspalmas.com'])

function addresses(value: string) {
  return Array.from(value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map((match) => match[0].toLowerCase())
}

function htmlToPlainText(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function extractEmailMessagePlainText(message: { content?: string | null; summary?: string | null; htmlContent?: string | null } | null | undefined): string {
  if (!message) return ''
  const plain = (message.content || message.summary || '').trim()
  if (plain) return plain
  return htmlToPlainText(message.htmlContent)
}

export async function getLuxorEmailThreadContext(threadId: string) {
  let resolvedThreadId = threadId
  let messages = threadId.startsWith('mail-')
    ? await (await import('./luxorMailboxServer')).listLuxorMailboxMessages({ threadId, limit: 100, withAttachments: true }).then((items) => items.reverse())
    : await listLuxorZohoThread(threadId, 50)

  if (!messages.length && threadId.startsWith('mail-')) {
    const { getLuxorMailboxMessage, listLuxorMailboxMessages } = await import('./luxorMailboxServer')
    const single = await getLuxorMailboxMessage(threadId)
    if (single) {
      resolvedThreadId = single.threadId || single.id
      const threadItems = await listLuxorMailboxMessages({ threadId: resolvedThreadId, limit: 100, withAttachments: true }).then((items) => items.reverse())
      messages = threadItems.length ? threadItems : [single]
    }
  }

  const latestIncoming = [...messages].reverse().find((message) => message.direction === 'incoming')
  const participants = Array.from(new Set([
    ...(latestIncoming ? addresses(latestIncoming.from) : []),
    ...messages.flatMap((message) => [
      ...addresses(message.from), ...addresses(message.to), ...addresses(message.cc),
    ]),
  ]))
  const nonLuxorParticipants = participants.filter((email) => !LUXOR_SENDERS.has(email))
  let clientEmail = nonLuxorParticipants[0] || ''

  let inquiry: LuxorInquiry | null = null
  let notes: LuxorNote[] = []
  let bookings: LuxorBooking[] = []
  for (const candidateEmail of nonLuxorParticipants) {
    try {
      const matches = await supabaseRest<LuxorInquiry[]>(
        `luxor_inquiries?select=*&email=ilike.${encodeURIComponent(candidateEmail)}&order=created_at.desc&limit=1`,
      )
      if (matches[0]) {
        inquiry = matches[0]
        clientEmail = candidateEmail
        break
      }
    } catch {
      /* continue without failing thread context */
    }
  }
  if (inquiry) {
    try {
      ;[notes, bookings] = await Promise.all([
        supabaseRest<LuxorNote[]>(`luxor_notes?select=*&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&order=created_at.asc&limit=100`),
        supabaseRest<LuxorBooking[]>(`luxor_bookings?select=*&inquiry_id=eq.${encodeURIComponent(inquiry.id)}&order=created_at.desc&limit=20`),
      ])
    } catch {
      notes = []
      bookings = []
    }
  }

  return { threadId: resolvedThreadId, clientEmail: normalizeEmailAddress(clientEmail), messages, inquiry, notes, bookings }
}

export function buildElenaReplyContext(context: Awaited<ReturnType<typeof getLuxorEmailThreadContext>>) {
  const chain = context.messages.map((message, index) => [
    `MESSAGE ${index + 1} (${message.direction === 'outgoing' ? 'LUXOR' : 'CLIENT'})`,
    `Date: ${message.receivedAt || 'Unknown'}`,
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Body: ${extractEmailMessagePlainText(message).slice(0, 12000) || '(No text body)'}`,
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
  ].join('\n') : `No matching portal contact record yet. Sender email: ${context.clientEmail || 'Unknown'}`

  const notes = context.notes.length
    ? context.notes.map((note) => `${note.created_at} — ${note.author}: ${note.content}`).join('\n')
    : 'No client notes.'
  const bookings = context.bookings.length
    ? context.bookings.map((booking) => `${booking.status}: ${booking.event_type || 'Event'} on ${booking.event_date || 'date TBD'}, ${booking.guest_count ?? 'unknown'} guests, package ${booking.package_name || 'TBD'}, notes: ${booking.notes || 'none'}`).join('\n')
    : 'No booking records.'

  return { chain, client, notes, bookings }
}
