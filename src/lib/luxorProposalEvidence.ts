/** A booking belongs to a proposal only when both IDs are present and equal. */
export function hasMatchingProposalBooking(invoiceId: unknown, bookingInvoiceId: unknown): boolean {
  const proposalId = typeof invoiceId === 'string' ? invoiceId.trim() : ''
  const linkedInvoiceId = typeof bookingInvoiceId === 'string' ? bookingInvoiceId.trim() : ''
  return Boolean(proposalId && linkedInvoiceId && proposalId === linkedInvoiceId)
}

/** Proposal acceptance needs explicit acceptance history or a signature on its exact linked booking. */
export function hasProposalAcceptanceEvidence(input: {
  proposalInvoiceId?: unknown
  bookingInvoiceId?: unknown
  proposalAcceptedAt?: unknown
  acceptedActivity?: boolean
  bookingContractStatus?: unknown
  bookingContractSignedAt?: unknown
}): boolean {
  const acceptedAt = typeof input.proposalAcceptedAt === 'string' ? input.proposalAcceptedAt.trim() : ''
  if (acceptedAt || input.acceptedActivity) return true
  if (!hasMatchingProposalBooking(input.proposalInvoiceId, input.bookingInvoiceId)) return false
  return input.bookingContractStatus === 'signed'
    || (typeof input.bookingContractSignedAt === 'string' && Boolean(input.bookingContractSignedAt.trim()))
}
