import 'server-only'

import type { LuxorBooking, LuxorEmailJob, LuxorInquiry, LuxorInvoice, LuxorSignatureRequest } from './luxorInquiryTypes'
import { createOrGetLuxorBookingForInvoice, getLuxorBooking, getLuxorBookingByInvoice, updateLuxorBooking } from './luxorBookingsServer'
import { createLuxorEmailJob, listLuxorEmailJobsForInquiry, updateLuxorEmailJob } from './luxorEmailJobsServer'
import { updateInvoice } from './luxorInvoicesServer'
import { roundLuxorMoney } from './luxorOffer'
import { buildLuxorProposalContractEmail } from './luxorProposalEmailServer'
import {
  createLuxorSignatureRequest,
  getActiveLuxorSignatureRequestByBooking,
  getLatestLuxorSignatureRequestByBooking,
  hasLuxorSignatureDeliveryDocuments,
  updateLuxorSignatureRequest,
} from './luxorSignaturesServer'
import { LUXOR_AGREEMENT_ATTACHMENT_MANIFEST } from './luxorAgreementDeliveryServer'
import { syncLuxorPaymentInstallments } from './luxorPaymentInstallmentsServer'

export type LuxorAgreementQueueDelivery = 'queued' | 'already_sent' | 'already_signed' | 'preparing'

export type LuxorAgreementQueueResult = {
  delivery: LuxorAgreementQueueDelivery
  booking: LuxorBooking
  signature: LuxorSignatureRequest
  job: LuxorEmailJob | null
  message: string
}

type PaymentTerms = {
  mode: 'pay_in_full' | 'deposit_and_balance'
  percentage: number
  finalPaymentDays: number
  reservationPayment: number
}

function proposalContext(invoice: LuxorInvoice) {
  return invoice.proposal_context && typeof invoice.proposal_context === 'object'
    ? invoice.proposal_context as Record<string, unknown>
    : {}
}

function paymentTerms(invoiceTotal: number, context: Record<string, unknown>): PaymentTerms | null {
  const plan = context.payment_plan && typeof context.payment_plan === 'object'
    ? context.payment_plan as Record<string, unknown>
    : null
  if (!plan) return null

  const hasNewSchedule = Number.isInteger(Number(plan.payment_count)) && [2, 3, 4, 5].includes(Number(plan.payment_count))
  const mode = hasNewSchedule ? 'deposit_and_balance' : plan.mode === 'pay_in_full' || plan.mode === 'deposit_and_balance' ? plan.mode : null
  const percentage = hasNewSchedule ? 25 : Number(plan.booking_payment_percent)
  const finalPaymentDays = hasNewSchedule ? 60 : Number(plan.final_payment_due_days_before_event)
  if (
    !mode ||
    !Number.isFinite(percentage) || percentage < 0 || percentage > 100 ||
    !Number.isInteger(finalPaymentDays) || finalPaymentDays < 0 ||
    (mode === 'deposit_and_balance' && percentage <= 0)
  ) {
    return null
  }

  const venueServicesTotal = Number(context.venue_services_total)
  const paymentCount = hasNewSchedule ? Number(plan.payment_count) : null
  // The new schedule is venue-first. Two- and three-payment plans collect
  // the entire Venue Services allocation at signing; four- and five-payment
  // plans use the 25% booking deposit (subject to the existing $750 minimum
  // and Venue Services cap).
  const bookingPercent = paymentCount !== null && paymentCount <= 3 ? 100 : percentage
  const reservationPayment = mode === 'pay_in_full'
    ? invoiceTotal
    : roundLuxorMoney(Math.min(
      Number.isFinite(venueServicesTotal) ? venueServicesTotal : invoiceTotal,
      Math.max((Number.isFinite(venueServicesTotal) ? venueServicesTotal : invoiceTotal) * (bookingPercent / 100), 750),
    ))
  return {
    mode,
    percentage,
    finalPaymentDays,
    reservationPayment: Math.min(invoiceTotal, reservationPayment),
  }
}

function finalPaymentDueDate(eventDate: string, daysBeforeEvent: number) {
  const event = new Date(`${eventDate}T12:00:00`)
  event.setDate(event.getDate() - daysBeforeEvent)
  return event.toISOString().slice(0, 10)
}

