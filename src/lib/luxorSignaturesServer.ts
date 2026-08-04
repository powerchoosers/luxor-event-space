import 'server-only'

import { LuxorBooking, LuxorSignatureRequest } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { cancelQueuedLuxorEmailJobs, createLuxorEmailJob, createPublicToken, updateLuxorEmailJob } from './luxorEmailJobsServer'
import { getLuxorBooking, updateLuxorBooking } from './luxorBookingsServer'
import { buildExecutedLuxorContract, buildLuxorContractPdf, buildLuxorGuestGuidePdf, parseClientName } from './luxorContractPdfServer'
import { getLuxorContractSignaturePlacement, LUXOR_CONTRACT_SIGNATURE_PLACEMENT } from './luxorSignaturePlacement'
import { downloadLuxorPrivatePdf, saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { sendLuxorZohoEmail } from './zohoMailServer'
import crypto from 'crypto'
import { getLuxorInquiry, updateLuxorInquiry } from './luxorInquiriesServer'
import { ensureLuxorFinalBalanceInvoice, getInvoice, getInvoiceByBookingAndKind, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate } from './luxorInvoicesServer'
import { createLuxorPostContractCheckout } from './luxorStripeCheckoutServer'
import { createNote } from './luxorNotesServer'

const DEFAULT_OWNER_SIGNER_NAME = 'Arianna Patterson'

function resolveOwnerSignerName(value?: string | null) {
  const configuredName = value?.trim()
  if (!configuredName || configuredName.toLocaleLowerCase() === 'arianna') {
    return DEFAULT_OWNER_SIGNER_NAME
  }
  return configuredName
}

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

export function getLuxorBookingContractFingerprint(booking: LuxorBooking) {
  return crypto.createHash('sha256').update(JSON.stringify({
    clientName: booking.client_name,
    email: booking.email,
    eventType: booking.event_type,
    eventDate: booking.event_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    guestCount: booking.guest_count,
    packageName: booking.package_name,
    contractTotal: Number(booking.contract_total || 0),
    depositRequired: Number(booking.deposit_required || 0),
    finalPaymentDueDate: booking.final_payment_due_date,
    notes: booking.notes,
    proposalLineItems: booking.metadata?.proposalLineItems || [],
    proposalTaxRate: booking.metadata?.proposalTaxRate || 0,
  })).digest('hex')
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

  const ownerName = resolveOwnerSignerName(process.env.LUXOR_OWNER_SIGNER_NAME)
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
        documentVersion: 2,
        signaturePlacement: LUXOR_CONTRACT_SIGNATURE_PLACEMENT,
        eventDate: booking.event_date,
        guestCount: booking.guest_count,
        contractTotal: booking.contract_total,
        bookingFingerprint: getLuxorBookingContractFingerprint(booking),
      },
    }),
  })

  const contractPath = `contracts/${booking.id}/${created.id}/Luxor-Event-Agreement.pdf`
  const guidePath = `contracts/${booking.id}/${created.id}/Luxor-Guest-Guide.pdf`
  const [contractPdf, guestGuidePdf] = await Promise.all([
    buildLuxorContractPdf(booking, created.id, created.created_at),
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

export async function getActiveLuxorSignatureRequestByBooking(bookingId: string) {
  const [signature] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&status=in.(sent,viewed)&order=created_at.desc&limit=1`,
  )

  return signature ?? null
}

export async function getLatestLuxorSignatureRequestByBooking(bookingId: string) {
  const [signature] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc&limit=1`,
  )

  return signature ?? null
}

export async function listLuxorSignatureRequests(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 250)
  return supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&order=updated_at.desc&limit=${encodeURIComponent(safeLimit)}`,
  )
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
  signatureDataUrl: string
  ip?: string | null
  userAgent?: string | null
}) {
  const signature = await getLuxorSignatureRequestByToken(input.token)
  if (!signature) throw new Error('Signature request not found.')
  if (signature.status === 'signed' && signature.executed_document_path) return signature
  if (!['sent', 'viewed'].includes(signature.status)) {
    throw new Error('This signing link is no longer active. Please contact Luxor Event Space for a new agreement.')
  }
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

    if (signature.inquiry_id) {
      const [booking, inquiry] = await Promise.all([
        getLuxorBooking(signature.booking_id),
        getLuxorInquiry(signature.inquiry_id),
      ])
      const depositInvoice = booking ? await getInvoiceByBookingAndKind(booking.id, 'deposit') : null
      const depositPayments = depositInvoice ? await listPaidPaymentsByInvoice(depositInvoice.id) : []
      const depositPaid = Boolean(depositInvoice) && depositPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) + 0.005 >= Number(depositInvoice?.total || 0)
      let reconciledBooking = booking
      if (booking && depositPaid) {
        const masterInvoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
        const finalInvoice = masterInvoice ? await ensureLuxorFinalBalanceInvoice({
          masterInvoice,
          bookingId: booking.id,
          dueDate: booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date),
          depositPaid: Number(booking.deposit_required || 0),
        }) : null
        reconciledBooking = await updateLuxorBooking(booking.id, {
          status: 'confirmed',
          booked_at: booking.booked_at || signedAt,
          metadata: {
            ...booking.metadata,
            reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || signedAt,
            reservation_state: 'confirmed',
            ...(finalInvoice ? { final_balance_invoice_id: finalInvoice.id } : {}),
          },
        }) || booking
      }
      if (inquiry && inquiry.status !== 'closed_lost') {
        await updateLuxorInquiry(inquiry.id, {
          status: 'booked',
          pipeline_stage: depositPaid ? 'planning' : 'deposit',
          metadata: { ...inquiry.metadata, contract_signed_at: signedAt },
        })
      }
      if (depositPaid && reconciledBooking) {
        await createNote(signature.inquiry_id, 'Agreement signed and 30% deposit confirmed. The event date is officially reserved and the booking moved to Planning.', 'status_change', 'Booking Automation').catch(() => null)
      }
      await cancelQueuedLuxorEmailJobs(signature.inquiry_id, ['contract_view_reminder', 'contract_signature_reminder'])
    }

    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'signed',
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { signedName: input.signedName },
    })
  }

  const ownerName = resolveOwnerSignerName(signature.owner_name || process.env.LUXOR_OWNER_SIGNER_NAME)
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
    clientSignatureDataUrl: input.signatureDataUrl,
    signaturePlacement: getLuxorContractSignaturePlacement(signature.metadata),
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

  let paymentRequest: Awaited<ReturnType<typeof createLuxorPostContractCheckout>> = null
  try {
    const [booking, inquiry] = await Promise.all([
      getLuxorBooking(signature.booking_id),
      signature.inquiry_id ? getLuxorInquiry(signature.inquiry_id) : Promise.resolve(null),
    ])
    const masterInvoice = booking?.invoice_id ? await getInvoice(booking.invoice_id) : null
    const depositInvoice = booking ? await getInvoiceByBookingAndKind(booking.id, 'deposit') : null
    const paymentInvoice = depositInvoice || masterInvoice
    if (booking && inquiry && paymentInvoice) {
      paymentRequest = await createLuxorPostContractCheckout({
        booking,
        inquiry,
        invoice: paymentInvoice,
        origin: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com',
        paymentAmount: paymentInvoice.invoice_kind === 'deposit' ? Number(paymentInvoice.total) : undefined,
        paymentLabel: paymentInvoice.invoice_kind === 'deposit' ? '30% non-refundable booking deposit' : undefined,
        masterInvoiceId: masterInvoice?.id,
      })
    }
  } catch (paymentError) {
    console.error('Contract was signed, but the post-sign Stripe request could not be created:', paymentError)
  }

  const paymentSection = paymentRequest
    ? `<div style="margin:28px 0;padding:22px;border:1px solid #d9bd84;background:#fffaf2"><p style="margin:0 0 8px;color:#9b6d24;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Next step: ${paymentRequest.paymentLabel}</p><p style="margin:0 0 18px;font-family:Georgia,serif;font-size:27px">$${paymentRequest.paymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><a href="${paymentRequest.checkoutUrl}" style="display:inline-block;background:#caa24c;color:#17120c;text-decoration:none;padding:14px 22px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Pay securely with Stripe</a></div>`
    : '<p style="color:#756755">Luxor will follow up separately with the secure payment link.</p>'
  const completionHtml = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#f8f3e9;color:#221d18;padding:36px;border-top:4px solid #b98a3d"><p style="letter-spacing:.28em;text-transform:uppercase;color:#9b6d24;font-size:12px;font-weight:700">Luxor Event Space</p><h1 style="font-family:Georgia,serif;font-size:34px">Your agreement is complete</h1><p>Hi ${input.signedName.split(' ')[0] || input.signedName},</p><p>Your Event Space Agreement has been signed by you and countersigned by ${ownerName}. Your fully executed copy is attached for your records.</p>${paymentSection}<p style="color:#756755;font-size:13px">Document ID: ${signature.id}<br/>Completed: ${new Date(ownerSignedAt).toLocaleString('en-US')}</p></div>`
  const clientJob = await createLuxorEmailJob({
    inquiryId: signature.inquiry_id,
    bookingId: signature.booking_id,
    signatureRequestId: signature.id,
    jobType: 'contract_signature',
    recipientEmail: signature.client_email,
    subject: paymentRequest ? 'Agreement complete — secure your Luxor date' : 'Your Luxor Event Space agreement is complete',
    body: paymentRequest
      ? `Your agreement is complete. Pay your ${paymentRequest.paymentLabel.toLowerCase()} securely: ${paymentRequest.checkoutUrl}`
      : 'Your agreement is complete. Your executed copy is attached.',
    scheduledFor: ownerSignedAt,
    metadata: { automated: true, flow_stage: 'contract_completed', includes_executed_contract: true, includes_payment_link: Boolean(paymentRequest) },
  })
  try {
    await sendLuxorZohoEmail({
      to: signature.client_email,
      subject: paymentRequest ? 'Agreement complete — secure your Luxor date' : 'Your Luxor Event Space agreement is complete',
      content: completionHtml,
      from: 'booking@luxoratlaspalmas.com',
      fromName: 'Luxor Event Space',
      attachments: [{ filename: 'Luxor-Event-Agreement-Executed.pdf', content: executed.customer.bytes, contentType: 'application/pdf' }],
    })
    await updateLuxorEmailJob(clientJob.id, { status: 'sent', sent_at: new Date().toISOString() })
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : 'Email send failed.'
    await updateLuxorEmailJob(clientJob.id, { status: 'failed', last_error: message })
    if (signature.inquiry_id) {
      await createNote(signature.inquiry_id, `Agreement completed, but the client email failed: ${message}`, 'note', 'Signature Automation').catch(() => null)
    }
    console.error('Agreement completed, but the client completion and payment email failed:', message)
  }
  await Promise.allSettled([
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
