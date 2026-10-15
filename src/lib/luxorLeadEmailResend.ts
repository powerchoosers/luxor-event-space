export type CorrectEmailResendOption = {
  id: string
  recipientEmail: string
  subject: string
  body: string
  sentAt: string | null
  bounced: boolean
  bounceAt: string | null
  sourceKind: string
  resendKind?: 'snapshot' | 'tour' | 'proposal' | 'agreement'
  invoiceId?: string
  canSend?: boolean
  unavailableLabel?: string
}

/** Rank the newest confirmed bounce first, then the newest eligible snapshot. */
export function rankCorrectEmailResendOptions<T extends CorrectEmailResendOption>(options: T[]): T[] {
  return [...options].sort((a, b) => Number(b.bounced) - Number(a.bounced)
    || Date.parse(b.bounceAt || b.sentAt || '') - Date.parse(a.bounceAt || a.sentAt || ''))
}
