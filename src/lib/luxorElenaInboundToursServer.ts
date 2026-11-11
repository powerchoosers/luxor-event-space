import 'server-only'

import { randomBytes, randomUUID } from 'node:crypto'
import { supabaseRestStrict } from './supabaseRestServer'
import { listAvailableLuxorTourSlots } from './luxorTourSlotsServer'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'
import type { LuxorEmailJob } from './luxorInquiryTypes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Call = { twilio_call_sid: string; direction: string; to_number: string; status: string; inquiry_id: string | null; metadata: Record<string, unknown>; updated_at: string }
type Contact = { confirmed?: boolean; nonce?: string; inquiry_id?: string; matching_review_needed?: boolean; full_name?: string; phone?: string; email?: string }
type Pending = { nonce: string; slot_id: string; slot_date: string; slot_time: string; expires_at: string; question: string; inquiry_id: string; inquiry_updated_at: string; contact_nonce: string; request_id: string; visit_id: string; response_token: string; venue_location: string; send_invite: boolean }
type Inquiry = { id: string; full_name: string; email: string | null; phone: string | null; status: string; archived_at: string | null; is_test: boolean; preferred_tour_date: string | null; preferred_tour_time: string | null; current_tour_visit_id: string | null; updated_at: string }

export class ElenaInboundTourBookingError extends Error {}

function validIdentity(callSid: string, sessionId: string) {
  if (!/^CA[0-9a-f]{32}$/i.test(callSid) || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/.test(sessionId)) throw new ElenaInboundTourBookingError('This live call cannot book a tour.')
}

async function readVerifiedCall(callSid: string, sessionId: string) {
  validIdentity(callSid, sessionId)
  const [row] = await supabaseRestStrict<Call[]>(`luxor_calls?select=twilio_call_sid,direction,to_number,status,inquiry_id,metadata,updated_at&twilio_call_sid=eq.${callSid}&limit=1`)
  if (!row || row.direction !== 'inbound' || row.to_number === '+18176630380' || !['ringing', 'in-progress'].includes(row.status)
    || row.metadata.scope !== 'elena_live_inbound' || row.metadata.ingress_mode !== 'programmable_sip'
    || row.metadata.rehearsal_only !== false || row.metadata.accepted !== true || row.metadata.sip_answered !== true
    || row.metadata.openai_session_id !== sessionId) throw new ElenaInboundTourBookingError('This live call cannot book a tour.')
  return row
}

