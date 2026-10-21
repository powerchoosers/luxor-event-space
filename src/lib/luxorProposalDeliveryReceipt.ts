export type LuxorProposalDeliveryReceipt = {
  proposalSendAttemptId: string
  sentAt: string
  providerMessageId: string | null
}

export type LuxorProposalDeliveryVariant = 'proposal_email' | 'proposal_breakdown_email'

const DELIVERY_VARIANTS: LuxorProposalDeliveryVariant[] = ['proposal_email', 'proposal_breakdown_email']

function deliverySnapshot(context: unknown) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const value = (context as Record<string, unknown>).delivery_snapshot
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function getLuxorProposalDeliverySnapshot(context: unknown, variant: LuxorProposalDeliveryVariant) {
  return deliverySnapshot(context)?.[variant] ?? null
}

export function getLuxorProposalDeliveryReceipts(context: unknown) {
  return DELIVERY_VARIANTS.flatMap((variant) => {
    const receipt = getLuxorProposalDeliveryReceipt(context, variant)
    return receipt ? [{ variant, ...receipt }] : []
  })
}

/** Active publication claims are shared by all email formats on one proposal. */
export function getLuxorActiveProposalDeliveryVariant(context: unknown): LuxorProposalDeliveryVariant | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const record = context as Record<string, unknown>
  const attempt = record.publication_attempt
  if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) return null
  const publication = attempt as Record<string, unknown>
  if (!['preparing', 'sending', 'delivery_unconfirmed'].includes(String(publication.state || ''))) return null
  if (DELIVERY_VARIANTS.includes(publication.variant as LuxorProposalDeliveryVariant)) return publication.variant as LuxorProposalDeliveryVariant
  const snapshot = deliverySnapshot(context)
  return DELIVERY_VARIANTS.find((variant) => {
    const value = snapshot?.[variant]
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && (value as Record<string, unknown>).proposal_send_attempt_id === publication.id)
  }) || null
}

/** Read the durable provider receipt and its original history reservation. */
export function getLuxorProposalDeliveryReceipt(context: unknown, variant: LuxorProposalDeliveryVariant = 'proposal_email'): LuxorProposalDeliveryReceipt | null {
  const snapshot = deliverySnapshot(context)
  const proposalEmail = snapshot?.[variant]
  if (!proposalEmail || typeof proposalEmail !== 'object' || Array.isArray(proposalEmail)) return null
  const receipt = proposalEmail as Record<string, unknown>
  if (receipt.delivery_state !== 'delivered' || typeof receipt.delivery_sent_at !== 'string') return null
  if (typeof receipt.proposal_send_attempt_id !== 'string' || !receipt.proposal_send_attempt_id) return null
  return {
    proposalSendAttemptId: receipt.proposal_send_attempt_id,
    sentAt: receipt.delivery_sent_at,
    providerMessageId: typeof receipt.provider_message_id === 'string' ? receipt.provider_message_id : null,
  }
}
