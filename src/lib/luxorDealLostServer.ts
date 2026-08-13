import 'server-only'

import Stripe from 'stripe'
import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'
import { listLuxorBookingsByInquiry, updateLuxorBooking } from './luxorBookingsServer'
import {
  listInvoicesByBooking,
  listInvoicesByInquiry,
  listPaidPaymentsByInvoice,
  updateInvoice,
} from './luxorInvoicesServer'
import { updateLuxorInquiry } from './luxorInquiriesServer'
import { cancelAllQueuedLuxorEmailJobs } from './luxorEmailJobsServer'
import { cancelAllQueuedLuxorTextJobs } from './luxorTextCampaignsServer'
import { createNote } from './luxorNotesServer'
import {
  getLuxorSignatureRequestById,
  listLuxorSignatureRequestsByBooking,
  listLuxorSignatureRequestsByInquiry,
  recordLuxorSignatureEvent,
  voidOpenLuxorSignatureRequest,
} from './luxorSignaturesServer'
import { cancelLuxorTourForInquiry, type LuxorTourCancellation } from './luxorTourCancellationServer'

type InvoicePaymentState = {
  invoice: LuxorInvoice
  paidTotal: number
  paidCount: number
  fullyPaid: boolean
}

type StripeCloseoutResult = {
  expiredInvoiceIds: string[]
  safeToClearInvoiceIds: string[]
  attention: Array<{
    invoiceId: string
    checkoutSessionId: string
    reason: string
  }>
}

export type LuxorDealLostOutcome = {
  alreadyClosed: boolean
  invoicesCancelled: number
  invoiceIdsCancelled: string[]
  checkoutSessionsExpired: number
  checkoutSessionsCleared: number
  contractsVoided: number
  contractIdsVoided: string[]
  bookingsCancelled: number
  bookingIdsCancelled: string[]
  queuedEmailJobsCancelled: number
  queuedTextJobsCancelled: number
  paidRecordsPreserved: {
    invoiceIds: string[]
    paymentCount: number
    signedContractIds: string[]
  }
  paymentLinkAttentionRequired: boolean
  warnings: string[]
  tourCancellation?: LuxorTourCancellation
}

/**
 * Raised before the lead is marked closed when Stripe cannot prove that a
 * still-open checkout link has been stopped. This is intentionally a hard
 * stop: clearing a local URL without expiring the Stripe Session would leave
 * the client able to pay an old link.
 */
export class LuxorDealLostPaymentLinkAttentionError extends Error {
  readonly outcome: LuxorDealLostOutcome

  constructor(outcome: LuxorDealLostOutcome) {
    super('Stripe payment links need review before this deal can be closed.')
    this.name = 'LuxorDealLostPaymentLinkAttentionError'
    this.outcome = outcome
  }
}

function cleanReason(value: string | null | undefined) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500) || null
}

function uniqueById<T extends { id: string }>(records: T[]) {
  return [...new Map(records.map((record) => [record.id, record])).values()]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function dealLostMetadata(inquiry: LuxorInquiry) {
  const prior = inquiry.metadata?.dealLost
  return isRecord(prior) ? prior : {}
}

function baseOutcome(input: {
  alreadyClosed: boolean
  paidRecordsPreserved: LuxorDealLostOutcome['paidRecordsPreserved']
}): LuxorDealLostOutcome {
  return {
    alreadyClosed: input.alreadyClosed,
    invoicesCancelled: 0,
    invoiceIdsCancelled: [],
    checkoutSessionsExpired: 0,
    checkoutSessionsCleared: 0,
    contractsVoided: 0,
    contractIdsVoided: [],
    bookingsCancelled: 0,
    bookingIdsCancelled: [],
    queuedEmailJobsCancelled: 0,
    queuedTextJobsCancelled: 0,
    paidRecordsPreserved: input.paidRecordsPreserved,
    paymentLinkAttentionRequired: false,
    warnings: [],
  }
}

function stripeErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String(error.code || '')
    : ''
}

