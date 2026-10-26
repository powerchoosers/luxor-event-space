import { NextRequest, NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { listAllLuxorInquiries } from '@/lib/luxorInquiriesServer'
import { listLuxorMessages } from '@/lib/luxorMessagesServer'
import { listLuxorCalls } from '@/lib/luxorCallsServer'
import { listInvoices } from '@/lib/luxorInvoicesServer'
import { listLuxorBookings, listAllPayments, listAllExpenses } from '@/lib/luxorBookingsServer'
import { listLuxorSignatureRequests } from '@/lib/luxorSignaturesServer'
import { listMarketingActivityEvents } from '@/lib/luxorMarketingServer'
import { listLuxorLayoutReviewNotifications } from '@/lib/luxorLayoutReviewsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

export const runtime = 'nodejs'

async function readSource<T>(read: () => Promise<T>) {
  try {
    return { ok: true as const, data: await read() }
  } catch {
    return { ok: false as const, data: null }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Keep the live membership, suspension, and session-revocation check. A
    // single summary request replaces the dashboard's twelve self-API calls.
    if (!await getLuxorPortalSession()) {
      return NextResponse.json({ error: 'Zoho portal login required.' }, { status: 401 })
    }

    const emailRequested = request.nextUrl.searchParams.get('emails') === '1'
    const scopeParam = request.nextUrl.searchParams.get('scopes')
    const scopes = scopeParam ? new Set(scopeParam.split(',').filter(Boolean)) : null
    const shouldRead = (scope: string) => !scopes || scopes.has(scope)
    const [inquiries, emails, messages, calls, invoices, expenses, bookings, payments, signatures, marketingEvents, layoutReviews, calendarResponses] = await Promise.all([
      shouldRead('inquiries') ? readSource(() => listAllLuxorInquiries()) : Promise.resolve({ ok: true as const, data: null }),
      emailRequested && shouldRead('emails') ? readSource(async () => {
        type EmailEventRow = { id: string; message_id: string | null; sender_email: string | null; sender_name: string | null; recipient_email: string | null; subject: string; received_at: string }
        const rows = await supabaseRest<EmailEventRow[]>('luxor_email_events?select=id,message_id,sender_email,sender_name,recipient_email,subject,received_at&order=received_at.desc&limit=25')
        return { messages: rows.map((row) => ({ id: row.id, messageId: row.message_id, webhookEvent: true, subject: row.subject,
          from: row.sender_name ? `${row.sender_name}${row.sender_email ? ` <${row.sender_email}>` : ''}` : row.sender_email || 'Unknown sender',
          to: row.recipient_email || '', receivedAt: row.received_at, direction: 'incoming', isRead: false })) }
      }) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('messages') ? readSource(() => listLuxorMessages({ limit: 50 })) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('calls') ? readSource(() => listLuxorCalls({ limit: 50 })) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('invoices') ? readSource(() => listInvoices(1000)) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('expenses') ? readSource(() => listAllExpenses()) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('bookings') ? readSource(() => listLuxorBookings(1000)) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('payments') ? readSource(() => listAllPayments()) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('signatures') ? readSource(async () => (await listLuxorSignatureRequests(100)).map((signature) => ({
        id: signature.id, inquiry_id: signature.inquiry_id, booking_id: signature.booking_id,
        client_name: signature.client_name, status: signature.status, contract_title: signature.contract_title,
        created_at: signature.created_at, updated_at: signature.updated_at, signed_at: signature.signed_at,
      }))) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('marketingEvents') ? readSource(async () => ({ events: await listMarketingActivityEvents({ limit: 50 }) })) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('layoutReviews') ? readSource(async () => ({ feedback: await listLuxorLayoutReviewNotifications(50) })) : Promise.resolve({ ok: true as const, data: null }),
      shouldRead('calendarResponses') ? readSource(async () => {
        type ResponseRow = { id: string; event_id: string; attendee_email: string; partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'; reply_stamp: string; disposition: 'applied' | 'pending_review'; created_at: string }
        type EventRow = { id: string; inquiry_id: string; state: Record<string, unknown> | null }
        const responses = await supabaseRest<ResponseRow[]>('luxor_calendar_responses?select=id,event_id,attendee_email,partstat,reply_stamp,disposition,created_at&disposition=in.(applied,pending_review)&order=created_at.desc&limit=50')
        const eventIds = Array.from(new Set(responses.map((response) => response.event_id).filter(Boolean)))
        const events = eventIds.length ? await supabaseRest<EventRow[]>(`luxor_calendar_events?select=id,inquiry_id,state&id=in.(${eventIds.join(',')})`) : []
        const eventById = new Map(events.map((event) => [event.id, event]))
        return { responses: responses.map((response) => {
          const event = eventById.get(response.event_id)
          return { ...response, inquiry_id: event?.inquiry_id || null,
            event_title: String(event?.state?.title || 'Calendar invitation'),
            event_start: typeof event?.state?.startUtc === 'string' ? event.state.startUtc : null }
        }) }
      }) : Promise.resolve({ ok: true as const, data: null }),
    ])

    const sources = { inquiries, emails, messages, calls, invoices, expenses, bookings, payments, signatures, marketingEvents, layoutReviews, calendarResponses }
    return NextResponse.json({ sources }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load portal notifications.' }, { status: 500 })
  }
}
