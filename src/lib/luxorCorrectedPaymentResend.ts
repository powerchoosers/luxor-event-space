import type { LuxorEmailJob } from './luxorInquiryTypes'

export function canSendCorrectedPaymentReminder(member: { role: string; permissions: string[] } | null | undefined) {
  return Boolean(member && (member.role === 'owner' || member.permissions.includes('finances')))
}

export function correctedPaymentReminderKind(jobType: string): 'final_payment' | 'unpaid_invoice' {
  return jobType === 'final_payment_reminder' || jobType === 'final_payment_request'
    ? 'final_payment'
    : 'unpaid_invoice'
}

/** Corrected-payment sends must enter the atomic worker claim path immediately. */
export async function claimAndProcessCorrectedPaymentResend(
  job: LuxorEmailJob,
  process: (jobs: LuxorEmailJob[], options: { markSending: boolean }) => Promise<unknown>,
) {
  return process([job], { markSending: true })
}
