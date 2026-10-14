/** A booking proves acceptance only when it links to a real proposal ID. */
export function hasMatchingProposalBooking(invoiceId: unknown, bookingInvoiceId: unknown): boolean {
  const proposalId = typeof invoiceId === 'string' ? invoiceId.trim() : ''
  const linkedInvoiceId = typeof bookingInvoiceId === 'string' ? bookingInvoiceId.trim() : ''
  return Boolean(proposalId && linkedInvoiceId && proposalId === linkedInvoiceId)
}
