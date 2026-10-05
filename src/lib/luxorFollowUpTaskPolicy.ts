import type { LuxorTask } from './luxorInquiryTypes'

export type LuxorFollowUpChannel = 'email' | 'phone'

export function isLuxorFollowUpTask(task: LuxorTask) {
  return Boolean(task.description?.startsWith('[follow-up:')) ||
    Boolean(task.automation_enrollment_id && task.automation_step_key?.startsWith('phone_'))
}

export function getLuxorFollowUpTaskChannel(task: LuxorTask): LuxorFollowUpChannel {
  if (task.automation_step_key?.startsWith('phone_')) return 'phone'
  return task.description?.startsWith('[follow-up:email]') ? 'email' : 'phone'
}

export function phoneCompletionNeedsOutcome(channel: LuxorFollowUpChannel, outcome?: string, rescheduling = false) {
  return channel === 'phone' && !rescheduling && !outcome
}

export function buildFollowUpTaskPatch(input: {
  status: 'completed' | 'cancelled'
  dueDate?: string
  dueAt?: string
  outcome?: string
  channel: LuxorFollowUpChannel
  completedAt: string
}) {
  if (input.dueDate) return { due_date: input.dueDate, due_at: input.dueAt }
  return {
    status: input.status,
    completed_at: input.status === 'completed' ? input.completedAt : null,
    ...(input.outcome && input.channel === 'phone' ? { call_outcome: input.outcome } : {}),
  }
}
