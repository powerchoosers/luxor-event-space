import type { LuxorInvoice } from '@/lib/luxorInquiryTypes'

type ProposalDisplayEvidence = {
  hasSignedAgreement?: boolean
  hasAcceptedProposal?: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/**
 * Keep a breakdown-only card distinct, while honoring evidence that an
 * individual proposal was prepared, handed off, or accepted on the same row.
 * Do not use generic invoice status or proposal_sent_at here: breakdown sends
 * write both. A bare view is also ambiguous because the breakdown shares the
 * public proposal URL, so it counts only alongside individual-send evidence.
 * A prepared snapshot alone does not mean its send succeeded.
 */
export function getProposalDisplayLabel(invoice: LuxorInvoice, evidence: ProposalDisplayEvidence = {}) {
  const context = record(invoice.proposal_context)
  const isBreakdownRecord = context?.proposal_record_type === 'proposal_breakdown'

  if (isBreakdownRecord) {
    const deliverySnapshot = record(context.delivery_snapshot)
    const individualEmail = record(deliverySnapshot?.proposal_email)
    const inPerson = record(deliverySnapshot?.in_person)
    const publicationAttempt = record(context.publication_attempt)
    const hasIndividualProposalEvidence = Boolean(
      individualEmail?.delivery_state === 'delivered'
      || inPerson?.handoff_state === 'ready'
      || (publicationAttempt?.variant === 'proposal_email'
        && ['preparing', 'sending', 'delivery_unconfirmed', 'completed'].includes(String(publicationAttempt.state || '')))
      || invoice.proposal_accepted_at
      || evidence.hasAcceptedProposal
      || evidence.hasSignedAgreement,
    )

    if (!hasIndividualProposalEvidence) return 'Proposal Breakdown'
  }

  if (Number.isInteger(invoice.proposal_number) && Number(invoice.proposal_number) > 0) {
    return `Proposal${invoice.proposal_number === 1 ? '' : ` #${invoice.proposal_number}`}${invoice.supersedes_invoice_id ? ' · Revision' : ''}`
  }

  const hasBeenPublished = Boolean(invoice.proposal_sent_at || invoice.status === 'sent' || invoice.price_locked_at)
  return hasBeenPublished ? 'Existing proposal' : 'Draft proposal'
}
