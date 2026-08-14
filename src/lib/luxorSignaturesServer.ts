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
import { ensureLuxorDepositInvoice, ensureLuxorFinalBalanceInvoice, ensureLuxorSecurityDepositInvoice, getInvoice, getInvoiceByBookingAndKind, listPaidPaymentsByInvoice, luxorFinalPaymentDueDate } from './luxorInvoicesServer'
import { syncLuxorPaymentInstallments } from './luxorPaymentInstallmentsServer'
import { createNote, listNotesByInquiry } from './luxorNotesServer'
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

/**
 * An agreement is safe to activate only after both of the customer-facing
 * attachments have reached private storage.  Keeping this check in one place
 * lets acceptance retries replace an interrupted preparation instead of
 * reviving a link that cannot open its contract.
 */
export function hasLuxorSignatureDeliveryDocuments(signature: Pick<LuxorSignatureRequest, 'contract_document_path' | 'guest_guide_path'>) {
  return Boolean(signature.contract_document_path?.trim() && signature.guest_guide_path?.trim())
}

const FRESH_SIGNATURE_PREPARATION_MS = 2 * 60 * 1000
const FRESH_AGREEMENT_DELIVERY_CLAIM_MS = 2 * 60 * 1000

function isFreshPreparingSignature(signature: LuxorSignatureRequest, now = Date.now()) {
  if (signature.status !== 'draft' || signature.metadata?.documentPreparationState !== 'preparing') return false
  const startedAt = Date.parse(signature.updated_at || signature.created_at)
  return Number.isFinite(startedAt) && startedAt > now - FRESH_SIGNATURE_PREPARATION_MS
}

function agreementDeliveryState(signature: LuxorSignatureRequest) {
  const state = signature.metadata?.agreementDeliveryState
  return state === 'preparing' || state === 'delivered' || state === 'failed' || state === 'retry_requested' ? state : null
}

function hasFreshAgreementDeliveryClaim(signature: LuxorSignatureRequest, now = Date.now()) {
  if (agreementDeliveryState(signature) !== 'preparing') return false
  const claimedAt = typeof signature.metadata?.agreementDeliveryClaimedAt === 'string'
    ? Date.parse(signature.metadata.agreementDeliveryClaimedAt)
    : Date.parse(signature.updated_at || signature.created_at)
  return Number.isFinite(claimedAt) && claimedAt > now - FRESH_AGREEMENT_DELIVERY_CLAIM_MS
}

type CreateLuxorSignatureRequestOptions = {
  status?: 'draft' | 'sent'
  signingMode?: 'email' | 'in_person'
  /** Public proposal acceptance may safely wait on another request's fresh draft. */
  allowInFlightDraft?: boolean
  /** Used only by idempotent recovery flows that must reuse the same agreement. */
  reuseExisting?: boolean
}

