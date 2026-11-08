import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'
import type { LuxorTask } from './luxorInquiryTypes'

/** Off until migration + full merged runtime verification. Never enables sends. */
export const legacyAdoptionEnabled = () => process.env.LUXOR_LEGACY_ADOPTION_READS_ENABLED === 'true'
export function adoptionTaskSource(mode: 'active' | 'activity') {
  if (!legacyAdoptionEnabled()) return 'luxor_tasks'
  return mode === 'active' ? 'luxor_adoption_active_tasks' : 'luxor_adoption_task_activity'
}
export function applyAdoptionTaskSchedule(task: LuxorTask): LuxorTask {
  if (!task.adoption_due_at || task.adoption_designation !== 'current') return task
  return { ...task, due_at: task.adoption_due_at, due_date: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(task.adoption_due_at)) }
}
// Ownership is authoritative even when adoption views are disabled. A missing
// schema, stale cache or denied lookup must remain saved-but-unconfirmed; none
// establishes that invoking the legacy mutation path is safe.
export async function isAdoptedTask(taskId: string) {
  const rows = await supabaseRestStrict<Array<{ action_id: string }>>(
    `luxor_adoption_actions?select=action_id&record_table=eq.luxor_tasks&record_id=eq.${encodeURIComponent(taskId)}&limit=1`,
  )
  return rows.length > 0
}

/** Source task is already saved. Failure here must stay saved-but-unconfirmed. */
export async function reconcileAdoptedTask(taskId: string) {
  const result = await supabaseRestStrict<string>('rpc/luxor_adoption_reconcile_task', {
    method: 'POST', body: JSON.stringify({ p_task_id: taskId }),
  })
  if (!['advanced_held', 'sequence_complete_held', 'already_advanced', 'current_incomplete'].includes(result)) {
    throw new Error('The saved task needs adoption review before its next follow-up can be confirmed.')
  }
}

/** Caller supplies the signed portal-session identity, never a body actor. */
export async function completeAdoptedCall(taskId: string, updates: Record<string, unknown>, actor: string, nextStepMode: 'automatic', callLabel: string, callNote: string): Promise<LuxorTask> {
  if (!legacyAdoptionEnabled()) throw new SupabaseRestError('This follow-up is paused for maintenance. Refresh and try again later.', 409, '40001')
  const rows = await supabaseRestStrict<LuxorTask[]>('rpc/luxor_adoption_complete_call_v2', {
    method: 'POST', headers: { 'x-luxor-adoption-read-contract': 'held-call-v1' },
    body: JSON.stringify({ p_task_id: taskId, p_updates: updates, p_actor: actor, p_next_step_mode: nextStepMode, p_call_label: callLabel, p_call_note: callNote }),
  })
  if (rows.length !== 1 || rows[0].id !== taskId || rows[0].status !== 'completed') {
    throw new Error('Atomic adopted call completion was not confirmed. Refresh before retrying.')
  }
  return rows[0]
}
