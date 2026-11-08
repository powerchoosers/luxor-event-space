/** Keep unknown timestamps unknown. Numeric mail timestamps are milliseconds. */
export function normalizeTimelineDate(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const numeric = Number(value)
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

export function timelineTimestamp(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

export function formatTimelineDate(value: string | number | null | undefined, includeTime = false): string {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 'Date unavailable'
  const numeric = Number(value)
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date) + (includeTime ? ' Central' : '')
}
