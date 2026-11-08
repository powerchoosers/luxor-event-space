export type FollowUpChannel = 'email' | 'phone'

export function luxorDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function luxorTime(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function luxorTimeInput(iso: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.hour}:${values.minute}`
}

export function luxorToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function localLuxorIso(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute)
  let timestamp = desired
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp))
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]))
    timestamp += desired - Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute)
  }
  return new Date(timestamp).toISOString()
}

export function manualFollowUpDescription(channel: FollowUpChannel, isPostTour: boolean, notes = '') {
  return `[follow-up:${channel}]${isPostTour ? ' [post-tour]' : ''}${notes.trim() ? ` ${notes.trim()}` : ''}`
}

export function taskChannel(task: { description?: string | null; automation_step_key?: string | null }): FollowUpChannel {
  if (task.automation_step_key?.startsWith('phone_')) return 'phone'
  return task.description?.startsWith('[follow-up:email]') ? 'email' : 'phone'
}

export function orderedWorkflowStepOrdinal(stepKey: string | null | undefined): number | null {
  const match = stepKey?.match(/^(?:phone|email)_(\d+)$/)
  return match ? Number(match[1]) : null
}

function isOrderedAutomationPendingTask(task: {
  status: string
  automation_enrollment_id?: string | null
  automation_step_key?: string | null
}): boolean {
  return task.status === 'pending'
    && Boolean(task.automation_enrollment_id && orderedWorkflowStepOrdinal(task.automation_step_key) !== null)
}

/** One current ordered step per enrollment in task lists until DB reconciliation retires duplicates. */
export function partitionLeadTasksForDisplay<T extends {
  id: string
  status: string
  automation_enrollment_id?: string | null
  automation_step_key?: string | null
  adoption_designation?: 'current' | 'deferred' | 'historical' | 'review' | null
}>(tasks: T[]): { visibleTasks: T[]; hiddenOrderedDuplicateCount: number } {
  const hiddenIds = new Set<string>()
  const byEnrollment = new Map<string, T[]>()
  for (const task of tasks) {
    if (!isOrderedAutomationPendingTask(task)) continue
    const enrollmentId = task.automation_enrollment_id as string
    const group = byEnrollment.get(enrollmentId) ?? []
    group.push(task)
    byEnrollment.set(enrollmentId, group)
  }

  for (const group of byEnrollment.values()) {
    const designatedCurrent = group.find((task) => task.adoption_designation === 'current')
    const keeper = designatedCurrent ?? [...group].sort(
      (left, right) => (orderedWorkflowStepOrdinal(left.automation_step_key) ?? 999)
        - (orderedWorkflowStepOrdinal(right.automation_step_key) ?? 999),
    )[0]
    for (const task of group) {
      if (task.id !== keeper.id) hiddenIds.add(task.id)
    }
  }

  return {
    visibleTasks: tasks.filter((task) => !hiddenIds.has(task.id)),
    hiddenOrderedDuplicateCount: hiddenIds.size,
  }
}

export function formatFollowUpDateLabel(dueAt: string | null | undefined, dueDate: string | null | undefined) {
  if (dueAt) return `${luxorDate(dueAt)} · ${luxorTime(dueAt)}`
  return dueDate?.slice(0, 10) ?? 'No date'
}
