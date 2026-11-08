/** Pure rules for advancing one workflow action. Persistence and dispatch must
 * atomically enforce these decisions; this module does not send messages. */
export type WorkflowActionKind = 'call' | 'email' | 'text'
export type WorkflowActionState = 'ready' | 'scheduled' | 'sending' | 'held' | 'completed' | 'stopped'

export type WorkflowAction = {
  id: string
  kind: WorkflowActionKind
  state: WorkflowActionState
}

export type WorkflowActionEvent =
  | { type: 'task_completed'; actionId: string }
  | { type: 'provider_accepted'; actionId: string }
  | { type: 'provider_failed'; actionId: string }
  | { type: 'provider_uncertain'; actionId: string }
  | { type: 'cancelled'; actionId: string }

export type WorkflowTransition =
  | { type: 'advance'; state: 'completed' }
  | { type: 'hold'; state: 'held' }
  | { type: 'ignore' }

/** Completion is channel-specific. Failures and cancellations never advance. */
export function workflowActionTransition(action: WorkflowAction, event: WorkflowActionEvent): WorkflowTransition {
  if (action.id !== event.actionId || action.state === 'completed' || action.state === 'stopped' || action.state === 'held') {
    return { type: 'ignore' }
  }
  if (event.type === 'task_completed') {
    return action.kind === 'call' && action.state === 'ready'
      ? { type: 'advance', state: 'completed' }
      : { type: 'ignore' }
  }
  if (event.type === 'provider_accepted') {
    return action.kind !== 'call' && action.state === 'sending'
      ? { type: 'advance', state: 'completed' }
      : { type: 'ignore' }
  }
  if (event.type === 'provider_failed' || event.type === 'provider_uncertain') {
    return action.kind !== 'call' && action.state === 'sending'
      ? { type: 'hold', state: 'held' }
      : { type: 'ignore' }
  }
  return { type: 'hold', state: 'held' }
}

/** Convert cumulative template offsets into a delay from the prior completion. */
export function workflowDelayAfterPreviousStep(previousDays: number, nextDays: number): number {
  if (!Number.isInteger(previousDays) || !Number.isInteger(nextDays) || previousDays < 0 || nextDays < previousDays) {
    throw new Error('Workflow step offsets must be nonnegative and in order.')
  }
  return (nextDays - previousDays) * 24 * 60 * 60 * 1000
}

/** A failed, uncertain or pending action still occupies the contact's slot. */
export function workflowContactHasOpenAction(actions: readonly WorkflowAction[]): boolean {
  return actions.some((action) => action.state !== 'completed' && action.state !== 'stopped')
}

export type WorkflowContactIdentity = {
  inquiryId: string
  // These are normalized by the existing server-side email and phone helpers.
  email: string | null
  phone: string | null
}

/** A repeat inquiry with either shared identifier is the same contact for
 * ordering. Callers must normalize identifiers and enforce this under a lock. */
export function workflowContactsOverlap(a: WorkflowContactIdentity, b: WorkflowContactIdentity): boolean {
  return a.inquiryId === b.inquiryId
    || Boolean(a.email && b.email && a.email === b.email)
    || Boolean(a.phone && b.phone && a.phone === b.phone)
}
