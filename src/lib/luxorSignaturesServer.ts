import 'server-only'

import { LuxorBooking, LuxorInvoice, LuxorSignatureRequest } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'
import { cancelQueuedLuxorEmailJobs, createPublicToken, createUniqueLuxorEmailJob, updateLuxorEmailJob } from './luxorEmailJobsServer'
import { getLuxorBooking, updateLuxorBooking } from './luxorBookingsServer'
import { buildExecutedLuxorContract, buildLuxorContractPdf, buildLuxorGuestGuidePdf, parseClientName } from './luxorContractPdfServer'
import { getLuxorContractSignaturePlacement, LUXOR_CONTRACT_SIGNATURE_PLACEMENT } from './luxorSignaturePlacement'
import { downloadLuxorPrivatePdf, saveLuxorPrivatePdf } from './luxorDocumentsServer'
import { sendLuxorZohoEmail } from './zohoMailServer'
import crypto from 'crypto'
import { getLuxorInquiry, updateLuxorInquiry } from './luxorInquiriesServer'
import { ensureLuxorDepositInvoice, ensureLuxorFinalBalanceInvoice, getInvoice, getInvoiceByBookingAndKind, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate } from './luxorInvoicesServer'
import { createNote } from './luxorNotesServer'
import { createLuxorPostContractCheckout } from './luxorStripeCheckoutServer'

const DEFAULT_OWNER_SIGNER_NAME = 'Arianna Patterson'

function resolveOwnerSignerName(value?: string | null) {
  const configuredName = value?.trim()
  if (!configuredName || configuredName.toLocaleLowerCase() === 'arianna') {
    return DEFAULT_OWNER_SIGNER_NAME
  }
  return configuredName
}

