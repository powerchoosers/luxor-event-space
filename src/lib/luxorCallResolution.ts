export const CALL_OUTCOMES = ['no_answer', 'voicemail_left', 'interested', 'wants_tour', 'needs_time', 'not_interested'] as const
export const CALL_NEXT_STEPS = ['none', 'tour', 'proposal', 'later', 'thank_you', 'nurture', 'stop'] as const
export type CallOutcome = typeof CALL_OUTCOMES[number]
export type CallNextStep = typeof CALL_NEXT_STEPS[number]
export type CallResolutionInput = {
  requestId: string
  inquiryId: string
  taskId: string | null
  outcome: CallOutcome
  nextStep: CallNextStep
  note: string
  dueAt: string | null
  channel: 'phone' | 'email' | null
  nurtureWorkflowId: string | null
}
export type CallResolutionResult = {
  status: 'completed'
  requestId: string
  inquiryId: string
  taskId: string | null
  noteId: string
  nextStep: CallNextStep
  nextTaskId: string | null
  handoff: 'tour' | 'proposal' | 'thank_you' | null
  workflowStatus: string
  nurtureEnrollmentId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isCallResolutionId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function parseCallResolutionInput(value: unknown): CallResolutionInput | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  if (!isCallResolutionId(body.requestId) || !isCallResolutionId(body.inquiryId)
    || (body.taskId !== null && !isCallResolutionId(body.taskId))
    || !CALL_OUTCOMES.includes(body.outcome as CallOutcome) || !CALL_NEXT_STEPS.includes(body.nextStep as CallNextStep)
    || typeof body.note !== 'string' || body.note.length > 500) return null
  const nextStep = body.outcome === 'not_interested' ? 'stop' : body.nextStep as CallNextStep
  if (nextStep === 'later') {
    if (typeof body.dueAt !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.dueAt)
      || !Number.isFinite(Date.parse(body.dueAt))
      || (body.channel !== 'phone' && body.channel !== 'email')) return null
  } else if (body.dueAt != null || body.channel != null) return null
  if (nextStep === 'nurture' ? !isCallResolutionId(body.nurtureWorkflowId) : body.nurtureWorkflowId != null) return null
  return {
    requestId: body.requestId.toLowerCase(), inquiryId: body.inquiryId.toLowerCase(), taskId: typeof body.taskId === 'string' ? body.taskId.toLowerCase() : null,
    outcome: body.outcome as CallOutcome, nextStep, note: body.note,
    dueAt: nextStep === 'later' ? new Date(body.dueAt as string).toISOString() : null,
    channel: nextStep === 'later' ? body.channel as 'phone' | 'email' : null,
    nurtureWorkflowId: nextStep === 'nurture' ? (body.nurtureWorkflowId as string).toLowerCase() : null,
  }
}

export function isCallResolutionResult(value: unknown, input: CallResolutionInput): value is CallResolutionResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  const expectedHandoff = ['tour', 'proposal', 'thank_you'].includes(input.nextStep) ? input.nextStep : null
  return result.status === 'completed' && result.requestId === input.requestId
    && result.inquiryId === input.inquiryId && result.taskId === input.taskId
    && result.nextStep === input.nextStep && isCallResolutionId(result.noteId)
    && result.handoff === expectedHandoff && typeof result.workflowStatus === 'string' && result.workflowStatus.length > 0
    && (input.nextStep === 'later' ? isCallResolutionId(result.nextTaskId) : result.nextTaskId === null)
    && (input.nextStep === 'nurture' ? isCallResolutionId(result.nurtureEnrollmentId) : result.nurtureEnrollmentId === null)
}
