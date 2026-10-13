export type LuxorProposalDeliveryReceipt = {
  proposalSendAttemptId: string
  sentAt: string
  providerMessageId: string | null
}

/** Read the durable provider receipt and its original history reservation. */
export function getLuxorProposalDeliveryReceipt(context: unknown): LuxorProposalDeliveryReceipt | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  const deliverySnapshot = (context as Record<string, unknown>).delivery_snapshot
  if (!deliverySnapshot || typeof deliverySnapshot !== 'object' || Array.isArray(deliverySnapshot)) return null
  const proposalEmail = (deliverySnapshot as Record<string, unknown>).proposal_email
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