function hasAcceptedLockedProposal(invoice: LuxorInvoice) {
  return Boolean(
    invoice.invoice_kind === 'event' &&
    invoice.status === 'sent' &&
    invoice.price_locked_at &&
    invoice.proposal_accepted_at &&
    invoice.offer_status !== 'withdrawn',
  )
}

function agreementJobMetadata(invoice: LuxorInvoice, requestedBy: string, extra: Record<string, unknown> = {}) {
  return {
    automated: true,
    agreement_delivery: true,
    flow_stage: 'proposal_accepted_contract',
    invoice_id: invoice.id,
    proposal_version: invoice.proposal_version || 1,
    requested_by: requestedBy,
    attachment_manifest: LUXOR_AGREEMENT_ATTACHMENT_MANIFEST.map((attachment) => ({ ...attachment, included: false })),
    ...extra,
  }
}

function agreementWasDelivered(signature: LuxorSignatureRequest, job: LuxorEmailJob | null) {
  return Boolean(
    signature.status === 'viewed' ||
    signature.status === 'signed' ||
    signature.metadata?.agreementDeliveryState === 'delivered' ||
    job?.status === 'sent',
  )
}

async function getOrCreateBooking(invoice: LuxorInvoice, inquiry: LuxorInquiry) {
  const context = proposalContext(invoice)
  const eventDate = typeof context.event_date === 'string' ? context.event_date : inquiry.target_date
  const guestCount = Number(context.expected_guest_count ?? inquiry.guest_count)
  const terms = paymentTerms(Number(invoice.total || 0), context)
  const refundableSecurityDeposit = Number(context.refundable_security_deposit)

  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isInteger(guestCount) || guestCount < 1 || guestCount > 200) {
    throw new Error('The final proposal is missing valid event date or expected guest-count details. Luxor must revise it before the Event Agreement can be prepared.')
  }
  if (!terms || !Number.isFinite(refundableSecurityDeposit) || refundableSecurityDeposit !== 750) {
    throw new Error('The final proposal needs a valid payment plan and refundable security deposit before the Event Agreement can be prepared.')
  }

  let booking = await getLuxorBookingByInvoice(invoice.id)
  if (!booking && invoice.booking_id) {
    const linkedBooking = await getLuxorBooking(invoice.booking_id)
    if (linkedBooking?.invoice_id === invoice.id) booking = linkedBooking
  }

  const sharedFields = {
    invoice_id: invoice.id,
    lead_event_id: invoice.lead_event_id || null,
    client_name: invoice.client_name || inquiry.full_name,
    email: inquiry.email,
    phone: inquiry.phone,
    event_type: typeof context.event_type === 'string' ? context.event_type : invoice.event_type || inquiry.event_type,
    event_date: eventDate,
    start_time: typeof context.start_time === 'string' ? context.start_time : null,
    end_time: typeof context.end_time === 'string' ? context.end_time : null,
    guest_count: guestCount,
    package_name: typeof context.package_name === 'string' ? context.package_name : inquiry.package_interest,
    contract_total: Number(invoice.total || 0),
    deposit_required: terms.reservationPayment,
    security_deposit_amount: roundLuxorMoney(refundableSecurityDeposit),
    final_payment_due_date: finalPaymentDueDate(eventDate, terms.finalPaymentDays),
  }

  if (!booking) {
    const claimedBooking = await createOrGetLuxorBookingForInvoice({
      inquiry_id: inquiry.id,
      ...sharedFields,
      status: 'tentative',
      contract_status: 'not_sent',
      security_deposit_status: 'due',
      notes: invoice.notes,
      metadata: {
        proposal_invoice_id: invoice.id,
        proposal_version: invoice.proposal_version || 1,
        final_proposal_context: context,
        reservation_payment_mode: terms.mode,
        reservation_payment_percent: terms.percentage,
        reservation_state: 'proposal_accepted_awaiting_contract',
      },
    })
    booking = claimedBooking.booking
  } else if (booking.contract_status !== 'signed') {
    booking = await updateLuxorBooking(booking.id, {
      ...sharedFields,
      start_time: typeof context.start_time === 'string' ? context.start_time : booking.start_time,
      end_time: typeof context.end_time === 'string' ? context.end_time : booking.end_time,
      package_name: typeof context.package_name === 'string' ? context.package_name : booking.package_name,
      security_deposit_status: booking.security_deposit_status || 'due',
      metadata: {
        ...booking.metadata,
        proposal_invoice_id: invoice.id,
        proposal_version: invoice.proposal_version || 1,
        final_proposal_context: context,
        reservation_payment_mode: terms.mode,
        reservation_payment_percent: terms.percentage,
        reservation_state: ['sent', 'viewed'].includes(booking.contract_status || '')
          ? booking.metadata?.reservation_state || 'awaiting_signature'
          : 'proposal_accepted_awaiting_contract',
      },
    }) || booking
  }

  if (invoice.booking_id !== booking.id) {
    await updateInvoice(invoice.id, { booking_id: booking.id })
  }
  return booking
}

