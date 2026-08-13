import 'server-only'

import type { LuxorEmailJob, LuxorInvoice } from './luxorInquiryTypes'
import { getLuxorBooking, updateLuxorBooking } from './luxorBookingsServer'
import { downloadLuxorDocument, downloadLuxorPrivatePdf, getLuxorDocumentByInvoice, saveLuxorProposalPdf } from './luxorDocumentsServer'
import { createNote } from './luxorNotesServer'
import { getLuxorInquiry, updateLuxorInquiry } from './luxorInquiriesServer'
import { buildLuxorInvoicePdf } from './luxorInvoicePdfServer'
import { getInvoice } from './luxorInvoicesServer'
import { buildLuxorProposalContractEmail } from './luxorProposalEmailServer'
import {
  claimLuxorSignatureAgreementDelivery,
  getLuxorSignatureRequestById,
  hasLuxorSignatureDeliveryDocuments,
  markLuxorSignatureAgreementDelivery,
  recordLuxorSignatureEvent,
} from './luxorSignaturesServer'
import { supabaseRest } from './supabaseRestServer'
import { sendLuxorZohoEmail } from './zohoMailServer'

export const LUXOR_AGREEMENT_ATTACHMENT_MANIFEST = [
  { key: 'final_proposal_pdf', label: 'Final proposal PDF', filename: 'Luxor-Final-Proposal.pdf' },
  { key: 'event_agreement_pdf', label: 'Event Agreement PDF', filename: 'Luxor-Event-Agreement.pdf' },
  { key: 'guest_guide_pdf', label: 'Guest Guide PDF', filename: 'Luxor-Guest-Guide.pdf' },
] as const

type AgreementDeliveryResult =
  | { status: 'sent'; messageId: string | null; sentAt: string }
  | { status: 'already_delivered' }
  | { status: 'deferred' }

function jobMetadata(job: LuxorEmailJob) {
  return job.metadata && typeof job.metadata === 'object' ? job.metadata : {}
}