export async function createLuxorSignatureRequest(booking: LuxorBooking, options?: CreateLuxorSignatureRequestOptions) {
  if (!booking.email) {
    throw new Error('Booking needs a client email before a contract can be sent.')
  }
  const [inquiry, invoice] = await Promise.all([
    booking.inquiry_id ? getLuxorInquiry(booking.inquiry_id) : Promise.resolve(null),
    booking.invoice_id ? getInvoice(booking.invoice_id) : Promise.resolve(null),
  ])
  if (booking.status === 'cancelled' || inquiry?.status === 'closed_lost' || invoice?.status === 'cancelled') {
    throw new Error('This opportunity is closed, so a new Event Agreement cannot be created.')
  }
  const active = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&booking_id=eq.${encodeURIComponent(booking.id)}&status=in.(draft,sent,viewed)&order=created_at.desc&limit=20`,
  )
  const readyActive = active.find((signature) => signature.status !== 'draft' && hasLuxorSignatureDeliveryDocuments(signature))
  if (readyActive) {
    if (options?.reuseExisting) return readyActive
    throw new Error('This booking already has an active signing link. Open the contract record instead of sending a duplicate.')
  }

  const readyDraft = active.find((signature) => signature.status === 'draft' && hasLuxorSignatureDeliveryDocuments(signature))
  if (readyDraft) {
    if (options?.reuseExisting || options?.status === 'draft') return readyDraft
    throw new Error('This booking already has a prepared agreement. Open the contract record instead of creating a duplicate.')
  }

  const freshDraft = active.find((signature) => isFreshPreparingSignature(signature))
  if (freshDraft) {
    if (options?.allowInFlightDraft) return freshDraft
    throw new Error('An Event Agreement is currently being prepared. Please wait a moment and retry instead of creating another contract.')
  }

  // A legacy/interrupted request may be marked sent even though its PDFs were
  // never saved. Do not let it block a safe retry or create a second live
  // client link beside it.
  for (const incomplete of active) {
    const voidedAt = new Date().toISOString()
    const voided = await updateLuxorSignatureRequest(incomplete.id, {
      status: 'void',
      expires_at: voidedAt,
      metadata: {
        ...(incomplete.metadata || {}),
        voidedAt,
        voidReason: 'agreement_documents_unavailable',
      },
    })
    if (!voided) {
      throw new Error('An incomplete agreement could not be safely retired. Please try again before sending a new contract.')
    }
    await recordLuxorSignatureEvent({
      signatureRequestId: incomplete.id,
      eventType: 'voided',
      metadata: { reason: 'agreement_documents_unavailable', recovery: true },
    }).catch((error) => console.error('Incomplete agreement was retired, but its audit event could not be saved:', error))
  }

  const token = createPublicToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  // An agreement is only "sent" after Zoho accepts the actual message.  The
  // PDF-preparation helper must never make that claim on behalf of a caller:
  // a later attachment or provider failure would otherwise leave the portal
  // showing a contract that the client never received.
  const requestedStatus = 'draft' as const

  const ownerName = resolveOwnerSignerName(process.env.LUXOR_OWNER_SIGNER_NAME)
  const ownerEmail = process.env.LUXOR_OWNER_SIGNER_EMAIL || 'booking@luxoratlaspalmas.com'
  const parsedName = parseClientName(booking.client_name)
  let created: LuxorSignatureRequest | null = null
  try {
    const [inserted] = await supabaseRest<LuxorSignatureRequest[]>('luxor_signature_requests?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        booking_id: booking.id,
        inquiry_id: booking.inquiry_id,
        client_name: booking.client_name,
        client_email: booking.email,
        token,
        // Never expose a link until the contract and guide PDFs are both
        // durable. A failed preparation remains an inactive draft and is then
        // retired below, which makes a client acceptance retry safe.
        status: 'draft',
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
          documentPreparationState: 'preparing',
          requestedStatus,
        },
      }),
    })
    created = inserted ?? null
  } catch (error) {
    // The database-level one-active-agreement guard can be won by another
    // browser request after the read above. Reuse that exact request for an
    // idempotent public acceptance rather than voiding its fresh draft.
    const concurrent = await getLatestLuxorSignatureRequestByBooking(booking.id).catch(() => null)
    if (concurrent?.status === 'draft' && isFreshPreparingSignature(concurrent) && (options?.allowInFlightDraft || options?.status === 'draft')) {
      return concurrent
    }
    if (concurrent && hasLuxorSignatureDeliveryDocuments(concurrent) && options?.reuseExisting) {
      return concurrent
    }
    throw error
  }
  if (!created) throw new Error('The agreement record could not be prepared. Please try again.')

  const contractPath = `contracts/${booking.id}/${created.id}/Luxor-Event-Agreement.pdf`
  const guidePath = `contracts/${booking.id}/${created.id}/Luxor-Guest-Guide.pdf`
  let ready: LuxorSignatureRequest | null = null
  try {
    const [contractResult, guestGuidePdf] = await Promise.all([
      buildLuxorContractPdf(booking, created.id, created.created_at),
      buildLuxorGuestGuidePdf(booking),
    ])
    const contractPdf = contractResult.pdf
    await Promise.all([
      saveLuxorPrivatePdf(contractPath, contractPdf),
      saveLuxorPrivatePdf(guidePath, guestGuidePdf),
    ])
    ready = await updateLuxorSignatureRequest(created.id, {
      status: requestedStatus,
      contract_document_path: contractPath,
      guest_guide_path: guidePath,
      document_hash: crypto.createHash('sha256').update(contractPdf).digest('hex'),
      metadata: {
        ...(created.metadata || {}),
        signaturePlacement: contractResult.signaturePlacement,
        documentPreparationState: 'ready',
        documentPreparedAt: new Date().toISOString(),
      },
    })
    if (!ready || !hasLuxorSignatureDeliveryDocuments(ready)) {
      throw new Error('The agreement documents could not be attached to the signing record.')
    }
  } catch (error) {
    const failedAt = new Date().toISOString()
    console.error('Agreement PDF preparation failed; the signing link was not activated:', error)
    await Promise.allSettled([
      updateLuxorSignatureRequest(created.id, {
        status: 'void',
        expires_at: failedAt,
        metadata: {
          ...(created.metadata || {}),
          documentPreparationState: 'failed',
          documentPreparationFailedAt: failedAt,
          voidReason: 'agreement_document_preparation_failed',
        },
      }),
      recordLuxorSignatureEvent({
        signatureRequestId: created.id,
        eventType: 'voided',
        metadata: { reason: 'agreement_document_preparation_failed', recovery: true },
      }),
    ])
    throw new Error('The Event Agreement could not be prepared. No signing link was sent; please try again.')
  }

  await updateLuxorBooking(booking.id, { contract_status: 'not_sent' })
  await recordLuxorSignatureEvent({
    signatureRequestId: created.id,
    eventType: 'drafted',
    metadata: {
      ownerName,
      ownerEmail,
      signingMode: options?.signingMode || 'email',
      requestedDeliveryStatus: options?.status || 'draft',
    },
  })
  return ready
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

export async function listLuxorSignatureRequestsByBooking(bookingId: string) {
  return supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&booking_id=eq.${encodeURIComponent(bookingId)}&order=created_at.desc`,
  )
}