async function getOrCreateSignature(booking: LuxorBooking) {
  let signature = await getActiveLuxorSignatureRequestByBooking(booking.id)
  const latest = await getLatestLuxorSignatureRequestByBooking(booking.id)
  if (latest?.status === 'signed') return latest

  if (!signature && latest?.status === 'draft' && hasLuxorSignatureDeliveryDocuments(latest)) {
    signature = latest
  }
  if (!signature || !hasLuxorSignatureDeliveryDocuments(signature)) {
    signature = await createLuxorSignatureRequest(booking, {
      status: 'draft',
      allowInFlightDraft: true,
      reuseExisting: true,
    })
  }
  return signature
}

function sameSignatureJob(job: LuxorEmailJob, signatureId: string) {
  return job.job_type === 'contract_signature' && job.signature_request_id === signatureId
}

function isStaleSendingJob(job: LuxorEmailJob) {
  if (job.status !== 'sending') return false
  const updatedAt = Date.parse(job.updated_at || job.created_at)
  return Number.isFinite(updatedAt) && updatedAt <= Date.now() - 10 * 60_000
}

/**
 * Creates or safely retries the one agreement email job for an accepted final
 * proposal. This does not send email. The cron worker owns the attachment
 * build and Zoho delivery, so the portal can honestly say only "queued" here.
 */
