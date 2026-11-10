import { CUSTOM_WORKFLOW_RUNTIME_TRIGGERS, CUSTOM_WORKFLOW_TRIGGER_LABELS, type CustomWorkflowTrigger } from './luxorCustomWorkflowDefinition'

/** Keep runtime limitations visible even if a model omits them from its explanation. */
export function workflowArchitectExplanation(trigger: CustomWorkflowTrigger, explanation: unknown, connectedTriggers: readonly CustomWorkflowTrigger[] = CUSTOM_WORKFLOW_RUNTIME_TRIGGERS) {
  const text = typeof explanation === 'string' && explanation.trim() ? explanation.trim().slice(0, 700) : 'Review this inactive draft before saving.'
  if (connectedTriggers.includes(trigger)) return text
  const name = CUSTOM_WORKFLOW_TRIGGER_LABELS[trigger]?.label || 'This trigger'
  return `${text}\n\n${name} is not connected to automatic enrollment yet. This draft cannot be activated with that trigger. Choose Manual enrollment or Contact form inquiry if appropriate.`
}
