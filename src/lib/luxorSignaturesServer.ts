import 'server-only'

import { LuxorBooking, LuxorSignatureRequest } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { createPublicToken } from './luxorEmailJobsServer'
import { updateLuxorBooking } from './luxorBookingsServer'
import { buildExecutedLuxorContract, buildLuxorContractPdf, buildLuxorGuestGuidePdf, parseClientName } from './luxorContractPdfServer'
import { downloadLuxorPrivatePdf, saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { sendLuxorZohoEmail } from './zohoMailServer'
import crypto from 'crypto'

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
  const active = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&booking_id=eq.${encodeURIComponent(booking.id)}&status=in.(sent,viewed)&limit=1`,
  )
  if (active.length) {
    throw new Error('This booking already has an active signing link. Open the contract record instead of sending a duplicate.')
  }

  const token = createPublicToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()

  const ownerName = process.env.LUXOR_OWNER_SIGNER_NAME || 'Arianna'
  const ownerEmail = process.env.LUXOR_OWNER_SIGNER_EMAIL || 'booking@luxoratlaspalmas.com'
  const parsedName = parseClientName(booking.client_name)
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
      client_first_name: parsedName.firstName,
      client_last_name: parsedName.lastName,
      owner_name: ownerName,
      owner_email: ownerEmail,
      expires_at: expiresAt,
      metadata: {
        eventDate: booking.event_date,
        guestCount: booking.guest_count,
        contractTotal: booking.contract_total,
      },
    }),
  })

  const contractPath = `contracts/${booking.id}/${created.id}/Luxor-Event-Agreement.pdf`
  const guidePath = `contracts/${booking.id}/${created.id}/Luxor-Guest-Guide.pdf`
  const [contractPdf, guestGuidePdf] = await Promise.all([
    buildLuxorContractPdf(booking, created.id),
    buildLuxorGuestGuidePdf(booking),
  ])
  await Promise.all([
    saveLuxorPrivatePdf(contractPath, contractPdf),
    saveLuxorPrivatePdf(guidePath, guestGuidePdf),
  ])
  const ready = await updateLuxorSignatureRequest(created.id, {
    contract_document_path: contractPath,
    guest_guide_path: guidePath,
    document_hash: crypto.createHash('sha256').update(contractPdf).digest('hex'),
  })

  await updateLuxorBooking(booking.id, {
    contract_status: 'sent',
    contract_sent_at: new Date().toISOString(),
  })

  await recordLuxorSignatureEvent({ signatureRequestId: created.id, eventType: 'sent', metadata: { ownerName, ownerEmail } })
  return ready || created
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

export async function listLuxorSignatureEvents(signatureRequestId: string) {
  return supabaseRest<Array<{ created_at: string; event_type: string; ip_address?: string | null; user_agent?: string | null }>>(
    `luxor_signature_events?select=*&signature_request_id=eq.${encodeURIComponent(signatureRequestId)}&order=created_at.asc`,
  )
}

export async function signLuxorSignatureRequest(input: {
  token: string
  signedName: string
  ip?: string | null
  userAgent?: string | null
}) {
  const signature = await getLuxorSignatureRequestByToken(input.token)
  if (!signature) throw new Error('Signature request not found.')
  if (signature.status === 'signed' && signature.executed_document_path) return signature
  if (signature.status !== 'signed' && signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
    throw new Error('This signature link has expired.')
  }

  const signedAt = signature.signed_at || new Date().toISOString()
  let updated: LuxorSignatureRequest | null = signature
  if (signature.status !== 'signed') {
    updated = await updateLuxorSignatureRequest(signature.id, {
      status: 'signed',
      signed_name: input.signedName,
      signed_at: signedAt,
      signer_ip: input.ip || null,
      signer_user_agent: input.userAgent || null,
    })

    await updateLuxorBooking(signature.booking_id, {
      contract_status: 'signed',
      contract_signed_at: signedAt,
    })

    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'signed',
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { signedName: input.signedName },
    })
  }

  const ownerName = signature.owner_name || process.env.LUXOR_OWNER_SIGNER_NAME || 'Arianna'
  const ownerEmail = signature.owner_email || process.env.LUXOR_OWNER_SIGNER_EMAIL || 'booking@luxoratlaspalmas.com'
  const ownerSignedAt = signature.owner_signed_at || new Date().toISOString()
  const existingEvents = await listLuxorSignatureEvents(signature.id)
  if (!existingEvents.some((event) => event.event_type === 'owner_countersigned')) {
    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'owner_countersigned',
      metadata: { ownerName, automatic: true },
    })
  }
  const events = await listLuxorSignatureEvents(signature.id)
  const original = await downloadLuxorPrivatePdf(signature.contract_document_path || '')
  const executed = await buildExecutedLuxorContract({
    original,
    signature,
    clientName: signature.signed_name || input.signedName,
    clientEmail: signature.client_email,
    clientSignedAt: signedAt,
    ownerName,
    ownerEmail,
    ownerSignedAt,
    events,
  })
  const executedPath = `contracts/${signature.booking_id}/${signature.id}/Luxor-Event-Agreement-Executed.pdf`
  const auditPath = `contracts/${signature.booking_id}/${signature.id}/audit/Luxor-Event-Agreement-Audit.pdf`
  await Promise.all([
    saveLuxorPrivatePdf(executedPath, executed.customer.bytes),
    saveLuxorPrivatePdf(auditPath, executed.audit.bytes),
  ])
  const completed = await updateLuxorSignatureRequest(signature.id, {
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_signed_at: ownerSignedAt,
    executed_document_path: executedPath,
    audit_document_path: auditPath,
    document_hash: executed.customer.hash,
  })
  await recordLuxorSignatureEvent({ signatureRequestId: signature.id, eventType: 'completed' })

  const completionHtml = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#f8f3e9;color:#221d18;padding:36px;border-top:4px solid #b98a3d"><p style="letter-spacing:.28em;text-transform:uppercase;color:#9b6d24;font-size:12px;font-weight:700">Luxor Event Space</p><h1 style="font-family:Georgia,serif;font-size:34px">Your agreement is complete</h1><p>Hi ${input.signedName.split(' ')[0] || input.signedName},</p><p>Your Event Space Agreement has been signed by you and countersigned by ${ownerName}. Your fully executed copy is attached for your records.</p><p style="color:#756755;font-size:13px">Document ID: ${signature.id}<br/>Completed: ${new Date(ownerSignedAt).toLocaleString('en-US')}</p></div>`
  await Promise.allSettled([
    sendLuxorZohoEmail({
      to: signature.client_email,
      subject: 'Your Luxor Event Space agreement is complete',
      content: completionHtml,
      from: 'booking@luxoratlaspalmas.com',
      fromName: 'Luxor Event Space',
      attachments: [{ filename: 'Luxor-Event-Agreement-Executed.pdf', content: executed.customer.bytes, contentType: 'application/pdf' }],
    }),
    sendLuxorZohoEmail({
      to: ownerEmail,
      subject: `Executed Luxor agreement - ${input.signedName}`,
      content: `<div style="font-family:Arial,sans-serif"><h2>Executed agreement archived</h2><p>${input.signedName} completed the agreement. The internal copy with the full audit timeline is attached.</p></div>`,
      from: 'booking@luxoratlaspalmas.com',
      fromName: 'Luxor Event Space',
      attachments: [{ filename: 'Luxor-Event-Agreement-Audit.pdf', content: executed.audit.bytes, contentType: 'application/pdf' }],
    }),
  ])

  return completed || updated || signature
}