export async function listLuxorSignatureRequestsByInquiry(inquiryId: string) {
  return supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`,
  )
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

/**
 * Retire only an agreement that is still open. The status predicate is
 * important for close-out flows: an agreement that was signed in another tab
 * must remain an immutable legal record instead of being overwritten as void.
 */
export async function voidOpenLuxorSignatureRequest(
  id: string,
  input: { expiresAt?: string; metadata: Record<string, unknown> },
) {
  const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(id)}&status=in.(draft,sent,viewed)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'void',
        expires_at: input.expiresAt || new Date().toISOString(),
        metadata: input.metadata,
        updated_at: new Date().toISOString(),
      }),
    },
  )
  return updated ?? null
}

export type LuxorSignatureAgreementDeliveryClaim = {
  state: 'claimed' | 'in_flight' | 'delivered'
  signature: LuxorSignatureRequest
}

/**
 * Claims the one client-facing agreement delivery for a signature. The draft
 * remains a draft while delivery is in flight, so the owner portal never calls
 * an agreement "sent" before Zoho has accepted it. A stale interrupted attempt
 * can be recovered later without voiding the agreement the client is meant to
 * sign.
 */
export async function claimLuxorSignatureAgreementDelivery(
  signature: LuxorSignatureRequest,
  claimedAt = new Date().toISOString(),
  options?: { deliveryRequestId?: string },
): Promise<LuxorSignatureAgreementDeliveryClaim> {
  if (!hasLuxorSignatureDeliveryDocuments(signature)) {
    return { state: 'in_flight', signature }
  }
  const requestedResend = Boolean(
    options?.deliveryRequestId &&
    agreementDeliveryState(signature) === 'retry_requested' &&
    signature.metadata?.agreementDeliveryRequestId === options.deliveryRequestId,
  )
  if (!requestedResend && (signature.status === 'viewed' || agreementDeliveryState(signature) === 'delivered')) {
    return { state: 'delivered', signature }
  }

  const nextMetadata = {
    ...(signature.metadata || {}),
    agreementDeliveryState: 'preparing',
    agreementDeliveryClaimedAt: claimedAt,
  }
  let claimed: LuxorSignatureRequest | null = null
  if (requestedResend) {
    const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
      `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(signature.id)}&status=in.(sent,viewed)&metadata->>agreementDeliveryState=eq.retry_requested&metadata->>agreementDeliveryRequestId=eq.${encodeURIComponent(options!.deliveryRequestId!)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ metadata: nextMetadata, updated_at: claimedAt }),
      },
    )
    claimed = updated ?? null
  } else if (signature.status === 'draft') {
    // A draft stays a draft until the provider accepts the mail, so use its
    // timestamp as a compare-and-set lock. Without this, two workers holding
    // the same draft could both set "preparing" and both deliver the package.
    if (hasFreshAgreementDeliveryClaim(signature)) {
      return { state: 'in_flight', signature }
    }
    const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
      `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(signature.id)}&status=eq.draft&updated_at=eq.${encodeURIComponent(signature.updated_at)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ metadata: nextMetadata, updated_at: claimedAt }),
      },
    )
    claimed = updated ?? null
  } else if ((signature.status === 'sent' || signature.status === 'viewed') && agreementDeliveryState(signature) === 'failed') {
    // A failed provider attempt is explicitly retryable. The state predicate
    // is the lock: only one queued worker can turn it back into "preparing".
    const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
      `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(signature.id)}&status=in.(sent,viewed)&metadata->>agreementDeliveryState=eq.failed`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ metadata: nextMetadata, updated_at: claimedAt }),
      },
    )
    claimed = updated ?? null
  } else if (signature.status === 'sent') {
    if (hasFreshAgreementDeliveryClaim(signature)) {
      return { state: 'in_flight', signature }
    }

    // A retry can take over only a stale delivery attempt. The updated_at
    // predicate makes that recovery a single-writer operation as well.
    const staleBefore = new Date(Date.now() - FRESH_AGREEMENT_DELIVERY_CLAIM_MS).toISOString()
    const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
      `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(signature.id)}&status=eq.sent&updated_at=lte.${encodeURIComponent(staleBefore)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ metadata: nextMetadata, updated_at: claimedAt }),
      },
    )
    claimed = updated ?? null
  }

  if (claimed) return { state: 'claimed', signature: claimed }

  const current = await getLuxorSignatureRequestById(signature.id)
  if (current && !requestedResend && (current.status === 'viewed' || agreementDeliveryState(current) === 'delivered')) {
    return { state: 'delivered', signature: current }
  }
  return { state: 'in_flight', signature: current || signature }
}

