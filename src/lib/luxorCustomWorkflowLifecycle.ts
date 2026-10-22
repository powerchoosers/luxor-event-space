export type CustomWorkflowLifecycleStatus = 'draft' | 'active' | 'paused' | 'archived'
export type CustomWorkflowLifecycleAction = 'activate' | 'pause' | 'resume' | 'archive'

export type CustomWorkflowLifecycleDecision = {
  allowed: boolean
  status: number
  message: string
  nextStatus?: CustomWorkflowLifecycleStatus
}

/** Pure policy used by the authenticated route and synthetic identity tests. */
export function evaluateCustomWorkflowLifecycleAction(input: {
  actorEmail: string
  authorizedOperatorEmails: readonly string[]
  status: CustomWorkflowLifecycleStatus
  action: CustomWorkflowLifecycleAction
  authoringEnabled: boolean
  executionEnabled: boolean
  activationEnabled: boolean
}): CustomWorkflowLifecycleDecision {
  const actor = input.actorEmail.trim().toLowerCase()
  const operators = new Set(input.authorizedOperatorEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))
  if (!actor || !operators.has(actor)) return { allowed: false, status: 403, message: 'This portal account cannot manage workflow lifecycle.' }
  if (!input.authoringEnabled) return { allowed: false, status: 503, message: 'Custom workflow lifecycle is disabled.' }

  if (input.action === 'activate' || input.action === 'resume') {
    if (!input.activationEnabled || !input.executionEnabled) {
      return { allowed: false, status: 503, message: 'Workflow activation and resume are disabled by their runtime controls.' }
    }
  }

  const transitions: Record<CustomWorkflowLifecycleAction, { from: CustomWorkflowLifecycleStatus[]; to: CustomWorkflowLifecycleStatus }> = {
    activate: { from: ['draft'], to: 'active' },
    pause: { from: ['active'], to: 'paused' },
    resume: { from: ['paused'], to: 'active' },
    archive: { from: ['draft', 'paused'], to: 'archived' },
  }
  const transition = transitions[input.action]
  if (!transition.from.includes(input.status)) {
    return { allowed: false, status: 409, message: `A ${input.status} workflow cannot be ${input.action}d.` }
  }
  return { allowed: true, status: 200, message: 'Workflow lifecycle transition is allowed.', nextStatus: transition.to }
}
