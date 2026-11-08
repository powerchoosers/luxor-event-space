import type { LuxorTask } from './luxorInquiryTypes'

export type ScheduledFollowUpSummary = {
  id: string
  title: string
  dueAt: string | null
  dueDate: string | null
  task?: LuxorTask
  automated?: boolean
  tentative?: boolean
  requiresReview?: boolean
}

export type WorkflowPreviewResponse = {
  mode: 'legacy' | 'ordered'
  preview?: { type: 'next' | 'conditional' | 'finished' | 'unavailable'; title?: string; tentativeAt?: string; requiresReview?: boolean }
}

/** A preview never creates a task. If its source is unavailable, do not fall
 * back to a possibly materialized later task for an ordered workflow. */
export function selectNextFollowUpDisplay(
  tasksResult: PromiseSettledResult<LuxorTask[]>,
  previewResult: PromiseSettledResult<WorkflowPreviewResponse>,
  currentTaskId?: string,
): { summary: ScheduledFollowUpSummary | null; notice: string | null } {
  if (previewResult.status !== 'fulfilled') return { summary: null, notice: 'The next follow-up could not be loaded.' }
  const preview = previewResult.value
  if (!preview || typeof preview !== 'object') return { summary: null, notice: 'The next follow-up could not be loaded.' }
  if (preview.mode === 'ordered') {
    const item = preview.preview
    if (item?.type === 'next' && item.title && item.tentativeAt && Number.isFinite(Date.parse(item.tentativeAt))) {
      return { summary: { id: `preview-${currentTaskId ?? ''}`, title: item.title, dueAt: item.tentativeAt, dueDate: null, automated: true, tentative: true, requiresReview: item.requiresReview === true }, notice: null }
    }
    return { summary: null, notice: item?.type === 'finished' ? 'This is the final workflow step.'
      : item?.type === 'conditional' ? 'The next step depends on a condition checked after completion.'
        : 'The next workflow step cannot be previewed right now.' }
  }
  if (preview.mode !== 'legacy') return { summary: null, notice: 'The next follow-up could not be loaded.' }
  if (tasksResult.status !== 'fulfilled') return { summary: null, notice: 'The next follow-up could not be loaded.' }
  const next = tasksResult.value.filter((task) => task.status === 'pending' && task.id !== currentTaskId)
    .sort((a, b) => (a.due_at ?? a.due_date ?? '\uffff').localeCompare(b.due_at ?? b.due_date ?? '\uffff'))[0]
  return { summary: next ? { id: next.id, title: next.title, dueAt: next.due_at ?? null, dueDate: next.due_date ?? null, task: next, automated: Boolean(next.automation_enrollment_id) } : null, notice: null }
}
