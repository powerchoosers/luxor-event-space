import type { CustomWorkflowStep } from './luxorCustomWorkflowDefinition'

export type TentativeWorkflowPreview =
  | { type: 'next'; channel: 'call' | 'email' | 'text'; title: string; tentativeAt: string }
  | { type: 'conditional' }
  | { type: 'finished' }
  | { type: 'unavailable' }

/** Preview from an assumed completion instant. This never creates work, and
 * a condition is deliberately not evaluated against a changing lead. */
export function previewCustomWorkflowNextAction(
  steps: readonly CustomWorkflowStep[], currentStepId: string, assumedCompletionAt: string,
): TentativeWorkflowPreview {
  const start = Date.parse(assumedCompletionAt)
  const current = steps.findIndex((step) => step.id === currentStepId)
  if (!Number.isFinite(start) || current < 0 || steps[current]?.type !== 'call_task'
    || new Set(steps.map((step) => step.id)).size !== steps.length) return { type: 'unavailable' }
  let at = start
  for (const step of steps.slice(current + 1)) {
    if (step.type === 'condition') return { type: 'conditional' }
    if (step.type === 'end') return { type: 'finished' }
    if (step.type === 'wait') {
      if (!Number.isInteger(step.amount) || step.amount === null || step.amount < 0 || step.amount > 365) return { type: 'unavailable' }
      const multiplier = step.unit === 'minutes' ? 60_000 : step.unit === 'hours' ? 3_600_000 : step.unit === 'days' ? 86_400_000 : 0
      if (!multiplier) return { type: 'unavailable' }
      at += step.amount * multiplier
      continue
    }
    if (step.type === 'email' && step.mode !== 'marketing') return { type: 'conditional' }
    if (step.type === 'call_task') {
      if (!Number.isInteger(step.dueWithinHours) || step.dueWithinHours < 1 || step.dueWithinHours > 168) return { type: 'unavailable' }
      at += step.dueWithinHours * 3_600_000
    }
    if (!Number.isFinite(new Date(at).getTime()) || !step.name?.trim()) return { type: 'unavailable' }
    return {
      type: 'next',
      channel: step.type === 'call_task' ? 'call' : step.type,
      title: step.name,
      tentativeAt: new Date(at).toISOString(),
    }
  }
  return { type: 'unavailable' }
}