/** Prepare an immutable, short-lived caller readback; no inventory or messages are changed. */
export async function prepareElenaLiveTourBooking(input: { callSid: string; sessionId: string; slotId: string; sendInvite: boolean }) {
  if (typeof input.sendInvite !== 'boolean') throw new ElenaInboundTourBookingError('Ask whether the caller wants a calendar invitation by email.')
  if (!UUID.test(input.slotId)) throw new ElenaInboundTourBookingError('Choose one of the published tour times.')
  const row = await readVerifiedCall(input.callSid, input.sessionId)
  const capture = row.metadata.inbound_capture as Contact | undefined
  if (!capture?.confirmed || capture.matching_review_needed || !row.inquiry_id || capture.inquiry_id !== row.inquiry_id
    || !UUID.test(capture.nonce || '') || !capture.full_name || !capture.phone || !capture.email) {
    throw new ElenaInboundTourBookingError('Save the caller-confirmed name, phone and email before booking. Arianna must review any ambiguous contact match.')
  }
  if (row.metadata.booking_receipt) throw new ElenaInboundTourBookingError('This call already booked a tour. Ask Arianna to review any changes.')
  const [inquiry] = await supabaseRestStrict<Inquiry[]>(`luxor_inquiries?select=id,full_name,email,phone,status,archived_at,is_test,preferred_tour_date,preferred_tour_time,current_tour_visit_id,updated_at&id=eq.${row.inquiry_id}&limit=1`)
  const phoneDigits = (value: string) => value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  if (!inquiry || inquiry.is_test || inquiry.archived_at || !['new', 'contacted', 'tour_requested'].includes(inquiry.status)
    || inquiry.full_name.trim().replace(/\s+/g, ' ').toLowerCase() !== capture.full_name.trim().replace(/\s+/g, ' ').toLowerCase()
    || inquiry.email?.trim().toLowerCase() !== capture.email.trim().toLowerCase()
    || phoneDigits(inquiry.phone || '') !== phoneDigits(capture.phone)) {
    throw new ElenaInboundTourBookingError('The confirmed caller details need Arianna’s review before a tour can be booked.')
  }
  if (inquiry.preferred_tour_date || inquiry.preferred_tour_time || inquiry.current_tour_visit_id) throw new ElenaInboundTourBookingError('This contact already has tour details. Ask Arianna to review them instead of creating another visit.')
  const calendars = await supabaseRestStrict<Array<{ id: string }>>(`luxor_calendar_events?select=id&inquiry_id=eq.${inquiry.id}&limit=1`)
  if (calendars.length) throw new ElenaInboundTourBookingError('This contact already has a calendar history. Ask Arianna to arrange this visit.')
  const slot = (await listAvailableLuxorTourSlots()).find((candidate) => candidate.id === input.slotId)
  if (!slot) throw new ElenaInboundTourBookingError('That published tour time is no longer available. Choose another time.')
  const prior = row.metadata.booking_pending as Pending | undefined
  if (prior?.slot_id === slot.id && prior.inquiry_id === inquiry.id && prior.inquiry_updated_at === inquiry.updated_at
    && prior.contact_nonce === capture.nonce && prior.send_invite === input.sendInvite && prior.venue_location === `Luxor at Las Palmas Events, ${LUXOR_VENUE_ADDRESS}`
    && Date.parse(prior.expires_at) > Date.now()) {
    return { nonce: prior.nonce, question: prior.question, expiresAt: prior.expires_at, slot }
  }
  const pending: Pending = {
    nonce: randomUUID(), slot_id: slot.id, slot_date: slot.date, slot_time: slot.time,
    expires_at: new Date(Date.now() + 180_000).toISOString(),
    question: `Shall I book your private venue tour for ${slot.dateLabel} at ${slot.time}, San Antonio time, under ${capture.full_name}, phone ${capture.phone}, and email ${capture.email}${input.sendInvite ? ', and email your calendar invitation to that address' : ', without sending an email'}?`,
    inquiry_id: inquiry.id, inquiry_updated_at: inquiry.updated_at, contact_nonce: capture.nonce!,
    request_id: randomUUID(), visit_id: randomUUID(), response_token: randomBytes(32).toString('base64url'),
    venue_location: `Luxor at Las Palmas Events, ${LUXOR_VENUE_ADDRESS}`, send_invite: input.sendInvite,
  }
  const updated = await supabaseRestStrict<Call[]>(`luxor_calls?twilio_call_sid=eq.${input.callSid}&updated_at=eq.${encodeURIComponent(row.updated_at)}&metadata->>scope=eq.elena_live_inbound&metadata->>openai_session_id=eq.${encodeURIComponent(input.sessionId)}&select=twilio_call_sid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ metadata: { ...row.metadata, booking_pending: pending }, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() }),
  })
  if (!updated.length) throw new ElenaInboundTourBookingError('The call changed. Check the tour time and read back the details again.')
  return { nonce: pending.nonce, question: pending.question, expiresAt: pending.expires_at, slot }
}

/** Caller consent and signed booking-token validation are owned by the authenticated MCP caller. */
export async function confirmElenaLiveTourBooking(input: { callSid: string; sessionId: string; nonce: string }) {
  validIdentity(input.callSid, input.sessionId)
  if (!UUID.test(input.nonce)) throw new ElenaInboundTourBookingError('A current tour readback is required before booking.')
  const result = await supabaseRestStrict<{ booked: boolean; replayed: boolean; invitation_queued: boolean; slot: { date: string; time: string }; message: string }>('rpc/luxor_confirm_elena_inbound_tour', {
    method: 'POST', body: JSON.stringify({ p_call_sid: input.callSid, p_session_id: input.sessionId, p_nonce: input.nonce }),
  })
  if (result.booked && result.invitation_queued) {
    try {
      const row = await readVerifiedCall(input.callSid, input.sessionId)
      const receipt = row.metadata.booking_receipt as { nonce?: string; invitation_job_id?: string } | undefined
      if (receipt?.nonce === input.nonce && UUID.test(receipt.invitation_job_id || '')) {
        const [job] = await supabaseRestStrict<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${receipt.invitation_job_id}&inquiry_id=eq.${row.inquiry_id}&job_type=eq.calendar_invitation&status=eq.queued&limit=1`)
        if (job) {
          const { processLuxorEmailJobs } = await import('./luxorEmailJobsServer')
          await processLuxorEmailJobs([job], { markSending: true })
        }
      }
    } catch { /* The durable queue remains responsible for retrying; booking already succeeded. */ }
  }
  return result
}

/** Report only delivery evidence for this exact call's approved invitation. */
export async function getElenaLiveTourInvitationStatus(input: { callSid: string; sessionId: string }) {
  const row = await readVerifiedCall(input.callSid, input.sessionId)
  const receipt = row.metadata.booking_receipt as { invitation_job_id?: string; inquiry_id?: string } | undefined
  if (!receipt?.invitation_job_id || !UUID.test(receipt.invitation_job_id) || receipt.inquiry_id !== row.inquiry_id) return { status: 'not_requested', message: 'No calendar invitation was requested for this tour.' }
  const [jobs, messages] = await Promise.all([
    supabaseRestStrict<Array<{ status: string }>>(`luxor_email_jobs?select=status&id=eq.${receipt.invitation_job_id}&inquiry_id=eq.${row.inquiry_id}&job_type=eq.calendar_invitation&limit=1`),
    supabaseRestStrict<Array<{ status: string }>>(`luxor_mail_messages?select=status&direction=eq.outgoing&metadata->>emailJobId=eq.${receipt.invitation_job_id}&order=created_at.desc&limit=1`),
  ])
  const job = jobs[0], message = messages[0]
  if (!job) return { status: 'unavailable', message: 'The invitation status could not be verified.' }
  if (['bounced', 'failed', 'suppressed', 'complained'].includes(message?.status || '')) return { status: 'failed', message: 'The invitation could not be confirmed as delivered. Arianna can help follow up.' }
  if (['delivered', 'opened', 'clicked'].includes(message?.status || '')) return { status: 'delivered', message: 'The email provider reports that the invitation was delivered. The recipient can check their inbox.' }
  if (['failed', 'cancelled'].includes(job.status)) return { status: 'failed', message: 'The invitation could not be confirmed as delivered. Arianna can help follow up.' }
  if (job.status === 'sent' || ['sent', 'delivery_delayed'].includes(message?.status || '')) return { status: 'accepted', message: 'The invitation was sent to the email provider. Delivery is not confirmed yet.' }
  return { status: 'pending', message: 'The invitation is queued or sending. Delivery is not confirmed yet.' }
}