export async function markLuxorSignatureAgreementDelivery(
  signature: LuxorSignatureRequest,
  state: 'delivered' | 'failed',
  recordedAt = new Date().toISOString(),
) {
  return updateLuxorSignatureRequest(signature.id, {
    ...(state === 'delivered' && signature.status === 'draft' ? { status: 'sent' } : {}),
    metadata: {
      ...(signature.metadata || {}),
      agreementDeliveryState: state,
      ...(state === 'delivered'
        ? { agreementDeliverySentAt: recordedAt }
        : { agreementDeliveryFailedAt: recordedAt }),
    },
  })
}

/**
 * Atomically records the first client view of a sent agreement. Public
 * signing pages can be fetched more than once, so this gives the owner one
 * dependable "opened" event instead of duplicate activity entries.
 */
export async function markLuxorSignatureViewed(id: string, viewedAt = new Date().toISOString()) {
  const [updated] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(id)}&status=eq.sent`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'viewed',
        updated_at: viewedAt,
      }),
    },
  )

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

function recordedClientSignatureDataUrl(signature: Pick<LuxorSignatureRequest, 'metadata'>) {
  const candidate = signature.metadata?.clientSignatureDataUrl
  return typeof candidate === 'string' && /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(candidate)
    ? candidate
    : null
}

function signedActivityNoteContent(signedName: string) {
  return `Event Agreement signed by ${signedName.replace(/\s+/g, ' ').trim().slice(0, 160)}. Luxor can now send the next secure payment step.`
}

/**
 * The signature event is the canonical, de-duplicated owner signal. The
 * matching dossier note is recovered independently, so an interrupted write
 * after the legal signature cannot leave the owner without a visible alert.
 */
async function ensureLuxorSignedOwnerActivity(signature: LuxorSignatureRequest, fallbackName: string) {
  const signedName = (signature.signed_name || fallbackName).replace(/\s+/g, ' ').trim().slice(0, 160)
  try {
    const events = await listLuxorSignatureEvents(signature.id)
    if (!events.some((event) => event.event_type === 'signed')) {
      await recordLuxorSignatureEvent({
        signatureRequestId: signature.id,
        eventType: 'signed',
        ip: signature.signer_ip,
        userAgent: signature.signer_user_agent,
        metadata: { signedName, recovery: true },
      })
    }
  } catch (error) {
    console.error('Agreement was signed, but its owner audit event could not be saved:', error)
  }

  if (!signature.inquiry_id) return
  const noteContent = signedActivityNoteContent(signedName)
  try {
    const ownerNoteRecorded = Boolean(signature.metadata?.signedOwnerActivityRecordedAt)
    const existingNotes = ownerNoteRecorded ? [] : await listNotesByInquiry(signature.inquiry_id)
    const alreadyVisible = ownerNoteRecorded || existingNotes.some((note) => note.content === noteContent)
    if (!alreadyVisible) {
      await createNote(signature.inquiry_id, noteContent, 'status_change', 'Signature Portal')
    }
    if (!ownerNoteRecorded) {
      await updateLuxorSignatureRequest(signature.id, {
        metadata: {
          ...(signature.metadata || {}),
          signedOwnerActivityRecordedAt: new Date().toISOString(),
        },
      })
    }
  } catch (error) {
    // Keep the legal signature durable even if the non-critical dossier note
    // is temporarily unavailable. The next retry will backfill it.
    console.error('Agreement was signed, but its owner activity note could not be saved:', error)
  }
}

async function claimLuxorClientSignature(signature: LuxorSignatureRequest, input: {
  signedName: string
  signatureDataUrl: string
  ip?: string | null
  userAgent?: string | null
}, signedAt: string) {
  // The status predicate is the concurrency gate. Only one simultaneous POST
  // can preserve the original image and advance the agreement to signed.
  const [claimed] = await supabaseRest<LuxorSignatureRequest[]>(
    `luxor_signature_requests?select=*&id=eq.${encodeURIComponent(signature.id)}&status=in.(sent,viewed)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'signed',
        signed_name: input.signedName,
        signed_at: signedAt,
        signer_ip: input.ip || null,
        signer_user_agent: input.userAgent || null,
        metadata: {
          ...(signature.metadata || {}),
          clientSignatureDataUrl: input.signatureDataUrl,
          clientSignatureSha256: crypto.createHash('sha256').update(input.signatureDataUrl).digest('hex'),
          clientSignatureRecordedAt: signedAt,
        },
        updated_at: new Date().toISOString(),
      }),
    },
  )
  return claimed ?? null
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
  const [booking, inquiry] = await Promise.all([
    getLuxorBooking(signature.booking_id),
    signature.inquiry_id ? getLuxorInquiry(signature.inquiry_id) : Promise.resolve(null),
  ])
  if (!booking || booking.status === 'cancelled' || inquiry?.status === 'closed_lost') {
    throw new Error('This signing link is no longer active. Please contact Luxor Event Space for a new agreement.')
  }
  // A client retry is a recovery action when we already recorded their legal
  // signature but an upload, PDF render, payment handoff, or email step did
  // not finish. Never create a second signing record for that situation.
  if (!['sent', 'viewed', 'signed'].includes(signature.status)) {
    throw new Error('This signing link is no longer active. Please contact Luxor Event Space for a new agreement.')
  }
  if (signature.status !== 'signed' && signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
    throw new Error('This signature link has expired.')
  }

  let signedAt = signature.signed_at || new Date().toISOString()
  let updated: LuxorSignatureRequest | null = signature
  let immutableSignatureDataUrl = recordedClientSignatureDataUrl(signature)
  let signatureRecordedByThisAttempt = false
  if (signature.status !== 'signed') {
    updated = await claimLuxorClientSignature(signature, input, signedAt)
    if (!updated) {
      // Another tab/request may have won the first-write race. Re-fetch and
      // resume only that exact signature; never overwrite its image.
      updated = await getLuxorSignatureRequestByToken(input.token)
      if (!updated || updated.status !== 'signed') {
        throw new Error('The signature could not be recorded. Please try again.')
      }
      signedAt = updated.signed_at || signedAt
    } else {
      signatureRecordedByThisAttempt = true
    }
    immutableSignatureDataUrl = recordedClientSignatureDataUrl(updated)

    if (signatureRecordedByThisAttempt && updated) {
      await updateLuxorBooking(signature.booking_id, {
        contract_status: 'signed',
        contract_signed_at: signedAt,
      })

      // Persist the owner-visible signing signal before rendering PDFs,
      // creating Checkout, or sending mail. This helper also backfills it
      // safely on a recovery retry if the first request was interrupted.
      await ensureLuxorSignedOwnerActivity(updated, input.signedName)

      if (signature.inquiry_id) {
        const [booking, inquiry] = await Promise.all([
          getLuxorBooking(signature.booking_id),
          getLuxorInquiry(signature.inquiry_id),
        ])
      if (booking?.invoice_id) {
        const signedInvoice = await getInvoice(booking.invoice_id)
        if (signedInvoice) await syncLuxorPaymentInstallments({ booking: { ...booking, created_at: signedAt }, invoice: signedInvoice })
      }
      const depositInvoice = booking ? await getInvoiceByBookingAndKind(booking.id, 'deposit') : null
      const depositPayments = depositInvoice ? await listPaidPaymentsByInvoice(depositInvoice.id) : []
      const depositPaid = Boolean(depositInvoice) && depositPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) + 0.005 >= Number(depositInvoice?.total || 0)
      let reconciledBooking = booking
      let finalPaymentScheduleMissing = false
      if (booking && depositPaid && inquiry?.status !== 'closed_lost' && booking.status !== 'cancelled') {
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
    }
  }

  if (!immutableSignatureDataUrl) {
    // Historical rows created before immutable signature capture cannot be
    // regenerated safely from an arbitrary retry request. Preserve their
    // audit record and require Luxor to issue a replacement agreement.
    throw new Error('Your signature was recorded, but the original signature image is unavailable for secure document recovery. Please contact Luxor Event Space for a replacement agreement.')
  }
  const executionSignature = updated || signature

  // If an earlier request recorded the signature before a downstream write
  // failed, restore the one required booking state before continuing the
  // idempotent execution/payment recovery below.
  if (!signatureRecordedByThisAttempt && executionSignature.status === 'signed') {
    const recoveredBooking = await getLuxorBooking(signature.booking_id)
    if (recoveredBooking && recoveredBooking.contract_status !== 'signed') {
      await updateLuxorBooking(signature.booking_id, {
        contract_status: 'signed',
        contract_signed_at: recoveredBooking.contract_signed_at || signedAt,
      })
    }
    await ensureLuxorSignedOwnerActivity(executionSignature, input.signedName)
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
  let completed: LuxorSignatureRequest | null = updated
  let executedCustomerPdf: Uint8Array
  let executedAuditPdf: Uint8Array
  let executionCreatedThisAttempt = false

  // If execution was already stored, do not regenerate its immutable client
  // copy or re-notify the owner. We can still safely resume the Stripe/email
  // handoff below, where the checkout and mail job have their own idempotency
  // keys. If either stored PDF is unavailable, rebuilding the same paths is
  // the recovery path.
  if (signature.executed_document_path && signature.audit_document_path) {
    try {
      ;[executedCustomerPdf, executedAuditPdf] = await Promise.all([
        downloadLuxorPrivatePdf(signature.executed_document_path),
        downloadLuxorPrivatePdf(signature.audit_document_path),
      ])
    } catch (error) {
      console.warn('Executed agreement files were referenced but unavailable; rebuilding the execution package:', error)
      const original = await downloadLuxorPrivatePdf(signature.contract_document_path || '')
      const rebuilt = await buildExecutedLuxorContract({
        original,
        signature: executionSignature,
        clientName: executionSignature.signed_name || input.signedName,
        clientEmail: executionSignature.client_email,
        clientSignedAt: signedAt,
        clientSignatureDataUrl: immutableSignatureDataUrl,
        signaturePlacement: getLuxorContractSignaturePlacement(executionSignature.metadata),
        ownerName,
        ownerEmail,
        ownerSignedAt,
        events,
      })
      executedCustomerPdf = rebuilt.customer.bytes
      executedAuditPdf = rebuilt.audit.bytes
      await Promise.all([
        saveLuxorPrivatePdf(signature.executed_document_path, executedCustomerPdf),
        saveLuxorPrivatePdf(signature.audit_document_path, executedAuditPdf),
      ])
      completed = await updateLuxorSignatureRequest(signature.id, {
        owner_name: ownerName,
        owner_email: ownerEmail,
        owner_signed_at: ownerSignedAt,
        document_hash: rebuilt.customer.hash,
      }) || completed
      executionCreatedThisAttempt = true
    }
  } else {
    const original = await downloadLuxorPrivatePdf(signature.contract_document_path || '')
    const executed = await buildExecutedLuxorContract({
      original,
      signature: executionSignature,
      clientName: executionSignature.signed_name || input.signedName,
      clientEmail: executionSignature.client_email,
      clientSignedAt: signedAt,
      clientSignatureDataUrl: immutableSignatureDataUrl,
      signaturePlacement: getLuxorContractSignaturePlacement(executionSignature.metadata),
      ownerName,
      ownerEmail,
      ownerSignedAt,
      events,
    })
    const executedPath = `contracts/${signature.booking_id}/${signature.id}/Luxor-Event-Agreement-Executed.pdf`
    const auditPath = `contracts/${signature.booking_id}/${signature.id}/audit/Luxor-Event-Agreement-Audit.pdf`
    executedCustomerPdf = executed.customer.bytes
    executedAuditPdf = executed.audit.bytes
    await Promise.all([
      saveLuxorPrivatePdf(executedPath, executedCustomerPdf),
      saveLuxorPrivatePdf(auditPath, executedAuditPdf),
    ])
    completed = await updateLuxorSignatureRequest(signature.id, {
      owner_name: ownerName,
      owner_email: ownerEmail,
      owner_signed_at: ownerSignedAt,
      executed_document_path: executedPath,
      audit_document_path: auditPath,
      document_hash: executed.customer.hash,
    })
    if (!completed) throw new Error('The executed agreement could not be recorded. Please retry the signing step.')
    executionCreatedThisAttempt = true
  }
  if (!events.some((event) => event.event_type === 'completed')) {
    await recordLuxorSignatureEvent({ signatureRequestId: signature.id, eventType: 'completed' })
  }

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
    if (!inquiry) throw new Error('The signed booking needs its inquiry record before a payment request can be sent.')
    if (inquiry.status === 'closed_lost' || booking.status === 'cancelled') {
      throw new Error('This deal was closed before its payment request could be created.')
    }
    const masterInvoice = booking.invoice_id ? await getInvoice(booking.invoice_id) : null
    if (!masterInvoice) {
      throw new Error('The signed booking needs its finalized proposal before a payment request can be created.')
    }

    // The booking status is verified as signed above before either the child
    // invoice or Stripe Checkout can be created. `ensure…` reuses the same
    // deposit record if this completion path is retried.
    const newScheduleProposal = Boolean(masterInvoice.proposal_context?.payment_plan && typeof masterInvoice.proposal_context.payment_plan === 'object' && Number.isInteger(Number((masterInvoice.proposal_context.payment_plan as Record<string, unknown>).payment_count)))
    paymentInvoice = await ensureLuxorDepositInvoice({
      masterInvoice,
      bookingId: booking.id,
      dueDate: signedAt.slice(0, 10),
      reservationDepositAmount: booking.deposit_required,
      includeSecurityDeposit: !newScheduleProposal,
    })
    if (newScheduleProposal) {
      const securityDue = new Date(`${booking.event_date}T12:00:00Z`)
      securityDue.setUTCDate(securityDue.getUTCDate() - 30)
      await ensureLuxorSecurityDepositInvoice({ masterInvoice, bookingId: booking.id, dueDate: securityDue.toISOString().slice(0, 10) })
    }
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
    const checkout = await createLuxorPostContractCheckout({
      invoice: paymentInvoice,
      inquiry,
      booking,
      origin,
      paymentAmount: Number(paymentInvoice.total || 0),
      paymentLabel: newScheduleProposal ? 'Initial Booking Payment' : 'Initial Booking Payment + Refundable Security Deposit',
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
  const latestInquiry = signature.inquiry_id ? await getLuxorInquiry(signature.inquiry_id) : null
  if (latestInquiry?.status !== 'closed_lost') {
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
          attachments: [{ filename: 'Luxor-Event-Agreement-Executed.pdf', content: executedCustomerPdf, contentType: 'application/pdf' }],
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
  }
  const ownerNoticeAlreadySent = Boolean(signature.metadata?.ownerExecutionNoticeSentAt)
  if (executionCreatedThisAttempt && !ownerNoticeAlreadySent) {
    try {
      await sendLuxorZohoEmail({
        to: ownerEmail,
        subject: `Executed Luxor agreement - ${executionSignature.signed_name || input.signedName}`,
        content: `<div style="font-family:Arial,sans-serif"><h2>Executed agreement archived</h2><p>${executionSignature.signed_name || input.signedName} completed the agreement. The internal copy with the full audit timeline is attached.</p></div>`,
        from: 'booking@luxoratlaspalmas.com',
        fromName: 'Luxor Event Space',
        attachments: [{ filename: 'Luxor-Event-Agreement-Audit.pdf', content: executedAuditPdf, contentType: 'application/pdf' }],
      })
      await updateLuxorSignatureRequest(signature.id, {
        metadata: {
          ...(completed?.metadata || executionSignature.metadata || signature.metadata || {}),
          ownerExecutionNoticeSentAt: new Date().toISOString(),
        },
      })
    } catch (ownerNoticeError) {
      // The executed agreement is already durable. Keep recovery safe and
      // allow a later retry to make this one owner-only notification.
      console.error('Executed agreement was archived, but the owner archive email failed:', ownerNoticeError)
    }
  }

  return completed || updated || signature
}
