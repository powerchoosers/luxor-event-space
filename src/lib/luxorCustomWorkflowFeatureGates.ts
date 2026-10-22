// The first custom-workflow release remains fail-closed. Draft authoring and
// runtime dispatch must not become available through an environment override.
export const CUSTOM_WORKFLOW_AUTHORING_ENABLED = false
export const CUSTOM_WORKFLOW_EXECUTION_ENABLED = false

export type CustomWorkflowDispatchLane = 'legacy' | 'custom'

/**
 * Share due-message worker slots between existing and custom marketing queues.
 * Cron runs at minute cadence, so alternating minute buckets prevents a
 * continuously busy legacy queue from starving custom work without increasing
 * the worker's per-run message or SMS-segment budget.
 */
export function getCustomWorkflowDispatchOrder(nowMs = Date.now()): readonly [CustomWorkflowDispatchLane, CustomWorkflowDispatchLane] {
  const customFirst = Math.floor(nowMs / 60_000) % 2 === 1
  return customFirst ? ['custom', 'legacy'] : ['legacy', 'custom']
}

export function isCustomWorkflowJobBlockedFromLegacyDispatch(job: {
  custom_workflow_step_run_id?: string | null
  job_type?: string | null
}) {
  return Boolean(job.custom_workflow_step_run_id) || job.job_type === 'custom_workflow'
}
