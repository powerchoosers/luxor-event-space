export type CorrectEmailResendOption = {
  id: string
  recipientEmail: string
  subject: string
  body: string
  sentAt: string | null
  bounced: boolean
  bounceAt: string | null
  sourceKind: string
  resendKind?: 'snapshot' | 'tour' | 'proposal' | 'agreement' | 'payment'
  invoiceId?: string
  canSend?: boolean
  unavailableLabel?: string
}

export type EmailDeliveryEvidence = {
  id: string
  status: string
  occurred_at: string
  accepted_at?: string | null
  to_addresses?: string[] | null
}

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked'])

/** Resolve delivery for the exact message recipient, ignoring unrelated later mail. */
export function getRecipientBounceEvidence(rows: EmailDeliveryEvidence[], recipient: string) {
  const expected = recipient.trim().toLowerCase()
  const matching = rows.filter((row) => (row.to_addresses || []).some((address) => address.trim().toLowerCase() === expected))
  const latest = [...matching].sort((a, b) => Date.parse(b.occurred_at || b.accepted_at || '') - Date.parse(a.occurred_at || a.accepted_at || ''))[0]
  if (!latest || SUCCESS_STATUSES.has(latest.status)) return { bounced: false, bounceAt: null as string | null }
  return { bounced: latest.status === 'bounced', bounceAt: latest.status === 'bounced' ? latest.occurred_at : null }
}

export function isLeadEmailResendStage(inquiry: { status: string; pipeline_stage?: string | null }) {
  if (inquiry.status === 'closed_lost' || inquiry.pipeline_stage === 'closed_lost') return false
  if (['new', 'contacted', 'tour_requested', 'tour_confirmed'].includes(inquiry.status)) {
    return ['newsletter', 'inquiry', 'tour'].includes(inquiry.pipeline_stage ?? 'inquiry')
  }
  return (inquiry.status === 'proposal_sent' && inquiry.pipeline_stage === 'contract')
    || (inquiry.status === 'booked' && ['contract', 'deposit', 'planning', 'event', 'closing', 'final_payment'].includes(inquiry.pipeline_stage || ''))
}

/** Rank the newest confirmed bounce first, then the newest eligible snapshot. */
export function rankCorrectEmailResendOptions<T extends CorrectEmailResendOption>(options: T[]): T[] {
  return [...options].sort((a, b) => Number(b.bounced) - Number(a.bounced)
    || Date.parse(b.bounceAt || b.sentAt || '') - Date.parse(a.bounceAt || a.sentAt || ''))
}