async function stopOpenStripeCheckoutSessions(paymentStates: InvoicePaymentState[]): Promise<StripeCloseoutResult> {
  const candidates = paymentStates.filter(({ invoice }) => Boolean(invoice.stripe_checkout_session_id))
  if (!candidates.length) return { expiredInvoiceIds: [], safeToClearInvoiceIds: [], attention: [] }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return {
      expiredInvoiceIds: [],
      safeToClearInvoiceIds: [],
      attention: candidates.map(({ invoice }) => ({
        invoiceId: invoice.id,
        checkoutSessionId: invoice.stripe_checkout_session_id || '',
        reason: 'Stripe is not connected, so this payment link could not be verified or stopped.',
      })),
    }
  }

  const stripe = new Stripe(secretKey)
  const results = await Promise.all(candidates.map(async ({ invoice, fullyPaid }) => {
    const sessionId = invoice.stripe_checkout_session_id || ''
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if (session.status === 'open') {
        await stripe.checkout.sessions.expire(session.id)
        return { invoiceId: invoice.id, sessionId, expired: true, safeToClear: true }
      }

      if (session.status === 'expired') {
        return { invoiceId: invoice.id, sessionId, expired: false, safeToClear: true }
      }

      // A completed Checkout Session attached to a fully-paid invoice is a
      // historical payment record, not an active payment link. Keep it as-is.
      if (fullyPaid && (session.status === 'complete' || session.payment_status === 'paid')) {
        return { invoiceId: invoice.id, sessionId, expired: false, safeToClear: false }
      }

      return {
        invoiceId: invoice.id,
        sessionId,
        attention: `Stripe reports this session as ${session.status || 'unavailable'}${session.payment_status ? ` (${session.payment_status})` : ''}; it cannot be expired automatically.`,
      }
    } catch (error) {
      if (stripeErrorCode(error) === 'resource_missing') {
        // Stripe has already removed this session, so it is safe to remove the
        // stale local reference. Do not treat that as a failed close-out.
        return { invoiceId: invoice.id, sessionId, expired: false, safeToClear: true }
      }
      return {
        invoiceId: invoice.id,
        sessionId,
        attention: error instanceof Error ? error.message : 'Stripe could not verify this payment link.',
      }
    }
  }))

  return {
    expiredInvoiceIds: results.filter((result) => result.expired).map((result) => result.invoiceId),
    safeToClearInvoiceIds: results.filter((result) => result.safeToClear).map((result) => result.invoiceId),
    attention: results.flatMap((result) => result.attention
      ? [{ invoiceId: result.invoiceId, checkoutSessionId: result.sessionId, reason: result.attention }]
      : []),
  }
}

async function invoicePaymentStates(invoices: LuxorInvoice[]) {
  return Promise.all(invoices.map(async (invoice): Promise<InvoicePaymentState> => {
    const payments = await listPaidPaymentsByInvoice(invoice.id)
    const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return {
      invoice,
      paidTotal,
      paidCount: payments.length,
      fullyPaid: invoice.status === 'paid' || paidTotal + 0.005 >= Number(invoice.total || 0),
    }
  }))
}

function closeoutNote(input: {
  reason: string | null
  outcome: LuxorDealLostOutcome
}) {
  const reasonLine = input.reason ? ` Reason: ${input.reason}.` : ''
  const preserved = input.outcome.paidRecordsPreserved
  const preservedLine = preserved.paymentCount || preserved.signedContractIds.length
    ? ` ${preserved.paymentCount} paid payment record(s) and ${preserved.signedContractIds.length} signed agreement(s) were preserved; no refund or legal cancellation was created automatically.`
    : ''
  return `Deal marked lost.${reasonLine} Withdrawn ${input.outcome.invoicesCancelled} open proposal/payment record(s), voided ${input.outcome.contractsVoided} open agreement(s), and stopped ${input.outcome.queuedEmailJobsCancelled} queued email(s) plus ${input.outcome.queuedTextJobsCancelled} queued text(s).${preservedLine}`
}

/**
 * Close a lead without deleting its history. Only unpaid/open work is
 * withdrawn; paid payment rows and signed contracts are retained as records.
 * A Stripe link must be expired at Stripe before its local URL is cleared.
 */
