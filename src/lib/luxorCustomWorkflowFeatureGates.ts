// The first custom-workflow release remains fail-closed. Draft authoring and
// runtime dispatch must not become available through an environment override.
export const CUSTOM_WORKFLOW_AUTHORING_ENABLED = false
export const CUSTOM_WORKFLOW_EXECUTION_ENABLED = false

export function isCustomWorkflowJobBlockedFromLegacyDispatch(job: {
  custom_workflow_step_run_id?: string | null
  job_type?: string | null
}) {
  return Boolean(job.custom_workflow_step_run_id) || job.job_type === 'custom_workflow'
}
