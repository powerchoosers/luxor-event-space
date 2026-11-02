export type PlannerProgressState = 'not_started' | 'in_progress' | 'complete'

export type PlannerProgress = {
  state: PlannerProgressState
  completed: number
  total: number
  percent: number
}

export function getPlannerProgress<T extends Record<string, unknown>>(tasks: T[] = []): PlannerProgress {
  const total = tasks.length
  const completed = tasks.filter((task) => task.status === 'completed').length
  const started = tasks.some((task) => task.status === 'in_progress' || task.status === 'completed')
  const state: PlannerProgressState = total > 0 && completed === total
    ? 'complete'
    : started ? 'in_progress' : 'not_started'

  return { state, completed, total, percent: total ? Math.round(completed / total * 100) : 0 }
}

export function filterPlannerTasksByEvent<T extends Record<string, unknown>>(tasks: T[], bookingId: string) {
  if (bookingId === 'all') return tasks
  if (bookingId === '__unlinked__') return tasks.filter((task) => !task.booking_id)
  return tasks.filter((task) => task.booking_id === bookingId)
}

export function getPlannerTaskHistoryPresentation(bookingId: unknown) {
  const linkedBookingId = typeof bookingId === 'string' ? bookingId.trim() : ''
  if (!linkedBookingId) return { eventHref: null, editable: false, label: 'Unlinked history' }
  return {
    eventHref: `/portal/planner/event/${encodeURIComponent(linkedBookingId)}?tab=tasks`,
    editable: true,
    label: 'Event task',
  }
}

export function filterPlannerEventsByPlanningState<T extends { id: string } & Record<string, unknown>>(
  bookings: T[],
  tasks: Array<Record<string, unknown>>,
  planningState: string,
) {
  if (planningState === 'all') return bookings
  return bookings.filter((booking) => getPlannerProgress(tasks.filter((task) => task.booking_id === booking.id)).state === planningState)
}

export function resolvePlannerCategory(selected: string, custom: string) {
  if (selected !== '__custom__') return selected.trim()
  return custom.trim().slice(0, 80)
}

export function isPlannerAttentionEligible(bookingStatus: unknown, workflowStatus?: unknown) {
  if (bookingStatus !== 'confirmed') return false
  return workflowStatus !== 'completed' && workflowStatus !== 'cancelled'
}
