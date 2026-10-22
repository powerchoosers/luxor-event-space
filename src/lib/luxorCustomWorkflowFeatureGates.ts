// Code paths are release-ready, but live access still requires the independent
// database controls. Those controls remain fail-closed until the rollout is
// explicitly enabled there; no environment variable can override either gate.
export const CUSTOM_WORKFLOW_AUTHORING_ENABLED = true
export const CUSTOM_WORKFLOW_EXECUTION_ENABLED = true

/**
 * Dispatch lane order is persisted and serialized by the database claim RPC.
 * Do not derive priority from wall-clock parity: delayed or overlapping cron
 * ticks can repeat the same minute bucket and starve the other queue.
 */
export function isCustomWorkflowJobBlockedFromLegacyDispatch(job: {
  custom_workflow_step_run_id?: string | null
  job_type?: string | null
}) {
  return Boolean(job.custom_workflow_step_run_id) || job.job_type === 'custom_workflow'
}
