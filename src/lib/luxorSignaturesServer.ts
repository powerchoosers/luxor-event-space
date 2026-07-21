import 'server-only'

import { LuxorBooking, LuxorSignatureRequest } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { createPublicToken } from './luxorEmailJobsServer'
import { updateLuxorBooking } from './luxorBookingsServer'

function defaultContractBody(booking: LuxorBooking) {
  const proposalItems = Array.isArray(booking.metadata?.proposalLineItems)
    ? booking.metadata.proposalLineItems as Array<{ description?: string; quantity?: number }>
    : []
  const serviceSummary = proposalItems.length
    ? ['Included services:', ...proposalItems.map((item) => `- ${item.description || 'Service'} x ${Number(item.quantity || 1)}`)].join('\n')
    : ''
  return [
    `This agreement reserves Luxor Event Space for ${booking.client_name}.`,
    `Event type: ${booking.event_type || 'Private event'}.`,
    `Event date: ${booking.event_date || 'To be confirmed'}.`,
    booking.guest_count ? `Estimated guest count: ${booking.guest_count}.` : '',
    `Contract total: $${Number(booking.contract_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    `Deposit required: $${Number(booking.deposit_required || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    serviceSummary,
    'By signing, the client confirms the reservation details and agrees to continue with Luxor Event Space booking requirements. Final legal language should be reviewed by the business owner.',
  ].filter(Boolean).join('\n\n')
}

export async function createLuxorSignatureRequest(booking: LuxorBooking) {
  if (!booking.email) {
    throw new Error('Booking needs a client email before a contract can be sent.')
  }

  const token = createPublicToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()

  const [created] = await supabaseRest<LuxorSignatureRequest[]>('luxor_signature_requests?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      booking_id: booking.id,
      inquiry_id: booking.inquiry_id,
      client_name: booking.client_name,
      client_email: booking.email,
      token,
      status: 'sent',
      contract_title: `${booking.event_type || 'Event'} Contract`,
      contract_body: defaultContractBody(booking),
      expires_at: expiresAt,
      metadata: {
        eventDate: booking.event_date,
        guestCount: booking.guest_count,
        contractTotal: booking.contract_total,
      },
    }),
  })

  await updateLuxorBooking(booking.id, {
    contract_status: 'sent',
    contract_sent_at: new Date().toISOString(),
  })

  return created
}

export async function getLuxorSignatureRequestByToken(token: string) {
  const [signature] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&token=eq.${encodeURIComponent(token)}&limit=1`,
  )

  return signature ?? null
}

export async function updateLuxorSignatureRequest(id: string, updates: Partial<LuxorSignatureRequest>) {
  const [updated] = await supabaseRest<LuxorSignatureRequest[]>(`luxor_signature_requests?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...updates,
      updated_at: new Date().toISOString(),
    }),
  })

  return updated ?? null
}

export async function recordLuxorSignatureEvent(data: {
  signatureRequestId: string
  eventType: string
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}) {
  await supabaseRest('luxor_signature_events', {
    method: 'POST',
    body: JSON.stringify({
      signature_request_id: data.signatureRequestId,
      event_type: data.eventType,
      ip_address: data.ip || null,
      user_agent: data.userAgent || null,
      metadata: data.metadata || {},
    }),
  })
}

export async function signLuxorSignatureRequest(input: {
  token: string
  signedName: string
  ip?: string | null
  userAgent?: string | null
}) {
  const signature = await getLuxorSignatureRequestByToken(input.token)
  if (!signature) throw new Error('Signature request not found.')
  if (signature.status === 'signed') return signature
  if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
    throw new Error('This signature link has expired.')
  }

  const signedAt = new Date().toISOString()
  const updated = await updateLuxorSignatureRequest(signature.id, {
    status: 'signed',
    signed_name: input.signedName,
    signed_at: signedAt,
    signer_ip: input.ip || null,
    signer_user_agent: input.userAgent || null,
  })

  await updateLuxorBooking(signature.booking_id, {
    contract_status: 'signed',
    contract_signed_at: signedAt,
    status: 'confirmed',
  })

  await recordLuxorSignatureEvent({
    signatureRequestId: signature.id,
    eventType: 'signed',
    ip: input.ip,
    userAgent: input.userAgent,
    metadata: { signedName: input.signedName },
  })

  return updated
}
