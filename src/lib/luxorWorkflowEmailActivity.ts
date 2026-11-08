export type WorkflowEmailActivityInput = {
  slotStatus: 'open' | 'held' | 'completed' | 'stopped'
  workflowStatus?: 'active' | 'paused' | 'held'
  actionKind: 'call' | 'email' | 'text'
  subject: string | null
  jobStatus: 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled' | null
  scheduledFor: string | null
  tentative?: boolean
  dispatch?: {
    stage: string
    accepted_at: string | null
    dispatch_started_at: string | null
    expires_at: string | null
    finalized_at: string | null
  } | null
}

export type WorkflowEmailActivity = {
  label: 'Scheduled email' | 'Email pending scheduling' | 'Email preparing' | 'Email sending' | 'Email paused' | 'Email needs review' | 'Email outcome uncertain; needs review' | 'Email accepted; workflow needs review' | 'Email sent; workflow needs review'
  subject: string
  scheduledFor: string | null
  tentative?: boolean
}

/** Describe only the current workflow email; sent mail stays in normal history. */
export function workflowEmailActivity(input: WorkflowEmailActivityInput): WorkflowEmailActivity | null {
  if (input.actionKind !== 'email' || input.slotStatus === 'completed' || input.slotStatus === 'stopped') return null
  const subject = input.subject?.trim() || 'Workflow email'
  const lease = input.dispatch
  const accepted = Boolean(lease?.accepted_at && Number.isFinite(Date.parse(lease.accepted_at)))
  // A provider receipt is durable even when the job projection or workflow
  // has not advanced. "Accepted" does not imply delivery.
  if (accepted && (input.jobStatus !== 'sent' || !lease?.finalized_at || input.slotStatus === 'held' || (input.workflowStatus && input.workflowStatus !== 'active'))) {
    return { label: 'Email accepted; workflow needs review', subject, scheduledFor: null }
  }
  if (lease?.accepted_at && !accepted) return { label: 'Email needs review', subject, scheduledFor: null }
  if (lease && !accepted && (lease.stage === 'held' || lease.stage === 'dispatching')) {
    const expiresAt = lease.expires_at ? Date.parse(lease.expires_at) : NaN
    const startedAt = lease.dispatch_started_at ? Date.parse(lease.dispatch_started_at) : NaN
    if (lease.stage === 'held' && !lease.dispatch_started_at) return { label: 'Email needs review', subject, scheduledFor: null }
    const uncertain = lease.stage === 'held' || !Number.isFinite(startedAt) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
    if (uncertain) return { label: 'Email outcome uncertain; needs review', subject, scheduledFor: null }
  }
  if (input.slotStatus === 'held' && input.jobStatus === 'sent') return { label: 'Email sent; workflow needs review', subject, scheduledFor: null }
  if (input.workflowStatus === 'paused') return { label: 'Email paused', subject, scheduledFor: null }
  if (input.workflowStatus === 'held') return { label: 'Email needs review', subject, scheduledFor: null }
  if (input.slotStatus === 'held' || input.jobStatus === 'failed' || input.jobStatus === 'cancelled') {
    return { label: 'Email needs review', subject, scheduledFor: null }
  }
  if (input.jobStatus === 'sending') {
    if (lease?.stage === 'claimed' && !lease.dispatch_started_at) {
      return { label: lease.expires_at && Date.parse(lease.expires_at) > Date.now() ? 'Email preparing' : 'Email needs review', subject, scheduledFor: null }
    }
    if (lease?.stage === 'dispatching' && lease.dispatch_started_at) return { label: 'Email sending', subject, scheduledFor: null }
    return { label: 'Email outcome uncertain; needs review', subject, scheduledFor: null }
  }
  if (lease && (lease.stage !== 'queued' || lease.dispatch_started_at) && !accepted) return { label: 'Email needs review', subject, scheduledFor: null }
  if (!input.scheduledFor || !Number.isFinite(Date.parse(input.scheduledFor))) return null
  if (input.jobStatus === null) return { label: 'Email pending scheduling', subject, scheduledFor: input.scheduledFor, ...(input.tentative ? { tentative: true } : {}) }
  return input.jobStatus === 'queued' ? { label: 'Scheduled email', subject, scheduledFor: input.scheduledFor } : null
}