export async function closeLuxorDealAsLost(input: {
  inquiry: LuxorInquiry
  requestedBy: string
  reason?: string | null
  cancelTour?: boolean
}): Promise<{ inquiry: LuxorInquiry; outcome: LuxorDealLostOutcome }> {
  const { inquiry } = input
  const now = new Date().toISOString()
  const reason = cleanReason(input.reason)
  const requestedBy = input.requestedBy.trim() || 'Portal Owner'
  const alreadyClosed = inquiry.status === 'closed_lost' || inquiry.pipeline_stage === 'closed_lost'

  const bookings = await listLuxorBookingsByInquiry(inquiry.id)
  const invoiceGroups = await Promise.all([
    listInvoicesByInquiry(inquiry.id),
    ...bookings.map((booking) => listInvoicesByBooking(booking.id)),
  ])
  const invoices = uniqueById(invoiceGroups.flat())
  const paymentStates = await invoicePaymentStates(invoices)
  const paidInvoiceIds = paymentStates.filter((state) => state.paidCount > 0 || state.fullyPaid).map((state) => state.invoice.id)
  const paidPaymentCount = paymentStates.reduce((sum, state) => sum + state.paidCount, 0)

  const signatureGroups = await Promise.all([
    listLuxorSignatureRequestsByInquiry(inquiry.id),
    ...bookings.map((booking) => listLuxorSignatureRequestsByBooking(booking.id)),
  ])
  const signatures = uniqueById(signatureGroups.flat())
  const signedContractIds = signatures.filter((signature) => signature.status === 'signed').map((signature) => signature.id)
  const outcome = baseOutcome({
    alreadyClosed,
    paidRecordsPreserved: {
      invoiceIds: paidInvoiceIds,
      paymentCount: paidPaymentCount,
      signedContractIds,
    },
  })

  // Stripe is the externally authoritative link. Confirm it is actually
  // stopped before writing any local closed-lost status.
  const stripeResult = await stopOpenStripeCheckoutSessions(paymentStates)
  if (stripeResult.attention.length) {
    outcome.paymentLinkAttentionRequired = true
    outcome.warnings.push(...stripeResult.attention.map((item) => `Payment link for invoice ${item.invoiceId.slice(0, 8)} needs review: ${item.reason}`))
    throw new LuxorDealLostPaymentLinkAttentionError(outcome)
  }

  let tourCancellation: LuxorTourCancellation | undefined
  if (input.cancelTour !== false) {
    const hasStoredCalendarEvent = typeof inquiry.metadata?.zohoCalendarEventUid === 'string' && Boolean(inquiry.metadata.zohoCalendarEventUid.trim())
    const tourIsStillOpen = (Boolean(inquiry.preferred_tour_date) || hasStoredCalendarEvent) && !['cancelled', 'attended', 'no_show'].includes(inquiry.tour_attendance_status || '')
    if (tourIsStillOpen) {
      tourCancellation = await cancelLuxorTourForInquiry({ inquiry, reason, requestedBy })
      if (!tourCancellation.ok) {
        throw new Error(`The tour could not be fully cancelled: ${tourCancellation.errors.join('; ')}`)
      }
      if (tourCancellation.calendar.warning) outcome.warnings.push(`Tour calendar: ${tourCancellation.calendar.warning}`)
    }
  }

  const activeSignatures = signatures.filter((signature) => ['draft', 'sent', 'viewed'].includes(signature.status))
  const signatureCloseResults = await Promise.all(activeSignatures.map(async (signature) => {
    const voided = await voidOpenLuxorSignatureRequest(signature.id, {
      expiresAt: now,
      metadata: {
        ...(signature.metadata || {}),
        voidedAt: now,
        voidedBy: requestedBy,
        voidReason: 'deal_lost',
        ...(reason ? { dealLostReason: reason } : {}),
      },
    })
    // A client can complete a signature at the exact same moment an owner
    // closes the deal. The conditional update above leaves that signed record
    // untouched. Its booking is preserved for manual legal/financial review.
    if (!voided) {
      const current = await getLuxorSignatureRequestById(signature.id)
      if (current?.status === 'signed') {
        if (!outcome.paidRecordsPreserved.signedContractIds.includes(current.id)) {
          outcome.paidRecordsPreserved.signedContractIds.push(current.id)
        }
        return { voided: false, signedBookingId: current.booking_id }
      }
      throw new Error('An open Event Agreement changed before it could be safely voided. Refresh and try again.')
    }
    await recordLuxorSignatureEvent({
      signatureRequestId: signature.id,
      eventType: 'voided',
      metadata: { reason: 'deal_lost', requestedBy, ...(reason ? { dealLostReason: reason } : {}) },
    })
    return { voided: true, signedBookingId: null }
  }))
  outcome.contractsVoided = signatureCloseResults.filter((result) => result.voided).length
  outcome.contractIdsVoided = activeSignatures
    .filter((_, index) => signatureCloseResults[index]?.voided)
    .map((signature) => signature.id)

  const safeToClearSessionIds = new Set(stripeResult.safeToClearInvoiceIds)
  const paidChildByParent = new Set(
    paymentStates
      .filter((state) => state.paidCount > 0 && state.invoice.parent_invoice_id)
      .map((state) => state.invoice.parent_invoice_id as string),
  )
  const invoicesToCancel = paymentStates.filter(({ invoice }) => invoice.status !== 'paid' && invoice.status !== 'cancelled')
  await Promise.all(paymentStates.map(async ({ invoice, paidCount }) => {
    const clearCheckout = safeToClearSessionIds.has(invoice.id)
    const shouldCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled'
    if (!shouldCancel && !clearCheckout) return
    const preserveRedeemedOffer = paidCount > 0 || paidChildByParent.has(invoice.id)
    await updateInvoice(invoice.id, {
      ...(shouldCancel ? { status: 'cancelled' as const } : {}),
      ...(!preserveRedeemedOffer && shouldCancel ? { offer_status: 'withdrawn' as const } : {}),
      ...(clearCheckout ? {
        stripe_checkout_session_id: null,
        stripe_checkout_url: null,
        stripe_checkout_opened_at: null,
        payment_requested_at: null,
        payment_requested_amount: null,
        payment_requested_label: null,
      } : {}),
    })
  }))
  outcome.invoicesCancelled = invoicesToCancel.length
  outcome.invoiceIdsCancelled = invoicesToCancel.map((state) => state.invoice.id)
  outcome.checkoutSessionsExpired = stripeResult.expiredInvoiceIds.length
  outcome.checkoutSessionsCleared = stripeResult.safeToClearInvoiceIds.length

  const signedBookings = new Set(signatures.filter((signature) => signature.status === 'signed').map((signature) => signature.booking_id))
  signatureCloseResults.forEach((result) => {
    if (result.signedBookingId) signedBookings.add(result.signedBookingId)
  })
  const bookingsToCancel = bookings.filter((booking) => booking.status !== 'cancelled' && !signedBookings.has(booking.id))
  await Promise.all(bookingsToCancel.map(async (booking) => {
    await updateLuxorBooking(booking.id, {
      status: 'cancelled',
      contract_status: 'void',
      metadata: {
        ...(booking.metadata || {}),
        reservation_state: 'cancelled',
        dealLost: {
          closedAt: now,
          closedBy: requestedBy,
          ...(reason ? { reason } : {}),
        },
      },
    })
  }))
  outcome.bookingsCancelled = bookingsToCancel.length
  outcome.bookingIdsCancelled = bookingsToCancel.map((booking) => booking.id)

  const [queuedEmailJobsCancelled, queuedTextJobsCancelled] = await Promise.all([
    cancelAllQueuedLuxorEmailJobs(inquiry.id),
    cancelAllQueuedLuxorTextJobs(inquiry.id),
  ])
  outcome.queuedEmailJobsCancelled = queuedEmailJobsCancelled
  outcome.queuedTextJobsCancelled = queuedTextJobsCancelled
  if (tourCancellation) outcome.tourCancellation = tourCancellation

  const priorDealLost = dealLostMetadata(inquiry)
  const shouldCreateAuditNote = !priorDealLost.auditNoteCreatedAt
  if (shouldCreateAuditNote) {
    await createNote(inquiry.id, closeoutNote({ reason, outcome }), 'status_change', requestedBy)
  }

  const updated = await updateLuxorInquiry(inquiry.id, {
    status: 'closed_lost',
    pipeline_stage: 'closed_lost',
    ...(tourCancellation ? { tour_attendance_status: 'cancelled' } : {}),
    metadata: {
      ...(inquiry.metadata || {}),
      ...(tourCancellation?.metadataPatch || {}),
      dealLost: {
        ...priorDealLost,
        status: 'closed_lost',
        closedAt: typeof priorDealLost.closedAt === 'string' ? priorDealLost.closedAt : now,
        closedBy: typeof priorDealLost.closedBy === 'string' ? priorDealLost.closedBy : requestedBy,
        ...(reason ? { reason } : {}),
        invoicesCancelled: outcome.invoicesCancelled,
        contractsVoided: outcome.contractsVoided,
        bookingsCancelled: outcome.bookingsCancelled,
        checkoutSessionsExpired: outcome.checkoutSessionsExpired,
        queuedEmailJobsCancelled: outcome.queuedEmailJobsCancelled,
        queuedTextJobsCancelled: outcome.queuedTextJobsCancelled,
        paidPaymentCount: outcome.paidRecordsPreserved.paymentCount,
        signedAgreementCount: outcome.paidRecordsPreserved.signedContractIds.length,
        ...(shouldCreateAuditNote ? { auditNoteCreatedAt: now } : {}),
      },
    },
  })
  if (!updated) throw new Error('The lead could not be marked as deal lost.')

  if (outcome.paidRecordsPreserved.paymentCount || outcome.paidRecordsPreserved.signedContractIds.length || signedBookings.size) {
    outcome.warnings.push('Paid transactions and signed agreements were preserved. No refund, legal cancellation, or cancellation of a signed booking was created automatically.')
  }
  return { inquiry: updated, outcome }
}
