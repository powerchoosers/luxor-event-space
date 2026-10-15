export type ProposalResendReceipt = {
  messageId: string
  providerMessageId: string | null
}

/**
 * The mail outbox and provider idempotency key are the durable operation
 * record. On a lost response, recover an accepted result by that same key;
 * never mint a replacement key. Audit notes are secondary bookkeeping and
 * cannot turn an accepted send into a reported delivery failure.
 */
export async function runProposalResendOperation(input: {
  send: () => Promise<ProposalResendReceipt>
  recover: () => Promise<ProposalResendReceipt | null>
  audit: (receipt: ProposalResendReceipt) => Promise<void>
}) {
  let receipt: ProposalResendReceipt | null = null
  try {
    receipt = await input.send()
  } catch {
    receipt = await input.recover().catch(() => null)
    if (!receipt) return { outcome: 'unconfirmed' as const, receipt: null, auditPending: false }
  }

  let auditPending = false
  try {
    await input.audit(receipt)
  } catch {
    auditPending = true
  }
  return { outcome: 'accepted' as const, receipt, auditPending }
}
