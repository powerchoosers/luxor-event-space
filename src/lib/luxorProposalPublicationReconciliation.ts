export type LuxorPublicationAttemptState = { id?: string; state?: string }

/** Finish publication and return the row refreshed after database updated_at triggers run. */
export async function finishLuxorProposalPublicationAndFetchFreshInvoice<T extends { id: string; proposal_context?: unknown }>(
  invoiceId: string,
  attemptId: string,
  finish: (invoiceId: string, attemptId: string, state: 'completed') => Promise<unknown>,
  getInvoice: (invoiceId: string) => Promise<T | null>,
): Promise<T> {
  await finish(invoiceId, attemptId, 'completed')
  const latest = await getInvoice(invoiceId)
  const latestContext = latest?.proposal_context
  const latestAttempt = latestContext && typeof latestContext === 'object' && !Array.isArray(latestContext)
    ? (latestContext as Record<string, unknown>).publication_attempt as LuxorPublicationAttemptState | undefined
    : undefined
  if (latest && latestAttempt?.id === attemptId && latestAttempt.state === 'completed') return latest
  throw new Error('The saved delivery receipt was reconciled, but publication state needs retry.')
}
