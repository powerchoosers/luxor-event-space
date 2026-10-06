import type { LuxorInquiry, LuxorInvoice } from './luxorInquiryTypes'

export const MARY_ROBLES_INQUIRY_ID = '466c8307-2506-4d6b-9e88-610a50afd657'
export const MARY_ROBLES_PROPOSAL_ID = '71524cf9-380f-4941-9712-6e3e461d8c5d'
export const MARY_ROBLES_CORRECTION_REFERENCE = '1a112f52178e828e'
export const MARY_ROBLES_FROZEN_PDF_SHA256 = 'ed7d9de457a4304c8a48c1530b377de512b9a4df5709b8a84701193bb1aa365e'
export const MARY_ROBLES_FROZEN_EMAIL_HTML_SHA256 = '4372fc58a25b22a10a806a25f7315bd72aad5f906176e5e98b43d67d77f4e10e'
export const MARY_ROBLES_CORRECTED_EMAIL = 'maryhelenrobles648@gmail.com'
export const MARY_ROBLES_ORIGINAL_EMAIL = 'maryhelvnrobles648@gmail.com'

type ResendRequest = {
  expectedInvoiceId: string
  expectedInquiryId: string
  originalEmail: string
  correctedEmail: string
  correctionReference: string
  expectedPdfSha256: string
}

/** Fail-closed eligibility for the approved, one-customer frozen proposal resend. */
export function validateMaryRoblesProposalResend(input: {
  request: ResendRequest
  invoice: LuxorInvoice | null
  inquiry: LuxorInquiry | null
  currentEmailHtmlSha256: string
  currentPdfSha256: string
}) {
  const { request, invoice, inquiry } = input
  if (
    request.expectedInvoiceId !== MARY_ROBLES_PROPOSAL_ID ||
    request.expectedInquiryId !== MARY_ROBLES_INQUIRY_ID ||
    request.originalEmail.trim().toLowerCase() !== MARY_ROBLES_ORIGINAL_EMAIL ||
    request.correctedEmail.trim().toLowerCase() !== MARY_ROBLES_CORRECTED_EMAIL ||
    request.correctionReference !== MARY_ROBLES_CORRECTION_REFERENCE ||
    request.expectedPdfSha256.toLowerCase() !== MARY_ROBLES_FROZEN_PDF_SHA256
  ) return 'This correction request is not the approved proposal resend.'

  if (!invoice || !inquiry || invoice.id !== MARY_ROBLES_PROPOSAL_ID || inquiry.id !== MARY_ROBLES_INQUIRY_ID) {
    return 'The approved proposal or inquiry could not be verified.'
  }
  if (invoice.inquiry_id !== inquiry.id || invoice.invoice_kind !== 'event' || invoice.status !== 'sent') {
    return 'The frozen proposal is not in a resendable state.'
  }
  if (!invoice.price_locked_at || Number(invoice.proposal_version || 0) !== 1 || invoice.proposal_accepted_at || invoice.booking_id) {
    return 'The proposal is no longer an unaccepted, frozen version eligible for correction resend.'
  }
  const proposalContext = invoice.proposal_context as Record<string, unknown> | null | undefined
  const snapshot = proposalContext?.delivery_snapshot as Record<string, unknown> | undefined
  const proposalEmail = snapshot?.proposal_email as Record<string, unknown> | undefined
  const proposalHtml = typeof proposalEmail?.html === 'string' ? proposalEmail.html : ''
  const originalRecipient = typeof proposalEmail?.recipient_email === 'string' ? proposalEmail.recipient_email.trim().toLowerCase() : ''
  if (
    proposalContext?.publication_attempt === null ||
    typeof proposalContext?.publication_attempt !== 'object' ||
    (proposalContext.publication_attempt as Record<string, unknown>).state !== 'completed' ||
    !proposalHtml.trim() || input.currentEmailHtmlSha256.toLowerCase() !== MARY_ROBLES_FROZEN_EMAIL_HTML_SHA256 ||
    proposalEmail?.subject !== 'Your Luxor final proposal is ready' ||
    originalRecipient !== MARY_ROBLES_ORIGINAL_EMAIL
  ) return 'The original frozen email snapshot is incomplete or does not match this correction.'

  if (inquiry.email && ![MARY_ROBLES_ORIGINAL_EMAIL, MARY_ROBLES_CORRECTED_EMAIL].includes(inquiry.email.trim().toLowerCase())) {
    return 'The inquiry email changed after the approval. No message was sent.'
  }
  if (input.currentPdfSha256.toLowerCase() !== MARY_ROBLES_FROZEN_PDF_SHA256) {
    return 'The saved proposal PDF does not match the approved frozen document. No message was sent.'
  }
  return null
}

export function maryRoblesResendIdempotencyKey(proposalVersion: number) {
  return `corrected-proposal-resend/${MARY_ROBLES_PROPOSAL_ID}/v${proposalVersion}/${MARY_ROBLES_CORRECTION_REFERENCE}`
}
