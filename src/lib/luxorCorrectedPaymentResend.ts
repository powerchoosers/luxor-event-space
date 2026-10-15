import type { LuxorEmailJob } from './luxorInquiryTypes'

export type CorrectedPaymentReservation = {
  job: LuxorEmailJob
  created: boolean
  preparing: boolean
}

export type CorrectedPaymentContent = {
  subject: string
  body: string
  checkoutSessionId: string
  balanceDue: number
}

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

/** Reserve first. Only the transaction that created the reservation may build checkout content. */
export async function runCorrectedPaymentResend(input: {
  reserve: () => Promise<CorrectedPaymentReservation>
  prepareContent: () => Promise<CorrectedPaymentContent>
  finalize: (job: LuxorEmailJob, content: CorrectedPaymentContent) => Promise<LuxorEmailJob>
  process: (jobs: LuxorEmailJob[], options: { markSending: boolean }) => Promise<unknown>
  loadLatest: (jobId: string, fallback: LuxorEmailJob) => Promise<LuxorEmailJob>
}) {
  const reservation = await input.reserve()
  let job = reservation.job
  if (reservation.preparing) {
    if (!reservation.created) return { job, delivery: 'preparing' as const, replayed: true }
    job = await input.finalize(job, await input.prepareContent())
  }
  if (!['failed', 'cancelled'].includes(job.status)) await claimAndProcessCorrectedPaymentResend(job, input.process)
  const latest = await input.loadLatest(job.id, job)
  return { job: latest, delivery: latest.status, replayed: !reservation.created }
}