function formatMoney(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function getInitialPaymentBreakdown(invoice: LuxorInvoice) {
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
  const securityDeposit = Math.max(0, Number(lineItems.find((item) =>
    item.paymentBucket === 'security_deposit' || /refundable security deposit/i.test(item.description || ''),
  )?.total || 0))
  const initialBookingPayment = Math.max(0, Number(lineItems.find((item) =>
    item.paymentBucket === 'venue' || /initial booking payment/i.test(item.description || ''),
  )?.total || Number(invoice.total || 0) - securityDeposit))

  return {
    initialBookingPayment,
    securityDeposit,
    total: Number(invoice.total || initialBookingPayment + securityDeposit),
  }
}

function configuredFinalPaymentDueDate(booking: LuxorBooking) {
  const dueDate = booking.final_payment_due_date || luxorFinalPaymentDueDate(booking.event_date)
  return typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null
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
    booking.guest_count ? `Expected guest count: ${booking.guest_count}.` : '',
    `Contract total: $${Number(booking.contract_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    `Deposit required: $${Number(booking.deposit_required || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    `Refundable security deposit: $${Number(booking.security_deposit_amount ?? 750).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    Number((booking.metadata?.proposalOffer as { percent?: number } | undefined)?.percent || 0) > 0
      ? `Approved adjustment: ${(booking.metadata?.proposalOffer as { percent?: number }).percent}% off, saving $${Number((booking.metadata?.proposalOffer as { savings?: number }).savings || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, already reflected in the locked Final Event Price.`
      : '',
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
    securityDepositAmount: Number(booking.security_deposit_amount ?? 750),
    finalPaymentDueDate: booking.final_payment_due_date,
    notes: booking.notes,
    proposalLineItems: booking.metadata?.proposalLineItems || [],
    proposalTaxRate: booking.metadata?.proposalTaxRate || 0,
    proposalOffer: booking.metadata?.proposalOffer || null,
  })).digest('hex')
}

export async function createLuxorSignatureRequest(booking: LuxorBooking, options?: { status?: 'draft' | 'sent'; signingMode?: 'email' | 'in_person' }) {
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
      status: options?.status || 'sent',
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
        signingMode: options?.signingMode || 'email',
      },
    }),
  })

  const contractPath = `contracts/${booking.id}/${created.id}/Luxor-Event-Agreement.pdf`
  const guidePath = `contracts/${booking.id}/${created.id}/Luxor-Guest-Guide.pdf`
  const [contractResult, guestGuidePdf] = await Promise.all([
    buildLuxorContractPdf(booking, created.id, created.created_at),
    buildLuxorGuestGuidePdf(booking),
  ])
  const contractPdf = contractResult.pdf
  await Promise.all([
    saveLuxorPrivatePdf(contractPath, contractPdf),
    saveLuxorPrivatePdf(guidePath, guestGuidePdf),
  ])
  const ready = await updateLuxorSignatureRequest(created.id, {
    contract_document_path: contractPath,
    guest_guide_path: guidePath,
    document_hash: crypto.createHash('sha256').update(contractPdf).digest('hex'),
    metadata: { ...(created.metadata || {}), signaturePlacement: contractResult.signaturePlacement },
  })

  if ((options?.status || 'sent') === 'sent') {
    await updateLuxorBooking(booking.id, {
      contract_status: 'sent',
      contract_sent_at: new Date().toISOString(),
    })
    await recordLuxorSignatureEvent({ signatureRequestId: created.id, eventType: 'sent', metadata: { ownerName, ownerEmail } })
  } else {
    await updateLuxorBooking(booking.id, { contract_status: 'not_sent' })
    await recordLuxorSignatureEvent({ signatureRequestId: created.id, eventType: 'drafted', metadata: { ownerName, ownerEmail, signingMode: options?.signingMode || 'email' } })
  }
  return ready || created
}

export async function getLuxorSignatureRequestByToken(token: string) {
  const [signature] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&token=eq.${encodeURIComponent(token)}&limit=1`,
  )

  return signature ?? null
}

export async function getLuxorSignatureRequestById(id: string) {
  const [signature] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
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
      let finalPaymentScheduleMissing = false
      if (booking && depositPaid) {
        const masterInvoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
        const finalPaymentDueDate = configuredFinalPaymentDueDate(booking)
        // A historical booking may have a paid initial payment but no approved
        // final-payment date. The agreement is already signed at this point,
        // so preserve it and flag the missing schedule instead of throwing
        // after the client has completed their side of the contract.
        finalPaymentScheduleMissing = Boolean(masterInvoice) && !finalPaymentDueDate
        const finalInvoice = masterInvoice && finalPaymentDueDate ? await ensureLuxorFinalBalanceInvoice({
          masterInvoice,
          bookingId: booking.id,
          dueDate: finalPaymentDueDate,
          depositPaid: Number(booking.deposit_required || 0),
          securityDepositAmount: booking.security_deposit_amount,
        }) : null
        reconciledBooking = await updateLuxorBooking(booking.id, {
          status: 'confirmed',
          booked_at: booking.booked_at || signedAt,
          metadata: {
            ...booking.metadata,
            reservation_confirmed_at: booking.metadata?.reservation_confirmed_at || signedAt,
            reservation_state: 'confirmed',
            ...(finalInvoice ? { final_balance_invoice_id: finalInvoice.id } : {}),
            ...(finalPaymentScheduleMissing ? {
              final_payment_schedule_configuration_required_at: booking.metadata?.final_payment_schedule_configuration_required_at || signedAt,
            } : {}),
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
        await createNote(
          signature.inquiry_id,
          finalPaymentScheduleMissing
            ? 'Agreement signed and the reservation deposit confirmed. The event date is reserved, but the approved proposal is missing its final payment due date. Configure that date before sending the final balance request.'
            : 'Agreement signed and the reservation deposit confirmed. The event date is officially reserved and the booking moved to Planning.',
          'status_change',
          'Booking Automation',
        ).catch(() => null)
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
  // One canonical execution instant prevents signature-page and certificate dates
  // drifting across a midnight boundary. The separate event log retains audit timing.
  const ownerSignedAt = signature.owner_signed_at || signedAt
  const existingEvents = await listLuxorSignatureEvents(signature.id)
  if (!existingEvents.some((event) => event.event_type === 'owner_countersigned')) {
    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'owner_countersigned',
      metadata: { ownerName, automatic: true, systemRecordedAt: new Date().toISOString(), executionAt: signedAt },
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

  let checkoutUrl: string | null = null
  let paymentInvoice: LuxorInvoice | null = null
  try {
    const [booking, inquiry] = await Promise.all([
      getLuxorBooking(signature.booking_id),
      signature.inquiry_id ? getLuxorInquiry(signature.inquiry_id) : Promise.resolve(null),
    ])
    if (!booking || booking.contract_status !== 'signed') {
      throw new Error('The signed booking could not be verified before creating the payment request.')
    }
    if (!inquiry) {
      throw new Error('The signed booking needs its inquiry record before a payment request can be sent.')
    }
    const masterInvoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
    if (!masterInvoice) {
      throw new Error('The signed booking needs its finalized proposal before a payment request can be created.')
    }

    // The booking status is verified as signed above before either the child
    // invoice or Stripe Checkout can be created. `ensure…` reuses the same
    // deposit record if this completion path is retried.
    paymentInvoice = await ensureLuxorDepositInvoice({
      masterInvoice,
      bookingId: booking.id,
      dueDate: signedAt.slice(0, 10),
      reservationDepositAmount: booking.deposit_required,
    })
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    const checkout = await createLuxorPostContractCheckout({
      invoice: paymentInvoice,
      inquiry,
      booking,
      origin,
      paymentAmount: Number(paymentInvoice.total || 0),
      paymentLabel: 'Initial Booking Payment + Refundable Security Deposit',
      masterInvoiceId: masterInvoice.id,
    })
    checkoutUrl = checkout?.checkoutUrl || null
    if (!checkoutUrl) {
      throw new Error('Stripe did not return a secure payment link for the signed booking.')
    }
  } catch (paymentError) {
    console.error('Contract was signed, but the post-sign Stripe payment request could not be created:', paymentError)
  }

  const paymentBreakdown = paymentInvoice ? getInitialPaymentBreakdown(paymentInvoice) : null
  const paymentSection = checkoutUrl && paymentBreakdown ? `<div style="margin:28px 0;padding:22px;border:1px solid #d9bd84;background:#fffaf2"><p style="margin:0 0 8px;color:#9b6d24;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Next step: complete your booking payment</p><p style="margin:0 0 12px">Your secure payment due now is <strong>${formatMoney(paymentBreakdown.total)}</strong>: an initial booking payment of ${formatMoney(paymentBreakdown.initialBookingPayment)} plus a separate refundable security deposit of ${formatMoney(paymentBreakdown.securityDeposit)}.</p><p style="margin:0 0 18px">The refundable security deposit is held throughout the event period and returned following the post-event inspection, subject to the Event Agreement.</p><a href="${checkoutUrl}" style="display:inline-block;background:#caa24c;color:#17120c;text-decoration:none;padding:14px 22px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Complete secure payment</a></div>` : '<p style="color:#756755">Luxor will follow up separately with secure payment instructions.</p>'
  const completionHtml = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#f8f3e9;color:#221d18;padding:36px;border-top:4px solid #b98a3d"><p style="letter-spacing:.28em;text-transform:uppercase;color:#9b6d24;font-size:12px;font-weight:700">Luxor Event Space</p><h1 style="font-family:Georgia,serif;font-size:34px">Your agreement is complete</h1><p>Hi ${input.signedName.split(' ')[0] || input.signedName},</p><p>Your Event Space Agreement has been signed by you and countersigned by ${ownerName}. Your fully executed copy is attached for your records.</p>${paymentSection}<p style="color:#756755;font-size:13px">Document ID: ${signature.id}<br/>Completed: ${new Date(ownerSignedAt).toLocaleString('en-US')}</p></div>`
  const paymentEmailSummary = checkoutUrl && paymentBreakdown
    ? `Your agreement is complete. Complete your secure payment of ${formatMoney(paymentBreakdown.total)}: ${formatMoney(paymentBreakdown.initialBookingPayment)} initial booking payment plus ${formatMoney(paymentBreakdown.securityDeposit)} refundable security deposit. ${checkoutUrl}`
    : 'Your agreement is complete. Your fully executed copy is attached. Luxor will follow up with secure payment instructions.'
  const clientJob = await createUniqueLuxorEmailJob({
    inquiryId: signature.inquiry_id,
    bookingId: signature.booking_id,
    signatureRequestId: signature.id,
    jobType: 'contract_signature',
    recipientEmail: signature.client_email,
    subject: checkoutUrl ? 'Agreement complete — complete your secure booking payment' : 'Your Luxor Event Space agreement is complete',
    body: paymentEmailSummary,
    scheduledFor: ownerSignedAt,
    automationKey: `contract_completed_payment:${signature.id}:${paymentInvoice?.id || 'unavailable'}`,
    metadata: {
      automated: true,
      flow_stage: 'contract_completed',
      includes_executed_contract: true,
      includes_payment_link: Boolean(checkoutUrl),
      payment_invoice_id: paymentInvoice?.id || null,
      payment_amount: paymentBreakdown?.total || null,
    },
  })
  if (clientJob.status !== 'sent') {
    try {
      await sendLuxorZohoEmail({
        to: signature.client_email,
        subject: checkoutUrl ? 'Agreement complete — complete your secure booking payment' : 'Your Luxor Event Space agreement is complete',
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