async function patchEmailJob(id: string, updates: Partial<LuxorEmailJob>) {
  const [updated] = await supabaseRest<LuxorEmailJob[]>(`luxor_email_jobs?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  })
  return updated ?? null
}

function invoiceIdForAgreementJob(job: LuxorEmailJob, fallbackInvoiceId: string | null) {
  const invoiceId = jobMetadata(job).invoice_id
  return typeof invoiceId === 'string' && invoiceId ? invoiceId : fallbackInvoiceId
}

function deliveryRequestIdForAgreementJob(job: LuxorEmailJob) {
  const requestId = jobMetadata(job).agreement_delivery_request_id
  if (typeof requestId === 'string' && requestId) return requestId
  return jobMetadata(job).agreement_resend === true ? job.id : undefined
}

function hasAcceptedLockedProposal(invoice: LuxorInvoice | null | undefined): invoice is LuxorInvoice {
  return Boolean(
    invoice &&
    invoice.invoice_kind === 'event' &&
    invoice.status === 'sent' &&
    invoice.price_locked_at &&
    invoice.proposal_accepted_at &&
    invoice.offer_status !== 'withdrawn',
  )
}

/**
 * Sends the one legal agreement package through the email-job worker. This is
 * intentionally the only worker branch that may deliver a contract-signature
 * job: it always includes the frozen final proposal, the exact agreement PDF,
 * and the Guest Guide together.
 */
export async function deliverLuxorAgreementEmailJob(job: LuxorEmailJob): Promise<AgreementDeliveryResult> {
  if (job.job_type !== 'contract_signature') {
    throw new Error('This email job is not an Event Agreement delivery.')
  }
  if (!job.booking_id || !job.signature_request_id) {
    throw new Error('The Event Agreement delivery is missing its booking or signing record.')
  }

  const [booking, signature] = await Promise.all([
    getLuxorBooking(job.booking_id),
    getLuxorSignatureRequestById(job.signature_request_id),
  ])
  if (!booking || !signature || signature.booking_id !== booking.id) {
    throw new Error('The Event Agreement delivery no longer matches its booking and signing record.')
  }
  if (!hasLuxorSignatureDeliveryDocuments(signature)) {
    throw new Error('The Event Agreement files are still being prepared. Please try the delivery again shortly.')
  }

  const invoiceId = invoiceIdForAgreementJob(job, booking.invoice_id)
  const [invoice, inquiry] = await Promise.all([
    invoiceId ? getInvoice(invoiceId) : Promise.resolve(null),
    booking.inquiry_id ? getLuxorInquiry(booking.inquiry_id) : Promise.resolve(null),
  ])
  if (!hasAcceptedLockedProposal(invoice)) {
    throw new Error('A client-accepted, price-locked final proposal is required before an Event Agreement can be delivered.')
  }
  if (booking.invoice_id !== invoice.id || invoice.booking_id && invoice.booking_id !== booking.id) {
    throw new Error('The Event Agreement delivery does not match the accepted final proposal.')
  }
  if (!inquiry || inquiry.id !== invoice.inquiry_id || inquiry.status === 'closed_lost' || !inquiry.email) {
    throw new Error('The Event Agreement no longer has an active client recipient.')
  }
  if (signature.client_email.trim().toLowerCase() !== inquiry.email.trim().toLowerCase()) {
    throw new Error('The signing record email does not match the accepted proposal recipient.')
  }
  if (signature.status === 'signed') {
    return { status: 'already_delivered' }
  }

  const deliveryRequestId = deliveryRequestIdForAgreementJob(job)
  const deliveryClaim = await claimLuxorSignatureAgreementDelivery(
    signature,
    new Date().toISOString(),
    deliveryRequestId ? { deliveryRequestId } : undefined,
  )
  if (deliveryClaim.state === 'delivered') {
    return { status: 'already_delivered' }
  }
  if (deliveryClaim.state === 'in_flight') {
    return { status: 'deferred' }
  }

  const claimedSignature = deliveryClaim.signature
  const proposalDocument = await getLuxorDocumentByInvoice(invoice.id, 'proposal')
  const proposalPdf = proposalDocument
    ? await downloadLuxorDocument(proposalDocument)
    : await buildLuxorInvoicePdf(invoice, inquiry)
  if (!proposalDocument) {
    await saveLuxorProposalPdf({
      invoice,
      inquiryId: inquiry.id,
      pdf: proposalPdf,
      createdBy: 'Agreement delivery recovery',
    })
  }
  const [contractPdf, guidePdf] = await Promise.all([
    downloadLuxorPrivatePdf(claimedSignature.contract_document_path || ''),
    downloadLuxorPrivatePdf(claimedSignature.guest_guide_path || ''),
  ])
  const signingUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')}/secure-portal/sign/${claimedSignature.token}`
  const email = await buildLuxorProposalContractEmail({ invoice, inquiry, booking, signingUrl })
  const receipt = await sendLuxorZohoEmail({
    to: inquiry.email,
    subject: email.subject,
    content: email.html,
    from: 'booking@luxoratlaspalmas.com',
    fromName: 'Luxor at Las Palmas Events',
    attachments: [
      { filename: `Luxor-Final-Proposal-${invoice.id.slice(0, 8)}.pdf`, content: proposalPdf, contentType: 'application/pdf' },
      { filename: 'Luxor-Event-Agreement.pdf', content: contractPdf, contentType: 'application/pdf' },
      { filename: 'Luxor-Guest-Guide.pdf', content: guidePdf, contentType: 'application/pdf' },
    ],
  })

  const sentAt = new Date().toISOString()
  const manifest = LUXOR_AGREEMENT_ATTACHMENT_MANIFEST.map((attachment) => ({ ...attachment, included: true }))
  // Persist the provider acceptance record before lower-priority portal state.
  // If a later bookkeeping write is interrupted, the queue must never try to
  // send the same agreement package a second time.
  try {
    await patchEmailJob(job.id, {
      status: 'sent',
      sent_at: sentAt,
      last_error: null,
      metadata: {
        ...jobMetadata(job),
        agreement_delivery: true,
        delivery_provider: 'zoho',
        delivery_message_id: receipt.messageId,
        delivery_accepted_at: sentAt,
        attachment_manifest: manifest,
      },
    })
  } catch (error) {
    console.error('Zoho accepted the Event Agreement, but the delivery receipt could not be saved:', error)
  }

  try {
    const deliveredSignature = await markLuxorSignatureAgreementDelivery(claimedSignature, 'delivered', sentAt)
    await updateLuxorBooking(booking.id, {
      contract_status: booking.contract_status === 'viewed' ? 'viewed' : 'sent',
      contract_sent_at: sentAt,
      metadata: {
        ...booking.metadata,
        proposal_accepted_at: invoice.proposal_accepted_at,
        latest_signature_request_id: claimedSignature.id,
        reservation_state: 'awaiting_signature',
      },
    })
    await updateLuxorInquiry(inquiry.id, {
      status: 'booked',
      pipeline_stage: 'contract',
      metadata: {
        ...inquiry.metadata,
        proposal_accepted_at: invoice.proposal_accepted_at,
        latest_proposal_invoice_id: invoice.id,
        latest_signature_request_id: deliveredSignature?.id || claimedSignature.id,
      },
    })
    await recordLuxorSignatureEvent({
      signatureRequestId: claimedSignature.id,
      eventType: 'sent',
      metadata: { delivery: 'email_job', provider: 'zoho', messageId: receipt.messageId },
    })
    await createNote(
      inquiry.id,
      'Event Agreement delivered for signature. Stripe will be sent only after the agreement is signed.',
      'status_change',
      'Luxor agreement delivery',
    )
  } catch (error) {
    // Delivery has already been accepted by Zoho. Keep that fact authoritative
    // and let the read-side recovery reconcile any delayed portal state.
    console.error('Event Agreement was delivered, but its portal status could not be fully updated:', error)
  }

  return { status: 'sent', messageId: receipt.messageId, sentAt }
}

/** Keep a failed provider attempt visibly unsent and safe to retry later. */
export async function markLuxorAgreementEmailJobFailed(job: LuxorEmailJob, error: string) {
  if (job.job_type !== 'contract_signature') return
  const signature = job.signature_request_id ? await getLuxorSignatureRequestById(job.signature_request_id).catch(() => null) : null
  if (signature?.metadata?.agreementDeliveryState === 'delivered') return
  const isResend = jobMetadata(job).agreement_resend === true
  if (signature && isResend) {
    // A resend can fail after the original agreement was already delivered or
    // opened. Preserve that established delivery state and let the owner retry
    // the failed resend explicitly; never turn a valid contract back into
    // "not sent" because a duplicate reminder could not leave Zoho.
    await updateLuxorSignatureRequest(signature.id, {
      metadata: {
        ...signature.metadata,
        agreementDeliveryState: 'delivered',
        agreementDeliveryResendFailedAt: new Date().toISOString(),
        agreementDeliveryResendLastError: error,
      },
    }).catch((markError) => {
      console.error('Agreement resend failure could not preserve the original delivery state:', markError)
    })
    return
  }
  if (signature) {
    await markLuxorSignatureAgreementDelivery(signature, 'failed').catch((markError) => {
      console.error('Agreement delivery failure could not be marked on the signature:', markError)
    })
  }
  const booking = job.booking_id ? await getLuxorBooking(job.booking_id).catch(() => null) : null
  if (booking && booking.contract_status !== 'signed') {
    await updateLuxorBooking(booking.id, {
      contract_status: 'not_sent',
      metadata: {
        ...booking.metadata,
        agreement_delivery_last_error: error,
        agreement_delivery_failed_at: new Date().toISOString(),
      },
    }).catch((updateError) => {
      console.error('Agreement delivery failure could not be marked on the booking:', updateError)
    })
  }
}

export async function deferLuxorAgreementEmailJob(job: LuxorEmailJob) {
  await patchEmailJob(job.id, {
    status: 'queued',
    scheduled_for: new Date(Date.now() + 60_000).toISOString(),
    last_error: null,
  })
}

export async function cancelAlreadyDeliveredLuxorAgreementEmailJob(job: LuxorEmailJob) {
  await patchEmailJob(job.id, {
    status: 'cancelled',
    last_error: 'The Event Agreement was already delivered; no duplicate email was sent.',
  })
}
