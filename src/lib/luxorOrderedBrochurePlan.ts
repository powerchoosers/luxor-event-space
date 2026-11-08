import { workflowDelayAfterPreviousStep } from './luxorWorkflowProgression'

export type OrderedBrochureStep = {
  step_key: string
  name: string
  sort_order: number
  channel: 'email' | 'phone' | 'sms'
  delay_days: number
  active: boolean
}

export type OrderedBrochurePlan =
  | { type: 'next'; step: OrderedBrochureStep; scheduledAt: string }
  | { type: 'complete' }
  | { type: 'hold'; reason: 'invalid_sequence' | 'contact_busy' | 'previous_incomplete' | 'missing_contact' | 'consent_required' }

/** The brochure delivery is an independent transactional message. It is not
 * a workflow slot, but the sequence must not treat it as sent while queued or
 * after a failed or uncertain delivery. */
export function brochureDeliveryPrerequisite(job: { status: string; sent_at: string | null } | null):
  | { type: 'completed'; at: string }
  | { type: 'waiting' }
  | { type: 'hold' } {
  if (!job) return { type: 'hold' }
  if (job.status === 'sent' && job.sent_at && Number.isFinite(Date.parse(job.sent_at))) return { type: 'completed', at: job.sent_at }
  if (job.status === 'queued' || job.status === 'sending') return { type: 'waiting' }
  return { type: 'hold' }
}

/** Plan only. The database must claim the contact and create the action in
 * one transaction, rechecking current consent and lead status before use. */
export function planNextBrochureAction(input: {
  templates: readonly OrderedBrochureStep[]
  previousStepKey: string
  previousCompletedAt: string | null
  contactBusy: boolean
  hasEmail: boolean
  hasPhone: boolean
  marketingOptIn: boolean
}): OrderedBrochurePlan {
  if (input.contactBusy) return { type: 'hold', reason: 'contact_busy' }
  if (!input.previousCompletedAt || !Number.isFinite(Date.parse(input.previousCompletedAt))) {
    return { type: 'hold', reason: 'previous_incomplete' }
  }
  const steps = [...input.templates].sort((a, b) => a.sort_order - b.sort_order)
  const uniqueKeys = new Set(steps.map((step) => step.step_key))
  const uniqueOrder = new Set(steps.map((step) => step.sort_order))
  if (steps.length !== 9 || uniqueKeys.size !== steps.length || uniqueOrder.size !== steps.length
    || steps[0]?.step_key !== 'email_1' || steps.some((step) => !step.active || !step.name?.trim() || step.channel === 'sms'
      || !Number.isInteger(step.sort_order) || !Number.isInteger(step.delay_days) || step.delay_days < 0 || step.delay_days > 365)
    || steps.some((step, index) => index > 0 && step.delay_days < steps[index - 1].delay_days)) {
    return { type: 'hold', reason: 'invalid_sequence' }
  }
  const previousIndex = steps.findIndex((step) => step.step_key === input.previousStepKey)
  if (previousIndex < 0) return { type: 'hold', reason: 'invalid_sequence' }
  if (previousIndex === steps.length - 1) return { type: 'complete' }
  const previous = steps[previousIndex]
  const step = steps[previousIndex + 1]
  if (step.delay_days < previous.delay_days) return { type: 'hold', reason: 'invalid_sequence' }
  if (!input.marketingOptIn) return { type: 'hold', reason: 'consent_required' }
  if (step.channel === 'phone' && !input.hasPhone) return { type: 'hold', reason: 'missing_contact' }
  if (step.channel === 'email' && !input.hasEmail) return { type: 'hold', reason: 'missing_contact' }
  const delay = workflowDelayAfterPreviousStep(previous.delay_days, step.delay_days)
  const scheduledTime = Date.parse(input.previousCompletedAt) + delay
  if (!Number.isFinite(new Date(scheduledTime).getTime())) return { type: 'hold', reason: 'invalid_sequence' }
  return { type: 'next', step, scheduledAt: new Date(scheduledTime).toISOString() }
}

/** A preview assumes completion at the supplied time; it does not reserve,
 * create, or schedule any task or message. */
export function previewNextBrochureAction(
  input: Omit<Parameters<typeof planNextBrochureAction>[0], 'previousCompletedAt' | 'contactBusy'>,
  assumedCompletionAt: string,
): OrderedBrochurePlan {
  return planNextBrochureAction({ ...input, previousCompletedAt: assumedCompletionAt, contactBusy: false })
}
