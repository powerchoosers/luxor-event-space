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

export function formatFollowUpDateLabel(dueAt: string | null | undefined, dueDate: string | null | undefined) {
  if (dueAt) return `${luxorDate(dueAt)} · ${luxorTime(dueAt)}`
  return dueDate?.slice(0, 10) ?? 'No date'
}