export async function queueLuxorAcceptedProposalAgreement(input: {
  invoice: LuxorInvoice
  inquiry: LuxorInquiry
  requestedBy: string
  forceResend?: boolean
}): Promise<LuxorAgreementQueueResult> {
  const { invoice, inquiry, requestedBy, forceResend = false } = input
  if (!hasAcceptedLockedProposal(invoice)) {
    throw new Error('A client-accepted, price-locked final proposal is required before an Event Agreement can be sent.')
  }
  if (invoice.inquiry_id !== inquiry.id || inquiry.status === 'closed_lost' || !inquiry.email) {
    throw new Error('This Event Agreement no longer has an active client recipient.')
  }

  const booking = await getOrCreateBooking(invoice, inquiry)
  // Build the schedule once the proposal is accepted. The first date is
  // provisional until the agreement is signed; signing refreshes the same
  // rows using the booking/Stripe anchor without touching paid rows.
  await syncLuxorPaymentInstallments({ booking, invoice })
  const signature = await getOrCreateSignature(booking)
  if (!hasLuxorSignatureDeliveryDocuments(signature)) {
    return {
      delivery: 'preparing',
      booking,
      signature,
      job: null,
      message: 'The Event Agreement PDFs are still being prepared. No email has been sent.',
    }
  }
  if (signature.status === 'signed' || booking.contract_status === 'signed') {
    return {
      delivery: 'already_signed',
      booking,
      signature,
      job: null,
      message: 'This Event Agreement is already signed. No additional agreement email was queued.',
    }
  }

  const jobs = await listLuxorEmailJobsForInquiry(inquiry.id, 200)
  const matching = jobs.filter((job) => sameSignatureJob(job, signature.id))
  const staleSending = matching.find(isStaleSendingJob) || null
  if (staleSending) {
    const recovered = await updateLuxorEmailJob(staleSending.id, {
      status: 'queued',
      scheduled_for: new Date().toISOString(),
      last_error: 'Recovered a stale in-progress agreement delivery before any provider acceptance was recorded.',
      metadata: agreementJobMetadata(invoice, requestedBy, {
        ...staleSending.metadata,
        stale_delivery_recovered_at: new Date().toISOString(),
        stale_delivery_recovered_by: requestedBy,
      }),
    }) || staleSending
    return {
      delivery: 'queued',
      booking,
      signature,
      job: recovered,
      message: 'A stalled agreement delivery was safely returned to the queue for retry.',
    }
  }
  const queuedOrSending = matching.find((job) => job.status === 'queued' || job.status === 'sending') || null
  if (queuedOrSending) {
    return {
      delivery: 'queued',
      booking,
      signature,
      job: queuedOrSending,
      message: 'The Event Agreement email is already queued for delivery.',
    }
  }

  const latest = matching[0] || null
  if (!forceResend && agreementWasDelivered(signature, latest)) {
    return {
      delivery: 'already_sent',
      booking,
      signature,
      job: latest,
      message: 'The Event Agreement was already delivered. No duplicate email was queued.',
    }
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  const signingUrl = `${origin}/secure-portal/sign/${signature.token}`
  const email = await buildLuxorProposalContractEmail({ invoice, inquiry, booking, signingUrl })
  const now = new Date().toISOString()

  if (latest?.status === 'failed') {
    if (forceResend) {
      // A failed resend must not erase the fact that the original agreement
      // was already delivered. Re-arm only this explicit retry job with its
      // own request key; the worker will use that key as its single-send lock.
      await updateLuxorSignatureRequest(signature.id, {
        metadata: {
          ...signature.metadata,
          agreementDeliveryState: 'retry_requested',
          agreementDeliveryRequestId: latest.id,
          agreementDeliveryResendRequestedAt: now,
          agreementDeliveryPriorState: signature.metadata?.agreementDeliveryState || 'delivered',
        },
      })
    }
    const retried = await updateLuxorEmailJob(latest.id, {
      status: 'queued',
      scheduled_for: now,
      recipient_email: inquiry.email,
      subject: email.subject,
      body: `Your Luxor Event Agreement is ready to review and sign: ${signingUrl}`,
      last_error: null,
      metadata: agreementJobMetadata(invoice, requestedBy, {
        ...latest.metadata,
        agreement_resend: forceResend || latest.metadata?.agreement_resend === true,
        agreement_delivery_request_id: forceResend ? latest.id : latest.metadata?.agreement_delivery_request_id,
        retry_requested_at: now,
        retry_requested_by: requestedBy,
      }),
    }) || latest
    return {
      delivery: 'queued',
      booking,
      signature,
      job: retried,
      message: 'The previous agreement delivery failed, so it has been safely queued for another attempt.',
    }
  }

  const job = await createLuxorEmailJob({
    inquiryId: inquiry.id,
    bookingId: booking.id,
    signatureRequestId: signature.id,
    jobType: 'contract_signature',
    recipientEmail: inquiry.email,
    subject: email.subject,
    body: `Your Luxor Event Agreement is ready to review and sign: ${signingUrl}`,
    // A resend must first record its one-use signature claim key. The one
    // second delay prevents a fast worker from observing a job before that
    // record is durable, then it becomes due immediately after the update.
    scheduledFor: forceResend ? new Date(Date.now() + 1_000).toISOString() : now,
    metadata: agreementJobMetadata(invoice, requestedBy, forceResend ? {
      agreement_resend: true,
      agreement_delivery_request_id: undefined,
      resend_requested_at: now,
      resend_requested_by: requestedBy,
    } : {}),
  })

  if (forceResend) {
    // The job id is the single-use claim key. If two owner requests happen at
    // the same time, only the most recently queued request can move the
    // signature from "retry requested" to "preparing" and send a package.
    await updateLuxorSignatureRequest(signature.id, {
      metadata: {
        ...signature.metadata,
        agreementDeliveryState: 'retry_requested',
        agreementDeliveryRequestId: job.id,
        agreementDeliveryResendRequestedAt: now,
        agreementDeliveryPriorState: signature.metadata?.agreementDeliveryState || 'delivered',
      },
    })
    await updateLuxorEmailJob(job.id, {
      scheduled_for: now,
      metadata: agreementJobMetadata(invoice, requestedBy, {
        ...job.metadata,
        agreement_resend: true,
        agreement_delivery_request_id: job.id,
        resend_requested_at: now,
        resend_requested_by: requestedBy,
      }),
    })
  }

  return {
    delivery: 'queued',
    booking,
    signature,
    job,
    message: forceResend
      ? 'The full Event Agreement package has been queued to resend.'
      : 'The full Event Agreement package has been queued for delivery.',
  }
}
